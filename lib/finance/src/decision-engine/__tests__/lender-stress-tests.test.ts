/**
 * Task #616 — Standard lender stress-test battery regression test.
 *
 * Pins the contract that every surface (founder dashboard, consultant view,
 * lender packet PDF, lender pro-forma workbook) relies on:
 *
 *   1. The base case is computed via `computeBaseFinancials` and matches
 *      the engine's own metrics — no parallel math.
 *   2. The five fixed scenarios appear in a stable order with stable IDs.
 *   3. Enrollment -10% / -20% strictly reduce Year-1 net income vs base
 *      (revenue scales down faster than cost relief).
 *   4. ESA delay reduces Year-1 net income for a model with public-funding
 *      revenue, but leaves Year-5 unchanged (only Y1 is affected).
 *   5. Rent shock reduces net income across all five years for a model
 *      with `occupancy_facility` rows.
 *   6. Founder normalization matches `computeNormalizedFinancials.normalized`
 *      exactly — the lender stress helper must reuse the canonical helper.
 *   7. `deltaVsBase` arithmetic is internally consistent
 *      (scenario.netIncome[0] - base.netIncome[0] === delta.y1NetIncome).
 */
import {
  computeLenderStressTests,
  computeCustomLenderStressTest,
  LENDER_STRESS_SCENARIOS,
  minStructuralDscr,
} from "../lender-stress-tests.js";
import {
  computeBaseFinancials,
  computeNormalizedFinancials,
} from "../scenario-engine.js";
import type { FullModelData } from "../model-shape.js";
import { microschoolFixture, charterFixture } from "../../test-fixtures.js";

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

const microschool = microschoolFixture as unknown as FullModelData;
const charter = charterFixture as unknown as FullModelData;

// ─── Catalog shape ────────────────────────────────────────────────────
{
  const expectedIds = [
    "enrollment_minus_10",
    "enrollment_minus_20",
    "esa_delay_3mo",
    "rent_shock_25",
    "founder_normalization",
  ];
  check(
    "Fixed scenario catalog stable",
    LENDER_STRESS_SCENARIOS.length === 5 &&
      LENDER_STRESS_SCENARIOS.every((s, i) => s.id === expectedIds[i]),
    `got: ${LENDER_STRESS_SCENARIOS.map((s) => s.id).join(",")}`,
  );
}

