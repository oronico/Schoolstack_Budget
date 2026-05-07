import type { FullModelData, ProgramLike } from "./model-shape.js";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../constants.js";
import {
  computeYear1MonthlyCashFlow,
  distributePersonnelMonthly,
  distributeOpexMonthly,
  distributeDebtMonthly,
  findLowestCashMonth,
  findLowestCashMonthAcrossYears,
  computeCashRunwayMonths,
  distributeRevenueMonthly,
  type MonthlyCashFlowSeries,
  type LowestCashMonth,
  type MonthlyRevenueRowLike,
} from "../monthly-cash-flow.js";
import { computeFounderCompNormalization, type FounderCompNormalization } from "../founder-comp.js";
import { isRestrictedRevenueRow } from "../restricted-revenue.js";

export interface ScenarioAdjustments {
  name: string;
  enrollmentAdjustment: number;
  tuitionAdjustment: number;
  expenseAdjustment: number;
  staffingAdjustment: number;
  facilityAdjustment: number;
}

export interface ScenarioMetrics {
  enrollment: number[];
  revenue: number[];
  staffingCost: number[];
  facilityCost: number[];
  opex: number[];
  totalExpenses: number[];
  netIncome: number[];
  netMargin: number[];
  dscr: number[];
  staffingPctOfRevenue: number[];
  breakEvenYear: number | null;
  cashRunwayMonths: number;
  reserveMonths: number;
  /**
   * Year-end cash position for each of the 5 modeled years, in dollars.
   * Computed as openingBalances.cash + cumulative net income through year Y.
   * Lets founders see the per-year trough — the year cash is tightest — which
   * is critical for spotting the "runway crunch year" lenders zero in on.
   */
  cashPosition: number[];
  loanDebtService?: number[];
  /**
   * Year 1 monthly cash flow series built from real per-stream timing
   * (tuition billing months, ESA disbursement quarters, public funding
   * cadence + lag, philanthropy receipt month, payroll across operating
   * months only, debt service across all 12 months). Annual totals
   * reconcile to `revenue[0]` / `totalExpenses[0]` — only the *shape*
   * across months reflects timing. Task #609.
   */
  monthlyCashFlowY1?: MonthlyCashFlowSeries;
  /**
   * Per-stream monthly cash flow series for each of the 5 modeled years.
   * Index 0 is the same series as {@link monthlyCashFlowY1}; indices 1-4
   * use real per-stream timing for revenue + op-month-aware spreads for
   * expenses, with each year's `cumulative` chained off the prior year's
   * ending cash. Annual sums are scaled to reconcile to `revenue[y]` /
   * `totalExpenses[y]`. Powers the multi-year monthly cash flow tables in
   * the lender pro-forma + packet PDF (Task #636).
   */
  monthlyCashFlowByYear?: MonthlyCashFlowSeries[];
  /**
   * The month with the lowest cumulative cash position across all 5
   * modeled years. `yearIndex` indicates which forecast year the trough
   * falls in. Surfaced on the founder dashboard, lender pro-forma, and
   * packet PDF so the trough callout reflects the full enrollment-ramp
   * trajectory, not just Year 1 (Task #609 → multi-year in #636).
   */
  lowestCashMonth?: LowestCashMonth | null;
  /**
   * Per-year opex split into fixed (annual_fixed, monthly, per_fte,
   * percent_of_base) and variable (per_student, per_new_student,
   * percent_of_revenue) buckets. Sum equals {@link ScenarioMetrics.opex}
   * for that year. Used by break-even math (Task #612) so fixed opex
   * correctly counts toward fixed costs instead of being amortized into
   * the per-student contribution margin denominator.
   */
  fixedOpex: number[];
  variableOpex: number[];
  /**
   * Per-year break-even student count: how many students each modeled year
   * needs at the current revenue/cost mix to fully cover staffing, facility,
   * loan debt service, and fixed opex. `null` when the math is undefined
   * (zero enrollment that year, or contribution margin <= 0). Task #612.
   */
  breakEvenStudents: Array<number | null>;
  /**
   * Per-year break-even utilization vs `schoolProfile.maxCapacity`, i.e.
   * `breakEvenStudents / maxCapacity` as a fraction in [0, +inf). `null`
   * when capacity is missing/zero or break-even is undefined. Values > 1.0
   * mean break-even cannot fit inside stated capacity that year. Task #612.
   */
  breakEvenUtilization: Array<number | null>;

  // ── Task #610: Cash-reality layer ───────────────────────────────────────
  /** Contracted/billed revenue per year — what the school *would* recognize
   *  if every family paid in full and on time. This is the "accrual headline"
   *  founders compare against the cash-reality `revenue` figure. */
  contractedRevenue: number[];
  /** Tuition that the engine writes off as bad debt each year. Equals
   *  contracted tuition × (1 - effective collection rate) where the
   *  effective rate folds row-level `collectionRate` and the model-wide
   *  `revenueDefaults.tuitionDelinquencyRate` benchmark together. */
  badDebt: number[];
  /** Estimated end-of-year accounts-receivable balance (collected revenue ×
   *  weighted collection-delay days / 365). Surfaced on the lender pro-forma
   *  AR Schedule and underwriting workbook. */
  arBalance: number[];
  /** Restricted philanthropy/grants recognized this year (capital, program-
   *  restricted, scholarship-restricted, etc.). These are still part of
   *  total `revenue[]` but get carved out of cash availability so DSCR /
   *  runway aren't propped up by money the school can't legally spend. */
  restrictedRevenue: number[];
  /** Cumulative restricted cash held through year Y. */
  restrictedCash: number[];
  /** Year-end unrestricted cash position = cashPosition[y] - restrictedCash[y].
   *  This is the headline figure the dashboard, scenario planner, and lender
   *  packet show by default; the "vs accrual" toggle reveals cashPosition[]. */
  unrestrictedCash: number[];
  /** Months of runway computed from unrestricted cash only (restricted
   *  inflows pulled out of every year's monthly net). Lenders use this to
   *  size operating reserves; restricted gifts can't service debt. */
  unrestrictedCashRunwayMonths: number;
  /** Tuition delinquency rate (0-100%) actually applied this run, after
   *  layering school-type benchmarks + the founder's wizard input. Echoed
   *  back so the UI can display "Applied: 5% delinquency assumption". */
  tuitionDelinquencyRateApplied: number;
}

/**
 * Per-year break-even student count from a {@link ScenarioMetrics}. Returns
 * `null` when the math is undefined (zero enrollment or non-positive
 * contribution margin). Exported so callers (workbook, lender packet) can
 * recompute break-even off pre-computed metrics without re-running the
 * full engine.
 */
export function computeBreakEvenStudentsForYear(m: ScenarioMetrics, y: number): number | null {
  const students = m.enrollment[y] || 0;
  if (students <= 0) return null;
  const revenuePerStudent = m.revenue[y] / students;
  // Fixed = staffing + facility + loan debt service + fixed-driver opex
  // (annual_fixed, monthly, per_fte, percent_of_base). Variable = the
  // per-student / per-new-student / percent_of_revenue slice of opex.
  // Falls back to "all opex variable" when the split isn't populated so
  // older callers don't break (Task #612 review).
  const fixedOpex = m.fixedOpex?.[y] ?? 0;
  const variableOpex = m.variableOpex?.[y] ?? (m.fixedOpex ? 0 : (m.opex[y] ?? 0));
  const fixedCosts =
    m.staffingCost[y] +
    (m.facilityCost?.[y] ?? 0) +
    (m.loanDebtService?.[y] ?? 0) +
    fixedOpex;
  const variableCostPerStudent = variableOpex / students;
  const contributionMargin = revenuePerStudent - variableCostPerStudent;
  if (contributionMargin <= 0) return null;
  return Math.ceil(fixedCosts / contributionMargin);
}

