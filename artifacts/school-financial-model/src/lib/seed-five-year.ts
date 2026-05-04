import type { FullModelData } from "@/pages/model-wizard/schema";

/**
 * Deterministic Y2-Y5 re-seeder for the Extend-to-5-year flow.
 *
 * When a founder builds a single-year budget and then extends to a 5-year
 * projection, we re-derive Y2-Y5 inputs from their Y1 baselines instead of
 * leaving the schema-default zeros in place. Without this the projection
 * cliffs to 0 in Y2 and every downstream consumer (scenario compare, share
 * link, lender packet, underwriting workbook) renders the cliff.
 *
 * Rules:
 *   • Pure — never mutates the caller's form state.
 *   • Idempotent — only fills *empty* (0 / undefined / null) Y2-Y5 cells;
 *     any non-zero value the founder previously typed is preserved.
 *   • Y1 is never touched.
 *   • Escalation rates default to whatever the founder picked in the
 *     Assumptions / Tuition / Facilities steps; otherwise to the documented
 *     defaults (enrollment flat, tuition 3%/yr, salary 3%/yr, cost 3%/yr).
 */

export interface SeedDefaults {
  enrollmentGrowthPct: number;
  tuitionEscalationPct: number;
  salaryEscalationPct: number;
  costInflationPct: number;
}

export const SEED_DEFAULTS_FALLBACK: SeedDefaults = {
  enrollmentGrowthPct: 0,
  tuitionEscalationPct: 3,
  salaryEscalationPct: 3,
  costInflationPct: 3,
};

export function resolveSeedDefaults(form: Partial<FullModelData> | undefined): SeedDefaults {
  const sp = form?.schoolProfile as Record<string, unknown> | undefined;
  const facilities = form?.facilities as Record<string, unknown> | undefined;
  const tuitionEsc = form?.tuitionEscalation as Record<string, unknown> | undefined;
  const revenue = form?.revenue as Record<string, unknown> | undefined;

  const num = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  return {
    enrollmentGrowthPct:
      num(sp?.enrollmentGrowthRate) ?? SEED_DEFAULTS_FALLBACK.enrollmentGrowthPct,
    tuitionEscalationPct:
      num(tuitionEsc?.rate) ??
      num(revenue?.annualTuitionIncrease) ??
      SEED_DEFAULTS_FALLBACK.tuitionEscalationPct,
    salaryEscalationPct:
      num(facilities?.annualSalaryIncrease) ?? SEED_DEFAULTS_FALLBACK.salaryEscalationPct,
    costInflationPct:
      num(facilities?.generalCostInflation) ?? SEED_DEFAULTS_FALLBACK.costInflationPct,
  };
}

function isEmptyCell(v: unknown): boolean {
  return v == null || (typeof v === "number" && v <= 0);
}

function escalate(y1: number, ratePct: number, yearOffset: number): number {
  if (!y1 || y1 <= 0) return 0;
  return Math.round(y1 * Math.pow(1 + ratePct / 100, yearOffset));
}

function fillAmounts(amounts: number[] | undefined, ratePct: number): number[] {
  const out = [...(amounts ?? [])];
  while (out.length < 5) out.push(0);
  const y1 = Number(out[0]) || 0;
  for (let i = 1; i < 5; i++) {
    if (isEmptyCell(out[i])) {
      out[i] = escalate(y1, ratePct, i);
    }
  }
  return out;
}

function fillNullableArray(
  arr: Array<number | null | undefined> | undefined,
  ratePct: number,
): Array<number | null> {
  if (!arr) return arr as unknown as Array<number | null>;
  const out: Array<number | null> = arr.map((v) => (v === undefined ? 0 : v));
  while (out.length < 5) out.push(0);
  const y1 = typeof out[0] === "number" ? (out[0] as number) : 0;
  for (let i = 1; i < 5; i++) {
    const v = out[i];
    if (v === null) continue; // null = "not offered", preserve
    if (isEmptyCell(v)) {
      out[i] = escalate(y1, ratePct, i);
    }
  }
  return out;
}

function pickRevenueRowRate(
  row: { category?: string; escalationRate?: number; escalationRateOverridden?: boolean },
  defaults: SeedDefaults,
): number {
  if (row.escalationRateOverridden && typeof row.escalationRate === "number") {
    return row.escalationRate;
  }
  if (typeof row.escalationRate === "number") return row.escalationRate;
  switch (row.category) {
    case "tuition_and_fees":
    case "tuition_offsets":
    case "school_choice":
      return defaults.tuitionEscalationPct;
    case "public_funding":
    case "other_revenue":
      return defaults.costInflationPct;
    case "philanthropy":
    case "grants_contributions":
      return 0;
    default:
      return defaults.costInflationPct;
  }
}

function pickExpenseRowRate(
  row: { escalationRate?: number; escalationRateOverridden?: boolean },
  defaults: SeedDefaults,
): number {
  if (typeof row.escalationRate === "number") return row.escalationRate;
  return defaults.costInflationPct;
}

/**
 * Re-seed Y2-Y5 form state from Y1 baselines using the founder's escalation
 * rates (or documented defaults). Pure — returns a new form object.
 */
