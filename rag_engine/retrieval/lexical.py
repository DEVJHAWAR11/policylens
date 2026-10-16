"""Per-policy BM25 keyword index, fused with vector search for hybrid retrieval.

Why: dense embeddings are good at paraphrase but weak on exact tokens that matter in
policies ("105%", "Section 45", "GSV", "grace period", clause numbers). BM25 is the
opposite. A policy has tens to a few hundred chunks, so the whole index lives in
memory (built from one cheap SELECT, cached with a TTL) — no schema change, no extra
service, and cost is independent of how many users share the table.
"""

from __future__ import annotations

import math
import re
import threading
import time
from collections import Counter

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.%][0-9]+)?")
_STOP = frozenset(
    "a an and are as at be by can do does for from has have how i if in is it its me my of on or "
    "so than that the their then there these this to under was what when where which who will with "
    "you your policy document please tell about get".split()
)
_K1, _B = 1.5, 0.75


def stem(tok: str) -> str:
    """Tiny suffix stripper: enough to match surrender/surrendered/surrendering."""
    for suf in ("ations", "ation", "ings", "ing", "ies", "ied", "ed", "es", "s", "ly"):
        if tok.endswith(suf) and len(tok) - len(suf) >= 3:
            return tok[: -len(suf)] + ("y" if suf in ("ies", "ied") else "")
    return tok


def tokenize(text: str) -> list[str]:
    return [stem(t) for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP]


class BM25Index:
    def __init__(self, docs: list[dict]) -> None:
        self.docs = docs
        self._tfs: list[Counter] = []
        self._len: list[int] = []
        df: Counter = Counter()
        for d in docs:
            # the section heading is part of the searchable text
            toks = tokenize(d["content"])
            tf = Counter(toks)
            self._tfs.append(tf)
            self._len.append(len(toks))
            df.update(tf.keys())
        n = max(len(docs), 1)
        self._avg = (sum(self._len) / n) or 1.0
        self._idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, k: int) -> list[tuple[int, float]]:
        q = tokenize(query)
        if not q:
            return []
        scores: list[tuple[int, float]] = []
        for i, tf in enumerate(self._tfs):
            s = 0.0
            for t in q:
                f = tf.get(t)
                if f:
                    s += self._idf.get(t, 0.0) * f * (_K1 + 1) / (f + _K1 * (1 - _B + _B * self._len[i] / self._avg))
            if s > 0:
                scores.append((i, s))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:k]


class LexicalIndexCache:
    """policy_id -> (built_at, docs, BM25Index). Small LRU with TTL."""

    def __init__(self, ttl: float = 600.0, max_policies: int = 64) -> None:
        self._ttl, self._max = ttl, max_policies
        self._items: dict[str, tuple[float, list[dict], BM25Index]] = {}
        self._lock = threading.Lock()

    def get(self, policy_id: str, loader) -> tuple[list[dict], BM25Index]:
        now = time.monotonic()
        with self._lock:
            hit = self._items.get(policy_id)
            if hit and now - hit[0] < self._ttl:
                return hit[1], hit[2]
        docs = loader(policy_id)  # outside the lock: network call
        index = BM25Index(docs)
        with self._lock:
            if len(self._items) >= self._max:
                oldest = min(self._items, key=lambda p: self._items[p][0])
                self._items.pop(oldest, None)
            self._items[policy_id] = (now, docs, index)
        return docs, index

    def invalidate(self, policy_id: str) -> None:
        with self._lock:
            self._items.pop(policy_id, None)


lexical_cache = LexicalIndexCache()
