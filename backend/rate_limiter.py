"""
Rate limiter primitives for the cTrader shard scheduler.

- TokenBucket: refills at `rate` tokens/sec up to `capacity`, `acquire()` blocks
  until a token is available. Coroutine-safe.
- ShardAuthScheduler: per-shard combo of TokenBucket + Semaphore. Callers use
  `async with scheduler.slot(shard_id)` to obtain permission for one auth call.

Defaults chosen for cTrader Open API:
  rate=5/s per shard, bucket capacity=10, concurrency=3 per shard.
Override globally via env: CTRADER_AUTH_RATE, CTRADER_AUTH_BUCKET, CTRADER_AUTH_CONCURRENCY.
"""
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Dict

logger = logging.getLogger("scrolic.rate_limiter")


class TokenBucket:
    def __init__(self, rate: float, capacity: int):
        self.rate = max(0.1, float(rate))
        self.capacity = max(1, int(capacity))
        self._tokens = float(self.capacity)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: int = 1) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                elapsed = now - self._last_refill
                self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
                self._last_refill = now
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                deficit = tokens - self._tokens
                wait_time = max(0.02, deficit / self.rate)
            await asyncio.sleep(wait_time)


class ShardAuthScheduler:
    """Combined token-bucket + semaphore per shard.

    - Bucket smooths auth traffic to `rate` requests/sec (burst capacity `bucket_size`).
    - Semaphore caps concurrent in-flight auth requests to `concurrency` per shard.
    """

    def __init__(self, shard_count: int):
        rate = float(os.environ.get("CTRADER_AUTH_RATE", "5"))
        bucket = int(os.environ.get("CTRADER_AUTH_BUCKET", "10"))
        conc = int(os.environ.get("CTRADER_AUTH_CONCURRENCY", "3"))
        self.shard_count = max(1, int(shard_count))
        self._buckets: Dict[int, TokenBucket] = {
            i: TokenBucket(rate=rate, capacity=bucket) for i in range(self.shard_count)
        }
        self._semaphores: Dict[int, asyncio.Semaphore] = {
            i: asyncio.Semaphore(conc) for i in range(self.shard_count)
        }
        self.rate = rate
        self.bucket = bucket
        self.concurrency = conc
        logger.info(
            "[AuthScheduler] Initialized: shards=%d rate=%.2f/s bucket=%d concurrency=%d",
            self.shard_count, rate, bucket, conc
        )

    @asynccontextmanager
    async def slot(self, shard_id: int):
        s_id = int(shard_id) % self.shard_count
        sem = self._semaphores[s_id]
        bucket = self._buckets[s_id]
        async with sem:
            await bucket.acquire(1)
            yield

    def snapshot(self) -> Dict[str, float]:
        return {
            "rate_per_sec_per_shard": self.rate,
            "bucket_capacity": self.bucket,
            "concurrency_per_shard": self.concurrency,
            "shard_count": self.shard_count,
        }
