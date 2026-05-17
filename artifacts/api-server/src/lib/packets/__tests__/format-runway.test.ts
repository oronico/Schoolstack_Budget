import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRunwayMonths, formatRunwayMonthsShort } from "../format-runway";
import { buildNarrative } from "../build-narrative";
import { buildCashRunway } from "../build-cash-runway";
import {
  buildLenderCommentary,
  buildBoardCommentary,
  type NarrativeSourceBundle,
} from "../build-narrative-commentary";
import { generateTopIssues } from "../../decision-rules";
import type { ConsultantOutput } from "../../consultant-engine";
import type { ModelData } from "../../workbook-helpers";

// Task #937 — `cashRunwayMonths` flipped from an integer count of months
// to a fractional coverage ratio (year-end cash / monthly fixed costs).
// Without this formatter, raw template-literal interpolation leaks values
// like `11.122823375736088 months` into lender/board PDFs and emails.
//
// These tests are the canonical contract: no packet surface should ever
// render runway with more than one decimal of precision, and the 60+
// cap must be applied consistently.

const UGLY_RUNWAY = 11.122823375736088;
const MULTI_DECIMAL_MONTHS = /\d+\.\d{2,}\s*months?/i;
// The contract: every runway render must be either "N.N months" (exactly
// one decimal place) or the "60+ months" cap. The expected rendering for
// `UGLY_RUNWAY` is therefore "11.1 months".
const EXPECTED_UGLY_RENDER = "11.1 months";
const EXPECTED_CAP_RENDER = "60+ months";

test("formatRunwayMonths rounds to exactly 1 decimal place", () => {
  assert.equal(formatRunwayMonths(UGLY_RUNWAY), "11.1 months");
  assert.equal(formatRunwayMonths(17.27), "17.3 months");
  assert.equal(formatRunwayMonths(0.04), "0.0 months");
  // Even whole-number inputs must keep the .0 suffix to satisfy the
  // 1-decimal contract.
  assert.equal(formatRunwayMonths(12), "12.0 months");
  assert.equal(formatRunwayMonths(8), "8.0 months");
});

test("formatRunwayMonths caps at 60+ months", () => {
  assert.equal(formatRunwayMonths(60), "60+ months");
  assert.equal(formatRunwayMonths(60.0001), "60+ months");
  assert.equal(formatRunwayMonths(1_000), "60+ months");
});

test("formatRunwayMonths handles non-finite values", () => {
  assert.equal(formatRunwayMonths(Number.NaN), "0.0 months");
  assert.equal(formatRunwayMonths(Number.POSITIVE_INFINITY), "0.0 months");
});

test("formatRunwayMonthsShort drops the suffix for table cells", () => {
  assert.equal(formatRunwayMonthsShort(UGLY_RUNWAY), "11.1");
  assert.equal(formatRunwayMonthsShort(60), "60+");
  assert.equal(formatRunwayMonthsShort(1_000), "60+");
});

function mkBundle(months: number): NarrativeSourceBundle {
  return {
    schoolName: "Test School",
    state: "WA",
    schoolType: "microschool",
    schoolStage: "new school",
    lenderReadiness: "Strong",
    lenderReadinessExplanation: "Solid",
    biggestStrength: "Strong demand",
    biggestRisk: "Ramp risk",
    enrollmentY1: 12,
    enrollmentY5: 28,
    retentionRatePct: 88,
    maxCapacity: 30,
    dscrY1Normalized: 1.4,
    dscrY1Reported: 1.5,
    dscrMinNormalized: 1.2,
    dscrMinNormalizedYear: 2,
    cashRunwayMonths: months,
    reserveMonthsLastYear: 4,
    reserveLastYearNumber: 5,
    troughEndingCash: 25_000,
    troughYear: 2,
    breakEvenYear: 3,
    breakEvenStudentsY1: 18,
    breakEvenUtilizationY1Pct: 60,
    founderCompHasAdjustment: false,
    founderCompTotalDelta: 0,
    revenueQualityY1: {
      contractedPct: 70,
      projectedPct: 20,
      donorDependentPct: 5,
      policyDependentPct: 5,
    },
    topRisks: [],
    worstStress: null,
    negativeY5StressScenarios: [],
    highPriorityActions: [],
  };
}

