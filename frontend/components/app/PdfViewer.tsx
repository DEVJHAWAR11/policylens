'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FileText, Minus, Plus, RotateCw } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { fetchApi } from '@/lib/api';
import { matchItems } from '@/lib/highlight';

export interface PdfFocus { page: number; text: string; nonce: number }

interface Rect { x: number; y: number; w: number; h: number }

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return m;
  });
  return pdfjsPromise;
}

export default function PdfViewer({ policyId, policyName, focus }: { policyId: string | null; policyName?: string; focus: PdfFocus | null }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rects, setRects] = useState<Rect[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [attempt, setAttempt] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  // container width → render scale. The first measurement is applied at once; later ones (e.g. while
  // the side panel is being dragged) wait until the width settles, so the page is not redrawn on every pixel.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      clearTimeout(timer);
      if (first) { first = false; setWidth(w); return; }
      timer = setTimeout(() => setWidth(w), 120);
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, []);

  // load the document (signed URL from the API, valid for an hour)
  useEffect(() => {
    if (!policyId) { setDoc(null); setState('idle'); return; } // eslint-disable-line react-hooks/set-state-in-effect -- reset on deselect
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setState('loading'); setError(''); setDoc(null); setPage(1); setRects([]);
    (async () => {
      try {
        const [{ url: signed }, pdfjs] = await Promise.all([fetchApi<{ url: string }>(`/policies/${policyId}/pdf`), loadPdfjs()]);
        if (cancelled) return;
        setUrl(signed);
        loaded = await pdfjs.getDocument({ url: signed }).promise;
        if (cancelled) { void loaded.destroy(); return; }
        setDoc(loaded);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message || 'Could not open this PDF.');
        setState('error');
      }
    })();
    return () => { cancelled = true; void loaded?.destroy(); };
  }, [policyId, attempt]);

  // jump to a cited page
  useEffect(() => {
    if (!focus || !doc) return;
    setPage(Math.min(Math.max(1, focus.page || 1), doc.numPages)); // eslint-disable-line react-hooks/set-state-in-effect -- follow citation clicks
  }, [focus, doc]);

  // render page + compute highlight boxes for the cited passage
  useEffect(() => {
    if (!doc || !width || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: ((width - 32) / base.width) * zoom });
      const canvas = canvasRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      task = p.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await task.promise; } catch { return; }
      if (cancelled) return;

      if (focus && focus.page === page && focus.text) {
        const content = await p.getTextContent();
        const items = content.items.filter((it) => 'str' in it);
        const hits = matchItems(items.map((it) => it.str), focus.text);
        const out: Rect[] = [];
        for (const [idx, item] of items.entries()) {
          if (!hits[idx]) continue;
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontH = Math.hypot(tx[2], tx[3]);
          out.push({ x: tx[4], y: tx[5] - fontH, w: item.width * viewport.scale, h: fontH * 1.15 });
        }
        if (!cancelled) {
          setRects(out);
          if (out.length && scrollRef.current) {
            const top = Math.min(...out.map((r) => r.y));
            scrollRef.current.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
          }
        }
      } else if (!cancelled) setRects([]);
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, page, width, zoom, focus]);

  const pages = doc?.numPages ?? 0;
  const onCitedPage = focus && focus.page === page && rects.length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Document viewer">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <FileText size={15} className="shrink-0 text-gold" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-cream">{policyName || 'Document'}</h2>
        {state === 'ready' && (
          <div className="flex items-center gap-1 font-mono text-[11.5px] text-muted">
            <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} aria-label="Zoom out" className="rounded p-1.5 hover:bg-tint hover:text-cream"><Minus size={14} /></button>
            <span className="w-11 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Zoom in" className="rounded p-1.5 hover:bg-tint hover:text-cream"><Plus size={14} /></button>
            <span className="mx-1 h-4 w-px bg-line" />
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="rounded p-1.5 hover:bg-tint hover:text-cream disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className={`rounded px-1.5 py-0.5 ${onCitedPage ? 'pulse-gold bg-gold/15 text-gold-bright' : ''}`} aria-live="polite">{page} / {pages}</span>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page" className="rounded p-1.5 hover:bg-tint hover:text-cream disabled:opacity-30"><ChevronRight size={14} /></button>
            {url && <a href={url} target="_blank" rel="noreferrer" aria-label="Open PDF in a new tab" className="ml-1 rounded p-1.5 hover:bg-tint hover:text-cream"><ExternalLink size={14} /></a>}
          </div>
        )}
      </header>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="absolute inset-0 overflow-auto scrollbar-thin">
          {state === 'idle' && (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <FileText size={40} strokeWidth={1} className="mx-auto text-gold/60" aria-hidden />
                <p className="mt-4 font-display text-2xl text-cream">No document open</p>
                <p className="mt-1 text-[14px] text-muted">Choose a policy on the left, or upload one.</p>
              </div>
            </div>
          )}
          {state === 'loading' && (
            <div className="mx-auto my-4 w-[calc(100%-32px)] max-w-[760px] space-y-3 rounded-xl bg-tint p-8" aria-label="Loading document">
              <div className="h-5 w-1/2 rounded shimmer" />
              {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-3 rounded shimmer" style={{ width: `${70 + ((i * 37) % 30)}%` }} />)}
            </div>
          )}
          {state === 'error' && (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <AlertTriangle size={34} strokeWidth={1.2} className="mx-auto text-danger" aria-hidden />
                <p className="mt-3 font-display text-xl text-cream">Couldn’t open the PDF</p>
                <p className="mt-1 max-w-sm text-[14px] text-muted">{error}</p>
                <button onClick={() => setAttempt((a) => a + 1)} className="btn-ghost mt-5 !py-2 text-sm"><RotateCw size={14} aria-hidden /> Try again</button>
              </div>
            </div>
          )}
          <div className={`relative mx-auto my-4 ${state === 'ready' ? '' : 'hidden'}`} style={{ width: size.w || undefined }}>
            <canvas ref={canvasRef} className="block rounded-md shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]" />
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {rects.map((r, i) => (
                <span key={`${focus?.nonce}-${i}`} className="absolute origin-left rounded-[2px] bg-highlight mix-blend-multiply"
                  style={{ left: r.x - 2, top: r.y, width: r.w + 4, height: r.h, animation: `pl-sweep 0.9s ${Math.min(i * 0.04, 0.6)}s cubic-bezier(0.16,1,0.3,1) both` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{'@keyframes pl-sweep{from{transform:scaleX(0);opacity:.2}to{transform:scaleX(1);opacity:.85}}'}</style>
    </section>
  );
}