/**
 * Per-program break-even view for a single year (Task #627). Splits revenue
 * and variable cost across the school's `programs` array using each program's
 * own `annualTuition` and projected enrollment for the year, allocates shared
 * fixed costs (staffing + facility + loan debt service + fixed-driver opex)
 * by enrollment share, then computes:
 *
 *  - `breakEvenStudents` — the headcount this program would need (at its own
 *    tuition) to fully cover its allocated share of fixed costs. `null` when
 *    the math is undefined (zero enrollment, contribution margin <= 0, or no
 *    enrollment school-wide that year).
 *  - `surplus` — the program's contribution margin minus its allocated fixed
 *    costs. Positive means the program is "carrying" the school (covering
 *    more than its share of overhead); negative means it's being subsidised
 *    by the rest of the portfolio.
 *
 * Tuition is escalated by `data.tuitionEscalation.rate` for years past Y1
 * to mirror the engine's per-row tier math. When `enrollmentAdjustment`
 * is non-zero, program enrollment is scaled by `1 + adj/100` (matching how
 * `applyAdjustments` scales school-wide enrollment for scenario rows).
 */
export interface ProgramBreakEven {
  programId: string;
  programName: string;
  enrollment: number;
  annualTuition: number;
  revenue: number;
  variableCost: number;
  contributionMargin: number;
  contributionMarginPerStudent: number;
  allocatedFixedCost: number;
  breakEvenStudents: number | null;
  surplus: number;
  carriesSchool: boolean;
}

export function computeProgramBreakEven(
  data: FullModelData,
  metrics: ScenarioMetrics,
  yearIndex: number,
  enrollmentAdjustment: number = 0,
  tuitionAdjustment: number = 0,
): ProgramBreakEven[] {
  const programs = data.programs || [];
  if (programs.length === 0) return [];

  const y = yearIndex;
  const yearKey = (`year${y + 1}`) as keyof ProgramLike;
  const tuitionEsc = (data.tuitionEscalation?.rate ?? 0) / 100;
  const tuitionFactor = Math.pow(1 + tuitionEsc, y) * (1 + tuitionAdjustment / 100);
  const enrollmentFactor = 1 + enrollmentAdjustment / 100;

  const programEnrollments = programs.map((p) => {
    const raw = (p[yearKey] as number) ?? 0;
    return Math.max(0, Math.round(raw * enrollmentFactor));
  });
  const programTotal = programEnrollments.reduce((a, b) => a + b, 0);

  // Use the engine's school-wide enrollment as the allocation denominator
  // when it's larger than the sum of program rows (i.e. the founder hasn't
  // assigned every enrolled student to a program yet). That keeps allocated
  // fixed costs from being overstated for the programs that *are* defined.
  const schoolTotal = metrics.enrollment[y] || 0;
  const denom = Math.max(programTotal, schoolTotal);

  const fixedOpex = metrics.fixedOpex?.[y] ?? 0;
  const fixedCostsTotal =
    (metrics.staffingCost[y] ?? 0) +
    (metrics.facilityCost?.[y] ?? 0) +
    (metrics.loanDebtService?.[y] ?? 0) +
    fixedOpex;
  const variableOpexTotal =
    metrics.variableOpex?.[y] ?? (metrics.fixedOpex ? 0 : (metrics.opex[y] ?? 0));

  return programs.map((p, i) => {
    const students = programEnrollments[i];
    const escalatedTuition = (p.annualTuition ?? 0) * tuitionFactor;
    const revenue = escalatedTuition * students;
    const share = denom > 0 ? students / denom : 0;
    const variableCost = variableOpexTotal * share;
    const allocatedFixedCost = fixedCostsTotal * share;
    const contributionMargin = revenue - variableCost;
    const variableCostPerStudent = students > 0 ? variableCost / students : 0;
    const contributionMarginPerStudent = escalatedTuition - variableCostPerStudent;

    let breakEvenStudents: number | null = null;
    if (students > 0 && contributionMarginPerStudent > 0 && allocatedFixedCost > 0) {
      breakEvenStudents = Math.ceil(allocatedFixedCost / contributionMarginPerStudent);
    } else if (allocatedFixedCost === 0 && students > 0) {
      breakEvenStudents = 0;
    }

    const surplus = contributionMargin - allocatedFixedCost;
    return {
      programId: p.id ?? `program_${i}`,
      programName: p.name?.trim() || `Program ${i + 1}`,
      enrollment: students,
      annualTuition: escalatedTuition,
      revenue,
      variableCost,
      contributionMargin,
      contributionMarginPerStudent,
      allocatedFixedCost,
      breakEvenStudents,
      surplus,
      carriesSchool: surplus > 0,
    };
  });
}

function buildBreakEvenArrays(
  metrics: Omit<ScenarioMetrics, "breakEvenStudents" | "breakEvenUtilization">,
  maxCapacity: number | undefined,
): { breakEvenStudents: Array<number | null>; breakEvenUtilization: Array<number | null> } {
  const breakEvenStudents: Array<number | null> = [];
  const breakEvenUtilization: Array<number | null> = [];
  for (let y = 0; y < (metrics.enrollment.length || 5); y++) {
    const be = computeBreakEvenStudentsForYear(metrics as ScenarioMetrics, y);
    breakEvenStudents.push(be);
    if (be === null || !maxCapacity || maxCapacity <= 0) {
      breakEvenUtilization.push(null);
    } else {
      breakEvenUtilization.push(be / maxCapacity);
    }
  }
  return { breakEvenStudents, breakEvenUtilization };
}

/** Parallel "as planned" vs "normalized" view. The reported view is the
 *  founder-facing dashboard primary; the normalized view is the lender /
 *  board packet primary. The two views differ only in founder compensation
 *  treatment — see `founder-comp.ts` for the resolution rules. */
export interface NormalizedFinancialsView {
  /** Reported / as-planned metrics (founder draws what they actually plan). */
  reported: ScenarioMetrics;
  /** Normalized metrics (founder comp at market rate, with benefits + payroll
   *  tax adjusted accordingly). */
  normalized: ScenarioMetrics;
  /** Per-year and total founder-comp delta details. */
  founderComp: FounderCompNormalization;
}

export interface NudgeItem {
  signal: "green" | "amber" | "red";
  label: string;
  message: string;
}

export interface ScenarioResult {
  name: string;
  adjustments: ScenarioAdjustments;
  metrics: ScenarioMetrics;
  nudges: NudgeItem[];
  /**
   * Downside enrollment sensitivity band (-10% / -20%) computed off the
   * base data. Only attached to the `base` result returned by
   * {@link computeScenarios} (Task #612).
   */
  downsideBand?: DownsideBand;
}

function seNewStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

function seReturningStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

function driverVal(
  amounts: number[] | undefined,
  y: number,
  driverType: string,
  students: number,
  escalationRate?: number,
  fallbackEsc?: number,
  newStudents?: number,
  returningStudents?: number,
  escalationRateOverridden?: boolean,
): number {
  const raw = amounts?.[y] ?? 0;
  const esc = escalationRateOverridden ? (escalationRate ?? 0) : ((escalationRate !== undefined && escalationRate !== 0) ? escalationRate : (fallbackEsc ?? 0));
  let base: number;
  if (esc !== 0 && y > 0) {
    base = (amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
  } else {
    base = raw;
  }
  switch (driverType) {
    case "monthly":
      return base * 12;
    case "per_student":
      return base * students;
    case "per_new_student":
      return base * (newStudents ?? students);
    case "per_returning_student":
      return base * (returningStudents ?? 0);
    default:
      return base;
  }
}

function computeTotalFTE(staffingRows: Array<{ fte?: number; startYear?: number; endYear?: number; staffingMode?: string; studentRatio?: number; minFte?: number; maxFte?: number }>, year: number, students: number): number {
  let total = 0;
  for (const r of staffingRows) {
    let fte = r.fte || 0;
    if (r.startYear && (year + 1) < r.startYear) fte = 0;
    else if (r.endYear && (year + 1) > r.endYear) fte = 0;
    else if (r.staffingMode === "ratio" && r.studentRatio && r.studentRatio > 0) {
      let computed = students / r.studentRatio;
      if (r.minFte !== undefined) computed = Math.max(computed, r.minFte);
      if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte);
      fte = Math.ceil(computed * 2) / 2;
    }
    total += fte;
  }
  return total;
}

