// Task #788 — Smoke test for KEK rotation on sensitive borrower data.
//
// Walks the full rotation lifecycle end-to-end:
//   1. Encrypt some borrower rows under KEK_A.
//   2. Swap the active KEK to KEK_B and move KEK_A into
//      `SENSITIVE_ENCRYPTION_KEY_PREVIOUS`. Confirm the rows still
//      decrypt (helper transparently picks KEK_A by `kekId`).
//   3. Run the rotation script in dry-run mode and confirm it would
//      re-wrap the right number of rows without writing.
//   4. Run the rotation script in execute mode and confirm rows are
//      re-wrapped with the new `kekId`.
//   5. Drop `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` entirely and confirm
//      every row still decrypts under KEK_B alone — i.e. the old KEK
//      can be safely retired from the deployment env.
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

const KEK_A = crypto.randomBytes(32).toString("hex");
const KEK_B = crypto.randomBytes(32).toString("hex");
const KEK_C = crypto.randomBytes(32).toString("hex"); // unrelated, never loaded

const RAW_EIN = "98-7654321";
const RAW_SSN = "987-65-4321";

// Each module load of `sensitive-encryption.ts` snapshots whatever
// env vars existed at import time inside its `loadKek` helpers. The
// helpers re-read process.env on every call, so we just need to set
// the env vars BEFORE invoking helpers — but we do need a fresh
// import of the rotation script per env-state since it imports the
// helper. Use dynamic import with cache-busting by clearing the
// module cache between phases. Since this is ESM and tsx compiles to
// ESM, `import()` will memoize; instead, every helper call re-reads
// process.env so a single static import is fine.
async function loadModules() {
  const enc = await import("../src/lib/sensitive-encryption.js");
  const rot = await import("../src/scripts/rotate-sensitive-encryption-key.js");
  return { enc, rot };
}

function setEnv(active: string | undefined, previous: string | undefined): void {
  if (active === undefined) {
    delete process.env.SENSITIVE_ENCRYPTION_KEY;
  } else {
    process.env.SENSITIVE_ENCRYPTION_KEY = active;
  }
  if (previous === undefined) {
    delete process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS;
  } else {
    process.env.SENSITIVE_ENCRYPTION_KEY_PREVIOUS = previous;
  }
}

