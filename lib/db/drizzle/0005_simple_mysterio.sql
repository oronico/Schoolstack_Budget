-- Task #605 — Phase 1 underwriting schema. Adds six tables that back the
-- evidence-driven loan underwriting flow (applications, documents,
-- evidence, metric snapshots, eligibility gates, audit log). Uses
-- IF NOT EXISTS on every CREATE so the migration is safe to reapply
-- against a DB that was first provisioned via `drizzle-kit push` (the
-- pattern used by the prior 0001..0004 migrations). Foreign key adds
-- are wrapped in DO blocks for the same reason: PG raises a duplicate-
-- object error if the constraint already exists, which we swallow.
--
-- No existing tables are altered. `financial_models` is referenced via
-- a nullable SET NULL FK on `underwriting_applications.financial_model_id`,
-- so existing JSONB-backed budget rows are untouched.
--
CREATE TABLE IF NOT EXISTS "underwriting_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"school_id" integer,
	"financial_model_id" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"loan_purpose" text,
	"requested_amount_cents" integer,
	"requested_term_months" integer,
	"borrower_entity_id" integer,
	"submitted_at" timestamp,
	"decisioned_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "underwriting_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"document_type" varchar(60) NOT NULL,
	"display_name" text,
	"storage_ref" text NOT NULL,
	"content_sha256" varchar(64),
	"byte_size" integer,
	"mime_type" varchar(120),
	"verification_status" varchar(30) DEFAULT 'uploaded' NOT NULL,
	"rejection_reason" text,
	"uploaded_by_user_id" integer,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "underwriting_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"document_id" integer,
	"evidence_type" varchar(60) NOT NULL,
	"claim_key" varchar(120) NOT NULL,
	"value" jsonb,
	"source_locator" text,
	"collection_method" varchar(40),
	"collected_by_user_id" integer,
	"verified_by_user_id" integer,
	"verified_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "underwriting_metrics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"snapshot_kind" varchar(30) NOT NULL,
	"source_financial_model_id" integer,
	"source_financial_model_version" integer,
	"metrics" jsonb NOT NULL,
	"notes" varchar(500),
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eligibility_gate_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"gate_code" varchar(80) NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"evaluation_details" jsonb,
	"evidence_id" integer,
	"policy_rule_version_id" integer,
	"waived_reason" text,
	"evaluated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"actor_role" varchar(50),
	"entity_type" varchar(60) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(30) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_applications" ADD CONSTRAINT "underwriting_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_applications" ADD CONSTRAINT "underwriting_applications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_applications" ADD CONSTRAINT "underwriting_applications_financial_model_id_financial_models_id_fk" FOREIGN KEY ("financial_model_id") REFERENCES "public"."financial_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_documents" ADD CONSTRAINT "underwriting_documents_application_id_underwriting_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."underwriting_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_documents" ADD CONSTRAINT "underwriting_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_documents" ADD CONSTRAINT "underwriting_documents_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_evidence" ADD CONSTRAINT "underwriting_evidence_application_id_underwriting_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."underwriting_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_evidence" ADD CONSTRAINT "underwriting_evidence_document_id_underwriting_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."underwriting_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_evidence" ADD CONSTRAINT "underwriting_evidence_collected_by_user_id_users_id_fk" FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_evidence" ADD CONSTRAINT "underwriting_evidence_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_metrics_snapshots" ADD CONSTRAINT "underwriting_metrics_snapshots_application_id_underwriting_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."underwriting_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "underwriting_metrics_snapshots" ADD CONSTRAINT "underwriting_metrics_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "eligibility_gate_results" ADD CONSTRAINT "eligibility_gate_results_application_id_underwriting_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."underwriting_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "eligibility_gate_results" ADD CONSTRAINT "eligibility_gate_results_evidence_id_underwriting_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."underwriting_evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_applications_user_id_idx" ON "underwriting_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_applications_status_idx" ON "underwriting_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_applications_school_id_idx" ON "underwriting_applications" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_documents_application_id_idx" ON "underwriting_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_documents_document_type_idx" ON "underwriting_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_documents_verification_status_idx" ON "underwriting_documents" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_evidence_application_id_idx" ON "underwriting_evidence" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_evidence_document_id_idx" ON "underwriting_evidence" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_evidence_claim_key_idx" ON "underwriting_evidence" USING btree ("claim_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_metrics_snapshots_application_id_idx" ON "underwriting_metrics_snapshots" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "underwriting_metrics_snapshots_kind_idx" ON "underwriting_metrics_snapshots" USING btree ("snapshot_kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_gate_results_application_id_idx" ON "eligibility_gate_results" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_gate_results_gate_code_idx" ON "eligibility_gate_results" USING btree ("gate_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
