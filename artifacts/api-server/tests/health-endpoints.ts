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
import { createHealthHandler, type DbStatus, type EncryptionStatus } from "../src/lib/health.js";
import { encryptSensitive } from "../src/lib/sensitive-encryption.js";

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
  encryption?: {
    status?: string;
    rowsOnRetiredKek?: number;
    retiredKekIds?: string[];
    error?: string;
  };
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

// Pin down encryption-rotation reporting across the all-clear case and the
// in-flight rotation case by mounting the deep handler with an injected
// encryption check on a throwaway app.
async function checkEncryptionStatuses(): Promise<void> {
  resetMigrationStatus();
  setMigrationOk();

  // Helper: build a server that returns a fixed EncryptionStatus.
  async function withInjected(status: EncryptionStatus): Promise<HealthResponse> {
    const miniApp = express();
    miniApp.get(
      "/api/healthz",
      createHealthHandler({
        includeDb: true,
        checkDb: async () => "connected",
        checkEncryption: async () => status,
      }),
    );
    miniApp.get(
      "/healthz",
      createHealthHandler({
        includeDb: false,
        checkEncryption: async () => {
          throw new Error("simple handler must not invoke the encryption check");
        },
      }),
    );
    const { baseUrl, close } = await startServer(miniApp);
    try {
      const deep = await get(baseUrl, "/api/healthz");
      eq("encryption case: deep HTTP status", deep.status, 200);
      // Sanity: simple path still omits encryption.
      const simple = await get(baseUrl, "/healthz");
      check(
        "encryption case: /healthz omits encryption field",
        simple.body.encryption === undefined,
        `got ${JSON.stringify(simple.body.encryption)}`,
      );
      return deep.body;
    } finally {
      await close();
    }
  }

  // All-clear: no rows still wrapped under a retired KEK.
  {
    const body = await withInjected({
      status: "ok",
      rowsOnRetiredKek: 0,
      retiredKekIds: [],
    });
    check(
      "[encryption all-clear] body.encryption present",
      body.encryption !== undefined,
      `got ${JSON.stringify(body.encryption)}`,
    );
    eq("[encryption all-clear] status", body.encryption?.status, "ok");
    eq("[encryption all-clear] rowsOnRetiredKek", body.encryption?.rowsOnRetiredKek, 0);
    check(
      "[encryption all-clear] retiredKekIds is empty array",
      Array.isArray(body.encryption?.retiredKekIds) &&
        (body.encryption?.retiredKekIds?.length ?? -1) === 0,
      `got ${JSON.stringify(body.encryption?.retiredKekIds)}`,
    );
  }

  // Rotation in flight: a couple of rows still on retired KEKs, two
  // distinct kekIds. Operator must keep SENSITIVE_ENCRYPTION_KEY_PREVIOUS
  // populated until the rotation script clears them.
  {
    const body = await withInjected({
      status: "ok",
      rowsOnRetiredKek: 7,
      retiredKekIds: ["aaaaaaaa", "bbbbbbbb"],
    });
    eq("[encryption in-flight] status", body.encryption?.status, "ok");
    eq("[encryption in-flight] rowsOnRetiredKek", body.encryption?.rowsOnRetiredKek, 7);
    check(
      "[encryption in-flight] retiredKekIds lists both old KEK ids",
      JSON.stringify(body.encryption?.retiredKekIds) ===
        JSON.stringify(["aaaaaaaa", "bbbbbbbb"]),
      `got ${JSON.stringify(body.encryption?.retiredKekIds)}`,
    );
  }

  // The default DB-less branch reports `not_configured` so operators can
  // distinguish "no DB to check" from "0 rows on retired KEK".
  {
    const body = await withInjected({ status: "not_configured" });
    eq("[encryption no-db] status", body.encryption?.status, "not_configured");
    check(
      "[encryption no-db] rowsOnRetiredKek omitted",
      body.encryption?.rowsOnRetiredKek === undefined,
      `got ${JSON.stringify(body.encryption?.rowsOnRetiredKek)}`,
    );
  }

  // And: also exercise the pure summarizer through a real previous-KEK
  // env so we catch regressions in the parsing path itself.
  {
    const prev = process.env.SENSITIVE_ENCRYPTION_KEY;
    const prevPrev = process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS;
    try {
      // First, encrypt under one key.
      process.env.SENSITIVE_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
      const onOldKek = encryptSensitive("123-45-6789").encryptedRef;
      // Now rotate: the old key becomes "previous", a new key becomes "active".
      process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS = Buffer.alloc(32, 1).toString("base64");
      process.env.SENSITIVE_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
      const onNewKek = encryptSensitive("987-65-4321").encryptedRef;

      const { summarizeRetiredKekUsage, getActiveKekId } = await import(
        "../src/lib/sensitive-encryption.js"
      );
      const summary = summarizeRetiredKekUsage([onOldKek, onNewKek, null, undefined, ""]);
      eq("[summarizer] rows on retired KEK", summary.rowsOnRetiredKek, 1);
      eq("[summarizer] retired kek id count", summary.retiredKekIds.length, 1);
      check(
        "[summarizer] retired id is not the active id",
        summary.retiredKekIds[0] !== getActiveKekId(),
        `got ${summary.retiredKekIds[0]} vs active ${getActiveKekId()}`,
      );

      const allClear = summarizeRetiredKekUsage([onNewKek]);
      eq("[summarizer all-clear] count", allClear.rowsOnRetiredKek, 0);
      eq("[summarizer all-clear] ids", allClear.retiredKekIds.length, 0);
    } finally {
      if (prev === undefined) delete process.env.SENSITIVE_ENCRYPTION_KEY;
      else process.env.SENSITIVE_ENCRYPTION_KEY = prev;
      if (prevPrev === undefined) delete process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS;
      else process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS = prevPrev;
    }
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
  await checkEncryptionStatuses();

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
