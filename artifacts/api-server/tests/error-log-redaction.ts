// Task #638 — Catch accidental leaks of sensitive data in error_logs.
//
// `error_logs.request_body` cannot enforce PII redaction at the
// schema level. Application code must strip sensitive fields from
// request payloads (and the request bodies that show up in stack
// traces) before they're persisted.
//
// Every write site funnels through `src/lib/error-log.ts::recordErrorLog`
// (the only chokepoint), which delegates to the shared redactor in
// `src/lib/redact-sensitive.ts` (also used by the audit-log helper).
// This test guards three things:
//
//   1. The shared redactor: every forbidden key is dropped from
//      arbitrarily nested payloads (objects, arrays, mixed casing).
//   2. The integration path: `recordErrorLog` actually persists a
//      redacted row when called with a payload containing forbidden
//      keys. Skipped if no DATABASE_URL.
//   3. Static guard: no production source file under `src/` does a
//      raw `db.insert(errorLogsTable)` outside the chokepoint, which
//      would bypass the redactor.
//
// Add a new write site? It MUST call `recordErrorLog`. Add a new
// forbidden key? Add it to FORBIDDEN_SENSITIVE_KEYS in
// src/lib/redact-sensitive.ts — this test reads that list directly.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { errorLogsTable } from "@workspace/db/schema";
import { recordErrorLog } from "../src/lib/error-log.js";
import {
  FORBIDDEN_SENSITIVE_KEYS,
  redactSensitivePayload,
} from "../src/lib/redact-sensitive.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function findForbiddenKey(value: unknown, trail: string[] = []): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenKey(value[i], [...trail, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_SENSITIVE_KEYS.some((f) => f.toLowerCase() === k.toLowerCase())) {
        return [...trail, k].join(".");
      }
      const found = findForbiddenKey(v, [...trail, k]);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Unit tests for redactSensitivePayload
// ---------------------------------------------------------------------------
function runRedactorUnitTests(): void {
  console.log("\n— shared redactor unit tests");

  for (const key of FORBIDDEN_SENSITIVE_KEYS) {
    const out = redactSensitivePayload({ keep: "me", [key]: "leak-" + key });
    check(
      `top-level "${key}" is stripped`,
      out !== null && !(key in out) && out.keep === "me",
      `out=${JSON.stringify(out)}`,
    );
  }

  const nested = redactSensitivePayload({
    request: {
      url: "/api/uw/applications/7",
      body: {
        applicant: { legalName: "Acme School", einEncryptedRef: "vault:ein/abc" },
        document: { storageRef: "appstorage://uw/7/990.pdf", displayName: "FY24 990" },
      },
    },
  });
  check(
    "nested storageRef / einEncryptedRef stripped",
    findForbiddenKey(nested) === null,
    `leftover=${findForbiddenKey(nested)}`,
  );
  const docOut = (nested as any)?.request?.body?.document;
  check("nested non-sensitive fields preserved", docOut?.displayName === "FY24 990");

  const arrayed = redactSensitivePayload({
    files: [
      { id: 1, storage_ref: "s3://a", displayName: "A" },
      { id: 2, storageRef: "s3://b", displayName: "B" },
    ],
  });
  check("array entries scrubbed", findForbiddenKey(arrayed) === null);
  check(
    "array entries keep id/displayName",
    Array.isArray((arrayed as any)?.files) &&
      (arrayed as any).files[0].id === 1 &&
      (arrayed as any).files[1].displayName === "B",
  );

  const cased = redactSensitivePayload({
    STORAGE_REF: "yes-still-leaks",
    Password_Hash: "$2a$...",
    EIN: "12-3456789",
    keep: 1,
  });
  check("case-insensitive redaction", findForbiddenKey(cased) === null && (cased as any)?.keep === 1);

  check("null input returns null", redactSensitivePayload(null) === null);
  check("undefined input returns null", redactSensitivePayload(undefined) === null);

  const realistic = redactSensitivePayload({
    method: "POST",
    path: "/api/uw/applications/42/submit",
    headers: { "user-agent": "vitest" },
    body: {
      status: "submitted",
      applicant: {
        legalName: "Acme School",
        einEncryptedRef: "vault:ein/abc",
        ssnEncryptedRef: "vault:ssn/abc",
        bankAccountToken: "btok_123",
      },
      document: { id: 42, storageRef: "appstorage://uw/42.pdf" },
      passwordHash: "$2a$10$....",
      accessToken: "Bearer xyz",
    },
  });
  check(
    "realistic request payload — no forbidden keys remain",
    findForbiddenKey(realistic) === null,
    `leftover=${findForbiddenKey(realistic)}`,
  );
  check("realistic payload keeps method/path", (realistic as any)?.method === "POST");
  check("realistic payload keeps non-sensitive nested fields", (realistic as any)?.body?.status === "submitted");
}

