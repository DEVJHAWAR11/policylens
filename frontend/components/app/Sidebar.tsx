'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckSquare, CloudUpload, FileText, LogOut, RotateCw, Scale, Square, Trash2, X } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import type { Policy } from '@/lib/types';
import type { UploadState } from './usePolicies';

const STUCK_MS = 15 * 60 * 1000;

function Ring({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  const c = 2 * Math.PI * 15;
  return (
    <svg viewBox="0 0 36 36" className={`h-9 w-9 -rotate-90 ${indeterminate ? 'animate-spin' : ''}`} aria-hidden>
      <circle cx="18" cy="18" r="15" stroke="rgba(217,174,107,0.18)" strokeWidth="3" fill="none" />
      <circle cx="18" cy="18" r="15" stroke="#d9ae6b" strokeWidth="3" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={indeterminate ? c * 0.7 : c * (1 - Math.min(100, Math.max(2, value)) / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
    </svg>
  );
}

function Dropzone({ upload, onFile, onDismiss }: { upload: UploadState | null; onFile: (f: File) => void; onDismiss: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);
  const active = upload && upload.phase !== 'failed';

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setDrag(true); }}
      onDragLeave={() => { if (--depth.current <= 0) setDrag(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !active) onFile(f); }}
      className={`relative overflow-hidden rounded-2xl border border-dashed p-4 transition-colors ${drag ? 'border-gold bg-gold/10' : 'border-gold/35 bg-black/20'}`}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      {active ? (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div className="relative grid place-items-center">
            <Ring value={upload.progress} indeterminate={upload.phase === 'uploading'} />
            {upload.phase === 'processing' && <span className="absolute font-mono text-[9px] text-gold-bright">{Math.round(upload.progress)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-cream">{upload.name}</p>
            <p className="truncate text-[11.5px] text-muted">{upload.phase === 'uploading' ? 'Uploading…' : upload.message || 'Processing'}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full w-full shimmer" /></div>
          </div>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} className="flex w-full items-center gap-3 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/40 text-gold"><CloudUpload size={17} aria-hidden /></span>
          <span>
            <span className="block text-[13.5px] font-medium text-cream">Upload a policy</span>
            <span className="block text-[11.5px] text-muted">Drop a PDF here · max 25 MB</span>
          </span>
        </button>
      )}
      {upload?.phase === 'failed' && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-2.5 text-[12px] text-[#f3c3b2]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span className="flex-1">{upload.message}</span>
          <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-white/10"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}

function StatusLine({ p, now }: { p: Policy; now: number }) {
  if (p.status === 'ready') return <span className="text-ok/90">Ready</span>;
  if (p.status === 'failed') return <span className="text-danger">Failed{p.message ? ` · ${p.message}` : ''}</span>;
  const stuck = now > 0 && now - new Date(p.createdAt).getTime() > STUCK_MS && (p.progress || 0) === 0;
  if (stuck) return <span className="text-gold">Taking longer than usual — delete and re-upload if it doesn’t start</span>;
  return <span className="text-gold">{p.status === 'queued' ? 'In queue…' : `Processing ${Math.round(p.progress || 0)}%`}</span>;
}

export default function Sidebar({
  policies, loading, error, onReload, activeId, onSelect, upload, onUpload, onDismissUpload, onRetry, onDelete,
  compareMode, onToggleCompare, compareIds, onToggleCompareId, userName, onSignOut,
}: {
  policies: Policy[]; loading: boolean; error: string; onReload: () => void; activeId: string | null; onSelect: (p: Policy) => void;
  upload: UploadState | null; onUpload: (f: File) => void; onDismissUpload: () => void;
  onRetry: (p: Policy) => void; onDelete: (p: Policy) => void;
  compareMode: boolean; onToggleCompare: () => void; compareIds: string[]; onToggleCompareId: (id: string) => void;
  userName: string; onSignOut: () => void;
}) {
  const readyCount = policies.filter((p) => p.status === 'ready').length;
  const [now, setNow] = useState(0); // clock for the "taking longer than usual" hint
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label="Your documents">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Link href="/" aria-label="PolicyLens home"><Logo /></Link>
      </div>
      <div className="px-4"><Dropzone upload={upload} onFile={onUpload} onDismiss={onDismissUpload} /></div>

      <div className="mt-5 flex items-center justify-between px-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Documents {policies.length > 0 && `· ${policies.length}`}</h2>
        <button
          onClick={onToggleCompare}
          disabled={readyCount < 2}
          aria-pressed={compareMode}
          title={readyCount < 2 ? 'Needs two processed policies' : 'Select policies to compare'}
          className={`chip !py-1 disabled:opacity-40 ${compareMode ? '!border-gold !text-gold-bright bg-gold/10' : ''}`}
        >
          <Scale size={12} aria-hidden /> Compare
        </button>
      </div>
      <AnimatePresence>
        {compareMode && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-4 pt-2 text-[12px] text-muted">
            Select 2–5 ready policies · {compareIds.length} selected
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {loading && (
          <ul className="space-y-2 px-2" aria-label="Loading documents">
            {[0, 1, 2, 3].map((i) => <li key={i} className="h-14 rounded-xl shimmer" />)}
          </ul>
        )}
        {!loading && error && (
          <div role="alert" className="mx-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-[#f3c3b2]">
            {error}
            <button onClick={onReload} className="mt-2 flex items-center gap-1.5 text-gold hover:text-gold-bright"><RotateCw size={13} aria-hidden /> Retry</button>
          </div>
        )}
        {!loading && !error && policies.length === 0 && (
          <div className="mx-2 rounded-2xl border border-line p-5 text-center">
            <FileText size={28} strokeWidth={1} className="mx-auto text-gold/60" aria-hidden />
            <p className="mt-3 font-display text-lg text-cream">No policies yet</p>
            <p className="mt-1 text-[12.5px] text-muted">Upload your first PDF above to start asking questions.</p>
          </div>
        )}
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {policies.map((p) => {
              const active = p.id === activeId;
              const checked = compareIds.includes(p.id);
              const selectable = compareMode && p.status === 'ready';
              return (
                <motion.li key={p.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <div className={`group relative flex items-start gap-2 rounded-xl px-2.5 py-2.5 transition-colors ${active && !compareMode ? 'bg-gold/10' : 'hover:bg-white/[0.04]'}`}>
                    {active && !compareMode && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold" aria-hidden />}
                    <button
                      onClick={() => (selectable ? onToggleCompareId(p.id) : onSelect(p))}
                      aria-current={active && !compareMode ? 'true' : undefined}
                      aria-pressed={compareMode ? checked : undefined}
                      disabled={compareMode && !selectable}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:opacity-40"
                    >
                      {compareMode
                        ? (checked ? <CheckSquare size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden /> : <Square size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />)
                        : <FileText size={16} className={`mt-0.5 shrink-0 ${p.status === 'ready' ? 'text-gold' : 'text-muted'}`} aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-cream">{p.name}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug"><StatusLine p={p} now={now} /></span>
                        {(p.status === 'processing' || p.status === 'queued') && (
                          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/5">
                            <span className="block h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${Math.max(4, p.progress || 0)}%` }} />
                          </span>
                        )}
                      </span>
                    </button>
                    {!compareMode && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                        {p.status === 'failed' && (
                          <button onClick={() => onRetry(p)} aria-label={`Retry processing ${p.name}`} className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-gold-bright"><RotateCw size={14} /></button>
                        )}
                        <button onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`} className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-danger"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line font-display text-[15px] text-gold">{(userName || '?').charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-cream">{userName || 'Signed in'}</span>
        <button onClick={onSignOut} aria-label="Sign out" className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-cream"><LogOut size={15} /></button>
      </div>
    </aside>
  );
}
