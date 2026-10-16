-- Password reset codes for the forgot-password flow
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reset_codes_email ON password_reset_codes(email);
CREATE INDEX idx_reset_codes_code  ON password_reset_codes(code);
