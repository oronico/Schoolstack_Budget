-- Task #430 — Admin overrides for the Coaching tab "looks dead" badge.
-- Stores per-surface snooze (with expiry) and retire decisions so the
-- Coaching tab can suppress the amber badge or hide the surface entirely
-- without re-flagging it on every visit.
--
-- IF NOT EXISTS / DO blocks mirror the safe-to-reapply pattern used by
-- the earlier 0001..0005 migrations.
CREATE TABLE IF NOT EXISTS "coach_surface_overrides" (
"id" serial PRIMARY KEY NOT NULL,
"surface_key" varchar(120) NOT NULL,
"action" varchar(20) NOT NULL,
"snoozed_until" timestamp,
"actor_user_id" integer,
"actor_email" varchar(255),
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coach_surface_overrides" ADD CONSTRAINT "coach_surface_overrides_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coach_surface_overrides_surface_key_uniq" ON "coach_surface_overrides" USING btree ("surface_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_surface_overrides_action_idx" ON "coach_surface_overrides" USING btree ("action");
