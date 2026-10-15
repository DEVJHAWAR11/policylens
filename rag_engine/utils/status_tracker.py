import logging
import threading

logger = logging.getLogger(__name__)


class StatusTracker:
    """Thread-safe in-memory ingestion status map (single-process only)."""

    _instance = None
    _init_lock = threading.Lock()

    def __new__(cls):
        with cls._init_lock:
            if cls._instance is None:
                inst = super().__new__(cls)
                inst._status_map = {}
                inst._lock = threading.Lock()
                cls._instance = inst
        return cls._instance

    def update_status(self, policy_id: str, status: str, progress: int = 0, message: str = ""):
        with self._lock:
            self._status_map[policy_id] = {
                "status": status,
                "progress": progress,
                "message": message,
            }
        logger.info("Status update for %s: %s (%s%%) - %s", policy_id, status, progress, message)

    def get_status(self, policy_id: str):
        with self._lock:
            entry = self._status_map.get(policy_id)
            return dict(entry) if entry else None

    def clear(self, policy_id: str):
        with self._lock:
            self._status_map.pop(policy_id, None)


status_tracker = StatusTracker()
