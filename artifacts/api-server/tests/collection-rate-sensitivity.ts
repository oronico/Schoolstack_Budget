/**
 * Task #456 — Tuition Collection Sensitivity (private school 5-yr forecasts).
 *
 * Golden test that pins Y1-Y5 tuition cash and a Y1 cash-DSCR proxy across
 * three collection-rate scenarios on the canonical `privateSchoolWithESA`
 * persona. Designed to fail loudly on a 1-percentage-point default drift
 * in `DEFAULT_COLLECTION_RATE_BY_METHOD` or any change to the cash-flow
 * engine (`computeMonthlyCashInflow`) that silently re-buckets tuition
 * inflows.
 *
 * Why cash, not P&L: the canonical engine reports tuition revenue at gross
 * and so the P&L-based DSCR (`y1.netIncome / debtService`) does not move
 * with collection rate. The collection-rate dial is a pure cash lever —
 * it shows up in `computeMonthlyCashInflow` (which the lender PDF, the
 * cash-runway calc, and the Excel exports all read). We therefore freeze
 * tuition cash directly.
 *
 * Scenarios (overridden on the persona's `gross_tuition` row):
 *   1. autopay   @ 100% — full cash collection (no slippage)
 *   2. invoiced  @  95% — 5pt slippage
 *   3. invoiced  @  88% — 12pt slippage (worst-case invoiced)
 */
import {
  computeMonthlyCashInflow,
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeDebtServiceForYear,
  normalizeStaffingRow,
  getEnrollmentArray,
  type RevenueRow,
  type StaffingRow,
} from "../src/lib/workbook-helpers.js";
import { privateSchoolWithESA } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eqInt(label: string, actual: number, expected: number) {
  // Tuition cash should be exact integers per scenario; allow ±1 for FP.
  check(label, Math.abs(Math.round(actual) - expected) <= 1, `actual=${Math.round(actual)} expected=${expected}`);
}

function eqClose(label: string, actual: number, expected: number, tol = 0.005) {
  check(label, Math.abs(actual - expected) <= tol, `actual=${actual.toFixed(4)} expected=${expected.toFixed(4)} (tol=${tol})`);
}

interface Scenario {
  name: string;
  method: "autopay" | "invoiced" | "mixed";
  rate: number;
}

const scenarios: Scenario[] = [
  { name: "autopay-100", method: "autopay", rate: 100 },
  { name: "invoiced-95", method: "invoiced", rate: 95 },
  { name: "invoiced-88", method: "invoiced", rate: 88 },
];

interface ScenarioResult {
  name: string;
  tuitionCash: number[];
  cashDscrY1: number;
}

function runScenario(s: Scenario): ScenarioResult {
  const cloned = JSON.parse(JSON.stringify(privateSchoolWithESA)) as typeof privateSchoolWithESA;
  const tuitionRow = (cloned.revenueRows as Array<{
    id: string;
    collectionMethod?: string;
    collectionRate?: number;
  }>).find((r) => r.id === "gross_tuition");
  if (!tuitionRow) {
    throw new Error("privateSchoolWithESA.gross_tuition row not found in fixture");
  }
  tuitionRow.collectionMethod = s.method;
  tuitionRow.collectionRate = s.rate;

  const enrollment = getEnrollmentArray(cloned.enrollment);
  const revenueRows = cloned.revenueRows as unknown as RevenueRow[];
  const expenseRows = cloned.expenseRows as unknown as Parameters<typeof computeExpenseForYear>[0];
  const capDebtRows = cloned.capitalAndDebtRows as unknown as Parameters<typeof computeDebtServiceForYear>[0];
  const staffing: StaffingRow[] = (cloned.staffingRows || []).map(
    (r) => normalizeStaffingRow(r as unknown as Record<string, unknown>),
  );

  const tuitionRowsOnly = revenueRows.filter(
    (r) => r.category === "tuition_and_fees" || r.category === "tuition_offsets",
  );

  const tuitionCash: number[] = [];
  for (let y = 0; y < 5; y++) {
    const monthly = computeMonthlyCashInflow(tuitionRowsOnly, y, enrollment[y] || 0);
    tuitionCash.push(monthly.reduce((a, b) => a + b, 0));
  }

  // Y1 cash-DSCR proxy: (total cash inflow − personnel − opex) / debt service.
  // Non-tuition revenue is taken at gross since collection-rate doesn't apply.
  const y0 = 0;
  const students0 = enrollment[0] || 0;
  const nonTuitionGross = revenueRows
    .filter((r) => r.enabled !== false && r.category !== "tuition_and_fees" && r.category !== "tuition_offsets")
    .reduce(
      (sum, r) =>
        sum +
        computeRevenueForYear(
          [r],
          y0,
          students0,
          undefined,
          undefined,
          cloned.schoolProfile as Parameters<typeof computeRevenueForYear>[5],
        ),
      0,
    );
  const totalCashY1 = tuitionCash[0] + nonTuitionGross;
  const personnelY1 = computePersonnelForYear(staffing, 0, 1, 0, students0);
  const opexY1 = computeExpenseForYear(expenseRows, 0, students0, totalCashY1, undefined, undefined, undefined, undefined);
  const dsY1 = computeDebtServiceForYear(capDebtRows, 0);
  const cashDscrY1 = dsY1 > 0 ? (totalCashY1 - personnelY1 - opexY1) / dsY1 : 0;

  return { name: s.name, tuitionCash, cashDscrY1 };
}

