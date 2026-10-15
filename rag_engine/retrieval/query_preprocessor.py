"""Pre-process user queries before retrieval."""

from __future__ import annotations

import re

from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)

_QUESTION_STARTERS = re.compile(
    r"^(what|is|are|does|do|can|will|how|when|where|why)\b", re.IGNORECASE
)


class QueryPreprocessor:
    """Clean and enrich user queries for retrieval."""

    # ------------------------------------------------------------------ #
    #  preprocess
    # ------------------------------------------------------------------ #
    def preprocess(self, query: str) -> str:
        """Normalise whitespace and append ``?`` to question-like queries."""
        original = query
        result = query.strip()

        # Append "?" for question-like phrases that don't already end with one
        if not result.endswith("?") and _QUESTION_STARTERS.match(result):
            # Capitalise the first letter of question-like phrases
            if result:
                result = result[0].upper() + result[1:]
            result = result + "?"

        # Collapse multiple spaces
        result = re.sub(r"\s+", " ", result)

        logger.info("Query preprocessed: '%s' → '%s'", original, result)
        return result
