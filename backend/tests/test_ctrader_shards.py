"""Tests for the cTrader ShardManager refactor.

Covers:
  - GET /api/ctrader/shards/status (shard count, per-shard state/host, authScheduler, mongoWriter)
  - MongoDB shard_assignments leases
  - MongoDB indexes on broker_positions/broker_deals/account_snapshots/shard_assignments/pending_auth
  - consistent_shard() determinism (backend.shard_manager)
  - Legacy diagnostics endpoints (connection/status, diagnostics, health, config)
  - MongoWriter debounced bulk write smoke test
"""
import asyncio
import os
import sys
import time

import pytest
import requests
from dotenv import dotenv_values

sys.path.insert(0, "/app")

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from env and /app/frontend/.env")
BASE_URL = base_url.rstrip("/")

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = backend_env.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME")
EXPECTED_SHARDS = int(backend_env.get("CTRADER_SHARD_COUNT", "8"))


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def shards_payload(api):
    r = api.get(f"{BASE_URL}/api/ctrader/shards/status", timeout=60)
    assert r.status_code == 200, r.text[:500]
    return r.json()


@pytest.fixture(scope="module")
def mongo_db():
    from pymongo import MongoClient
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    yield client[DB_NAME]
    client.close()


# ---------------- /api/ctrader/shards/status ----------------
class TestShardsStatusEndpoint:
    def test_top_level_shape(self, shards_payload):
        d = shards_payload
        assert d.get("success") is True, d
        assert d.get("shardCount") == EXPECTED_SHARDS, d.get("shardCount")
        assert sorted(d.get("ownedShards", [])) == list(range(EXPECTED_SHARDS)), d.get("ownedShards")
        assert len(d.get("shards", [])) == EXPECTED_SHARDS

    def test_each_shard_authenticated_and_live_host(self, api):
        # State can flap to DEGRADED for ~ms on the 30s heartbeat check, so retry.
        last = None
        for _ in range(6):
            r = api.get(f"{BASE_URL}/api/ctrader/shards/status", timeout=60)
            assert r.status_code == 200, r.text[:400]
            last = r.json()
            if all(s["state"] == "AUTHENTICATED" for s in last["shards"]):
                break
            time.sleep(3)
        seen_ids = []
        for s in last["shards"]:
            seen_ids.append(s["shardId"])
            assert s["state"] == "AUTHENTICATED", f"shard {s['shardId']} state={s['state']}"
            assert s["connected"] is True, s
            assert s["host"] == "live.ctraderapi.com", s
            assert s["port"] == 5035, s
            assert s["environment"] == "live", s
            assert s["leaseHeld"] is True, s
        assert sorted(seen_ids) == list(range(EXPECTED_SHARDS))

    def test_auth_scheduler_config(self, shards_payload):
        sched = shards_payload.get("authScheduler")
        assert sched, "authScheduler missing"
        assert float(sched["rate_per_sec_per_shard"]) == 5.0, sched
        assert int(sched["bucket_capacity"]) == 10, sched
        assert int(sched["concurrency_per_shard"]) == 3, sched
        assert int(sched["shard_count"]) == EXPECTED_SHARDS, sched

    def test_mongo_writer_metrics_present(self, shards_payload):
        mw = shards_payload.get("mongoWriter")
        assert mw, "mongoWriter missing"
        assert float(mw["flush_interval_sec"]) == 0.5, mw
        for key in ("flush_cycles", "positions_flushed", "deals_flushed", "snapshots_flushed", "errors"):
            assert key in mw, f"{key} missing in mongoWriter"

    def test_no_mongo_object_id_leaked(self, shards_payload):
        assert "_id" not in str(shards_payload)


# ---------------- MongoDB shard leases & indexes ----------------
class TestShardAssignmentsCollection:
    def test_eight_lease_docs_with_future_expiry(self, mongo_db):
        from datetime import datetime, timezone
        docs = list(mongo_db.shard_assignments.find({}))
        assert len(docs) == EXPECTED_SHARDS, f"expected {EXPECTED_SHARDS} docs, got {len(docs)}"
        assert sorted(d["shard_id"] for d in docs) == list(range(EXPECTED_SHARDS))
        now = datetime.now(timezone.utc)
        for d in docs:
            assert d.get("holder_instance_id"), d
            exp = d.get("lease_expires_at")
            assert exp is not None, d
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            assert exp > now, f"shard {d['shard_id']} lease expired at {exp}"

    @pytest.mark.parametrize("collection,expected_keys", [
        ("broker_positions", [[("account_id", 1), ("position_id", 1)], [("account_id", 1)], [("updated_at", -1)]]),
        ("broker_deals", [[("account_id", 1), ("deal_id", 1)], [("account_id", 1)]]),
        ("account_snapshots", [[("account_id", 1)], [("timestamp", -1)]]),
        ("shard_assignments", [[("shard_id", 1)], [("holder_instance_id", 1)]]),
        ("pending_auth", [[("shard_id", 1), ("status", 1)], [("created_at", 1)]]),
    ])
    def test_indexes_present(self, mongo_db, collection, expected_keys):
        info = mongo_db[collection].index_information()
        existing = [list(v["key"]) for v in info.values()]
        for key in expected_keys:
            assert [tuple(k) for k in key] in [[tuple(k) for k in e] for e in existing], \
                f"{collection} missing index {key}; has {existing}"

    def test_unique_indexes(self, mongo_db):
        checks = [
            ("broker_positions", [("account_id", 1), ("position_id", 1)]),
            ("broker_deals", [("account_id", 1), ("deal_id", 1)]),
            ("shard_assignments", [("shard_id", 1)]),
        ]
        for coll, key in checks:
            info = mongo_db[coll].index_information()
            match = [v for v in info.values() if [tuple(k) for k in v["key"]] == [tuple(k) for k in key]]
            assert match, f"{coll} index {key} missing"
            assert any(m.get("unique") for m in match), f"{coll} index {key} is not unique"


