// Task #709 — schoolProfile.launchAssumptions survives save → reload through the API.
//
// Task #703 added the Enrollment-step launch checklist for new schools
// (committed students, signed agreements, deposits, opening cadence,
// pre-opening cash, startup costs). The data path is wired end-to-end
// through the wizard schema, OpenAPI spec, and regenerated api-zod, but
// no integration test currently proves a populated
// `schoolProfile.launchAssumptions` object round-trips through a real
// save → reload cycle. That's exactly the gap a future zod/OpenAPI
// drift would regress silently.
//
// This test:
//   1. POST /api/models with a fully-populated launchAssumptions block
//   2. GET  /api/models/:id and assert every checklist field comes back
//      equal to what was sent (numeric + string fields)
//   3. PUT  /api/models/:id with mutated checklist values (and a partial
//      payload that omits some fields) to prove updates persist and the
//      `.optional()` fields don't get dropped on the way through
//   4. GET  /api/models/:id again and re-assert the mutated values

import http from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { registerAndVerify } from "./helpers/register-and-verify.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
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

function eq2<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

interface ModelRow {
  id: number;
  version: number;
  data: Record<string, unknown>;
}

const INITIAL_LAUNCH_ASSUMPTIONS = {
  committedStudents: 18,
  signedEnrollmentAgreements: 12,
  depositsCollected: 9000,
  projectedOpeningMonth: "2026-08",
  firstMonthWithRevenue: "2026-09",
  firstMonthWithPayroll: "2026-07",
  firstMonthWithRent: "2026-06",
  preOpeningCashNeeds: 45000,
  startupCosts: 80000,
} as const;

function buildInitialModelData() {
  return {
    schoolProfile: {
      schoolName: "Launch Checklist Academy",
      state: "OH",
      schoolType: "private_school",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 60,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      launchAssumptions: { ...INITIAL_LAUNCH_ASSUMPTIONS },
    },
  };
}

