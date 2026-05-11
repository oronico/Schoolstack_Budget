-- Task #620 — Phase 2 underwriting schema. Adds two tables that hold
-- the legal-entity / KYC fields the credit memo will need:
--   * borrower_entities — the legal entity carrying the loan (501c3,
--     LLC, etc). Stores `ein_last_4` + an opaque `ein_encrypted_ref`.
--   * founder_profiles — per-founder KYC data, kept separate from
--     `users` so authentication identity and KYC are never confused.
--     Stores `ssn_last_4` + an opaque `ssn_encrypted_ref`.
--
-- The raw EIN / SSN never lands in Postgres. Application code routes
-- the raw value through
-- `artifacts/api-server/src/lib/sensitive-encryption.ts::encryptSensitive`
-- and persists only the last-4 + opaque envelope-encrypted ref.
--
-- IF NOT EXISTS / DO blocks mirror the earlier 0001..0006 migrations
-- so reapplying against a DB first provisioned via `drizzle-kit push`
-- is a no-op rather than an error.
CREATE TABLE IF NOT EXISTS "borrower_entities" (
"id" serial PRIMARY KEY NOT NULL,
"legal_name" text NOT NULL,
"dba_name" text,
"entity_type" varchar(40) NOT NULL,
"state_of_formation" varchar(2),
"formation_date" date,
"ein_last_4" char(4),
"ein_encrypted_ref" text,
"tax_exempt_verified_at" timestamp,
"address_line1" text,
"address_line2" text,
"city" text,
"state" varchar(2),
"postal_code" varchar(20),
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "founder_profiles" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer,
"legal_first_name" text,
"legal_last_name" text,
"date_of_birth" date,
"ssn_last_4" char(4),
"ssn_encrypted_ref" text,
"kyc_status" varchar(30),
"kyc_provider_ref" text,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "founder_profiles" ADD CONSTRAINT "founder_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "borrower_entities_entity_type_idx" ON "borrower_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "borrower_entities_legal_name_idx" ON "borrower_entities" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "founder_profiles_user_id_idx" ON "founder_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "founder_profiles_kyc_status_idx" ON "founder_profiles" USING btree ("kyc_status");
