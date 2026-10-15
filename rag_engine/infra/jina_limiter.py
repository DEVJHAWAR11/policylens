"""Shared limiter for every Jina API call (embeddings + reranking)."""

from rag_engine.config.settings import settings
from rag_engine.infra.throttle import RateLimiter

jina_limiter = RateLimiter(settings.jina_max_rpm)
