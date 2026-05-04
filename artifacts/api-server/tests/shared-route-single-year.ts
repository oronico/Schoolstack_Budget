// Integration test for the `isSingleYear` field on the public share-link
// payload returned by GET /api/shared/:token.
//
// The shared model page (artifacts/school-financial-model/src/pages/shared/
// SharedModelPage.tsx) reads `data.modelDuration` to gate its Y5 surfaces
// (headline tile, summary table columns, "→ X by Year 5" subtext, …), but
// the route also publishes a derived boolean `isSingleYear` that downstream
// consumers (PDF generators, embedded widgets) rely on. A regression that
// stops setting `isSingleYear` would silently break those without breaking
// the founder-facing shared page, so it gets its own integration coverage.
//
// Coverage:
//   - schoolProfile.modelDuration === "single_year" → isSingleYear === true
//   - schoolProfile.modelDuration === "five_year"  → isSingleYear === false
//   - missing modelDuration                         → isSingleYear === false
//
// The test exercises the real express app + Postgres + JWT environment,
// mirroring the existing shared-decision-comparison-pdf-route.ts harness so
// the assertions reflect production behaviour.

import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  financialModelsTable,
  sharedLinksTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { microschoolStartup } from "./sample-payloads.js";

// --- Tiny test harness ---------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

function eqv<T>(label: string, actual: T, expected: T) {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// --- Fixture builders ----------------------------------------------------

function modelDataWithDuration(modelDuration: "single_year" | "five_year" | undefined) {
  // Clone the microschool fixture so each test gets its own profile object,
  // then patch (or omit) modelDuration. The route reads
  // profile?.modelDuration so an absent field must yield false.
  const { schoolProfile, ...rest } = microschoolStartup;
  if (modelDuration === undefined) {
    const { modelDuration: _omit, ...profileWithout } = schoolProfile as Record<string, unknown>;
    return { ...rest, schoolProfile: profileWithout };
  }
  return {
    ...rest,
    schoolProfile: { ...schoolProfile, modelDuration },
  };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<number> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  return row.id;
}

async function createModel(userId: number, data: Record<string, unknown>): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name: "Test Model", data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function createShareLink(modelId: number): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const [row] = await db
    .insert(sharedLinksTable)
    .values({ modelId, token })
    .returning({ id: sharedLinksTable.id, token: sharedLinksTable.token });
  return { id: row.id, token: row.token };
}

async function deleteUserCascade(userId: number) {
  // financial_models / shared_links cascade off users, so this drops the
  // whole fixture in one call.
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

// --- HTTP harness --------------------------------------------------------

interface BootedServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function bootApp(): Promise<BootedServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error("Failed to bind test server"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
    server.on("error", reject);
  });
}

async function fetchSharedFor(
  server: BootedServer,
  modelDuration: "single_year" | "five_year" | undefined,
): Promise<{ status: number; body: Record<string, unknown>; userId: number }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = await createUser(`shared-isSingleYear-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDuration(modelDuration));
  const link = await createShareLink(modelId);
  const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body, userId };
}

// --- Tests ---------------------------------------------------------------

async function testSingleYear(server: BootedServer) {
  console.log("\n— GET /shared/:token: modelDuration='single_year' → isSingleYear === true —");
  const { status, body, userId } = await fetchSharedFor(server, "single_year");
  try {
    eqv("status is 200", status, 200);
    eqv("payload.modelDuration is 'single_year'", body.modelDuration, "single_year");
    check(
      "payload.isSingleYear is a boolean",
      typeof body.isSingleYear === "boolean",
      `got ${typeof body.isSingleYear}`,
    );
    eqv("payload.isSingleYear is true", body.isSingleYear, true);
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testFiveYear(server: BootedServer) {
  console.log("\n— GET /shared/:token: modelDuration='five_year' → isSingleYear === false —");
  const { status, body, userId } = await fetchSharedFor(server, "five_year");
  try {
    eqv("status is 200", status, 200);
    eqv("payload.modelDuration is 'five_year'", body.modelDuration, "five_year");
    check(
      "payload.isSingleYear is a boolean",
      typeof body.isSingleYear === "boolean",
      `got ${typeof body.isSingleYear}`,
    );
    eqv("payload.isSingleYear is false", body.isSingleYear, false);
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testMissingModelDuration(server: BootedServer) {
  console.log("\n— GET /shared/:token: missing modelDuration → isSingleYear === false (back-compat) —");
  const { status, body, userId } = await fetchSharedFor(server, undefined);
  try {
    eqv("status is 200", status, 200);
    eqv("payload.isSingleYear is false", body.isSingleYear, false);
  } finally {
    await deleteUserCascade(userId);
  }
}

// --- Entrypoint ----------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    // The shared route doesn't issue/verify JWTs, but app.ts wires the
    // auth middleware globally; importing it requires JWT_SECRET to be set.
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Shared Route isSingleYear Integration Tests ===");

  const server = await bootApp();
  try {
    await testSingleYear(server);
    await testFiveYear(server);
    await testMissingModelDuration(server);
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

main()
  .catch((err) => {
    console.error(err);
    process.exit(2);
  })
  .finally(() => {
    // The pg pool keeps idle connections alive; force-exit so the test
    // process terminates cleanly. Mirrors the sibling shared-decision-
    // comparison-pdf-route.ts harness.
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
