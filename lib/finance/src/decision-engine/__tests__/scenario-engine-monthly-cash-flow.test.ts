/**
 * Task #654 — Multi-year monthly cash flow regression test.
 *
 * Task #636 extended the engine's monthly cash flow series to all 5 years
 * and the trough callout to span the 5-year forecast. The golden snapshot
 * only pins `cashRunwayMonths` and a few scalars, so a future refactor
 * could quietly revert Y2-Y5 to even-spread without anything failing.
 *
 * This test pins the contract:
 *   1. `metrics.monthlyCashFlowByYear` has exactly 5 entries, and each
 *      year's inflow sums to `revenue[y]` and outflow sums to
 *      `staffingCost[y] + facilityCost[y] + opex[y] + loanDebtService[y]`.
 *   2. On a fixture engineered so Y2 dips below Y1 (heavy hiring before
 *      enrollment catches up), `lowestCashMonth.yearIndex` correctly
 *      identifies a non-Y1 trough.
 *   3. `applyAdjustments` rescales every year's monthly series — not
 *      just Y1 — so a lever change moves the Y3 trough.
 */
import {
  computeBaseFinancials,
  computeScenarios,
  type ScenarioAdjustments,
} from "../scenario-engine.js";
import type { FullModelData } from "../model-shape.js";

const failures: string[] = [];
let passed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function approxEq(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) <= eps;
}

