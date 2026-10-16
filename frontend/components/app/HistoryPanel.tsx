'use client';

import { useEffect, useState } from 'react';
import { History, RotateCw, Search } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import type { HistoryRow, Policy } from '@/lib/types';

// Searchable history across all policies (GET /history?q=).
export default function HistoryPanel({ policies, onOpen }: { policies: Policy[]; onOpen: (policyId: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const names = new Map(policies.map((p) => [p.id, p.name]));

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setState('loading');
      try {
        const res = await fetchApi<{ data: HistoryRow[] }>(`/history?limit=30${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`, { signal: controller.signal });
        setRows(res.data); setState('ready');
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    }, q ? 300 : 0);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, attempt]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 focus-within:border-gold/60">
          <Search size={14} className="text-muted" aria-hidden />
          <span className="sr-only">Search history</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers" className="h-10 flex-1 bg-transparent text-[13.5px] text-cream outline-none placeholder:text-muted/60" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        {state === 'loading' && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>}
        {state === 'error' && (
          <p role="alert" className="p-2 text-[13px] text-muted">Couldn’t load history.
            <button onClick={() => setAttempt((a) => a + 1)} className="ml-2 inline-flex items-center gap-1 text-gold"><RotateCw size={12} aria-hidden /> Retry</button></p>
        )}
        {state === 'ready' && rows.length === 0 && (
          <div className="p-6 text-center text-[13.5px] text-muted"><History size={24} strokeWidth={1.2} className="mx-auto mb-2 text-gold/60" aria-hidden />{q ? 'Nothing matches that search.' : 'Your questions will appear here.'}</div>
        )}
        {state === 'ready' && (
          <ul className="space-y-2">
            {rows.map((r) => {
              const single = !r.policy_id?.includes(',');
              return (
                <li key={r.id}>
                  <button onClick={() => single && onOpen(r.policy_id)} disabled={!single} className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-gold/40 hover:bg-gold/5 disabled:hover:border-line disabled:hover:bg-transparent">
                    <p className="line-clamp-2 text-[13.5px] text-cream">{r.question}</p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{r.answer}</p>
                    <p className="mt-1.5 truncate font-mono text-[10.5px] text-gold/80">
                      {single ? names.get(r.policy_id) || 'Deleted policy' : 'Comparison'} · {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
