// Task #634 — coverage for `enrichStaffingPlanSection` in
// `build-lender-packet.ts`. Pins the contract that:
//
//   1. When the founder under-pays themselves vs market, the lender
//      packet's `staffing_plan` section gains three normalization
//      tables (per-year normalization, net-income/DSCR comparison,
//      cash-runway comparison) AND an appended narrative paragraph.
//   2. The per-year rows in the normalization table reflect the
//      `consultantOutput.normalizedView.founderComp` series exactly
//      (reported / normalized / loaded delta), with a final
//      "Total adjustment" row matching `totalDelta`.
//   3. When the founder is already paying market rate (no adjustment),
//      the section is returned unchanged — no extra tables, no extra
//      narrative — so the packet stays clean for the common case.
//
// The internal helper isn't exported, so we drive it through
// `buildLenderPacket` (the only call site) and inspect the resulting
// `staffing_plan` section.

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

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

function buildModel(opts: {
  reportedFounderComp: number[];
  normalizedFounderComp: number[];
}): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Founder Norm Test School",
      state: "OH",
      schoolType: "private_school",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 200,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 4000,
      annualRentEscalation: 3,
      debtIncluded: false,
    },
    enrollment: { year1: 60, year2: 80, year3: 100, year4: 120, year5: 140 },
    revenueRows: [
      {
        id: "r1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [12000, 12360, 12731, 13113, 13506],
        billingMonths: 12,
      },
    ],
    staffingRows: [
      {
        id: "s1",
        roleName: "Head of School",
        functionCategory: "school_leadership",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: opts.reportedFounderComp[0] || 1, // > 0 so findFounderRow picks it up
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 8,
        payrollLike: false,
      },
      {
        id: "s2",
        roleName: "Lead Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 4,
        annualizedRate: 50000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 8,
        payrollLike: false,
      },
    ],
    staffing: {
      benefitsRate: 20,
      payrollTaxRate: 8,
      reportedFounderComp: opts.reportedFounderComp,
      normalizedFounderComp: opts.normalizedFounderComp,
    },
    expenseRows: [
      {
        id: "e1",
        category: "occupancy_facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "monthly",
        amounts: [4000, 4120, 4244, 4371, 4502],
      },
    ],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    openingBalances: { cash: 100_000 },
  };
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

