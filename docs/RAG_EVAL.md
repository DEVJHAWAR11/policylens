# RAG quality: eval and results

`eval/questions.json` holds 28 questions with known answers over a real policy
(`eval/policies/lic_new_jeevan_shanti.pdf`): 24 answerable, 4 that the document does not answer
(must get "not found"). Scoring is deterministic (regexes, no LLM judge).

```
python -m eval.run_eval --ingest --tag mytag --pace 10      # local, real pipeline, isolated id eval-mytag
python -m eval.run_eval --tag mytag --no-llm                # retrieval only: no LLM tokens
python -m eval.run_eval --remote https://<rag-url> --tag mytag   # deployed service ($INTERNAL_API_KEY)
python -m eval.debug_q mytag question_id                    # where does the evidence rank?
```

| Stage | Retrieval hit (before rerank / sent to LLM) | Correct answers | "Not in document" |
|---|---|---|---|
| Baseline (old chunker, vector only, k=5/3) | 18/24 / 17/24 | 18/24 | 4/4 |
| + Jina task adapters, k=8, 4 chunks | 24/24 / 22/24 | 21/24 | 4/4 |
| + structure-aware chunks, hybrid BM25, new prompt | **24/24 / 23/24** | **23/24** (22 by strict regex, 1 scorer artifact) | 4/4 |

## What was wrong
* The chunker only knew `SECTION 1 -` headings. Real PDFs became a single "Preamble" cut into blind 512-token
  windows, every one tagged `exclusion`, with wrong page numbers.
* Dense-only retrieval misses exact terms (percentages, clause names, abbreviations).
* Queries and passages were embedded identically (Jina v3 has separate retrieval adapters).
* Compare merged all policies' chunks before reranking, so one policy could crowd out another.
* The prompt said "couldn't find" when a rule or formula was present but no single final number.

## What changed
`structured_chunker.py` (headings -> breadcrumb on every chunk, real pages, header/footer removal, row-wise table
splitting, small definition chunks, de-duplication) · `retriever.py` + `lexical.py` (vector + BM25, reciprocal-rank
fusion, per-policy in-memory index, no schema change) · task adapters recorded per chunk in `metadata.embed_task` so
queries match how each policy was embedded · per-policy rerank for compare · new prompts.

## Rolling it out
Old policies keep working unchanged (queries use the plain embedding for untagged chunks). To upgrade them:
`python -m rag_engine.reembed --list`, then `--mode full` (re-parse + new chunks; best) or `--mode vectors`.
Do this **after** the new code is deployed.

Known gap: "What annuity options does this plan offer?" is answered from the death-benefit options instead of
the Single/Joint life table (the table chunk is retrieved; the model picks the wrong one).
