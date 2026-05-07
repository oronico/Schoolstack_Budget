/**
 * Task #625 — Lock in collection-slippage behavior on per_new_student and
 * per_returning_student rows.
 *
 * Task #608 pinned `collectionRate` for annual_fixed, monthly, and
 * percent_of_base rows. Task #603 also widened the multiplier to
 * per_new_student and per_returning_student driver types (Task #603), but
 * those two cohorts still aren't covered by any golden test — a refactor
 * could silently strip the multiplier on either driver and the suite would
 * stay green. This test pins their behavior end-to-end through
 * `computeBaseFinancials`.
 *
 * Model (deliberately minimal, no staffing/expenses/debt):
 *   - enrollment: 50, 80, 100, 100, 100  (retention 85%)
 *     With seNewStudents/seReturningStudents this yields:
 *       y0: new=50  returning=0
 *       y1: new=37  returning=43   (round(50*0.85)=43, 80-43=37)
 *       y2: new=32  returning=68   (round(80*0.85)=68, 100-68=32)
 *       y3: new=15  returning=85   (round(100*0.85)=85, 100-85=15)
 *       y4: new=15  returning=85
 *   - r_new : per_new_student         $1,000  collectionRate=90
 *   - r_ret : per_returning_student   $  500  collectionRate=80
 *
 * Per-year contributions (with slippage):
 *   r_new = 1000 * new * 0.9 → 45000, 33300, 28800, 13500, 13500
 *   r_ret =  500 * ret * 0.8 →     0, 17200, 27200, 34000, 34000
 *   total                    → 45000, 50500, 56000, 47500, 47500
 *
 * No escalation, no proration, no tier tuition — only the new/returning
 * cohort split moves between years, so any per-driver-type collection-rate
 * regression jumps out as a clean delta on the affected cohort.
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
  newRate?: number;
  retRate?: number;
}): FullModelData {
  return {
    schoolProfile: {},
    enrollment: { year1: 50, year2: 80, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [
      {
        id: "r_new",
        enabled: true,
        category: "other",
        driverType: "per_new_student",
        amounts: [1000, 1000, 1000, 1000, 1000],
        escalationRate: 0,
        ...(overrides.newRate !== undefined ? { collectionRate: overrides.newRate } : {}),
      },
      {
        id: "r_ret",
        enabled: true,
        category: "other",
        driverType: "per_returning_student",
        amounts: [500, 500, 500, 500, 500],
        escalationRate: 0,
        ...(overrides.retRate !== undefined ? { collectionRate: overrides.retRate } : {}),
      },
    ],
    staffingRows: [],
    expenseRows: [],
    capitalAndDebtRows: [],
    tuitionTiers: [],
  };
}

// --- Scenario A: collection slippage applied to both cohort rows ----------
const withSlippage = computeBaseFinancials(
  buildModel({ newRate: 90, retRate: 80 }),
);

const EXPECTED_REV = [45000, 50500, 56000, 47500, 47500];
for (let y = 0; y < 5; y++) {
  eqInt(`Y${y + 1} revenue with per_new@90, per_returning@80`,
    withSlippage.revenue[y], EXPECTED_REV[y]);
}

// --- Scenario B: same rows at 100% collection (control) -------------------
// Pins that the slippage in scenario A is doing real work — i.e. the engine
// isn't silently ignoring collectionRate on these driver types and producing
// the same revenue regardless.
const noSlippage = computeBaseFinancials(
  buildModel({ newRate: 100, retRate: 100 }),
);
const EXPECTED_REV_GROSS = [50000, 58500, 66000, 57500, 57500];
for (let y = 0; y < 5; y++) {
  eqInt(`Y${y + 1} revenue at 100% collection (control)`,
    noSlippage.revenue[y], EXPECTED_REV_GROSS[y]);
}

// --- Per-driver-type isolation --------------------------------------------
// If collectionRate were silently stripped on per_new_student only, Y2
// revenue would be 37000 + 17200 = 54200 instead of 33300 + 17200 = 50500.
// Conversely, stripping it on per_returning_student only gives Y2 =
// 33300 + 21500 = 54800. Pinning the combined per-year totals above catches
// either regression, but we also assert each cohort in isolation so a
// failure points at the exact driver type that broke.
const newOnly = computeBaseFinancials(
  buildModel({ newRate: 90, retRate: 100 }),
);
// y1: new=37*1000*0.9=33300, ret=43*500=21500 → 54800
eqInt("per_new_student slippage isolated: Y2 revenue",
  newOnly.revenue[1], 33300 + 21500);
// y3: new=32*1000*0.9=28800, ret=68*500=34000 → 62800
eqInt("per_new_student slippage isolated: Y3 revenue",
  newOnly.revenue[2], 28800 + 34000);

const retOnly = computeBaseFinancials(
  buildModel({ newRate: 100, retRate: 80 }),
);
// y1: new=37*1000=37000, ret=43*500*0.8=17200 → 54200
eqInt("per_returning_student slippage isolated: Y2 revenue",
  retOnly.revenue[1], 37000 + 17200);
// y3: new=32*1000=32000, ret=68*500*0.8=27200 → 59200
eqInt("per_returning_student slippage isolated: Y3 revenue",
  retOnly.revenue[2], 32000 + 27200);

// --- Y1 returning-cohort sanity ------------------------------------------
// In year 1 there are no returning students, so the per_returning_student
// row contributes 0 regardless of collectionRate. This pins that the
// multiplier doesn't accidentally float above 0 (e.g. by being applied to
// the wrong cohort count).
eqInt("Y1 per_returning_student contributes 0 (no returning students)",
  withSlippage.revenue[0], 45000);
check(
  "per_returning_student slippage does not turn 0 into a positive number",
  Math.abs(withSlippage.revenue[0] - noSlippage.revenue[0] * 0.9) < 1,
  `withSlippage Y1=${Math.round(withSlippage.revenue[0])} noSlippage Y1=${Math.round(noSlippage.revenue[0])}`,
);

console.log("\n=== Collection-Rate on per_new/per_returning rows (Task #625) ===");
console.log(`  with-slippage   Y1-Y5 revenue: [${withSlippage.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);
console.log(`  no-slippage     Y1-Y5 revenue: [${noSlippage.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);
console.log(`  new-only        Y1-Y5 revenue: [${newOnly.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);
console.log(`  returning-only  Y1-Y5 revenue: [${retOnly.revenue.map((v) => Math.round(v).toLocaleString()).join(", ")}]`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
