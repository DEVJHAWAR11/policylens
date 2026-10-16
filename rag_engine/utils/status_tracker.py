"""Ingestion progress tracking.

State is written through to the ``policies`` table (the durable job queue) so that
progress survives restarts and is visible to every instance. A thread-safe
in-memory copy is kept for quick local reads and as a fallback if the DB is down.
"""

import logging
import threading
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_MIN_WRITE_INTERVAL = 1.0  # seconds between DB writes for the same policy (non-terminal updates)
_TERMINAL = {"ready", "failed", "queued"}  # always written, never throttled


class StatusTracker:
    """Thread-safe progress tracker with DB write-through (single instance per process)."""

    _instance = None
    _init_lock = threading.Lock()

    def __new__(cls):
        with cls._init_lock:
            if cls._instance is None:
                inst = super().__new__(cls)
                inst._status_map = {}
                inst._last_write = {}
                inst._lock = threading.Lock()
                inst._client = None
                inst.persist = True
                cls._instance = inst
        return cls._instance

    # ------------------------------------------------------------------ #
    def _db(self):
        if self._client is None:
            from supabase import create_client

            from rag_engine.config.settings import settings

            self._client = create_client(settings.supabase_url, settings.supabase_service_key)
        return self._client

    def _persist(self, policy_id: str, status: str, progress: int, message: str, extra: dict | None) -> None:
        now = time.monotonic()
        with self._lock:
            last = self._last_write.get(policy_id, 0.0)
            if status not in _TERMINAL and now - last < _MIN_WRITE_INTERVAL:
                return
            self._last_write[policy_id] = now
        iso = datetime.now(timezone.utc).isoformat()
        row = {
            "status": status,
            "progress": progress,
            "message": message,
            "updated_at": iso,
            # every progress write doubles as the worker heartbeat (keeps the lock fresh);
            # terminal states release the lock
            "locked_at": iso if status == "processing" else None,
            **(extra or {}),
        }
        try:
            self._db().table("policies").update(row).eq("policy_id", policy_id).execute()
        except Exception as exc:  # never let bookkeeping break ingestion
            logger.warning("Could not persist status for %s: %s", policy_id, exc)

    # ------------------------------------------------------------------ #
    def update_status(
        self,
        policy_id: str,
        status: str,
        progress: int = 0,
        message: str = "",
        **extra,
    ):
        with self._lock:
            self._status_map[policy_id] = {
                "status": status,
                "progress": progress,
                "message": message,
            }
        logger.info("Status update for %s: %s (%s%%) - %s", policy_id, status, progress, message)
        if self.persist:
            self._persist(policy_id, status, progress, message, extra or None)

    def get_status(self, policy_id: str):
        with self._lock:
            entry = self._status_map.get(policy_id)
            return dict(entry) if entry else None

    def clear(self, policy_id: str):
        with self._lock:
            self._status_map.pop(policy_id, None)
            self._last_write.pop(policy_id, None)


status_tracker = StatusTracker()
