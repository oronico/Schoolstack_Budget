// Task #611: founder compensation normalization.
//
// Schools often pay the founder/leader below market rate in early years
// ("sweat equity"). Lenders and boards underwrite to the *market* cost of
// running the school — not the founder's discount — so we surface two
// parallel views:
//   - Reported (as planned): what the founder actually plans to draw.
//   - Normalized: what a market hire would cost in the same role.
//
// The delta (normalized - reported) is the "founder-comp normalization
// adjustment" lenders apply to DSCR and net income.

import type { FullModelData, StaffingRowLike, PayrollTaxComponentLike } from "./decision-engine/model-shape.js";
import { YEAR_COUNT, DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE } from "./constants.js";
import { getFounderCompBenchmark } from "./founder-comp-benchmarks.js";

export {
  getFounderCompBenchmark,
  sizeBandFor,
  colTierFor,
  tenureBandFor,
  SIZE_BANDS,
  COL_TIERS,
  TENURE_BANDS,
  type FounderCompBenchmark,
  type FounderCompBenchmarkInput,
  type SizeBand,
  type SizeBandDef,
  type ColTier,
  type ColTierDef,
  type TenureBand,
  type TenureBandDef,
  type BenchmarkSource,
} from "./founder-comp-benchmarks.js";

/** Identifies the founder/leader row in the staffing roster. We pick the
 *  highest-paid `school_leadership` row (by FTE-weighted annualized rate),
 *  matching the heuristic the consultant-engine and lender-readiness
 *  criteria already use. Returns `undefined` when no leadership row exists. */
export function findFounderRow(
  staffingRows: StaffingRowLike[] | undefined,
): StaffingRowLike | undefined {
  if (!staffingRows || staffingRows.length === 0) return undefined;
  const leaders = staffingRows.filter(
    (r) => r.functionCategory === "school_leadership" && (r.annualizedRate || 0) > 0,
  );
  if (leaders.length === 0) return undefined;
  // Pick the highest FTE-weighted comp — that's the founder/head-of-school.
  return leaders.reduce((best, r) => {
    const score = (r.fte || 0) * (r.annualizedRate || 0);
    const bestScore = (best.fte || 0) * (best.annualizedRate || 0);
    return score > bestScore ? r : best;
  });
}

/** Returns a suggested market-rate founder annual compensation for a school
 *  type, state, and (optionally) year-1 enrollment + founder tenure. Used to
 *  back the wizard's "use suggested market rate" affordance.
 *
 *  Backed by `getFounderCompBenchmark` (NAIS / NACSA / BLS medians keyed on
 *  school type × size band × COL tier × tenure band). Returns `undefined`
 *  only when `schoolType` is missing — uncovered school types still get a
 *  blended fallback benchmark so the affordance always has something
 *  sensible to offer.
 *
 *  Callers that want the source citation / size-band info for inline
 *  display should call `getFounderCompBenchmark` directly. */
export function getSuggestedFounderComp(
  schoolType?: string | null,
  stateCode?: string | null,
  enrollmentY1?: number | null,
  founderTenureYears?: number | null,
): number | undefined {
  const bench = getFounderCompBenchmark({
    schoolType,
    stateCode,
    enrollmentY1,
    founderTenureYears,
  });
  return bench?.amount;
}

/** Pad / clamp a per-year array to exactly `yearCount` entries, broadcasting
 *  the last known value forward when the array is short. An empty array
 *  yields all `fallback`. */
function padYears(arr: number[] | undefined, yearCount: number, fallback: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < yearCount; y++) {
    const v = arr?.[y];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out.push(v);
    } else {
      const last = out.length > 0 ? out[out.length - 1] : fallback;
      out.push(last);
    }
  }
  return out;
}

/** Resolves the per-year reported (as-planned) founder comp series. Falls
 *  back, in order, to:
 *   1. `staffing.reportedFounderComp[]` (the new per-year field)
 *   2. legacy `staffing.founderSalary` (broadcast across all years, escalated by COLA)
 *   3. founder-row annualized rate from the staffing roster (escalated by COLA)
 *   4. zero
 *
 *  Output length always equals `yearCount`. */
export function getReportedFounderCompYears(
  data: FullModelData,
  yearCount: number = YEAR_COUNT,
): number[] {
  const st = data.staffing || {};
  const colaPct = data.facilities?.annualSalaryIncrease ?? 0;
  const colaFactor = 1 + colaPct / 100;

  const reported = st.reportedFounderComp;
  if (Array.isArray(reported) && reported.length > 0) {
    return padYears(reported, yearCount, reported[0] ?? 0);
  }
  // Legacy single-value path → broadcast across years with COLA.
  const legacy = typeof st.founderSalary === "number" ? st.founderSalary : 0;
  if (legacy > 0) {
    return Array.from({ length: yearCount }, (_, y) => Math.round(legacy * Math.pow(colaFactor, y)));
  }
  // Roster-based path: derive from the founder row (FTE-weighted, escalated).
  const founder = findFounderRow(data.staffingRows);
  if (founder) {
    const baseComp = (founder.fte || 0) * (founder.annualizedRate || 0);
    if (baseComp > 0) {
      return Array.from({ length: yearCount }, (_, y) => Math.round(baseComp * Math.pow(colaFactor, y)));
    }
  }
  return Array.from({ length: yearCount }, () => 0);
}