export function computeBaseFinancials(data: FullModelData): ScenarioMetrics {
  const sp = data.schoolProfile;
  const en = (data.enrollment || {}) as Record<string, unknown>;
  const enrollment = [(en.year1 as number) || 0, (en.year2 as number) || 0, (en.year3 as number) || 0, (en.year4 as number) || 0, (en.year5 as number) || 0];
  const seRR = (en.retentionRate as number) ?? 85;
  const prorationFactor = sp?.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
  const costInflation = data.facilities?.generalCostInflation || 0;

  const revenueRows = (data.revenueRows || []).filter((r) => r.enabled);
  const staffingRows = data.staffingRows || [];
  const expenseRows = (data.expenseRows || []).filter((r) => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter((r) => r.enabled);
  const tiers = data.tuitionTiers || [];

  const revenue: number[] = [];
  const staffingCost: number[] = [];
  const facilityCost: number[] = [];
  const opex: number[] = [];
  const fixedOpex: number[] = [];
  const variableOpex: number[] = [];
  const totalExpenses: number[] = [];
  const netIncome: number[] = [];
  const netMargin: number[] = [];
  const dscr: number[] = [];
  const staffingPctOfRevenue: number[] = [];
  const loanDS: number[] = [];

  // Task #610: cash-reality accumulators.
  const contractedRevenue: number[] = [];
  const badDebt: number[] = [];
  const arBalance: number[] = [];
  const restrictedRevenue: number[] = [];
  // Per-year tuition revenue for AR roll-forward (post-collection-rate but
  // pre-delinquency). `weightedDelayDaysByYear` tracks the revenue-weighted
  // average collection delay across tuition rows so AR shrinks/grows
  // realistically when row mixes change year over year.
  const tuitionRevenueByYear: number[] = [];
  const weightedDelayDaysByYear: number[] = [];

  // Wizard-defaulted tuition delinquency assumption — fed in as
  // `revenueDefaults.tuitionDelinquencyRate` from the AssumptionsStep, with
  // school-type benchmark defaults pre-stamped on the form. Applied as an
  // additional multiplicative haircut on tuition rows on top of any
  // row-level `collectionRate`. Units: percent (0-100). The engine clamps
  // out-of-range values defensively.
  const rd = (data as Record<string, unknown>).revenueDefaults as
    | { tuitionDelinquencyRate?: number }
    | undefined;
  const rawDelinquency = rd?.tuitionDelinquencyRate ?? 0;
  const tuitionDelinquencyRateApplied = Math.min(
    50,
    Math.max(0, Number.isFinite(rawDelinquency) ? rawDelinquency : 0),
  );
  const delinquencyMultiplier = 1 - tuitionDelinquencyRateApplied / 100;

  for (let y = 0; y < 5; y++) {
    const students = enrollment[y];
    const pf = y === 0 ? prorationFactor : 1;
    // Compute these once per year and reuse them for both revenue and expense
    // driver dispatch. Without this, revenue rows using `per_new_student` /
    // `per_returning_student` silently fall back to per-student / zero, which
    // overstates per-new-student revenue and zeroes out per-returning-student
    // revenue (e.g. a per-pupil grant that only applies to returning kids).
    const newStudentsY = seNewStudents(enrollment, seRR, y);
    const returningStudentsY = seReturningStudents(enrollment, seRR, y);

    let revTotal = 0;
    const revVals = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.driverType === "percent_of_base") continue;
      let val: number;
      if (r.driverType === "per_student" && r.category === "tuition_and_fees" && tiers.length > 0) {
        const baseTuition = r.amounts?.[0] ?? 0;
        const escRate = (data.tuitionEscalation?.rate ?? r.escalationRate ?? 0) / 100;
        const adjTuition = baseTuition * Math.pow(1 + escRate, y);

        let rawTierTotal = 0;
        for (const t of tiers) {
          rawTierTotal += t.studentCounts?.[y] ?? 0;
        }
        const scaleFactor = rawTierTotal > students ? students / rawTierTotal : 1;

        let tierRev = 0;
        let allocatedStudents = 0;
        for (const t of tiers) {
          const disc = 1 - (t.discountPercent || 0) / 100;
          const rawCount = t.studentCounts?.[y] ?? 0;
          const scaledCount = rawCount * scaleFactor;
          allocatedStudents += scaledCount;
          tierRev += adjTuition * disc * scaledCount;
        }

        const remaining = students - allocatedStudents;
        if (remaining > 0) {
          tierRev += adjTuition * remaining;
        }
        val = tierRev;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, undefined, newStudentsY, returningStudentsY);
      }
      // Engine-level collection-rate support: when a revenue row declares a
      // collectionRate (0-100), apply slippage here so every entry point
      // (wizard, full builder, API) gets the same P&L treatment without
      // pre-multiplying amounts upstream. Applied to *all* driver types
      // (per_student, annual_fixed, monthly, per_new_student,
      // per_returning_student) so a public-funding row or fixed grant with
      // 90% collection is discounted in P&L the same way it already is in
      // the cash-flow workbook helpers and lender pro forma. Tier-based
      // tuition flows through the per_student branch above, so it also
      // picks up the multiplier. percent_of_base rows are handled in a
      // second pass below.
      if (r.collectionRate !== undefined) {
        val *= r.collectionRate / 100;
      }
      val *= pf;
      revVals.set(r.id, val);
    }
    for (const r of revenueRows) {
      if (r.driverType !== "percent_of_base") continue;
      const baseVal = revVals.get(r.percentBase || "") || 0;
      let pctVal = r.amounts?.[y] ?? 0;
      if (r.escalationRate && r.escalationRate !== 0 && y > 0) {
        pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      let val = baseVal * (pctVal / 100);
      // Apply collectionRate to percent_of_base rows too. The base it points
      // at is already collection-discounted (first pass), so this only kicks
      // in when the offset row itself declares its own collectionRate (e.g.
      // a fee/discount with a different collection profile than its base).
      if (r.collectionRate !== undefined) {
        val *= r.collectionRate / 100;
      }
      revVals.set(r.id, val);
    }
    // Task #610: apply the model-wide tuition delinquency haircut on top of
    // any row-level `collectionRate` slippage. Only tuition rows are
    // affected — public funding, philanthropy, and ESA all flow through
    // their own collection mechanics and benchmarks. Tuition offsets
    // (scholarships) are applied to the *post-delinquency* tuition base,
    // matching how schools actually book tuition net of aid.
    if (delinquencyMultiplier < 1) {
      for (const r of revenueRows) {
        if (r.category === "tuition_and_fees") {
          const v = revVals.get(r.id) || 0;
          revVals.set(r.id, v * delinquencyMultiplier);
        }
      }
    }

    // Cash-reality accumulators: contracted (pre-slippage) tuition, AR
    // weighted-average delay, and restricted-vs-unrestricted carve-out.
    let contractedTotal = 0;
    let restrictedTotal = 0;
    let tuitionPostCollection = 0;
    let weightedDelayNumerator = 0;
    let weightedDelayDenominator = 0;
    for (const r of revenueRows) {
      const collected = revVals.get(r.id) || 0;
      const collectionRatePct = r.collectionRate ?? 100;
      const isTuition = r.category === "tuition_and_fees";
      const effectiveRate = isTuition
        ? (collectionRatePct / 100) * delinquencyMultiplier
        : collectionRatePct / 100;
      const contracted = effectiveRate > 0 ? collected / effectiveRate : collected;
      if (r.category === "tuition_offsets") {
        contractedTotal -= Math.abs(contracted);
      } else {
        contractedTotal += contracted;
      }
      if (isRestrictedRevenueRow(r)) {
        restrictedTotal += collected;
      }
      if (isTuition) {
        tuitionPostCollection += collected;
        const delay = r.collectionDelayDays ?? 0;
        if (collected > 0) {
          weightedDelayNumerator += delay * collected;
          weightedDelayDenominator += collected;
        }
      }
    }
    const weightedDelayDays = weightedDelayDenominator > 0
      ? weightedDelayNumerator / weightedDelayDenominator
      : 0;
    contractedRevenue.push(contractedTotal);
    badDebt.push(Math.max(0, contractedTotal - revVals.size > 0 ? 0 : 0)); // placeholder, set below
    restrictedRevenue.push(restrictedTotal);
    tuitionRevenueByYear.push(tuitionPostCollection);
    weightedDelayDaysByYear.push(weightedDelayDays);
    arBalance.push(tuitionPostCollection * (weightedDelayDays / 365));

    for (const r of revenueRows) {
      const v = revVals.get(r.id) || 0;
      if (r.category === "tuition_offsets") revTotal -= Math.abs(v);
      else revTotal += v;
    }
    // Bad debt = contracted minus realized (engine-recognized) revenue.
    badDebt[badDebt.length - 1] = Math.max(0, contractedTotal - revTotal);

    // Apply salary escalation INSIDE the row loop so wage-base caps are
    // re-applied against the escalated salary each year. The flat-rate path is
    // mathematically unchanged: (annual * rate) * persEsc == (annual * persEsc)
    // * rate, so legacy models / golden snapshots are preserved.
    const persEsc = Math.pow(1 + salaryEscRate, y);
    let persTotal = 0;
    for (const r of staffingRows) {
      let effectiveFte = r.fte || 0;
      if (r.startYear && (y + 1) < r.startYear) { effectiveFte = 0; }
      else if (r.endYear && (y + 1) > r.endYear) { effectiveFte = 0; }
      else if ((r as Record<string, unknown>).staffingMode === "ratio" && (r as Record<string, unknown>).studentRatio) {
        const ratio = (r as Record<string, unknown>).studentRatio as number;
        if (ratio > 0) {
          let computed = students / ratio;
          const minFte = (r as Record<string, unknown>).minFte as number | undefined;
          const maxFte = (r as Record<string, unknown>).maxFte as number | undefined;
          if (minFte !== undefined) computed = Math.max(computed, minFte);
          if (maxFte !== undefined) computed = Math.min(computed, maxFte);
          effectiveFte = Math.ceil(computed * 2) / 2;
        }
      }
      const escalatedRate = (r.annualizedRate || 0) * persEsc;
      const annual = effectiveFte * escalatedRate;
      const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
      let benefits = 0, tax = 0;
      if (!isContractNoPL) {
        if (r.benefitsEligible) benefits = annual * ((r.benefitsRate || 0) / 100);
        // Wage-base-aware payroll tax: when components are present and the user
        // hasn't explicitly overridden the flat rate, sum each component's tax
        // capped at its wage base against the *escalated* per-employee salary.
        // Caps don't scale with salary inflation, so the cap must be applied
        // each year against the actual taxable wage. Otherwise fall back to
        // flat `salary * payrollTaxRate / 100` for legacy models and explicit
        // user overrides.
        const components = r.payrollTaxComponents;
        if (components && components.length > 0 && !r.payrollTaxRateOverridden) {
          // Per-employee caps apply per-FTE — multiply by effectiveFte (not raw salary)
          // so a 2-FTE "Teachers" line uses 2 separate FICA caps, not one shared cap.
          const fteCount = effectiveFte > 0 ? effectiveFte : 0;
          let perEmployeeTax = 0;
          for (const c of components) {
            const cappedWage = c.wageBase !== undefined
              ? Math.min(escalatedRate, c.wageBase)
              : escalatedRate;
            perEmployeeTax += cappedWage * ((c.rate || 0) / 100);
          }
          tax = perEmployeeTax * fteCount;
        } else {
          tax = annual * ((r.payrollTaxRate || 0) / 100);
        }
      }
      persTotal += annual + benefits + tax;
    }
    persTotal = persTotal * pf;

    const yearFTE = computeTotalFTE(staffingRows, y, students);

    let facTotal = 0;
    let opexTotal = 0;
    // Fixed-vs-variable opex split for break-even math (Task #612). Variable
    // drivers scale with enrollment or revenue; everything else is fixed.
    let opexFixedTotal = 0;
    let opexVariableTotal = 0;
    const VARIABLE_DRIVERS = new Set(["per_student", "per_new_student", "percent_of_revenue"]);
    for (const r of expenseRows) {
      let val: number;
      if (r.driverType === "percent_of_revenue") {
        const esc = r.escalationRateOverridden ? (r.escalationRate ?? 0) : ((r.escalationRate !== undefined && r.escalationRate !== 0) ? r.escalationRate : (costInflation ?? 0));
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = r.amounts?.[y] ?? 0;
        }
        val = (pct / 100) * revTotal;
      } else if (r.driverType === "per_fte") {
        val = driverVal(r.amounts, y, "annual_fixed", students, r.escalationRate, costInflation, undefined, undefined, r.escalationRateOverridden);
        val = val * yearFTE * pf;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation, newStudentsY, returningStudentsY, r.escalationRateOverridden);
        val *= pf;
      }
      if (r.category === "occupancy_facility") {
        facTotal += val;
      } else {
        opexTotal += val;
        if (VARIABLE_DRIVERS.has(r.driverType)) {
          opexVariableTotal += val;
        } else {
          opexFixedTotal += val;
        }
      }
    }

    let cdTotal = 0;
    let loanDebtService = 0;
    for (const r of capDebtRows) {
      if (r.isLoan) {
        const principal = r.loanPrincipal || 0;
        const rate = (r.loanRate || 0) / 100;
        const term = r.loanTermYears || 0;
        if (principal > 0 && term > 0 && y < term) {
          let annualPmt: number;
          if (rate <= 0) {
            annualPmt = principal / term;
          } else {
            const monthlyRate = rate / 12;
            const numPayments = term * 12;
            const monthlyPmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
            annualPmt = monthlyPmt * 12;
          }
          cdTotal += annualPmt;
          loanDebtService += annualPmt;
        }
      } else {
        cdTotal += driverVal(r.amounts, y, r.driverType, students);
        if (r.flatAnnualDebtService && r.flatAnnualDebtService > 0) {
          loanDebtService += r.flatAnnualDebtService;
        }
      }
    }

    const totalExp = persTotal + facTotal + opexTotal + cdTotal;
    const ni = revTotal - totalExp;

    revenue.push(revTotal);
    staffingCost.push(persTotal);
    facilityCost.push(facTotal);
    opex.push(opexTotal);
    fixedOpex.push(opexFixedTotal);
    variableOpex.push(opexVariableTotal);
    totalExpenses.push(totalExp);
    netIncome.push(ni);
    netMargin.push(revTotal > 0 ? ni / revTotal : 0);

    loanDS.push(loanDebtService);
    if (loanDebtService > 0) {
      dscr.push(Math.round(((ni + loanDebtService) / loanDebtService) * 100) / 100);
    } else {
      dscr.push(0);
    }

    staffingPctOfRevenue.push(revTotal > 0 ? persTotal / revTotal : 0);
  }

  const breakEvenIdx = netIncome.findIndex((ni) => ni >= 0);

  let cumNI = 0;
  for (const ni of netIncome) cumNI += ni;
  const monthlyExp = totalExpenses[4] / 12;
  const reserveMonths = monthlyExp > 0 && cumNI > 0 ? cumNI / monthlyExp : 0;

  const startingCash = data.openingBalances?.cash || 0;
  const opMonths = sp?.isPartialFirstYear ? (sp.year1OperatingMonths || 10) : 12;

  // Years 1-5: build per-stream monthly cash flow series for every
  // modeled year (Task #636). Y1 uses partial-year op months when
  // configured; Y2-Y5 always use 12. Each year's inflow is rescaled to
  // match the engine's `revenue[y]` so escalation, tier discounts, and
  // collection-rate adjustments flow through to the monthly view; outflow
  // is built directly off the engine's per-year staffing/opex/debt
  // totals so it sums to `staffingCost[y] + facilityCost[y] + opex[y] +
  // loanDS[y]` — the same components that go into totalExpenses[y].
  const monthlyCashFlowByYear: MonthlyCashFlowSeries[] = [];
  let runningOpening = startingCash;
  for (let y = 0; y < 5; y++) {
    const yOpMonths = y === 0 ? opMonths : 12;
    const raw = computeYear1MonthlyCashFlow({
      revenueRows: revenueRows as MonthlyRevenueRowLike[],
      yearIndex: y,
      students: enrollment[y],
      annualPersonnel: staffingCost[y],
      annualOpex: facilityCost[y] + opex[y],
      annualDebt: loanDS[y],
      openingCash: runningOpening,
      opMonths: yOpMonths,
    });
    // Rescale inflow so its annual sum matches the engine's revenue[y].
    // The helper computes per-row driver values without escalation / tier
    // math, so for Y2-Y5 (and Y1 when tiers are present) the raw monthly
    // sum can drift from the engine total. Preserving the *shape* and
    // scaling to the engine total gives a monthly view that reconciles
    // exactly to the headline P&L.
    const rawInflowSum = raw.inflow.reduce((a, b) => a + b, 0);
    let inflow = raw.inflow;
    if (rawInflowSum > 0 && Math.abs(rawInflowSum - revenue[y]) > 1e-6) {
      const r = revenue[y] / rawInflowSum;
      inflow = raw.inflow.map((v) => v * r);
    } else if (rawInflowSum === 0 && revenue[y] !== 0) {
      // Engine sees revenue but the row-level helper produced no inflow
      // (e.g. all percent_of_base rows referenced a base the helper
      // dropped). Fall back to even spread across operating months so
      // the cumulative still reconciles.
      const months = Math.max(1, Math.min(yOpMonths, 12));
      const per = revenue[y] / months;
      inflow = new Array(12).fill(0).map((_, i) => (i < months ? per : 0));
    }
    const outflow = raw.outflow;
    const net = inflow.map((v, i) => v - outflow[i]);
    const cumulative: number[] = [];
    let running = runningOpening;
    for (const v of net) {
      running += v;
      cumulative.push(running);
    }
    monthlyCashFlowByYear.push({ inflow, outflow, net, cumulative });
    runningOpening = cumulative[cumulative.length - 1];
  }
  const monthlyCashFlowY1 = monthlyCashFlowByYear[0];

  const cashRunwayMonths = computeCashRunwayMonths(
    startingCash,
    monthlyCashFlowByYear.map((s) => s.net),
    60,
  );

  const cashPosition: number[] = [];
  let cumCash = startingCash;
  for (let y = 0; y < 5; y++) {
    cumCash += netIncome[y];
    cashPosition.push(cumCash);
  }

  const lowestCashMonth = findLowestCashMonthAcrossYears(
    monthlyCashFlowByYear.map((s) => s.cumulative),
    7,
  );

  // Task #610: restricted/unrestricted cash split + unrestricted-only runway.
  // Restricted gifts are assumed not spent on operations, so they accumulate
  // year over year and are subtracted from the headline cash position to get
  // the unrestricted (truly available) cash. The unrestricted runway nets the
  // restricted inflow out of every year's monthly cash so the headline number
  // founders show lenders excludes money that legally can't service debt.
  const restrictedCash: number[] = [];
  const unrestrictedCash: number[] = [];
  let cumulativeRestricted = 0;
  for (let y = 0; y < 5; y++) {
    cumulativeRestricted += restrictedRevenue[y];
    restrictedCash.push(cumulativeRestricted);
    unrestrictedCash.push(cashPosition[y] - cumulativeRestricted);
  }

  // Build a parallel monthly net stream that strips restricted inflows out of
  // each year (Y1 carved month-by-month using the same distribution helper
  // that drives `monthlyCashFlowY1`; Y2-5 spread evenly to match the engine's
  // existing convention for projection years).
  const restrictedRows = revenueRows.filter((r) =>
    isRestrictedRevenueRow(r as { id?: string; isRestricted?: boolean }),
  );
  const restrictedY1Monthly = distributeRevenueMonthly(
    restrictedRows as MonthlyRevenueRowLike[],
    0,
    enrollment[0],
  );
  const unrestrictedNetByYear: number[][] = [
    monthlyCashFlowY1.net.map((v, m) => v - (restrictedY1Monthly[m] ?? 0)),
  ];
  for (let y = 1; y < 5; y++) {
    const niMonth = (netIncome[y] - restrictedRevenue[y]) / 12;
    unrestrictedNetByYear.push(new Array(12).fill(niMonth));
  }
  const unrestrictedCashRunwayMonths = computeCashRunwayMonths(
    startingCash,
    unrestrictedNetByYear,
    60,
  );

  const baseShape = {
    enrollment,
    revenue,
    staffingCost,
    facilityCost,
    opex,
    totalExpenses,
    netIncome,
    netMargin,
    dscr,
    staffingPctOfRevenue,
    breakEvenYear: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
    cashRunwayMonths: Math.round(cashRunwayMonths * 10) / 10,
    reserveMonths: Math.round(reserveMonths * 10) / 10,
    cashPosition,
    loanDebtService: loanDS,
    monthlyCashFlowY1,
    monthlyCashFlowByYear,
    lowestCashMonth,
    fixedOpex,
    variableOpex,
    contractedRevenue,
    badDebt,
    arBalance,
    restrictedRevenue,
    restrictedCash,
    unrestrictedCash,
    unrestrictedCashRunwayMonths: Math.round(unrestrictedCashRunwayMonths * 10) / 10,
    tuitionDelinquencyRateApplied,
  };
  const maxCapacityRaw = (sp as Record<string, unknown> | undefined)?.maxCapacity;
  const maxCapacity = typeof maxCapacityRaw === "number" ? maxCapacityRaw : undefined;
  const beArrays = buildBreakEvenArrays(baseShape, maxCapacity);
  return { ...baseShape, ...beArrays };
}

