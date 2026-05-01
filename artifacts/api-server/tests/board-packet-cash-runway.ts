/**
 * Task #214 regression test — `buildCashRunway` (the lender packet's
 * ending-cash row + trough callout).
 *
 * The board packet's `buildCashRunway` helper computes year-by-year ending
 * cash and the runway-crunch year by combining `openingBalances.cash` with
 * the consultant engine's `cumulativeFinancials[*].cumulativeNetIncome`.
 * That row + callout flow into the lender packet, so a future rename of
 * `cumulativeNetIncome` or a regression in opening-balance handling would
 * silently break a lender deliverable.
 *
 * This test pins the contract for three scenarios:
 *   1. Trough year in the middle of the 5-year horizon, with a NEGATIVE
 *      ending cash value — the callout must use the negative-variant copy
 *      (`isNegative: true`).
 *   2. Monotonically growing cash — trough is Year 1 and the callout uses
 *      the positive-variant copy (`isNegative: false`).
 *   3. Empty / missing `openingBalances.cash` — defaults to 0 without
 *      throwing, so ending cash equals cumulative net income.
 */
import { buildCashRunway } from "../src/lib/packets/build-cash-runway.js";
import type { ConsultantOutput, CumulativeYear } from "../src/lib/consultant-engine.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

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

/**
 * Minimal `ConsultantOutput` stub with just the fields `buildCashRunway`
 * reads (`cumulativeFinancials` + `cashRunwayMonths`). Cast through
 * `unknown` so we don't have to fabricate the rest of the surface.
 */
function consultantStub(
  cumulativeFinancials: CumulativeYear[],
  cashRunwayMonths = 60,
): ConsultantOutput {
  return {
    cumulativeFinancials,
    cashRunwayMonths,
  } as unknown as ConsultantOutput;
}

function modelStub(openingCash: number | undefined): ModelData {
  if (openingCash === undefined) {
    return {} as ModelData;
  }
  return { openingBalances: { cash: openingCash } } as ModelData;
}

// ---- Scenario 1: trough mid-horizon, negative ending cash --------------
// Opening cash $200K. Cumulative NI dips to -$300K in Year 3 (ending cash
// -$100K), then recovers. Lenders zero in on this year.
{
  const cumulative: CumulativeYear[] = [
    { year: 1, cumulativeNetIncome: -50_000, reserveMonths: 4 },
    { year: 2, cumulativeNetIncome: -200_000, reserveMonths: 0 },
    { year: 3, cumulativeNetIncome: -300_000, reserveMonths: 0 },
    { year: 4, cumulativeNetIncome: -150_000, reserveMonths: 1 },
    { year: 5, cumulativeNetIncome: 100_000, reserveMonths: 5 },
  ];
  const view = buildCashRunway(consultantStub(cumulative, 24), modelStub(200_000));

  check(
    "scenario 1: yearByYearCash has one row per consultant year",
    view.yearByYearCash.length === 5,
    `got ${view.yearByYearCash.length}`,
  );
  check(
    "scenario 1: ending cash = openingCash + cumulativeNetIncome (Year 1)",
    view.yearByYearCash[0].endingCash === "$150K",
    `got ${view.yearByYearCash[0].endingCash}`,
  );
  check(
    "scenario 1: trough flagged on Year 3 (the deepest negative)",
    view.yearByYearCash[2].isTrough === true &&
      view.yearByYearCash.filter((y) => y.isTrough).length === 1,
    `isTrough flags: ${view.yearByYearCash.map((y) => y.isTrough).join(",")}`,
  );
  check(
    "scenario 1: trough callout points at Year 3 with negative ending cash",
    !!view.troughCallout &&
      view.troughCallout.year === 3 &&
      view.troughCallout.endingCash === "$-100K" &&
      view.troughCallout.isNegative === true,
    `callout was: ${JSON.stringify(view.troughCallout)}`,
  );
  check(
    "scenario 1: short runway → status='warning' (24 months)",
    view.status === "warning",
    `status was: ${view.status}`,
  );
  check(
    "scenario 1: runwayLabel reports 24 months",
    view.runwayLabel === "Cash runway is approximately 24 months",
    `label was: ${view.runwayLabel}`,
  );
}

