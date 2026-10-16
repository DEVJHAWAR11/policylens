"""Core retriever — hybrid (dense + BM25) search scoped to a policy."""

from __future__ import annotations

from rag_engine.config.settings import settings
from rag_engine.embeddings.base_embedder import BaseEmbedder
from rag_engine.retrieval.lexical import lexical_cache
from rag_engine.utils.logger import get_logger
from rag_engine.vector_store.base_store import BaseVectorStore
from .query_preprocessor import QueryPreprocessor

logger = get_logger(__name__)

_RRF_K = 60
EMBED_TASK_ADAPTERS = "jina-v3-retrieval"


def _key(row: dict) -> str:
    meta = row.get("metadata") or {}
    return str(meta.get("chunk_id") or hash(row["content"]))


def reciprocal_rank_fusion(rankings: list[list[dict]], k: int) -> list[dict]:
    """Merge several ranked lists. Rank-based, so dense and BM25 scores need no calibration."""
    fused: dict[str, float] = {}
    rows: dict[str, dict] = {}
    for ranking in rankings:
        for rank, row in enumerate(ranking):
            key = _key(row)
            fused[key] = fused.get(key, 0.0) + 1.0 / (_RRF_K + rank + 1)
            rows.setdefault(key, row)
    out = []
    for key, score in sorted(fused.items(), key=lambda kv: kv[1], reverse=True)[:k]:
        row = dict(rows[key])
        row["score"] = score
        out.append(row)
    return out


class PolicyRetriever:
    """Retrieve relevant policy chunks for a user query."""

    def __init__(self, vector_store: BaseVectorStore, embedder: BaseEmbedder) -> None:
        self._store = vector_store
        self._embedder = embedder
        self._preprocessor = QueryPreprocessor()
        logger.info("PolicyRetriever initialized | hybrid=%s", settings.hybrid_search)

    # ------------------------------------------------------------------ #
    def _policy_docs(self, policy_id: str):
        return lexical_cache.get(policy_id, self._store.get_policy_chunks)

    def _embed(self, text: str, policy_id: str) -> list[float]:
        """Embed the query the same way the policy's chunks were embedded."""
        if not getattr(self._embedder, "supports_task_adapters", False):
            return self._embedder.embed_query(text)
        adapters = False
        try:
            docs, _ = self._policy_docs(policy_id)
            adapters = bool(docs) and all(
                (d.get("metadata") or {}).get("embed_task") == EMBED_TASK_ADAPTERS for d in docs
            )
        except Exception as exc:  # fall back to plain embedding rather than failing the question
            logger.warning("Could not determine embedding mode (%s)", exc)
        return self._embedder.embed_query(text, adapters=adapters)

    def _lexical(self, query: str, policy_id: str, k: int) -> list[dict]:
        try:
            docs, index = self._policy_docs(policy_id)
        except Exception as exc:
            logger.warning("Lexical index unavailable (%s) — vector only", exc)
            return []
        out = []
        for i, score in index.search(query, k):
            d = docs[i]
            out.append({"content": d["content"], "metadata": d["metadata"], "score": score})
        return out

    # ------------------------------------------------------------------ #
    #  single-policy retrieve
    # ------------------------------------------------------------------ #
    def retrieve(self, query: str, policy_id: str, k: int = 8) -> list[dict]:
        """Return up to *k* candidate chunks for *query* scoped to *policy_id*.

        Hybrid: the dense and BM25 top-N are fused with reciprocal-rank fusion; the caller
        reranks the fused list with a cross-encoder."""
        clean_query = self._preprocessor.preprocess(query)
        pool = max(k, settings.candidate_pool)
        vector = self._store.similarity_search(
            query_embedding=self._embed(clean_query, policy_id),
            k=pool,
            filter_dict={"policy_id": policy_id},
        )
        if not settings.hybrid_search:
            return vector[:k]

        lexical = self._lexical(clean_query, policy_id, pool)
        results = reciprocal_rank_fusion([vector, lexical], k)
        logger.info(
            "Hybrid retrieve | vector=%d lexical=%d fused=%d | q='%s'",
            len(vector), len(lexical), len(results), clean_query[:50],
        )
        return results

    # ------------------------------------------------------------------ #
    #  multi-policy retrieve
    # ------------------------------------------------------------------ #
    def retrieve_multi_policy(
        self,
        query: str,
        policy_ids: list[str],
        k_per_policy: int = 8,
    ) -> dict[str, list[dict]]:
        """Hybrid retrieval for every policy in parallel; returns ``{policy_id: candidates}``.

        Kept per policy (not merged) so each policy is reranked on its own and none can be
        starved by another policy that happens to score higher."""
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=min(len(policy_ids), 5) or 1) as pool:
            rows = list(pool.map(lambda pid: self.retrieve(query, pid, k=k_per_policy), policy_ids))
        return dict(zip(policy_ids, rows))
