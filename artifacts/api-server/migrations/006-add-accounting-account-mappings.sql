-- Account-mapping support for live accounting connections. See
-- lib/db/src/schema/accounting-connections.ts for the canonical column docs.
--
-- `discovered_accounts_json` caches per-account amounts from the latest P&L so
-- the founder-facing mapping UI can render and re-classify accounts without
-- re-hitting the provider. `account_mappings_json` stores founder overrides
-- keyed by lowercased account name; an empty map is equivalent to the
-- pre-mapping heuristic behaviour.
ALTER TABLE accounting_connections
  ADD COLUMN IF NOT EXISTS discovered_accounts_json JSONB,
  ADD COLUMN IF NOT EXISTS account_mappings_json JSONB;
