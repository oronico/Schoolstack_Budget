-- Users table: columns added over time
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guidance_level VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_role TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS planning_stage TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mailing_list_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();

-- Financial models table: columns added over time
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS school_stage VARCHAR(30);
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS funding_profile VARCHAR(30);
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS prior_year_snapshot_json JSONB;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS staffing_rows_json JSONB;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS revenue_rows_json JSONB;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS expense_rows_json JSONB;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS capital_and_debt_rows_json JSONB;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMP;
ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS consultant_summary_json JSONB;

-- Feedback table: NPS score
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS score INTEGER;

-- Performance indexes
CREATE INDEX IF NOT EXISTS financial_models_user_id_idx ON financial_models(user_id);
CREATE INDEX IF NOT EXISTS exports_user_id_idx ON exports(user_id);
CREATE INDEX IF NOT EXISTS exports_model_id_idx ON exports(model_id);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON events(user_id);
CREATE INDEX IF NOT EXISTS events_event_name_idx ON events(event_name);
