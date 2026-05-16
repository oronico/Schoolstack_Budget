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
import type { LowestCashMonth } from "../monthly-cash-flow.js";

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
  /**
   * Task #932 — worst monthly cumulative-cash trough across the 5-year
   * forecast (not just year-end). Surfaces the in-year cash dip lenders
   * scrutinize separately from runway: a school can show 6 months of
   * Y1 runway and still go cash-negative mid-Y2. `null` only when the
   * scenario engine omitted monthly cash flow data (legacy fixtures).
   */
  lowestCashMonth: LowestCashMonth | null;
  /**
   * Task #932 — FIRST chronological month where cumulative cash dips
   * below zero under the scenario (distinct from `lowestCashMonth`, the
   * deepest trough — can be different months when the curve dips,
   * recovers, then dips deeper). `null` when cash never crosses zero.
   */
  firstNegativeCashMonth: LowestCashMonth | null;
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
  /** Task #932 — worst monthly cumulative-cash trough across the 5-year
   *  forecast under base assumptions (paired with the per-scenario field
   *  on {@link LenderStressScenarioResult}). */
  lowestCashMonth: LowestCashMonth | null;
  /**
   * Task #932 — first chronological month where cumulative cash dips
   * below zero under base assumptions. Drives the lender packet base
   * callout, exec summary, and DSCR & Covenants "Cash first goes
   * negative" row. `null` when cash never crosses zero.
   */
  firstNegativeCashMonth: LowestCashMonth | null;
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
    lowestCashMonth: m.lowestCashMonth ?? null,
    firstNegativeCashMonth: m.firstNegativeCashMonth ?? null,
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
    lowestCashMonth: scenario.lowestCashMonth ?? null,
    firstNegativeCashMonth: scenario.firstNegativeCashMonth ?? null,
    deltaVsBase: deltaVsBase(scenario, base),
  };
}

/** Returns true when 1-indexed `year` falls within the inclusive
 *  `[startYear, endYear]` window. Indices outside 1..5 are ignored. */
function inYearRange(year: number, startYear: number, endYear: number): boolean {
  return year >= startYear && year <= endYear;
}

/** Clone the model and scale enrollment years within `[startYear, endYear]`
 *  (1-indexed, inclusive) by `(1 + pct/100)`, rounded to whole students. */
function withEnrollmentDelta(
  data: FullModelData,
  pct: number,
  startYear = 1,
  endYear = 5,
): FullModelData {
  const factor = 1 + pct / 100;
  const enrollment: Record<string, unknown> = { ...(data.enrollment || {}) };
  for (let y = 1; y <= 5; y++) {
    if (!inYearRange(y, startYear, endYear)) continue;
    const k = `year${y}`;
    const v = enrollment[k];
    if (typeof v === "number") enrollment[k] = Math.max(0, Math.round(v * factor));
  }
  return { ...data, enrollment: enrollment as FullModelData["enrollment"] };
}

/** Clone the model and reduce per-year amounts on public-funding / ESA /
 *  school-choice revenue rows by `pct` across the year range
 *  (1-indexed, inclusive). The canonical battery uses `startYear=endYear=1`
 *  to model a Year-1 disbursement delay; custom callers can widen the
 *  window to model a multi-year funding shortfall. */
function withEsaDelay(
  data: FullModelData,
  pct: number,
  startYear = 1,
  endYear = 1,
): FullModelData {
  const factor = 1 - pct / 100;
  const targetCats = new Set(["public_funding", "school_choice"]);
  const revenueRows: RevenueRowLike[] = (data.revenueRows || []).map((r) => {
    if (!r.category || !targetCats.has(r.category)) return r;
    const amounts = r.amounts ? [...r.amounts] : undefined;
    if (amounts) {
      for (let y = 1; y <= amounts.length; y++) {
        if (!inYearRange(y, startYear, endYear)) continue;
        amounts[y - 1] = (amounts[y - 1] || 0) * factor;
      }
    }
    return { ...r, amounts };
  });
  return { ...data, revenueRows };
}

/** Clone the model and scale every `occupancy_facility` expense row by
 *  `(1 + pct/100)` across the year range (1-indexed, inclusive). */
function withRentShock(
  data: FullModelData,
  pct: number,
  startYear = 1,
  endYear = 5,
): FullModelData {
  const factor = 1 + pct / 100;
  const expenseRows: ExpenseRowLike[] = (data.expenseRows || []).map((r) => {
    if (r.category !== "occupancy_facility") return r;
    const amounts = r.amounts
      ? r.amounts.map((a, idx) =>
          inYearRange(idx + 1, startYear, endYear) ? (a || 0) * factor : a,
        )
      : undefined;
    return { ...r, amounts };
  });
  return { ...data, expenseRows };
}

/** Clone the model and override the founder/leader staffing-row's
 *  annualized rate so the engine's reported staffing-cost (and downstream
 *  net income / DSCR / runway) reflects `dollars` per year. We mutate the
 *  highest-paid `school_leadership` row — the same heuristic
 *  `findFounderRow` and the founder-comp normalizer use — and clear the
 *  legacy `staffing.founderSalary` so the per-year resolver doesn't
 *  shadow it. We also mirror the value into `staffing.reportedFounderComp`
 *  so the lender-view normalization delta is computed against the new
 *  baseline rather than the original. The year-range arg is intentionally
 *  not honored here (the staffing roster carries one rate per role,
 *  escalated by COLA across years); callers passing a narrower range get
 *  a scenario covering all five years and the UI labels it accordingly. */
