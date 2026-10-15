"""Ingest worker: claims queued policies from Postgres and processes them.

Runs either embedded in the API process (EMBEDDED_WORKER=true, fine for one small
instance) or as its own process/service:

    python -m rag_engine.worker

The queue is the ``policies`` table. ``claim_ingest_job()`` uses
``FOR UPDATE SKIP LOCKED`` so any number of workers can run side by side, and jobs
whose worker died are re-claimed after ``worker_stale_after_minutes``.
"""

from __future__ import annotations

import os
import random
import signal
import tempfile
import threading
import time

from supabase import create_client

from rag_engine.config.settings import settings
from rag_engine.utils.logger import get_logger
from rag_engine.utils.status_tracker import status_tracker

logger = get_logger(__name__)

_MAX_BACKOFF = 30.0


class IngestWorker:
    def __init__(self, stop_event: threading.Event | None = None) -> None:
        self._stop = stop_event or threading.Event()
        self._db = create_client(settings.supabase_url, settings.supabase_service_key)
        self._service = None  # heavy objects created lazily, once per worker thread
        self._service_lock = threading.Lock()

    # ------------------------------------------------------------------ #
    def _ingestion_service(self):
        with self._service_lock:
            if self._service is None:
                from rag_engine.services.ingestion_service import IngestionService

                self._service = IngestionService()
            return self._service

    def claim(self) -> dict | None:
        res = self._db.rpc(
            "claim_ingest_job",
            {
                "p_stale_after": f"{settings.worker_stale_after_minutes} minutes",
                "p_max_attempts": settings.worker_max_attempts,
            },
        ).execute()
        rows = res.data or []
        return rows[0] if rows else None

    # ------------------------------------------------------------------ #
    def process(self, job: dict) -> None:
        policy_id = job["job_policy_id"]
        storage_path = job["job_storage_path"]
        attempts = job.get("job_attempts", 1)
        logger.info("Worker picked up %s (attempt %s)", policy_id, attempts)

        tmp_path = None
        try:
            status_tracker.update_status(policy_id, "processing", 3, "Downloading PDF...")
            data = self._db.storage.from_(settings.storage_bucket).download(storage_path)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            # overwrite=True makes retries idempotent: partial chunks from a crashed
            # attempt are replaced instead of treated as "already ingested".
            result = self._ingestion_service().ingest(tmp_path, policy_id, overwrite=True)
            logger.info("Ingest finished for %s: %s", policy_id, result)

            self._generate_summary(policy_id)
        except Exception as exc:
            logger.exception("Ingest failed for %s", policy_id)
            final = attempts >= settings.worker_max_attempts
            status_tracker.update_status(
                policy_id,
                "failed" if final else "queued",
                0,
                "Processing failed. Please try uploading again."
                if final
                else "Retrying after an error...",
                error=str(exc)[:500],
            )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _generate_summary(self, policy_id: str) -> None:
        """Summary is a bonus: a failure here must not fail an otherwise-ready policy."""
        try:
            from rag_engine.services.summary_service import SummaryService

            svc = SummaryService()
            summary = svc.generate(policy_id)
            if "error" not in summary and "parse_error" not in summary:
                svc.store(policy_id, summary)
            else:
                logger.warning("Summary skipped for %s: %s", policy_id, summary.get("error") or summary.get("parse_error"))
        except Exception:
            logger.exception("Summary generation failed for %s", policy_id)

    # ------------------------------------------------------------------ #
    def run_forever(self) -> None:
        backoff = settings.worker_poll_seconds
        logger.info("Ingest worker started (poll=%.1fs)", settings.worker_poll_seconds)
        while not self._stop.is_set():
            try:
                job = self.claim()
                backoff = settings.worker_poll_seconds
                if job:
                    self.process(job)
                    continue  # look for more work immediately
            except Exception as exc:
                backoff = min(backoff * 2, _MAX_BACKOFF)
                logger.warning("Worker loop error (%s) — retrying in %.0fs", exc, backoff)
            # jitter keeps many idle workers from polling in lockstep
            self._stop.wait(backoff + random.uniform(0, 0.5))
        logger.info("Ingest worker stopped")


def start_embedded_workers(stop_event: threading.Event) -> list[threading.Thread]:
    threads = []
    for i in range(max(1, settings.worker_concurrency)):
        worker = IngestWorker(stop_event)
        t = threading.Thread(target=worker.run_forever, name=f"ingest-worker-{i}", daemon=True)
        t.start()
        threads.append(t)
    return threads


def main() -> None:
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    threads = start_embedded_workers(stop)
    while not stop.is_set() and any(t.is_alive() for t in threads):
        time.sleep(1)
    for t in threads:
        t.join(timeout=60)  # let in-flight jobs finish on shutdown


if __name__ == "__main__":
    main()
