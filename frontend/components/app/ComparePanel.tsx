'use client';

import { useState } from 'react';
import { ArrowUp, Link2, Scale } from 'lucide-react';
import Markdown from '@/components/ui/Markdown';
import { fetchApi } from '@/lib/api';
import type { Policy, Source } from '@/lib/types';

// Citations grouped under the policy they come from; each chip opens that policy's PDF at the cited page.
function CompareSources({ sources, selected, onCite }: {
  sources: Source[]; selected: Policy[]; onCite: (policyId: string, s: Source) => void;
}) {
  const groups = selected
    .map((p) => {
      const seen = new Set<string>();
      const chips = sources.filter((s) => s.policy_id === p.id).filter((s) => {
        const k = `${s.page_number}-${s.section}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { policy: p, chips };
    })
    .filter((g) => g.chips.length > 0);
  // answers cached before sources carried a policy id: show them, but they cannot be opened
  const untagged = sources.filter((s) => !s.policy_id || !selected.some((p) => p.id === s.policy_id));

  const chip = (s: Source, policyId: string | null, key: string) => (
    <button key={key} type="button" title={s.snippet} disabled={!policyId || !s.page_number}
      onClick={() => policyId && onCite(policyId, s)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted transition-colors hover:border-gold/60 hover:bg-gold/10 hover:text-gold-bright disabled:cursor-default disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-muted">
      <Link2 size={11} className="shrink-0" aria-hidden />
      <span className="truncate">{s.section && s.section !== 'Unknown' ? `${s.section.slice(0, 32)} · ` : ''}{s.page_number ? `p.${s.page_number}` : 'page n/a'}</span>
    </button>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {groups.map(({ policy, chips }) => (
        <div key={policy.id}>
          <p className="mb-1.5 truncate text-[12px] text-cream/80">{policy.name}</p>
          <div className="flex flex-wrap gap-2">{chips.map((s, i) => chip(s, policy.id, `${policy.id}-${i}`))}</div>
        </div>
      ))}
      {untagged.length > 0 && <div className="flex flex-wrap gap-2">{untagged.map((s, i) => chip(s, null, `u-${i}`))}</div>}
    </div>
  );
}

export default function ComparePanel({
  selected, onExit, onCite,
}: { selected: Policy[]; onExit: () => void; onCite: (policyId: string, s: Source) => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ q: string; text: string; sources: Source[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enough = selected.length >= 2 && selected.length <= 5;

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || loading || !enough) return;
    setLoading(true); setError(''); setAnswer(null);
    try {
      const data = await fetchApi<{ answer: string; sources: Source[] }>('/query/multi', {
        method: 'POST', body: { question: q, policy_ids: selected.map((p) => p.id) }, timeout: 90_000, retry: 1,
      });
      setAnswer({ q, text: data.answer, sources: data.sources || [] });
      setQuestion('');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold">Compare</p>
            <h3 className="mt-1 font-display text-2xl text-cream">{selected.length} {selected.length === 1 ? 'policy' : 'policies'} selected</h3>
          </div>
          <button onClick={onExit} className="chip">Done</button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((p) => <li key={p.id} className="max-w-full truncate rounded-full border border-line px-2.5 py-1 text-[12px] text-cream/80">{p.name}</li>)}
        </ul>
        {!enough && <p className="mt-4 text-[13.5px] text-muted">Select at least two ready policies in the list on the left.</p>}

        {loading && <div className="mt-6 space-y-2" aria-label="Comparing"><div className="h-3 rounded shimmer" /><div className="h-3 w-5/6 rounded shimmer" /><div className="h-3 w-2/3 rounded shimmer" /></div>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger-ink">{error}</p>}
        {answer && (
          <div className="mt-6">
            <p className="text-[13px] text-muted">Q · {answer.q}</p>
            <div className="mt-2 rounded-2xl border border-line bg-inset p-4 text-[14px] leading-relaxed text-cream/90"><Markdown text={answer.text} /></div>
            {answer.sources.length > 0 && <CompareSources sources={answer.sources} selected={selected} onCite={onCite} />}
          </div>
        )}
        {!answer && !loading && enough && (
          <div className="mt-6 rounded-2xl border border-line p-4 text-[13.5px] text-muted">
            <Scale size={18} className="mb-2 text-gold" aria-hidden />
            Ask one question across all selected policies, e.g. “Which has the shorter waiting period for pre-existing diseases?”
          </div>
        )}
      </div>
      <form onSubmit={ask} className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-inset p-2 focus-within:border-gold/60">
          <label htmlFor="compare-q" className="sr-only">Compare question</label>
          <input id="compare-q" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!enough}
            placeholder={enough ? 'Ask across the selected policies…' : 'Select 2–5 policies first'}
            className="min-h-[40px] flex-1 bg-transparent px-2 text-[14px] text-cream outline-none placeholder:text-muted/60 disabled:opacity-50" />
          <button type="submit" disabled={!question.trim() || loading || !enough} aria-label="Compare" className="btn-gold !h-10 !w-10 shrink-0 !p-0"><ArrowUp size={17} /></button>
        </div>
      </form>
    </div>
  );
}
