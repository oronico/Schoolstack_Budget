// Task #787 — Guard rails for the audited decrypt wrapper.
//
// `decryptSensitive` (Task #620) is the only way to recover a raw
// EIN / SSN from the Phase 2 borrower tables. To make sure every
// production call site leaves an audit trail, application code must
// go through `decryptSensitiveAndAudit` (Task #787). This test:
//
//   1. Static guard — fails the build if any production source file
//      under `src/` calls `decryptSensitive` directly outside the
//      wrapper file (`src/lib/decrypt-sensitive-and-audit.ts`) and
//      the helper itself (`src/lib/sensitive-encryption.ts`).
//   2. Integration — exercises the wrapper end-to-end and asserts:
//        - the returned plaintext matches the original raw value;
//        - exactly one new `audit_log` row is written, with
//          action='decrypt', the actor + role, the entity ref, and
//          the purpose surfaced in the `after` payload;
//        - that row contains NO plaintext anywhere (no raw value, no
//          ciphertext, no encrypted ref) — the redactor strips
//          encrypted refs, and we never hand it the plaintext.
//      Skipped if DATABASE_URL is not set.
//   3. Validation — the wrapper rejects empty purpose / role / entity
//      ref so a careless caller cannot bypass the audit metadata.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  borrowerEntitiesTable,
  auditLogTable,
} from "@workspace/db/schema";
import { encryptSensitive } from "../src/lib/sensitive-encryption.js";
import {
  decryptSensitiveAndAudit,
  DecryptAndAuditError,
} from "../src/lib/decrypt-sensitive-and-audit.js";

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

