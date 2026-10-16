"""Offline tests for the structure-aware chunker and the BM25 index."""

from rag_engine.chunking.structured_chunker import StructuredChunker
from rag_engine.retrieval.lexical import BM25Index, tokenize
from rag_engine.schemas.chunk_metadata import ClauseType

DOC = """---PAGE_START:1---
**PART - D: CONDITIONS RELATED TO SERVICING ASPECTS**

**4. Surrender:**
The policy can be surrendered at anytime during the policy term. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act.

**5. Policy Loan:**
Loan is available after three months. The maximum loan is 80% of the Surrender Value. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act.
---PAGE_START:2---
**6. Free Look period:**
You may return the policy within 15 days of receipt. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act. The Corporation will process every request in the manner described in this document and in line with the Insurance Act.

| Mode | Minimum |
|---|---|
| Monthly | Rs. 5000 |
| Yearly | Rs. 50000 |
"""


def test_headings_become_breadcrumbs_and_pages_are_real():
    chunks = StructuredChunker().chunk(DOC, "P1", "x.pdf")
    by_title = {m.section_name: (t, m) for t, m in chunks}
    text, meta = by_title["5. Policy Loan"]
    assert text.startswith("[PART - D: CONDITIONS RELATED TO SERVICING ASPECTS > 5. Policy Loan]")
    assert meta.page_number == 1
    assert by_title["6. Free Look period"][1].page_number == 2
    assert meta.section_number == "5"


def test_tables_are_flattened_and_flagged():
    chunks = StructuredChunker().chunk(DOC, "P1", "x.pdf")
    assert any("Monthly | Rs. 5000" in t for t, _ in chunks)
    assert "---" not in "".join(t for t, m in chunks if m.table_chunk)


def test_legacy_markdown_sections_still_typed():
    chunks = StructuredChunker().chunk("## SECTION 3 - EXCLUSIONS\n3.1 Flood is not covered.", "P", "x.pdf")
    assert chunks[0][1].clause_type == ClauseType.EXCLUSION


def test_bm25_finds_exact_terms_and_stems():
    docs = [
        {"content": "The policy can be surrendered at anytime", "metadata": {}},
        {"content": "Free look period is 15 days", "metadata": {}},
        {"content": "Loan interest is 9.5% per annum", "metadata": {}},
    ]
    idx = BM25Index(docs)
    assert idx.search("can I surrender?", 1)[0][0] == 0
    assert idx.search("what is the 9.5% rate", 1)[0][0] == 2
    assert "the" not in tokenize("the grace period")


def test_llm_falls_back_when_daily_quota_is_exhausted():
    from rag_engine.services.query_service import QueryService

    class Fake:
        def __init__(self, name, fail):
            self.model_id, self.fail, self.calls = name, fail, 0

        def complete(self, prompt, system=None):
            self.calls += 1
            if self.fail:
                raise RuntimeError("429 tokens per day (TPD) exceeded")
            return f"answer from {self.model_id}"

    svc = QueryService.__new__(QueryService)
    primary, ok = Fake("a", True), Fake("b", False)
    svc._llm, svc._fallbacks = primary, [Fake("x", True), ok]
    assert svc._complete("q") == "answer from b"
    assert primary.calls == 1 and ok.calls == 1
