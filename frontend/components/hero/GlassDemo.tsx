'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, FileText, Link2, Minus, Plus, Search } from 'lucide-react';
import { ColumnsIcon } from '@/components/ui/Logo';
import { ComingSoon, Tilt } from '@/components/ui/motion';
import { gsap, useReducedMotion } from '@/hooks/useGsap';
import { DEMO_LOOP_MS } from '@/lib/config';
import { DEMO } from './demoContent';

const TABS = ['Ask', 'Document', 'Summary', 'Compare'] as const;
type Tab = (typeof TABS)[number];

// Timeline as fractions of DEMO_LOOP_MS
const T = { type: 0.03, think: 0.17, answer: 0.26, highlight: 0.46, related: 0.55 };

function useDemoClock(paused: boolean, reduced: boolean) {
  const [t, setT] = useState(reduced ? 0.99 : 0);
  useEffect(() => {
    if (reduced) { setT(0.99); return; } // eslint-disable-line react-hooks/set-state-in-effect -- static final frame
    if (paused) return;
    const step = 50;
    const id = setInterval(() => setT((v) => (v + step / DEMO_LOOP_MS) % 1), step);
    return () => clearInterval(id);
  }, [paused, reduced]);
  return t;
}

export function PdfPage({ highlight, className = '', compact = false }: { highlight: boolean; className?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl bg-[#efe6d6] text-[#2a2118] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-black/10 bg-[#e6dccb] px-3 py-2 text-[11px] text-[#5a4c3a]">
        <FileText size={13} aria-hidden /> <span className="truncate font-medium">{DEMO.file}</span>
      </div>
      {!compact && (
        <div className="flex items-center gap-3 border-b border-black/10 px-3 py-1.5 font-mono text-[10px] text-[#6b5c48]">
          <Minus size={11} aria-hidden /><Plus size={11} aria-hidden /><Search size={11} aria-hidden />
          <span>150%</span>
          <span className="ml-auto flex items-center gap-1"><ChevronLeft size={11} aria-hidden />{DEMO.page} / {DEMO.pages}<ChevronRight size={11} aria-hidden /></span>
        </div>
      )}
      <div className="space-y-3 px-5 py-4 font-display text-[13px] leading-snug">
        <p className="text-[17px] font-semibold">{DEMO.heading}</p>
        <p className="opacity-70">{DEMO.before}</p>
        <p><mark className="clause-mark" data-on={highlight}>{DEMO.clause}</mark></p>
        <p className="opacity-70">{DEMO.after}</p>
        <p className="opacity-30">5. Claim Process</p>
      </div>
    </div>
  );
}

export function SourceChip({ lit, label = DEMO.source }: { lit: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors duration-500 ${
      lit ? 'pulse-gold border-gold/60 bg-gold/15 text-gold-bright' : 'border-line text-muted'}`}>
      <Link2 size={12} aria-hidden /> Source: {label}
    </span>
  );
}

function AskView({ t }: { t: number }) {
  const typed = DEMO.question.slice(0, Math.floor(DEMO.question.length * Math.min(1, Math.max(0, (t - T.type) / (T.think - T.type - 0.02)))));
  const thinking = t >= T.think && t < T.answer;
  const words = DEMO.answer.split(' ');
  const shown = t >= T.answer ? words.slice(0, Math.ceil(words.length * Math.min(1, (t - T.answer) / (T.highlight - T.answer - 0.02)))).join(' ') : '';
  const lit = t >= T.highlight;
  const related = t >= T.related;

  return (
    <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-[1.15fr_1fr]">
      <PdfPage highlight={lit} className="hidden md:flex" />
      <div className="flex min-h-[300px] flex-col gap-3">
        <div className="rounded-xl border border-line bg-black/25 px-3 py-2.5 text-[12.5px] text-cream">
          {typed}<span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-gold" aria-hidden />
        </div>
        <div className="rounded-xl border border-line bg-black/30 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
            <CheckCircle2 size={13} aria-hidden /> Answer
          </div>
          {thinking ? (
            <div className="space-y-2" aria-label="Thinking">
              <div className="h-2.5 w-full rounded shimmer" /><div className="h-2.5 w-5/6 rounded shimmer" /><div className="h-2.5 w-2/3 rounded shimmer" />
            </div>
          ) : (
            <p className="min-h-[72px] text-[12.5px] leading-relaxed text-cream/90">{shown}</p>
          )}
          <div className="mt-3 border-t border-line pt-2.5"><SourceChip lit={lit} /></div>
        </div>
        <div className="rounded-xl border border-line bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-cream/80">
            Related questions <ComingSoon />
          </div>
          <ul className="space-y-1.5">
            {DEMO.related.map((q, i) => (
              <motion.li key={q}
                initial={false}
                animate={{ opacity: related ? 1 : 0, y: related ? 0 : 6 }}
                transition={{ delay: related ? i * 0.09 : 0, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between rounded-md border border-line/70 px-2 py-1.5 text-[11px] text-muted">
                {q} <ArrowRight size={11} aria-hidden />
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SummaryView() {
  return (
    <div className="grid gap-3 text-[12.5px] md:grid-cols-2">
      {[
        ['Policy type', 'Individual health plan'],
        ['Waiting period', '36 months for pre-existing diseases'],
        ['Free-look period', '15 days to return it for a full refund'],
        ['Key exclusion', 'Cosmetic and experimental treatment'],
      ].map(([k, v]) => (
        <div key={k} className="rounded-xl border border-line bg-black/25 p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold">{k}</div>
          <div className="mt-1 text-cream/90">{v}</div>
        </div>
      ))}
    </div>
  );
}

function CompareView() {
  return (
    <div className="grid gap-3 text-[12.5px] md:grid-cols-2">
      {[['Health Shield', '36-month wait · Section 4.2, p.12'], ['CarePlus Gold', '24-month wait · Clause 7.1, p.9']].map(([n, v]) => (
        <div key={n} className="rounded-xl border border-line bg-black/25 p-3">
          <div className="font-display text-base text-cream">{n}</div>
          <div className="mt-1 text-muted">Pre-existing diseases</div>
          <div className="mt-2 font-mono text-[11px] text-gold-bright">{v}</div>
        </div>
      ))}
    </div>
  );
}

export default function GlassDemo({ tilt = true }: { tilt?: boolean }) {
  const [tab, setTab] = useState<Tab>('Ask');
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const t = useDemoClock(hover || tab !== 'Ask', reduced);
  const floatRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // slow sine float
  useEffect(() => {
    if (reduced || !floatRef.current) return;
    const tw = gsap.to(floatRef.current, { y: -8, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    return () => { tw.kill(); };
  }, [reduced]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div ref={floatRef}>
      <Tilt enabled={tilt && !reduced} base={{ rx: 3, ry: -8, rz: -1.5 }} onHoverChange={setHover} className="w-full">
        <div className="glass rounded-[22px] p-3 sm:p-4" aria-label="PolicyLens product demo" role="region">
          <div className="mb-3 flex items-center gap-3 px-1">
            <span className="hidden items-center gap-2 font-display text-lg text-cream sm:flex"><ColumnsIcon size={20} className="text-gold" /> PolicyLens</span>
            <div role="tablist" aria-label="Demo views" className="flex items-center gap-0.5 text-[12px] sm:ml-auto sm:gap-1">
              {TABS.map((name, i) => (
                <button
                  key={name}
                  ref={(el) => { tabRefs.current[i] = el; }}
                  role="tab"
                  aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`relative rounded-md px-2 py-1 transition-colors sm:px-2.5 ${tab === name ? 'text-cream' : 'text-muted hover:text-cream'}`}
                >
                  {name}
                  {tab === name && <motion.span layoutId="demo-tab" className="absolute inset-x-2 -bottom-0.5 h-px bg-gold" />}
                </button>
              ))}
            </div>
            <span className="hidden h-7 w-7 place-items-center rounded-full border border-line font-mono text-[11px] text-gold sm:grid" aria-hidden>D</span>
          </div>
          <div role="tabpanel" aria-label={tab} className="min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }} className="h-full">
                {tab === 'Ask' && <AskView t={t} />}
                {tab === 'Document' && <PdfPage highlight />}
                {tab === 'Summary' && <SummaryView />}
                {tab === 'Compare' && <CompareView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
