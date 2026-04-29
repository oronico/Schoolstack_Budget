-- Baseline migration that mirrors the live Drizzle schema. It is intentionally
-- idempotent so it is safe to run against:
--   * fresh local databases (creates everything from scratch), and
--   * existing production databases that were originally provisioned with
--     `drizzle-kit push` and topped up by the legacy `runMigrations()` block
--     in api-server. Those databases already have most of these objects, so
--     IF NOT EXISTS / DO blocks turn the migration into safe no-ops.
--
-- Going forward, schema changes should be made by editing files under
-- lib/db/src/schema/*.ts and running `pnpm --filter @workspace/db generate`,
-- which appends a new migration. The api-server applies pending migrations on
-- boot via drizzle-orm's migrator.

CREATE TABLE IF NOT EXISTS "users" (
"id" serial PRIMARY KEY NOT NULL,
"email" varchar(255) NOT NULL,
"name" varchar(255) NOT NULL,
"password_hash" text NOT NULL,
"role" varchar(50) DEFAULT 'user' NOT NULL,
"token_version" integer DEFAULT 0 NOT NULL,
"reset_token" varchar(255),
"reset_token_expiry" timestamp,
"guidance_level" varchar(20),
"school_name" text,
"profile_role" text,
"planning_stage" text,
"mailing_list_opt_in" boolean DEFAULT false NOT NULL,
"terms_accepted_at" timestamp,
"last_seen_at" timestamp,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schools" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer NOT NULL,
"name" varchar(255) NOT NULL,
"state" varchar(100),
"school_type" varchar(50),
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_models" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer NOT NULL,
"school_id" integer,
"name" text NOT NULL,
"status" varchar(20) DEFAULT 'draft' NOT NULL,
"current_step" integer DEFAULT 0,
"data" jsonb DEFAULT '{}'::jsonb,
"school_stage" varchar(30),
"funding_profile" varchar(30),
"prior_year_snapshot_json" jsonb,
"staffing_rows_json" jsonb,
"revenue_rows_json" jsonb,
"expense_rows_json" jsonb,
"capital_and_debt_rows_json" jsonb,
"last_exported_at" timestamp,
"consultant_summary_json" jsonb,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exports" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer NOT NULL,
"model_id" integer NOT NULL,
"format" varchar(20) DEFAULT 'xlsx' NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer,
"event_name" varchar(100) NOT NULL,
"metadata" jsonb,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_hits" (
"id" serial PRIMARY KEY NOT NULL,
"ip" varchar(255) NOT NULL,
"endpoint" varchar(255) NOT NULL,
"hit_count" integer DEFAULT 0 NOT NULL,
"window_start" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
"id" serial PRIMARY KEY NOT NULL,
"category" varchar(50) NOT NULL,
"message" text NOT NULL,
"score" integer,
"page_url" text,
"user_id" integer,
"email" varchar(255),
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_logs" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" text,
"error_message" text NOT NULL,
"error_stack" text,
"route" text,
"request_body" jsonb,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_links" (
"id" serial PRIMARY KEY NOT NULL,
"model_id" integer NOT NULL,
"token" varchar(64) NOT NULL,
"viewer_label" text,
"created_at" timestamp DEFAULT now() NOT NULL,
"revoked_at" timestamp,
CONSTRAINT "shared_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
-- Backfill any columns that may be missing on databases provisioned before the
-- corresponding schema additions landed (the legacy ad-hoc runMigrations()
-- block did the same thing on every boot).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(50) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "guidance_level" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "planning_stage" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mailing_list_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "school_id" integer;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "school_stage" varchar(30);--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "funding_profile" varchar(30);--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "prior_year_snapshot_json" jsonb;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "staffing_rows_json" jsonb;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "revenue_rows_json" jsonb;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "expense_rows_json" jsonb;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "capital_and_debt_rows_json" jsonb;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "last_exported_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "consultant_summary_json" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "score" integer;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_user_id_users_id_fk') THEN
    ALTER TABLE "schools" ADD CONSTRAINT "schools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_models_user_id_users_id_fk') THEN
    ALTER TABLE "financial_models" ADD CONSTRAINT "financial_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_models_school_id_schools_id_fk') THEN
    ALTER TABLE "financial_models" ADD CONSTRAINT "financial_models_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exports_user_id_users_id_fk') THEN
    ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exports_model_id_financial_models_id_fk') THEN
    ALTER TABLE "exports" ADD CONSTRAINT "exports_model_id_financial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."financial_models"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_user_id_users_id_fk') THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_user_id_users_id_fk') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_links_model_id_financial_models_id_fk') THEN
    ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_model_id_financial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."financial_models"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schools_user_id_idx" ON "schools" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_models_user_id_idx" ON "financial_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_user_id_idx" ON "exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_model_id_idx" ON "exports" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_event_name_idx" ON "events" USING btree ("event_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_ip_endpoint_idx" ON "rate_limit_hits" USING btree ("ip","endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_links_model_id_idx" ON "shared_links" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_links_token_idx" ON "shared_links" USING btree ("token");--> statement-breakpoint
-- Drop legacy tables that are no longer part of the schema. Both the live
-- accounting integration (Task #233) and the stale `rate_limits` table from
-- the original baseline have been replaced.
DROP TABLE IF EXISTS "accounting_mapping_defaults";--> statement-breakpoint
DROP TABLE IF EXISTS "accounting_connections";--> statement-breakpoint
DROP TABLE IF EXISTS "rate_limits";