const results = scenarios.map(runScenario);
const [autopay, inv95, inv88] = results;

// =============================================================================
// GOLDEN ASSERTIONS — frozen Y1-Y5 tuition cash per scenario.
//
// Numbers derived from the persona's `gross_tuition` row at $10,500 → $11,818
// per student × enrollment, billed over 10 months, plus the registration fee
// and scholarship discount rows (both autopay-equivalent in the cash engine):
//   r2 (registration): +$350 × students per year
//   r3 (scholarship):  −$1,050 → −$1,182 per student per year (NEGATIVE)
// Scenario rate scales the gross-tuition contribution only; the registration
// and scholarship rows pass through at full annual amount.
//
// Task #609 — refreshed against the canonical `distributeRevenueMonthly`
// helper. The legacy `computeMonthlyCashInflow` had a real timing bug where
// `tuition_offsets` rows were double-negated (effectiveAmount = -annualAmount
// when annualAmount was already negative), so scholarship discounts added
// positive cash. The new helper applies `-Math.abs(annualAmount)` so
// discounts correctly subtract from collected tuition cash. These goldens
// reflect the corrected math.
// =============================================================================

const EXPECTED_TUITION_CASH = {
  "autopay-100": [980000, 1310790, 1660160, 1975245, 2197200],
  "invoiced-95": [927500, 1240493, 1571040, 1869110, 2079020],
  "invoiced-88": [854000, 1142076, 1446272, 1720522, 1913568],
} as const;

// Y1 cash-DSCR at $35K of debt service (per the persona's capital/debt rows)
// gives a high coverage ratio — the absolute number isn't what matters; the
// SHIFT between scenarios is. Even so we pin the values so a default drift
// will trip this test.
const EXPECTED_Y1_CASH_DSCR = {
  "autopay-100": 24.918,
  "invoiced-95": 23.377,
  "invoiced-88": 21.219,
} as const;

for (const r of results) {
  const expected = EXPECTED_TUITION_CASH[r.name as keyof typeof EXPECTED_TUITION_CASH];
  for (let y = 0; y < 5; y++) {
    eqInt(`${r.name}: Y${y + 1} tuition cash`, r.tuitionCash[y], expected[y]);
  }
  eqClose(`${r.name}: Y1 cash-DSCR`, r.cashDscrY1, EXPECTED_Y1_CASH_DSCR[r.name as keyof typeof EXPECTED_Y1_CASH_DSCR], 0.01);
}

// Cross-scenario invariants — these guard against a regression that breaks
// the directional relationship even if the absolute numbers happen to match
// (e.g. all three accidentally collapsing to the same value).
for (let y = 0; y < 5; y++) {
  check(
    `Y${y + 1} tuition cash strictly decreasing: 100 > 95 > 88`,
    autopay.tuitionCash[y] > inv95.tuitionCash[y] && inv95.tuitionCash[y] > inv88.tuitionCash[y],
  );
}
check(
  "Y1 cash-DSCR strictly decreasing: 100 > 95 > 88",
  autopay.cashDscrY1 > inv95.cashDscrY1 && inv95.cashDscrY1 > inv88.cashDscrY1,
);
check(
  "Y1 cash-DSCR shift autopay-100 → invoiced-88 is material (≥ 1.0x)",
  autopay.cashDscrY1 - inv88.cashDscrY1 >= 1.0,
  `shift=${(autopay.cashDscrY1 - inv88.cashDscrY1).toFixed(3)}x`,
);

console.log("\n=== Collection-Rate Sensitivity — privateSchoolWithESA (golden) ===");
for (const r of results) {
  console.log(
    `  ${r.name.padEnd(12)} tuition cash Y1-Y5: [${r.tuitionCash.map((t) => Math.round(t).toLocaleString()).join(", ")}]  Y1 cash-DSCR=${r.cashDscrY1.toFixed(3)}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
