'use client';

import { useCallback, useRef, useState } from 'react';
import { fetchApi, streamApi, StreamInterruptedError, ApiError } from '@/lib/api';
import type { ChatMessage, HistoryRow, Source } from '@/lib/types';

const uid = () => crypto.randomUUID();

// One thread per policy. Answers stream token by token; once complete, the sources
// (section, page, clause text) are fetched from /query/sources, which reads the answer
// cache the stream just filled — no second LLM call.
export function useChat() {
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [busy, setBusy] = useState<string | null>(null); // policy id currently answering
  const [historyLoaded, setHistoryLoaded] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback((pid: string, id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setThreads((t) => ({ ...t, [pid]: (t[pid] ?? []).map((m) => (m.id === id ? fn(m) : m)) }));
  }, []);
  const push = useCallback((pid: string, ...msgs: ChatMessage[]) => {
    setThreads((t) => ({ ...t, [pid]: [...(t[pid] ?? []), ...msgs] }));
  }, []);

  // Earlier questions for this policy (newest 20), shown oldest → newest.
  const loadHistory = useCallback(async (pid: string) => {
    setHistoryLoaded((h) => (h[pid] ? h : { ...h, [pid]: 'loading' }));
    try {
      const res = await fetchApi<{ data: HistoryRow[] }>(`/history?policy_id=${encodeURIComponent(pid)}&limit=20`);
      const msgs: ChatMessage[] = [];
      [...res.data].reverse().forEach((r) => {
        msgs.push({ id: `${r.id}-q`, role: 'user', text: r.question });
        const sources = Array.isArray(r.sources) ? r.sources : [];
        msgs.push({ id: `${r.id}-a`, role: 'assistant', text: r.answer, sources, sourcesState: sources.length ? 'ready' : 'none' });
      });
      setThreads((t) => ({ ...t, [pid]: [...msgs, ...(t[pid] ?? [])] }));
      setHistoryLoaded((h) => ({ ...h, [pid]: 'done' }));
    } catch {
      setHistoryLoaded((h) => ({ ...h, [pid]: 'error' }));
    }
  }, []);

  const ensureHistory = useCallback((pid: string) => {
    if (!historyLoaded[pid]) void loadHistory(pid);
  }, [historyLoaded, loadHistory]);

  const ask = useCallback(async (pid: string, question: string): Promise<{ restore?: string }> => {
    const q = question.trim();
    if (!q || busy) return {};
    const aiId = uid();
    push(pid, { id: uid(), role: 'user', text: q }, { id: aiId, role: 'assistant', text: '', streaming: true });
    setBusy(pid);
    const controller = new AbortController();
    abortRef.current = controller;
    let got = false;
    try {
      await streamApi('/query/stream', { method: 'POST', body: { question: q, policy_id: pid }, signal: controller.signal }, (tok) => {
        got = true;
        patch(pid, aiId, (m) => ({ ...m, text: m.text + tok }));
      });
      patch(pid, aiId, (m) => ({ ...m, streaming: false, sourcesState: 'loading' }));
      setBusy(null);
      try {
        const res = await fetchApi<{ sources: Source[] }>('/query/sources', { method: 'POST', body: { question: q, policy_id: pid }, timeout: 60_000 });
        patch(pid, aiId, (m) => ({ ...m, sources: res.sources, sourcesState: res.sources.length ? 'ready' : 'none' }));
      } catch {
        patch(pid, aiId, (m) => ({ ...m, sourcesState: 'none' }));
      }
      return {};
    } catch (err) {
      setBusy(null);
      if (controller.signal.aborted) {
        patch(pid, aiId, (m) => ({ ...m, streaming: false, text: m.text || 'Stopped.' }));
        return {};
      }
      const interrupted = err instanceof StreamInterruptedError;
      const canRetry = interrupted || (err as ApiError).retryable;
      const text = interrupted
        ? 'The connection dropped while I was answering. Your question is back in the box — press send to try again.'
        : canRetry
          ? `${(err as Error).message} Your question is back in the box — press send to try again.`
          : (err as Error).message || 'Failed to get a response.';
      setThreads((t) => {
        const list = (t[pid] ?? []).map((m) => (m.id === aiId ? { ...m, streaming: false } : m)).filter((m) => m.id !== aiId || got);
        return { ...t, [pid]: [...list, { id: uid(), role: 'assistant', text, error: true }] };
      });
      return canRetry ? { restore: q } : {};
    } finally {
      abortRef.current = null;
    }
  }, [busy, patch, push]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { threads, busy, ask, stop, ensureHistory, historyState: historyLoaded };
}
