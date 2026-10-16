"""Health router — liveness / readiness probes."""

import logging

from fastapi import APIRouter, Request

from api.schemas import HealthResponse
from rag_engine.config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/", response_model=HealthResponse)
def health_check():
    """Service health including Supabase connectivity (cheap; safe for load balancers)."""
    from rag_engine.vector_store.store_factory import get_vector_store

    try:
        get_vector_store().policy_exists("health-check-ping")
        supabase_ok = True
    except Exception:
        supabase_ok = False

    return HealthResponse(
        status="ok" if supabase_ok else "degraded",
        version="1.0.0",
        supabase_connected=supabase_ok,
        model=f"{settings.embedding_model} + {settings.llm_model}",
    )


@router.get("/stats")
def stats(request: Request):
    """Operational snapshot: cache backend, worker threads, LLM capacity."""
    from rag_engine.infra.cache import cache

    workers = getattr(request.app.state, "worker_threads", [])
    return {
        "cache_backend": cache.backend,
        "cache_ok": cache.ping(),
        "workers_alive": sum(1 for t in workers if t.is_alive()),
        "workers_configured": len(workers),
        "llm_max_concurrency": settings.llm_max_concurrency,
        "reranker": settings.reranker_provider,
    }