/** Apply a per-year founder-comp delta to a baseline ScenarioMetrics,
 *  re-deriving the dependent fields (totalExpenses, netIncome, netMargin,
 *  dscr, reserveMonths, cashRunwayMonths, cashPosition). The delta is added
 *  to staffing cost (positive delta = founder underpays themselves vs
 *  market, so the lender-facing view shows higher staffing cost and lower
 *  net income). */
function applyFounderCompDelta(
  base: ScenarioMetrics,
  delta: number[],
  startingCash: number,
): ScenarioMetrics {
  const yearCount = base.netIncome.length;
  const staffingCost = base.staffingCost.map((s, i) => s + (delta[i] || 0));
  const totalExpenses = base.totalExpenses.map((t, i) => t + (delta[i] || 0));
  const netIncome = base.netIncome.map((n, i) => n - (delta[i] || 0));
  const netMargin = base.revenue.map((r, i) => (r > 0 ? netIncome[i] / r : 0));
  const loanDS = base.loanDebtService || base.netIncome.map(() => 0);
  const dscr = loanDS.map((ds, i) => {
    if (ds > 0) return Math.round(((netIncome[i] + ds) / ds) * 100) / 100;
    return 0;
  });
  const staffingPctOfRevenue = base.revenue.map((r, i) => (r > 0 ? staffingCost[i] / r : 0));
  const breakEvenIdx = netIncome.findIndex((ni) => ni >= 0);

  let cumNI = 0;
  for (const ni of netIncome) cumNI += ni;
  const monthlyExp = totalExpenses[yearCount - 1] / 12;
  const reserveMonths = monthlyExp > 0 && cumNI > 0 ? cumNI / monthlyExp : 0;

  let cashRunwayMonths = yearCount * 12;
  let runningCash = startingCash;
  for (let y = 0; y < yearCount; y++) {
    const monthlyNI = netIncome[y] / 12;
    let broke = false;
    for (let m = 0; m < 12; m++) {
      runningCash += monthlyNI;
      if (runningCash <= 0) {
        cashRunwayMonths = y * 12 + m + 1;
        broke = true;
        break;
      }
    }
    if (broke) break;
  }

  const cashPosition: number[] = [];
  let cumCash = startingCash;
  for (let y = 0; y < yearCount; y++) {
    cumCash += netIncome[y];
    cashPosition.push(cumCash);
  }

  return {
    ...base,
    staffingCost,
    totalExpenses,
    netIncome,
    netMargin,
    dscr,
    staffingPctOfRevenue,
    breakEvenYear: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
    cashRunwayMonths: Math.round(cashRunwayMonths * 10) / 10,
    reserveMonths: Math.round(reserveMonths * 10) / 10,
    cashPosition,
  };
}

