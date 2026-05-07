/**
 * Revenue quality classification (Task #613).
 *
 * Each revenue row carries an optional `revenueQuality` tag in one of four
 * buckets. When the tag is missing we infer a reasonable default from the
 * row's category + id, so legacy models migrate transparently. The UI lets
 * the founder override per row.
 *
 * Bucket meaning (used in tooltips, lender packet, consultant view):
 * - contracted        Signed enrollment contracts / executed agreements.
 *                     Counts as "hard revenue" against fixed costs + debt.
 * - projected         Forecasted earned revenue (fees, summer programs,
 *                     other miscellaneous). Reasonable but not guaranteed.
 * - donor_dependent   Philanthropy, grants, fundraising. Disappears if
 *                     donors stop giving.
 * - policy_dependent  Public per-pupil funding, ESA, vouchers, tax-credit
 *                     scholarships. Disappears if policy changes.
 */

export type RevenueQuality =
  | "contracted"
  | "projected"
  | "donor_dependent"
  | "policy_dependent";

export const REVENUE_QUALITY_LABELS: Record<RevenueQuality, string> = {
  contracted: "Contracted",
  projected: "Projected",
  donor_dependent: "Donor-Dependent",
  policy_dependent: "Policy-Dependent",
};

export const REVENUE_QUALITY_DEFINITIONS: Record<RevenueQuality, string> = {
  contracted:
    "Signed enrollment agreements or executed contracts. Counts as 'hard revenue' for lender coverage tests.",
  projected:
    "Forecasted earned revenue (fees, summer programs, miscellaneous). Reasonable but not yet committed.",
  donor_dependent:
    "Philanthropy, grants, fundraising. Goes to zero if the donor base contracts.",
  policy_dependent:
    "Public per-pupil funding, ESAs, vouchers, tax-credit scholarships. Subject to legislative or court action.",
};

export const REVENUE_QUALITY_ORDER: readonly RevenueQuality[] = [
  "contracted",
  "policy_dependent",
  "projected",
  "donor_dependent",
] as const;

interface RevenueRowLike {
  id?: string;
  category?: string;
  revenueQuality?: RevenueQuality;
}

/**
 * Infer the default quality bucket for a revenue row based on its category
 * and well-known line-item ids. The wizard stamps an explicit value when
 * the founder overrides; otherwise this function picks the bucket.
 */
export function inferRevenueQuality(row: RevenueRowLike): RevenueQuality {
  if (row.revenueQuality) return row.revenueQuality;

  const id = row.id ?? "";
  const category = row.category ?? "";

  switch (category) {
    case "tuition_and_fees":
      // Gross tuition reflects signed enrollment agreements once the school
      // is operating; ancillary fees (registration, aftercare, etc.) are
      // genuinely projected because they depend on opt-in family behavior.
      if (id === "gross_tuition") return "contracted";
      return "projected";
    case "tuition_offsets":
      // Scholarship discounts ride alongside contracted tuition — bucket
      // them with contracted so the rollup nets to the right hard-revenue
      // figure (contracted tuition - contracted offsets).
      return "contracted";
    case "public_funding":
    case "school_choice":
      return "policy_dependent";
    case "philanthropy":
    case "grants_contributions":
      return "donor_dependent";
    case "other_revenue":
      return "projected";
    default:
      return "projected";
  }
}

export interface RevenueQualityYearRollup {
  year: number;
  totalRevenue: number;
  byBucket: Record<RevenueQuality, number>;
  pctByBucket: Record<RevenueQuality, number>;
  hardRevenue: number;
  fixedCosts: number;
  debtService: number;
  /**
   * Coverage of fixed costs + debt service by hard (contracted) revenue.
   * `null` when the denominator is zero (no fixed costs or debt to cover).
   */
  hardRevenueCoverage: number | null;
}

export interface RevenueQualityYearInputs {
  year: number;
  /** dollar amount realized for each row id this year */
  rowAmountsById: Record<string, number>;
  /** sum of staffing + facility + recurring opex for the year */
  fixedCosts: number;
  /** annual loan debt service for the year */
  debtService: number;
}

/**
 * Compute per-year quality buckets, percentages, and the
 * "hard revenue / (fixed costs + debt service)" coverage ratio.
 *
 * `rows` carries the categorical metadata; `yearInputs` carries the dollar
 * amounts realized per row per year (already proration-adjusted by the
 * caller). We split this responsibility so consumers (consultant engine,
 * scenario engine, workbook export) can plug their own per-row dollar
 * computation in without re-deriving it here.
 */
export function computeRevenueQualityRollup(
  rows: RevenueRowLike[],
  yearInputs: RevenueQualityYearInputs[],
): RevenueQualityYearRollup[] {
  const qualityById = new Map<string, RevenueQuality>();
  for (const row of rows) {
    if (!row.id) continue;
    qualityById.set(row.id, inferRevenueQuality(row));
  }

  return yearInputs.map((yi) => {
    const byBucket: Record<RevenueQuality, number> = {
      contracted: 0,
      projected: 0,
      donor_dependent: 0,
      policy_dependent: 0,
    };

    let total = 0;
    for (const [rowId, amount] of Object.entries(yi.rowAmountsById)) {
      const quality = qualityById.get(rowId) ?? "projected";
      byBucket[quality] += amount;
      total += amount;
    }

    const pctByBucket: Record<RevenueQuality, number> = {
      contracted: total !== 0 ? byBucket.contracted / total : 0,
      projected: total !== 0 ? byBucket.projected / total : 0,
      donor_dependent: total !== 0 ? byBucket.donor_dependent / total : 0,
      policy_dependent: total !== 0 ? byBucket.policy_dependent / total : 0,
    };

    const obligations = yi.fixedCosts + yi.debtService;
    const hardRevenueCoverage =
      obligations > 0 ? byBucket.contracted / obligations : null;

    return {
      year: yi.year,
      totalRevenue: total,
      byBucket,
      pctByBucket,
      hardRevenue: byBucket.contracted,
      fixedCosts: yi.fixedCosts,
      debtService: yi.debtService,
      hardRevenueCoverage,
    };
  });
}
