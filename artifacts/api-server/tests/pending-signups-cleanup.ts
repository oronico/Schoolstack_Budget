// Task #535 — pending_signups retention sweeper.
//
// The /auth/register endpoint inserts a row into pending_signups for
// every register attempt with a 1h verification token; without a
// sweeper that table grows monotonically (and keeps a bcrypt'd
// password hash for every abandoned signup). cleanupExpiredPendingSignups
// is wired into the same 5-minute interval the rate-limiter and
// error-logs sweepers run on.
//
// This integration test pins three behaviours:
//   1. Rows whose verificationTokenExpiry is in the past are deleted.
//   2. Rows whose verificationTokenExpiry is in the future are kept.
//   3. /auth/verify-email already deletes the pending row after
//      promotion — so a successful verification leaves the table
//      clean even before the sweeper runs.

import http from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { pendingSignupsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app.js";
import { cleanupExpiredPendingSignups } from "../src/routes/auth.js";

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

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => resolve()),
      ),
  };
}

const TEST_EMAILS = [
  "task535-expired@example.com",
  "task535-fresh@example.com",
  "task535-verify@example.com",
];

async function purgeTestRows(): Promise<void> {
  await db.delete(pendingSignupsTable).where(inArray(pendingSignupsTable.email, TEST_EMAILS));
  await db.delete(usersTable).where(inArray(usersTable.email, TEST_EMAILS));
}

async function testSweeperDropsExpiredKeepsFresh(): Promise<void> {
  console.log("\n— sweeper drops expired rows, keeps fresh ones");
  await purgeTestRows();

  const passwordHash = await bcrypt.hash("anything-strong-enough", 10);

  // Expired: token expiry one minute in the past.
  await db.insert(pendingSignupsTable).values({
    email: "task535-expired@example.com",
    name: "Expired Founder",
    passwordHash,
    verificationToken: crypto.randomBytes(16).toString("hex"),
    verificationTokenExpiry: new Date(Date.now() - 60_000),
  });

  // Fresh: token expiry well in the future.
  await db.insert(pendingSignupsTable).values({
    email: "task535-fresh@example.com",
    name: "Fresh Founder",
    passwordHash,
    verificationToken: crypto.randomBytes(16).toString("hex"),
    verificationTokenExpiry: new Date(Date.now() + 30 * 60_000),
  });

  const deleted = await cleanupExpiredPendingSignups();
  check("sweeper reports at least one deletion", deleted >= 1, `got ${deleted}`);

  const expiredAfter = await db
    .select({ id: pendingSignupsTable.id })
    .from(pendingSignupsTable)
    .where(eq(pendingSignupsTable.email, "task535-expired@example.com"));
  check("expired pending signup is gone", expiredAfter.length === 0, `found ${expiredAfter.length} rows`);

  const freshAfter = await db
    .select({ id: pendingSignupsTable.id })
    .from(pendingSignupsTable)
    .where(eq(pendingSignupsTable.email, "task535-fresh@example.com"));
  check("fresh pending signup is preserved", freshAfter.length === 1, `found ${freshAfter.length} rows`);

  await purgeTestRows();
}

async function testVerifyEmailRemovesPendingRow(baseUrl: string): Promise<void> {
  console.log("\n— /auth/verify-email deletes the pending row after promotion");
  await purgeTestRows();

  // Seed pending_signups directly so we drive the production
  // /auth/verify-email endpoint, NOT the dev-only synchronous-promotion
  // path inside /auth/register. The verify endpoint hashes the raw
  // token with sha256 and looks up by hash, so we mirror that here.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const passwordHash = await bcrypt.hash("verify-strong-password", 10);
  await db.insert(pendingSignupsTable).values({
    email: "task535-verify@example.com",
    name: "Verify Founder",
    passwordHash,
    verificationToken: tokenHash,
    verificationTokenExpiry: new Date(Date.now() + 30 * 60_000),
  });

  const verify = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken }),
  });
  check("verify-email returns 200", verify.status === 200, `status=${verify.status}`);

  const pendingAfter = await db
    .select({ id: pendingSignupsTable.id })
    .from(pendingSignupsTable)
    .where(eq(pendingSignupsTable.email, "task535-verify@example.com"));
  check(
    "verify-email deletes the pending row",
    pendingAfter.length === 0,
    `found ${pendingAfter.length} rows`,
  );

  const userAfter = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "task535-verify@example.com"));
  check("verify-email creates the user row", userAfter.length === 1, `found ${userAfter.length} rows`);

  await purgeTestRows();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Pending Signups Cleanup Integration Tests ===");

  const server = await startServer();
  try {
    await testSweeperDropsExpiredKeepsFresh();
    await testVerifyEmailRemovesPendingRow(server.baseUrl);
  } finally {
    await server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
