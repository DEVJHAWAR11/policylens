"""Structure-aware chunker for real-world policy PDFs.

The previous chunker only understood "SECTION 1 - ..." headings. Real documents
(parsed by pymupdf4llm) use bold lines such as ``**4. Surrender:**`` or ``PART - D``, so
the whole document collapsed into one "Preamble" section that was cut into blind
512-token windows, every one mis-tagged as an exclusion.

This chunker:
  * keeps page markers (``---PAGE_START:n---``) so each chunk knows its real page
  * detects headings and builds a breadcrumb ("PART D > 4. Surrender")
  * prefixes every chunk with that breadcrumb, so the embedding and the LLM both know
    which clause the text belongs to (the biggest retrieval win for short clauses)
  * packs paragraphs up to a token budget, never splitting a table row or a sentence
  * flattens markdown tables (``<br>`` cells, merged-cell repeats) into readable rows
  * drops repeated page headers/footers and near-duplicate chunks
"""

from __future__ import annotations

import re
from collections import Counter
from typing import List, Optional, Tuple

from rag_engine.chunking.base_chunker import BaseChunker
from rag_engine.chunking.token_utils import count_tokens, split_text_by_tokens
from rag_engine.config.constants import CLAUSE_TYPE_KEYWORDS
from rag_engine.schemas.chunk_metadata import ChunkMetadata, ClauseType
from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)

TARGET_TOKENS = 380      # pack up to this many tokens per chunk
HARD_MAX_TOKENS = 600    # a single block bigger than this is split by sentences
DEFINITION_TOKENS = 150  # glossary entries are packed small
MIN_TOKENS = 45          # tiny sections are merged into their neighbour
OVERLAP_TOKENS = 60      # trailing text repeated at the start of the next chunk of a section

