// Integration test for the `breakEvenDownside` aggregate on the public
// share-link payload returned by GET /api/shared/:token.
//
// Task #626 added the "Break-even & downside" card to the shared lender view
// (artifacts/school-financial-model/src/pages/shared/SharedModelPage.tsx),
// sourced from a server-precomputed payload built in the /shared/:token
// handler in artifacts/api-server/src/routes/models.ts. The component-level
// test in SharedModelPage.breakeven.test.tsx feeds a hand-crafted payload,
// so a regression in the server route — forgetting to populate
// `breakEvenDownside`, or the canonical engine throwing on a real model
// shape — wouldn't be caught until a lender opened a real link.
//
// This test exercises GET /api/shared/:token end-to-end against a real
// saved model and asserts the published `breakEvenDownside.breakEvenStudents
// / breakEvenUtilization / downsideBand` match the canonical engine output
// computed directly via `computeBaseFinancials` + `computeDownsideBand` from
// `@workspace/finance`. It also covers the legacy / malformed-data path
// where the engine throws and the route publishes `breakEvenDownside: null`.

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
import {
  computeBaseFinancials,
  computeDownsideBand,
  type DecisionEngineModelData,
} from "@workspace/finance";
import app from "../src/app.js";
import { normalizeRevenueRows, type RevenueRow } from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

// Mirrors `normalizeModelData` in artifacts/api-server/src/routes/models.ts
// so we feed the canonical engine the exact shape the route hands it. The
// route's normalization isn't exported, so we replicate it inline — keeping
// the two in sync is enforced by this test (a drift would surface as a
// happy-path diff in the assertions below).
function normalizeModelDataForEngine(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...data };
  if (Array.isArray(normalized.revenueRows)) {
    normalized.revenueRows = normalizeRevenueRows(
      normalized.revenueRows as RevenueRow[],
    ).map((row) => ({
      ...row,
      escalationRateOverridden: row.escalationRateOverridden ?? true,
    }));
  }
  if (Array.isArray(normalized.expenseRows)) {
    normalized.expenseRows = (
      normalized.expenseRows as Array<Record<string, unknown>>
    ).map((row) => ({
      ...row,
      escalationRateOverridden:
        (row.escalationRateOverridden as boolean | undefined) ?? true,
    }));
  }
  return normalized;
}

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

