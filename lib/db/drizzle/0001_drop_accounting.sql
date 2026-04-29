-- Task #233: drop the live QuickBooks/Xero accounting integration in favor
-- of the CSV-upload-only flow. Both tables are guarded with IF EXISTS so the
-- migration is safe to run against environments that never ran the original
-- accounting integration (early dev databases, fresh staging, etc.).
DROP TABLE IF EXISTS "accounting_mapping_defaults";--> statement-breakpoint
DROP TABLE IF EXISTS "accounting_connections";
