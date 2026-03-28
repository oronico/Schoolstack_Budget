import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";
import { pool } from "@workspace/db";

const isProduction = process.env.NODE_ENV === "production";

function validateEnv() {
  const required: [string, string][] = [
    ["DATABASE_URL", "PostgreSQL connection string"],
    ["JWT_SECRET", "Secret key for signing JWT tokens"],
  ];

  const optional: [string, string][] = [
    ["ALLOWED_ORIGINS", "Comma-separated list of allowed CORS origins"],
    ["ADMIN_EMAILS", "Comma-separated list of admin email addresses"],
    ["RESEND_API_KEY", "Resend API key for transactional emails"],
    ["EMAIL_FROM", "Sender address for outgoing emails"],
    ["APP_URL", "Public URL of the frontend application"],
  ];

  let hasFatal = false;

  for (const [key, desc] of required) {
    if (!process.env[key]) {
      if (isProduction) {
        console.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
        hasFatal = true;
      } else {
        console.warn(`[startup] WARNING: ${key} not set — ${desc}. Using dev default.`);
      }
    }
  }

  for (const [key, desc] of optional) {
    if (!process.env[key]) {
      console.warn(`[startup] INFO: Optional env var ${key} not set — ${desc}`);
    }
  }

  if (hasFatal) {
    console.error("[startup] Server cannot start without required environment variables.");
    process.exit(1);
  }
}

async function runMigrations() {
  if (!pool) return;
  try {
    const migrations = [
      // --- users ---
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS guidance_level VARCHAR(20)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_name TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_role TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS planning_stage TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS mailing_list_opt_in BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now()`,
      // --- financial_models ---
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id)`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS school_stage VARCHAR(30)`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS funding_profile VARCHAR(30)`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS prior_year_snapshot_json JSONB`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS staffing_rows_json JSONB`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS revenue_rows_json JSONB`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS expense_rows_json JSONB`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS capital_and_debt_rows_json JSONB`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMP`,
      `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS consultant_summary_json JSONB`,
      // --- feedback ---
      `ALTER TABLE feedback ADD COLUMN IF NOT EXISTS score INTEGER`,
      // --- indexes ---
      `CREATE INDEX IF NOT EXISTS financial_models_user_id_idx ON financial_models(user_id)`,
      `CREATE INDEX IF NOT EXISTS exports_user_id_idx ON exports(user_id)`,
      `CREATE INDEX IF NOT EXISTS exports_model_id_idx ON exports(model_id)`,
      `CREATE INDEX IF NOT EXISTS events_user_id_idx ON events(user_id)`,
      `CREATE INDEX IF NOT EXISTS events_event_name_idx ON events(event_name)`,
    ];
    for (const stmt of migrations) {
      await pool.query(stmt);
    }
    console.log("[migrations] Schema up to date.");
  } catch (err) {
    console.error("[migrations] Failed to run migrations:", err);
  }
}

validateEnv();

const port = Number(process.env["PORT"] || "3000");

runMigrations().then(() => {
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
  if (isProduction) {
    console.log(`[startup] Production mode — CORS origins: ${process.env.ALLOWED_ORIGINS || "(not set)"}`);
  }
});
});

setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
}, 300_000);
