"""Backpressure for LLM calls.

LLM providers rate-limit hard (Groq free tier especially). Instead of letting
every request pile up and then fail with a 429, cap concurrency and reject
quickly with a retryable error when the system is saturated.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager

from rag_engine.config.settings import settings


class ServiceBusy(Exception):
    """Raised when the LLM concurrency limit is saturated."""

    def __init__(self, retry_after: int = 5) -> None:
        super().__init__("The AI service is busy, please retry shortly.")
        self.retry_after = retry_after


_semaphore = threading.BoundedSemaphore(max(1, settings.llm_max_concurrency))


@contextmanager
def llm_slot():
    if not _semaphore.acquire(timeout=settings.llm_queue_timeout_seconds):
        raise ServiceBusy()
    try:
        yield
    finally:
        _semaphore.release()
