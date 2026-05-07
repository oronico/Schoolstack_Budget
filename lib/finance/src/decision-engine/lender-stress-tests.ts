/**
 * Task #616 — Standard lender stress tests.
 *
 * A fixed, named set of downside scenarios that lenders routinely run
 * against a school's pro-forma:
 *
 *   1. Enrollment -10%
 *   2. Enrollment -20%
 *   3. ESA / public-funding payment delayed 3 months in Year 1
 *   4. Rent shock (+25% on occupancy / facility expense rows)
 *   5. Founder compensation normalized to market rate (lender / board view)
 *
 * Each scenario re-runs the canonical engine (`computeBaseFinancials` /
 * `computeNormalizedFinancials`) on a cloned model — there is intentionally
 * no parallel math here. Callers (founder dashboard, consultant analysis,
 * lender packet PDF, lender pro-forma workbook) all pull from the same
 * `computeLenderStressTests` so every surface shows identical numbers.
 */

import type { FullModelData, RevenueRowLike, ExpenseRowLike } from "./model-shape.js";
import {
  computeBaseFinancials,
  computeNormalizedFinancials,
  type ScenarioMetrics,
} from "./scenario-engine.js";

export type LenderStressScenarioId =
  | "enrollment_minus_10"
  | "enrollment_minus_20"
  | "esa_delay_3mo"
  | "rent_shock_25"
  | "founder_normalization";

export interface LenderStressScenarioMeta {
  id: LenderStressScenarioId;
  name: string;
  description: string;
}

/**
 * Default ESA delay (months) and rent-shock pct used by the canonical
 * stress battery. The five scenarios are intentionally fixed/named, but
 * these two knobs are configurable via {@link LenderStressTestOptions}
 * so a consultant or lender review can override the defaults without
 * forking the engine.
 */
export const DEFAULT_ESA_DELAY_MONTHS = 3;
export const DEFAULT_RENT_SHOCK_PCT = 25;

export interface LenderStressTestOptions {
  /** Months of Year-1 public-funding / ESA / school-choice receipts that
   *  arrive late. Defaults to {@link DEFAULT_ESA_DELAY_MONTHS}. Internally
   *  applied as `pct = (months / 12) * 100` so a 3-month delay reduces the
   *  Year-1 collected amount by 25%. */
  esaDelayMonths?: number;
  /** Percentage rent / occupancy escalator applied across all five years.
   *  Defaults to {@link DEFAULT_RENT_SHOCK_PCT}. */
  rentShockPct?: number;
}

function buildScenarioCatalog(opts: Required<LenderStressTestOptions>): readonly LenderStressScenarioMeta[] {
  const esaPct = Math.round((opts.esaDelayMonths / 12) * 100);
  return [
    {
      id: "enrollment_minus_10",
      name: "Enrollment -10%",
      description: "All five enrollment years scaled down by 10% — the standard lender enrollment-miss sensitivity.",
    },
    {
      id: "enrollment_minus_20",
      name: "Enrollment -20%",
      description: "All five enrollment years scaled down by 20% — the stretch downside lenders use to confirm the school can survive a soft-launch.",
    },
    {
      id: "esa_delay_3mo",
      name: `ESA / Public Funding Delayed ${opts.esaDelayMonths} Month${opts.esaDelayMonths === 1 ? "" : "s"}`,
      description: `Year-1 ESA, school-choice, and public-funding receipts reduced by ${esaPct}% (≈ ${opts.esaDelayMonths} months delayed) to simulate a slow first disbursement.`,
    },
    {
      id: "rent_shock_25",
      name: `Rent Shock +${opts.rentShockPct}%`,
      description: `Occupancy & facility expense rows escalated by ${opts.rentShockPct}% — covers a lease renewal, market-rate reset, or unbudgeted CAM/utilities surprise.`,
    },
    {
      id: "founder_normalization",
      name: "Founder Comp Normalized to Market",
      description: "Founder compensation re-cast at the market-rate benchmark (with benefits + payroll tax). The lender / board view of true operating cost.",
    },
  ];
}

/** Fixed catalog of lender stress tests at default parameters. Surfaced in
 *  the founder dashboard, consultant view, lender packet PDF, and lender
 *  pro-forma workbook. Use {@link computeLenderStressTests} with options
 *  to override the ESA delay / rent-shock parameters. */
export const LENDER_STRESS_SCENARIOS: readonly LenderStressScenarioMeta[] = buildScenarioCatalog({
  esaDelayMonths: DEFAULT_ESA_DELAY_MONTHS,
  rentShockPct: DEFAULT_RENT_SHOCK_PCT,
});