function sum(arr: readonly number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

/**
 * Ramp-year fixture: enrollment grows from 20 → 60 over 5 years with a
 * heavy staffing front-load in Y2 (8 teachers vs 4 in Y1) before
 * enrollment catches up in Y4-Y5. Y2 should be the cash trough.
 */
function rampFixture(): FullModelData {
  return {
    schoolProfile: { isPartialFirstYear: false },
    enrollment: { year1: 20, year2: 25, year3: 40, year4: 55, year5: 60, retentionRate: 90 },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [
      {
        id: "tuition",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [10000, 10000, 10000, 10000, 10000],
        billingMonths: 10,
      },
    ],
    staffingRows: [
      {
        id: "teachers",
        // Heavy Y2 hire: 4 in Y1, then ramp to 10 in Y2 before enrollment
        // catches up. Modeled by a baseline teaching cohort plus a
        // separately-started "lead teacher" cohort hired in Y2.
        fte: 4,
        annualizedRate: 50000,
      },
      {
        id: "y2_hires",
        fte: 6,
        annualizedRate: 55000,
        startYear: 2,
      },
    ],
    expenseRows: [],
    capitalAndDebtRows: [
      {
        id: "loan",
        lineItem: "Startup Loan",
        enabled: true,
        isLoan: true,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        loanPrincipal: 100000,
        loanRate: 7,
        loanTermYears: 10,
      },
    ],
    openingBalances: { cash: 250000 },
  };
}

// ─── Case 1: monthlyCashFlowByYear has 5 entries reconciled to engine ──
{
  const m = computeBaseFinancials(rampFixture());
  const series = m.monthlyCashFlowByYear;

  check(
    "case1: monthlyCashFlowByYear is defined and has 5 entries",
    Array.isArray(series) && series!.length === 5,
    `length=${series?.length}`,
  );

  if (series && series.length === 5) {
    for (let y = 0; y < 5; y++) {
      const s = series[y];
      check(
        `case1: Y${y + 1} inflow has 12 months`,
        s.inflow.length === 12,
        `length=${s.inflow.length}`,
      );
      check(
        `case1: Y${y + 1} outflow has 12 months`,
        s.outflow.length === 12,
        `length=${s.outflow.length}`,
      );

      const inflowSum = sum(s.inflow);
      check(
        `case1: Y${y + 1} inflow sums to revenue[${y}]`,
        approxEq(inflowSum, m.revenue[y]),
        `inflowSum=${inflowSum} revenue[${y}]=${m.revenue[y]}`,
      );

      const expectedOutflow =
        m.staffingCost[y] +
        m.facilityCost[y] +
        m.opex[y] +
        (m.loanDebtService?.[y] ?? 0);
      const outflowSum = sum(s.outflow);
      check(
        `case1: Y${y + 1} outflow sums to staffing + facility + opex + loanDS`,
        approxEq(outflowSum, expectedOutflow),
        `outflowSum=${outflowSum} expected=${expectedOutflow}`,
      );
    }
  }
}

// ─── Case 2: lowestCashMonth identifies a non-Y1 trough on a ramp ──────
{
  const m = computeBaseFinancials(rampFixture());
  const trough = m.lowestCashMonth;

  check(
    "case2: lowestCashMonth is populated",
    trough !== null && trough !== undefined,
  );

  if (trough) {
    // The fixture front-loads staff in Y2 with enrollment still ramping —
    // the trough must fall in a year past Y1, not get pinned to Y1 by an
    // accidental even-spread regression.
    check(
      "case2: lowestCashMonth.yearIndex is past Y1 (not 0)",
      typeof trough.yearIndex === "number" && trough.yearIndex > 0,
      `yearIndex=${trough.yearIndex}`,
    );

    // And the trough must actually be the global minimum across the
    // chained per-year cumulative series (the regression we're guarding
    // against — Y2-Y5 silently reverted to even-spread — would still
    // produce *a* trough, but it would be off the wrong year's series).
    const series = m.monthlyCashFlowByYear!;
    let globalMin = Infinity;
    let globalMinYear = -1;
    for (let y = 0; y < series.length; y++) {
      for (const v of series[y].cumulative) {
        if (v < globalMin) {
          globalMin = v;
          globalMinYear = y;
        }
      }
    }
    check(
      "case2: lowestCashMonth matches the chained per-year cumulative minimum",
      trough.yearIndex === globalMinYear && approxEq(trough.amount, globalMin),
      `trough.yearIndex=${trough.yearIndex} globalMinYear=${globalMinYear} ` +
        `trough.amount=${trough.amount} globalMin=${globalMin}`,
    );
  }
}

// ─── Case 3: applyAdjustments rescales every year's monthly series ─────
// Drives `applyAdjustments` indirectly via `computeScenarios`. A staffing
// cut should shrink Y3 outflows in the monthly view (not just Y1) and
// move the Y3 trough up — the regression here would be Y3's monthly
// series staying pinned to base.
{
  const data = rampFixture();
  const baseMetrics = computeBaseFinancials(data);
  const baseY3Series = baseMetrics.monthlyCashFlowByYear?.[2];

  const adj: ScenarioAdjustments = {
    name: "Staff -20%",
    enrollmentAdjustment: 0,
    tuitionAdjustment: 0,
    expenseAdjustment: 0,
    staffingAdjustment: -20,
    facilityAdjustment: 0,
  };
  const { scenarios } = computeScenarios(data, [adj]);
  const scenarioMetrics = scenarios[0].metrics;
  const adjY3Series = scenarioMetrics.monthlyCashFlowByYear?.[2];

  check(
    "case3: scenario monthlyCashFlowByYear is populated for all 5 years",
    Array.isArray(scenarioMetrics.monthlyCashFlowByYear) &&
      scenarioMetrics.monthlyCashFlowByYear!.length === 5,
    `length=${scenarioMetrics.monthlyCashFlowByYear?.length}`,
  );

  if (baseY3Series && adjY3Series) {
    const baseY3Outflow = sum(baseY3Series.outflow);
    const adjY3Outflow = sum(adjY3Series.outflow);
    check(
      "case3: Y3 outflow drops after staff -20% (rescale flowed past Y1)",
      adjY3Outflow < baseY3Outflow - 1,
      `baseY3Outflow=${baseY3Outflow} adjY3Outflow=${adjY3Outflow}`,
    );

    const expectedAdjY3Outflow =
      scenarioMetrics.staffingCost[2] +
      scenarioMetrics.facilityCost[2] +
      scenarioMetrics.opex[2] +
      (scenarioMetrics.loanDebtService?.[2] ?? 0);
    check(
      "case3: Y3 outflow reconciles to scenario staffing + facility + opex + loanDS",
      approxEq(adjY3Outflow, expectedAdjY3Outflow),
      `adjY3Outflow=${adjY3Outflow} expected=${expectedAdjY3Outflow}`,
    );

    // Y3 trough specifically must improve (or at minimum change) — if a
    // refactor pinned Y3's monthly series to base, the cumulative trough
    // for that year wouldn't move when the lever cut staffing.
    const baseY3Trough = Math.min(...baseY3Series.cumulative);
    const adjY3Trough = Math.min(...adjY3Series.cumulative);
    check(
      "case3: Y3 cumulative trough improves after staff -20%",
      adjY3Trough > baseY3Trough + 1,
      `baseY3Trough=${baseY3Trough} adjY3Trough=${adjY3Trough}`,
    );
  }
}

console.log(
  `\nscenario-engine multi-year monthly cash flow: ${passed} passed, ${failures.length} failed`,
);
if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
