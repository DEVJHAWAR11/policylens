'use client';

import { useRef } from 'react';
import { Building2, Car, HeartPulse, Landmark, ScrollText } from 'lucide-react';
import { gsap, useGsap } from '@/hooks/useGsap';

const CASES = [
  { icon: HeartPulse, title: 'Health insurance', q: '“Is my knee surgery covered, and is there a sub-limit?”' },
  { icon: Car, title: 'Motor', q: '“Does my policy pay for engine damage from flooding?”' },
  { icon: ScrollText, title: 'Term life', q: '“What does my family receive, and when is a claim refused?”' },
  { icon: Landmark, title: 'Government circulars', q: '“What changed for pensioners in this circular?”' },
  { icon: Building2, title: 'Regulatory guidelines', q: '“Which disclosures does this guideline require from insurers?”' },
];

export default function UseCases() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGsap(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const distance = () => track.current!.scrollWidth - window.innerWidth + 64;
      gsap.to(track.current, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true },
      });
    });
  }, root);

  return (
    <section ref={root} id="use-cases" className="relative overflow-hidden py-24 lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center" aria-labelledby="use-title">
      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-8">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">Use cases</p>
        <h2 id="use-title" className="font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">Any document that<br />decides what you’re owed.</h2>
      </div>
      <div className="mt-12 overflow-x-auto px-4 pb-4 scrollbar-thin sm:px-8 lg:overflow-visible">
        <div ref={track} className="flex w-max gap-5 lg:pl-[max(2rem,calc((100vw-1320px)/2+2rem))]">
          {CASES.map(({ icon: Icon, title, q }, i) => (
            <article key={title} className="panel group relative flex h-[340px] w-[min(82vw,380px)] flex-col justify-between overflow-hidden rounded-3xl p-8 transition-colors duration-500 hover:border-gold/50">
              <span className="font-mono text-[12px] text-muted">0{i + 1}</span>
              <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold/10 blur-3xl transition-opacity duration-700 group-hover:opacity-100 opacity-40" />
              <div>
                <Icon size={30} strokeWidth={1.1} className="mb-5 text-gold" aria-hidden />
                <h3 className="font-display text-3xl font-semibold text-cream">{title}</h3>
                <p className="mt-3 font-display text-lg italic leading-snug text-cream/70">{q}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
