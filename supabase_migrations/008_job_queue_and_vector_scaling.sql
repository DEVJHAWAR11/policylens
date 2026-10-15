-- 008: durable ingest job queue + scalable, exact per-policy vector search
-- Run in the Supabase SQL editor after 001–007.

-- ------------------------------------------------------------------
-- 1. policies table doubles as the ingest job queue (no Redis needed for durability)
--    status: queued -> processing -> ready | failed
-- ------------------------------------------------------------------
ALTER TABLE policies ADD COLUMN IF NOT EXISTS progress    INT         NOT NULL DEFAULT 0;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS message     TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS attempts    INT         NOT NULL DEFAULT 0;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS locked_at   TIMESTAMPTZ;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS error       TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS upload_key  TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- signed URLs are now generated on demand (short-lived) instead of stored for a year
ALTER TABLE policies ALTER COLUMN storage_url DROP NOT NULL;

ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check
  CHECK (status IN ('queued','processing','ready','failed'));

-- Idempotent uploads: the same client-generated key can't create two policies for a user
CREATE UNIQUE INDEX IF NOT EXISTS uq_policies_user_upload_key
  ON policies(user_id, upload_key) WHERE upload_key IS NOT NULL;

-- Workers only ever scan the small set of unfinished jobs
CREATE INDEX IF NOT EXISTS idx_policies_queue
  ON policies(status, created_at) WHERE status IN ('queued','processing');

-- Atomically claim one job. FOR UPDATE SKIP LOCKED lets any number of workers run
-- in parallel without ever picking the same job. Jobs whose worker died (stale lock)
-- are re-claimed, up to p_max_attempts times, then marked failed.
CREATE OR REPLACE FUNCTION claim_ingest_job(
  p_stale_after  interval DEFAULT '10 minutes',
  p_max_attempts int      DEFAULT 3
)
RETURNS TABLE (job_policy_id text, job_storage_path text, job_attempts int)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE policies
     SET status = 'failed',
         message = 'Processing failed after several attempts',
         locked_at = NULL,
         updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - p_stale_after
     AND attempts >= p_max_attempts;

  RETURN QUERY
  WITH next AS (
    SELECT p.id
      FROM policies p
     WHERE p.status = 'queued'
        OR (p.status = 'processing'
            AND p.locked_at < now() - p_stale_after
            AND p.attempts < p_max_attempts)
     ORDER BY p.created_at
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE policies p
     SET status     = 'processing',
         locked_at  = now(),
         attempts   = p.attempts + 1,
         progress   = GREATEST(p.progress, 1),
         message    = 'Starting...',
         updated_at = now()
    FROM next
   WHERE p.id = next.id
  RETURNING p.policy_id, p.storage_path, p.attempts;
END;
$$;

REVOKE ALL ON FUNCTION claim_ingest_job(interval, int) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Vector search that stays exact and fast as the table grows
--    The old function filtered on jsonb AFTER the HNSW scan, so with many users'
--    policies in one table a selective filter could return too few (or zero) rows.
--    Here the policy's rows are selected first (btree), then ranked exactly.
-- ------------------------------------------------------------------
ALTER TABLE policy_chunks
  ADD COLUMN IF NOT EXISTS policy_id TEXT GENERATED ALWAYS AS (metadata->>'policy_id') STORED;

CREATE INDEX IF NOT EXISTS idx_policy_chunks_policy_id ON policy_chunks(policy_id);

CREATE OR REPLACE FUNCTION match_policy_chunks_v2(
  query_embedding vector(768),
  p_policy_id     text,
  match_count     int DEFAULT 8
)
RETURNS TABLE (id bigint, content text, metadata jsonb, similarity float)
LANGUAGE sql STABLE
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT pc.id, pc.content, pc.metadata, pc.embedding
      FROM policy_chunks pc
     WHERE pc.policy_id = p_policy_id
  )
  SELECT s.id, s.content, s.metadata,
         (1 - (s.embedding <=> query_embedding))::float AS similarity
    FROM scoped s
   ORDER BY s.embedding <=> query_embedding
   LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_policy_chunks_v2(vector, text, int) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- 3. Misc indexes / columns
-- ------------------------------------------------------------------
-- Multi-policy chat: remember which policies a question covered
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS policy_ids JSONB;
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_policy_created
  ON chat_history(user_id, policy_id, created_at DESC);