async function main(): Promise<void> {
  const { enc, rot } = await loadModules();

  console.log("\n— phase 1: encrypt rows under KEK_A");
  setEnv(KEK_A, undefined);
  const kekIdA = enc.getActiveKekId();
  const ein = enc.encryptSensitive(RAW_EIN);
  const ssn = enc.encryptSensitive(RAW_SSN);
  check("EIN ref tagged with KEK_A id", enc.readKekIdFromRef(ein.encryptedRef) === kekIdA);
  check("SSN ref tagged with KEK_A id", enc.readKekIdFromRef(ssn.encryptedRef) === kekIdA);

  console.log("\n— phase 2: swap to KEK_B with KEK_A as previous");
  setEnv(KEK_B, KEK_A);
  const kekIdB = enc.getActiveKekId();
  check("active KEK id is now KEK_B", kekIdB !== kekIdA);
  check(
    "loaded KEK ids contain both B (active first) and A",
    JSON.stringify(enc.listLoadedKekIds()) === JSON.stringify([kekIdB, kekIdA]),
  );

  // Reads still work because KEK_A is in the previous list.
  const recoveredEin = enc.decryptSensitive(ein.encryptedRef, {
    actorRole: "underwriter",
    purpose: "rotation smoke",
  });
  check("EIN still decrypts under previous KEK", recoveredEin === RAW_EIN);
  const recoveredSsn = enc.decryptSensitive(ssn.encryptedRef, {
    actorRole: "system",
    purpose: "rotation smoke",
  });
  check("SSN still decrypts under previous KEK", recoveredSsn === RAW_SSN);

  console.log("\n— phase 3: previous list as JSON array also works");
  setEnv(KEK_B, JSON.stringify([KEK_A, KEK_C]));
  check("loaded KEK ids include all three", enc.listLoadedKekIds().length === 3);
  const recoveredAgain = enc.decryptSensitive(ein.encryptedRef, {
    actorRole: "system",
    purpose: "rotation smoke",
  });
  check("EIN decrypts when previous list is JSON array", recoveredAgain === RAW_EIN);

  // Restore the simple single-key previous form for the DB phase.
  setEnv(KEK_B, KEK_A);

  console.log("\n— phase 4: missing KEK is reported clearly");
  setEnv(KEK_C, undefined);
  let raisedHelpfulError = false;
  try {
    enc.decryptSensitive(ein.encryptedRef, { actorRole: "system", purpose: "rotation smoke" });
  } catch (err) {
    raisedHelpfulError =
      err instanceof enc.SensitiveEncryptionError &&
      /not loaded/i.test((err as Error).message) &&
      (err as Error).message.includes(kekIdA);
  }
  check("missing KEK raises a helpful error pointing at the absent kekId", raisedHelpfulError);

  // Reset for the DB phase.
  setEnv(KEK_B, KEK_A);

  console.log("\n— phase 5: rotation script re-wraps DB rows end-to-end");
  if (!db) {
    console.log("  (skipped — DATABASE_URL not configured)");
  } else {
    let userId: number | null = null;
    let entityId: number | null = null;
    let profileId: number | null = null;
    try {
      // Insert two rows that were encrypted under KEK_A while KEK_B is
      // now active — this is the realistic mid-rotation state.
      const passwordHash = await bcrypt.hash("rotation-only", 10);
      const [user] = await db
        .insert(usersTable)
        .values({
          email: `task788-${crypto.randomBytes(4).toString("hex")}@example.com`,
          name: "Task 788 Rotation Smoke",
          passwordHash,
        })
        .returning({ id: usersTable.id });
      userId = user.id;

      const [entity] = await db
        .insert(borrowerEntitiesTable)
        .values({
          legalName: "Rotation Smoke Charter Inc.",
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
          legalFirstName: "Rotation",
          legalLastName: "Founder",
          ssnLast4: ssn.last4,
          ssnEncryptedRef: ssn.encryptedRef,
          kycStatus: "pending",
        })
        .returning();
      profileId = profile.id;

      // Dry run: should report 1 row to re-wrap per table, write nothing.
      const dry = await rot.runRotation({ execute: false, limit: Number.POSITIVE_INFINITY });
      const dryBorrower = dry.results.find((r) => r.table === "borrower_entities");
      const dryFounder = dry.results.find((r) => r.table === "founder_profiles");
      check(
        "dry run identifies borrower_entities row needing rotation",
        (dryBorrower?.rewrapped ?? 0) >= 1 && (dryBorrower?.failed ?? 0) === 0,
      );
      check(
        "dry run identifies founder_profiles row needing rotation",
        (dryFounder?.rewrapped ?? 0) >= 1 && (dryFounder?.failed ?? 0) === 0,
      );

      // Confirm dry run did NOT actually write — kekId should still be A.
      const [stillOldEntity] = await db
        .select({ ref: borrowerEntitiesTable.einEncryptedRef })
        .from(borrowerEntitiesTable)
        .where(eq(borrowerEntitiesTable.id, entityId));
      check(
        "dry run leaves borrower_entities row on old KEK",
        enc.readKekIdFromRef(stillOldEntity!.ref!) === kekIdA,
      );

      // Execute: actually re-wrap.
      const exec = await rot.runRotation({ execute: true, limit: Number.POSITIVE_INFINITY });
      const execBorrower = exec.results.find((r) => r.table === "borrower_entities");
      const execFounder = exec.results.find((r) => r.table === "founder_profiles");
      check(
        "execute re-wraps borrower_entities row with no failures",
        (execBorrower?.rewrapped ?? 0) >= 1 && (execBorrower?.failed ?? 0) === 0,
      );
      check(
        "execute re-wraps founder_profiles row with no failures",
        (execFounder?.rewrapped ?? 0) >= 1 && (execFounder?.failed ?? 0) === 0,
      );

      // After execute, the row's kekId should be KEK_B and the last-4
      // should be unchanged.
      const [reEntity] = await db
        .select()
        .from(borrowerEntitiesTable)
        .where(eq(borrowerEntitiesTable.id, entityId));
      check("re-wrapped borrower_entities row carries new KEK id", enc.readKekIdFromRef(reEntity!.einEncryptedRef!) === kekIdB);
      check("borrower_entities ein_last_4 unchanged after rotation", reEntity!.einLast4 === ein.last4);

      const [reProfile] = await db
        .select()
        .from(founderProfilesTable)
        .where(eq(founderProfilesTable.id, profileId));
      check("re-wrapped founder_profiles row carries new KEK id", enc.readKekIdFromRef(reProfile!.ssnEncryptedRef!) === kekIdB);
      check("founder_profiles ssn_last_4 unchanged after rotation", reProfile!.ssnLast4 === ssn.last4);

      // Phase 6: retire KEK_A and confirm reads still work.
      setEnv(KEK_B, undefined);
      const finalEin = enc.decryptSensitive(reEntity!.einEncryptedRef!, {
        actorRole: "underwriter",
        purpose: "post-rotation verification",
      });
      check("EIN reads back with new KEK only after rotation", finalEin === RAW_EIN);
      const finalSsn = enc.decryptSensitive(reProfile!.ssnEncryptedRef!, {
        actorRole: "system",
        purpose: "post-rotation verification",
      });
      check("SSN reads back with new KEK only after rotation", finalSsn === RAW_SSN);

      // And a second pass of the rotation script should be a no-op.
      setEnv(KEK_B, undefined);
      const noop = await rot.runRotation({ execute: true, limit: Number.POSITIVE_INFINITY });
      const allOnActive = noop.results.every(
        (r) => r.rewrapped === 0 && r.failed === 0,
      );
      check("re-running rotation after retirement is a no-op", allOnActive);
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
  console.error("rotation smoke test crashed:", err);
  process.exit(1);
});
