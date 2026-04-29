-- Live accounting integration: per-model QuickBooks / Xero connection. See
-- lib/db/src/schema/accounting-connections.ts for the canonical column docs.
CREATE TABLE IF NOT EXISTS accounting_connections (
  id SERIAL PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'connected',
  realm_id TEXT,
  realm_display_name TEXT,
  -- AES-256-GCM ciphertext (base64). Plaintext OAuth secrets must NEVER be
  -- written here — see artifacts/api-server/src/lib/accounting/crypto.ts.
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP,
  last_synced_at TIMESTAMP,
  last_sync_error TEXT,
  -- Cached actuals snapshot consumed by the actuals editor's "Suggest from
  -- latest data" affordance.
  snapshot_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounting_connections_model_provider_unq
  ON accounting_connections (model_id, provider);
