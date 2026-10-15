"""Query router — answer questions against one or several ingested policies."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.schemas import MultiQueryRequest, QueryRequest, QueryResponse
from api.security import require_internal_key
from rag_engine.infra.llm_guard import ServiceBusy, is_rate_limited

logger = logging.getLogger(__name__)


def _upstream_failure(exc: Exception) -> HTTPException | ServiceBusy:
    """A provider rate limit is not our bug: tell clients to retry (503 + Retry-After)."""
    if isinstance(exc, ServiceBusy):
        return exc
    if is_rate_limited(exc):
        logger.warning("Upstream rate limit: %s", exc)
        return ServiceBusy(retry_after=10)
    logger.exception("Query pipeline failed")
    return HTTPException(status_code=500, detail="Failed to answer the question")

router = APIRouter(
    prefix="/query", tags=["query"], dependencies=[Depends(require_internal_key)]
)


# Plain `def` endpoints: the RAG pipeline is blocking (network + inference), so FastAPI
# runs them in its threadpool instead of stalling the event loop.
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
    except Exception as exc:
        raise _upstream_failure(exc)

    if not result:
        raise HTTPException(status_code=500, detail="Empty result from QueryService")

    return QueryResponse(
        answer=result["answer"],
        policy_id=result.get("policy_id") or body.policy_id,
        source_count=result["source_count"],
        sources=result["sources"],
        status="success",
    )


@router.post("/multi", response_model=QueryResponse)
def query_multiple_policies(body: MultiQueryRequest, request: Request):
    """Answer one question across several policies (comparison, gaps, overlaps)."""
    query_service = request.app.state.query_service
    try:
        result = query_service.query_multi_policy(
            question=body.question,
            policy_ids=body.policy_ids,
            k_per_policy=body.k_per_policy,
        )
    except Exception as exc:
        raise _upstream_failure(exc)

    return QueryResponse(
        answer=result["answer"],
        policy_id=",".join(sorted(set(body.policy_ids))),
        source_count=result["source_count"],
        sources=result["sources"],
        status="success",
    )


@router.post("/stream")
def stream_query_policy(body: QueryRequest, request: Request):
    """Streaming answer. Retrieval runs first so failures are proper HTTP errors;
    only the LLM phase streams."""
    query_service = request.app.state.query_service

    # Fail fast (503 + Retry-After) *before* response headers go out if saturated.
    query_service.check_capacity()

    try:
        tokens = query_service.prepare_stream(
            question=body.question,
            policy_id=body.policy_id,
            k=body.k,
        )
    except Exception as exc:
        raise _upstream_failure(exc)

    def content_generator():
        try:
            yield from tokens
        except Exception:
            logger.exception("LLM stream failed")
            yield "Error: something went wrong while generating the answer."

    return StreamingResponse(content_generator(), media_type="text/plain")
