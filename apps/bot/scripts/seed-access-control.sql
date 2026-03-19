-- seed-access-control.sql -- tabele: kontrola dostepu kanalow + audit trail

-- Poziom dostepu kanalu: 'open' (publiczny) lub 'restricted' (membership check)
CREATE TABLE IF NOT EXISTS channel_access_levels (
  channel_id TEXT PRIMARY KEY,
  access_level TEXT NOT NULL DEFAULT 'restricted',  -- 'open' | 'restricted'
  label TEXT,                                        -- 'leadership' | 'growth' | 'general'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail -- log kazdego uzycia narzedzia przez Iwana
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB,
  result_status TEXT NOT NULL,  -- 'success' | 'denied' | 'error'
  result_summary TEXT,
  duration_ms INTEGER,
  thread_ts TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_channel ON audit_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_logs(tool_name);
