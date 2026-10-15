"""Pydantic request / response models for the PolicyDecoder RAG API."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# policy ids are "<uuid>_<uuid>" — keep the accepted alphabet tight
POLICY_ID_PATTERN = r"^[A-Za-z0-9._-]{1,128}$"
_POLICY_ID_RE = re.compile(POLICY_ID_PATTERN)


# ------------------------------------------------------------------ #
#  Query
# ------------------------------------------------------------------ #
class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    policy_id: str = Field(pattern=POLICY_ID_PATTERN)
    k: int = Field(default=8, ge=1, le=20)


class MultiQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    policy_ids: list[str] = Field(min_length=2, max_length=5)
    k_per_policy: int = Field(default=3, ge=1, le=8)

    @field_validator("policy_ids")
    @classmethod
    def _valid_ids(cls, ids: list[str]) -> list[str]:
        if any(not _POLICY_ID_RE.match(i) for i in ids):
            raise ValueError("invalid policy id")
        return ids


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
