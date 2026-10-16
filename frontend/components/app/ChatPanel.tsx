'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Link2, MessageSquareText, Square } from 'lucide-react';
import type { ChatMessage, Policy, Source } from '@/lib/types';

// Generic starters, shown before the first question (not generated from the policy).
const STARTERS = [
  'What does this policy cover?',
  'What is excluded?',
  'Is there a waiting period?',
  'How do I make a claim?',
];

function SourceChips({ m, onCite }: { m: ChatMessage; onCite: (s: Source) => void }) {
  if (m.sourcesState === 'loading') {
    return <div className="mt-3 flex gap-2" aria-label="Finding sources">{[0, 1].map((i) => <span key={i} className="h-7 w-28 rounded-lg shimmer" />)}</div>;
  }
  if (!m.sources?.length) return null;
  // one chip per page, best-scoring passage first
  const seen = new Set<string>();
  const chips = m.sources.filter((s) => {
    const k = `${s.page_number}-${s.section}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      {chips.map((s, i) => (
        <motion.button key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          onClick={() => onCite(s)} disabled={!s.page_number}
          title={s.snippet}
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted transition-colors hover:border-gold/60 hover:bg-gold/10 hover:text-gold-bright disabled:cursor-default">
          <Link2 size={11} className="shrink-0" aria-hidden />
          <span className="truncate">{s.section && s.section !== 'Unknown' ? `${s.section.slice(0, 38)} · ` : ''}{s.page_number ? `p.${s.page_number}` : 'page n/a'}</span>
        </motion.button>
      ))}
    </div>
  );
}

export default function ChatPanel({
  policy, messages, busy, historyState, onAsk, onStop, onCite,
}: {
  policy: Policy | null; messages: ChatMessage[]; busy: boolean; historyState?: 'loading' | 'done' | 'error';
  onAsk: (q: string) => Promise<{ restore?: string }>; onStop: () => void; onCite: (s: Source) => void;
}) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ready = policy?.status === 'ready';

  const lastText = messages.at(-1)?.text;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, lastText]);

  const send = async (q = input) => {
    if (!q.trim() || busy || !ready) return;
    setInput('');
    const { restore } = await onAsk(q);
    if (restore) setInput(restore);
    taRef.current?.focus();
  };

  if (!policy) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <MessageSquareText size={34} strokeWidth={1} className="mx-auto text-gold/60" aria-hidden />
          <p className="mt-3 font-display text-xl text-cream">Ask about a policy</p>
          <p className="mt-1 text-[13.5px] text-muted">Select a processed policy to start.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin" aria-live="polite">
        {historyState === 'loading' && (
          <div className="space-y-3" aria-label="Loading earlier questions">
            <div className="ml-auto h-9 w-2/3 rounded-2xl shimmer" /><div className="h-20 w-5/6 rounded-2xl shimmer" />
          </div>
        )}
        {messages.length === 0 && historyState !== 'loading' && (
          <div className="pt-6">
            <p className="font-display text-2xl text-cream">{ready ? 'What would you like to know?' : 'Still processing…'}</p>
            <p className="mt-1 text-[13.5px] text-muted">{ready ? 'Answers cite the section and page. Click a citation to see the clause.' : 'You can ask questions as soon as this policy is ready.'}</p>
            {ready && (
              <div className="mt-5">
                <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">Try asking</p>
                <div className="flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-line px-3.5 py-2.5 text-left text-[13.5px] text-cream/85 transition-colors hover:border-gold/50 hover:bg-gold/5">{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gold/15 px-4 py-2.5 text-[14px] text-cream">{m.text}</p>
                ) : (
                  <div className={`rounded-2xl rounded-bl-md border px-4 py-3 text-[14px] leading-relaxed ${m.error ? 'border-danger/40 bg-danger/10 text-[#f3c3b2]' : 'border-line bg-black/25 text-cream/90'}`}>
                    {m.streaming && !m.text ? (
                      <div className="space-y-2 py-1" aria-label="Thinking"><div className="h-2.5 rounded shimmer" /><div className="h-2.5 w-4/5 rounded shimmer" /><div className="h-2.5 w-3/5 rounded shimmer" /></div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.text}{m.streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-gold" aria-hidden />}</p>
                    )}
                    <SourceChips m={m} onCite={onCite} />
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-black/30 p-2 focus-within:border-gold/60">
          <label htmlFor="ask" className="sr-only">Ask a question about {policy.name}</label>
          <textarea
            id="ask" ref={taRef} rows={1} value={input} disabled={!ready}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={ready ? 'Ask in plain English…' : 'Waiting for processing to finish'}
            className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-cream outline-none placeholder:text-muted/60 disabled:opacity-50"
          />
          {busy ? (
            <button type="button" onClick={onStop} aria-label="Stop answering" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-cream hover:border-gold"><Square size={14} /></button>
          ) : (
            <button type="submit" disabled={!input.trim() || !ready} aria-label="Send question" className="btn-gold !h-10 !w-10 shrink-0 !p-0"><ArrowUp size={17} /></button>
          )}
        </div>
      </form>
    </div>
  );
}