function arraysEqual(
  label: string,
  actual: unknown,
  expected: Array<number | null>,
) {
  if (!Array.isArray(actual)) {
    check(label, false, `expected array, got ${typeof actual}`);
    return;
  }
  if (actual.length !== expected.length) {
    check(
      label,
      false,
      `length ${actual.length} !== ${expected.length}`,
    );
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    const ok =
      a === e ||
      (typeof a === "number" &&
        typeof e === "number" &&
        Math.abs(a - e) < 1e-9);
    if (!ok) {
      check(label, false, `index ${i}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
      return;
    }
  }
  check(label, true);
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

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: breakEvenDownside matches canonical engine output —",
  );

  // Compute the source-of-truth aggregates from the canonical engine
  // before talking to the server, so any drift between the engine and the
  // route's projection of it shows up as a diff in the assertion.
  const normalizedData = normalizeModelDataForEngine(
    microschoolStartup as unknown as Record<string, unknown>,
  );
  const engineData = normalizedData as unknown as DecisionEngineModelData;
  const baseMetrics = computeBaseFinancials(engineData);
  const expectedDownside = computeDownsideBand(engineData);
  const expectedMaxCapacity = microschoolStartup.schoolProfile.maxCapacity;

  const userId = await createUser(
    `shared-be-downside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  try {
    const modelId = await createModel(
      userId,
      microschoolStartup as unknown as Record<string, unknown>,
    );
    const link = await createShareLink(modelId);

    const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
    const body = (await res.json()) as Record<string, unknown>;

    eqv("status is 200", res.status, 200);

    const bed = body.breakEvenDownside as
      | {
          breakEvenStudents: Array<number | null>;
          breakEvenUtilization: Array<number | null>;
          maxCapacity: number | null;
          enrollment: number[];
          downsideBand: typeof expectedDownside;
        }
      | null;

    check("breakEvenDownside is present (non-null)", bed !== null);
    if (!bed) return;

    arraysEqual(
      "breakEvenStudents matches computeBaseFinancials",
      bed.breakEvenStudents,
      baseMetrics.breakEvenStudents,
    );
    arraysEqual(
      "breakEvenUtilization matches computeBaseFinancials",
      bed.breakEvenUtilization,
      baseMetrics.breakEvenUtilization,
    );
    arraysEqual(
      "enrollment matches computeBaseFinancials",
      bed.enrollment,
      baseMetrics.enrollment,
    );
    eqv(
      "maxCapacity matches schoolProfile.maxCapacity",
      bed.maxCapacity,
      expectedMaxCapacity,
    );

    // downsideBand: -10% scenario
    arraysEqual(
      "downsideBand.minus10.enrollment matches engine",
      bed.downsideBand?.minus10?.enrollment,
      expectedDownside.minus10.enrollment,
    );
    arraysEqual(
      "downsideBand.minus10.dscr matches engine",
      bed.downsideBand?.minus10?.dscr,
      expectedDownside.minus10.dscr,
    );
    arraysEqual(
      "downsideBand.minus10.endingCash matches engine",
      bed.downsideBand?.minus10?.endingCash,
      expectedDownside.minus10.endingCash,
    );

    // downsideBand: -20% scenario
    arraysEqual(
      "downsideBand.minus20.enrollment matches engine",
      bed.downsideBand?.minus20?.enrollment,
      expectedDownside.minus20.enrollment,
    );
    arraysEqual(
      "downsideBand.minus20.dscr matches engine",
      bed.downsideBand?.minus20?.dscr,
      expectedDownside.minus20.dscr,
    );
    arraysEqual(
      "downsideBand.minus20.endingCash matches engine",
      bed.downsideBand?.minus20?.endingCash,
      expectedDownside.minus20.endingCash,
    );
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testLegacyDataPath(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: legacy / minimal model → breakEvenDownside key always present —",
  );

  // The route's break-even precompute is wrapped in a try/catch so a
  // genuinely-broken legacy payload (engine throws) yields
  // `breakEvenDownside: null` instead of 500ing the whole page. The
  // contract this test pins is the *response shape*: regardless of which
  // branch ran, the JSON body must always include the `breakEvenDownside`
  // key so the SharedModelPage client can do
  // `if (data.breakEvenDownside) { … }` without first having to defend
  // against `undefined`. (See SharedModelPage.breakeven.test.tsx for the
  // matching client-side null-handling test.)
  //
  // We use the *legacy non-row model shape* (no
  // revenueRows/staffingRows/expenseRows, just headline numbers) — the
  // actual real-world payload that survived from before the row-based
  // engine landed and that the route's null fallback was designed to
  // keep safe. Together with the happy path above, this catches a
  // "forgot to populate breakEvenDownside" regression in the route:
  // dropping the field from `res.json` would make
  // `'breakEvenDownside' in body` flip to false on every payload shape.
  const legacyData: Record<string, unknown> = {
    schoolProfile: {
      schoolName: "Legacy Microschool",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      modelDuration: "five_year",
      maxCapacity: 30,
    },
    enrollment: { year1: 10, year2: 12, year3: 15, year4: 18, year5: 20 },
    revenue: { tuitionPerStudent: 10_000, annualTuitionIncrease: 0 },
    staffing: { teacherSalary: 40_000, founderSalary: 50_000, benefitsRate: 0 },
    facilities: { monthlyRent: 1_500, annualRentIncrease: 0 },
    openingBalances: { cash: 10_000 },
  };
  const userId = await createUser(
    `shared-be-downside-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  try {
    const modelId = await createModel(userId, legacyData);
    const link = await createShareLink(modelId);

    const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
    const body = (await res.json()) as Record<string, unknown>;

    eqv("status is 200", res.status, 200);
    check(
      "response always includes the breakEvenDownside key (null or object)",
      "breakEvenDownside" in body,
      `keys: ${JSON.stringify(Object.keys(body))}`,
    );
    const bed = body.breakEvenDownside;
    check(
      "breakEvenDownside is either null or a populated object — never undefined",
      bed === null ||
        (typeof bed === "object" &&
          bed !== null &&
          Array.isArray((bed as Record<string, unknown>).breakEvenStudents) &&
          Array.isArray((bed as Record<string, unknown>).breakEvenUtilization) &&
          Array.isArray((bed as Record<string, unknown>).enrollment) &&
          typeof (bed as Record<string, unknown>).downsideBand === "object"),
      `got ${JSON.stringify(bed)?.slice(0, 200)}`,
    );

    // When the engine succeeds on legacy data, the maxCapacity it publishes
    // must reflect the founder's profile value — the public card uses it as
    // the denominator for the break-even utilization tile, and a regression
    // that hard-codes / drops it would silently mis-label every share link.
    if (bed !== null && typeof bed === "object") {
      eqv(
        "maxCapacity reflects schoolProfile.maxCapacity for legacy data",
        (bed as Record<string, unknown>).maxCapacity,
        30,
      );
    }
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testMalformedDataNullFallback(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: engine throws → breakEvenDownside === null —",
  );

  // Deterministic exercise of the route's `breakEvenDownside = null`
  // fallback. The route's try/catch around the canonical engine exists
  // so a future engine refactor or a genuinely-corrupt payload that
  // makes the compute fail at runtime doesn't 500 the whole share page
  // — the rest of the response (consultant output, headline metrics) is
  // built on a separate code path and should still render.
  //
  // We can't contrive a pure-payload trigger that makes ONLY the
  // canonical engine throw — the consultant pipeline shares almost all
  // of its row/cap-debt assumptions, so any payload that breaks one
  // also breaks the other and 500s the route before this block ever
  // runs. The route exposes a tiny `sharedRouteEngineHooks` indirection
  // for exactly this reason: tests can swap the engine functions to a
  // throwing implementation, hit the route, restore in `finally`, and
  // verify the documented graceful-degradation contract.
  const { sharedRouteEngineHooks } = await import(
    "../src/routes/models.ts" as string
  );
  const realBase = sharedRouteEngineHooks.computeBaseFinancials;
  const realDownside = sharedRouteEngineHooks.computeDownsideBand;
  sharedRouteEngineHooks.computeDownsideBand = () => {
    throw new Error("synthetic engine failure for /shared/:token test");
  };

  const userId = await createUser(
    `shared-be-downside-bad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  try {
    const modelId = await createModel(
      userId,
      microschoolStartup as unknown as Record<string, unknown>,
    );
    const link = await createShareLink(modelId);

    const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
    const body = (await res.json()) as Record<string, unknown>;

    // The route must still respond 200 — the engine failure only
    // suppresses the precomputed aggregate, the rest of the page is
    // built on a separate code path.
    eqv("status is 200 even when engine throws", res.status, 200);
    check(
      "breakEvenDownside is explicitly null on engine failure",
      body.breakEvenDownside === null,
      `got ${JSON.stringify(body.breakEvenDownside)?.slice(0, 200)}`,
    );
    // Other fields the lender card depends on still come through —
    // proves the failure is contained to the break-even precompute and
    // doesn't take down the rest of the share page.
    check(
      "schoolName still present alongside null breakEvenDownside",
      typeof body.schoolName === "string" && (body.schoolName as string).length > 0,
      `schoolName: ${JSON.stringify(body.schoolName)}`,
    );
  } finally {
    sharedRouteEngineHooks.computeBaseFinancials = realBase;
    sharedRouteEngineHooks.computeDownsideBand = realDownside;
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
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Shared Route breakEvenDownside Integration Tests ===");

  const server = await bootApp();
  try {
    await testHappyPath(server);
    await testLegacyDataPath(server);
    await testMalformedDataNullFallback(server);
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
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
