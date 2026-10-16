"""Backwards-compatible name for the chunker. See structured_chunker.py."""

from rag_engine.chunking.structured_chunker import StructuredChunker as ClauseChunker

__all__ = ["ClauseChunker"]
