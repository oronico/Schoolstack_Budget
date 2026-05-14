/**
 * Task #860 expanded scope — one-shot migration of legacy "stacked"
 * revenue models to the v2 funding-mix model.
 *
 * Legacy (v1) models were entered with the founder's own mental model
 * where tuition + ESA + voucher were all separate per-student rows that
 * the engine summed naively, double-counting the seat. The engine was
 * fixed to cap per-student school_choice rows against the net seat
 * basis (see revenue-quality.ts), so the engine output is correct
 * regardless of the input version. This migration:
 *
 *   1. Stamps `revenueModelVersion: 2` so we can detect un-migrated
 *      models in the export gate (`funding_mix_unmigrated` flag).
 *   2. Records a per-model changelog entry showing the founder the
 *      before/after Y1 revenue delta caused by the funding-mix
 *      correction, so the math reconciles to their prior view.
 *
 * The migration is a no-op when:
 *   - The model is already v2.
 *   - There's no gross_tuition row OR no per-student school_choice row
 *     (no stacked pattern possible).
 *   - The engine-corrected Y1 revenue equals the naive Y1 revenue
 *     (within $1) — model never had a stacking issue.
 */
import {
  computeRevenueRowAmountsForYear,
  type RevenueRowAmountsRowLike,
  type TuitionTierLike,
} from "./revenue-quality.js";

export interface ModelMigrationEntry {
  type: "funding_mix_v2";
  appliedAt: string;
  summary: string;
  beforeY1Revenue?: number;
  afterY1Revenue?: number;
  deltaY1?: number;
}

export interface FundingMixMigratableModel {
  revenueModelVersion?: number;
  modelMigrations?: ModelMigrationEntry[];
  revenueRows?: readonly RevenueRowAmountsRowLike[];
  tuitionTiers?: readonly TuitionTierLike[];
  enrollment?: { yearOneTotal?: number; growthRate?: number } & Record<string, unknown>;
  [k: string]: unknown;
}

export interface FundingMixMigrationResult<T extends FundingMixMigratableModel> {
  data: T;
  applied: boolean;
  entry?: ModelMigrationEntry;
}

export const CURRENT_REVENUE_MODEL_VERSION = 2 as const;

function naiveY1Revenue(
  rows: readonly RevenueRowAmountsRowLike[],
  students: number,
): number {
  // The naive sum a v1 founder would see: just multiply per-student
  // amounts by enrollment for Y1 and sum the results, with no funding-
  // mix correction. percent_of_base / annual_fixed rows are ignored
  // here because they were never affected by the bug (they aren't
  // per-student tuition or per-student school-choice).
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "per_student") {
      const v = r.amounts?.[0] ?? 0;
      total += v * students;
    } else if (r.driverType === "annual_fixed") {
      total += r.amounts?.[0] ?? 0;
    }
  }
  return total;
}

function resolveY1Enrollment(model: FundingMixMigratableModel): number {
  const en = (model.enrollment ?? {}) as {
    yearOneTotal?: number;
    total?: number;
    year1?: number;
    studentsByYear?: number[];
  };
  if (typeof en.year1 === "number") return en.year1;
  if (Array.isArray(en.studentsByYear) && en.studentsByYear.length > 0)
    return en.studentsByYear[0] ?? 0;
  if (typeof en.yearOneTotal === "number") return en.yearOneTotal;
  if (typeof en.total === "number") return en.total;
  return 0;
}

/**
 * Detect whether a model has the legacy stacked pattern (per-student
 * tuition + per-student school_choice that, together, exceed the net
 * seat basis in any of the first 5 years). This is the export-block
 * trigger for `funding_mix_unmigrated`: even if a model isn't stamped
 * v2, it can pass through cleanly when there's nothing to correct.
 */
