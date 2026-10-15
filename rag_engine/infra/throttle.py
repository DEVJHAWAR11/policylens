"""Client-side rate limiting for third-party APIs.

Providers enforce requests-per-minute limits. Letting a burst run into them wastes
every call's retry budget and surfaces as user-visible errors; smoothing the burst on
our side makes requests wait their turn instead. Per-process (each instance spaces
its own calls), so size ``*_MAX_RPM`` as provider_limit / number_of_instances.
"""

from __future__ import annotations

import math
import threading
import time

from rag_engine.infra.llm_guard import ServiceBusy


class RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self._interval = 60.0 / per_minute if per_minute > 0 else 0.0
        self._next_slot = 0.0
        self._lock = threading.Lock()

    def acquire(self, max_wait: float = 30.0) -> None:
        """Block until a call slot is free. Raises ServiceBusy if the wait would exceed *max_wait*
        (so callers get a fast, retryable 503 instead of a request that hangs for minutes)."""
        if self._interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next_slot)
            wait = start - now
            if wait > max_wait:
                raise ServiceBusy(retry_after=math.ceil(wait))
            self._next_slot = start + self._interval
        if wait > 0:
            time.sleep(wait)
