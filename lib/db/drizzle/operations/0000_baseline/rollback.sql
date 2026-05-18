-- Rollback for 0000_baseline.
-- Not reversible in place: this migration created the entire baseline schema
-- and is live in prod. If the baseline ever needs to be undone in a recovery
-- scenario, restore the most recent Railway snapshot per
-- docs/RUNBOOK_DB_RESTORE.md rather than trying to drop tables in order.
-- Intentionally left as a no-op so the generator can still parse this file.
SELECT 1;
