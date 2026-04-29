import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import {
  setMigrationOk,
  setMigrationFailed,
  resetMigrationStatus,
} from "../src/lib/server-state.js";
import { applyMigrations } from "../src/lib/apply-migrations.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const HEALTH_PATHS = ["/health", "/healthz", "/api/health", "/api/healthz"] as const;

interface HealthResponse {
  status?: string;
  migrations?: string;
  error?: string | null;
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function get(baseUrl: string, path: string): Promise<{ status: number; body: HealthResponse }> {
  const res = await fetch(`${baseUrl}${path}`);
  const body = (await res.json()) as HealthResponse;
  return { status: res.status, body };
}

async function checkPendingState(baseUrl: string): Promise<void> {
  resetMigrationStatus();
  for (const path of HEALTH_PATHS) {
    const { status, body } = await get(baseUrl, path);
    eq(`${path} [pending] HTTP status`, status, 200);
    eq(`${path} [pending] body.status`, body.status, "ok");
    eq(`${path} [pending] body.migrations`, body.migrations, "pending");
    check(
      `${path} [pending] no error field set`,
      body.error === undefined || body.error === null,
      `got ${JSON.stringify(body.error)}`,
    );
  }
}

async function checkOkState(baseUrl: string): Promise<void> {
  setMigrationOk();
  for (const path of HEALTH_PATHS) {
    const { status, body } = await get(baseUrl, path);
    eq(`${path} [ok] HTTP status`, status, 200);
    eq(`${path} [ok] body.status`, body.status, "ok");
    eq(`${path} [ok] body.migrations`, body.migrations, "ok");
    check(
      `${path} [ok] no error field set`,
      body.error === undefined || body.error === null,
      `got ${JSON.stringify(body.error)}`,
    );
  }
}

async function checkFailedState(baseUrl: string): Promise<void> {
  const sentinel = "schema drift: column users.email does not exist";
  setMigrationFailed(new Error(sentinel));
  for (const path of HEALTH_PATHS) {
    const { status, body } = await get(baseUrl, path);
    eq(`${path} [failed] HTTP status`, status, 503);
    eq(`${path} [failed] body.status`, body.status, "degraded");
    eq(`${path} [failed] body.migrations`, body.migrations, "failed");
    check(
      `${path} [failed] body.error contains underlying message`,
      typeof body.error === "string" && body.error.includes(sentinel),
      `got ${JSON.stringify(body.error)}`,
    );
  }
}

async function checkProductionExitOnFailure(): Promise<void> {
  let exitCode: number | null = null;
  let exitCalls = 0;
  resetMigrationStatus();
  await applyMigrations({
    hasPool: true,
    runMigrations: async () => {
      throw new Error("simulated production migration failure");
    },
    isProduction: true,
    exit: (code) => {
      exitCalls++;
      exitCode = code;
    },
    log: () => {},
    logError: () => {},
  });
  eq("[prod] exit called exactly once on migration failure", exitCalls, 1);
  eq("[prod] exit called with non-zero code", exitCode, 1);
  // The state should still be marked failed so operators inspecting the
  // process before it terminates see the right signal.
  // (process.exit is async-ish in real life — between the call and the
  // actual termination, anything observing state should see "failed".)
  // Imported lazily to avoid pulling state in earlier than needed.
  const { getMigrationStatus, getMigrationError } = await import("../src/lib/server-state.js");
  eq("[prod] migration status recorded as failed", getMigrationStatus(), "failed");
  check(
    "[prod] migration error captured",
    (getMigrationError() ?? "").includes("simulated production migration failure"),
    `got ${JSON.stringify(getMigrationError())}`,
  );
}

async function checkDevDoesNotExitOnFailure(): Promise<void> {
  let exitCode: number | null = null;
  let exitCalls = 0;
  resetMigrationStatus();
  await applyMigrations({
    hasPool: true,
    runMigrations: async () => {
      throw new Error("simulated dev migration failure");
    },
    isProduction: false,
    exit: (code) => {
      exitCalls++;
      exitCode = code;
    },
    log: () => {},
    logError: () => {},
  });
  eq("[dev] exit NOT called on migration failure", exitCalls, 0);
  eq("[dev] exit code untouched", exitCode, null);
  const { getMigrationStatus } = await import("../src/lib/server-state.js");
  eq("[dev] migration status recorded as failed", getMigrationStatus(), "failed");
}

async function checkNoPoolMarksOk(): Promise<void> {
  let exitCalls = 0;
  resetMigrationStatus();
  await applyMigrations({
    hasPool: false,
    runMigrations: async () => {
      throw new Error("should not run when there is no pool");
    },
    isProduction: true,
    exit: () => {
      exitCalls++;
    },
    log: () => {},
    logError: () => {},
  });
  const { getMigrationStatus } = await import("../src/lib/server-state.js");
  eq("[no-pool] migration status marked ok", getMigrationStatus(), "ok");
  eq("[no-pool] exit not called", exitCalls, 0);
}

async function main(): Promise<void> {
  const { baseUrl, close } = await startServer();
  try {
    await checkPendingState(baseUrl);
    await checkOkState(baseUrl);
    await checkFailedState(baseUrl);
  } finally {
    await close();
  }

  await checkProductionExitOnFailure();
  await checkDevDoesNotExitOnFailure();
  await checkNoPoolMarksOk();

  // Leave the in-memory state in a sane place for any follow-on test runs.
  resetMigrationStatus();

  console.log(`\nHealth endpoint tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Health endpoint test runner crashed:", err);
  process.exit(1);
});