// ---- Scenario 2: monotonically growing cash, trough = Year 1 -----------
{
  const cumulative: CumulativeYear[] = [
    { year: 1, cumulativeNetIncome: 25_000, reserveMonths: 6 },
    { year: 2, cumulativeNetIncome: 80_000, reserveMonths: 9 },
    { year: 3, cumulativeNetIncome: 180_000, reserveMonths: 12 },
    { year: 4, cumulativeNetIncome: 320_000, reserveMonths: 15 },
    { year: 5, cumulativeNetIncome: 500_000, reserveMonths: 18 },
  ];
  const view = buildCashRunway(consultantStub(cumulative, 60), modelStub(100_000));

  check(
    "scenario 2: trough is Year 1 when cash grows every year",
    view.yearByYearCash[0].isTrough === true &&
      view.yearByYearCash.slice(1).every((y) => !y.isTrough),
    `isTrough flags: ${view.yearByYearCash.map((y) => y.isTrough).join(",")}`,
  );
  check(
    "scenario 2: callout uses the positive-variant copy (isNegative=false)",
    !!view.troughCallout &&
      view.troughCallout.year === 1 &&
      view.troughCallout.isNegative === false,
    `callout was: ${JSON.stringify(view.troughCallout)}`,
  );
  check(
    "scenario 2: trough endingCash = $100K opening + $25K cum NI = $125K",
    view.troughCallout?.endingCash === "$125K",
    `got ${view.troughCallout?.endingCash}`,
  );
  check(
    "scenario 2: 60-month runway → status='good' + full-period runwayLabel",
    view.status === "good" &&
      view.runwayLabel === "Cash remains positive through the full 5-year projection",
    `status=${view.status}, label=${view.runwayLabel}`,
  );
}

// ---- Scenario 3: missing openingBalances.cash defaults to 0 ------------
// Both an entirely missing `openingBalances` object AND an explicitly
// empty one must default to 0 without throwing — both shapes appear in
// real model payloads.
{
  const cumulative: CumulativeYear[] = [
    { year: 1, cumulativeNetIncome: -10_000, reserveMonths: 2 },
    { year: 2, cumulativeNetIncome: -25_000, reserveMonths: 0 },
    { year: 3, cumulativeNetIncome: 5_000, reserveMonths: 1 },
    { year: 4, cumulativeNetIncome: 60_000, reserveMonths: 4 },
    { year: 5, cumulativeNetIncome: 150_000, reserveMonths: 8 },
  ];

  // (a) ModelData with no openingBalances at all
  let view: ReturnType<typeof buildCashRunway> | undefined;
  let threwMsg = "";
  try {
    view = buildCashRunway(consultantStub(cumulative, 18), modelStub(undefined));
  } catch (e) {
    threwMsg = (e as Error).message;
  }
  check(
    "scenario 3a: missing openingBalances does not throw",
    threwMsg === "",
    threwMsg && `threw: ${threwMsg}`,
  );
  if (view) {
    check(
      "scenario 3a: opening cash defaults to 0 → ending cash = cum NI (Year 2 = $-25K)",
      view.yearByYearCash[1].endingCash === "$-25K",
      `got ${view.yearByYearCash[1].endingCash}`,
    );
    check(
      "scenario 3a: trough = Year 2 (deepest negative without opening cushion)",
      view.troughCallout?.year === 2 && view.troughCallout?.isNegative === true,
      `callout was: ${JSON.stringify(view.troughCallout)}`,
    );
  }

  // (b) ModelData with openingBalances present but `cash` undefined
  let viewB: ReturnType<typeof buildCashRunway> | undefined;
  let threwBMsg = "";
  try {
    viewB = buildCashRunway(
      consultantStub(cumulative, 18),
      { openingBalances: {} } as ModelData,
    );
  } catch (e) {
    threwBMsg = (e as Error).message;
  }
  check(
    "scenario 3b: openingBalances with no cash key does not throw",
    threwBMsg === "",
    threwBMsg && `threw: ${threwBMsg}`,
  );
  if (viewB) {
    check(
      "scenario 3b: empty openingBalances behaves like missing — Year 1 ending = $-10K",
      viewB.yearByYearCash[0].endingCash === "$-10K",
      `got ${viewB.yearByYearCash[0].endingCash}`,
    );
  }
}

// ---- Edge case: empty cumulativeFinancials yields a null callout -------
{
  const view = buildCashRunway(consultantStub([], 0), modelStub(0));
  check(
    "edge case: no cumulative years → empty rows + null callout (no crash)",
    view.yearByYearCash.length === 0 && view.troughCallout === null,
    `rows=${view.yearByYearCash.length}, callout=${JSON.stringify(view.troughCallout)}`,
  );
}

console.log(`\nboard-packet-cash-runway: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