function withFounderSalary(
  data: FullModelData,
  dollars: number,
  _startYear = 1,
  _endYear = 5,
): FullModelData {
  const safeDollars = Math.max(0, dollars);
  const staffing = (data.staffing ?? {}) as Record<string, unknown>;
  const next: number[] = Array.from({ length: 5 }, () => safeDollars);

  const rows = data.staffingRows ? [...data.staffingRows] : [];
  let founderIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.functionCategory !== "school_leadership") continue;
    const score = (r.fte || 0) * (r.annualizedRate || 0);
    if (score > bestScore) {
      bestScore = score;
      founderIdx = i;
    }
  }
  if (founderIdx >= 0) {
    const founder = rows[founderIdx];
    const fte = founder.fte && founder.fte > 0 ? founder.fte : 1;
    rows[founderIdx] = { ...founder, fte, annualizedRate: safeDollars / fte };
  }

  return {
    ...data,
    staffingRows: rows,
    staffing: {
      ...staffing,
      reportedFounderComp: next,
      founderSalary: undefined,
    } as FullModelData["staffing"],
  };
}

/** Knob a founder can pick on the consultant view's custom stress-test
 *  form. Each maps onto one of the same `with…` mutators the canonical
 *  battery uses, so custom + standard scenarios share identical math. */
export type CustomStressKnob =
  | "enrollment_pct"
  | "rent_pct"
  | "esa_delay_months"
  | "founder_salary_dollars";

export interface CustomStressTestInput {
  knob: CustomStressKnob;
  /** Knob-dependent value:
   *  - `enrollment_pct`: signed pct (e.g. -15 for a 15% miss)
   *  - `rent_pct`: signed pct (e.g. 30 for a +30% lease bump)
   *  - `esa_delay_months`: months delayed (1..12)
   *  - `founder_salary_dollars`: absolute annual salary $ for the range */
  value: number;
  /** Inclusive 1-indexed start year (1..5). */
  startYear: number;
  /** Inclusive 1-indexed end year (1..5). Must be >= `startYear`. */
  endYear: number;
}

function clampYear(y: number): number {
  if (!Number.isFinite(y)) return 1;
  return Math.min(5, Math.max(1, Math.round(y)));
}

function describeYearRange(startYear: number, endYear: number): string {
  return startYear === endYear
    ? `Year ${startYear}`
    : `Years ${startYear}-${endYear}`;
}

function buildCustomMeta(input: CustomStressTestInput): LenderStressScenarioMeta {
  const range = describeYearRange(input.startYear, input.endYear);
  switch (input.knob) {
    case "enrollment_pct": {
      const sign = input.value >= 0 ? "+" : "";
      return {
        id: "custom" as LenderStressScenarioId,
        name: `Custom: Enrollment ${sign}${input.value}% (${range})`,
        description: `Enrollment scaled by ${sign}${input.value}% across ${range.toLowerCase()}, holding other assumptions constant.`,
      };
    }
    case "rent_pct": {
      const sign = input.value >= 0 ? "+" : "";
      return {
        id: "custom" as LenderStressScenarioId,
        name: `Custom: Rent ${sign}${input.value}% (${range})`,
        description: `Occupancy / facility expense rows escalated by ${sign}${input.value}% across ${range.toLowerCase()}.`,
      };
    }
    case "esa_delay_months": {
      const months = Math.max(0, Math.min(12, Math.round(input.value)));
      const pct = Math.round((months / 12) * 100);
      return {
        id: "custom" as LenderStressScenarioId,
        name: `Custom: ESA delay ${months} mo (${range})`,
        description: `ESA / public-funding receipts reduced by ~${pct}% (≈ ${months} months delayed) across ${range.toLowerCase()}.`,
      };
    }
    case "founder_salary_dollars": {
      const fmt = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
      return {
        id: "custom" as LenderStressScenarioId,
        name: `Custom: Founder salary ${fmt.format(input.value)} (Years 1-5)`,
        description: `Founder compensation set to ${fmt.format(input.value)}/yr across all five years, replacing the as-planned draw. (Year-range scoping isn't available for this knob — the staffing roster carries one rate per role.)`,
      };
    }
  }
}

/**
 * Run a single user-tunable scenario alongside the fixed lender battery.
 * Re-uses the same model mutators + canonical scenario engine that
 * {@link computeLenderStressTests} drives, so a custom 12% enrollment miss
 * and the standard −10% scenario are computed by the exact same math.
 *
 * Result is read-only / not persisted — callers should treat it as a
 * derived view that is recomputed on every render.
 */
export function computeCustomLenderStressTest(
  data: FullModelData,
  input: CustomStressTestInput,
): LenderStressScenarioResult {
  const startYear = clampYear(input.startYear);
  const endYear = Math.max(startYear, clampYear(input.endYear));
  const safeInput: CustomStressTestInput = { ...input, startYear, endYear };
  const baseMetrics = computeBaseFinancials(data);
  let scenarioMetrics: ScenarioMetrics;
  switch (safeInput.knob) {
    case "enrollment_pct":
      scenarioMetrics = computeBaseFinancials(
        withEnrollmentDelta(data, safeInput.value, startYear, endYear),
      );
      break;
    case "rent_pct":
      scenarioMetrics = computeBaseFinancials(
        withRentShock(data, safeInput.value, startYear, endYear),
      );
      break;
    case "esa_delay_months": {
      const months = Math.max(0, Math.min(12, safeInput.value));
      const pct = (months / 12) * 100;
      scenarioMetrics = computeBaseFinancials(
        withEsaDelay(data, pct, startYear, endYear),
      );
      break;
    }
    case "founder_salary_dollars":
      scenarioMetrics = computeBaseFinancials(
        withFounderSalary(data, Math.max(0, safeInput.value), startYear, endYear),
      );
      break;
  }
  return buildResult(buildCustomMeta(safeInput), scenarioMetrics, baseMetrics);
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
