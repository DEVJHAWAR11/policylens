"""Small JSON cache: Redis when REDIS_URL is set, otherwise a per-process TTL cache.

Every call is best-effort — a cache outage must never fail a request.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict
from typing import Any

from rag_engine.config.settings import settings
from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)

_MAX_MEMORY_ITEMS = 2000


class _MemoryCache:
    def __init__(self) -> None:
        self._data: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> str | None:
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, value = item
            if expires < time.monotonic():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: str, ttl: int) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > _MAX_MEMORY_ITEMS:
                self._data.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)


class Cache:
    def __init__(self) -> None:
        self._memory = _MemoryCache()
        self._redis = None
        self._redis_down_until = 0.0
        if settings.redis_url:
            try:
                import redis

                self._redis = redis.Redis.from_url(
                    settings.redis_url,
                    socket_timeout=1.5,
                    socket_connect_timeout=1.5,
                    health_check_interval=30,
                    decode_responses=True,
                )
                logger.info("Cache: Redis enabled")
            except Exception as exc:  # pragma: no cover - import/config problems
                logger.warning("Cache: Redis unavailable (%s) — using memory", exc)
        else:
            logger.info("Cache: in-memory (set REDIS_URL to share across instances)")

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "memory"

    def _redis_ok(self) -> bool:
        return self._redis is not None and time.monotonic() >= self._redis_down_until

    def _trip(self, exc: Exception) -> None:
        # back off for 30s so a dead Redis doesn't add latency to every request
        self._redis_down_until = time.monotonic() + 30
        logger.warning("Cache: Redis error (%s) — falling back to memory for 30s", exc)

    def get_json(self, key: str) -> Any | None:
        raw = None
        if self._redis_ok():
            try:
                raw = self._redis.get(key)
            except Exception as exc:
                self._trip(exc)
        if raw is None:
            raw = self._memory.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    def set_json(self, key: str, value: Any, ttl: int) -> None:
        raw = json.dumps(value)
        self._memory.set(key, raw, ttl)
        if self._redis_ok():
            try:
                self._redis.set(key, raw, ex=ttl)
            except Exception as exc:
                self._trip(exc)

    def delete(self, key: str) -> None:
        self._memory.delete(key)
        if self._redis_ok():
            try:
                self._redis.delete(key)
            except Exception as exc:
                self._trip(exc)

    def ping(self) -> bool:
        if self._redis is None:
            return True
        try:
            return bool(self._redis.ping())
        except Exception:
            return False


def make_key(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:32]
    return f"{prefix}:{digest}"


cache = Cache()