/** Returns parallel "as planned" vs "normalized" financials for a model.
 *  The reported view is the founder-dashboard primary; the normalized view
 *  is the lender / board-packet primary. They differ only in founder-comp
 *  treatment (salary + benefits + payroll tax). See `founder-comp.ts`. */
export function computeNormalizedFinancials(data: FullModelData): NormalizedFinancialsView {
  const reported = computeBaseFinancials(data);
  const founderComp = computeFounderCompNormalization(data, reported.netIncome.length);
  const startingCash = data.openingBalances?.cash || 0;
  const normalized = founderComp.hasAdjustment
    ? applyFounderCompDelta(reported, founderComp.delta, startingCash)
    : reported;
  return { reported, normalized, founderComp };
}

function applyAdjustments(
  base: ScenarioMetrics,
  adj: ScenarioAdjustments,
  startingCash: number,
  maxCapacity?: number,
): ScenarioMetrics {
  const enrollFactor = 1 + adj.enrollmentAdjustment / 100;
  const revFactor = 1 + adj.tuitionAdjustment / 100;
  const staffFactor = 1 + adj.staffingAdjustment / 100;
  const facFactor = 1 + adj.facilityAdjustment / 100;
  const expFactor = 1 + adj.expenseAdjustment / 100;

  const enrollment = base.enrollment.map((e) => Math.round(e * enrollFactor));
  const revenue = base.revenue.map((r) => r * revFactor);
  const staffingCost = base.staffingCost.map((s) => s * staffFactor);
  const facilityCost = base.facilityCost.map((f) => f * facFactor);
  const opex = base.opex.map((o) => o * expFactor);
  const fixedOpex = (base.fixedOpex ?? base.opex.map(() => 0)).map((o) => o * expFactor);
  const variableOpex = (base.variableOpex ?? base.opex).map((o) => o * expFactor);
  const baseLoanDS = base.loanDebtService || base.enrollment.map(() => 0);
  const capNonLoan = base.totalExpenses.map((te, i) => te - base.staffingCost[i] - base.facilityCost[i] - base.opex[i] - baseLoanDS[i]);
  const totalExpenses = staffingCost.map((s, i) => s + facilityCost[i] + opex[i] + baseLoanDS[i] + capNonLoan[i]);
  const netIncome = revenue.map((r, i) => r - totalExpenses[i]);
  const netMargin = revenue.map((r, i) => (r > 0 ? netIncome[i] / r : 0));

  const dscr = baseLoanDS.map((ds, i) => {
    if (ds > 0) {
      return Math.round(((netIncome[i] + ds) / ds) * 100) / 100;
    }
    return 0;
  });

  const staffingPctOfRevenue = revenue.map((r, i) => (r > 0 ? staffingCost[i] / r : 0));
  const breakEvenIdx = netIncome.findIndex((ni) => ni >= 0);

  let cumNI = 0;
  for (const ni of netIncome) cumNI += ni;
  const monthlyExp = totalExpenses[4] / 12;
  const reserveMonths = monthlyExp > 0 && cumNI > 0 ? cumNI / monthlyExp : 0;

  // Rescale every year's monthly cash flow by the adjustment ratios so
  // the per-stream timing shape established in base is preserved while
  // the amounts move with the lever. Outflow rescales against the
  // *total* base outflow so the shape (op-month payroll, monthly debt)
  // carries through. Annual sums match revenue[y] / totalExpenses[y]
  // within floating-point error. Task #636 — extends Y1-only rescaling
  // to all 5 modeled years so lever previews update the multi-year
  // monthly tables and trough callout consistently.
  const baseByYear = base.monthlyCashFlowByYear;
  let monthlyCashFlowByYear: MonthlyCashFlowSeries[] | undefined;
  if (baseByYear && baseByYear.length === 5) {
    monthlyCashFlowByYear = [];
    let runningOpening = startingCash;
    for (let y = 0; y < 5; y++) {
      const baseRevY = base.revenue[y] || 0;
      const baseExpY = base.totalExpenses[y] || 0;
      const revRatio = baseRevY > 0 ? revenue[y] / baseRevY : 0;
      const expRatio = baseExpY > 0 ? totalExpenses[y] / baseExpY : 0;
      const inflow = baseByYear[y].inflow.map((v) => v * revRatio);
      const outflow = baseByYear[y].outflow.map((v) => v * expRatio);
      const net = inflow.map((v, i) => v - outflow[i]);
      const cumulative: number[] = [];
      let running = runningOpening;
      for (const v of net) {
        running += v;
        cumulative.push(running);
      }
      monthlyCashFlowByYear.push({ inflow, outflow, net, cumulative });
      runningOpening = cumulative[cumulative.length - 1];
    }
  }
  const monthlyCashFlowY1 = monthlyCashFlowByYear
    ? monthlyCashFlowByYear[0]
    : undefined;

  const monthlyNetByYear: number[][] = [];
  for (let y = 0; y < 5; y++) {
    const series = monthlyCashFlowByYear?.[y]?.net;
    monthlyNetByYear.push(
      series && series.length === 12
        ? series
        : new Array(12).fill(netIncome[y] / 12),
    );
  }
  const cashRunwayMonths = computeCashRunwayMonths(
    startingCash,
    monthlyNetByYear,
    60,
  );

  const cashPosition: number[] = [];
  let cumCash = startingCash;
  for (let y = 0; y < 5; y++) {
    cumCash += netIncome[y];
    cashPosition.push(cumCash);
  }

  const lowestCashMonth = monthlyCashFlowByYear
    ? findLowestCashMonthAcrossYears(
        monthlyCashFlowByYear.map((s) => s.cumulative),
        7,
      )
    : null;

  // Task #610: scale cash-reality fields by the same lever ratios used for
  // revenue / expenses so scenarios surface the unrestricted-cash and AR
  // implications, not just accrual P&L. Bad debt and AR scale with revenue
  // (more billed → more written off → more outstanding); restricted gifts
  // and the delinquency assumption itself are baseline pass-throughs since
  // the lever doesn't move them.
  const contractedRevenue = base.contractedRevenue.map((c) => c * revFactor);
  const badDebt = base.badDebt.map((b) => b * revFactor);
  const arBalance = base.arBalance.map((a) => a * revFactor);
  const restrictedRevenue = [...base.restrictedRevenue];
  const restrictedCash: number[] = [];
  const unrestrictedCash: number[] = [];
  let cumulativeRestricted = 0;
  for (let y = 0; y < 5; y++) {
    cumulativeRestricted += restrictedRevenue[y];
    restrictedCash.push(cumulativeRestricted);
    unrestrictedCash.push(cashPosition[y] - cumulativeRestricted);
  }

  // Unrestricted runway: re-net the restricted slice out of each year's
  // monthly net (Y1 spread proportionally to the rescaled monthly net,
  // Y2-5 spread evenly — same convention as the base path).
  const baseY1Net = base.monthlyCashFlowY1?.net;
  const unrestrictedNetByYear: number[][] = [];
  if (monthlyCashFlowY1 && baseY1Net) {
    const baseRestrictedTotal = base.restrictedRevenue[0] || 0;
    const restrictedY1Monthly = baseY1Net.map(() => baseRestrictedTotal / 12);
    unrestrictedNetByYear.push(monthlyCashFlowY1.net.map((v, m) => v - restrictedY1Monthly[m]));
  } else {
    unrestrictedNetByYear.push(new Array(12).fill((netIncome[0] - restrictedRevenue[0]) / 12));
  }
  for (let y = 1; y < 5; y++) {
    unrestrictedNetByYear.push(new Array(12).fill((netIncome[y] - restrictedRevenue[y]) / 12));
  }
  const unrestrictedCashRunwayMonths = computeCashRunwayMonths(
    startingCash,
    unrestrictedNetByYear,
    60,
  );

  const adjShape = {
    enrollment,
    revenue,
    staffingCost,
    facilityCost,
    opex,
    totalExpenses,
    netIncome,
    netMargin,
    dscr,
    staffingPctOfRevenue,
    breakEvenYear: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
    cashRunwayMonths: Math.round(cashRunwayMonths * 10) / 10,
    reserveMonths: Math.round(reserveMonths * 10) / 10,
    cashPosition,
    loanDebtService: baseLoanDS,
    monthlyCashFlowY1,
    monthlyCashFlowByYear,
    lowestCashMonth,
    fixedOpex,
    variableOpex,
    contractedRevenue,
    badDebt,
    arBalance,
    restrictedRevenue,
    restrictedCash,
    unrestrictedCash,
    unrestrictedCashRunwayMonths: Math.round(unrestrictedCashRunwayMonths * 10) / 10,
    tuitionDelinquencyRateApplied: base.tuitionDelinquencyRateApplied,
  };
  const beArrays = buildBreakEvenArrays(adjShape, maxCapacity);
  return { ...adjShape, ...beArrays };
}

