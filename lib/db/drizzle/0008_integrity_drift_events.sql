-- Task #987 — Production math-integrity drift events.
--
-- Sampled production-traffic harness records one row per (model, metric,
-- surface) tuple where the canonical value disagreed with the rendered
-- value beyond the registry-driven tolerance. See
-- `lib/db/src/schema/integrity-drift-events.ts` for the column contract
-- and `artifacts/api-server/src/lib/integrity/drift-monitor.ts` for the
-- write path.
--
-- IF NOT EXISTS / DO blocks mirror earlier 0001..0007 migrations so
-- reapplying against a DB first provisioned via `drizzle-kit push` is a
-- no-op rather than an error.
CREATE TABLE IF NOT EXISTS "integrity_drift_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"metric_id" varchar(80) NOT NULL,
	"surface" varchar(40) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"extracted_value" double precision,
	"canonical_value" double precision,
	"delta_abs" double precision,
	"tolerance_abs" double precision,
	"location" text,
	"note" text,
	"request_id" varchar(64),
	"request_timestamp" timestamp DEFAULT now() NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_drift_events_model_metric_idx" ON "integrity_drift_events" USING btree ("model_id","metric_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_drift_events_severity_idx" ON "integrity_drift_events" USING btree ("severity","request_timestamp");
