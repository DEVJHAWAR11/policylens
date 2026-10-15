"""Pydantic request / response models for the PolicyDecoder RAG API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

# policy ids are "<uuid>_<uuid>" — keep the accepted alphabet tight
POLICY_ID_PATTERN = r"^[A-Za-z0-9._-]{1,128}$"


# ------------------------------------------------------------------ #
#  Query
# ------------------------------------------------------------------ #
class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    policy_id: str = Field(pattern=POLICY_ID_PATTERN)
    k: int = Field(default=8, ge=1, le=20)


class SourceItem(BaseModel):
    section: str
    clause_type: str
    page_number: Optional[int] = None
    highlight_text: Optional[str] = None
    relevance_score: float
    snippet: str


class QueryResponse(BaseModel):
    answer: str
    policy_id: str
    source_count: int
    sources: list[SourceItem]
    status: str = "success"


# ------------------------------------------------------------------ #
#  Ingest
# ------------------------------------------------------------------ #
class IngestResponse(BaseModel):
    status: str  # "success", "skipped", "processing"
    policy_id: str
    chunks: int = 0
    message: str = ""


# ------------------------------------------------------------------ #
#  Health
# ------------------------------------------------------------------ #
class HealthResponse(BaseModel):
    status: str
    version: str
    supabase_connected: bool
    model: str


# ------------------------------------------------------------------ #
#  Policy Summary
# ------------------------------------------------------------------ #
class PolicySummaryResponse(BaseModel):
    policy_id: str
    summary: dict
