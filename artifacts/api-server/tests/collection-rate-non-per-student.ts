/**
 * Task #608 — Lock in collection-slippage behavior on non-per-student rows.
 *
 * Task #603 widened `computeBaseFinancials`'s `collectionRate` multiplier
 * from per_student rows to every revenue driver (annual_fixed, monthly,
 * per_new_student, per_returning_student, percent_of_base via the base it
 * points at). None of the existing parity / collection-rate fixtures put a
 * `collectionRate` on a non-per_student row, so a future refactor could
 * silently re-narrow that scope to per_student-only without any test
 * tripping. This test pins the broadened behavior.
 *
 * Model (deliberately minimal, no enrollment/staffing/expenses/debt):
 *   - r_grant   : annual_fixed  $100,000  collectionRate=90  → 90,000/yr
 *   - r_fees    : monthly         $5,000  collectionRate=80  → 48,000/yr
 *                                                              (5,000*12*0.8)
 *   - r_offset  : percent_of_base 10% of r_grant (no own collectionRate)
 *                 → 10% of the *discounted* 90,000 = 9,000/yr
 *
 * Expected revenue Y1-Y5: 90,000 + 48,000 + 9,000 = 147,000 each year.
 * No escalation, no proration, no enrollment dependency, so all five years
 * are identical — which makes the expectations easy to audit by hand and
 * any per-driver-type slippage regression jumps out as a flat delta.
 */
import { computeBaseFinancials } from "@workspace/finance";
import type { FullModelData } from "../../../lib/finance/src/decision-engine/model-shape.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eqInt(label: string, actual: number, expected: number) {
  if (Math.abs(Math.round(actual) - expected) <= 1) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — actual=${Math.round(actual)} expected=${expected}`);
  }
}

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function buildModel(overrides: {
  grantRate?: number;
  monthlyRate?: number;
  offsetRate?: number;
}): FullModelData {
  return {
    schoolProfile: {},
    enrollment: { year1: 50, year2: 50, year3: 50, year4: 50, year5: 50, retentionRate: 85 },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [
      {
        id: "r_grant",
        enabled: true,
        category: "philanthropy",
        driverType: "annual_fixed",
        amounts: [100000, 100000, 100000, 100000, 100000],
        escalationRate: 0,
        ...(overrides.grantRate !== undefined ? { collectionRate: overrides.grantRate } : {}),
      },
      {
        id: "r_fees",
        enabled: true,
        category: "other",
        driverType: "monthly",
        amounts: [5000, 5000, 5000, 5000, 5000],
        escalationRate: 0,
        ...(overrides.monthlyRate !== undefined ? { collectionRate: overrides.monthlyRate } : {}),
      },
      {
        id: "r_offset",
        enabled: true,
        category: "other",
        driverType: "percent_of_base",
        percentBase: "r_grant",
        amounts: [10, 10, 10, 10, 10],
        escalationRate: 0,
        ...(overrides.offsetRate !== undefined ? { collectionRate: overrides.offsetRate } : {}),
      },
    ],
    staffingRows: [],
    expenseRows: [],
    capitalAndDebtRows: [],
    tuitionTiers: [],
  };
}

// --- Scenario A: collection slippage applied to grant + monthly rows -------
const withSlippage = computeBaseFinancials(
  buildModel({ grantRate: 90, monthlyRate: 80 }),
);

const EXPECTED_REV = 90000 + 48000 + 9000; // 147,000
for (let y = 0; y < 5; y++) {
  eqInt(`Y${y + 1} revenue with grant@90, monthly@80, offset@discounted-base`,
    withSlippage.revenue[y], EXPECTED_REV);
}

// --- Scenario B: same rows at 100% collection (control) --------------------
// Pins that the slippage in scenario A is doing real work — i.e. the engine
// isn't silently ignoring collectionRate on these driver types and producing
// the same revenue regardless.
const noSlippage = computeBaseFinancials(
  buildModel({ grantRate: 100, monthlyRate: 100 }),
);
const EXPECTED_REV_GROSS = 100000 + 60000 + 10000; // 170,000
for (let y = 0; y < 5; y++) {
  eqInt(`Y${y + 1} revenue at 100% collection (control)`,
    noSlippage.revenue[y], EXPECTED_REV_GROSS);
}

// --- Per-driver-type isolation --------------------------------------------
// If collectionRate were silently stripped on annual_fixed only, the monthly
// row would still discount and Y1 revenue would be 100,000 + 48,000 + 10,000
// = 158,000 (offset reverts to 10,000 since base is no longer discounted).
// Conversely, stripping it on monthly only gives 90,000 + 60,000 + 9,000 =
// 159,000. Pinning the combined 147,000 number above catches both regressions
// at once, but we also assert each driver in isolation for a clearer failure
// mode.
const grantOnly = computeBaseFinancials(
  buildModel({ grantRate: 90, monthlyRate: 100 }),
);
eqInt("annual_fixed slippage isolated: Y1 revenue",
  grantOnly.revenue[0], 90000 + 60000 + 9000);

const monthlyOnly = computeBaseFinancials(
  buildModel({ grantRate: 100, monthlyRate: 80 }),
);
eqInt("monthly slippage isolated: Y1 revenue",
  monthlyOnly.revenue[0], 100000 + 48000 + 10000);

// --- percent_of_base picks up the *discounted* base ------------------------
// Direct check: with grant@90 and offset@10% of grant, the offset must be
// 10% of 90,000 = 9,000, not 10% of 100,000 = 10,000. We back into the
// offset value by subtracting the two known contributions (grant + monthly)
// from the engine total.
const offsetContribY1 = withSlippage.revenue[0] - 90000 - 48000;
eqInt("percent_of_base offset uses discounted base (10% of 90,000)",
  offsetContribY1, 9000);
check(
  "percent_of_base offset is NOT 10% of gross 100,000 base",
  Math.abs(offsetContribY1 - 10000) > 500,
  `offset=${Math.round(offsetContribY1)}`,
);

console.log("\n=== Collection-Rate on non-per_student rows (Task #608) ===");
console.log(`  with-slippage   Y1-Y5 revenue: [${withSlippage.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);
console.log(`  no-slippage     Y1-Y5 revenue: [${noSlippage.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);
console.log(`  grant-only      Y1   revenue : ${Math.round(grantOnly.revenue[0]).toLocaleString()}`);
console.log(`  monthly-only    Y1   revenue : ${Math.round(monthlyOnly.revenue[0]).toLocaleString()}`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
