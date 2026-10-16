'use client';

import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import type { Policy, PolicySummary } from '@/lib/types';

const FIELDS: [keyof PolicySummary, string][] = [
  ['death_benefit', 'Death benefit'],
  ['survival_benefit', 'Survival / maturity benefit'],
  ['surrender_value', 'Surrender value'],
  ['loan_facility', 'Loan facility'],
  ['free_look_period', 'Free-look period'],
  ['tax_benefit', 'Tax benefit'],
];
const LISTS: [keyof PolicySummary, string][] = [
  ['key_benefits', 'Key benefits'],
  ['exclusions', 'Exclusions'],
  ['important_conditions', 'Important conditions'],
];

const cache = new Map<string, PolicySummary>();

export default function SummaryPanel({ policy }: { policy: Policy | null }) {
  const id = policy?.id;
  const ready = policy?.status === 'ready';
  const [summary, setSummary] = useState<PolicySummary | null>(null);
  const [state, setState] = useState<'loading' | 'pending' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id || !ready) return;
    const hit = cache.get(id);
    if (hit) { setSummary(hit); setState('ready'); return; } // eslint-disable-line react-hooks/set-state-in-effect -- cached
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    setSummary(null); setState('loading');
    const load = async () => {
      try {
        const data = await fetchApi<{ summary: PolicySummary }>(`/policies/${id}/summary`);
        if (cancelled) return;
        cache.set(id, data.summary);
        setSummary(data.summary); setState('ready');
      } catch (err) {
        if (cancelled) return;
        // 404 = summary is still being generated right after processing; poll for ~2 minutes
        if ((err as { status?: number }).status === 404 && ++tries < 20) { setState('pending'); timer = setTimeout(load, 6000); }
        else setState('error');
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, ready, attempt]);

  if (!policy) return null;
  if (!ready) return <p className="p-5 text-[13.5px] text-muted">The summary appears once processing finishes.</p>;
  if (state === 'loading' || state === 'pending') {
    return (
      <div className="space-y-4 p-5" aria-label="Loading summary">
        {state === 'pending' && <p className="text-[13px] text-gold">Writing the summary — this takes up to a minute after processing.</p>}
        <div className="h-7 w-2/3 rounded shimmer" />
        {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl shimmer" />)}
      </div>
    );
  }
  if (state === 'error' || !summary) {
    return (
      <div className="p-5 text-[13.5px] text-muted">
        No summary is available for this policy yet.
        <button onClick={() => setAttempt((a) => a + 1)} className="mt-3 flex items-center gap-1.5 text-gold hover:text-gold-bright"><RotateCw size={13} aria-hidden /> Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-y-auto p-5 scrollbar-thin">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold">{[summary.policy_type, summary.uin].filter(Boolean).join(' · ')}</p>
        <h3 className="mt-1 font-display text-2xl leading-tight text-cream">{summary.policy_name || policy.name}</h3>
        {summary.insurer && <p className="mt-0.5 text-[13px] text-muted">{summary.insurer}</p>}
      </div>
      {LISTS.map(([key, label]) => {
        const items = summary[key];
        if (!Array.isArray(items) || !items.length) return null;
        return (
          <section key={key} className="rounded-2xl border border-line bg-black/20 p-4">
            <h4 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold">{label}</h4>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-cream/85">
              {items.map((it, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />{String(it)}</li>)}
            </ul>
          </section>
        );
      })}
      {FIELDS.map(([key, label]) => {
        const v = summary[key];
        if (!v || typeof v !== 'string') return null;
        return (
          <section key={key}>
            <h4 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold">{label}</h4>
            <p className="mt-1 text-[13.5px] leading-relaxed text-cream/85">{v}</p>
          </section>
        );
      })}
      <p className="text-[11.5px] text-muted/70">AI-generated summary. Check important details against the document.</p>
    </div>
  );
}