export interface LeverMetrics {
  netIncome: number;
  cashTrough: number;
  breakEvenEnrollment: number;
  dscr: number;
}

export interface QuickLever {
  id: string;
  label: string;
  description: string;
  icon: "users" | "dollar" | "scissors";
  before: LeverMetrics;
  after: LeverMetrics;
  coaching: string;
  relatedDiagnosticIds: string[];
}

function cashTrough(metrics: ScenarioMetrics, startingCash: number): number {
  let running = startingCash;
  let min = startingCash;
  // Year 1 uses real per-stream timing when available — that's where the
  // intra-year trough is most pronounced (tuition lands Aug-May while
  // payroll runs every op month). Years 2-5 use even-spread netIncome
  // since we don't recompute timing for projection years.
  const y1 = metrics.monthlyCashFlowY1?.net;
  if (y1 && y1.length === 12) {
    for (const v of y1) {
      running += v;
      if (running < min) min = running;
    }
    for (let y = 1; y < 5; y++) {
      const monthlyNI = metrics.netIncome[y] / 12;
      for (let m = 0; m < 12; m++) {
        running += monthlyNI;
        if (running < min) min = running;
      }
    }
  } else {
    for (let y = 0; y < 5; y++) {
      const monthlyNI = metrics.netIncome[y] / 12;
      for (let m = 0; m < 12; m++) {
        running += monthlyNI;
        if (running < min) min = running;
      }
    }
  }
  return min;
}