_PAGE_RE = re.compile(r"^---PAGE_START:(\d+)---$")
_SEPARATOR_ROW = re.compile(r"^\|?[\s:\-|]+\|?$")
_BOLD_LINE = re.compile(r"^\*\*(.{2,160}?)\*\*:?$")
_MD_HEADING = re.compile(r"^#{1,6}\s+(.+)$")
_PART_RE = re.compile(r"^(?:\*\*)?\s*(PART|SECTION|ARTICLE|CHAPTER|ANNEXURE)\b[\s\-–:]*([A-Z0-9IVX]+)?\b(.*?)(?:\*\*)?$", re.I)
_NUMBERED_HEADING = re.compile(r"^(\d+(?:\.\d+)*)[.)]?\s+(.{2,120}?):?$")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+(?=[A-Z0-9(“\"'])")
_NOISE_LINE = re.compile(r"^(?:\*{2,}|_{3,}|-{3,}|-----)$")


def _strip_md(text: str) -> str:
    return re.sub(r"[*_`]+", "", text).strip()


def _norm_words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


class _Block:
    __slots__ = ("text", "page", "is_table")

    def __init__(self, text: str, page: int, is_table: bool = False) -> None:
        self.text, self.page, self.is_table = text, page, is_table


class StructuredChunker(BaseChunker):
    def chunk(
        self,
        text: str,
        policy_id: str,
        source_file: str,
        page_map: dict | None = None,  # kept for API compatibility; pages come from markers
    ) -> List[Tuple[str, ChunkMetadata]]:
        pages = self._split_pages(text)
        pages = self._drop_repeated_furniture(pages)
        sections = self._build_sections(pages)

        raw_chunks: list[dict] = []
        for sec in sections:
            raw_chunks.extend(self._pack_section(sec))

        raw_chunks = self._merge_tiny(raw_chunks)
        raw_chunks = self._dedupe(raw_chunks)

        results: List[Tuple[str, ChunkMetadata]] = []
        for idx, c in enumerate(raw_chunks):
            body = c["body"]
            header = c["crumb"]
            full = f"[{header}]\n{body}" if header else body
            results.append((full, self._metadata(c, full, idx, policy_id, source_file)))
        logger.info("StructuredChunker: %d sections -> %d chunks", len(sections), len(results))
        return results

    # ------------------------------------------------------------------ #
    #  parsing
    # ------------------------------------------------------------------ #
    @staticmethod
    def _split_pages(text: str) -> list[tuple[int, list[str]]]:
        pages: list[tuple[int, list[str]]] = []
        page, lines = 1, []
        for line in text.splitlines():
            m = _PAGE_RE.match(line.strip())
            if m:
                if lines:
                    pages.append((page, lines))
                page, lines = int(m.group(1)), []
            else:
                lines.append(line.rstrip())
        if lines:
            pages.append((page, lines))
        return pages

    @staticmethod
    def _drop_repeated_furniture(pages: list[tuple[int, list[str]]]) -> list[tuple[int, list[str]]]:
        """Remove running headers/footers: short lines that repeat (digits ignored) on many pages."""
        if len(pages) < 3:
            return pages

        def key(line: str) -> str:
            return re.sub(r"\d+", "#", _strip_md(line).lower())

        counts: Counter[str] = Counter()
        for _, lines in pages:
            for k in {key(l) for l in lines if 0 < len(l.strip()) < 140}:
                counts[k] += 1
        limit = max(3, int(0.4 * len(pages)))
        furniture = {k for k, n in counts.items() if n >= limit and k.strip("# ")}
        return [(p, [l for l in lines if key(l) not in furniture]) for p, lines in pages]

    def _blocks(self, pages: list[tuple[int, list[str]]]):
        """Yield ('heading', text, level, page) or ('block', _Block)."""
        for page, lines in pages:
            para: list[str] = []
            table: list[str] = []

            def flush_para():
                nonlocal para
                if para:
                    yield ("block", _Block(" ".join(s.strip() for s in para).strip(), page))
                    para = []

            def flush_table():
                nonlocal table
                if table:
                    flat = self._flatten_table(table)
                    if flat:
                        yield ("block", _Block(flat, page, True))
                    table = []

            for raw in lines:
                line = raw.strip()
                if _NOISE_LINE.match(line):
                    continue
                if not line:
                    yield from flush_para()
                    yield from flush_table()
                    continue
                if line.startswith("|"):
                    yield from flush_para()
                    table.append(line)
                    continue
                yield from flush_table()
                head = self._heading(line)
                if head:
                    yield from flush_para()
                    yield ("heading", head[0], head[1], page)
                    continue
                if re.match(r"^(\d+[.)]|[-•*]|\(?[a-z0-9ivx]{1,4}\))\s", line):
                    yield from flush_para()  # list item starts its own paragraph
                para.append(line)
            yield from flush_para()
            yield from flush_table()

    @staticmethod
    def _plausible_title(t: str) -> bool:
        """Reject layout debris: wrapped fragments, repeated column headers, mojibake."""
        words = t.split()
        if not (1 <= len(words) <= 12) or len(t) > 110:
            return False
        if t.count("/") >= 2 or "�" in t or t.count("(") != t.count(")"):
            return False
        if not (t[0].isupper() or t[0].isdigit()):
            return False
        return words[-1].lower().strip(":") not in {"of", "or", "and", "the", "to", "a", "an", "in", "for", "as", "by", "total"}

    def _heading(self, line: str) -> Optional[tuple[str, int]]:
        """Return (clean title, level) when *line* is a heading. Level 1 = PART-like, 2 = clause."""
        found = self._heading_raw(line)
        if found and self._plausible_title(found[0]):
            return found
        return None

    @staticmethod
    def _heading_raw(line: str) -> Optional[tuple[str, int]]:
        m = _MD_HEADING.match(line)
        if m:
            title = _strip_md(m.group(1))
            return (title, 1 if _PART_RE.match(title) else 2) if title else None
        plain = _strip_md(line)
        if _BOLD_LINE.match(line) or (line.isupper() and 3 < len(plain) < 90 and not line.startswith("|")):
            if _PART_RE.match(plain) and len(plain) < 110:
                return plain, 1
            if len(plain) <= 110 and not plain.endswith(".") and plain.count(" ") < 16:
                return plain.rstrip(":"), 2
            return None
        # plain lead-in lines such as "The definitions of terms used are as under:"
        if plain.endswith(":") and not line.startswith(("|", "-", "•")) and 3 <= len(plain.split()) <= 14                 and plain[0].isupper() and len(plain) <= 100:
            return plain.rstrip(":"), 2
        return None

    @staticmethod
    def _flatten_table(rows: list[str]) -> str:
        out: list[str] = []
        for r in rows:
            if _SEPARATOR_ROW.match(r) and set(r) <= set("|-: "):
                continue
            cells = [re.sub(r"\s+", " ", _strip_md(c.replace("<br>", " "))) for c in r.strip().strip("|").split("|")]
            dedup: list[str] = []
            for c in cells:
                if c and (not dedup or c != dedup[-1]) and not re.fullmatch(r"Col\d+", c):
                    dedup.append(c)  # merged cells repeat across columns
            if dedup:
                out.append(" | ".join(dedup))
        return "\n".join(out)

    # ------------------------------------------------------------------ #
    #  sections + packing
    # ------------------------------------------------------------------ #
    def _build_sections(self, pages) -> list[dict]:
        sections: list[dict] = []
        part: str = ""
        title: str = ""
        cur: Optional[dict] = None

        def start(new_title: str, page: int):
            nonlocal cur
            crumb = " > ".join(x for x in (part, new_title) if x)
            cur = {"part": part, "title": new_title, "crumb": crumb, "page": page, "blocks": []}
            sections.append(cur)

        for item in self._blocks(pages):
            if item[0] == "heading":
                _, text, level, page = item
                if level == 1:
                    part, title = text, ""
                    start("", page)
                    cur["crumb"] = part
                else:
                    title = text
                    start(title, page)
            else:
                blk: _Block = item[1]
                if not blk.text:
                    continue
                if cur is None:
                    start("", blk.page)
                cur["blocks"].append(blk)
        return [s for s in sections if s["blocks"]]

    def _pack_section(self, sec: dict) -> list[dict]:
        # glossaries pack badly: ten definitions in one chunk dilute every one of them
        is_defs = "definition" in f"{sec['title']} {sec['part']}".lower()
        target = DEFINITION_TOKENS if is_defs else TARGET_TOKENS
        chunks: list[dict] = []
        buf: list[_Block] = []
        buf_tokens = 0

        def emit(blocks: list[_Block]):
            if not blocks:
                return
            body = "\n".join(b.text for b in blocks)
            chunks.append({
                "body": body, "crumb": sec["crumb"], "title": sec["title"], "part": sec["part"],
                "page": blocks[0].page, "table": all(b.is_table for b in blocks),
            })

        for blk in sec["blocks"]:
            pieces = [blk]
            t = count_tokens(blk.text)
            if blk.is_table and t > target:
                pieces = [_Block(p, blk.page, True) for p in self._split_table(blk.text, target)]
            elif t > (target if is_defs else HARD_MAX_TOKENS):
                pieces = [_Block(p, blk.page, blk.is_table) for p in self._split_long(blk.text)]
            for piece in pieces:
                pt = count_tokens(piece.text)
                if buf and buf_tokens + pt > target:
                    emit(buf)
                    tail = buf[-1]
                    buf = [tail] if count_tokens(tail.text) <= OVERLAP_TOKENS and not tail.is_table else []
                    buf_tokens = sum(count_tokens(b.text) for b in buf)
                buf.append(piece)
                buf_tokens += pt
        emit(buf)
        return chunks

    @staticmethod
    def _split_table(text: str, budget: int) -> list[str]:
        """Split a flattened table by rows, repeating the header row in every piece."""
        rows = text.splitlines()
        header, body = rows[0], rows[1:]
        parts, cur, cur_t = [], [], count_tokens(header)
        for r in body:
            rt = count_tokens(r)
            if cur and cur_t + rt > budget:
                parts.append(chr(10).join([header] + cur))
                cur, cur_t = [], count_tokens(header)
            cur.append(r)
            cur_t += rt
        if cur:
            parts.append(chr(10).join([header] + cur))
        return parts or [text]

    @staticmethod
    def _split_long(text: str) -> list[str]:
        sentences = _SENTENCE_SPLIT.split(text) if "\n" not in text else text.splitlines()
        parts, cur, cur_t = [], [], 0
        for s in sentences:
            st = count_tokens(s)
            if st > HARD_MAX_TOKENS:
                if cur:
                    parts.append(" ".join(cur)); cur, cur_t = [], 0
                parts.extend(split_text_by_tokens(s, TARGET_TOKENS, OVERLAP_TOKENS))
                continue
            if cur and cur_t + st > TARGET_TOKENS:
                parts.append("\n".join(cur) if "\n" in text else " ".join(cur)); cur, cur_t = [], 0
            cur.append(s); cur_t += st
        if cur:
            parts.append("\n".join(cur) if "\n" in text else " ".join(cur))
        return parts

    @staticmethod
    def _merge_tiny(chunks: list[dict]) -> list[dict]:
        """Fold chunks under MIN_TOKENS into the previous chunk of the same part."""
        out: list[dict] = []
        for c in chunks:
            if out and "definition" not in c["title"].lower() and count_tokens(c["body"]) < MIN_TOKENS and out[-1]["part"] == c["part"] \
                    and count_tokens(out[-1]["body"]) + count_tokens(c["body"]) <= TARGET_TOKENS * 0.6:
                prev = out[-1]
                label = f"{c['title']}\n" if c["title"] and c["title"] != prev["title"] else ""
                prev["body"] += "\n" + label + c["body"]
                prev["table"] = prev["table"] and c["table"]
            else:
                out.append(c)
        return out

    @staticmethod
    def _dedupe(chunks: list[dict]) -> list[dict]:
        """PDF parsers often emit a table twice (as text and as a table). Drop near-duplicates."""
        kept: list[dict] = []
        words: list[set[str]] = []
        for c in chunks:
            w = _norm_words(c["body"])
            if len(w) >= 8 and any(len(w & k) / len(w) >= 0.9 for k in words):
                continue
            kept.append(c)
            words.append(w)
        return kept

    # ------------------------------------------------------------------ #
    #  metadata
    # ------------------------------------------------------------------ #
    @staticmethod
    def _clause_type(title: str, part: str) -> ClauseType:
        heading = f"{title} {part}".lower()
        for key in ("exclusion", "definition", "deductible", "schedule", "endorsement", "limit", "coverage", "general_condition"):
            if any(kw in heading for kw in CLAUSE_TYPE_KEYWORDS.get(key, [])):
                return ClauseType(key)
        return ClauseType.UNKNOWN

    def _metadata(self, c: dict, full: str, idx: int, policy_id: str, source_file: str) -> ChunkMetadata:
        title = c["title"] or c["part"] or "Document"
        num = _NUMBERED_HEADING.match(title)
        low = full.lower()
        ct = self._clause_type(c["title"], c["part"])
        return ChunkMetadata(
            policy_id=policy_id,
            source_file=source_file,
            section_name=title[:120],
            section_number=num.group(1) if num else None,
            page_number=c["page"],
            chunk_index=idx,
            clause_type=ct,
            coverage_category=None,
            deductible_related=any(k in low for k in ("deductible", "excess", "retention")),
            limit_related=any(k in low for k in ("limit", "maximum", "sum insured", "aggregate")),
            endorsement_flag=(ct == ClauseType.ENDORSEMENT),
            table_chunk=bool(c["table"]),
            token_count=count_tokens(full),
        )