test("buildLenderCommentary renders runway via the 1-decimal contract", () => {
  const commentary = buildLenderCommentary(mkBundle(UGLY_RUNWAY));
  const text = commentary.paragraphs.join("\n");
  assert.equal(
    MULTI_DECIMAL_MONTHS.test(text),
    false,
    `Lender commentary leaked a multi-decimal runway: ${text}`,
  );
  assert.ok(
    text.includes(EXPECTED_UGLY_RENDER),
    `Lender commentary should render runway as "${EXPECTED_UGLY_RENDER}". Got:\n${text}`,
  );
  assert.ok(
    commentary.allowedFigures.includes(EXPECTED_UGLY_RENDER),
    `Lender commentary allowedFigures missing the 1-decimal runway token`,
  );
});

test("buildBoardCommentary renders runway via the 1-decimal contract", () => {
  const commentary = buildBoardCommentary(mkBundle(UGLY_RUNWAY));
  const text = commentary.paragraphs.join("\n");
  assert.equal(
    MULTI_DECIMAL_MONTHS.test(text),
    false,
    `Board commentary leaked a multi-decimal runway: ${text}`,
  );
  assert.ok(
    text.includes(EXPECTED_UGLY_RENDER),
    `Board commentary should render runway as "${EXPECTED_UGLY_RENDER}". Got:\n${text}`,
  );
});

// Task #918 — when ≥1 lender stress scenario produces negative Y5
// net income, the closing paragraph must lead with the named
// scenario(s) and Y5 dollar amount(s); when none, the failing-stress
// clause must not appear. This locks in both directions deterministically
// — the demo-math-smoke integration assertion only fires the positive
// branch when a real demo seed produces a failure, so this synthetic
// test covers the gap. Asserts on substring matches, not exact copy,
// so a tone tweak doesn't break the test.
test("buildLenderCommentary names failing stress scenarios when ≥1 negative-Y5 stress (Task #918)", () => {
  const bundle = mkBundle(24);
  bundle.negativeY5StressScenarios = [
    { name: "Hard revenue only", y5NetIncome: -5_400_000 },
    { name: "Loss of Philanthropy", y5NetIncome: -120_000 },
  ];
  const text = buildLenderCommentary(bundle).paragraphs.join("\n");
  assert.ok(
    /loss-of-funding risk/i.test(text),
    `closing clause missing "loss-of-funding risk": ${text}`,
  );
  assert.ok(text.includes("Hard revenue only"),
    `failing scenario name missing: ${text}`);
  assert.ok(text.includes("Loss of Philanthropy"),
    `second failing scenario name missing: ${text}`);
  // Y5 dollar magnitudes must appear (formatter renders -$5_400_000 as
  // "-$5.4M" and -$120_000 as "-$120K" via signedCurrency's short form).
  assert.ok(/\$5\.4\s*M/.test(text) || /5,400,000/.test(text),
    `Y5 amount (-$5.4M) missing: ${text}`);
});

test("buildLenderCommentary omits failing-stress clause when no negative-Y5 stress (Task #918)", () => {
  const bundle = mkBundle(24);
  bundle.negativeY5StressScenarios = [];
  const text = buildLenderCommentary(bundle).paragraphs.join("\n");
  assert.equal(/loss-of-funding risk/i.test(text), false,
    `closing clause unexpectedly emitted "loss-of-funding risk": ${text}`);
});

test("buildLenderCommentary applies the 60+ cap consistently", () => {
  const commentary = buildLenderCommentary(mkBundle(180));
  const text = commentary.paragraphs.join("\n");
  // When runway is long, the lender commentary takes the "cash stays
  // positive across the full Year 5 window" branch and the explicit
  // runway sentence doesn't render. But anywhere the raw value would
  // otherwise leak, it must be the capped "60+ months" token (never
  // raw "180 months" or "180.0 months").
  assert.equal(/180\s+months/.test(text), false, `Saw raw 180 months: ${text}`);
  assert.equal(/180\.\d+\s+months/.test(text), false, `Saw decimal 180 months: ${text}`);
  // Also confirm the formatter would have produced the cap so the rendered
  // surface and the formatter agree on the contract.
  assert.equal(formatRunwayMonths(180), EXPECTED_CAP_RENDER);
});