async function expectReject(
  label: string,
  fn: () => Promise<unknown>,
  predicate: (err: unknown) => boolean,
): Promise<void> {
  try {
    await fn();
    check(label, false, "expected to reject, did not");
  } catch (err) {
    check(
      label,
      predicate(err),
      `wrong error type: ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Static guard
// ---------------------------------------------------------------------------
function runStaticGuard(): void {
  console.log("\n— static guard: raw decryptSensitive calls outside the wrapper");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, "..", "src");
  const allowed = new Set([
    path.resolve(srcRoot, "lib", "decrypt-sensitive-and-audit.ts"),
    path.resolve(srcRoot, "lib", "sensitive-encryption.ts"),
  ]);

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
      if (allowed.has(path.resolve(full))) continue;
      const body = fs.readFileSync(full, "utf8");
      // Catches both bare calls and namespace-qualified calls
      // (e.g. `mod.decryptSensitive(...)`). Excludes the audited
      // wrapper name itself.
      const callPattern = /(?<![A-Za-z0-9_])decryptSensitive\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(body)) !== null) {
        // Skip the wrapper name `decryptSensitiveAndAudit` — the regex
        // above already requires `decryptSensitive(` (with an open
        // paren immediately after) so the wrapper is not matched, but
        // be defensive.
        offenders.push(`${path.relative(srcRoot, full)} (offset ${match.index})`);
      }
    }
  }
  walk(srcRoot);

  check(
    "no raw decryptSensitive(...) calls outside the audited wrapper",
    offenders.length === 0,
    offenders.length ? `offenders: ${offenders.join(", ")}` : "",
  );
}

// ---------------------------------------------------------------------------
// 2. Validation tests (no DB needed)
// ---------------------------------------------------------------------------
async function runValidationTests(): Promise<void> {
  console.log("\n— validation: wrapper rejects missing audit metadata");

  const ref = encryptSensitive("12-3456789").encryptedRef;

  await expectReject(
    "empty purpose is rejected",
    () =>
      decryptSensitiveAndAudit({
        encryptedRef: ref,
        actorRole: "underwriter",
        purpose: "   ",
        entityType: "borrower_entity",
        entityId: 1,
      }),
    (e) => e instanceof DecryptAndAuditError,
  );

  await expectReject(
    "empty actorRole is rejected",
    () =>
      decryptSensitiveAndAudit({
        encryptedRef: ref,
        actorRole: "",
        purpose: "kyc submission",
        entityType: "borrower_entity",
        entityId: 1,
      }),
    (e) => e instanceof DecryptAndAuditError,
  );

  await expectReject(
    "empty entityType is rejected",
    () =>
      decryptSensitiveAndAudit({
        encryptedRef: ref,
        actorRole: "underwriter",
        purpose: "kyc submission",
        entityType: "",
        entityId: 1,
      }),
    (e) => e instanceof DecryptAndAuditError,
  );

  await expectReject(
    "non-positive entityId is rejected",
    () =>
      decryptSensitiveAndAudit({
        encryptedRef: ref,
        actorRole: "underwriter",
        purpose: "kyc submission",
        entityType: "borrower_entity",
        entityId: 0,
      }),
    (e) => e instanceof DecryptAndAuditError,
  );
}

// ---------------------------------------------------------------------------
// 3. Integration: wrapper writes a redacted audit row + returns plaintext
// ---------------------------------------------------------------------------
function payloadContains(value: unknown, needle: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.includes(needle);
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.some((v) => payloadContains(v, needle));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) =>
      payloadContains(v, needle),
    );
  }
  return false;
}

async function runIntegrationTest(): Promise<void> {
  if (!db) {
    console.log("\n— integration test skipped (DATABASE_URL not set)");
    return;
  }

  console.log("\n— integration: decryptSensitiveAndAudit writes a redacted audit row");

  const RAW_EIN = "98-7654321";
  const { last4, encryptedRef } = encryptSensitive(RAW_EIN);

  let userId: number | null = null;
  let entityId: number | null = null;

  try {
    const passwordHash = await bcrypt.hash("task-787", 10);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: `task787-${crypto.randomBytes(4).toString("hex")}@example.com`,
        name: "Task 787 Audit Wrapper",
        passwordHash,
      })
      .returning({ id: usersTable.id });
    userId = user.id;

    const [entity] = await db
      .insert(borrowerEntitiesTable)
      .values({
        legalName: "Task 787 Charter School Inc.",
        entityType: "nonprofit_501c3",
        stateOfFormation: "TX",
        einLast4: last4,
        einEncryptedRef: encryptedRef,
      })
      .returning({ id: borrowerEntitiesTable.id });
    entityId = entity.id;

    const PURPOSE = "kyc submission to vendor";

    const plaintext = await decryptSensitiveAndAudit({
      encryptedRef,
      actorUserId: user.id,
      actorRole: "underwriter",
      purpose: PURPOSE,
      entityType: "borrower_entity",
      entityId: entity.id,
      note: "test run",
    });

    check("wrapper returns the original raw value", plaintext === RAW_EIN, `got ${plaintext}`);

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "borrower_entity"),
          eq(auditLogTable.entityId, entity.id),
        ),
      );

    check("exactly one audit row written for this entity", rows.length === 1, `got ${rows.length}`);
    const row = rows[0];

    check("audit row action is 'decrypt'", row?.action === "decrypt", `got ${row?.action}`);
    check("audit row records actor user id", row?.actorUserId === user.id);
    check("audit row records actor role", row?.actorRole === "underwriter");
    check("audit row records entity id", row?.entityId === entity.id);
    check("audit row records note", row?.note === "test run");
    check(
      "audit row 'after' payload surfaces the purpose",
      (row?.after as any)?.purpose === PURPOSE,
      `got ${JSON.stringify(row?.after)}`,
    );

    // Negative checks: nothing sensitive made it into the row.
    check(
      "audit row contains no raw EIN plaintext",
      !payloadContains(row?.before, RAW_EIN) &&
        !payloadContains(row?.after, RAW_EIN) &&
        !payloadContains(row?.note, RAW_EIN),
    );
    check(
      "audit row contains no raw EIN digits",
      !payloadContains(row?.before, "987654321") &&
        !payloadContains(row?.after, "987654321") &&
        !payloadContains(row?.note, "987654321"),
    );
    check(
      "audit row contains no encrypted ref ciphertext",
      !payloadContains(row?.before, encryptedRef) &&
        !payloadContains(row?.after, encryptedRef) &&
        !payloadContains(row?.note, encryptedRef),
    );

    // Cleanup audit rows by hand (no FK).
    await db
      .delete(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "borrower_entity"),
          eq(auditLogTable.entityId, entity.id),
        ),
      );
  } finally {
    if (entityId !== null) {
      await db.delete(borrowerEntitiesTable).where(eq(borrowerEntitiesTable.id, entityId));
    }
    if (userId !== null) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }
}

async function main(): Promise<void> {
  runStaticGuard();
  await runValidationTests();
  await runIntegrationTest();

  console.log(`\n${passed} passed / ${failed} failed`);
  if (failed > 0) {
    for (const line of failures) console.error(line);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("decrypt-sensitive-audit-wrapper test crashed:", err);
  process.exit(1);
});
