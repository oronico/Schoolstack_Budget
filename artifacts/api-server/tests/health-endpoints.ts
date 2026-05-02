import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import app from "../src/app.js";
import {
  setMigrationOk,
  setMigrationFailed,
  resetMigrationStatus,
} from "../src/lib/server-state.js";
import { applyMigrations } from "../src/lib/apply-migrations.js";
import { createHealthHandler, type DbStatus } from "../src/lib/health.js";

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

// Platform-probe paths return the lightweight migration-only payload.
const SIMPLE_PATHS = ["/health", "/healthz"] as const;
// Operator-facing paths include a live DB ping in the response.
const DEEP_PATHS = ["/api/health", "/api/healthz"] as const;
const ALL_HEALTH_PATHS = [...SIMPLE_PATHS, ...DEEP_PATHS] as const;
const VALID_DB_STATUSES: ReadonlySet<string> = new Set([
  "not_configured",
  "connected",
  "unreachable",
]);

interface HealthResponse {
  status?: string;
  migrations?: string;
  error?: string | null;
  db?: string;
}

async function startServer(
  handler: express.Express | http.RequestListener,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
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
  for (const path of ALL_HEALTH_PATHS) {
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
  // Pin down which payload shape each path returns.
  for (const path of SIMPLE_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [pending] omits db field (lightweight platform probe)`,
      body.db === undefined,
      `got ${JSON.stringify(body.db)}`,
    );
  }
  for (const path of DEEP_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [pending] includes db field (operator-facing deep check)`,
      typeof body.db === "string" && VALID_DB_STATUSES.has(body.db),
      `got ${JSON.stringify(body.db)}`,
    );
  }
}

async function checkOkState(baseUrl: string): Promise<void> {
  setMigrationOk();
  for (const path of ALL_HEALTH_PATHS) {
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
  for (const path of SIMPLE_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [ok] omits db field (lightweight platform probe)`,
      body.db === undefined,
      `got ${JSON.stringify(body.db)}`,
    );
  }
  for (const path of DEEP_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [ok] includes db field (operator-facing deep check)`,
      typeof body.db === "string" && VALID_DB_STATUSES.has(body.db),
      `got ${JSON.stringify(body.db)}`,
    );
  }
}

async function checkFailedState(baseUrl: string): Promise<void> {
  const sentinel = "schema drift: column users.email does not exist";
  setMigrationFailed(new Error(sentinel));
  for (const path of ALL_HEALTH_PATHS) {
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
  for (const path of SIMPLE_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [failed] omits db field (lightweight platform probe)`,
      body.db === undefined,
      `got ${JSON.stringify(body.db)}`,
    );
  }
  for (const path of DEEP_PATHS) {
    const { body } = await get(baseUrl, path);
    check(
      `${path} [failed] includes db field (operator-facing deep check)`,
      typeof body.db === "string" && VALID_DB_STATUSES.has(body.db),
      `got ${JSON.stringify(body.db)}`,
    );
  }
}

// Pin down the DB-ping behavior across every DbStatus value by mounting the
// handler with an injected check on a throwaway app. This way the assertion
// doesn't depend on whether the test environment has a reachable Postgres.
async function checkDeepDbStatuses(): Promise<void> {
  resetMigrationStatus();
  setMigrationOk();
  const statuses: DbStatus[] = ["connected", "unreachable", "not_configured"];
  for (const status of statuses) {
    const miniApp = express();
    miniApp.get(
      "/api/healthz",
      createHealthHandler({
        includeDb: true,
        checkDb: async () => status,
      }),
    );
    miniApp.get(
      "/healthz",
      createHealthHandler({
        includeDb: false,
        checkDb: async () => {
          throw new Error("simple handler must not invoke the DB check");
        },
      }),
    );
    const { baseUrl, close } = await startServer(miniApp);
    try {
      const deep = await get(baseUrl, "/api/healthz");
      eq(`[mocked db=${status}] /api/healthz HTTP status`, deep.status, 200);
      eq(`[mocked db=${status}] /api/healthz body.db`, deep.body.db, status);
      eq(`[mocked db=${status}] /api/healthz body.status`, deep.body.status, "ok");

      const simple = await get(baseUrl, "/healthz");
      eq(`[mocked db=${status}] /healthz HTTP status`, simple.status, 200);
      check(
        `[mocked db=${status}] /healthz omits db field`,
        simple.body.db === undefined,
        `got ${JSON.stringify(simple.body.db)}`,
      );
    } finally {
      await close();
    }
  }

  // Failed migrations + an injected DB status: deep handler should still
  // report the DB status alongside the degraded migration error.
  setMigrationFailed(new Error("injected migration failure"));
  const miniApp = express();
  miniApp.get(
    "/api/healthz",
    createHealthHandler({
      includeDb: true,
      checkDb: async () => "unreachable",
    }),
  );
  const { baseUrl, close } = await startServer(miniApp);
  try {
    const { status, body } = await get(baseUrl, "/api/healthz");
    eq("[mocked db=unreachable, migrations=failed] HTTP status", status, 503);
    eq("[mocked db=unreachable, migrations=failed] body.db", body.db, "unreachable");
    eq("[mocked db=unreachable, migrations=failed] body.migrations", body.migrations, "failed");
  } finally {
    await close();
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
  const { baseUrl, close } = await startServer(app);
  try {
    await checkPendingState(baseUrl);
    await checkOkState(baseUrl);
    await checkFailedState(baseUrl);
  } finally {
    await close();
  }

  await checkDeepDbStatuses();

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
