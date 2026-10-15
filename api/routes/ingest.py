"""Ingest router — upload PDFs for background ingestion, check status, manage summaries."""

import logging
import os
import tempfile
import threading

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Path, UploadFile

from api.schemas import POLICY_ID_PATTERN, IngestResponse, PolicySummaryResponse
from api.security import require_internal_key
from rag_engine.config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ingest", tags=["ingest"], dependencies=[Depends(require_internal_key)]
)

PolicyIdPath = Path(pattern=POLICY_ID_PATTERN)


# ------------------------------------------------------------------ #
#  Summary — runs in its own thread, completely non-blocking
# ------------------------------------------------------------------ #
def _generate_summary_async(policy_id: str) -> None:
    """Generate and store summary in a separate thread.

    Runs AFTER status is already 'ready' so the dashboard loads instantly.
    Summary appears in the dashboard once this completes (~40s).
    """
    try:
        from rag_engine.services.summary_service import SummaryService

        logger.info("[Summary Thread] Starting for policy_id=%s", policy_id)
        svc = SummaryService()
        summary = svc.generate(policy_id)
        if "error" not in summary and "parse_error" not in summary:
            svc.store(policy_id, summary)
            logger.info("[Summary Thread] Done for policy_id=%s", policy_id)
        else:
            logger.warning(
                "[Summary Thread] Generation returned error for policy_id=%s: %s",
                policy_id,
                summary.get("error") or summary.get("parse_error"),
            )
    except Exception:
        logger.exception("[Summary Thread] Failed for policy_id=%s", policy_id)


# ------------------------------------------------------------------ #
#  Background worker
# ------------------------------------------------------------------ #
def _run_ingestion_from_file(policy_id: str, tmp_path: str, overwrite: bool) -> None:
    """Run ingestion from a temp file and always clean up afterwards."""
    try:
        from rag_engine.services.ingestion_service import IngestionService

        service = IngestionService()
        result = service.ingest(tmp_path, policy_id, overwrite=overwrite)
        logger.info("File ingestion complete | policy_id=%s | result=%s", policy_id, result)

        # Fire summary in its own thread — status is already 'ready' at this point
        if result.get("status") in ("success", "skipped"):
            threading.Thread(
                target=_generate_summary_async, args=(policy_id,), daemon=True
            ).start()

    except Exception:
        # IngestionService marks the policy failed once it is running; this also
        # covers failures while constructing the service itself.
        from rag_engine.utils.status_tracker import status_tracker

        if (status_tracker.get_status(policy_id) or {}).get("status") != "failed":
            status_tracker.update_status(
                policy_id, "failed", 0, "Processing failed. Please try uploading again."
            )
        logger.exception("File ingestion failed | policy_id=%s", policy_id)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ------------------------------------------------------------------ #
#  GET /ingest/status/{policy_id}
# ------------------------------------------------------------------ #
@router.get("/status/{policy_id}")
def ingest_status(policy_id: str = PolicyIdPath):
    """Check whether a policy has been ingested and how many chunks it has."""
    from rag_engine.utils.status_tracker import status_tracker
    from rag_engine.vector_store.store_factory import get_vector_store

    tracked = status_tracker.get_status(policy_id)

    if tracked and tracked["status"] == "failed":
        return {
            "policy_id": policy_id,
            "ingested": False,
            "chunk_count": 0,
            "status": "failed",
            "progress": 0,
            "message": tracked.get("message", "Processing failed"),
        }

    store = get_vector_store()
    exists = store.policy_exists(policy_id)
    count = store.get_policy_chunk_count(policy_id) if exists else 0

    response = {
        "policy_id": policy_id,
        "ingested": exists,
        "chunk_count": count,
        "status": "ready" if exists else "not_found",
        "progress": 100 if exists else 0,
        "message": "Complete" if exists else "Initializing...",
    }

    if tracked:
        response.update(tracked)
        if exists:
            response["status"] = "ready"
            response["progress"] = 100
            response["message"] = "Complete"
        elif tracked["status"] == "processing":
            response["status"] = "processing"

    return response


# ------------------------------------------------------------------ #
#  POST /ingest/upload  (multipart file upload)
# ------------------------------------------------------------------ #
@router.post("/upload", response_model=IngestResponse)
def ingest_upload(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    policy_id: str = Form(..., pattern=POLICY_ID_PATTERN),
    overwrite: bool = Form(False),
):
    """Upload a PDF file and ingest it in the background."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    max_bytes = settings.max_upload_mb * 1024 * 1024

    def _reject(status_code: int, detail: str, path: str):
        os.unlink(path)
        raise HTTPException(status_code=status_code, detail=detail)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp_path = tmp.name
        header = file.file.read(5)
        tmp.write(header)
        written = len(header)
        too_big = False
        while header == b"%PDF-" and (chunk := file.file.read(1024 * 1024)):
            written += len(chunk)
            if written > max_bytes:
                too_big = True
                break
            tmp.write(chunk)

    if header != b"%PDF-":
        _reject(400, "File is not a valid PDF", tmp_path)
    if too_big:
        _reject(413, f"PDF must be {settings.max_upload_mb} MB or smaller", tmp_path)

    from rag_engine.vector_store.store_factory import get_vector_store

    try:
        exists = get_vector_store().policy_exists(policy_id)
    except Exception:
        os.unlink(tmp_path)
        raise
    if exists and not overwrite:
        os.unlink(tmp_path)
        return IngestResponse(
            status="skipped",
            policy_id=policy_id,
            message="Policy already ingested. Pass overwrite=true to re-ingest.",
        )

    from rag_engine.utils.status_tracker import status_tracker

    status_tracker.update_status(policy_id, "processing", 1, "Queued")
    background_tasks.add_task(_run_ingestion_from_file, policy_id, tmp_path, overwrite)

    return IngestResponse(
        status="processing",
        policy_id=policy_id,
        message=f"Ingestion started. Poll /ingest/status/{policy_id}",
    )


# ------------------------------------------------------------------ #
#  POST /ingest/summary/{policy_id}  (on-demand summary generation)
# ------------------------------------------------------------------ #
@router.post("/summary/{policy_id}", response_model=PolicySummaryResponse)
def generate_summary(policy_id: str = PolicyIdPath):
    """Generate (or re-generate) a structured policy summary on demand."""
    from rag_engine.services.summary_service import SummaryService

    svc = SummaryService()
    summary = svc.generate(policy_id)

    if "error" in summary:
        raise HTTPException(status_code=404, detail=summary["error"])

    svc.store(policy_id, summary)
    return PolicySummaryResponse(policy_id=policy_id, summary=summary)


# ------------------------------------------------------------------ #
#  GET /ingest/summary/{policy_id}  (fetch stored summary)
# ------------------------------------------------------------------ #
@router.get("/summary/{policy_id}", response_model=PolicySummaryResponse)
def get_summary(policy_id: str = PolicyIdPath):
    """Retrieve a previously generated policy summary."""
    from rag_engine.services.summary_service import SummaryService

    row = SummaryService().fetch(policy_id)

    if not row:
        raise HTTPException(
            status_code=404,
            detail="No summary found. It may still be generating — try again in 30s.",
        )

    return PolicySummaryResponse(policy_id=row["policy_id"], summary=row["summary"])
