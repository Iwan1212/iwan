-- Tabela mapowań deal → kanał Slack
CREATE TABLE IF NOT EXISTS deal_channel_mappings (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  resolved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, channel_id)
);

-- Tabela stanu digestu (ostatni run per kanał/wątek)
CREATE TABLE IF NOT EXISTS deal_digest_state (
  channel_id TEXT PRIMARY KEY,
  last_ts TEXT,
  message_hash TEXT,
  deal_id INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_deal_mappings_deal_id ON deal_channel_mappings(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_mappings_channel_id ON deal_channel_mappings(channel_id);
CREATE INDEX IF NOT EXISTS idx_deal_digest_deal_id ON deal_digest_state(deal_id);