// ---------------------------------------------------------------------------
// 2. Static guard: no raw inserts into errorLogsTable outside the chokepoint
// ---------------------------------------------------------------------------
function runStaticGuard(): void {
  console.log("\n— static guard: raw errorLogsTable inserts outside lib/error-log.ts");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, "..", "src");
  const allowed = path.resolve(srcRoot, "lib", "error-log.ts");

  const offenders: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;
      if (path.resolve(full) === allowed) continue;
      const body = fs.readFileSync(full, "utf8");
      if (/\binsert\s*\(\s*errorLogsTable\b/.test(body)) {
        offenders.push(path.relative(srcRoot, full));
      }
    }
  }
  walk(srcRoot);

  check(
    "no raw db.insert(errorLogsTable) calls outside src/lib/error-log.ts",
    offenders.length === 0,
    offenders.length ? `offenders: ${offenders.join(", ")}` : "",
  );
}

// ---------------------------------------------------------------------------
// 3. Integration test: recordErrorLog persists a redacted row.
// ---------------------------------------------------------------------------
async function runIntegrationTest(): Promise<void> {
  if (!db) {
    console.log("\n— integration test skipped (DATABASE_URL not set)");
    return;
  }

  console.log("\n— integration: recordErrorLog persists redacted JSON");

  const marker = `task638-${crypto.randomBytes(6).toString("hex")}`;
  const route1 = `/__test__/${marker}/a`;
  const route2 = `/__test__/${marker}/b`;
  const route3 = `/__test__/${marker}/c`;

  try {
    // -- Write site #1: typical Express handler crash with PII in body.
    await recordErrorLog({
      userId: "42",
      errorMessage: `boom-${marker}`,
      errorStack: "Error: boom\n  at handler (app.ts:1:1)",
      route: route1,
      requestBody: {
        method: "POST",
        body: {
          status: "submitted",
          applicant: { legalName: "Acme School", einEncryptedRef: "vault:ein/abc" },
          passwordHash: "$2a$10$shouldNeverPersist",
          accessToken: "Bearer xyz",
        },
      },
    });

    // -- Write site #2: document verify, with storageRef in the diff.
    await recordErrorLog({
      userId: null,
      errorMessage: `doc-verify-${marker}`,
      route: route2,
      requestBody: {
        document: {
          id: 1,
          storageRef: "appstorage://uw/1/990.pdf",
          storage_ref: "appstorage://uw/1/990.pdf",
          bankAccountToken: "btok_should_not_persist",
        },
      },
    });

    // -- Write site #3: nested arrays.
    await recordErrorLog({
      userId: null,
      errorMessage: `snapshot-${marker}`,
      route: route3,
      requestBody: {
        documents: [
          { id: 1, storageRef: "leak1", displayName: "990" },
          { id: 2, storage_ref: "leak2", displayName: "other" },
        ],
      },
    });

    const rows = [
      ...(await db.select().from(errorLogsTable).where(eq(errorLogsTable.route, route1))),
      ...(await db.select().from(errorLogsTable).where(eq(errorLogsTable.route, route2))),
      ...(await db.select().from(errorLogsTable).where(eq(errorLogsTable.route, route3))),
    ];

    check("3 error_logs rows persisted", rows.length === 3, `got ${rows.length}`);

    for (const row of rows) {
      const leak = findForbiddenKey(row.requestBody);
      check(
        `row #${row.id} (${row.route}) — requestBody has no forbidden keys`,
        leak === null,
        leak ? `found ${leak}` : "",
      );
    }

    const row1 = rows.find((r) => r.route === route1);
    check(
      "row #1 preserved non-sensitive method/status fields",
      (row1?.requestBody as any)?.method === "POST" &&
        (row1?.requestBody as any)?.body?.status === "submitted",
    );
    check("row #1 preserved error_message", row1?.errorMessage === `boom-${marker}`);

    // Cleanup.
    for (const route of [route1, route2, route3]) {
      await db.delete(errorLogsTable).where(
        and(eq(errorLogsTable.route, route)),
      );
    }
  } catch (err) {
    failed++;
    failures.push(`  FAIL: integration test crashed — ${(err as Error).message}`);
    console.error("integration test crashed:", err);
    // Best-effort cleanup.
    for (const route of [route1, route2, route3]) {
      try {
        await db.delete(errorLogsTable).where(eq(errorLogsTable.route, route));
      } catch {
        /* ignore */
      }
    }
  }
}

async function main(): Promise<void> {
  runRedactorUnitTests();
  runStaticGuard();
  await runIntegrationTest();

  console.log(`\n${passed} passed / ${failed} failed`);
  if (failed > 0) {
    for (const line of failures) console.error(line);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("error-log-redaction test crashed:", err);
  process.exit(1);
});