async function main(): Promise<void> {
  console.log("=== Lender Packet Staffing Normalization Test (Task #634) ===\n");

  // ─── Case 1: founder under-pays themselves ────────────────────────────
  const underModel = buildModel({
    reportedFounderComp: [40_000, 40_000, 40_000, 40_000, 40_000],
    normalizedFounderComp: [120_000, 120_000, 120_000, 120_000, 120_000],
  });
  const underCO = await runConsultantEngine(underModel as Parameters<typeof runConsultantEngine>[0]);
  check(
    "consultant engine emits a normalizedView with hasAdjustment=true",
    !!underCO.normalizedView && underCO.normalizedView.founderComp.hasAdjustment,
    `hasAdjustment=${underCO.normalizedView?.founderComp.hasAdjustment}`,
  );

  const underPacket = buildLenderPacket(underModel as unknown as ModelData, underCO, 1);
  const underSection = underPacket.sections.find((s) => s.id === "staffing_plan");
  check("staffing_plan section is present in the lender packet", !!underSection);
  if (!underSection) {
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }

  const tables = underSection.tables ?? [];
  const normTable = tables.find((t) => t.title === "Founder Compensation Normalization");
  const cmpTable = tables.find((t) => t.title === "As-Planned vs Normalized: Net Income & DSCR");
  const runwayTable = tables.find((t) => t.title === "As-Planned vs Normalized: Cash Runway");
  check("normalization table is appended", !!normTable);
  check("net-income / DSCR comparison table is appended", !!cmpTable);
  check("cash-runway comparison table is appended", !!runwayTable);

  if (normTable) {
    check(
      "normalization table has 5 per-year rows + 1 total row",
      normTable.rows.length === 6,
      `got ${normTable.rows.length} rows`,
    );
    check(
      "normalization headers match the lender packet contract",
      JSON.stringify(normTable.headers) ===
        JSON.stringify(["Year", "As Planned (Reported)", "Market Rate (Normalized)", "Loaded Adjustment"]),
      JSON.stringify(normTable.headers),
    );
    const fc = underCO.normalizedView!.founderComp;
    for (let y = 0; y < 5; y++) {
      const row = normTable.rows[y];
      const expected = [fmtUSD(fc.reported[y]), fmtUSD(fc.normalized[y]), fmtUSD(fc.delta[y])];
      check(
        `normalization row Y${y + 1} matches founderComp series exactly`,
        row.label === `Year ${y + 1}` && JSON.stringify(row.values) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(row.values)} (label="${row.label}")`,
      );
    }
    const totalRow = normTable.rows[5];
    check(
      "total adjustment row labels Y1–Y5 and shows the summed loaded delta in bold",
      totalRow.label === "Total adjustment (Y1–Y5)" &&
        totalRow.values[2] === fmtUSD(fc.totalDelta) &&
        totalRow.isBold === true,
      `label="${totalRow.label}", values=${JSON.stringify(totalRow.values)}, isBold=${totalRow.isBold}`,
    );
  }

  if (cmpTable) {
    check(
      "comparison table has one row per modeled year",
      cmpTable.rows.length === 5,
      `got ${cmpTable.rows.length} rows`,
    );
    const nv = underCO.normalizedView!;
    const y0 = cmpTable.rows[0];
    const expectedY0 = [
      fmtUSD(nv.reported.netIncome[0]),
      fmtUSD(nv.normalized.netIncome[0]),
      (nv.reported.dscr[0] ?? 0).toFixed(2) + "x",
      (nv.normalized.dscr[0] ?? 0).toFixed(2) + "x",
    ];
    check(
      "comparison row Y1 carries reported + normalized net income and DSCR",
      JSON.stringify(y0.values) === JSON.stringify(expectedY0),
      `expected ${JSON.stringify(expectedY0)}, got ${JSON.stringify(y0.values)}`,
    );
  }

  if (runwayTable) {
    check(
      "runway table has the as-planned + normalized rows",
      runwayTable.rows.length === 2 &&
        runwayTable.rows[0].label === "As Planned (Reported)" &&
        runwayTable.rows[1].label === "Lender View (Normalized)",
      `got rows: ${runwayTable.rows.map((r) => r.label).join(", ")}`,
    );
  }

  check(
    "section narrative is appended with the normalization explainer",
    underSection.narrative.includes("Founder compensation is normalized to market rate"),
    `narrative tail: ${underSection.narrative.slice(-200)}`,
  );
  check(
    "section narrative names the dashboard / packet split",
    underSection.narrative.includes("founder dashboard reflects the as-planned view"),
  );
  check(
    "section narrative quantifies the 5-year adjustment in dollars",
    /\$[\d,]+/.test(underSection.narrative.split("normalized to market rate")[1] || ""),
  );

  // ─── Case 2: founder already at market — section unchanged ────────────
  const noAdjModel = buildModel({
    reportedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
    normalizedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
  });
  const noAdjCO = await runConsultantEngine(noAdjModel as Parameters<typeof runConsultantEngine>[0]);
  check(
    "no-adjustment fixture: consultant engine reports hasAdjustment=false",
    !!noAdjCO.normalizedView && !noAdjCO.normalizedView.founderComp.hasAdjustment,
  );

  const noAdjPacket = buildLenderPacket(noAdjModel as unknown as ModelData, noAdjCO, 1);
  const noAdjSection = noAdjPacket.sections.find((s) => s.id === "staffing_plan");
  check("no-adjustment fixture: staffing_plan section is still present", !!noAdjSection);
  if (noAdjSection) {
    const noAdjTables = (noAdjSection.tables ?? []).map((t) => t.title);
    check(
      "no-adjustment fixture: no Founder Compensation Normalization table is appended",
      !noAdjTables.includes("Founder Compensation Normalization"),
      `tables: ${JSON.stringify(noAdjTables)}`,
    );
    check(
      "no-adjustment fixture: no As-Planned vs Normalized DSCR table is appended",
      !noAdjTables.includes("As-Planned vs Normalized: Net Income & DSCR"),
    );
    check(
      "no-adjustment fixture: no As-Planned vs Normalized cash runway table",
      !noAdjTables.includes("As-Planned vs Normalized: Cash Runway"),
    );
    check(
      "no-adjustment fixture: narrative does not get the normalization paragraph",
      !noAdjSection.narrative.includes("Founder compensation is normalized to market rate"),
      `narrative: ${noAdjSection.narrative.slice(0, 200)}`,
    );
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