// ─── Microschool: full battery ────────────────────────────────────────
{
  const result = computeLenderStressTests(microschool);
  const base = computeBaseFinancials(microschool);

  check(
    "Base mirrors computeBaseFinancials net income (microschool)",
    result.base.netIncome.every((n, i) => approxEq(n, base.netIncome[i])),
    `base.netIncome=${result.base.netIncome.join(",")} engine=${base.netIncome.join(",")}`,
  );
  check(
    "Base mirrors computeBaseFinancials unrestricted cash (microschool)",
    result.base.endingCash.every((n, i) => approxEq(n, base.unrestrictedCash[i])),
    `endingCash=${result.base.endingCash.join(",")} engineUnrestricted=${base.unrestrictedCash.join(",")}`,
  );
  check(
    "Base runway uses unrestricted-cash runway (microschool)",
    approxEq(result.base.cashRunwayMonths, base.unrestrictedCashRunwayMonths),
    `result=${result.base.cashRunwayMonths} engine=${base.unrestrictedCashRunwayMonths}`,
  );

  // ── Configurable params ────────────────────────────────────────────
  // Default ESA delay = 3mo (25% Y1 reduction). Doubling to 6mo must
  // produce a strictly larger Y1 net-income hit.
  const default3mo = computeLenderStressTests(microschool);
  const sixMo = computeLenderStressTests(microschool, { esaDelayMonths: 6 });
  check(
    "esaDelayMonths option scales the ESA Y1 hit (3mo vs 6mo)",
    sixMo.scenarios.find((s) => s.id === "esa_delay_3mo")!.deltaVsBase.y1NetIncome <
      default3mo.scenarios.find((s) => s.id === "esa_delay_3mo")!.deltaVsBase.y1NetIncome,
    "6-month ESA delay should be strictly worse than the 3-month default",
  );
  // Default rent shock = 25%. 50% must be at least as bad on Y1 net income.
  const rent50 = computeLenderStressTests(microschool, { rentShockPct: 50 });
  check(
    "rentShockPct option scales the rent shock hit (25% vs 50%)",
    rent50.scenarios.find((s) => s.id === "rent_shock_25")!.deltaVsBase.y1NetIncome <=
      default3mo.scenarios.find((s) => s.id === "rent_shock_25")!.deltaVsBase.y1NetIncome,
    "50% rent shock should never improve Y1 vs 25% default",
  );

  check(
    "Five scenarios returned (microschool)",
    result.scenarios.length === 5,
    `got ${result.scenarios.length}`,
  );

  const byId = Object.fromEntries(result.scenarios.map((s) => [s.id, s]));

  // Enrollment -10% / -20% — both must reduce Y1 net income vs base.
  check(
    "Enrollment -10% reduces Y1 net income (microschool)",
    byId.enrollment_minus_10.deltaVsBase.y1NetIncome < 0,
    `delta=${byId.enrollment_minus_10.deltaVsBase.y1NetIncome}`,
  );
  check(
    "Enrollment -20% strictly worse than -10% (microschool)",
    byId.enrollment_minus_20.deltaVsBase.y1NetIncome <
      byId.enrollment_minus_10.deltaVsBase.y1NetIncome,
    `m20=${byId.enrollment_minus_20.deltaVsBase.y1NetIncome} m10=${byId.enrollment_minus_10.deltaVsBase.y1NetIncome}`,
  );

  // ESA delay — Y1 lower because school_choice row exists; Y5 unchanged.
  check(
    "ESA delay reduces Y1 net income (microschool has school_choice row)",
    byId.esa_delay_3mo.deltaVsBase.y1NetIncome < 0,
    `delta=${byId.esa_delay_3mo.deltaVsBase.y1NetIncome}`,
  );
  check(
    "ESA delay leaves Y5 net income unchanged",
    approxEq(byId.esa_delay_3mo.netIncome[4], base.netIncome[4]),
    `y5=${byId.esa_delay_3mo.netIncome[4]} base=${base.netIncome[4]}`,
  );

  // Founder normalization — must match the canonical normalized view.
  const normalized = computeNormalizedFinancials(microschool).normalized;
  check(
    "Founder normalization reuses computeNormalizedFinancials (no parallel math)",
    byId.founder_normalization.netIncome.every((n, i) =>
      approxEq(n, normalized.netIncome[i]),
    ),
    `stress=${byId.founder_normalization.netIncome.join(",")} normalized=${normalized.netIncome.join(",")}`,
  );

  // deltaVsBase arithmetic consistency.
  for (const sc of result.scenarios) {
    const expectedY1 = sc.netIncome[0] - base.netIncome[0];
    check(
      `deltaVsBase.y1NetIncome reconciles for ${sc.id}`,
      approxEq(sc.deltaVsBase.y1NetIncome, expectedY1),
      `delta=${sc.deltaVsBase.y1NetIncome} expected=${expectedY1}`,
    );
  }
}

// ─── Charter: rent shock branch ───────────────────────────────────────
{
  const result = computeLenderStressTests(charter);
  const rent = result.scenarios.find((s) => s.id === "rent_shock_25")!;
  const base = computeBaseFinancials(charter);

  // Charter fixture has occupancy_facility expense rows — rent shock must
  // strictly reduce net income each year.
  const eachYearWorse = rent.netIncome.every(
    (ni, i) => ni < base.netIncome[i] || approxEq(ni, base.netIncome[i]),
  );
  const someYearWorse = rent.netIncome.some(
    (ni, i) => ni < base.netIncome[i] - 1,
  );
  check(
    "Rent shock +25% never improves net income (charter)",
    eachYearWorse,
    `scenario=${rent.netIncome.join(",")} base=${base.netIncome.join(",")}`,
  );
  check(
    "Rent shock +25% reduces net income at least one year (charter)",
    someYearWorse,
    `scenario=${rent.netIncome.join(",")} base=${base.netIncome.join(",")}`,
  );
}

