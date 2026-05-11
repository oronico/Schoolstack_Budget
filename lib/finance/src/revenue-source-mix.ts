/**
 * Revenue source mix (per the founder's terminology contract).
 *
 * Decomposes revenue into the founder's preferred buckets so the wizard,
 * Review step, and Dashboard can all show "what % of revenue comes from
 * each source" without conflating the seat price (gross educational
 * program value) with who actually pays for the seat.
 *
 * Two taxonomies, switched on schoolType:
 * - PRIVATE (default): ESA / Voucher / Tax credit / Scholarship /
 *   Private pay / Fundraising
 * - CHARTER: Public per-pupil / Federal title funds / CSP grant /
 *   Other grants / Other
 *
 * Classification is by row id (well-known seeded ids) with category /
 * line-item fallbacks for ad-hoc rows the founder added by hand.
 *
 * Net of tuition_offsets: scholarship discounts that reduce gross tuition
 * net into the Private pay bucket so the % view doesn't double-count
 * full-price tuition that was never collected.
 */

import {
  computeRevenueRowAmountsForYear,
  type RevenueRowAmountsRowLike,
  type RevenueRowAmountsSchoolProfileLike,
  type TuitionTierLike,
} from "./revenue-quality.js";

export type PrivateRevenueSourceBucket =
  | "esa"
  | "voucher"
  | "tax_credit"
  | "scholarship"
  | "private_pay"
  | "fundraising";

export type CharterRevenueSourceBucket =
  | "public_per_pupil"
  | "federal_title"
  | "csp_grant"
  | "other_grants"
  | "other";

export type RevenueSourceBucket =
  | PrivateRevenueSourceBucket
  | CharterRevenueSourceBucket;

export const PRIVATE_BUCKET_ORDER: readonly PrivateRevenueSourceBucket[] = [
  "private_pay",
  "esa",
  "voucher",
  "tax_credit",
  "scholarship",
  "fundraising",
] as const;

export const CHARTER_BUCKET_ORDER: readonly CharterRevenueSourceBucket[] = [
  "public_per_pupil",
  "federal_title",
  "csp_grant",
  "other_grants",
  "other",
] as const;

export const PRIVATE_BUCKET_LABELS: Record<PrivateRevenueSourceBucket, string> =
  {
    esa: "ESA",
    voucher: "Voucher",
    tax_credit: "Tax credit",
    scholarship: "Scholarship",
    private_pay: "Private pay",
    fundraising: "Fundraising",
  };

export const CHARTER_BUCKET_LABELS: Record<CharterRevenueSourceBucket, string> =
  {
    public_per_pupil: "Public per-pupil",
    federal_title: "Federal title funds",
    csp_grant: "CSP grant",
    other_grants: "Other grants",
    other: "Other",
  };

export const PRIVATE_BUCKET_COLORS: Record<PrivateRevenueSourceBucket, string> =
  {
    private_pay: "#1F5D44", // Evergreen
    esa: "#0D9488", // Teal
    voucher: "#0E7490", // Teal-700
    tax_credit: "#0369A1", // Sky-700
    scholarship: "#7C3AED", // Violet-600
    fundraising: "#D97706", // Amber-600
  };

export const CHARTER_BUCKET_COLORS: Record<CharterRevenueSourceBucket, string> =
  {
    public_per_pupil: "#1F5D44",
    federal_title: "#0D9488",
    csp_grant: "#D97706",
    other_grants: "#7C3AED",
    other: "#64748B",
  };

export function isCharterSchoolType(schoolType?: string): boolean {
  return schoolType === "charter_school";
}

export function getBucketOrder(
  schoolType?: string,
): readonly RevenueSourceBucket[] {
  return isCharterSchoolType(schoolType)
    ? CHARTER_BUCKET_ORDER
    : PRIVATE_BUCKET_ORDER;
}

export function getBucketLabel(
  bucket: RevenueSourceBucket,
  schoolType?: string,
): string {
  if (isCharterSchoolType(schoolType)) {
    return (
      (CHARTER_BUCKET_LABELS as Record<string, string>)[bucket] ??
      String(bucket)
    );
  }
  return (
    (PRIVATE_BUCKET_LABELS as Record<string, string>)[bucket] ??
    String(bucket)
  );
}

export function getBucketColor(
  bucket: RevenueSourceBucket,
  schoolType?: string,
): string {
  if (isCharterSchoolType(schoolType)) {
    return (
      (CHARTER_BUCKET_COLORS as Record<string, string>)[bucket] ?? "#64748B"
    );
  }
  return (
    (PRIVATE_BUCKET_COLORS as Record<string, string>)[bucket] ?? "#64748B"
  );
}

interface RowLike extends RevenueRowAmountsRowLike {
  lineItem?: string;
}

/**
 * Classify a single revenue row into a source bucket.
 *
 * Returns null when the row is `tuition_offsets` (those are netted into
 * the private_pay bucket downstream rather than appearing as their own
 * source) or `gross_tuition` on a charter (charters typically don't
 * collect family-paid tuition).
 */