export interface LenderStressScenarioResult extends LenderStressScenarioMeta {
  /** Per-year DSCR under the scenario (0 when no debt service modeled). */
  dscr: number[];
  /** Per-year ending cash position. */
  endingCash: number[];
  /** Year-1 monthly cash runway (months) under the scenario. */
  cashRunwayMonths: number;
  /** Per-year break-even student count under the scenario. */
  breakEvenStudents: Array<number | null>;
  /** Per-year net income under the scenario. */
  netIncome: number[];
  /** First year net income is non-negative; null if never. */
  breakEvenYear: number | null;
  /** Deltas vs base — a single-glance summary lenders skim first. */
  deltaVsBase: {
    /** Year-1 net income delta (scenario − base). Negative = worse. */
    y1NetIncome: number;
    /** Year-5 net income delta. */
    y5NetIncome: number;
    /** Year-1 DSCR delta. */
    y1Dscr: number;
    /** Lowest DSCR across 5 years under the scenario, minus base equivalent. */
    minDscr: number;
    /** Lowest ending cash across 5 years, minus base equivalent. */
    minEndingCash: number;
    /** Cash runway delta (months). */
    cashRunwayMonths: number;
    /** Year shift in break-even (positive = pushed out N years; null when
     *  base or scenario never breaks even). */
    breakEvenYearShift: number | null;
  };
}

export interface LenderStressTestBaseline {
  dscr: number[];
  endingCash: number[];
  cashRunwayMonths: number;
  breakEvenStudents: Array<number | null>;
  netIncome: number[];
  breakEvenYear: number | null;
}

export interface LenderStressTestResults {
  base: LenderStressTestBaseline;
  scenarios: LenderStressScenarioResult[];
}

/**
 * Lender-facing helpers always read the *unrestricted* cash position +
 * unrestricted runway off ScenarioMetrics — restricted philanthropy /
 * grant balances cannot service debt or fund payroll, so a stress-test
 * "ending cash" row that included them would mislead lenders. Falls back
 * to the all-in figures only if the scenario engine omits the unrestricted
 * fields (older callers / minimal fixtures).
 */
function pickEndingCash(m: ScenarioMetrics): number[] {
  return m.unrestrictedCash ?? m.cashPosition;
}
function pickRunway(m: ScenarioMetrics): number {
  return m.unrestrictedCashRunwayMonths ?? m.cashRunwayMonths;
}

function metricsToBaseline(m: ScenarioMetrics): LenderStressTestBaseline {
  return {
    dscr: m.dscr,
    endingCash: pickEndingCash(m),
    cashRunwayMonths: pickRunway(m),
    breakEvenStudents: m.breakEvenStudents,
    netIncome: m.netIncome,
    breakEvenYear: m.breakEvenYear,
  };
}

/**
 * True minimum DSCR over modeled years. DSCR=0 is the engine's sentinel for
 * "no debt service modeled" (structurally unavailable) — we drop only those
 * zeros. Negative DSCRs (debt service exists but NOI is negative) MUST be
 * included; otherwise a stressed scenario with negative Y1 DSCR would show as
 * "better" than base purely because we ignored the worst year. Returns
 * `null` when no year has debt service modeled.
 */
export function minStructuralDscr(dscr: readonly number[]): number | null {
  const structural = dscr.filter((d) => d !== 0);
  if (structural.length === 0) return null;
  return Math.min(...structural);
}

function deltaVsBase(
  scenario: ScenarioMetrics,
  base: ScenarioMetrics,
): LenderStressScenarioResult["deltaVsBase"] {
  const minS = minStructuralDscr(scenario.dscr);
  const minB = minStructuralDscr(base.dscr);
  const minSafe = (n: number | null) => (n === null ? 0 : n);
  const beShift =
    scenario.breakEvenYear !== null && base.breakEvenYear !== null
      ? scenario.breakEvenYear - base.breakEvenYear
      : null;
  return {
    y1NetIncome: (scenario.netIncome[0] ?? 0) - (base.netIncome[0] ?? 0),
    y5NetIncome: (scenario.netIncome[4] ?? 0) - (base.netIncome[4] ?? 0),
    y1Dscr: (scenario.dscr[0] ?? 0) - (base.dscr[0] ?? 0),
    minDscr: minSafe(minS) - minSafe(minB),
    minEndingCash:
      Math.min(...pickEndingCash(scenario)) - Math.min(...pickEndingCash(base)),
    cashRunwayMonths: pickRunway(scenario) - pickRunway(base),
    breakEvenYearShift: beShift,
  };
}