test("buildNarrative never renders runway with >1 decimal of precision", () => {
  const narrative = buildNarrative({
    executiveSummary: "Test executive summary.",
    biggestStrength: "Test strength",
    biggestRisk: "Test risk",
    cashRunwayMonths: UGLY_RUNWAY,
    keyMetrics: [],
    stressTests: [],
    recommendations: [],
    risks: [],
    keyStrengths: [],
    healthSignals: [],
    topIssues: [],
    cumulativeFinancials: [],
    lenderReadiness: "Bankable",
    lenderReadinessExplanation: "",
    lenderReadinessFactors: [],
    underwritingScore: 0,
  } as unknown as ConsultantOutput);
  const rendered = JSON.stringify(narrative);
  assert.equal(
    MULTI_DECIMAL_MONTHS.test(rendered),
    false,
    `Narrative leaked a multi-decimal runway: ${rendered}`,
  );
});

test("buildCashRunway never renders runway with >1 decimal of precision", () => {
  const view = buildCashRunway(
    {
      cashRunwayMonths: UGLY_RUNWAY,
      cumulativeFinancials: [
        { year: 1, cumulativeNetIncome: 0, reserveMonths: 3.5 },
      ],
    } as unknown as ConsultantOutput,
    { openingBalances: { cash: 0 }, revenueRows: [] } as unknown as ModelData,
  );
  const rendered = JSON.stringify(view);
  assert.equal(
    MULTI_DECIMAL_MONTHS.test(rendered),
    false,
    `Cash runway view leaked a multi-decimal runway: ${rendered}`,
  );
});

test("decision-rules short-cash-runway issue never leaks >1 decimal", () => {
  const mkYear = (year: number) => ({
    year,
    students: 100 + year * 50,
    totalRevenue: 1_000_000,
    tuitionRevenue: 700_000,
    publicRevenue: 200_000,
    philanthropyRevenue: 100_000,
    totalStaffingCost: 600_000,
    facilityCost: 100_000,
    totalOpex: 800_000,
    debtService: 0,
    totalExpenses: 950_000,
    netIncome: 50_000,
    netMargin: 0.05,
  });
  const issues = generateTopIssues({
    yearFinancials: [mkYear(1), mkYear(2), mkYear(3), mkYear(4), mkYear(5)],
    cumulativeFinancials: [
      { year: 1, cumulativeNetIncome: 50_000, reserveMonths: 1.2 },
      { year: 2, cumulativeNetIncome: 150_000, reserveMonths: 1.8 },
      { year: 3, cumulativeNetIncome: 300_000, reserveMonths: 3.4 },
      { year: 4, cumulativeNetIncome: 500_000, reserveMonths: 5.5 },
      { year: 5, cumulativeNetIncome: 750_000, reserveMonths: 7.8 },
    ],
    enrollmentByYear: [100, 150, 200, 250, 300],
    cashRunwayMonths: UGLY_RUNWAY,
    maxCapacity: 400,
    schoolType: "Charter",
    fundingProfile: "balanced",
    entityType: "Nonprofit",
    hasDebt: false,
    dscr: 1.2,
  } as unknown as Parameters<typeof generateTopIssues>[0], 10);
  const rendered = JSON.stringify(issues);
  assert.equal(
    MULTI_DECIMAL_MONTHS.test(rendered),
    false,
    `Decision rule leaked a multi-decimal runway: ${rendered}`,
  );
  // Also confirm the short-cash-runway rule fired so the regex isn't vacuously passing
  assert.ok(
    issues.some((i) => i.id === "short_cash_runway"),
    "expected short_cash_runway issue to fire for a sub-18-month runway",
  );
});
