"""Rerankers for retrieved chunks.

Providers (``RERANKER_PROVIDER``):
  * ``jina``          — hosted API, no local model (default; keeps the image small)
  * ``cross_encoder`` — local sentence-transformers model (needs ``requirements-local.txt``)
  * ``none``          — keep vector-similarity order

Reranking only improves ordering, so every failure degrades to the original
vector order instead of failing the user's question.
"""

from __future__ import annotations

import requests

from rag_engine.config.settings import settings
from rag_engine.infra.jina_limiter import jina_limiter
from rag_engine.utils.logger import get_logger
from rag_engine.utils.retry import with_retry

logger = get_logger(__name__)

_JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"


class _PassthroughReranker:
    def rerank(self, query: str, results: list[dict], top_k: int = 5) -> list[dict]:
        return results[:top_k]


class JinaReranker:
    def __init__(self) -> None:
        if not settings.jina_api_key:
            raise ValueError("JINA_API_KEY is required for the jina reranker")
        self._model = settings.reranker_model
        logger.info("JinaReranker ready: %s", self._model)

    @with_retry(max_retries=2, delay=0.5, backoff=2.0)
    def _call(self, query: str, documents: list[str], top_n: int) -> list[dict]:
        jina_limiter.acquire(max_wait=10.0)  # reranking is optional: don't wait long for a slot
        response = requests.post(
            _JINA_RERANK_URL,
            headers={
                "Authorization": f"Bearer {settings.jina_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "query": query,
                "documents": documents,
                "top_n": top_n,
            },
            timeout=15,
        )
        response.raise_for_status()
        return response.json()["results"]

    def rerank(self, query: str, results: list[dict], top_k: int = 5) -> list[dict]:
        if not results:
            return []
        try:
            ranked = self._call(query, [r["content"] for r in results], min(top_k, len(results)))
        except Exception as exc:
            logger.warning("Jina rerank failed (%s) — using vector order", exc)
            return results[:top_k]

        top: list[dict] = []
        for item in ranked:
            result = results[item["index"]]
            result["rerank_score"] = float(item["relevance_score"])
            top.append(result)
        logger.info("Reranked %d → %d results (jina)", len(results), len(top))
        return top


class CrossEncoderReranker:
    """Local cross-encoder (optional dependency)."""

    def __init__(self, model_name: str | None = None) -> None:
        from sentence_transformers import CrossEncoder

        model_name = model_name or settings.local_reranker_model
        self._model = CrossEncoder(model_name)
        self._model_name = model_name
        logger.info("CrossEncoderReranker loaded: %s", model_name)

    def rerank(self, query: str, results: list[dict], top_k: int = 5) -> list[dict]:
        if not results:
            return []

        pairs = [[query, r["content"]] for r in results]
        scores = self._model.predict(pairs)

        for result, score in zip(results, scores):
            result["rerank_score"] = float(score)

        results.sort(key=lambda r: r["rerank_score"], reverse=True)
        top_results = results[:top_k]

        logger.info("Reranked %d → %d results", len(results), len(top_results))
        return top_results


def get_reranker():
    provider = settings.reranker_provider.lower().strip()
    if provider == "none":
        return _PassthroughReranker()
    if provider == "cross_encoder":
        return CrossEncoderReranker()
    try:
        return JinaReranker()
    except ValueError as exc:
        logger.warning("%s — reranking disabled", exc)
        return _PassthroughReranker()