# ---------------- Consistent hashing ----------------
class TestConsistentHashing:
    def test_numeric_account_stable_and_expected(self):
        from backend.shard_manager import consistent_shard
        results = {consistent_shard(47601047, 8) for _ in range(20)}
        assert results == {7}, results
        assert 47601047 % 8 == 7

    def test_prefixed_account_same_shard(self):
        from backend.shard_manager import consistent_shard
        assert consistent_shard("cTrader-47601047", 8) == 7

    def test_range_and_single_shard(self):
        from backend.shard_manager import consistent_shard
        for i in range(1000, 1200):
            assert 0 <= consistent_shard(i, 8) < 8
        assert consistent_shard(47601047, 1) == 0

    def test_non_numeric_falls_back_to_md5_stable(self):
        from backend.shard_manager import consistent_shard
        a = consistent_shard("abc-xyz", 8)
        b = consistent_shard("abc-xyz", 8)
        assert a == b and 0 <= a < 8


# ---------------- Legacy diagnostics endpoints ----------------
class TestLegacyDiagnostics:
    def test_connection_status(self, api):
        r = api.get(f"{BASE_URL}/api/ctrader/connection/status", timeout=60)
        assert r.status_code == 200, r.text[:400]
        assert isinstance(r.json(), dict)

    def test_diagnostics_has_state_and_shards(self, api):
        r = api.get(f"{BASE_URL}/api/ctrader/diagnostics", timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        payload = d.get("diagnostics", d)
        state = payload.get("state")
        assert isinstance(state, str) and state, payload
        assert isinstance(payload.get("shards"), list), "shards array missing"
        assert len(payload["shards"]) == EXPECTED_SHARDS, len(payload["shards"])

    def test_health_broker_status(self, api):
        broker = {}
        for _ in range(6):
            r = api.get(f"{BASE_URL}/api/ctrader/health", timeout=60)
            assert r.status_code == 200, r.text[:400]
            d = r.json()
            # NOTE: key is `ctrader_broker` (spec called it `broker`); accept either.
            broker = d.get("broker") or d.get("ctrader_broker") or {}
            if broker.get("status") in ("healthy", "degraded"):
                break
            time.sleep(3)
        assert broker.get("status") in ("healthy", "degraded"), broker
        assert broker.get("state") in ("AUTHENTICATED", "DEGRADED"), broker

    def test_config(self, api):
        r = api.get(f"{BASE_URL}/api/ctrader/config", timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d.get("isConfigured") is True, d
        assert str(d.get("clientId", "")).startswith("30703_"), d
        assert d.get("environment") == "live", d


# ---------------- MongoWriter smoke ----------------
class TestMongoWriter:
    def test_debounced_position_upsert(self, mongo_db):
        from backend.database import db_store, init_db
        from backend.mongo_writer import MongoWriter

        if not db_store.is_mongo_connected or db_store.db is None:
            os.environ.setdefault("MONGO_URL", MONGO_URL)
            os.environ.setdefault("DB_NAME", DB_NAME)
            asyncio.run(init_db())
        assert db_store.is_mongo_connected, "db_store not connected to Mongo in test process"

        writer = MongoWriter(db_store)
        acct = "TEST_acct1"
        pos = "TEST_pos1"
        doc = {
            "account_id": acct,
            "position_id": pos,
            "symbol": "XAUUSD",
            "profit": 1.23,
            "updated_at": int(time.time() * 1000),
        }
        writer.schedule_position(acct, pos, doc)
        # second event for the same key must coalesce (debounce)
        doc2 = {**doc, "profit": 4.56}
        writer.schedule_position(acct, pos, doc2)
        assert len(writer._pending_positions) == 1

        asyncio.run(writer._flush_once())

        saved = mongo_db.broker_positions.find_one({"account_id": acct, "position_id": pos})
        try:
            assert saved is not None, "position not upserted by MongoWriter"
            assert saved["profit"] == 4.56, saved
            assert saved["symbol"] == "XAUUSD", saved
            assert writer.metrics()["positions_flushed"] == 1, writer.metrics()
            assert mongo_db.broker_positions.count_documents({"account_id": acct}) == 1
        finally:
            mongo_db.broker_positions.delete_many({"account_id": acct})
