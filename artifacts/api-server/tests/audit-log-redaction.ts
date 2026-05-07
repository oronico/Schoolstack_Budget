// Task #621 — Catch accidental leaks of sensitive data in audit history.
//
// The `audit_log` table cannot enforce PII redaction at the schema
// level. Application code must strip sensitive fields from the
// before/after diffs before they're persisted.
//
// We funnel every write through `src/lib/audit-log.ts::recordAuditLog`
// (the only chokepoint). This test guards three things:
//
//   1. The redactor itself: every forbidden key is dropped from
//      arbitrarily nested payloads (objects, arrays, mixed casing).
//   2. The integration path: `recordAuditLog` actually persists a
//      redacted row when called with a payload containing forbidden
//      keys. Skipped if no DATABASE_URL.
//   3. Static guard: no production source file under `src/` does a
//      raw `db.insert(auditLogTable)` outside the chokepoint, which
//      would bypass the redactor.
//
// Add a new write site? It MUST call `recordAuditLog`. Add a new
// forbidden key? Add it to FORBIDDEN_AUDIT_KEYS in src/lib/audit-log.ts
// — this test reads that list directly.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  financialModelsTable,
  underwritingApplicationsTable,
  underwritingDocumentsTable,
  auditLogTable,
} from "@workspace/db/schema";
import {
  recordAuditLog,
  redactAuditPayload,
  FORBIDDEN_AUDIT_KEYS,
} from "../src/lib/audit-log.js";

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

// Recursively check that no key in the JSON tree matches one of the
// forbidden audit keys (case-insensitive).
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
      if (FORBIDDEN_AUDIT_KEYS.some((f) => f.toLowerCase() === k.toLowerCase())) {
        return [...trail, k].join(".");
      }
      const found = findForbiddenKey(v, [...trail, k]);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Unit tests for redactAuditPayload
// ---------------------------------------------------------------------------
function runRedactorUnitTests(): void {
  console.log("\n— redactor unit tests");

  // (a) Every documented forbidden key is dropped at the top level.
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    const out = redactAuditPayload({ keep: "me", [key]: "leak-" + key });
    check(
      `top-level "${key}" is stripped`,
      out !== null && !(key in out) && out.keep === "me",
      `out=${JSON.stringify(out)}`,
    );
  }

  // (b) Nested objects are walked.
  const nested = redactAuditPayload({
    application: {
      id: 7,
      document: {
        displayName: "FY24 990",
        storageRef: "appstorage://uw/7/990.pdf",
        contentSha256: "abc123",
      },
    },
  });
  check(
    "nested storageRef stripped",
    findForbiddenKey(nested) === null,
    `leftover=${findForbiddenKey(nested)}`,
  );
  const docOut = (nested as any)?.application?.document;
  check("nested non-sensitive fields preserved", docOut?.displayName === "FY24 990" && docOut?.contentSha256 === "abc123");

  // (c) Arrays of objects are walked.
  const arrayed = redactAuditPayload({
    documents: [
      { id: 1, storage_ref: "s3://a", displayName: "A" },
      { id: 2, storageRef: "s3://b", displayName: "B" },
    ],
  });
  check("array entries scrubbed", findForbiddenKey(arrayed) === null);
  check(
    "array entries keep id/displayName",
    Array.isArray((arrayed as any)?.documents) &&
      (arrayed as any).documents[0].id === 1 &&
      (arrayed as any).documents[1].displayName === "B",
  );

  // (d) Case-insensitive — `STORAGE_REF`, `Password_Hash`.
  const cased = redactAuditPayload({
    STORAGE_REF: "yes-still-leaks",
    Password_Hash: "$2a$...",
    EIN: "12-3456789",
    keep: 1,
  });
  check("case-insensitive redaction", findForbiddenKey(cased) === null && (cased as any)?.keep === 1);

  // (e) Null / undefined inputs return null cleanly.
  check("null input returns null", redactAuditPayload(null) === null);
  check("undefined input returns null", redactAuditPayload(undefined) === null);

  // (f) Realistic mixed payload — a status_change diff that the
  // route handler might naively pass through.
  const realistic = redactAuditPayload({
    status: "submitted",
    submittedAt: "2026-05-07T00:00:00Z",
    document: {
      id: 42,
      storageRef: "appstorage://uw/42.pdf",
      uploadedByUserId: 9,
    },
    applicant: {
      legalName: "Acme School",
      einEncryptedRef: "vault:ein/abc",
      ssnEncryptedRef: "vault:ssn/abc",
      bankAccountToken: "btok_123",
    },
    passwordHash: "$2a$10$....",
    accessToken: "Bearer xyz",
  });
  check(
    "realistic payload — no forbidden keys remain",
    findForbiddenKey(realistic) === null,
    `leftover=${findForbiddenKey(realistic)}`,
  );
  check("realistic payload keeps status", (realistic as any)?.status === "submitted");
  check("realistic payload keeps non-sensitive nested fields", (realistic as any)?.document?.id === 42);
}

