import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";
import { cleanupOldErrorLogs } from "./routes/errors";
import { cleanupExpiredPendingSignups } from "./routes/auth";
import { pool, db, runMigrations } from "@workspace/db";
import { recordErrorLog } from "./lib/error-log";
import { applyMigrations as runApplyMigrations } from "./lib/apply-migrations";
import { seedPreviewDataIfEmpty } from "./lib/seed-preview-data";
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
    ["POSTMARK_SERVER_TOKEN", "Postmark server token (failover provider for transactional emails)"],
    ["EMAIL_FROM", "Sender address for outgoing emails"],
    ["EMAIL_PROVIDER", "Override email provider selection: resend | postmark | console"],
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

function applyMigrations(): Promise<void> {
  return runApplyMigrations({
    hasPool: !!pool,
    runMigrations,
    isProduction,
    exit: (code) => process.exit(code),
  });
}

function logCrashToDb(message: string, stack: string | undefined) {
  if (!db) return;
  recordErrorLog({
    userId: null,
    errorMessage: message,
    errorStack: stack ?? null,
    route: "process_crash",
    requestBody: null,
  }).catch(() => {});
}

// Task #586 — In production we want fail-fast on uncaught errors so the
// platform's process supervisor (Replit Deployments / autoscale) can
// restart us into a known-good state. In dev / e2e there is *no*
// supervisor: the api-server is spawned once by `playwright.config.ts`
// (via `pnpm --filter @workspace/api-server run dev`) and a single
// `process.exit(1)` here permanently kills it for the rest of the run,
// which is exactly the "dev server died mid-run → 17 cascading
// ECONNREFUSED specs" flake Task #586 was filed against. Log the crash
// (still write it to error_logs so we can audit it) but keep the
// process alive in non-production so subsequent specs can keep
// hitting a healthy /api.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  logCrashToDb(err.message, err.stack);
  if (isProduction) {
    setTimeout(() => process.exit(1), 500);
  } else {
    console.error(
      "[FATAL] Non-production mode — keeping process alive so e2e tests can continue. " +
        "Set NODE_ENV=production to restore fail-fast behavior.",
    );
  }
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[FATAL] Unhandled promise rejection:", err);
  logCrashToDb(err.message, err.stack);
  if (isProduction) {
    setTimeout(() => process.exit(1), 500);
  } else {
    console.error(
      "[FATAL] Non-production mode — keeping process alive so e2e tests can continue. " +
        "Set NODE_ENV=production to restore fail-fast behavior.",
    );
  }
});

validateEnv();

const port = Number(process.env["PORT"] || "8080");
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

applyMigrations()
  .then(() => seedPreviewDataIfEmpty())
  .then(() => {
    server = app.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on 0.0.0.0:${port}`);
      if (isProduction) {
        console.log(`[startup] Production mode — CORS origins: ${process.env.ALLOWED_ORIGINS || "(not set)"}`);
      }
    });
  });

cleanupTimer = setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
  // Round-3 #18: same 5-minute sweep also prunes error_logs rows older
  // than 30 days, so an unauth attacker hammering /errors/report can't
  // grow the table indefinitely.
  cleanupOldErrorLogs().catch(() => {});
  // Task #535: same 5-minute sweep also prunes pending_signups rows
  // whose verification token has already expired, so abandoned signups
  // (and their bcrypt'd password hashes) don't accumulate forever.
  cleanupExpiredPendingSignups().catch(() => {});
}, 300_000);
