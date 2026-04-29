import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";
import {
  startAccountingSyncScheduler,
  stopAccountingSyncScheduler,
} from "./lib/accounting/scheduler";
import { pool, db, errorLogsTable } from "@workspace/db";
import type { Server } from "http";

const isProduction = process.env.NODE_ENV === "production";

function validateEnv() {
  const required: [string, string][] = [
    ["DATABASE_URL", "PostgreSQL connection string"],
    ["JWT_SECRET", "Secret key for signing JWT tokens"],
  ];

  const requiredInProduction: [string, string][] = [
    ["APP_URL", "Public URL of the frontend application"],
  ];

  const optional: [string, string][] = [
    ["ALLOWED_ORIGINS", "Comma-separated list of allowed CORS origins"],
    ["ADMIN_EMAILS", "Comma-separated list of admin email addresses"],
    ["RESEND_API_KEY", "Resend API key for transactional emails"],
    ["EMAIL_FROM", "Sender address for outgoing emails"],
  ];

  let hasFatal = false;

  for (const [key, desc] of required) {
    if (!process.env[key]) {
      if (isProduction) {
        console.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
        hasFatal = true;
      } else {
        console.error(`[startup] ERROR: ${key} not set — ${desc}. Server may fail to start.`);
        hasFatal = true;
      }
    }
  }

  for (const [key, desc] of requiredInProduction) {
    if (!process.env[key]) {
      if (isProduction) {
        console.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
        hasFatal = true;
      } else {
        console.warn(`[startup] INFO: ${key} not set — ${desc}. Will use dev fallback.`);
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
      // --- shared_links ---
      `CREATE TABLE IF NOT EXISTS shared_links (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        viewer_label TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        revoked_at TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS shared_links_model_id_idx ON shared_links(model_id)`,
      `CREATE INDEX IF NOT EXISTS shared_links_token_idx ON shared_links(token)`,
    ];
    for (const stmt of migrations) {
      await pool.query(stmt);
    }
    console.log("[migrations] Schema up to date.");
  } catch (err) {
    console.error("[migrations] Failed to run migrations:", err);
  }
}

function logCrashToDb(message: string, stack: string | undefined) {
  if (!db) return;
  db.insert(errorLogsTable)
    .values({
      userId: null,
      errorMessage: String(message).slice(0, 2000),
      errorStack: stack ? String(stack).slice(0, 5000) : null,
      route: "process_crash",
      requestBody: null,
    })
    .catch(() => {});
}

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  logCrashToDb(err.message, err.stack);
  setTimeout(() => process.exit(1), 500);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[FATAL] Unhandled promise rejection:", err);
  logCrashToDb(err.message, err.stack);
  setTimeout(() => process.exit(1), 500);
});

validateEnv();

const port = Number(process.env["PORT"] || "3000");
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15_000;
let server: Server | undefined;
let cleanupTimer: ReturnType<typeof setInterval>;
let isShuttingDown = false;

function drainAndExit(forceTimer: ReturnType<typeof setTimeout>) {
  console.log("[shutdown] Draining database pool...");
  if (pool) {
    pool.end()
      .then(() => {
        console.log("[shutdown] Database pool drained. Exiting.");
        clearTimeout(forceTimer);
        process.exit(0);
      })
      .catch((err: unknown) => {
        console.error("[shutdown] Error draining pool:", err);
        clearTimeout(forceTimer);
        process.exit(1);
      });
  } else {
    console.log("[shutdown] No pool to drain. Exiting.");
    clearTimeout(forceTimer);
    process.exit(0);
  }
}

function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.error(`[shutdown] Received ${signal} again — forcing immediate exit.`);
    process.exit(1);
  }
  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}, starting graceful shutdown...`);

  const forceTimer = setTimeout(() => {
    console.error("[shutdown] Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  if (cleanupTimer) clearInterval(cleanupTimer);
  stopAccountingSyncScheduler();

  if (!server || !server.listening) {
    console.log("[shutdown] Server not yet listening, skipping server.close.");
    drainAndExit(forceTimer);
    return;
  }

  server.close((err) => {
    if (err) {
      console.error("[shutdown] Error closing HTTP server:", err);
    } else {
      console.log("[shutdown] HTTP server closed.");
    }
    drainAndExit(forceTimer);
  });
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

runMigrations().then(() => {
  server = app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
    if (isProduction) {
      console.log(`[startup] Production mode — CORS origins: ${process.env.ALLOWED_ORIGINS || "(not set)"}`);
    }
  });
  // Background daily sync of QuickBooks/Xero connections so founders don't
  // have to visit the scenarios page just to refresh actuals.
  startAccountingSyncScheduler();
});

cleanupTimer = setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
}, 300_000);
