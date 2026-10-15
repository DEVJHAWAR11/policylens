"""Core retriever — ties vector store + embedder + preprocessing together."""

from __future__ import annotations

from rag_engine.embeddings.base_embedder import BaseEmbedder
from rag_engine.utils.logger import get_logger
from rag_engine.vector_store.base_store import BaseVectorStore
from .query_preprocessor import QueryPreprocessor

logger = get_logger(__name__)


class PolicyRetriever:
    """Retrieve relevant policy chunks for a user query."""

    def __init__(
        self, vector_store: BaseVectorStore, embedder: BaseEmbedder
    ) -> None:
        self._store = vector_store
        self._embedder = embedder
        self._preprocessor = QueryPreprocessor()
        logger.info("PolicyRetriever initialized")

    # ------------------------------------------------------------------ #
    #  single-policy retrieve
    # ------------------------------------------------------------------ #
    def retrieve(self, query: str, policy_id: str, k: int = 8) -> list[dict]:
        """Return the top-*k* chunks for *query* scoped to *policy_id*."""
        clean_query = self._preprocessor.preprocess(query)
        query_embedding = self._embedder.embed_query(clean_query)

        results = self._store.similarity_search(
            query_embedding=query_embedding,
            k=k,
            filter_dict={"policy_id": policy_id},
        )

        logger.info(
            "Retrieved %d chunks for query='%s'", len(results), clean_query[:50]
        )
        return results

    # ------------------------------------------------------------------ #
    #  multi-policy retrieve
    # ------------------------------------------------------------------ #
    def retrieve_multi_policy(
        self,
        query: str,
        policy_ids: list[str],
        k_per_policy: int = 4,
    ) -> list[dict]:
        """Retrieve across several policies and return a merged, ranked list.

        The query is embedded once and the per-policy searches run in parallel.
        """
        from concurrent.futures import ThreadPoolExecutor

        clean_query = self._preprocessor.preprocess(query)
        query_embedding = self._embedder.embed_query(clean_query)

        def _search(pid: str) -> list[dict]:
            return self._store.similarity_search(
                query_embedding=query_embedding,
                k=k_per_policy,
                filter_dict={"policy_id": pid},
            )

        merged: list[dict] = []
        with ThreadPoolExecutor(max_workers=min(len(policy_ids), 5) or 1) as pool:
            for rows in pool.map(_search, policy_ids):
                merged.extend(rows)

        merged.sort(key=lambda r: r.get("score", 0), reverse=True)

        top_n = k_per_policy * len(policy_ids)
        merged = merged[:top_n]

        logger.info(
            "Multi-policy retrieve | %d policies | %d total results",
            len(policy_ids),
            len(merged),
        )
        return merged
