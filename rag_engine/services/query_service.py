"""Handles end-to-end query: preprocess → embed → retrieve → rerank → build context → LLM → format response."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from rag_engine.config.settings import settings
from rag_engine.infra.cache import cache, make_key
from rag_engine.infra.llm_guard import llm_slot
from rag_engine.prompts.context_template import build_query_prompt
from rag_engine.prompts.response_format import ResponseFormatter
from rag_engine.prompts.system_prompt import SYSTEM_PROMPT
from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)

_STREAM_CHUNK_CHARS = 60


def _normalize(question: str) -> str:
    return " ".join(question.lower().split())


class QueryService:
    """End-to-end query pipeline: retrieve → rerank → context → LLM → format."""

    def __init__(self) -> None:
        from rag_engine.embeddings.embedding_factory import get_embedder
        from rag_engine.llm.llm_factory import get_llm
        from rag_engine.retrieval.context_builder import ContextBuilder
        from rag_engine.retrieval.reranker import get_reranker
        from rag_engine.retrieval.retriever import PolicyRetriever
        from rag_engine.vector_store.store_factory import get_vector_store

        self._embedder = get_embedder()
        self._store = get_vector_store()
        self._retriever = PolicyRetriever(self._store, self._embedder)
        self._reranker = get_reranker()
        self._context_builder = ContextBuilder()
        self._llm = get_llm()
        self._fallback_llm = None
        if settings.llm_fallback_provider:
            try:
                self._fallback_llm = get_llm(provider=settings.llm_fallback_provider)
            except Exception as exc:
                logger.warning("Fallback LLM unavailable: %s", exc)
        self._formatter = ResponseFormatter()
        logger.info("QueryService initialized — all components ready")

    # ------------------------------------------------------------------ #
    #  LLM helpers: concurrency cap + provider fallback
    # ------------------------------------------------------------------ #
    def _complete(self, prompt: str) -> str:
        with llm_slot():
            try:
                return self._llm.complete(prompt, system=SYSTEM_PROMPT)
            except Exception as exc:
                if self._fallback_llm is None:
                    raise
                logger.warning("Primary LLM failed (%s) — using fallback", exc)
                return self._fallback_llm.complete(prompt, system=SYSTEM_PROMPT)

    def _stream(self, prompt: str):
        with llm_slot():
            started = False
            try:
                for token in self._llm.stream(prompt, system=SYSTEM_PROMPT):
                    started = True
                    yield token
                return
            except Exception as exc:
                # once tokens have reached the client we can't restart cleanly
                if started or self._fallback_llm is None:
                    raise
                logger.warning("Primary LLM stream failed (%s) — using fallback", exc)
            yield from self._fallback_llm.stream(prompt, system=SYSTEM_PROMPT)

    @staticmethod
    def check_capacity() -> None:
        """Raise ServiceBusy early (before response headers are sent) if saturated."""
        with llm_slot():
            pass

    # ------------------------------------------------------------------ #
    #  retrieval shared by all paths
    # ------------------------------------------------------------------ #
    def _retrieve_and_rerank(
        self, question: str, policy_id: str, k: int, top_k_rerank: int
    ) -> list[dict]:
        raw_results = self._retriever.retrieve(question, policy_id, k=k)
        return self._reranker.rerank(question, raw_results, top_k=top_k_rerank)

    # ------------------------------------------------------------------ #
    #  single-policy query
    # ------------------------------------------------------------------ #
    def query(
        self,
        question: str,
        policy_id: str,
        k: int = 5,
        top_k_rerank: int = 3,
    ) -> dict:
        """Answer *question* using chunks from *policy_id*."""
        logger.info("QueryService.query START | policy_id=%s | q='%s'", policy_id, question[:60])

        key = make_key("ans", policy_id, str(k), _normalize(question))
        cached = cache.get_json(key)
        if cached:
            logger.info("QueryService.query cache HIT | policy_id=%s", policy_id)
            return cached

        reranked = self._retrieve_and_rerank(question, policy_id, k, top_k_rerank)
        context = self._context_builder.build(reranked)
        prompt = build_query_prompt(question, context, policy_id)
        raw_answer = self._complete(prompt)
        result = self._formatter.format_answer(raw_answer, question, reranked)

        if result["answer"]:
            cache.set_json(key, result, settings.answer_cache_ttl_seconds)
        logger.info("QueryService.query COMPLETE | sources=%d", result["source_count"])
        return result

    # ------------------------------------------------------------------ #
    #  streaming
    # ------------------------------------------------------------------ #
    def prepare_stream(
        self,
        question: str,
        policy_id: str,
        k: int = 5,
        top_k_rerank: int = 3,
    ):
        """Do the blocking retrieval eagerly (so failures are real HTTP errors) and
        return a token iterator for the LLM phase."""
        logger.info("QueryService.stream START | policy_id=%s | q='%s'", policy_id, question[:60])

        key = make_key("ans", policy_id, str(k), _normalize(question))
        cached = cache.get_json(key)
        if cached:
            text = cached["answer"]
            return (text[i : i + _STREAM_CHUNK_CHARS] for i in range(0, len(text), _STREAM_CHUNK_CHARS))

        reranked = self._retrieve_and_rerank(question, policy_id, k, top_k_rerank)
        context = self._context_builder.build(reranked)
        prompt = build_query_prompt(question, context, policy_id)

        def generate():
            parts: list[str] = []
            for token in self._stream(prompt):
                parts.append(token)
                yield token
            answer = "".join(parts).strip()
            if answer:
                cache.set_json(
                    key,
                    self._formatter.format_answer(answer, question, reranked),
                    settings.answer_cache_ttl_seconds,
                )

        return generate()

    def stream_query(self, question: str, policy_id: str, k: int = 5, top_k_rerank: int = 3):
        """Compatibility wrapper: retrieval + streaming as one generator."""
        yield from self.prepare_stream(question, policy_id, k, top_k_rerank)

    # ------------------------------------------------------------------ #
    #  multi-policy query
    # ------------------------------------------------------------------ #
    def query_multi_policy(
        self, question: str, policy_ids: list[str], k_per_policy: int = 3
    ) -> dict:
        """Answer *question* across several policies (e.g. "compare these two")."""
        ids = sorted(set(policy_ids))
        key = make_key("ansm", ",".join(ids), str(k_per_policy), _normalize(question))
        cached = cache.get_json(key)
        if cached:
            return cached

        raw_results = self._retriever.retrieve_multi_policy(
            question, ids, k_per_policy=k_per_policy
        )
        reranked = self._reranker.rerank(question, raw_results, top_k=min(6, len(raw_results)))
        context = self._context_builder.build(reranked)
        prompt = build_query_prompt(question, context, f"Multi-policy: {', '.join(ids)}")
        result = self._formatter.format_answer(self._complete(prompt), question, reranked)

        if result["answer"]:
            cache.set_json(key, result, settings.answer_cache_ttl_seconds)
        return result
