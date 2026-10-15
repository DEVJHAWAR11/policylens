"""Jina Embeddings v3 — API-based embedder.

Outputs 768-dimensional vectors to match the Supabase policy_chunks
vector column (same as bge-base-en-v1.5 local embedder).
"""

import requests

from rag_engine.utils.logger import get_logger
from rag_engine.utils.retry import with_retry
from .base_embedder import BaseEmbedder

logger = get_logger(__name__)

# one limiter shared by embeddings and reranking: Jina's limit is per API key
from rag_engine.infra.jina_limiter import jina_limiter as _limiter  # noqa: E402


class JinaEmbedder(BaseEmbedder):
    """Calls the Jina Embeddings v3 REST API with 768-dim output."""

    def __init__(self) -> None:
        from rag_engine.config.settings import settings

        if not settings.jina_api_key:
            raise ValueError(
                "JINA_API_KEY not set. "
                "Use EMBEDDING_PROVIDER=local for free local embeddings."
            )
        self._api_key: str = settings.jina_api_key
        self._api_url: str = "https://api.jina.ai/v1/embeddings"
        self._model: str = "jina-embeddings-v3"
        self._dimensions: int = 768  # match Supabase policy_chunks vector column
        logger.info("JinaEmbedder initialized | model=%s | dimensions=%d", self._model, self._dimensions)

    # ── BaseEmbedder interface ─────────────────────────────────────────────────────

    @property
    def model_id(self) -> str:
        return "jina-embeddings-v3"

    def embed_query(self, text: str) -> list[float]:
        from rag_engine.config.settings import settings
        from rag_engine.infra.cache import cache, make_key

        key = make_key("emb", self._model, str(self._dimensions), text)
        cached = cache.get_json(key)
        if cached:
            return cached
        vector = self._call_api([text])[0]
        cache.set_json(key, vector, settings.embedding_cache_ttl_seconds)
        return vector

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Process in batches of 100 (Jina API limit) concurrently."""
        from concurrent.futures import ThreadPoolExecutor
        
        batch_size = 100
        batches = [texts[i : i + batch_size] for i in range(0, len(texts), batch_size)]
        
        all_embeddings: list[list[float]] = []
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            # map preserves order
            results = list(executor.map(self._call_api, batches))
            
        for r in results:
            all_embeddings.extend(r)

        return all_embeddings

    # ── internal ──────────────────────────────────────────────────────────────────

    @with_retry(max_retries=4, delay=1.0, backoff=2.0)
    def _call_api(self, texts: list[str]) -> list[list[float]]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "input": texts,
            "dimensions": self._dimensions,  # Jina v3 supports Matryoshka truncation
        }
        _limiter.acquire()
        response = requests.post(
            self._api_url, headers=headers, json=payload, timeout=60
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]
