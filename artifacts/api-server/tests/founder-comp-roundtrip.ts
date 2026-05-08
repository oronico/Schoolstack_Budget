// Task #694 — Wizard founder inputs round-trip through save, reload, and export.
//
// The new staffing fields driven by the FounderCompTeachingPanel
//   - staffing.notPayingFounderYet
//   - staffing.founderCompAnnualAmount
//   - staffing.founderCompStartMonth
//   - staffing.founderCompStartYear
// (plus the per-year `staffing.reportedFounderComp[]` series the panel
// derives from those friendly inputs) are unit-tested at the helper +
// component level, but there's no existing test that proves the values
// survive a real save → reload → export cycle through the public API.
// That's the kind of gap a future schema/normalize/zod change would
// regress silently.
//
// This integration test exercises the full round-trip:
//   1. POST /api/models with the founder fields populated
//   2. GET  /api/models/:id and assert every founder field comes back intact
//   3. PUT  /api/models/:id with mutated founder fields
//   4. GET  /api/models/:id and assert the mutation persisted
//   5. GET  /api/models/:id/export and parse the workbook
//      → assert the Financial Model "Staffing Costs" Y1 cell reflects
//        the founder's per-year `reportedFounderComp[]` value
//
// The fixture intentionally OMITS staffingRows / revenueRows / expenseRows
// so generateWorkbook() takes the legacy P&L branch in excel-export.ts
// (the branch that reads `staffing.reportedFounderComp[]` directly when
// computing the Staffing Costs row — see the Task #685 comment around
// line 2408 of excel-export.ts). With staffingRows present the new
// builder path sums the roster instead and the founder-friendly input
// would be a no-op for the export, which would mask exactly the gap
// this test is meant to catch.

import http from "node:http";
import type { AddressInfo } from "node:net";
import ExcelJS from "exceljs";
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