function buildResult(
  meta: LenderStressScenarioMeta,
  scenario: ScenarioMetrics,
  base: ScenarioMetrics,
): LenderStressScenarioResult {
  return {
    ...meta,
    dscr: scenario.dscr,
    endingCash: pickEndingCash(scenario),
    cashRunwayMonths: pickRunway(scenario),
    breakEvenStudents: scenario.breakEvenStudents,
    netIncome: scenario.netIncome,
    breakEvenYear: scenario.breakEvenYear,
    deltaVsBase: deltaVsBase(scenario, base),
  };
}

/** Clone the model and scale every enrollment year by `(1 + pct/100)`,
 *  rounded to whole students. */
function withEnrollmentDelta(data: FullModelData, pct: number): FullModelData {
  const factor = 1 + pct / 100;
  const enrollment: Record<string, unknown> = { ...(data.enrollment || {}) };
  for (const k of ["year1", "year2", "year3", "year4", "year5"]) {
    const v = enrollment[k];
    if (typeof v === "number") enrollment[k] = Math.max(0, Math.round(v * factor));
  }
  return { ...data, enrollment: enrollment as FullModelData["enrollment"] };
}

/** Clone the model and reduce Year-1 amounts on public-funding / ESA /
 *  school-choice revenue rows by `pct` (e.g. 25 for a 3-month delay). */
function withEsaDelay(data: FullModelData, pct: number): FullModelData {
  const factor = 1 - pct / 100;
  const targetCats = new Set(["public_funding", "school_choice"]);
  const revenueRows: RevenueRowLike[] = (data.revenueRows || []).map((r) => {
    if (!r.category || !targetCats.has(r.category)) return r;
    const amounts = r.amounts ? [...r.amounts] : undefined;
    if (amounts && amounts.length > 0) amounts[0] = (amounts[0] || 0) * factor;
    return { ...r, amounts };
  });
  return { ...data, revenueRows };
}

/** Clone the model and scale every `occupancy_facility` expense row by
 *  `(1 + pct/100)` across all five years. */
function withRentShock(data: FullModelData, pct: number): FullModelData {
  const factor = 1 + pct / 100;
  const expenseRows: ExpenseRowLike[] = (data.expenseRows || []).map((r) => {
    if (r.category !== "occupancy_facility") return r;
    const amounts = r.amounts ? r.amounts.map((a) => (a || 0) * factor) : undefined;
    return { ...r, amounts };
  });
  return { ...data, expenseRows };
}

/**
 * Run the canonical lender stress-test battery against `data`. Returns the
 * base metrics + one result per fixed scenario, each carrying full per-year
 * DSCR / ending cash / break-even arrays plus a `deltaVsBase` summary.
 *
 * Contract — these results MUST match what the founder sees on the
 * dashboard, the consultant view, the lender packet PDF, and the lender
 * pro-forma workbook because every surface calls this same helper.
 */
export function computeLenderStressTests(
  data: FullModelData,
  options: LenderStressTestOptions = {},
): LenderStressTestResults {
  const opts: Required<LenderStressTestOptions> = {
    esaDelayMonths: options.esaDelayMonths ?? DEFAULT_ESA_DELAY_MONTHS,
    rentShockPct: options.rentShockPct ?? DEFAULT_RENT_SHOCK_PCT,
  };
  const esaDelayPct = (opts.esaDelayMonths / 12) * 100;
  const catalog = buildScenarioCatalog(opts);

  const baseMetrics = computeBaseFinancials(data);

  // Founder normalization re-uses the canonical normalized-view helper so we
  // don't re-derive market-rate comp math here. The `normalized` field is a
  // full ScenarioMetrics with founder cost shifted to market.
  const normalizedView = computeNormalizedFinancials(data);

  const scenarios: LenderStressScenarioResult[] = catalog.map((meta) => {
    let metrics: ScenarioMetrics;
    switch (meta.id) {
      case "enrollment_minus_10":
        metrics = computeBaseFinancials(withEnrollmentDelta(data, -10));
        break;
      case "enrollment_minus_20":
        metrics = computeBaseFinancials(withEnrollmentDelta(data, -20));
        break;
      case "esa_delay_3mo":
        metrics = computeBaseFinancials(withEsaDelay(data, esaDelayPct));
        break;
      case "rent_shock_25":
        metrics = computeBaseFinancials(withRentShock(data, opts.rentShockPct));
        break;
      case "founder_normalization":
        metrics = normalizedView.normalized;
        break;
    }
    return buildResult(meta, metrics, baseMetrics);
  });

  return {
    base: metricsToBaseline(baseMetrics),
    scenarios,
  };
}