export function hasLegacyStackedPattern(
  rows: readonly RevenueRowAmountsRowLike[],
  students: number,
  tuitionTiers?: readonly TuitionTierLike[],
  yearCount = 5,
): boolean {
  if (students <= 0) return false;
  const grossTuitionRow = rows.find(
    (r) => r.enabled && r.id === "gross_tuition" && r.driverType === "per_student",
  );
  if (!grossTuitionRow) return false;
  const choiceRows = rows.filter(
    (r) => r.enabled && r.category === "school_choice" && r.driverType === "per_student",
  );
  if (choiceRows.length === 0) return false;
  // If tuition tiers are present, compare against the weighted-average
  // *net* per-seat tuition (post-discount) instead of raw sticker, so a
  // school with deep scholarships ($10k sticker, 50% tier discount, $8k
  // ESA) is still recognized as legacy-stacked.
  const tierNetMultiplier = (() => {
    if (!tuitionTiers || tuitionTiers.length === 0) return 1;
    let totalSeats = 0;
    let weightedNet = 0;
    for (const t of tuitionTiers) {
      const seats = t.studentCounts?.[0] ?? 0;
      const discount = Math.max(0, Math.min(100, t.discountPercent ?? 0));
      totalSeats += seats;
      weightedNet += seats * (1 - discount / 100);
    }
    return totalSeats > 0 ? weightedNet / totalSeats : 1;
  })();

  for (let y = 0; y < yearCount; y++) {
    const sticker = (() => {
      const base = grossTuitionRow.amounts?.[0] ?? 0;
      const esc = grossTuitionRow.escalationRate;
      const raw = esc !== undefined && esc !== 0 && y > 0
        ? base * Math.pow(1 + esc / 100, y)
        : grossTuitionRow.amounts?.[y] ?? 0;
      return raw * tierNetMultiplier;
    })();
    if (sticker <= 0) continue;
    let funderSum = 0;
    for (const cr of choiceRows) {
      const base = cr.amounts?.[0] ?? 0;
      const esc = cr.escalationRate;
      const v = esc !== undefined && esc !== 0 && y > 0
        ? base * Math.pow(1 + esc / 100, y)
        : (cr.amounts?.[y] ?? 0);
      funderSum += v;
    }
    if (funderSum > sticker + 0.01) return true;
  }
  return false;
}

export function migrateLegacyFundingMix<T extends FundingMixMigratableModel>(
  model: T,
  now: () => string = () => new Date().toISOString(),
): FundingMixMigrationResult<T> {
  const currentVersion = model.revenueModelVersion ?? 1;
  if (currentVersion >= CURRENT_REVENUE_MODEL_VERSION) {
    return { data: model, applied: false };
  }

  const rows = (model.revenueRows ?? []) as readonly RevenueRowAmountsRowLike[];
  const students = resolveY1Enrollment(model);
  const tiers = (model.tuitionTiers ?? []) as readonly TuitionTierLike[] | undefined;

  if (rows.length === 0 || students <= 0) {
    // Nothing to migrate; just stamp the version so we don't keep checking.
    const next = {
      ...model,
      revenueModelVersion: CURRENT_REVENUE_MODEL_VERSION,
    } as T;
    return { data: next, applied: false };
  }

  // The migration only fires when the model actually exhibits the
  // legacy stacked pattern (per-student tuition + per-student
  // school_choice that, summed, exceed the seat sticker). For models
  // without that pattern the engine output already matched the founder's
  // mental model — we just stamp the version forward.
  if (!hasLegacyStackedPattern(rows, students, tiers as TuitionTierLike[] | undefined)) {
    const next = {
      ...model,
      revenueModelVersion: CURRENT_REVENUE_MODEL_VERSION,
    } as T;
    return { data: next, applied: false };
  }

  const before = naiveY1Revenue(rows, students);
  const correctedVals = computeRevenueRowAmountsForYear(
    rows as RevenueRowAmountsRowLike[],
    0,
    students,
    tiers as TuitionTierLike[] | undefined,
  );
  let after = 0;
  for (const v of correctedVals.values()) after += v;

  const delta = after - before;
  // No-op when the engine and naive sums already agree (within $1).
  // We still stamp the version so we don't keep re-checking, but we
  // skip the changelog entry — there's nothing to show the founder.
  if (Math.abs(delta) <= 1) {
    const next = {
      ...model,
      revenueModelVersion: CURRENT_REVENUE_MODEL_VERSION,
    } as T;
    return { data: next, applied: false };
  }

  const summary = `Funding-mix v2 correction applied. Year 1 revenue ${
    delta < 0 ? "decreased" : "increased"
  } by ${formatCurrency(Math.abs(delta))} (${formatCurrency(before)} → ${formatCurrency(
    after,
  )}). ESA / voucher / tax-credit rows are now treated as funders of the same seat as tuition (residual family-pay model), not additive revenue.`;

  const entry: ModelMigrationEntry = {
    type: "funding_mix_v2",
    appliedAt: now(),
    summary,
    beforeY1Revenue: before,
    afterY1Revenue: after,
    deltaY1: delta,
  };

  const next = {
    ...model,
    revenueModelVersion: CURRENT_REVENUE_MODEL_VERSION,
    modelMigrations: [...(model.modelMigrations ?? []), entry],
  } as T;
  return { data: next, applied: true, entry };
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
