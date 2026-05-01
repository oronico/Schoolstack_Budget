-- Track share-link comparison PDF downloads in the founder's exports list.
-- Adds two nullable provenance columns to `exports` so a row recorded
-- against the model owner because someone downloaded via /shared/:token can
-- be distinguished from the owner's own direct exports. We use IF NOT
-- EXISTS guards so reapplying against a DB that already has the columns
-- (e.g. via `drizzle-kit push`) is a no-op.
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "shared_link_id" integer;--> statement-breakpoint
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "viewer_label" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exports_shared_link_id_shared_links_id_fk') THEN
    ALTER TABLE "exports" ADD CONSTRAINT "exports_shared_link_id_shared_links_id_fk" FOREIGN KEY ("shared_link_id") REFERENCES "public"."shared_links"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
