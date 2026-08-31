"""
Debounced bulk writer for high-frequency broker events.

Coalesces per-key updates (e.g. per (account_id, position_id)) into a single
Mongo bulk_write flushed every FLUSH_INTERVAL_MS. Overwrites the pending doc
for a key when a newer event arrives, so downstream sees only the freshest
state. If Mongo is unavailable, updates are dropped silently (in-memory
mirror in db_store keeps working).

Public API:
    writer = MongoWriter(db_store)
    await writer.start()
    writer.schedule_position(account_id, position_id, doc)
    writer.schedule_deal(account_id, deal_id, doc)
    writer.schedule_snapshot(account_id, doc)
    await writer.stop()
    writer.metrics()  # observability

Environment:
    MONGO_WRITER_FLUSH_MS   default 500
    MONGO_WRITER_BATCH_MAX  default 500
"""
import asyncio
import logging
import os
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("scrolic.mongo_writer")


class MongoWriter:
    def __init__(self, db_store):
        self.db_store = db_store
        self.flush_interval = max(0.05, float(os.environ.get("MONGO_WRITER_FLUSH_MS", "500")) / 1000.0)
        self.batch_max = max(10, int(os.environ.get("MONGO_WRITER_BATCH_MAX", "500")))
        self._pending_positions: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._pending_deals: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._pending_snapshots: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._metrics = {
            "flush_cycles": 0,
            "positions_flushed": 0,
            "deals_flushed": 0,
            "snapshots_flushed": 0,
            "errors": 0,
            "last_flush_at_ms": 0.0,
        }

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._flush_loop())
        logger.info(
            "[MongoWriter] Debounced writer started (interval=%.2fs batch_max=%d).",
            self.flush_interval, self.batch_max
        )

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        await self._flush_once()

    def schedule_position(self, account_id: Any, position_id: Any, doc: Dict[str, Any]) -> None:
        key = (str(account_id), str(position_id))
        self._pending_positions[key] = doc

    def schedule_deal(self, account_id: Any, deal_id: Any, doc: Dict[str, Any]) -> None:
        key = (str(account_id), str(deal_id))
        self._pending_deals[key] = doc

    def schedule_snapshot(self, account_id: Any, doc: Dict[str, Any]) -> None:
        self._pending_snapshots[str(account_id)] = doc

    def metrics(self) -> Dict[str, Any]:
        return {
            **self._metrics,
            "pending_positions": len(self._pending_positions),
            "pending_deals": len(self._pending_deals),
            "pending_snapshots": len(self._pending_snapshots),
            "flush_interval_sec": self.flush_interval,
            "batch_max": self.batch_max,
        }

    async def _flush_loop(self):
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self._flush_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._metrics["errors"] += 1
                logger.warning("[MongoWriter] flush loop error: %s", e)

    async def _flush_once(self):
        if not self.db_store.is_mongo_connected or self.db_store.db is None:
            self._pending_positions.clear()
            self._pending_deals.clear()
            self._pending_snapshots.clear()
            return

        pending_positions: Dict[Tuple[str, str], Dict[str, Any]] = {}
        pending_deals: Dict[Tuple[str, str], Dict[str, Any]] = {}
        pending_snapshots: Dict[str, Dict[str, Any]] = {}
        async with self._lock:
            if self._pending_positions:
                pending_positions = self._pending_positions
                self._pending_positions = {}
            if self._pending_deals:
                pending_deals = self._pending_deals
                self._pending_deals = {}
            if self._pending_snapshots:
                pending_snapshots = self._pending_snapshots
                self._pending_snapshots = {}

        if not pending_positions and not pending_deals and not pending_snapshots:
            return

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._flush_sync, pending_positions, pending_deals, pending_snapshots)

    def _flush_sync(
        self,
        positions: Dict[Tuple[str, str], Dict[str, Any]],
        deals: Dict[Tuple[str, str], Dict[str, Any]],
        snapshots: Dict[str, Dict[str, Any]]
    ) -> None:
        from pymongo import UpdateOne
        import time as _t
        self._metrics["flush_cycles"] += 1

        try:
            if positions:
                ops = [
                    UpdateOne(
                        {"account_id": key[0], "position_id": key[1]},
                        {"$set": doc},
                        upsert=True,
                    )
                    for key, doc in list(positions.items())[: self.batch_max]
                ]
                if ops:
                    self.db_store.db.broker_positions.bulk_write(ops, ordered=False)
                    self._metrics["positions_flushed"] += len(ops)
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("[MongoWriter] positions bulk_write error: %s", e)

        try:
            if deals:
                ops = [
                    UpdateOne(
                        {"account_id": key[0], "deal_id": key[1]},
                        {"$set": doc},
                        upsert=True,
                    )
                    for key, doc in list(deals.items())[: self.batch_max]
                ]
                if ops:
                    self.db_store.db.broker_deals.bulk_write(ops, ordered=False)
                    self._metrics["deals_flushed"] += len(ops)
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("[MongoWriter] deals bulk_write error: %s", e)

        try:
            if snapshots:
                ops = [
                    UpdateOne(
                        {"account_id": account_id, "kind": "latest"},
                        {"$set": {**doc, "account_id": account_id, "kind": "latest"}},
                        upsert=True,
                    )
                    for account_id, doc in list(snapshots.items())[: self.batch_max]
                ]
                if ops:
                    self.db_store.db.account_snapshots.bulk_write(ops, ordered=False)
                    self._metrics["snapshots_flushed"] += len(ops)
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("[MongoWriter] snapshots bulk_write error: %s", e)

        self._metrics["last_flush_at_ms"] = _t.time() * 1000.0


mongo_writer: Optional[MongoWriter] = None


def get_mongo_writer(db_store) -> MongoWriter:
    global mongo_writer
    if mongo_writer is None:
        mongo_writer = MongoWriter(db_store)
    return mongo_writer
