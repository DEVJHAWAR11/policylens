CREATE TABLE policies (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  policy_id    TEXT UNIQUE NOT NULL,       -- same policy_id used in Python RAG
  filename     TEXT NOT NULL,              -- original PDF filename
  storage_path TEXT NOT NULL,              -- path in Supabase Storage bucket
  storage_url  TEXT NOT NULL,              -- public/signed URL
  status       TEXT DEFAULT 'processing',  -- processing | ready | failed
  chunk_count  INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_policies_user_id  ON policies(user_id);
CREATE INDEX idx_policies_policy_id ON policies(policy_id);
