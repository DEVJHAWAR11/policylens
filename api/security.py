"""Shared-secret guard so only the Node backend can call this API."""

import hmac
import logging

from fastapi import Header, HTTPException

from rag_engine.config.settings import settings

logger = logging.getLogger(__name__)


async def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    expected = settings.internal_api_key
    if not expected:  # not configured → open (local development)
        return
    if not x_internal_key or not hmac.compare_digest(x_internal_key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