export function seedFiveYearFromYearOne<T extends Partial<FullModelData>>(
  form: T,
  defaults?: Partial<SeedDefaults>,
): T {
  const resolved: SeedDefaults = { ...resolveSeedDefaults(form), ...defaults };
  const next: Record<string, unknown> = { ...(form as Record<string, unknown>) };

  // ── enrollment.year1..year5
  const enrollment = (form.enrollment as Record<string, unknown> | undefined) ?? {};
  const y1 = Number(enrollment.year1 ?? 0) || 0;
  const seededEnrollment: Record<string, unknown> = { ...enrollment };
  const yearKeys = ["year1", "year2", "year3", "year4", "year5"] as const;
  for (let i = 0; i < yearKeys.length; i++) {
    const key = yearKeys[i];
    const cur = Number(enrollment[key] ?? 0) || 0;
    if (i === 0) {
      seededEnrollment[key] = cur;
    } else if (isEmptyCell(enrollment[key])) {
      seededEnrollment[key] = escalate(y1, resolved.enrollmentGrowthPct, i);
    }
  }
  next.enrollment = seededEnrollment;

  // ── programs[].year1..year5
  const programs = form.programs as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(programs)) {
    next.programs = programs.map((p) => {
      const py1 = Number(p.year1 ?? 0) || 0;
      const out = { ...p };
      for (let i = 1; i < yearKeys.length; i++) {
        const key = yearKeys[i];
        if (isEmptyCell(p[key])) {
          out[key] = escalate(py1, resolved.enrollmentGrowthPct, i);
        }
      }
      return out;
    });
  }

  // ── revenueRows[].amounts (5 wide)
  // Mirror the expense-row treatment: stamp the resolved per-row rate (so the
  // wizard doesn't silently re-derive a different one from category defaults
  // on next render) and mark it as having come from the Extend-to-5-Year seed
  // unless the founder explicitly overrode it. RevenueStep reads
  // escalationRateSeeded to render the indigo "seeded from Extend-to-5-Year"
  // badge next to the row (Task #514).
  const revenueRows = form.revenueRows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(revenueRows)) {
    next.revenueRows = revenueRows.map((row) => {
      const typedRow = row as {
        category?: string;
        escalationRate?: number;
        escalationRateOverridden?: boolean;
      };
      const rate = pickRevenueRowRate(typedRow, resolved);
      const out: Record<string, unknown> = {
        ...row,
        amounts: fillAmounts(row.amounts as number[] | undefined, rate),
      };
      if (typeof row.escalationRate !== "number" && !typedRow.escalationRateOverridden) {
        out.escalationRate = rate;
        out.escalationRateSeeded = true;
      }
      return out;
    });
  }

  // ── expenseRows[].amounts
  // We *also* stamp the resolved per-row escalationRate back onto the row.
  // The wizard's ExpenseStep recomputes Y2-Y5 from Y1 on every render using
  // `getEscalationRule(row, escalationRates)`; without an explicit per-row
  // rate it would fall back to the category default, which can differ from
  // (or drift away from) whatever the seeder used. Persisting the rate the
  // seeder picked makes the seeder the single source of truth so the wizard
  // never silently overwrites the seeded Y2-Y5 cells.
  const expenseRows = form.expenseRows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(expenseRows)) {
    next.expenseRows = expenseRows.map((row) => {
      const rate = pickExpenseRowRate(
        row as { escalationRate?: number; escalationRateOverridden?: boolean },
        resolved,
      );
      const out: Record<string, unknown> = {
        ...row,
        amounts: fillAmounts(row.amounts as number[] | undefined, rate),
      };
      if (typeof row.escalationRate !== "number") {
        out.escalationRate = rate;
        // Mark this row's rate as having come from the Extend-to-5-Year seed
        // so the wizard can show founders a "seeded from Extend-to-5-Year"
        // tooltip next to the escalation label. Rows that already carried an
        // explicit founder-typed rate are not stamped.
        out.escalationRateSeeded = true;
      }
      return out;
    });
  }

  // ── capitalAndDebtRows[].amounts (debt service is typically flat, so we
  // hold the Y1 amount forward when Y2-Y5 are empty rather than escalating)
  const capRows = form.capitalAndDebtRows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(capRows)) {
    next.capitalAndDebtRows = capRows.map((row) => ({
      ...row,
      amounts: fillAmounts(row.amounts as number[] | undefined, 0),
    }));
  }

  // ── staffingRows: per-year FTE/salary isn't stored on each row (the engine
  // applies salaryEscalationPct at compute time). The only multi-year cell
  // we own is endYear — bump rows that were capped at year 1 so they extend
  // through year 5.
  const staffingRows = form.staffingRows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(staffingRows)) {
    next.staffingRows = staffingRows.map((row) => {
      const endYear = Number(row.endYear ?? 0);
      if (endYear === 1) return { ...row, endYear: 5 };
      return row;
    });
  }

  // ── schoolProfile.gradeBandEnrollment.{toddlers,preK,k5,m68,h912,other}
  // and gradeEnrollment record. Both are nullable arrays where null = "didn't
  // offer this year" and must be preserved.
  const sp = form.schoolProfile as Record<string, unknown> | undefined;
  if (sp) {
    const seededSp: Record<string, unknown> = { ...sp };
    const gbe = sp.gradeBandEnrollment as Record<string, Array<number | null | undefined> | undefined> | undefined;
    if (gbe) {
      const seededGbe: Record<string, Array<number | null>> = {};
      for (const [band, arr] of Object.entries(gbe)) {
        if (arr) seededGbe[band] = fillNullableArray(arr, resolved.enrollmentGrowthPct);
      }
      seededSp.gradeBandEnrollment = seededGbe;
    }
    const ge = sp.gradeEnrollment as Record<string, Array<number | null | undefined> | undefined> | undefined;
    if (ge) {
      const seededGe: Record<string, Array<number | null>> = {};
      for (const [grade, arr] of Object.entries(ge)) {
        if (arr) seededGe[grade] = fillNullableArray(arr, resolved.enrollmentGrowthPct);
      }
      seededSp.gradeEnrollment = seededGe;
    }
    next.schoolProfile = seededSp;
  }

  return next as T;
}
