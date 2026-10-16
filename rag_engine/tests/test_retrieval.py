"""Unit tests for retrieval components — no real embedder or Supabase calls."""

import unittest
from unittest.mock import MagicMock

from rag_engine.retrieval.query_preprocessor import QueryPreprocessor
from rag_engine.retrieval.context_builder import ContextBuilder
from rag_engine.retrieval.retriever import PolicyRetriever


# ====================================================================== #
#  QueryPreprocessor
# ====================================================================== #
class TestQueryPreprocessor(unittest.TestCase):

    def setUp(self):
        self.p = QueryPreprocessor()

    def test_preprocessor_strips_whitespace(self):
        assert self.p.preprocess("  hello  ") == "hello"

    def test_preprocessor_adds_question_mark(self):
        assert "?" in self.p.preprocess("is fire covered")

    def test_preprocessor_no_double_question_mark(self):
        result = self.p.preprocess("is fire covered?")
        assert result.count("?") == 1


# ====================================================================== #
#  PolicyRetriever
# ====================================================================== #
class TestPolicyRetriever(unittest.TestCase):

    def _make_mocks(self):
        mock_store = MagicMock()
        mock_embedder = MagicMock()
        mock_embedder.embed_query.return_value = [0.1] * 768
        return mock_store, mock_embedder

    def test_retriever_calls_embed_and_search(self):
        mock_store, mock_embedder = self._make_mocks()
        mock_store.similarity_search.return_value = [
            {"content": "flood excluded", "metadata": {}, "score": 0.9}
        ]

        retriever = PolicyRetriever(mock_store, mock_embedder)
        results = retriever.retrieve("flood damage", "POL-001", k=5)

        mock_embedder.embed_query.assert_called_once()
        mock_store.similarity_search.assert_called_once()
        assert len(results) == 1

    def test_retriever_filters_only_by_policy_id(self):
        mock_store, mock_embedder = self._make_mocks()
        mock_store.similarity_search.return_value = []

        retriever = PolicyRetriever(mock_store, mock_embedder)
        results = retriever.retrieve("flood damage in the fire section", "POL-001")

        # keyword-derived filters used to narrow retrieval wrongly; only policy scoping remains
        assert results == []
        mock_store.similarity_search.assert_called_once()
        assert mock_store.similarity_search.call_args.kwargs["filter_dict"] == {"policy_id": "POL-001"}

    def test_multi_policy_keeps_each_policy_separate(self):
        mock_store, mock_embedder = self._make_mocks()
        mock_embedder.supports_task_adapters = False
        mock_store.get_policy_chunks.side_effect = RuntimeError("no lexical index in this test")
        mock_store.similarity_search.side_effect = lambda **kw: [
            {"content": kw["filter_dict"]["policy_id"], "metadata": {"chunk_id": kw["filter_dict"]["policy_id"]}, "score": 0.5}
        ]

        retriever = PolicyRetriever(mock_store, mock_embedder)
        results = retriever.retrieve_multi_policy("compare", ["A", "B"], k_per_policy=1)

        assert set(results) == {"A", "B"}
        assert [r["content"] for r in results["A"]] == ["A"]
        assert [r["content"] for r in results["B"]] == ["B"]

    def test_rrf_rewards_chunks_found_by_both_retrievers(self):
        from rag_engine.retrieval.retriever import reciprocal_rank_fusion

        dense = [{"content": "x", "metadata": {"chunk_id": "x"}}, {"content": "y", "metadata": {"chunk_id": "y"}}]
        lexical = [{"content": "y", "metadata": {"chunk_id": "y"}}, {"content": "z", "metadata": {"chunk_id": "z"}}]
        fused = reciprocal_rank_fusion([dense, lexical], k=3)
        assert [r["content"] for r in fused][0] == "y"
        assert {r["content"] for r in fused} == {"x", "y", "z"}


# ====================================================================== #
#  ContextBuilder
# ====================================================================== #
class TestContextBuilder(unittest.TestCase):

    def test_context_builder_formats_correctly(self):
        results = [
            {
                "content": "Flood is excluded",
                "metadata": {
                    "section_name": "Exclusions",
                    "clause_type": "exclusion",
                },
                "score": 0.95,
            }
        ]
        cb = ContextBuilder()
        context = cb.build(results)

        assert "Source 1" in context
        assert "Exclusions" in context
        assert "Flood is excluded" in context

    def test_context_builder_empty_input(self):
        cb = ContextBuilder()
        result = cb.build([])
        assert result == "" or result.strip() == ""


if __name__ == "__main__":
    unittest.main()
