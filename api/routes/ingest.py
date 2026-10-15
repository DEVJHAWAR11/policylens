"""Summary maintenance endpoints.

PDF upload and progress now go through the durable job queue (``policies`` table,
see ``rag_engine/worker.py``), so there is no upload/status endpoint here any more.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Path

from api.schemas import POLICY_ID_PATTERN, PolicySummaryResponse
from api.security import require_internal_key

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ingest", tags=["ingest"], dependencies=[Depends(require_internal_key)]
)

PolicyIdPath = Path(pattern=POLICY_ID_PATTERN)


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
