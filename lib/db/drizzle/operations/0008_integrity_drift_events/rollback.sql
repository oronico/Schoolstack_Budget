-- Single leaf table; no FKs in or out. Dropping the table also drops
-- both btree indexes (integrity_drift_events_model_metric_idx and
-- integrity_drift_events_severity_idx).
DROP TABLE IF EXISTS "integrity_drift_events";