async function postModel(
  baseUrl: string,
  token: string,
  body: { name: string; data: Record<string, unknown> },
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(
      `POST /api/models failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return (await res.json()) as ModelRow;
}

async function getModel(baseUrl: string, token: string, id: number): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(
      `GET /api/models/${id} failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return (await res.json()) as ModelRow;
}

async function putModel(
  baseUrl: string,
  token: string,
  id: number,
  version: number,
  body: { name: string; data: Record<string, unknown> },
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": `"${version}"`,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    throw new Error(
      `PUT /api/models/${id} failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return (await res.json()) as ModelRow;
}

function readLaunchAssumptions(row: ModelRow): Record<string, unknown> | undefined {
  const sp = (row.data as { schoolProfile?: Record<string, unknown> }).schoolProfile;
  if (!sp) return undefined;
  return sp.launchAssumptions as Record<string, unknown> | undefined;
}

function assertAllFields(
  prefix: string,
  actual: Record<string, unknown> | undefined,
  expected: Record<string, unknown>,
): void {
  check(`${prefix}: launchAssumptions block is present`, !!actual);
  if (!actual) return;
  for (const [key, value] of Object.entries(expected)) {
    eq2(`${prefix}: ${key} round-trips`, actual[key], value);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Launch Checklist Round-Trip Integration Test (Task #709) ===");

  const { baseUrl, close } = await startServer();
  let userId: number | null = null;
  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { token, user } = await registerAndVerify(baseUrl, {
      email: `launch-checklist-${stamp}@example.com`,
      password: "Password123!",
      name: "Launch Checklist",
    });
    userId = user.id;

    // -----------------------------------------------------------------
    // 1. POST with the full checklist populated.
    // -----------------------------------------------------------------
    const created = await postModel(baseUrl, token, {
      name: "Launch Checklist Model",
      data: buildInitialModelData(),
    });
    check("POST returns a numeric model id", typeof created.id === "number");

    // -----------------------------------------------------------------
    // 2. GET — every field comes back intact.
    // -----------------------------------------------------------------
    const reloaded = await getModel(baseUrl, token, created.id);
    assertAllFields(
      "after POST",
      readLaunchAssumptions(reloaded),
      INITIAL_LAUNCH_ASSUMPTIONS,
    );

    // -----------------------------------------------------------------
    // 3. PUT mutated values — different numbers and shifted months —
    //    and re-fetch. This proves that updates persist and that the
    //    optional fields don't get silently stripped on the way back
    //    through the validator.
    // -----------------------------------------------------------------
    const mutated = {
      committedStudents: 25,
      signedEnrollmentAgreements: 20,
      depositsCollected: 15000,
      projectedOpeningMonth: "2026-09",
      firstMonthWithRevenue: "2026-10",
      firstMonthWithPayroll: "2026-08",
      firstMonthWithRent: "2026-07",
      preOpeningCashNeeds: 60000,
      startupCosts: 95000,
    } as const;

    const mutatedData: Record<string, unknown> = JSON.parse(
      JSON.stringify(buildInitialModelData()),
    );
    (mutatedData.schoolProfile as Record<string, unknown>).launchAssumptions = {
      ...mutated,
    };

    const afterPut = await putModel(baseUrl, token, created.id, reloaded.version, {
      name: "Launch Checklist Model",
      data: mutatedData,
    });
    eq2("PUT bumps the version by 1", afterPut.version, reloaded.version + 1);

    const reloadedAfterPut = await getModel(baseUrl, token, created.id);
    assertAllFields(
      "after PUT (full mutation)",
      readLaunchAssumptions(reloadedAfterPut),
      mutated,
    );

    // -----------------------------------------------------------------
    // 4. PUT a partial payload that only carries a subset of the
    //    checklist fields. The PUT route replaces `data` wholesale, so
    //    any field omitted from the request should drop out — but
    //    fields that ARE sent must still survive the zod normalize.
    //    This pins the shape so a future change that accidentally
    //    `.transform()`s the block away (or strips unknown keys via
    //    a stricter schema) fails loudly.
    // -----------------------------------------------------------------
    const partialData: Record<string, unknown> = JSON.parse(
      JSON.stringify(buildInitialModelData()),
    );
    const partialAssumptions = {
      committedStudents: 30,
      projectedOpeningMonth: "2026-10",
      startupCosts: 100000,
    } as const;
    (partialData.schoolProfile as Record<string, unknown>).launchAssumptions = {
      ...partialAssumptions,
    };

    const afterPartial = await putModel(
      baseUrl,
      token,
      created.id,
      afterPut.version,
      { name: "Launch Checklist Model", data: partialData },
    );
    eq2(
      "second PUT bumps the version by 1 again",
      afterPartial.version,
      afterPut.version + 1,
    );

    const reloadedPartial = await getModel(baseUrl, token, created.id);
    const partialBack = readLaunchAssumptions(reloadedPartial);
    check("after PUT (partial): launchAssumptions block is present", !!partialBack);
    if (partialBack) {
      eq2(
        "partial: committedStudents round-trips",
        partialBack.committedStudents,
        partialAssumptions.committedStudents,
      );
      eq2(
        "partial: projectedOpeningMonth round-trips",
        partialBack.projectedOpeningMonth,
        partialAssumptions.projectedOpeningMonth,
      );
      eq2(
        "partial: startupCosts round-trips",
        partialBack.startupCosts,
        partialAssumptions.startupCosts,
      );
      // Fields that weren't sent in the partial PUT must not silently
      // resurrect from the prior version's state.
      eq2(
        "partial: omitted signedEnrollmentAgreements stays absent",
        partialBack.signedEnrollmentAgreements,
        undefined,
      );
      eq2(
        "partial: omitted depositsCollected stays absent",
        partialBack.depositsCollected,
        undefined,
      );
      eq2(
        "partial: omitted preOpeningCashNeeds stays absent",
        partialBack.preOpeningCashNeeds,
        undefined,
      );
    }
  } finally {
    if (userId !== null) {
      try {
        await db.delete(usersTable).where(eq(usersTable.id, userId));
      } catch (err) {
        console.warn("user cleanup failed:", err);
      }
    }
    await close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