function approx(label: string, actual: number, expected: number, tol = 1): void {
  check(
    label,
    Math.abs(actual - expected) <= tol,
    `expected ~${expected} (±${tol}), got ${actual}`,
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

// Fixture without row-data arrays so the legacy P&L branch in
// excel-export.ts fires (and reads `staffing.reportedFounderComp[]`).
function buildInitialModelData() {
  return {
    schoolProfile: {
      schoolName: "Founder Roundtrip Academy",
      state: "OH",
      schoolType: "private_school",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 60,
      fiscalYearStartMonth: 7,
      // Full first year so prorationFactor=1 and the Staffing Costs cell
      // is exactly the per-year reportedFounderComp value (no double
      // proration to reason about).
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 3000,
    },
    enrollment: { year1: 30, year2: 40, year3: 50, year4: 55, year5: 60 },
    revenue: {
      tuitionPerStudent: 12000,
      annualTuitionIncrease: 3,
    },
    staffing: {
      // Friendly wizard inputs (the four fields under test).
      notPayingFounderYet: false,
      founderCompAnnualAmount: 60000,
      founderCompStartMonth: 1,
      founderCompStartYear: 1,
      // The derived per-year series the FounderCompTeachingPanel writes
      // to staffing.reportedFounderComp via setValue() when these
      // friendly inputs are set. Keeping it explicit here so the test
      // pins the exact numbers the export should surface.
      reportedFounderComp: [60000, 61800, 63654, 65564, 67531],
      // Zero out the other staffing inputs so the legacy P&L Staffing
      // Costs row reduces to founder comp only (tp=0, ap=0, fs=reportedY,
      // benefits=0). That makes the assertion below an exact identity
      // rather than a fuzzy bound.
      studentsPerTeacher: 0,
      teacherSalary: 0,
      adminStaffCount: 0,
      adminSalary: 0,
      benefitsRate: 0,
    },
    facilities: {
      monthlyRent: 3000,
      annualRentIncrease: 3,
      annualSalaryIncrease: 3,
      generalCostInflation: 2.5,
    },
    openingBalances: { cash: 50000 },
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

async function getExportXlsx(baseUrl: string, token: string, id: number): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/api/models/${id}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(
      `GET /api/models/${id}/export failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

function findStaffingCostsY1(wb: ExcelJS.Workbook): number | null {
  const ws = wb.getWorksheet("Financial Model");
  if (!ws) return null;
  // buildLegacyPnLTab writes label "Staffing Costs" in column A; Y1 is
  // column B. Walk the rows defensively in case the row order ever
  // shifts so the test still finds the right cell.
  for (let r = 2; r <= ws.rowCount; r++) {
    const label = ws.getCell(r, 1).value;
    if (typeof label === "string" && label.trim() === "Staffing Costs") {
      const cellValue = ws.getCell(r, 2).value;
      if (typeof cellValue === "number") return cellValue;
      if (cellValue && typeof cellValue === "object" && "result" in cellValue) {
        const result = (cellValue as { result?: unknown }).result;
        return typeof result === "number" ? result : null;
      }
      return null;
    }
  }
  return null;
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

  console.log("=== Founder Compensation Round-Trip Integration Test (Task #694) ===");

  const { baseUrl, close } = await startServer();
  let userId: number | null = null;
  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { token, user } = await registerAndVerify(baseUrl, {
      email: `founder-roundtrip-${stamp}@example.com`,
      password: "Password123!",
      name: "Founder Roundtrip",
    });
    userId = user.id;

    // -----------------------------------------------------------------
    // 1. POST /api/models with the founder fields populated.
    // -----------------------------------------------------------------
    const initialData = buildInitialModelData();
    const created = await postModel(baseUrl, token, {
      name: "Founder Roundtrip Model",
      data: initialData,
    });
    check("POST returns a numeric model id", typeof created.id === "number");

    // -----------------------------------------------------------------
    // 2. GET /api/models/:id — every founder field round-trips intact.
    // -----------------------------------------------------------------
    const reloaded = await getModel(baseUrl, token, created.id);
    const reloadedStaffing = (reloaded.data as { staffing?: Record<string, unknown> })
      .staffing as Record<string, unknown> | undefined;
    check("staffing block survives the round-trip", !!reloadedStaffing);

    eq2(
      "notPayingFounderYet round-trips",
      reloadedStaffing?.notPayingFounderYet,
      false,
    );
    eq2(
      "founderCompAnnualAmount round-trips",
      reloadedStaffing?.founderCompAnnualAmount,
      60000,
    );
    eq2(
      "founderCompStartMonth round-trips",
      reloadedStaffing?.founderCompStartMonth,
      1,
    );
    eq2(
      "founderCompStartYear round-trips",
      reloadedStaffing?.founderCompStartYear,
      1,
    );
    const reportedAfterPost = reloadedStaffing?.reportedFounderComp;
    check(
      "reportedFounderComp[] round-trips as a 5-element number array",
      Array.isArray(reportedAfterPost) &&
        (reportedAfterPost as unknown[]).length === 5 &&
        (reportedAfterPost as unknown[]).every((v) => typeof v === "number"),
      `got ${JSON.stringify(reportedAfterPost)}`,
    );
    check(
      "reportedFounderComp Y1 matches founderCompAnnualAmount",
      Array.isArray(reportedAfterPost) &&
        (reportedAfterPost as number[])[0] === 60000,
      `got ${JSON.stringify(reportedAfterPost)}`,
    );

    // -----------------------------------------------------------------
    // 3. PUT /api/models/:id — mutate the founder fields and bump version.
    //    We flip notPayingFounderYet → true and zero the derived series
    //    so the export's staffing line should also fall to zero, which
    //    proves the mutation flowed end-to-end (not just that the first
    //    POST stuck).
    // -----------------------------------------------------------------
    const mutatedData: Record<string, unknown> = JSON.parse(JSON.stringify(initialData));
    const mutatedStaffing = (mutatedData as { staffing: Record<string, unknown> }).staffing;
    mutatedStaffing.notPayingFounderYet = true;
    mutatedStaffing.founderCompAnnualAmount = 0;
    mutatedStaffing.founderCompStartMonth = 7;
    mutatedStaffing.founderCompStartYear = 2;
    mutatedStaffing.reportedFounderComp = [0, 0, 0, 0, 0];

    const afterPut = await putModel(baseUrl, token, created.id, reloaded.version, {
      name: "Founder Roundtrip Model",
      data: mutatedData,
    });
    eq2("PUT bumps the version by 1", afterPut.version, reloaded.version + 1);

    const reloadedAfterPut = await getModel(baseUrl, token, created.id);
    const putStaffing = (reloadedAfterPut.data as { staffing?: Record<string, unknown> })
      .staffing as Record<string, unknown> | undefined;
    eq2("PUT: notPayingFounderYet flipped to true", putStaffing?.notPayingFounderYet, true);
    eq2("PUT: founderCompAnnualAmount cleared", putStaffing?.founderCompAnnualAmount, 0);
    eq2("PUT: founderCompStartMonth updated", putStaffing?.founderCompStartMonth, 7);
    eq2("PUT: founderCompStartYear updated", putStaffing?.founderCompStartYear, 2);
    check(
      "PUT: reportedFounderComp zeroed out",
      Array.isArray(putStaffing?.reportedFounderComp) &&
        (putStaffing!.reportedFounderComp as number[]).every((v) => v === 0),
      `got ${JSON.stringify(putStaffing?.reportedFounderComp)}`,
    );

    // Confirm the "not paying yet" state lands a $0 founder line in the
    // exported workbook.
    const xlsxAfterPut = await getExportXlsx(baseUrl, token, created.id);
    check(
      "export response is a valid xlsx (PK zip header)",
      xlsxAfterPut.length >= 2 &&
        xlsxAfterPut[0] === 0x50 &&
        xlsxAfterPut[1] === 0x4b,
    );
    const wbAfterPut = new ExcelJS.Workbook();
    await wbAfterPut.xlsx.load(xlsxAfterPut);
    const staffY1AfterPut = findStaffingCostsY1(wbAfterPut);
    check(
      "Financial Model 'Staffing Costs' row exists in the workbook",
      staffY1AfterPut !== null,
    );
    if (staffY1AfterPut !== null) {
      approx(
        "Staffing Costs Y1 is $0 when notPayingFounderYet=true",
        staffY1AfterPut,
        0,
      );
    }

    // -----------------------------------------------------------------
    // 4. PUT again to restore the "actually paying" inputs and re-export.
    //    With studentsPerTeacher=0 / teacherSalary=0 / adminStaffCount=0
    //    / adminSalary=0 / benefitsRate=0, buildLegacyPnLTab's Staffing
    //    Costs row is exactly reportedFounderComp[Y1] * prorationFactor
    //    * (1 + benefitsRate). prorationFactor=1 (full year) and
    //    benefitsRate=0, so the cell must equal reportedFounderComp[0].
    // -----------------------------------------------------------------
    const restoredData: Record<string, unknown> = JSON.parse(
      JSON.stringify(buildInitialModelData()),
    );
    const restoredStaffing = (restoredData as { staffing: Record<string, unknown> })
      .staffing;
    // Use a different headline number so we can be sure we're seeing
    // the restored value and not a stale cached one.
    restoredStaffing.founderCompAnnualAmount = 75000;
    restoredStaffing.reportedFounderComp = [75000, 77250, 79568, 81955, 84413];

    const afterRestore = await putModel(
      baseUrl,
      token,
      created.id,
      afterPut.version,
      { name: "Founder Roundtrip Model", data: restoredData },
    );
    eq2(
      "second PUT bumps the version by 1 again",
      afterRestore.version,
      afterPut.version + 1,
    );

    const reloadedRestored = await getModel(baseUrl, token, created.id);
    const restoredReloadStaffing = (
      reloadedRestored.data as { staffing?: Record<string, unknown> }
    ).staffing as Record<string, unknown> | undefined;
    eq2(
      "restored: founderCompAnnualAmount round-trips after second PUT",
      restoredReloadStaffing?.founderCompAnnualAmount,
      75000,
    );
    eq2(
      "restored: notPayingFounderYet flipped back to false",
      restoredReloadStaffing?.notPayingFounderYet,
      false,
    );

    // -----------------------------------------------------------------
    // 5. Export and assert the founder dollars made it to the workbook.
    // -----------------------------------------------------------------
    const xlsxFinal = await getExportXlsx(baseUrl, token, created.id);
    const wbFinal = new ExcelJS.Workbook();
    await wbFinal.xlsx.load(xlsxFinal);
    const staffY1Final = findStaffingCostsY1(wbFinal);
    check(
      "Financial Model 'Staffing Costs' row exists in the final export",
      staffY1Final !== null,
    );
    if (staffY1Final !== null) {
      // Exact identity is the right assertion here: every other staffing
      // input is zeroed in the fixture, so the row reduces to founder
      // comp. A small tolerance covers any future rounding tweak in
      // buildLegacyPnLTab.
      approx(
        "Staffing Costs Y1 equals the founder's reportedFounderComp[0] (75000)",
        staffY1Final,
        75000,
        2,
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
