import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";
import { pool, db, errorLogsTable, runMigrations } from "@workspace/db";
import { applyMigrations as runApplyMigrations } from "./lib/apply-migrations";
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

applyMigrations().then(() => {
  server = app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
    if (isProduction) {
      console.log(`[startup] Production mode — CORS origins: ${process.env.ALLOWED_ORIGINS || "(not set)"}`);
    }
  });
});

cleanupTimer = setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
}, 300_000);
