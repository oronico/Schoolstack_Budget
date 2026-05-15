import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";
import { cleanupOldErrorLogs } from "./routes/errors";
import { cleanupExpiredPendingSignups } from "./routes/auth";
import { runOrphanUploadsCleanup } from "./scripts/cleanup-orphan-uploads";
import { runRotation as runSensitiveKeyRotation } from "./scripts/rotate-sensitive-encryption-key";
import { pool, db, runMigrations } from "@workspace/db";
import { recordErrorLog } from "./lib/error-log";
import { alertOnKeyRotationFailure } from "./lib/key-rotation-alert";
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
let orphanUploadsTimer: ReturnType<typeof setInterval>;
let keyRotationTimer: ReturnType<typeof setInterval>;
let isShuttingDown = false;

// Task #757 — schedule the orphan-uploads sweeper.
//
// Goal: keep App Storage costs flat by deleting evidence files that no
// surviving model still references. The sweeper itself was added in
// task #736 and is normally invoked by hand via
// `pnpm --filter @workspace/api-server run cleanup:orphan-uploads`.
// Running it in-process here means production gets a recurring sweep
// without depending on a separately-configured Replit Scheduled
// Deployment that an operator could forget to set up.
//
// In production we run daily with --execute. In every other env we
// stay in dry-run mode so local/test runs never touch a shared bucket.
// Each run prints its progress lines plus one tagged JSON summary
// (`[orphan-uploads-summary] {...}`) so operators can grep deployment
// logs to confirm the sweep ran and how many objects it removed. See
// `docs/operations/orphan-uploads-sweeper.md` for the runbook.
const ORPHAN_UPLOADS_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const ORPHAN_UPLOADS_FIRST_RUN_DELAY_MS = 10 * 60 * 1000; // 10 min after boot
let orphanUploadsRunning = false;

async function runScheduledOrphanUploadsSweep(): Promise<void> {
  if (orphanUploadsRunning) {
    console.log("[orphan-uploads-scheduler] previous sweep still running — skipping this tick");
    return;
  }
  orphanUploadsRunning = true;
  try {
    const summary = await runOrphanUploadsCleanup({
      execute: isProduction,
      logger: (msg) => console.log(`[orphan-uploads-scheduler] ${msg}`),
    });
    console.log(`[orphan-uploads-summary] ${JSON.stringify(summary)}`);
  } catch (err) {
    console.error("[orphan-uploads-scheduler] sweep failed:", err);
  } finally {
    orphanUploadsRunning = false;
  }
}

// Task #837 — schedule the borrower-data KEK rotation script.
//
// Task #788 added `pnpm ... rotate:sensitive-encryption-key --execute`
// as a one-shot CLI. For periodic / compromise-driven rotations we
// also want it to run on a recurring in-process cadence (same pattern
// as the orphan-uploads sweeper above) so a missed manual step
// doesn't leave borrower rows wrapped under an old KEK indefinitely.
//
// Opt-in: the schedule only arms when
// `SENSITIVE_ENCRYPTION_KEY_ROTATION_INTERVAL_MS` is set to a positive
// integer. We additionally short-circuit each tick when
// `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` is unset (nothing to rotate).
// Each run emits a tagged JSON line (`[rotation-summary] {...}`) for
// grep-based monitoring.
const KEY_ROTATION_INTERVAL_MS = (() => {
  const raw = process.env["SENSITIVE_ENCRYPTION_KEY_ROTATION_INTERVAL_MS"];
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const KEY_ROTATION_FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // 5 min after boot
let keyRotationRunning = false;

async function runScheduledKeyRotation(): Promise<void> {
  if (!process.env["SENSITIVE_ENCRYPTION_KEY_PREVIOUS"]) {
    console.log(
      "[key-rotation-scheduler] SENSITIVE_ENCRYPTION_KEY_PREVIOUS unset — nothing to rotate, skipping",
    );
    return;
  }
  if (keyRotationRunning) {
    console.log("[key-rotation-scheduler] previous rotation still running — skipping this tick");
    return;
  }
  keyRotationRunning = true;
  try {
    const summary = await runSensitiveKeyRotation({
      execute: true,
      limit: Number.POSITIVE_INFINITY,
    });
    console.log(`[rotation-summary] ${JSON.stringify(summary)}`);
    // Task #871 — turn `failed > 0` ticks into an active alert
    // (error_logs row + ADMIN_EMAILS notification) instead of relying
    // on operators to grep the rotation-summary line. Successful ticks
    // (failed=0) intentionally produce no extra noise.
    try {
      const outcome = await alertOnKeyRotationFailure(summary);
      if (outcome.dispatched) {
        console.error(
          `[key-rotation-scheduler] dispatched failure alert — totalFailed=${outcome.totalFailed} ` +
            `errorLogRow=${outcome.loggedErrorRow} emailedAdmins=${outcome.emailedAdmins} ` +
            `recipients=${outcome.emailRecipients.length}`,
        );
      }
    } catch (alertErr) {
      console.error("[key-rotation-scheduler] alert dispatch threw:", alertErr);
    }
  } catch (err) {
    console.error("[key-rotation-scheduler] rotation failed:", err);
  } finally {
    keyRotationRunning = false;
  }
}

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
  if (orphanUploadsTimer) clearInterval(orphanUploadsTimer);
  if (keyRotationTimer) clearInterval(keyRotationTimer);

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

// Task #757 — daily orphan-uploads sweep. Defer the first run by a few
// minutes so we don't pile DB + bucket I/O onto the boot sequence (and
// so the server stays responsive to the deployment health check).
setTimeout(() => {
  void runScheduledOrphanUploadsSweep();
  orphanUploadsTimer = setInterval(() => {
    void runScheduledOrphanUploadsSweep();
  }, ORPHAN_UPLOADS_INTERVAL_MS);
}, ORPHAN_UPLOADS_FIRST_RUN_DELAY_MS).unref();

// Task #837 — arm the KEK rotation schedule only when an interval was
// explicitly configured AND a previous KEK is actually loaded. Default
// off so non-production environments and freshly-bootstrapped
// deployments don't spin up rotation work nobody asked for, and so a
// deployment that has the interval set but no previous KEK doesn't
// emit a "nothing to rotate" log line on every tick forever.
if (KEY_ROTATION_INTERVAL_MS > 0) {
  if (!process.env["SENSITIVE_ENCRYPTION_KEY_PREVIOUS"]) {
    console.log(
      "[key-rotation-scheduler] interval set but SENSITIVE_ENCRYPTION_KEY_PREVIOUS is unset — " +
        "not arming scheduler (nothing to rotate). Set the previous KEK and restart to enable.",
    );
  } else {
    console.log(
      `[key-rotation-scheduler] enabled — interval=${KEY_ROTATION_INTERVAL_MS}ms, ` +
        `first run in ${KEY_ROTATION_FIRST_RUN_DELAY_MS}ms`,
    );
    setTimeout(() => {
      void runScheduledKeyRotation();
      keyRotationTimer = setInterval(() => {
        void runScheduledKeyRotation();
      }, KEY_ROTATION_INTERVAL_MS);
    }, KEY_ROTATION_FIRST_RUN_DELAY_MS).unref();
  }
}
