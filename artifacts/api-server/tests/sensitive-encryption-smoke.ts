// Task #620 — Smoke test for the sensitive-borrower-id encryption
// helper + Phase 2 borrower_entities / founder_profiles schemas.
//
// Verifies, in order:
//   1. encryptSensitive(raw) returns last-4 + opaque encrypted ref;
//      raw value never appears anywhere in the returned shape.
//   2. decryptSensitive round-trips the raw value back, but only when
//      called with a server-internal role and a non-empty purpose.
//   3. Founder/borrower-style roles cannot decrypt.
//   4. Tampering with the ciphertext (flipping a byte) fails AEAD
//      verification rather than returning garbled plaintext.
//   5. Two encryptions of the same raw value produce DIFFERENT
//      encrypted refs (random DEK + IVs).
//   6. borrower_entities + founder_profiles round-trip through
//      Postgres carrying only ciphertext + last-4. We then re-read the
//      rows and confirm the raw value cannot be recovered from any
//      column except via decryptSensitive.
//
// Cleans up everything it inserts.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  borrowerEntitiesTable,
  founderProfilesTable,
} from "@workspace/db/schema";
import {
  encryptSensitive,
  decryptSensitive,
  SensitiveDecryptionForbiddenError,
} from "../src/lib/sensitive-encryption.js";

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

