"""PolicyDecoder RAG API — FastAPI application entry point."""

import io
import logging
import os
import sys
import threading
import time
import uuid

# Force UTF-8 encoding for stdout and stderr on Windows to prevent logging crashes
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
    except Exception:
        pass  # Fallback if buffer is not available

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.errors import service_busy_handler
from api.routes.health import router as health_router
from api.routes.ingest import router as ingest_router
from api.routes.query import router as query_router
from rag_engine.config.settings import settings
from rag_engine.infra.llm_guard import ServiceBusy

logger = logging.getLogger(__name__)


def _get_cors_origins() -> list[str]:
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    return origins or ["*"]


# ------------------------------------------------------------------ #
#  Lifespan — pre-load heavy components once at startup
# ------------------------------------------------------------------ #
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Lifespan: Loading heavy components...")
    from rag_engine.services.query_service import QueryService

    app.state.query_service = QueryService()
    logger.info("QueryService loaded and ready")
    if not settings.internal_api_key:
        logger.warning("INTERNAL_API_KEY is not set — this API accepts unauthenticated requests")

    stop_event = threading.Event()
    app.state.worker_threads = []
    if settings.embedded_worker:
        from rag_engine.worker import start_embedded_workers

        app.state.worker_threads = start_embedded_workers(stop_event)
        logger.info("Embedded ingest worker(s) started: %d", len(app.state.worker_threads))

    yield

    # graceful shutdown: tell workers to stop claiming jobs, give in-flight ones time to finish
    stop_event.set()
    for t in app.state.worker_threads:
        t.join(timeout=30)


# ------------------------------------------------------------------ #
#  App
# ------------------------------------------------------------------ #
app = FastAPI(
    title="PolicyDecoder RAG API",
    description="AI-powered insurance policy Q&A engine",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = _get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    # browsers reject credentials combined with a wildcard origin
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-Id"] = request_id
    if request.url.path != "/":
        logger.info(
            "req id=%s %s %s -> %s in %.0fms",
            request_id, request.method, request.url.path, response.status_code, elapsed_ms,
        )
    return response


app.add_exception_handler(ServiceBusy, service_busy_handler)

app.include_router(query_router)
app.include_router(ingest_router)
app.include_router(health_router)


@app.get("/", include_in_schema=False)
async def root():
    """Liveness probe for Docker / Render / Hugging Face Spaces."""
    return {"status": "ok", "service": "policylens-rag-api"}


# ------------------------------------------------------------------ #
#  Dev entry point
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=settings.debug,
    )
