ALTER TABLE "exports" DROP CONSTRAINT IF EXISTS "exports_shared_link_id_shared_links_id_fk";
ALTER TABLE "exports" DROP COLUMN IF EXISTS "shared_link_id";
ALTER TABLE "exports" DROP COLUMN IF EXISTS "viewer_label";
