-- Drop in reverse dependency order: founder_profiles references users, both are leaves otherwise.
DROP TABLE IF EXISTS "founder_profiles";
DROP TABLE IF EXISTS "borrower_entities";
