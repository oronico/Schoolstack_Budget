-- Drop in reverse dependency order. Leaf tables first, then parents.
DROP TABLE IF EXISTS "audit_log";
DROP TABLE IF EXISTS "eligibility_gate_results";
DROP TABLE IF EXISTS "underwriting_metrics_snapshots";
DROP TABLE IF EXISTS "underwriting_evidence";
DROP TABLE IF EXISTS "underwriting_documents";
DROP TABLE IF EXISTS "underwriting_applications";
