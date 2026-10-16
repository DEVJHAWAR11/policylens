"""Build the user-facing query prompt that wraps context + question."""

from __future__ import annotations


def build_query_prompt(
    query: str, context: str, policy_id: str | None = None, multi: bool = False
) -> str:
    """Return a formatted prompt containing *context* and *query*."""
    task = (
        "Several policies are included above, each labelled with its document name. "
        "Answer for EACH policy separately by name, then say how they differ. "
        "If one policy does not mention the topic, say so for that policy instead of "
        "treating it as missing for all."
        if multi
        else "Answer the question using only the excerpts above."
    )
    return (
        f"POLICY EXCERPTS:\n{context}\n\n"
        "---\n\n"
        f"QUESTION: {query}\n\n"
        f"{task} Include the exact figures, periods and conditions as written, and "
        "mention the section or clause they come from."
    )