export function classifyRevenueRow(
  row: RowLike,
  schoolType?: string,
): RevenueSourceBucket | null {
  const id = (row.id || "").toLowerCase();
  const category = (row.category || "").toLowerCase();
  const lineItem = (row.lineItem || "").toLowerCase();
  const charter = isCharterSchoolType(schoolType);

  if (category === "tuition_offsets") return null;

  if (charter) {
    if (category === "tuition_and_fees") return "other"; // rare for charters
    if (id === "csp_grant") return "csp_grant";
    if (
      id === "title_i" ||
      id === "title_ii" ||
      id === "title_iii" ||
      id.startsWith("title_") ||
      id === "sped_funding" ||
      lineItem.startsWith("title ") ||
      lineItem.includes("idea")
    ) {
      return "federal_title";
    }
    if (category === "public_funding") return "public_per_pupil";
    if (category === "philanthropy" || category === "grants_contributions") {
      return "other_grants";
    }
    return "other";
  }

  // Private / microschool / catholic / pod / co-op / etc.
  if (category === "tuition_and_fees") return "private_pay";

  if (
    id === "esa_revenue" ||
    id.includes("esa") ||
    lineItem.includes("esa") ||
    lineItem.includes("education savings")
  ) {
    return "esa";
  }

  if (
    id === "voucher_revenue" ||
    id.includes("voucher") ||
    lineItem.includes("voucher")
  ) {
    return "voucher";
  }

  if (
    id === "tax_credit_scholarship" ||
    id === "refundable_tax_credit" ||
    id === "individual_tax_credit" ||
    id === "federal_tax_credit_sgo" ||
    id.includes("tax_credit") ||
    id.includes("sgo") ||
    lineItem.includes("tax credit") ||
    lineItem.includes("tax-credit") ||
    lineItem.includes("sgo")
  ) {
    return "tax_credit";
  }

  if (
    id === "scholarship_org" ||
    id === "private_scholarship_revenue" ||
    id === "private_scholarships" ||
    id.includes("scholarship") ||
    lineItem.includes("scholarship")
  ) {
    return "scholarship";
  }

  if (category === "school_choice") {
    // Unknown school_choice row → bucket as scholarship by default
    // (closest to "external funding paid on behalf of a family").
    return "scholarship";
  }

  if (category === "public_funding") {
    // Non-charter school with public funding (rare — e.g., SPED reimbursement
    // for a private school). Bucket as scholarship since it's external
    // money paid on behalf of a child.
    return "scholarship";
  }

  if (category === "philanthropy" || category === "grants_contributions") {
    return "fundraising";
  }

  if (category === "other_revenue") {
    // No "other" bucket in the private taxonomy by founder request — bucket
    // misc revenue under fundraising as the closest catch-all rather than
    // dropping it from the percentage view.
    return "fundraising";
  }

  return "fundraising";
}

export interface RevenueSourceMixYear {
  year: number; // 0-indexed (Y1 = 0)
  totalsByBucket: Map<RevenueSourceBucket, number>;
  total: number;
  /** Percentages in [0, 100], summing to ~100 when total > 0. */
  sharesByBucket: Map<RevenueSourceBucket, number>;
}

export interface RevenueSourceMixResult {
  schoolType?: string;
  taxonomy: "private" | "charter";
  buckets: readonly RevenueSourceBucket[];
  years: RevenueSourceMixYear[];
}

interface MixInputs {
  rows: readonly RowLike[];
  yearCount: number;
  studentsByYear: readonly number[];
  schoolType?: string;
  tuitionTiers?: TuitionTierLike[];
  schoolProfile?: RevenueRowAmountsSchoolProfileLike;
}

/**
 * Roll revenue rows up into per-year per-bucket dollars + percentages.
 *
 * `tuition_offsets` rows (negative values) are netted into the
 * private_pay bucket so the % view reflects the contracted family-paid
 * total, not the full-price seat list.
 */
export function computeRevenueSourceMix(
  inputs: MixInputs,
): RevenueSourceMixResult {
  const { rows, yearCount, studentsByYear, schoolType } = inputs;
  const charter = isCharterSchoolType(schoolType);
  const buckets = charter ? CHARTER_BUCKET_ORDER : PRIVATE_BUCKET_ORDER;

  const years: RevenueSourceMixYear[] = [];

  for (let y = 0; y < yearCount; y++) {
    const students = studentsByYear[y] ?? 0;
    const rowAmounts = computeRevenueRowAmountsForYear(
      rows,
      y,
      students,
      inputs.tuitionTiers,
      inputs.schoolProfile,
    );

    const totals = new Map<RevenueSourceBucket, number>();
    for (const b of buckets) totals.set(b, 0);

    for (const row of rows) {
      if (!row.enabled || !row.id) continue;
      const amount = rowAmounts.get(row.id) || 0;

      if (
        (row.category || "").toLowerCase() === "tuition_offsets" &&
        !charter
      ) {
        // Net offsets into private_pay (amount is already negative from
        // computeRevenueRowAmountsForYear).
        const cur = totals.get("private_pay") || 0;
        totals.set("private_pay", cur + amount);
        continue;
      }

      const bucket = classifyRevenueRow(row, schoolType);
      if (!bucket) continue;
      const cur = totals.get(bucket) || 0;
      totals.set(bucket, cur + amount);
    }

    let total = 0;
    for (const v of totals.values()) total += v;

    const shares = new Map<RevenueSourceBucket, number>();
    for (const [b, v] of totals) {
      const pct = total > 0 ? (v / total) * 100 : 0;
      shares.set(b, pct);
    }

    years.push({
      year: y,
      totalsByBucket: totals,
      total,
      sharesByBucket: shares,
    });
  }

  return {
    schoolType,
    taxonomy: charter ? "charter" : "private",
    buckets,
    years,
  };
}