// ─── Golden snapshot regression: microschool fixture ─────────────────
// Pins every published number for the canonical microschool model so any
// engine drift breaks the build. If the engine intentionally changes,
// regenerate this file using:
//   pnpm --filter @workspace/finance exec tsx tools/regen-stress-snapshot.ts
{
  // Use createRequire so the JSON snapshot loads cleanly under the
  // tsx test runner without forcing experimental import-attribute syntax.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const expected = require("./__snapshots__/lender-stress-tests.microschool.json");
  const r = computeLenderStressTests(microschool);
  const round = (n: number, p = 100) => Math.round(n * p) / p;
  const baseStructural = r.base.dscr.filter((d) => d !== 0);
  const baseMin = baseStructural.length ? Math.min(...baseStructural) : null;
  const actual = {
    base: {
      dscr: r.base.dscr.map((n) => round(n)),
      endingCash: r.base.endingCash.map((n) => Math.round(n)),
      cashRunwayMonths: round(r.base.cashRunwayMonths, 10),
      netIncome: r.base.netIncome.map((n) => Math.round(n)),
      breakEvenYear: r.base.breakEvenYear,
      minDscr: baseMin === null ? null : round(baseMin),
    },
    scenarios: r.scenarios.map((s) => {
      // Drop only DSCR=0 (engine sentinel for "no debt service modeled");
      // keep negatives so the snapshot reflects the true worst year.
      const structural = s.dscr.filter((d) => d !== 0);
      const minDscr = structural.length ? Math.min(...structural) : null;
      return {
        id: s.id,
        minDscr: minDscr === null ? null : round(minDscr),
        cashRunwayMonths: round(s.cashRunwayMonths, 10),
        minEndingCash: Math.round(Math.min(...s.endingCash)),
        y1NetIncome: Math.round(s.netIncome[0]),
        y5NetIncome: Math.round(s.netIncome[4]),
        breakEvenYear: s.breakEvenYear,
        delta: {
          y1NetIncome: Math.round(s.deltaVsBase.y1NetIncome),
          y5NetIncome: Math.round(s.deltaVsBase.y5NetIncome),
          minDscr: round(s.deltaVsBase.minDscr),
          minEndingCash: Math.round(s.deltaVsBase.minEndingCash),
          cashRunwayMonths: round(s.deltaVsBase.cashRunwayMonths, 10),
          breakEvenYearShift: s.deltaVsBase.breakEvenYearShift,
        },
      };
    }),
  };
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  check(
    "Golden snapshot pinned for microschool fixture",
    actualJson === expectedJson,
    `\n  expected=${expectedJson}\n  actual  =${actualJson}`,
  );
}

// ─── minStructuralDscr semantics ─────────────────────────────────────
// DSCR=0 is the engine's sentinel for "no debt service modeled". Negative
// DSCR (debt service exists, NOI is negative) is real downside and MUST be
// preserved as the worst year — otherwise stress scenarios with negative
// Y1 DSCR would falsely appear better than base.
check(
  "minStructuralDscr drops only zeros (no debt service), keeps negatives",
  minStructuralDscr([0, -0.5, 1.4, 2.1, 3.0]) === -0.5,
  `got ${minStructuralDscr([0, -0.5, 1.4, 2.1, 3.0])}`,
);
check(
  "minStructuralDscr returns null when every year is the zero sentinel",
  minStructuralDscr([0, 0, 0, 0, 0]) === null,
);
check(
  "minStructuralDscr picks the negative year over later positives",
  minStructuralDscr([-2.5, 1.1, 1.5, 1.8, 2.0]) === -2.5,
);
check(
  "minStructuralDscr handles all-positive arrays normally",
  minStructuralDscr([3.6, 19.9, 31.1, 40.3, 41.6]) === 3.6,
);

// ─── Regression: enrollment_minus_20 must report the negative-DSCR year ──
// On the microschool fixture this scenario produces a negative Y1 DSCR.
// The reported worst-year DSCR — and the deltaVsBase.minDscr — must reflect
// that, not be dominated by a single positive late-year value.
{
  const { scenarios } = computeLenderStressTests(microschool);
  const minus20 = scenarios.find((s) => s.id === "enrollment_minus_20");
  if (!minus20) {
    failures.push("  FAIL: enrollment_minus_20 scenario missing");
  } else {
    const structural = minus20.dscr.filter((d) => d !== 0);
    const minDscr = structural.length ? Math.min(...structural) : null;
    check(
      "enrollment_minus_20 worst-year DSCR is negative on microschool fixture",
      minDscr !== null && minDscr < 0,
      `minDscr=${minDscr}`,
    );
    check(
      "enrollment_minus_20 deltaVsBase.minDscr is strictly negative (worse than base)",
      minus20.deltaVsBase.minDscr < 0,
      `delta.minDscr=${minus20.deltaVsBase.minDscr}`,
    );
  }
}

