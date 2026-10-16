'use client';

import { useRef } from 'react';
import { gsap, useGsap } from '@/hooks/useGsap';

// Only components that exist in rag_engine/ today.
const NODES = [
  { title: 'PDF', sub: 'PyMuPDF to Markdown · header/footer removal' },
  { title: 'Structure-aware chunking', sub: 'headings → breadcrumbs, real pages, table rows' },
  { title: 'Jina v3 embeddings', sub: 'separate query / passage adapters' },
  { title: 'Hybrid retrieval', sub: 'pgvector + BM25, reciprocal-rank fusion' },
  { title: 'Cross-encoder rerank', sub: 'Jina reranker, falls back to vector order' },
  { title: 'LLM answer + citation', sub: 'Groq with a fallback chain, streamed' },
];

export default function UnderTheHood() {
  const root = useRef<HTMLElement>(null);

  useGsap(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const path = root.current!.querySelector<SVGPathElement>('[data-wire]');
      if (path) {
        const len = path.getTotalLength();
        gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, {
          strokeDashoffset: 0, ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'bottom 70%', scrub: 1 },
        });
      }
      gsap.fromTo('[data-node]', { opacity: 0.15 }, {
        opacity: 1, stagger: 0.15, ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top 65%', end: 'bottom 75%', scrub: 1 },
      });
    });
  }, root);

  return (
    <section ref={root} id="under-the-hood" className="px-4 py-28 sm:px-8" aria-labelledby="hood-title">
      <div className="mx-auto max-w-[1320px]">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">Under the hood</p>
        <h2 id="hood-title" className="font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">A retrieval pipeline<br />that shows its work.</h2>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
          Every answer is generated only from passages retrieved from your document — and the passages travel with the answer, so you can check it.
        </p>

        <div className="relative mt-16">
          <svg className="pointer-events-none absolute left-6 top-0 hidden h-full w-4 md:left-1/2 md:-ml-2 md:block" viewBox="0 0 16 1000" preserveAspectRatio="none" aria-hidden>
            <path data-wire d="M8 0 V1000" stroke="#d9ae6b" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="relative space-y-6 md:space-y-10">
            {NODES.map((n, i) => (
              <li key={n.title} data-node className={`md:flex ${i % 2 ? 'md:justify-start' : 'md:justify-end'}`}>
                <div className={`panel relative rounded-2xl p-5 md:w-[calc(50%-40px)] ${i % 2 ? 'md:ml-[calc(50%+40px)]' : 'md:mr-[calc(50%+40px)]'}`}>
                  <span className="font-mono text-[11px] text-gold">0{i + 1}</span>
                  <h3 className="mt-1 font-display text-2xl text-cream">{n.title}</h3>
                  <p className="mt-1 font-mono text-[12px] text-muted">{n.sub}</p>
                  <span className={`absolute top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full border border-gold bg-bg md:block ${i % 2 ? '-left-[46px]' : '-right-[46px]'}`} aria-hidden />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
