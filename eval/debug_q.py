"""Show where a question's evidence chunk ranks: vector, BM25, fused, reranked."""
import json
import re
import sys
from pathlib import Path

from rag_engine.retrieval.lexical import tokenize
from rag_engine.services.query_service import QueryService

tag, ids = sys.argv[1], sys.argv[2].split(",")
spec = json.loads((Path(__file__).parent / "questions.json").read_text(encoding="utf-8"))
svc = QueryService()
pid = f"eval-{tag}"
docs, index = svc._retriever._policy_docs(pid)


def has_ev(text, ev):
    t = re.sub(r"\s+", " ", text.replace("<br>", " "))
    return all(re.search(p, t, re.I | re.S) for p in ev)


for q in spec["questions"]:
    if q["id"] not in ids:
        continue
    ev = q.get("evidence", [])
    where = [i for i, d in enumerate(docs) if has_ev(d["content"], ev)]
    print(f"\n## {q['id']}: {q['q']}\n evidence in chunks {where} -> " + "; ".join(docs[i]["metadata"]["section_name"][:40] for i in where))
    emb = svc._retriever._embed(q["q"], pid)
    vec = svc._store.similarity_search(query_embedding=emb, k=12, filter_dict={"policy_id": pid})
    vid = [next((i for i, d in enumerate(docs) if d["content"] == v["content"]), -1) for v in vec]
    lex = [i for i, _ in index.search(q["q"], 12)]
    fused = svc._retriever.retrieve(q["q"], pid, k=8)
    fid = [next((i for i, d in enumerate(docs) if d["content"] == v["content"]), -1) for v in fused]
    rr = svc._reranker.rerank(q["q"], list(fused), top_k=8)
    rid = [next((i for i, d in enumerate(docs) if d["content"] == v["content"]), -1) for v in rr]
    print(" query tokens:", tokenize(q["q"]))
    print(" vector :", vid)
    print(" bm25   :", lex)
    print(" fused  :", fid)
    print(" rerank :", rid)
