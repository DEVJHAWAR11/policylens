"""Shared exception handlers."""

from fastapi import Request
from fastapi.responses import JSONResponse

from rag_engine.infra.llm_guard import ServiceBusy


async def service_busy_handler(request: Request, exc: ServiceBusy):
    return JSONResponse(
        status_code=503,
        content={"detail": "The AI service is busy, please retry shortly."},
        headers={"Retry-After": str(exc.retry_after)},
    )
