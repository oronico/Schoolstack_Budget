-- Task #479 — add monotonic `version` column for mandatory optimistic
-- concurrency on PUT /api/models/:id. Uses IF NOT EXISTS so reapplying
-- against a DB that already has the column (e.g. via `drizzle-kit push`)
-- is a no-op, matching the pattern used by 0001 and 0002.
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
