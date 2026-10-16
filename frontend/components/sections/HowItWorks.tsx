'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CloudUpload, FileText, MessageSquareText } from 'lucide-react';
import { gsap, ScrollTrigger, useGsap } from '@/hooks/useGsap';
import { PdfPage, SourceChip } from '@/components/hero/GlassDemo';
import { DEMO } from '@/components/hero/demoContent';

const STEPS = [
  { icon: CloudUpload, title: 'Upload your policy', body: 'Drop in a PDF up to 25 MB. PolicyLens reads every page, splits it along its own headings and tables, and indexes it — usually in under a minute.' },
  { icon: MessageSquareText, title: 'Ask in plain English', body: 'No legal vocabulary needed. Ask what you actually want to know: “Am I covered if…?”, “How long is the waiting period?”' },
  { icon: CheckCircle2, title: 'Get the cited answer', body: 'A short, clear answer streams in with the exact section and page it came from. One click shows the clause, highlighted, in the document.' },
];

function StepVisual({ step }: { step: number }) {
  return (
    <div className="glass rounded-[22px] p-4">
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="min-h-[330px]">
          {step === 0 && (
            <div className="grid h-[330px] place-items-center rounded-xl border border-dashed border-gold/40 bg-inset">
              <div className="flex w-64 flex-col items-center gap-4 text-center">
                <div className="relative h-20 w-20">
                  <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
                    <circle cx="40" cy="40" r="34" stroke="rgba(217,174,107,0.2)" strokeWidth="4" fill="none" />
                    <motion.circle cx="40" cy="40" r="34" stroke="#d9ae6b" strokeWidth="4" fill="none" strokeLinecap="round"
                      strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 40 }} transition={{ duration: 2, ease: 'easeOut' }} />
                  </svg>
                  <FileText className="absolute inset-0 m-auto text-gold" size={26} aria-hidden />
                </div>
                <p className="text-sm text-cream">{DEMO.file}</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-tint"><div className="h-full w-4/5 rounded-full shimmer" /></div>
                <p className="font-mono text-[11px] text-muted">Reading pages · building the index</p>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="flex h-[330px] flex-col justify-end gap-3 rounded-xl bg-inset p-4">
              <div className="self-end rounded-2xl rounded-br-sm bg-gold/15 px-4 py-2.5 text-sm text-cream">{DEMO.question}</div>
              <div className="w-3/4 space-y-2 rounded-2xl rounded-bl-sm border border-line p-4">
                <div className="h-2.5 rounded shimmer" /><div className="h-2.5 w-5/6 rounded shimmer" /><div className="h-2.5 w-1/2 rounded shimmer" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
              <PdfPage highlight compact />
              <div className="rounded-xl border border-line bg-inset p-4 text-[13px] leading-relaxed text-cream/90">
                {DEMO.answer}
                <div className="mt-3"><SourceChip lit /></div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);

  useGsap(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const st = ScrollTrigger.create({
        trigger: root.current, start: 'top top', end: '+=200%', pin: true, scrub: true,
        onUpdate: (self) => setStep(Math.min(2, Math.floor(self.progress * 3))),
      });
      return () => st.kill();
    });
  }, root);

  return (
    <section ref={root} id="how" className="relative flex min-h-[100svh] items-center px-4 py-24 sm:px-8" aria-labelledby="how-title">
      <div className="mx-auto grid w-full max-w-[1320px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">How it works</p>
          <h2 id="how-title" className="font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">Three steps from<br />fine print to <span className="text-gold-grad">clarity.</span></h2>
          <ol className="mt-10 space-y-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              return (
                <li key={s.title}>
                  <button
                    onClick={() => setStep(i)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex w-full gap-4 rounded-2xl border p-5 text-left transition-all duration-500 ${active ? 'border-gold/50 bg-gold/[0.06]' : 'border-transparent opacity-55 hover:opacity-90'} max-lg:border-line max-lg:opacity-100`}
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border font-mono text-[12px] ${active ? 'border-gold text-gold-bright' : 'border-line text-muted'}`}>0{i + 1}</span>
                    <span>
                      <span className="flex items-center gap-2 font-display text-2xl text-cream"><Icon size={18} className="text-gold" aria-hidden />{s.title}</span>
                      <span className="mt-1.5 block text-[15px] leading-relaxed text-muted">{s.body}</span>
                    </span>
                  </button>
                  {/* phones: no pinned scene, so every step carries its own picture */}
                  <div className="mt-3 lg:hidden"><StepVisual step={i} /></div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="hidden lg:block"><StepVisual step={step} /></div>
      </div>
    </section>
  );
}
