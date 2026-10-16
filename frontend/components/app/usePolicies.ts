'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchApi } from '@/lib/api';
import { pollPolicyStatus } from '@/lib/policyStatus';
import type { Policy, PolicyRow, PolicyStatus } from '@/lib/types';

const MAX_BYTES = 25 * 1024 * 1024;

export interface UploadState {
  name: string;
  phase: 'uploading' | 'processing' | 'failed';
  progress: number;
  message?: string;
  policyId?: string;
}

const toPolicy = (r: PolicyRow): Policy => ({
  id: r.policy_id,
  name: r.policy_name || r.filename || 'Untitled policy',
  createdAt: r.created_at,
  status: r.status,
  progress: r.progress ?? 0,
  message: r.message,
});

export function validatePdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Only PDF files are supported.';
  if (file.size > MAX_BYTES) return 'That file is larger than 25 MB.';
  return null;
}

export function usePolicies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [upload, setUpload] = useState<UploadState | null>(null);
  const watchers = useRef(new Map<string, AbortController>());

  const apply = useCallback((id: string, st: PolicyStatus) => {
    setPolicies((ps) => ps.map((p) => (p.id === id ? { ...p, status: st.status, progress: st.progress ?? p.progress, message: st.message } : p)));
  }, []);

  // Track a policy that is still queued/processing (survives page reloads).
  const watch = useCallback((id: string) => {
    if (watchers.current.has(id)) return;
    const controller = new AbortController();
    watchers.current.set(id, controller);
    pollPolicyStatus(id, { signal: controller.signal, onProgress: (st) => apply(id, st) })
      .then((st) => apply(id, st))
      .catch(() => {})
      .finally(() => watchers.current.delete(id));
  }, [apply]);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchApi<PolicyRow[]>('/policies');
      setPolicies(rows.map(toPolicy));
      rows.filter((r) => r.status === 'queued' || r.status === 'processing').forEach((r) => watch(r.policy_id));
    } catch (err) {
      setError((err as Error).message || 'Could not load your policies.');
    } finally {
      setLoading(false);
    }
  }, [watch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const ws = watchers.current;
    return () => { ws.forEach((c) => c.abort()); ws.clear(); };
  }, [load]);

  const busy = useRef(false);
  // Returns the new policy id once it is ready, or null.
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    const invalid = validatePdf(file);
    if (invalid) { setUpload({ name: file.name, phase: 'failed', progress: 0, message: invalid }); return null; }
    if (busy.current) return null;
    busy.current = true;
    setUpload({ name: file.name, phase: 'uploading', progress: 4 });
    let pid: string | undefined;
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Same Idempotency-Key on every retry => a dropped connection can never create a duplicate policy
      const data = await fetchApi<{ policy_id: string }>('/ingest/upload', {
        method: 'POST', body: fd, retry: 2, timeout: 120_000,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      pid = data.policy_id;
      setUpload({ name: file.name, phase: 'processing', progress: 0, message: 'Waiting in queue', policyId: pid });
      watchers.current.set(pid, new AbortController()); // tracked here; stop load() from double-polling
      await load();
      const final = await pollPolicyStatus(pid, {
        onProgress: (st) => {
          apply(pid!, st);
          setUpload((u) => (u ? { ...u, progress: st.progress ?? u.progress, message: st.message } : u));
        },
      });
      apply(pid, final);
      if (final.status === 'failed') throw new Error(final.message || 'Processing failed. Please try again.');
      setUpload(null);
      return pid;
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Upload failed.';
      setUpload({ name: file.name, phase: 'failed', progress: 0, message: pid ? `Processing problem: ${msg}` : `Upload failed: ${msg}`, policyId: pid });
      return null;
    } finally {
      if (pid) watchers.current.delete(pid);
      busy.current = false;
    }
  }, [apply, load]);

  const remove = useCallback(async (id: string) => {
    await fetchApi(`/policies/${id}`, { method: 'DELETE' });
    watchers.current.get(id)?.abort();
    setPolicies((ps) => ps.filter((p) => p.id !== id));
  }, []);

  const retry = useCallback(async (id: string) => {
    await fetchApi(`/policies/${id}/retry`, { method: 'POST' });
    apply(id, { status: 'queued', progress: 0, message: 'Waiting in queue' });
    watch(id);
  }, [apply, watch]);

  return { policies, loading, error, reload: load, upload, dismissUpload: () => setUpload(null), uploadFile, remove, retry };
}
