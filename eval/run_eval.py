"""Retrieval + answer eval for PolicyLens.

Local (default): runs the real pipeline in-process against Supabase, using an isolated
policy id (``eval-<tag>``) so real user policies are never touched.

    python -m eval.run_eval --ingest --tag base          # ingest the PDF, then evaluate
    python -m eval.run_eval --tag base                    # evaluate an already-ingested id
    python -m eval.run_eval --tag base --cleanup          # delete the eval chunks afterwards

Remote: POST /query on a deployed RAG service (the id must already be ingested; both
stacks share one Supabase). The internal key is read from $INTERNAL_API_KEY, never printed.

    python -m eval.run_eval --remote https://policylens-devj-rag.onrender.com --tag base

Scoring is deterministic (regexes, no LLM judge, so it costs no extra tokens):
  retrieval@k      expected evidence text is among the raw top-k vector hits
  retrieval@final  expected evidence text is in the chunks given to the LLM
  answer           answer matches the required patterns (negatives: says "not found")
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
NOT_FOUND = re.compile(r"couldn.t find|could not find|not (?:mentioned|specified|covered|stated|found)|no (?:mention|information)", re.I)


def _hit(patterns: list[str], texts: list[str]) -> bool:
    # tables are markdown with <br>; flatten so evidence regexes can span line wraps
    blob = re.sub(r"\s+", " ", "\n".join(texts).replace("<br>", " "))
    return all(re.search(p, blob, re.I | re.S) for p in patterns)


def score_answer(q: dict, answer: str) -> bool:
    import unicodedata
    answer = unicodedata.normalize("NFKC", answer).replace(" ", " ").replace("‑", "-").replace("‐", "-")
    nf = bool(NOT_FOUND.search(answer))
    if q.get("answerable") is False:
        any_ok = q.get("answer_any")
        if any_ok and any(re.search(p, answer, re.I) for p in any_ok):
            return True
        return nf
    if nf:
        return False
    if not all(re.search(p, answer, re.I | re.S) for p in q.get("answer_all", [])):
        return False
    any_ok = q.get("answer_any")
    return not any_ok or any(re.search(p, answer, re.I) for p in any_ok)


class Local:
    def __init__(self, k: int, rerank_k: int, no_llm: bool = False):
        self.no_llm = no_llm
        from rag_engine.services.query_service import QueryService
        self.svc, self.k, self.rerank_k = QueryService(), k, rerank_k

    def ingest(self, pdf: Path, pid: str):
        from rag_engine.services.ingestion_service import IngestionService
        print(IngestionService().ingest(str(pdf), pid, overwrite=True))

    def cleanup(self, pid: str):
        self.svc._store.delete_policy(pid)

    def ask(self, question: str, pid: str):
        from rag_engine.prompts.context_template import build_query_prompt
        s = self.svc
        raw = s._retriever.retrieve(question, pid, k=self.k)
        final = s._reranker.rerank(question, list(raw), top_k=self.rerank_k)
        prompt = build_query_prompt(question, s._context_builder.build(final), pid)
        if self.no_llm:
            return [r["content"] for r in raw], [r["content"] for r in final], ""
        for attempt in range(6):
            try:
                answer = s._complete(prompt)
                break
            except Exception as exc:  # provider rate limit: wait and retry
                wait = 15 * (attempt + 1)
                print(f"    LLM error ({type(exc).__name__}); retry in {wait}s")
                time.sleep(wait)
        else:
            answer = ""
        return [r["content"] for r in raw], [r["content"] for r in final], answer


class Remote:
    def __init__(self, url: str):
        import requests
        self.r, self.url = requests, url.rstrip("/")
        self.h = {"X-Internal-Key": os.environ.get("INTERNAL_API_KEY", "")}

    def ask(self, question: str, pid: str):
        for attempt in range(6):
            resp = self.r.post(f"{self.url}/query/", json={"question": question, "policy_id": pid, "k": 5}, headers=self.h, timeout=90)
            if resp.status_code == 503:
                time.sleep(int(resp.headers.get("Retry-After", 10)))
                continue
            resp.raise_for_status()
            d = resp.json()
            final = [s["highlight_text"] for s in d["sources"]]
            return final, final, d["answer"]  # remote exposes only the final chunks
        return [], [], ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="base")
    ap.add_argument("--ingest", action="store_true")
    ap.add_argument("--cleanup", action="store_true")
    ap.add_argument("--remote")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--rerank-k", type=int, default=4)
    ap.add_argument("--pace", type=float, default=0, help="seconds between questions (Groq free tier: ~10)")
    ap.add_argument("--no-llm", action="store_true", help="retrieval-only (no LLM tokens)")
    ap.add_argument("--only", help="comma-separated question ids")
    ap.add_argument("--out", help="write per-question JSON here")
    a = ap.parse_args()

    spec = json.loads((HERE / "questions.json").read_text(encoding="utf-8"))
    qs = spec["questions"]
    if a.only:
        qs = [q for q in qs if q["id"] in a.only.split(",")]
    pid = f"eval-{a.tag}"
    be = Remote(a.remote) if a.remote else Local(a.k, a.rerank_k, a.no_llm)
    if a.ingest:
        be.ingest(HERE / spec["policy_file"], pid)

    rows, t0 = [], time.time()
    for q in qs:
        raw, final, ans = be.ask(q["q"], pid)
        ev = q.get("evidence")
        row = {
            "id": q["id"], "answer": ans,
            "ret_k": _hit(ev, raw) if ev else None,
            "ret_final": _hit(ev, final) if ev else None,
            "ok": score_answer(q, ans),
        }
        rows.append(row)
        print(f"{'PASS' if row['ok'] else 'FAIL'} {q['id']:<30} ret@k={row['ret_k']} ret@final={row['ret_final']}")
        if not row["ok"]:
            print("     ->", ans.replace("\n", " ")[:220])
        if a.pace:
            time.sleep(a.pace)

    pos = [r for r in rows if r["ret_k"] is not None]
    neg = [r for r, q in zip(rows, qs) if q.get("answerable") is False]
    pos_ans = [r for r, q in zip(rows, qs) if q.get("answerable") is not False]
    summary = {
        "tag": a.tag, "n": len(rows),
        "answer_acc_answerable": f"{sum(r['ok'] for r in pos_ans)}/{len(pos_ans)}",
        "negatives_correct": f"{sum(r['ok'] for r in neg)}/{len(neg)}",
        "retrieval_at_k": f"{sum(bool(r['ret_k']) for r in pos)}/{len(pos)}",
        "retrieval_at_final": f"{sum(bool(r['ret_final']) for r in pos)}/{len(pos)}",
        "seconds": round(time.time() - t0),
    }
    print("\nSUMMARY", json.dumps(summary))
    if a.out:
        Path(a.out).write_text(json.dumps({"summary": summary, "rows": rows}, indent=1), encoding="utf-8")
    if a.cleanup and not a.remote:
        be.cleanup(pid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
