-- 007: hardening
-- Run in the Supabase SQL editor after 001–006.

-- Brute-force protection for password reset codes (codes are now stored as keyed hashes)
ALTER TABLE password_reset_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS idx_reset_codes_code;
CREATE INDEX IF NOT EXISTS idx_reset_codes_email_created ON password_reset_codes(email, created_at DESC);

-- Ownership check in the Node API filters on user_id/policy_id, summaries on policy_id
CREATE INDEX IF NOT EXISTS idx_policies_user_policy ON policies(user_id, policy_id);

-- Lock the tables down. The Node/Python services use the service_role key (bypasses RLS),
-- so enabling RLS with no policies blocks any access made with the public anon key.
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_summaries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_codes  ENABLE ROW LEVEL SECURITY;

-- Failed-state support
ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check CHECK (status IN ('processing','ready','failed'));
