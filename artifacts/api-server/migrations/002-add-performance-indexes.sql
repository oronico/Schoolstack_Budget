CREATE INDEX IF NOT EXISTS financial_models_user_id_idx ON financial_models (user_id);
CREATE INDEX IF NOT EXISTS exports_user_id_idx ON exports (user_id);
CREATE INDEX IF NOT EXISTS exports_model_id_idx ON exports (model_id);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON events (user_id);
CREATE INDEX IF NOT EXISTS events_event_name_idx ON events (event_name);