// ---------------------------------------------------------------------------
// 2. Static guard: no raw inserts into auditLogTable outside the chokepoint
// ---------------------------------------------------------------------------
function runStaticGuard(): void {
  console.log("\n— static guard: raw auditLogTable inserts outside lib/audit-log.ts");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, "..", "src");
  const allowed = path.resolve(srcRoot, "lib", "audit-log.ts");

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
      // Catches `db.insert(auditLogTable)` as well as
      // `someTx.insert(auditLogTable)` patterns.
      if (/\binsert\s*\(\s*auditLogTable\b/.test(body)) {
        offenders.push(path.relative(srcRoot, full));
      }
    }
  }
  walk(srcRoot);

  check(
    "no raw db.insert(auditLogTable) calls outside src/lib/audit-log.ts",
    offenders.length === 0,
    offenders.length ? `offenders: ${offenders.join(", ")}` : "",
  );
}

// ---------------------------------------------------------------------------
// 3. Integration test: recordAuditLog persists a redacted row.
// ---------------------------------------------------------------------------
async function runIntegrationTest(): Promise<void> {
  if (!db) {
    console.log("\n— integration test skipped (DATABASE_URL not set)");
    return;
  }

  console.log("\n— integration: recordAuditLog persists redacted JSON");

  const email = `task621-${crypto.randomBytes(4).toString("hex")}@example.com`;
  let userId: number | null = null;
  let modelId: number | null = null;
  let applicationId: number | null = null;
  let documentId: number | null = null;

  try {
    const passwordHash = await bcrypt.hash("audit-redaction-test", 10);
    const [user] = await db
      .insert(usersTable)
      .values({ email, name: "Task 621 Redaction", passwordHash })
      .returning({ id: usersTable.id });
    userId = user.id;

    const [model] = await db
      .insert(financialModelsTable)
      .values({ userId: user.id, name: "audit redaction test", data: {} })
      .returning({ id: financialModelsTable.id });
    modelId = model.id;

    const [application] = await db
      .insert(underwritingApplicationsTable)
      .values({
        userId: user.id,
        financialModelId: model.id,
        loanPurpose: "facility acquisition",
        requestedAmountCents: 500_000_00,
        requestedTermMonths: 60,
      })
      .returning({ id: underwritingApplicationsTable.id });
    applicationId = application.id;

    const [document] = await db
      .insert(underwritingDocumentsTable)
      .values({
        applicationId: application.id,
        documentType: "tax_return",
        displayName: "FY24 990",
        storageRef: `appstorage://uw/${application.id}/990.pdf`,
        contentSha256: crypto.createHash("sha256").update("audit").digest("hex"),
        byteSize: 4242,
        mimeType: "application/pdf",
        uploadedByUserId: user.id,
      })
      .returning({ id: underwritingDocumentsTable.id });
    documentId = document.id;

    // -- Write site #1: status_change on an application, with PII in the diff.
    await recordAuditLog({
      actorUserId: user.id,
      actorRole: "user",
      entityType: "underwriting_application",
      entityId: application.id,
      action: "status_change",
      before: {
        status: "draft",
        applicant: { legalName: "Acme School", einEncryptedRef: "vault:ein/abc" },
      },
      after: {
        status: "submitted",
        applicant: { legalName: "Acme School", einEncryptedRef: "vault:ein/abc" },
        passwordHash: "$2a$10$shouldNeverPersist",
      },
      note: "submitted with PII in payload",
    });

    // -- Write site #2: document verify, with storageRef in the diff.
    await recordAuditLog({
      actorUserId: user.id,
      actorRole: "underwriter",
      entityType: "underwriting_document",
      entityId: document.id,
      action: "verify",
      before: {
        verificationStatus: "uploaded",
        storageRef: `appstorage://uw/${application.id}/990.pdf`,
      },
      after: {
        verificationStatus: "verified",
        storage_ref: `appstorage://uw/${application.id}/990.pdf`,
        bankAccountToken: "btok_should_not_persist",
      },
      note: "verified",
    });

    // -- Write site #3: nested arrays.
    await recordAuditLog({
      actorUserId: null,
      actorRole: null,
      entityType: "underwriting_application",
      entityId: application.id,
      action: "snapshot",
      after: {
        snapshotKind: "intake",
        documents: [
          { id: document.id, storageRef: "leak1", displayName: "990" },
          { id: 999, storage_ref: "leak2", displayName: "other" },
        ],
      },
    });

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "underwriting_application"),
          eq(auditLogTable.entityId, application.id),
        ),
      );
    const docRows = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "underwriting_document"),
          eq(auditLogTable.entityId, document.id),
        ),
      );
    const allRows = [...rows, ...docRows];

    check("3 audit rows persisted", allRows.length === 3, `got ${allRows.length}`);

    for (const row of allRows) {
      const beforeLeak = findForbiddenKey(row.before);
      const afterLeak = findForbiddenKey(row.after);
      check(
        `row #${row.id} (${row.entityType}/${row.action}) — before has no forbidden keys`,
        beforeLeak === null,
        beforeLeak ? `found ${beforeLeak}` : "",
      );
      check(
        `row #${row.id} (${row.entityType}/${row.action}) — after has no forbidden keys`,
        afterLeak === null,
        afterLeak ? `found ${afterLeak}` : "",
      );
    }

    // Sanity: the non-sensitive fields survived the redaction.
    const statusRow = rows.find((r) => r.action === "status_change");
    check(
      "status_change row preserved status field",
      (statusRow?.after as any)?.status === "submitted" &&
        (statusRow?.before as any)?.status === "draft",
    );
    const verifyRow = docRows.find((r) => r.action === "verify");
    check(
      "verify row preserved verificationStatus field",
      (verifyRow?.after as any)?.verificationStatus === "verified",
    );

    // Cleanup audit rows by hand (no FK to entities). Scope by
    // (entityType, entityId) so we never sweep up rows owned by
    // another entity that happens to share an id.
    await db.delete(auditLogTable).where(
      and(
        eq(auditLogTable.entityType, "underwriting_application"),
        eq(auditLogTable.entityId, application.id),
      ),
    );
    await db.delete(auditLogTable).where(
      and(
        eq(auditLogTable.entityType, "underwriting_document"),
        eq(auditLogTable.entityId, document.id),
      ),
    );
  } finally {
    if (applicationId !== null) {
      await db.delete(underwritingApplicationsTable).where(eq(underwritingApplicationsTable.id, applicationId));
    }
    if (modelId !== null) {
      await db.delete(financialModelsTable).where(eq(financialModelsTable.id, modelId));
    }
    if (userId !== null) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
    void documentId;
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
  console.error("audit-log-redaction test crashed:", err);
  process.exit(1);
});