/** Resolves the per-year normalized (market-rate) founder comp series.
 *  Falls back, in order, to:
 *   1. `staffing.normalizedFounderComp[]` (per-year input)
 *   2. `getSuggestedFounderComp(schoolType, state)` broadcast w/ COLA
 *   3. the reported series (no normalization adjustment) */
export function getNormalizedFounderCompYears(
  data: FullModelData,
  yearCount: number = YEAR_COUNT,
): number[] {
  const st = data.staffing || {};
  const colaPct = data.facilities?.annualSalaryIncrease ?? 0;
  const colaFactor = 1 + colaPct / 100;

  const normalized = st.normalizedFounderComp;
  if (Array.isArray(normalized) && normalized.length > 0) {
    return padYears(normalized, yearCount, normalized[0] ?? 0);
  }
  const sp = data.schoolProfile as
    | { schoolType?: string; state?: string; founderTenureYears?: number }
    | undefined;
  const enrollmentY1 =
    typeof data.enrollment?.year1 === "number" ? data.enrollment.year1 : undefined;
  const suggested = getSuggestedFounderComp(
    sp?.schoolType,
    sp?.state,
    enrollmentY1,
    sp?.founderTenureYears,
  );
  if (suggested && suggested > 0) {
    return Array.from({ length: yearCount }, (_, y) => Math.round(suggested * Math.pow(colaFactor, y)));
  }
  return getReportedFounderCompYears(data, yearCount);
}

/** Sum a per-employee payroll tax across components, applying each
 *  component's wage-base cap. Mirrors the math in scenario-engine.ts so the
 *  normalization delta matches the engine's per-row treatment. */
function payrollTaxFor(
  salary: number,
  components: PayrollTaxComponentLike[] | undefined,
  flatRatePct: number,
): number {
  if (components && components.length > 0) {
    let tax = 0;
    for (const c of components) {
      const wage = c.wageBase !== undefined ? Math.min(salary, c.wageBase) : salary;
      tax += wage * ((c.rate || 0) / 100);
    }
    return tax;
  }
  return salary * (flatRatePct / 100);
}

/** Total fully-loaded annual cost for a given founder comp value (salary +
 *  benefits + payroll tax). Uses the founder row's benefits/tax settings
 *  when available; otherwise falls back to model-level defaults. */
function loadedFounderCost(
  comp: number,
  founder: StaffingRowLike | undefined,
  modelStaffing: { benefitsRate?: number; payrollTaxRate?: number },
): number {
  if (comp <= 0) return 0;
  const isContractNoPL = founder?.employmentType === "contract" && !founder?.payrollLike;
  if (isContractNoPL) return comp;

  const benefitsEligible = founder?.benefitsEligible !== false;
  const benefitsRate = founder?.benefitsRate ?? modelStaffing.benefitsRate ?? DEFAULT_BENEFITS_RATE;
  const benefits = benefitsEligible ? comp * (benefitsRate / 100) : 0;

  const flatTax = founder?.payrollTaxRate ?? modelStaffing.payrollTaxRate ?? DEFAULT_PAYROLL_TAX_RATE;
  const useComponents =
    founder?.payrollTaxComponents && founder.payrollTaxComponents.length > 0 && !founder.payrollTaxRateOverridden;
  const tax = payrollTaxFor(comp, useComponents ? founder!.payrollTaxComponents : undefined, flatTax);

  return comp + benefits + tax;
}

export interface FounderCompNormalization {
  /** Per-year reported (as-planned) comp value (un-loaded salary). */
  reported: number[];
  /** Per-year normalized (market-rate) comp value (un-loaded salary). */
  normalized: number[];
  /** Per-year fully-loaded cost (salary + benefits + payroll tax) — reported. */
  reportedLoaded: number[];
  /** Per-year fully-loaded cost — normalized. */
  normalizedLoaded: number[];
  /** Per-year delta = normalizedLoaded - reportedLoaded. Positive means the
   *  founder is under-paying themselves vs market; lender-side staffing
   *  cost goes UP by this amount and net income goes DOWN. */
  delta: number[];
  /** Sum of `delta` across all years — useful as a single headline number. */
  totalDelta: number;
  /** Whether any normalization is being applied (true iff any |delta| > 0). */
  hasAdjustment: boolean;
}

/** Computes the founder-comp normalization series (reported vs normalized,
 *  per year, fully-loaded with benefits + payroll tax). The `delta` array
 *  is the per-year adjustment lender / board views should add to staffing
 *  cost (and subtract from net income). */
export function computeFounderCompNormalization(
  data: FullModelData,
  yearCount: number = YEAR_COUNT,
): FounderCompNormalization {
  const reported = getReportedFounderCompYears(data, yearCount);
  const normalized = getNormalizedFounderCompYears(data, yearCount);
  const founder = findFounderRow(data.staffingRows);
  const modelSt = data.staffing || {};

  const reportedLoaded = reported.map((c) => loadedFounderCost(c, founder, modelSt));
  const normalizedLoaded = normalized.map((c) => loadedFounderCost(c, founder, modelSt));
  const delta = normalizedLoaded.map((n, i) => n - reportedLoaded[i]);
  const totalDelta = delta.reduce((s, d) => s + d, 0);
  const hasAdjustment = delta.some((d) => Math.abs(d) >= 1);

  return { reported, normalized, reportedLoaded, normalizedLoaded, delta, totalDelta, hasAdjustment };
}
