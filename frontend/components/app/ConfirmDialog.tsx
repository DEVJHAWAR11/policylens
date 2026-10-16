'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function ConfirmDialog({
  open, title, body, confirmLabel, busy, error, onConfirm, onCancel,
}: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string; busy?: boolean; error?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
          <motion.div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body"
            initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="glass w-full max-w-md rounded-3xl p-6">
            <h2 id="confirm-title" className="font-display text-2xl text-cream">{title}</h2>
            <div id="confirm-body" className="mt-2 text-[14.5px] leading-relaxed text-muted">{body}</div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-[#f3c3b2]">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelRef} onClick={onCancel} disabled={busy} className="btn-ghost !py-2.5 text-sm">Cancel</button>
              <button onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-danger px-5 py-2.5 text-sm font-semibold text-[#1a0d08] transition hover:brightness-110 disabled:opacity-60">
                {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />}{confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
