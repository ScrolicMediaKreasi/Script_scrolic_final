"""
Scrolic cTrader Shard Manager
=============================
Runs N independent CTraderClient instances, each with its own WebSocket
connection and its own per-account state maps. Every ctidTraderAccountId is
deterministically mapped to exactly one shard via consistent hashing, so a
single physical account is always handled by the same shard/socket.

Multi-process safety is provided via `shard_assignments` leases in MongoDB
(atomic find_one_and_update with TTL + heartbeat) — even though the default
deployment runs a single FastAPI process, the lease design means that if
a second replica is added later, only one process ever holds a given shard.

Public surface mirrors CTraderClient closely so server.py and ticker.py can
keep calling the same methods regardless of shard count:

  authenticate_account, switch_account, request_snapshot,
  send_market_order, close_position, get_account_status, send_message,
  register_handler, register_event_listener, get_diagnostics,
  get_observability_alarms, start, stop, _clean_numeric_account_id

Plus new methods:
  get_shard_status(shard_id) / get_shards_summary()
  authenticate_all_accounts_ratelimited(users)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import socket
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("scrolic.shard_manager")

INSTANCE_ID = f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"
DEFAULT_SHARD_LEASE_SECONDS = int(os.environ.get("CTRADER_SHARD_LEASE_SECONDS", "60"))
HEARTBEAT_INTERVAL_SECONDS = max(5, DEFAULT_SHARD_LEASE_SECONDS // 3)


def consistent_shard(account_id: Any, shard_count: int) -> int:
    """Consistent hash of ctidTraderAccountId → shard index 0..N-1."""
    if shard_count <= 1:
        return 0
    try:
        raw = int(str(account_id).replace("cTrader-", "").strip())
    except (ValueError, TypeError):
        raw = 0
    if raw:
        return raw % shard_count
    h = hashlib.md5(str(account_id).encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big") % shard_count


class ShardManager:
    """Facade over N CTraderClient shards.

    Preserves the CTraderClient public API so existing callers (server.py,
    ticker.py) can keep their call sites unchanged.
    """

    def __init__(self, shard_count: int = 8):
        # Lazy import breaks a potential circular dependency (ctrader_client
        # imports us at end-of-module if CTRADER_SHARD_COUNT>1).
        from backend.ctrader_client import CTraderClient
        self.shard_count = max(1, int(shard_count))
        self.shards: List[CTraderClient] = [
            CTraderClient(shard_id=i, shard_count=self.shard_count)
            for i in range(self.shard_count)
        ]
        # Consistent-hash routing index (in-memory)
        self._account_shard: Dict[int, int] = {}
        # Pending message handlers registered before start; each shard also holds its own copy.
        self._handlers: Dict[int, List[Callable[[Dict[str, Any]], None]]] = {}
        self._event_listeners: List[Callable[[str, Any], None]] = []
        # Shard-assignment leases
        self._owned_shards: set = set()
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._db_store = None
        # Auth scheduler
        from backend.rate_limiter import ShardAuthScheduler
        self._auth_scheduler = ShardAuthScheduler(shard_count=self.shard_count)
        # Aggregate metrics dict (updated lazily on access)
        self._agg_metrics: Dict[str, Any] = {}
        logger.info("[ShardManager] Initialised with %d shard(s); instance_id=%s", self.shard_count, INSTANCE_ID)

    # ---- Utility ----
    def _clean_numeric_account_id(self, raw_id: Any) -> int:
        return self.shards[0]._clean_numeric_account_id(raw_id)

    @property
    def state(self):
        """Aggregate state across shards. Returns AUTHENTICATED only if EVERY
        shard is authenticated (which mirrors the pre-shard invariant used by
        ticker.py `if ctrader_client.state == 'AUTHENTICATED'` gates)."""
        from backend.ctrader_client import CTraderConnectionState
        states = {s.state for s in self.shards}
        if all(s == CTraderConnectionState.AUTHENTICATED for s in states):
            return CTraderConnectionState.AUTHENTICATED
        if any(s == CTraderConnectionState.AUTHENTICATED for s in states):
            # Partial availability — degraded but usable.
            return CTraderConnectionState.DEGRADED
        if any(s in (CTraderConnectionState.CONNECTING,) for s in states):
            return CTraderConnectionState.CONNECTING
        if any(s == CTraderConnectionState.CONNECTED for s in states):
            return CTraderConnectionState.CONNECTED
        return CTraderConnectionState.DISCONNECTED

    def _shard_for(self, account_id: Any):
        acct_num = self._clean_numeric_account_id(account_id)
        if acct_num in self._account_shard:
            idx = self._account_shard[acct_num]
        else:
            idx = consistent_shard(acct_num, self.shard_count)
            self._account_shard[acct_num] = idx
        return self.shards[idx], idx

    # ---- Dict-like aggregate views used by server.py/ticker.py ----
    @property
    def account_states(self) -> Dict[int, Dict[str, Any]]:
        merged: Dict[int, Dict[str, Any]] = {}
        for shard in self.shards:
            merged.update(shard.account_states)
        return merged

    @property
    def account_to_user_map(self) -> Dict[int, str]:
        merged: Dict[int, str] = {}
        for shard in self.shards:
            merged.update(shard.account_to_user_map)
        return merged

    @property
    def account_tokens(self) -> Dict[int, str]:
        merged: Dict[int, str] = {}
        for shard in self.shards:
            merged.update(shard.account_tokens)
        return merged

    @property
    def metrics(self) -> Dict[str, Any]:
        agg = {
            "spot_events_count": 0,
            "execution_events_count": 0,
            "deals_count": 0,
            "heartbeats_sent_count": 0,
            "heartbeats_received_count": 0,
            "reconciliations_count": 0,
            "unmapped_events_count": 0,
            "reconnect_count": 0,
            "authenticated_accounts_count": 0,
            "last_broker_to_db_latency_ms": 0.0,
            "avg_broker_to_db_latency_ms": 0.0,
            "last_broker_to_socket_latency_ms": 0.0,
            "avg_broker_to_socket_latency_ms": 0.0,
        }
        latencies_db: List[float] = []
        latencies_sock: List[float] = []
        for shard in self.shards:
            m = shard.metrics
            for k in [
                "spot_events_count", "execution_events_count", "deals_count",
                "heartbeats_sent_count", "heartbeats_received_count",
                "reconciliations_count", "unmapped_events_count",
                "reconnect_count", "authenticated_accounts_count"
            ]:
                agg[k] += int(m.get(k, 0) or 0)
            db_ms = float(m.get("last_broker_to_db_latency_ms", 0.0) or 0.0)
            sock_ms = float(m.get("last_broker_to_socket_latency_ms", 0.0) or 0.0)
            if db_ms:
                latencies_db.append(db_ms)
            if sock_ms:
                latencies_sock.append(sock_ms)
        agg["last_broker_to_db_latency_ms"] = latencies_db[-1] if latencies_db else 0.0
        agg["avg_broker_to_db_latency_ms"] = (sum(latencies_db) / len(latencies_db)) if latencies_db else 0.0
        agg["last_broker_to_socket_latency_ms"] = latencies_sock[-1] if latencies_sock else 0.0
        agg["avg_broker_to_socket_latency_ms"] = (sum(latencies_sock) / len(latencies_sock)) if latencies_sock else 0.0
        return agg

    # ---- Callbacks (broadcast to every shard) ----
    def register_handler(self, payload_type: int, handler: Callable[[Dict[str, Any]], None]):
        self._handlers.setdefault(payload_type, []).append(handler)
        for shard in self.shards:
            shard.register_handler(payload_type, handler)

    def register_event_listener(self, callback: Callable[[str, Any], None]):
        self._event_listeners.append(callback)
        for shard in self.shards:
            shard.register_event_listener(callback)

    # ---- Diagnostics / Alarms ----
    def get_diagnostics(self) -> Dict[str, Any]:
        # Return a superset of a single-shard payload so existing UI keeps working.
        first = self.shards[0].get_diagnostics()
        first["shardCount"] = self.shard_count
        first["shards"] = [s.get_diagnostics() for s in self.shards]
        # Aggregate authenticated accounts across shards
        first["authenticated_accounts_count"] = sum(
            len([a for a in s.account_states.values() if a.get("authStatus") == "AUTHENTICATED"])
            for s in self.shards
        )
        first["account_details"] = list(self.account_states.values())
        return first

    def get_observability_alarms(self) -> List[Dict[str, Any]]:
        alarms: List[Dict[str, Any]] = []
        for shard in self.shards:
            for a in shard.get_observability_alarms():
                a["shard_id"] = shard.shard_id
                alarms.append(a)
        return alarms

    def get_shards_summary(self) -> List[Dict[str, Any]]:
        out = []
        for shard in self.shards:
            m = shard.metrics
            authed = [a for a in shard.account_states.values() if a.get("authStatus") == "AUTHENTICATED"]
            out.append({
                "shardId": shard.shard_id,
                "state": shard.state.value,
                "connected": shard.state.value in ("CONNECTED", "AUTHENTICATED"),
                "environment": m.get("environment"),
                "host": m.get("host"),
                "port": m.get("port"),
                "accountsTotal": len(shard.account_states),
                "accountsAuthenticated": len(authed),
                "reconnectCount": m.get("reconnect_count", 0),
                "spotEvents": m.get("spot_events_count", 0),
                "executionEvents": m.get("execution_events_count", 0),
                "avgBrokerToDbLatencyMs": m.get("avg_broker_to_db_latency_ms", 0.0),
                "avgBrokerToSocketLatencyMs": m.get("avg_broker_to_socket_latency_ms", 0.0),
                "leaseHeld": shard.shard_id in self._owned_shards,
            })
        return out

    def get_account_status(self, account_id: str) -> Dict[str, Any]:
        shard, idx = self._shard_for(account_id)
        status = shard.get_account_status(account_id)
        status["shardId"] = idx
        return status

    # ---- Lifecycle ----
    async def start(self):
        # Claim shard leases before opening sockets (opportunistic; single-process => claims all).
        try:
            from backend.database import db_store
            self._db_store = db_store
            for i in range(self.shard_count):
                if self._db_store.claim_shard(i, INSTANCE_ID, DEFAULT_SHARD_LEASE_SECONDS):
                    self._owned_shards.add(i)
            logger.info("[ShardManager] Claimed %d/%d shards for instance %s", len(self._owned_shards), self.shard_count, INSTANCE_ID)
        except Exception as e:
            logger.warning("[ShardManager] Shard-claim skipped: %s", e)
            self._owned_shards = set(range(self.shard_count))

        # Start every shard's WebSocket supervisor concurrently.
        await asyncio.gather(*(s.start() for s in self.shards), return_exceptions=True)

        # Heartbeat lease loop
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self):
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
        await asyncio.gather(*(s.stop() for s in self.shards), return_exceptions=True)
        # Release leases so another instance can take over immediately.
        if self._db_store:
            for i in list(self._owned_shards):
                try:
                    self._db_store.release_shard(i, INSTANCE_ID)
                except Exception:
                    pass

    async def _heartbeat_loop(self):
        while True:
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
                if not self._db_store:
                    continue
                for i in list(self._owned_shards):
                    try:
                        ok = self._db_store.heartbeat_shard(i, INSTANCE_ID, DEFAULT_SHARD_LEASE_SECONDS)
                        if not ok:
                            self._owned_shards.discard(i)
                            logger.warning("[ShardManager] Lost lease for shard %d", i)
                    except Exception as e:
                        logger.warning("[ShardManager] Heartbeat error shard %d: %s", i, e)
                # Try to reclaim any missing shards
                for i in range(self.shard_count):
                    if i not in self._owned_shards:
                        try:
                            if self._db_store.claim_shard(i, INSTANCE_ID, DEFAULT_SHARD_LEASE_SECONDS):
                                self._owned_shards.add(i)
                                logger.info("[ShardManager] Reclaimed shard %d", i)
                        except Exception:
                            pass
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("[ShardManager] Heartbeat loop error: %s", e)

    # ---- Delegated business methods (route by account_id) ----
    async def authenticate_account(self, account_id: Any, access_token: str, user_id: str = "") -> bool:
        shard, idx = self._shard_for(account_id)
        # If this instance does not hold the shard lease, refuse locally so that
        # the process which does hold it will pick the request up when Mongo
        # replicates state / user re-issues connect from that pod. In single-pod
        # deployments _owned_shards always contains every shard so this is a
        # no-op there.
        if self._db_store is not None and self._owned_shards and idx not in self._owned_shards:
            logger.info("[ShardManager] Account %s belongs to shard %d not held by %s; skipping local auth.",
                        account_id, idx, INSTANCE_ID)
            try:
                self._db_store.queue_pending_auth(account_id, access_token, user_id, idx)
            except Exception:
                pass
            return False
        async with self._auth_scheduler.slot(idx):
            return await shard.authenticate_account(account_id, access_token, user_id)

    async def switch_account(self, old_account_id: Any, new_account_id: Any, access_token: str, user_id: str) -> bool:
        # Route by NEW account id (new active account decides shard).
        shard, idx = self._shard_for(new_account_id)
        async with self._auth_scheduler.slot(idx):
            return await shard.switch_account(old_account_id, new_account_id, access_token, user_id)

    async def request_snapshot(self, account_id: Any, from_timestamp_ms: int, to_timestamp_ms: int) -> Dict[str, Any]:
        shard, _ = self._shard_for(account_id)
        return await shard.request_snapshot(account_id, from_timestamp_ms, to_timestamp_ms)

    async def send_market_order(self, *args, **kwargs) -> bool:
        # send_market_order(account_id, ...) — grab account_id from args[0] or kwargs
        account_id = kwargs.get("account_id")
        if account_id is None and args:
            account_id = args[0]
        shard, _ = self._shard_for(account_id)
        return await shard.send_market_order(*args, **kwargs)

    async def close_position(self, account_id: Any, position_id: Any, volume_lot: Optional[float] = None, symbol_id: int = 0) -> bool:
        shard, _ = self._shard_for(account_id)
        return await shard.close_position(account_id, position_id, volume_lot, symbol_id)

    async def send_message(self, payload_type: int, payload_data: Dict[str, Any]):
        # Route by ctidTraderAccountId in the payload if present, else broadcast.
        account_id = None
        if isinstance(payload_data, dict):
            account_id = payload_data.get("ctidTraderAccountId") or payload_data.get("ctidTraderAccountid")
        if account_id is not None:
            shard, _ = self._shard_for(account_id)
            return await shard.send_message(payload_type, payload_data)
        # No account context — broadcast to all shards (rare: auth/subscribe messages).
        results = await asyncio.gather(
            *(s.send_message(payload_type, payload_data) for s in self.shards),
            return_exceptions=True
        )
        return results

    async def get_accounts_by_access_token(self, access_token: str) -> List[Dict[str, Any]]:
        # Just use shard 0 for the app-level list call.
        return await self.shards[0].get_accounts_by_access_token(access_token)

    async def request_position_unrealized_pnl(self, account_id: Any):
        shard, _ = self._shard_for(account_id)
        return await shard.request_position_unrealized_pnl(account_id)

    async def request_deal_history(self, account_id: Any, from_timestamp_ms: int, to_timestamp_ms: int):
        shard, _ = self._shard_for(account_id)
        return await shard.request_deal_history(account_id, from_timestamp_ms, to_timestamp_ms)

    def record_latency(self, broker_ts_ms: Optional[int]):
        # For back-compat only; latency now recorded inside each shard.
        for shard in self.shards:
            shard.record_latency(broker_ts_ms)

    # ---- Bulk operations (rate-limited scheduler for startup / reconnect) ----
    async def authenticate_all_accounts_ratelimited(self, tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Bulk auth across many accounts, throttled per-shard.

        `tasks` = list of {account_id, access_token, user_id, environment_matches?}
        Returns {ok, failed, total}.
        """
        ok = 0
        failed = 0
        async def _one(task):
            nonlocal ok, failed
            aid = task.get("account_id")
            token = task.get("access_token")
            uid = task.get("user_id", "")
            if not aid or not token:
                failed += 1
                return
            try:
                success = await self.authenticate_account(aid, token, uid)
                if success:
                    ok += 1
                else:
                    failed += 1
            except Exception as e:
                failed += 1
                logger.warning("[ShardManager.bulk_auth] Auth failed for %s: %s", aid, e)

        await asyncio.gather(*(_one(t) for t in tasks), return_exceptions=True)
        logger.info("[ShardManager.bulk_auth] Completed: ok=%d failed=%d total=%d", ok, failed, len(tasks))
        return {"ok": ok, "failed": failed, "total": len(tasks)}

    # ---- Scheduler metrics ----
    def scheduler_snapshot(self) -> Dict[str, Any]:
        return self._auth_scheduler.snapshot()

    def owned_shards(self) -> List[int]:
        return sorted(list(self._owned_shards))
