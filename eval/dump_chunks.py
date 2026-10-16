"""Dump the parsed text and chunks of a PDF using the production ingestion path (offline)."""
import sys
from pathlib import Path

from rag_engine.chunking.clause_chunker import ClauseChunker
from rag_engine.ingestion.cleaner import DocumentCleaner
from rag_engine.ingestion.pdf_loader import PDFLoader

pdf = Path(sys.argv[1])
out = Path(sys.argv[2])
text = PDFLoader().load(pdf)
clean = DocumentCleaner().clean(text, keep_page_markers=True)
chunks = ClauseChunker().chunk(clean, "EVAL", pdf.name)
out.mkdir(parents=True, exist_ok=True)
(out / "text.md").write_text(clean, encoding="utf-8")
with open(out / "chunks.txt", "w", encoding="utf-8") as f:
    for i, (t, m) in enumerate(chunks):
        f.write(f"\n=== CHUNK {i} | {m.section_name} | {m.clause_type} | tok={m.token_count} ===\n{t}\n")
print(len(text), "chars,", len(chunks), "chunks")
