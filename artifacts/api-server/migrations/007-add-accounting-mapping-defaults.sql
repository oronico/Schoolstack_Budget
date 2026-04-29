-- Per-(user, provider, realm) saved account mapping default. See
-- lib/db/src/schema/accounting-mapping-defaults.ts for the canonical column
-- docs.
--
-- Persisting the mapping at this scope (rather than per model) lets us
-- offer "Reuse last mapping" when a founder connects the same QuickBooks /
-- Xero company file to a second what-if model. Editing the reused mapping
-- updates this default but leaves the source model's stored mapping alone.
CREATE TABLE IF NOT EXISTS accounting_mapping_defaults (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  realm_id TEXT NOT NULL,
  realm_display_name TEXT,
  account_mappings_json JSONB NOT NULL,
  source_model_id INTEGER REFERENCES financial_models(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounting_mapping_defaults_user_provider_realm_unq
  ON accounting_mapping_defaults (user_id, provider, realm_id);