function expectThrow(label: string, fn: () => unknown, predicate: (err: unknown) => boolean): void {
  try {
    fn();
    check(label, false, "expected to throw, did not");
  } catch (err) {
    check(label, predicate(err), `wrong error type: ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
  }
}

const RAW_EIN = "12-3456789";
const RAW_SSN = "123-45-6789";

function refContainsRaw(ref: string, raw: string): boolean {
  // Naive but adequate: the ref is base64-packed JSON. Decode every
  // string field and look for the raw value (and its digits-only form)
  // anywhere in the bytes.
  const digits = raw.replace(/\D+/g, "");
  if (ref.includes(raw) || ref.includes(digits)) return true;
  try {
    const body = ref.split(":", 2)[1] ?? "";
    const decoded = Buffer.from(body, "base64").toString("utf8");
    if (decoded.includes(raw) || decoded.includes(digits)) return true;
    // Decode each base64 field too.
    const obj = JSON.parse(decoded) as Record<string, string>;
    for (const v of Object.values(obj)) {
      if (typeof v !== "string") continue;
      try {
        const bytes = Buffer.from(v, "base64");
        if (bytes.includes(Buffer.from(raw, "utf8"))) return true;
        if (bytes.includes(Buffer.from(digits, "utf8"))) return true;
      } catch {
        /* not base64 */
      }
    }
  } catch {
    /* not JSON */
  }
  return false;
}

async function main(): Promise<void> {
  console.log("\n— encryptSensitive / decryptSensitive");

  const ein = encryptSensitive(RAW_EIN);
  check("EIN last-4 derived correctly", ein.last4 === "6789", `got ${ein.last4}`);
  check("EIN encrypted ref uses v1 envelope", ein.encryptedRef.startsWith("v1:"));
  check("EIN encrypted ref does not leak raw digits", !refContainsRaw(ein.encryptedRef, RAW_EIN));

  const ssn = encryptSensitive(RAW_SSN);
  check("SSN last-4 derived correctly", ssn.last4 === "6789", `got ${ssn.last4}`);
  check("SSN encrypted ref does not leak raw digits", !refContainsRaw(ssn.encryptedRef, RAW_SSN));

  const ein2 = encryptSensitive(RAW_EIN);
  check("Re-encrypting the same value produces a different ref", ein.encryptedRef !== ein2.encryptedRef);

  const recovered = decryptSensitive(ein.encryptedRef, { actorRole: "underwriter", purpose: "smoke test" });
  check("decryptSensitive round-trips the raw EIN", recovered === RAW_EIN, `got ${recovered}`);

  const recoveredSsn = decryptSensitive(ssn.encryptedRef, { actorRole: "system", purpose: "smoke test" });
  check("decryptSensitive round-trips the raw SSN", recoveredSsn === RAW_SSN);

  console.log("\n— role gating");
  expectThrow(
    "founder role cannot decrypt",
    () => decryptSensitive(ein.encryptedRef, { actorRole: "user", purpose: "leak attempt" }),
    (e) => e instanceof SensitiveDecryptionForbiddenError,
  );
  expectThrow(
    "anonymous/empty role cannot decrypt",
    () => decryptSensitive(ein.encryptedRef, { actorRole: "", purpose: "leak attempt" }),
    (e) => e instanceof SensitiveDecryptionForbiddenError,
  );
  expectThrow(
    "missing purpose is rejected",
    () => decryptSensitive(ein.encryptedRef, { actorRole: "admin", purpose: "" }),
    (e) => e instanceof SensitiveDecryptionForbiddenError,
  );

  console.log("\n— ciphertext tampering");
  // Flip a byte deep in the wrapped DEK so AES-GCM auth-tag check fails.
  const tampered = (() => {
    const body = ein.encryptedRef.slice(3);
    const decoded = JSON.parse(Buffer.from(body, "base64").toString("utf8")) as Record<string, string>;
    const ct = Buffer.from(decoded.dataCt, "base64");
    ct[0] = ct[0] ^ 0xff;
    decoded.dataCt = ct.toString("base64");
    return `v1:${Buffer.from(JSON.stringify(decoded), "utf8").toString("base64")}`;
  })();
  expectThrow(
    "tampered ciphertext fails AEAD",
    () => decryptSensitive(tampered, { actorRole: "underwriter", purpose: "smoke test" }),
    (e) => e instanceof Error,
  );

  console.log("\n— DB round-trip (Postgres only sees ciphertext + last-4)");
  if (!db) {
    console.log("  (skipped — DATABASE_URL not configured)");
  } else {
    let userId: number | null = null;
    let entityId: number | null = null;
    let profileId: number | null = null;
    try {
      const passwordHash = await bcrypt.hash("smoke-only", 10);
      const [user] = await db
        .insert(usersTable)
        .values({
          email: `task620-${crypto.randomBytes(4).toString("hex")}@example.com`,
          name: "Task 620 Smoke",
          passwordHash,
        })
        .returning({ id: usersTable.id });
      userId = user.id;

      const [entity] = await db
        .insert(borrowerEntitiesTable)
        .values({
          legalName: "Smoke Charter School Inc.",
          entityType: "nonprofit_501c3",
          stateOfFormation: "TX",
          einLast4: ein.last4,
          einEncryptedRef: ein.encryptedRef,
        })
        .returning();
      entityId = entity.id;

      const [profile] = await db
        .insert(founderProfilesTable)
        .values({
          userId: user.id,
          legalFirstName: "Pat",
          legalLastName: "Founder",
          ssnLast4: ssn.last4,
          ssnEncryptedRef: ssn.encryptedRef,
          kycStatus: "pending",
        })
        .returning();
      profileId = profile.id;

      // Re-read both rows and inspect every column for the raw value.
      const [reEntity] = await db
        .select()
        .from(borrowerEntitiesTable)
        .where(eq(borrowerEntitiesTable.id, entity.id));
      check("borrower_entities row round-trips", reEntity?.id === entity.id);
      check("borrower_entities ein_last_4 stored", reEntity?.einLast4 === ein.last4);
      check(
        "borrower_entities row contains NO raw EIN in any column",
        !Object.values(reEntity ?? {}).some(
          (v) => typeof v === "string" && refContainsRaw(v, RAW_EIN) && v !== reEntity?.einEncryptedRef
            ? true
            : typeof v === "string" && (v.includes(RAW_EIN) || v.includes(RAW_EIN.replace(/\D+/g, ""))),
        ),
      );
      // Belt-and-suspenders: explicitly assert the encrypted ref column
      // does not contain the raw value either (refContainsRaw walks the
      // base64 envelope, not just the surface string).
      check(
        "borrower_entities ein_encrypted_ref does not leak raw digits",
        !refContainsRaw(reEntity?.einEncryptedRef ?? "", RAW_EIN),
      );

      const [reProfile] = await db
        .select()
        .from(founderProfilesTable)
        .where(eq(founderProfilesTable.id, profile.id));
      check("founder_profiles row round-trips", reProfile?.id === profile.id);
      check("founder_profiles ssn_last_4 stored", reProfile?.ssnLast4 === ssn.last4);
      check(
        "founder_profiles ssn_encrypted_ref does not leak raw digits",
        !refContainsRaw(reProfile?.ssnEncryptedRef ?? "", RAW_SSN),
      );

      // Decrypt back from the persisted refs to confirm end-to-end.
      const reRecoveredEin = decryptSensitive(reEntity!.einEncryptedRef!, {
        actorRole: "underwriter",
        purpose: "smoke verification",
      });
      check("EIN round-trips through Postgres", reRecoveredEin === RAW_EIN);
      const reRecoveredSsn = decryptSensitive(reProfile!.ssnEncryptedRef!, {
        actorRole: "system",
        purpose: "smoke verification",
      });
      check("SSN round-trips through Postgres", reRecoveredSsn === RAW_SSN);
    } finally {
      if (profileId !== null) {
        await db.delete(founderProfilesTable).where(eq(founderProfilesTable.id, profileId));
      }
      if (entityId !== null) {
        await db.delete(borrowerEntitiesTable).where(eq(borrowerEntitiesTable.id, entityId));
      }
      if (userId !== null) {
        await db.delete(usersTable).where(eq(usersTable.id, userId));
      }
    }
  }

  console.log(`\n${passed} passed / ${failed} failed`);
  if (failed > 0) {
    for (const line of failures) console.error(line);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