// ─── Custom stress test ───────────────────────────────────────────────
// Task #673 — `computeCustomLenderStressTest` runs a single user-tunable
// scenario through the same engine, so a custom -10% enrollment scoped to
// all five years must reproduce the canonical `enrollment_minus_10` result.
{
  const battery = computeLenderStressTests(microschool);
  const canonical = battery.scenarios.find((s) => s.id === "enrollment_minus_10")!;
  const custom = computeCustomLenderStressTest(microschool, {
    knob: "enrollment_pct",
    value: -10,
    startYear: 1,
    endYear: 5,
  });
  check(
    "Custom enrollment -10%/Y1-5 matches canonical enrollment_minus_10 net income",
    custom.netIncome.every((n, i) => approxEq(n, canonical.netIncome[i])),
    `custom=${custom.netIncome.join(",")} canonical=${canonical.netIncome.join(",")}`,
  );
  check(
    "Custom enrollment -10%/Y1-5 matches canonical DSCR",
    custom.dscr.every((d, i) => approxEq(d, canonical.dscr[i])),
    `custom=${custom.dscr.join(",")} canonical=${canonical.dscr.join(",")}`,
  );

  // Narrowing the range to a single year must hurt less than scoping it
  // across all five years (assuming a downside scenario like -20% enrollment).
  const wholeRun = computeCustomLenderStressTest(microschool, {
    knob: "enrollment_pct",
    value: -20,
    startYear: 1,
    endYear: 5,
  });
  const justY1 = computeCustomLenderStressTest(microschool, {
    knob: "enrollment_pct",
    value: -20,
    startYear: 1,
    endYear: 1,
  });
  check(
    "Custom enrollment scoped to Y1 only is less harmful than Y1-Y5",
    justY1.deltaVsBase.y5NetIncome >= wholeRun.deltaVsBase.y5NetIncome,
    `y5 delta justY1=${justY1.deltaVsBase.y5NetIncome} whole=${wholeRun.deltaVsBase.y5NetIncome}`,
  );

  // Founder salary knob: bumping comp well above the as-planned draw must
  // strictly worsen Y1 net income.
  const baseY1 = computeBaseFinancials(microschool).netIncome[0] ?? 0;
  const highSalary = computeCustomLenderStressTest(microschool, {
    knob: "founder_salary_dollars",
    value: 250_000,
    startYear: 1,
    endYear: 5,
  });
  check(
    "Custom founder salary bump strictly reduces Y1 net income vs base",
    (highSalary.netIncome[0] ?? 0) < baseY1,
    `customY1=${highSalary.netIncome[0]} baseY1=${baseY1}`,
  );

  // ESA delay knob: months > 0 across Y1 should match the canonical
  // ESA-delay sign (Y1 NI strictly lower than base) on a charter fixture
  // that has public-funding revenue.
  const charterCustom = computeCustomLenderStressTest(charter, {
    knob: "esa_delay_months",
    value: 3,
    startYear: 1,
    endYear: 1,
  });
  const charterBattery = computeLenderStressTests(charter);
  const charterCanonical = charterBattery.scenarios.find((s) => s.id === "esa_delay_3mo")!;
  check(
    "Custom ESA delay 3mo / Y1 matches canonical esa_delay_3mo on charter",
    charterCustom.netIncome.every((n, i) => approxEq(n, charterCanonical.netIncome[i])),
    `custom=${charterCustom.netIncome.join(",")} canonical=${charterCanonical.netIncome.join(",")}`,
  );

  // Year range is normalized: end < start should clamp to the start.
  const clamped = computeCustomLenderStressTest(microschool, {
    knob: "rent_pct",
    value: 25,
    startYear: 3,
    endYear: 1,
  });
  check(
    "Custom scenario tolerates inverted year range (clamps end to start)",
    Number.isFinite(clamped.netIncome[0]),
    `result=${JSON.stringify(clamped.netIncome)}`,
  );
}

// ─── Report ──────────────────────────────────────────────────────────
const total = passed + failures.length;
console.log(`\nLender stress tests: ${passed}/${total} passed`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
