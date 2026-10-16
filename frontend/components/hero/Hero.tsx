'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, FileText, Play, Scale, ShieldCheck } from 'lucide-react';
import { CountUp, Magnet, SplitLines } from '@/components/ui/motion';
import { gsap, useIsDesktop, useReducedMotion } from '@/hooks/useGsap';
import { scrollToId } from '@/hooks/useLenis';
import { EVAL_STATS } from '@/lib/config';
import GlassDemo from './GlassDemo';
import HeroScene from './HeroScene';

const MINI = [
  { icon: FileText, label: ['Document', 'Q&A'] },
  { icon: ShieldCheck, label: ['Source-backed', 'answers'] },
  { icon: BarChart3, label: ['Summaries', '& insights'] },
  { icon: Scale, label: ['Compare', 'policies'] },
];

function Corner({ className }: { className: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="#d9ae6b" strokeOpacity="0.7" className={`absolute ${className}`} aria-hidden>
      <path d="M1 33V12C1 6 6 1 12 1h21" /><path d="M6 33V14c0-4.5 3.5-8 8-8h19" strokeOpacity="0.35" /><circle cx="12" cy="12" r="1.6" fill="#d9ae6b" />
    </svg>
  );
}

// Dark curtain, a gold hairline draws across, curtain lifts. Once per page load.
function IntroCurtain({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const reduced = useReducedMotion();
  useEffect(() => {
    const onDone = () => done.current();
    if (reduced) { onDone(); return; }
    const el = ref.current!;
    const tl = gsap.timeline({ onComplete: onDone });
    tl.fromTo(el.querySelector('[data-line]'), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'expo.inOut' })
      .to(el.querySelector('[data-line]'), { opacity: 0, duration: 0.3 })
      .to(el, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.15')
      .set(el, { display: 'none' });
    return () => { tl.kill(); };
  }, [reduced]);
  if (reduced) return null;
  return (
    <div ref={ref} className="fixed inset-0 z-[75] grid place-items-center bg-bg" aria-hidden>
      <div data-line className="hairline w-[min(520px,70vw)] origin-left !opacity-100" />
    </div>
  );
}

export default function Hero() {
  const [ready, setReady] = useState(false);
  const desktop = useIsDesktop();
  const copyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!ready) return;
    const items = copyRef.current?.querySelectorAll('[data-stagger]');
    if (reduced) { gsap.set([items, panelRef.current], { opacity: 1, y: 0 }); return; }
    const tl = gsap.timeline({ delay: 0.35 });
    tl.fromTo(items!, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09 })
      .fromTo(panelRef.current, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out' }, 0.15);
    return () => { tl.kill(); };
  }, [ready, reduced]);

  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden">
      <IntroCurtain onDone={() => setReady(true)} />
      <HeroScene />

      <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-[1320px] grid-cols-1 items-center gap-12 px-4 pb-14 pt-28 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-48">
        <div ref={copyRef}>
          <p data-stagger className="mb-5 font-mono text-[12px] uppercase tracking-[0.32em] text-gold opacity-0">Policy documents, made simple</p>
          <SplitLines
            play={ready}
            className="font-display text-[clamp(3rem,7vw,6.5rem)] font-semibold leading-[0.95] tracking-[-0.01em] text-cream"
            lines={['Complex', 'Policies,', <span key="g" className="text-gold-grad">Clear Answers.</span>]}
          />
          <p data-stagger className="mt-7 max-w-[34rem] text-[17px] leading-relaxed text-cream/80 opacity-0">
            PolicyLens reads, analyzes and explains complex policy documents in simple, clear language — with answers backed by the exact clause and page number.
          </p>
          <div data-stagger className="mt-9 flex flex-wrap items-center gap-4 opacity-0">
            <Magnet><Link href="/login/?mode=signup" className="btn-gold">Try PolicyLens <ArrowRight size={17} aria-hidden /></Link></Magnet>
            <button onClick={() => scrollToId('how')} className="btn-ghost">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-cream/40"><Play size={12} className="translate-x-px" aria-hidden /></span>
              Watch Demo
            </button>
          </div>
          <ul data-stagger className="mt-12 grid max-w-[34rem] grid-cols-2 gap-x-6 gap-y-5 opacity-0 sm:grid-cols-4">
            {MINI.map(({ icon: Icon, label }) => (
              <li key={label[0]} className="flex items-center gap-3 text-[12.5px] leading-tight text-cream/75">
                <Icon size={24} strokeWidth={1.2} className="shrink-0 text-gold" aria-hidden />
                <span>{label[0]}<br />{label[1]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div ref={panelRef} className="opacity-0 lg:ml-auto lg:w-[90%] lg:pl-4" style={{ perspective: 1400 }}>
          <GlassDemo tilt={desktop} />
        </div>
      </div>

      {/* stats strip — real numbers from docs/RAG_EVAL.md */}
      <div className="relative z-10 px-4 pb-6 sm:px-8 lg:absolute lg:inset-x-0 lg:bottom-0">
        <div className="relative mx-auto max-w-[1320px] border-t border-line bg-gradient-to-b from-bg/40 to-bg/80 backdrop-blur-md">
          <Corner className="-left-1 -top-1" />
          <Corner className="-right-1 -top-1 -scale-x-100" />
          <dl className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
            {EVAL_STATS.map((s) => (
              <div key={s.label} className="px-4 py-4 text-center md:py-5">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-[clamp(1.8rem,3vw,2.6rem)] font-semibold leading-none text-cream">
                  <CountUp to={s.value} />{s.suffix}
                </dd>
                <dd className="mt-1.5 text-[12px] text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
          <p className="pb-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">Measured on our evaluation set · 28 questions over a real LIC policy</p>
        </div>
      </div>
    </section>
  );
}
