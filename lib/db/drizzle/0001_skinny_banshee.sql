-- Add founder persona columns introduced in Task #302. The
-- `lender_language_enabled` ALTER below restates a column already added in the
-- 0000_baseline migration; we use IF NOT EXISTS so reapplying the migration
-- against either a fresh DB (where everything in baseline ran) or an existing
-- production DB (where the column was added long ago) is a no-op.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "persona_stage" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "persona_comfort" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lender_language_enabled" boolean DEFAULT false NOT NULL;
