'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, FolderOpen, MessageSquareText } from 'lucide-react';
import type { Policy, Source } from '@/lib/types';
import { useAuth } from './AuthProvider';
import ChatPanel from './ChatPanel';
import ComparePanel from './ComparePanel';
import ConfirmDialog from './ConfirmDialog';
import HistoryPanel from './HistoryPanel';
import PdfViewer, { type PdfFocus } from './PdfViewer';
import Sidebar from './Sidebar';
import SummaryPanel from './SummaryPanel';
import { useChat } from './useChat';
import { usePolicies } from './usePolicies';

type RightTab = 'ask' | 'summary' | 'history';
type MobilePane = 'docs' | 'viewer' | 'panel';

export default function Workspace() {
  const { userName, signOut } = useAuth();
  const { policies, loading, error, reload, upload, dismissUpload, uploadFile, remove, retry } = usePolicies();
  const chat = useChat();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('ask');
  const [pane, setPane] = useState<MobilePane>('docs');
  const [focus, setFocus] = useState<PdfFocus | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const active = useMemo(() => policies.find((p) => p.id === activeId) ?? null, [policies, activeId]);
  const { ensureHistory } = chat;

  const select = useCallback((p: Policy, goTo: MobilePane = 'panel') => {
    setActiveId(p.id);
    setFocus(null);
    setTab('ask');
    setPane(goTo);
    if (p.status === 'ready') ensureHistory(p.id);
  }, [ensureHistory]);

  // open the newest ready policy on first load (desktop shows all panes anyway)
  useEffect(() => {
    if (activeId || loading) return;
    const first = policies.find((p) => p.status === 'ready');
    if (first) { setActiveId(first.id); ensureHistory(first.id); } // eslint-disable-line react-hooks/set-state-in-effect -- default selection
  }, [policies, loading, activeId, ensureHistory]);

  // a policy finishing processing while open: load its history
  useEffect(() => { if (active?.status === 'ready') ensureHistory(active.id); }, [active?.status, active?.id, ensureHistory]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const onUpload = async (f: File) => {
    const id = await uploadFile(f);
    if (id) {
      setActiveId(id);
      ensureHistory(id);
      setToast('Your policy is ready. Ask away.');
    }
  };

  const onCite = (s: Source) => {
    if (!s.page_number) return;
    setFocus({ page: s.page_number, text: s.highlight_text || s.snippet, nonce: Date.now() });
    setPane('viewer');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true); setDeleteError('');
    try {
      await remove(pendingDelete.id);
      if (pendingDelete.id === activeId) { setActiveId(null); setFocus(null); }
      setCompareIds((ids) => ids.filter((x) => x !== pendingDelete.id));
      setToast(`Deleted “${pendingDelete.name}”.`);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError((err as Error).message || 'Could not delete the policy. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const onRetry = async (p: Policy) => {
    try { await retry(p.id); setToast(`Retrying “${p.name}”…`); }
    catch (err) { setToast(`Could not retry: ${(err as Error).message}`); }
  };

  const toggleCompareId = (id: string) =>
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 5 ? ids : [...ids, id]));

  const selectedForCompare = policies.filter((p) => compareIds.includes(p.id));
  const tabs: [RightTab, string][] = [['ask', 'Ask'], ['summary', 'Summary'], ['history', 'History']];

  const rightPanel = compareMode ? (
    <ComparePanel selected={selectedForCompare} onExit={() => { setCompareMode(false); setCompareIds([]); }} />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Panel" className="flex gap-1 border-b border-line px-3 pt-2">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`relative px-3 py-2.5 text-[13px] transition-colors ${tab === key ? 'text-cream' : 'text-muted hover:text-cream'}`}>
            {label}
            {tab === key && <motion.span layoutId="ws-tab" className="absolute inset-x-2 bottom-0 h-px bg-gold" />}
          </button>
        ))}
        {active && <span className="ml-auto self-center truncate pl-2 text-[11.5px] text-muted lg:max-w-[180px]">{active.name}</span>}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1">
        {tab === 'ask' && (
          <ChatPanel policy={active} messages={active ? chat.threads[active.id] ?? [] : []} busy={chat.busy !== null}
            historyState={active ? chat.historyState[active.id] : undefined}
            onAsk={(q) => (active ? chat.ask(active.id, q) : Promise.resolve({}))} onStop={chat.stop} onCite={onCite} />
        )}
        {tab === 'summary' && <div className="h-full overflow-y-auto scrollbar-thin">{active ? <SummaryPanel key={active.id} policy={active} /> : <p className="p-5 text-[13.5px] text-muted">Select a policy to see its summary.</p>}</div>}
        {tab === 'history' && <HistoryPanel policies={policies} onOpen={(id) => { const p = policies.find((x) => x.id === id); if (p) select(p); }} />}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-bg lg:grid lg:grid-cols-[300px_minmax(0,1fr)_420px]">
      <div className={`min-h-0 flex-1 border-line lg:block lg:border-r ${pane === 'docs' ? 'block' : 'hidden'}`}>
        <Sidebar
          policies={policies} loading={loading} error={error} onReload={reload}
          activeId={activeId} onSelect={(p) => select(p)}
          upload={upload} onUpload={onUpload} onDismissUpload={dismissUpload}
          onRetry={onRetry} onDelete={(p) => { setDeleteError(''); setPendingDelete(p); }}
          compareMode={compareMode} onToggleCompare={() => { setCompareMode((v) => !v); setCompareIds([]); setPane('docs'); }}
          compareIds={compareIds} onToggleCompareId={toggleCompareId}
          userName={userName} onSignOut={signOut}
        />
      </div>
      <main className={`min-h-0 flex-1 bg-viewer lg:block ${pane === 'viewer' ? 'block' : 'hidden'}`}>
        <PdfViewer policyId={active?.status === 'ready' ? active.id : null} policyName={active?.name} focus={focus} />
      </main>
      <div className={`min-h-0 flex-1 border-line bg-raised/60 lg:block lg:border-l ${pane === 'panel' ? 'block' : 'hidden'}`}>
        {rightPanel}
      </div>

      {/* mobile pane switcher */}
      <nav aria-label="Workspace sections" className="flex border-t border-line bg-bg/95 backdrop-blur lg:hidden">
        {([['docs', 'Documents', FolderOpen], ['viewer', 'Document', FileText], ['panel', compareMode ? 'Compare' : 'Ask', MessageSquareText]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setPane(key)} aria-current={pane === key ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${pane === key ? 'text-gold-bright' : 'text-muted'}`}>
            <Icon size={18} aria-hidden />{label}
          </button>
        ))}
      </nav>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this policy?"
        body={<>“{pendingDelete?.name}” will be removed with its index, summary and chat history. This can’t be undone.</>}
        confirmLabel="Delete" busy={deleting} error={deleteError}
        onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)}
      />

      <AnimatePresence>
        {toast && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="glass fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-full px-5 py-2.5 text-[13.5px] text-cream lg:bottom-6">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