function computeBreakEvenEnrollment(m: ScenarioMetrics): number {
  const be = computeBreakEvenStudentsForYear(m, 0);
  return be === null ? -1 : be;
}

function readMaxCapacity(data: FullModelData): number | undefined {
  const sp = data.schoolProfile as Record<string, unknown> | undefined;
  const v = sp?.maxCapacity;
  return typeof v === "number" && v > 0 ? v : undefined;
}

/**
 * Downside enrollment sensitivity band. Re-runs the canonical engine with
 * each year's enrollment scaled by the given delta (-10% / -20%) so the
 * caller sees how DSCR and ending cash respond when fewer students than
 * planned actually show up. Used by the dashboard "Break-even & downside"
 * card, the lender packet, and the underwriting workbook (Task #612).
 */
export interface DownsideScenario {
  /** Negative percent applied to all 5 enrollment years (e.g. -10, -20). */
  enrollmentDelta: number;
  enrollment: number[];
  /** Per-year DSCR (0 when no debt service modeled). */
  dscr: number[];
  /** Per-year ending cash (opening cash + cumulative net income). */
  endingCash: number[];
  /** Per-year break-even student count under the downside enrollment. */
  breakEvenStudents: Array<number | null>;
  /** Per-year net income under the downside enrollment. */
  netIncome: number[];
}

export interface DownsideBand {
  minus10: DownsideScenario;
  minus20: DownsideScenario;
}

export function computeDownsideBand(data: FullModelData): DownsideBand {
  function run(delta: number): DownsideScenario {
    const adjusted = cloneDataWithEnrollmentAdjustment(data, delta);
    const m = computeBaseFinancials(adjusted);
    return {
      enrollmentDelta: delta,
      enrollment: m.enrollment,
      dscr: m.dscr,
      endingCash: m.cashPosition,
      breakEvenStudents: m.breakEvenStudents,
      netIncome: m.netIncome,
    };
  }
  return { minus10: run(-10), minus20: run(-20) };
}

function metricsToLever(m: ScenarioMetrics, startingCash: number): LeverMetrics {
  return {
    netIncome: m.netIncome[0],
    cashTrough: cashTrough(m, startingCash),
    breakEvenEnrollment: computeBreakEvenEnrollment(m),
    dscr: m.dscr[0],
  };
}

function computeLeverNudges(data: FullModelData, baseMetrics: ScenarioMetrics): QuickLever[] {
  const startingCash = data.openingBalances?.cash || 0;
  const maxCapacity = readMaxCapacity(data);
  const staffingRows = data.staffingRows || [];
  const levers: QuickLever[] = [];

  const baseLM = metricsToLever(baseMetrics, startingCash);
  const baseEnrollment = baseMetrics.enrollment[0] ?? 0;

  if (baseEnrollment > 0) {
    const upData = cloneDataWithEnrollmentAdjustment(data, 10);
    const upM = computeBaseFinancials(upData);
    const upLM = metricsToLever(upM, startingCash);
    levers.push({
      id: "enrollment_up_10",
      label: "Add 10% More Students",
      description: `Increase enrollment from ${baseEnrollment} to ${Math.round(baseEnrollment * 1.1)} students`,
      icon: "users",
      before: baseLM,
      after: upLM,
      coaching: upLM.netIncome > baseLM.netIncome
        ? `Adding ${Math.round(baseEnrollment * 0.1)} students could improve Year 1 net income by ${fmtCurrency(upLM.netIncome - baseLM.netIncome)}. Make sure your facility and staffing can absorb the growth.`
        : `Even with 10% more students, net income doesn't improve - check whether your per-student costs exceed per-student revenue.`,
      relatedDiagnosticIds: ["near_breakeven_enrollment", "fast_enrollment_growth"],
    });

    const downData = cloneDataWithEnrollmentAdjustment(data, -10);
    const downM = computeBaseFinancials(downData);
    const downLM = metricsToLever(downM, startingCash);
    levers.push({
      id: "enrollment_down_10",
      label: "Lose 10% of Students",
      description: `Enrollment drops from ${baseEnrollment} to ${Math.round(baseEnrollment * 0.9)} students`,
      icon: "users",
      before: baseLM,
      after: downLM,
      coaching: downLM.netIncome < baseLM.netIncome
        ? `Losing ${Math.round(baseEnrollment * 0.1)} students would reduce Year 1 net income by ${fmtCurrencyAbs(baseLM.netIncome - downLM.netIncome)}. ${downLM.breakEvenEnrollment > 0 && Math.round(baseEnrollment * 0.9) <= downLM.breakEvenEnrollment ? `At ${Math.round(baseEnrollment * 0.9)} students you'd be at or below your break-even enrollment of ${downLM.breakEvenEnrollment}.` : "Build a contingency plan for lower-than-projected enrollment."}`
        : `A 10% enrollment drop has minimal financial impact - your cost structure is not enrollment-driven.`,
      relatedDiagnosticIds: ["near_breakeven_enrollment"],
    });
  }

  if (staffingRows.length > 0) {
    const highestCostRow = [...staffingRows].sort((a, b) => {
      const costA = (a.fte || 0) * (a.annualizedRate || 0);
      const costB = (b.fte || 0) * (b.annualizedRate || 0);
      return costB - costA;
    })[0];
    if (highestCostRow && (highestCostRow.fte ?? 0) > 0) {
      const oneFteCost = highestCostRow.annualizedRate || 0;
      const fteToRemove = Math.min(1, highestCostRow.fte ?? 0);
      const savingsBase = fteToRemove * oneFteCost;
      const totalStaffCost = staffingRows.reduce((s, r) => s + (r.fte || 0) * (r.annualizedRate || 0), 0);
      const pctReduction = totalStaffCost > 0 ? -(savingsBase / totalStaffCost) * 100 : 0;
      const adj: ScenarioAdjustments = { name: "-1 FTE", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: Math.round(pctReduction * 10) / 10, facilityAdjustment: 0 };
      const m = applyAdjustments(baseMetrics, adj, startingCash, maxCapacity);
      const afterLM = metricsToLever(m, startingCash);
      levers.push({
        id: "staff_minus_1",
        label: "Remove 1 FTE",
        description: `Defer 1 FTE of the highest-cost role (~${fmtCurrencyAbs(savingsBase)}/year)`,
        icon: "scissors",
        before: baseLM,
        after: afterLM,
        coaching: `Deferring 1 FTE saves ~${fmtCurrencyAbs(savingsBase)}/year. ${afterLM.netIncome >= 0 && baseLM.netIncome < 0 ? "This alone could move you from a deficit to a surplus." : `Year 1 net income shifts by ${fmtCurrency(afterLM.netIncome - baseLM.netIncome)}.`}${afterLM.dscr > baseLM.dscr && baseLM.dscr > 0 ? ` DSCR improves from ${baseLM.dscr.toFixed(2)}x to ${afterLM.dscr.toFixed(2)}x.` : ""}${afterLM.breakEvenEnrollment > 0 && baseLM.breakEvenEnrollment > 0 && afterLM.breakEvenEnrollment < baseLM.breakEvenEnrollment ? ` Break-even enrollment drops from ${baseLM.breakEvenEnrollment} to ${afterLM.breakEvenEnrollment} students.` : ""} Consider whether you can phase in this hire later.`,
        relatedDiagnosticIds: ["high_staffing_critical", "high_staffing_warning"],
      });
    }
  }

  if (baseMetrics.revenue[0] > 0) {
    const adj: ScenarioAdjustments = { name: "+5% Tuition", enrollmentAdjustment: 0, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 };
    const m = applyAdjustments(baseMetrics, adj, startingCash, maxCapacity);
    const afterLM = metricsToLever(m, startingCash);
    levers.push({
      id: "tuition_up_5",
      label: "Raise Revenue 5%",
      description: `Increase tuition or per-pupil funding by 5%`,
      icon: "dollar",
      before: baseLM,
      after: afterLM,
      coaching: `A 5% revenue increase adds ~${fmtCurrency(m.revenue[0] - baseMetrics.revenue[0])}/year. ${afterLM.cashTrough > baseLM.cashTrough ? `Cash trough improves from ${fmtCurrencyAbs(baseLM.cashTrough)} to ${fmtCurrencyAbs(afterLM.cashTrough)}.` : "Cash trough stays about the same."} Check that tuition stays competitive in your market.`,
      relatedDiagnosticIds: ["negative_cash", "surplus_but_tight_cash", "no_reserves"],
    });
  }

  return levers;
}

