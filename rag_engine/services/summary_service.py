"""Auto-generate a structured JSON summary for an ingested policy."""

from __future__ import annotations

import json

from supabase import create_client

from rag_engine.config.settings import settings
from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)

# Fixed internal query used to pull the most relevant overview chunks.
_INTERNAL_QUERY = (
    "policy overview benefits coverage exclusions surrender "
    "death benefit premiums"
)

_SUMMARY_SYSTEM_PROMPT = """\
You are a friendly insurance policy expert helping everyday people understand their policy.
Given raw policy document chunks, extract and return a structured JSON summary.

IMPORTANT WRITING RULES:
- Write every value in plain, simple English that a non-expert can immediately understand.
- Avoid jargon. If a technical term is unavoidable, explain it in brackets e.g. "surrender value (the money you get if you cancel early)".
- Keep sentences short and clear. Prefer active voice.
- For lists (key_benefits, exclusions, important_conditions): each item must be a complete, self-contained sentence.
- For monetary values, always include the currency and context (e.g. "You receive 10x the annual premium as death payout").
- For time periods, write in human form (e.g. "15 days" not "15").
- Never copy raw legal text verbatim — always rephrase it into plain language.

Return ONLY this exact JSON structure. No markdown, no explanation, no code fences:

{
  "policy_name": "Full official name of the policy as printed on the document",
  "policy_type": "Plain English type e.g. Unit-Linked Life Insurance / Term Life / Health Plan / Annuity",
  "insurer": "Full name of the insurance company",
  "uin": "UIN or registration number if present, else null",
  "key_benefits": [
    "Benefit 1 in plain English — one clear sentence",
    "Benefit 2 in plain English — one clear sentence",
    "Benefit 3 in plain English — one clear sentence",
    "Benefit 4 in plain English — one clear sentence"
  ],
  "exclusions": [
    "Exclusion 1 — what is NOT covered, in plain English",
    "Exclusion 2 — what is NOT covered, in plain English",
    "Exclusion 3 — what is NOT covered, in plain English",
    "Exclusion 4 — what is NOT covered, in plain English"
  ],
  "death_benefit": "2-3 sentence plain English explanation of what the family receives if the policyholder dies, including amounts or formulas if available",
  "survival_benefit": "2-3 sentence plain English explanation of what the policyholder receives if they survive the policy term or at maturity",
  "surrender_value": "2-3 sentence plain English explanation of what happens and what the policyholder gets if they cancel the policy early",
  "loan_facility": "2-3 sentence plain English explanation of whether the policyholder can take a loan against this policy and under what conditions, or null if not available",
  "free_look_period": "Plain English e.g. You have 15 days after receiving the policy to return it for a full refund if you change your mind",
  "tax_benefit": "2-3 sentence plain English explanation of tax savings this policy offers under relevant sections, or null if not mentioned",
  "important_conditions": [
    "Condition 1 — one clear sentence about an important rule or clause",
    "Condition 2 — one clear sentence about an important rule or clause",
    "Condition 3 — one clear sentence about an important rule or clause",
    "Condition 4 — one clear sentence about an important rule or clause"
  ]
}

Return ONLY the JSON. Ensure it is complete and properly closed.\
"""

_SUMMARY_TABLE = "policy_summaries"


class SummaryService:
    """Generate, store, and fetch structured policy summaries."""

    def __init__(self) -> None:
        from rag_engine.embeddings.embedding_factory import get_embedder
        from rag_engine.llm.llm_factory import get_llm
        from rag_engine.retrieval.context_builder import ContextBuilder
        from rag_engine.retrieval.retriever import PolicyRetriever
        from rag_engine.vector_store.store_factory import get_vector_store

        self._embedder = get_embedder()
        self._store = get_vector_store()
        self._retriever = PolicyRetriever(self._store, self._embedder)
        self._context_builder = ContextBuilder()
        # 4096 max_tokens gives full room for a rich, detailed JSON summary
        self._llm = get_llm(max_tokens=4096)
        self._supabase = create_client(
            settings.supabase_url, settings.supabase_service_key
        )
        logger.info("SummaryService initialized")

    # ------------------------------------------------------------------ #
    #  generate
    # ------------------------------------------------------------------ #
    def generate(self, policy_id: str) -> dict:
        """Retrieve top chunks and ask the LLM for a structured summary.

        Returns the parsed summary dict.
        """
        logger.info("SummaryService.generate START | policy_id=%s", policy_id)
        from rag_engine.utils.status_tracker import status_tracker
        status_tracker.update_status(policy_id, "processing", 96, "Generating AI Summary...")

        # Step 1 — retrieve top 10 chunks
        raw_results = self._retriever.retrieve(
            _INTERNAL_QUERY, policy_id, k=10
        )

        if not raw_results:
            logger.warning(
                "No chunks found for policy_id=%s — cannot generate summary",
                policy_id,
            )
            return {"error": "no_chunks", "policy_id": policy_id}

        # Step 2 — build context (3000 tokens of source material)
        context = self._context_builder.build(raw_results, max_tokens=3000)

        # Step 3 — send to LLM
        user_prompt = (
            f"Here are the policy document chunks:\n\n"
            f"{context}\n\n"
            "Now extract the complete structured summary in plain English as specified. "
            "Return complete valid JSON only."
        )
        raw_response = self._llm.complete(
            user_prompt, system=_SUMMARY_SYSTEM_PROMPT
        )

        # Step 4 — parse JSON response
        summary = self._parse_json(raw_response)

        logger.info(
            "SummaryService.generate COMPLETE | policy_id=%s | keys=%s",
            policy_id,
            list(summary.keys()) if isinstance(summary, dict) else "parse_error",
        )
        status_tracker.update_status(policy_id, "processing", 99, "Summary generated")
        return summary

    # ------------------------------------------------------------------ #
    #  store
    # ------------------------------------------------------------------ #
    def store(self, policy_id: str, summary: dict) -> None:
        """Upsert the summary into the policy_summaries table."""
        self._supabase.table(_SUMMARY_TABLE).upsert(
            {"policy_id": policy_id, "summary": summary},
            on_conflict="policy_id",
        ).execute()
        logger.info("Stored summary for policy_id=%s", policy_id)
        from rag_engine.utils.status_tracker import status_tracker
        status_tracker.update_status(policy_id, "ready", 100, "Analysis complete")

    # ------------------------------------------------------------------ #
    #  fetch
    # ------------------------------------------------------------------ #
    def fetch(self, policy_id: str) -> dict | None:
        """Retrieve a stored summary. Returns None if not found."""
        response = (
            self._supabase.table(_SUMMARY_TABLE)
            .select("policy_id, summary, created_at")
            .eq("policy_id", policy_id)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None

    # ------------------------------------------------------------------ #
    #  helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _parse_json(raw: str) -> dict:
        """Best-effort parse of the LLM JSON output."""
        text = raw.strip()
        # Strip markdown code fences if the LLM wraps the output
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse LLM JSON: %s | raw length: %d", exc, len(raw))
            return {"raw_response": raw, "parse_error": str(exc)}
