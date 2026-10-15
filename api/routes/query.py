"""Query router — answer questions against an ingested policy."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.schemas import QueryRequest, QueryResponse
from api.security import require_internal_key

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/query", tags=["query"], dependencies=[Depends(require_internal_key)]
)


# Plain `def` endpoints: the RAG pipeline is blocking (network + model inference),
# so FastAPI runs them in its threadpool instead of stalling the event loop.
@router.post("/", response_model=QueryResponse)
def query_policy(body: QueryRequest, request: Request):
    """Run the RAG pipeline for a single policy question."""
    query_service = request.app.state.query_service

    try:
        result = query_service.query(
            question=body.question,
            policy_id=body.policy_id,
            k=body.k,
        )
    except Exception:
        logger.exception("QueryService.query failed")
        raise HTTPException(status_code=500, detail="Failed to answer the question")

    if not result:
        raise HTTPException(status_code=500, detail="Empty result from QueryService")

    logger.info("Query served | policy_id=%s | q='%s'", body.policy_id, body.question[:50])

    return QueryResponse(
        answer=result["answer"],
        policy_id=result.get("policy_id") or body.policy_id,
        source_count=result["source_count"],
        sources=result["sources"],
        status="success",
    )


@router.post("/stream")
def stream_query_policy(body: QueryRequest, request: Request):
    """Run the RAG pipeline for a single policy question with streaming response."""
    query_service = request.app.state.query_service

    def content_generator():
        try:
            yield from query_service.stream_query(
                question=body.question,
                policy_id=body.policy_id,
                k=body.k,
            )
        except Exception:
            logger.exception("QueryService.stream_query failed")
            yield "Error: something went wrong while generating the answer."

    return StreamingResponse(content_generator(), media_type="text/plain")