function cloneDataWithEnrollmentAdjustment(data: FullModelData, pctIncrease: number): FullModelData {
  const factor = 1 + pctIncrease / 100;
  const enrollment = data.enrollment ? { ...data.enrollment } : {} as Record<string, unknown>;
  for (const key of ["year1", "year2", "year3", "year4", "year5"]) {
    if (typeof (enrollment as Record<string, unknown>)[key] === "number") {
      (enrollment as Record<string, unknown>)[key] = Math.round(((enrollment as Record<string, unknown>)[key] as number) * factor);
    }
  }
  return { ...data, enrollment: enrollment as FullModelData["enrollment"] };
}

function generateNudges(metrics: ScenarioMetrics, name: string, leverNudges?: QuickLever[]): NudgeItem[] {
  const nudges: NudgeItem[] = [];
  const y1 = metrics.netIncome[0];
  const y5 = metrics.netIncome[4];

  if (metrics.breakEvenYear !== null) {
    if (metrics.breakEvenYear <= 2) {
      nudges.push({ signal: "green", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}.` });
    } else if (metrics.breakEvenYear <= 4) {
      nudges.push({ signal: "amber", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}. Earlier is better for long-term stability.` });
    } else {
      nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't break even until Year ${metrics.breakEvenYear}. Consider reducing costs or increasing revenue.` });
    }
  } else {
    nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't reach break-even in 5 years. This scenario needs significant adjustments.` });
  }

  const avgStaffPct = metrics.staffingPctOfRevenue.reduce((a, b) => a + b, 0) / 5;
  if (avgStaffPct > 0.7) {
    const staffLever = leverNudges?.find(l => l.id === "staff_minus_1");
    const leverHint = staffLever ? ` ${staffLever.coaching}` : "";
    nudges.push({ signal: "red", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue - above 70% leaves very little room for other costs.${leverHint}` });
  } else if (avgStaffPct > 0.6) {
    const staffLever = leverNudges?.find(l => l.id === "staff_minus_1");
    const leverHint = staffLever ? ` ${staffLever.coaching}` : "";
    nudges.push({ signal: "amber", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue. That's within range but worth watching.${leverHint}` });
  } else if (avgStaffPct > 0) {
    nudges.push({ signal: "green", label: "Staffing", message: `Staffing costs are ${Math.round(avgStaffPct * 100)}% of revenue. Well managed.` });
  }

  const hasDscr = metrics.dscr.some((d) => d > 0);
  if (hasDscr) {
    const y1Dscr = metrics.dscr[0];
    if (y1Dscr >= BENCHMARK_DSCR_GREEN) {
      nudges.push({ signal: "green", label: "DSCR", message: `Debt service coverage of ${y1Dscr.toFixed(2)}x exceeds the ${BENCHMARK_DSCR_GREEN}x benchmark - strong position.` });
    } else if (y1Dscr >= BENCHMARK_DSCR_AMBER) {
      nudges.push({ signal: "amber", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is tight. A target of at least ${BENCHMARK_DSCR_GREEN}x gives more breathing room.` });
    } else {
      nudges.push({ signal: "red", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is below ${BENCHMARK_DSCR_AMBER}x. Debt coverage is critically thin.` });
    }
  }

  if (y5 > 0 && y1 < 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Starts negative in Year 1 but reaches $${Math.round(y5).toLocaleString()} by Year 5. Normal growth trajectory.` });
  } else if (y5 > 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Positive throughout with $${Math.round(y5).toLocaleString()} net income by Year 5.` });
  } else {
    const revLever = leverNudges?.find(l => l.id === "tuition_up_5");
    const leverHint = revLever ? ` ${revLever.coaching}` : "";
    nudges.push({ signal: "red", label: "Trajectory", message: `Still negative by Year 5. This scenario needs stronger revenue or lower costs.${leverHint}` });
  }

  if (metrics.reserveMonths >= 3) {
    nudges.push({ signal: "green", label: "Reserves", message: `${metrics.reserveMonths.toFixed(1)} months of operating reserves by Year 5. Solid cushion.` });
  } else if (metrics.reserveMonths > 0) {
    nudges.push({ signal: "amber", label: "Reserves", message: `Only ${metrics.reserveMonths.toFixed(1)} months of reserves. Target at least 3 months.` });
  } else {
    nudges.push({ signal: "red", label: "Reserves", message: `No operating reserves accumulated. The school has no financial cushion.` });
  }

  return nudges;
}

export function computeScenarios(
  data: FullModelData,
  scenarios: ScenarioAdjustments[]
): { base: ScenarioResult; scenarios: ScenarioResult[]; leverNudges: QuickLever[] } {
  const baseMetrics = computeBaseFinancials(data);
  const startingCash = data.openingBalances?.cash || 0;
  const maxCapacity = readMaxCapacity(data);
  const leverNudges = computeLeverNudges(data, baseMetrics);
  const baseResult: ScenarioResult = {
    name: "Base Model",
    adjustments: {
      name: "Base Model",
      enrollmentAdjustment: 0,
      tuitionAdjustment: 0,
      expenseAdjustment: 0,
      staffingAdjustment: 0,
      facilityAdjustment: 0,
    },
    metrics: baseMetrics,
    nudges: generateNudges(baseMetrics, "Your base model", leverNudges),
    downsideBand: computeDownsideBand(data),
  };

  // Per-scenario downside band — Task #612 review feedback. We stack an
  // additional -10% / -20% enrollment delta on top of the scenario's own
  // adjustments so the planner can show "what if this scenario also misses
  // its enrollment target". Compose multiplicatively so a scenario already
  // at +5% enrollment still ends up at the right effective enrollment.
  function downsideForScenario(adj: ScenarioAdjustments): DownsideBand {
    function run(delta: number): DownsideScenario {
      const stacked: ScenarioAdjustments = {
        ...adj,
        enrollmentAdjustment:
          ((1 + adj.enrollmentAdjustment / 100) * (1 + delta / 100) - 1) * 100,
      };
      const m = applyAdjustments(baseMetrics, stacked, startingCash, maxCapacity);
      return {
        enrollmentDelta: delta,
        enrollment: m.enrollment,
        dscr: m.dscr,
        endingCash: m.cashPosition,
        breakEvenStudents: m.breakEvenStudents,
        netIncome: m.netIncome,
      };
    }
    return { minus10: run(-10), minus20: run(-20) };
  }

  const scenarioResults = scenarios.map((adj) => {
    const adjusted = applyAdjustments(baseMetrics, adj, startingCash, maxCapacity);
    return {
      name: adj.name,
      adjustments: adj,
      metrics: adjusted,
      nudges: generateNudges(adjusted, adj.name),
      downsideBand: downsideForScenario(adj),
    };
  });

  return { base: baseResult, scenarios: scenarioResults, leverNudges };
}

export function computeQuickLevers(data: FullModelData): QuickLever[] {
  const baseMetrics = computeBaseFinancials(data);
  return computeLeverNudges(data, baseMetrics);
}

function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtCurrencyAbs(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}
