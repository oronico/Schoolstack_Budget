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
 * Per-row driver-shape for `computeRevenueRowAmountsForYear`. Mirrors the
 * fields the consultant engine reads off `RevenueRow` and the dashboard
 * snapshot reads off `FullModelData.revenueRows`. Loose-typed so both the
 * server and client can pass their own row types in.
 */
export interface RevenueRowAmountsRowLike {
  id: string;
  enabled?: boolean;
  category?: string;
  driverType?: string;
  amounts?: number[];
  escalationRate?: number;
  percentBase?: string;
}

export interface TuitionTierLike {
  discountPercent?: number;
  studentCounts?: number[];
}

export interface RevenueRowAmountsSchoolProfileLike {
  gradeBandEnrollment?: { k5?: number[]; m68?: number[]; h912?: number[] };
  gradeBandPerPupil?: { k5?: number; m68?: number; h912?: number };
  enrollmentRevenueMethod?: string;
  priorYearADM?: number;
  priorYearADA?: number;
}

function hasGradeBand(sp?: RevenueRowAmountsSchoolProfileLike): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  return (
    hasEnrollment && ((gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0)
  );
}

function computeGradeBandRevenue(
  sp: RevenueRowAmountsSchoolProfileLike,
  yearIdx: number,
): number {
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  if (!gbe || !gbp) return 0;
  const k5e = gbe.k5?.[yearIdx] ?? 0;
  const m68e = gbe.m68?.[yearIdx] ?? 0;
  const h912e = gbe.h912?.[yearIdx] ?? 0;
  if (k5e + m68e + h912e === 0) return 0;
  let total =
    k5e * (gbp.k5 || 0) + m68e * (gbp.m68 || 0) + h912e * (gbp.h912 || 0);
  if (sp.enrollmentRevenueMethod === "ada") {
    const adm = sp.priorYearADM || 0;
    const ada = sp.priorYearADA || 0;
    total *= adm > 0 ? Math.min(ada / adm, 1) : 0.95;
  }
  return total;
}

function computeTuitionWithTiers(
  grossTuitionPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers?: TuitionTierLike[],
): number {
  if (!tuitionTiers || tuitionTiers.length === 0) {
    return grossTuitionPerStudent * totalStudents;
  }
  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }
  if (rawTierTotal === 0) {
    return grossTuitionPerStudent * totalStudents;
  }
  const scaleFactor =
    rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;
  let totalTuition = 0;
  let allocatedStudents = 0;
  for (const tier of tuitionTiers) {
    const rawCount = tier.studentCounts?.[yearIdx] ?? 0;
    const scaledCount = rawCount * scaleFactor;
    allocatedStudents += scaledCount;
    const discount = (tier.discountPercent || 0) / 100;
    totalTuition += scaledCount * grossTuitionPerStudent * (1 - discount);
  }
  const remainingStudents = totalStudents - allocatedStudents;
  if (remainingStudents > 0) {
    totalTuition += remainingStudents * grossTuitionPerStudent;
  }
  return totalTuition;
}

function computeDriverValue(
  amounts: number[] | undefined,
  yearIdx: number,
  driverType: string | undefined,
  students: number,
  escalationRate?: number,
): number {
  let base: number;
  const esc = escalationRate !== undefined && escalationRate !== 0 ? escalationRate : 0;
  if (esc !== 0 && yearIdx > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + esc / 100, yearIdx);
  } else {
    base = amounts?.[yearIdx] ?? 0;
  }
  switch (driverType) {
    case "monthly":
      return base * 12;
    case "per_student":
      return base * students;
    case "per_new_student":
      return base * students;
    case "per_returning_student":
      return 0;
    case "annual_fixed":
    default:
      return base;
  }
}

/**
 * Per-row dollar amounts for a given year, keyed by row id. Mirrors the
 * consultant engine so the dashboard snapshot, lender packet, and
 * consultant view all bucket the same dollar values into the
 * revenue-quality rollup.
 *
 * Honored:
 * - per-row escalation (snapshot uses Y1 only, so escalation is a no-op
 *   there; the multi-year callers exercise the escalation branch)
 * - tuition tiers on `gross_tuition` rows with `per_student` driver
 * - grade-band per-pupil funding on `state_local_perpupil` when the
 *   school profile carries grade-band enrollment + per-pupil rates
 * - percent-of-base rows (resolved after the first pass so they can
 *   reference any base row's value)
 * - tuition-offsets sign flip (offsets reduce contracted tuition, so
 *   they're stored as negative values inside the contracted bucket)
 */
export function computeRevenueRowAmountsForYear(
  rows: readonly RevenueRowAmountsRowLike[],
  yearIdx: number,
  students: number,
  tuitionTiers?: TuitionTierLike[],
  schoolProfile?: RevenueRowAmountsSchoolProfileLike,
): Map<string, number> {
  const rowValues = new Map<string, number>();

  for (const row of rows) {
    if (!row.enabled || !row.id || row.driverType === "percent_of_base") continue;
    if (
      row.id === "state_local_perpupil" &&
      schoolProfile &&
      hasGradeBand(schoolProfile)
    ) {
      rowValues.set(row.id, computeGradeBandRevenue(schoolProfile, yearIdx));
    } else if (
      row.id === "gross_tuition" &&
      row.driverType === "per_student" &&
      tuitionTiers &&
      tuitionTiers.length > 0
    ) {
      let perStudentAmount: number;
      if (
        row.escalationRate !== undefined &&
        row.escalationRate !== 0 &&
        yearIdx > 0
      ) {
        perStudentAmount =
          (row.amounts?.[0] ?? 0) *
          Math.pow(1 + row.escalationRate / 100, yearIdx);
      } else {
        perStudentAmount = row.amounts?.[yearIdx] ?? 0;
      }
      rowValues.set(
        row.id,
        computeTuitionWithTiers(perStudentAmount, yearIdx, students, tuitionTiers),
      );
    } else {
      rowValues.set(
        row.id,
        computeDriverValue(
          row.amounts,
          yearIdx,
          row.driverType,
          students,
          row.escalationRate,
        ),
      );
    }
  }

  for (const row of rows) {
    if (!row.enabled || !row.id || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase || "") || 0;
    let pctVal: number;
    if (
      row.escalationRate !== undefined &&
      row.escalationRate !== 0 &&
      yearIdx > 0
    ) {
      pctVal =
        (row.amounts?.[0] ?? 0) *
        Math.pow(1 + row.escalationRate / 100, yearIdx);
    } else {
      pctVal = row.amounts?.[yearIdx] ?? 0;
    }
    rowValues.set(row.id, baseVal * (pctVal / 100));
  }

  for (const row of rows) {
    if (!row.enabled || !row.id) continue;
    if (row.category === "tuition_offsets") {
      const v = rowValues.get(row.id) || 0;
      rowValues.set(row.id, -Math.abs(v));
    }
  }

  // Task #860 — "Tuition is just price." Funding-mix correction.
  //
  // Founders enter the seat sticker price on the gross_tuition row and
  // ESA/voucher/tax-credit per-student amounts on school_choice rows. In
  // the founder's mental model these are different *funders* of the same
  // seat, not additive revenue streams. Without correction a $10k seat
  // partially funded by an $8k ESA double-counts to $18k/student.
  //
  // The correction only fires when:
  //   - gross_tuition is enabled AND uses the per_student driver, AND
  //   - at least one school_choice row is enabled AND uses per_student.
  //
  // We then treat the school_choice per-student amounts as funding sources
  // for the same seat. The gross_tuition row's dollars are reduced to the
  // residual family-pay portion: max(0, (seat - choice) * students). The
  // school_choice row dollars are capped if their sum would otherwise
  // exceed seat * students (in which case the residual is 0 and we emit
  // a `funding_mix_inconsistent` flag downstream).
  //
  // Non-per-student tuition rows (registration fees, aftercare) and
  // non-per-student school_choice rows (annual ESA grants) are genuinely
  // additive — they're left alone by this correction.
  const grossTuitionRow = rows.find(
    (r) => r.enabled && r.id === "gross_tuition" && r.driverType === "per_student",
  );
  if (grossTuitionRow && students > 0) {
    const seatPerStudent = perStudentValue(grossTuitionRow, yearIdx);
    const choiceRows = rows.filter(
      (r) => r.enabled && r.category === "school_choice" && r.driverType === "per_student",
    );
    if (choiceRows.length > 0 && seatPerStudent > 0) {
      let choicePerStudentTotal = 0;
      for (const cr of choiceRows) {
        choicePerStudentTotal += perStudentValue(cr, yearIdx);
      }
      const cappedChoicePerStudent = Math.min(choicePerStudentTotal, seatPerStudent);
      // Cap school_choice rows proportionally if they would exceed the seat.
      if (choicePerStudentTotal > seatPerStudent && choicePerStudentTotal > 0) {
        const scale = cappedChoicePerStudent / choicePerStudentTotal;
        for (const cr of choiceRows) {
          const cur = rowValues.get(cr.id) || 0;
          rowValues.set(cr.id, cur * scale);
        }
      }
      // Reduce gross_tuition to the residual family-pay portion.
      const residualPerStudent = Math.max(0, seatPerStudent - cappedChoicePerStudent);
      const grossCurrent = rowValues.get("gross_tuition") || 0;
      // Preserve the tuition-tier vs flat scaling: scale by ratio of
      // residual to seat so tier discounts continue to apply correctly.
      const seatTotal = seatPerStudent * students;
      const scaledResidual = seatTotal > 0
        ? grossCurrent * (residualPerStudent / seatPerStudent)
        : 0;
      rowValues.set("gross_tuition", scaledResidual);
    }
  }

  return rowValues;
}

/**
 * Resolve a per-student amount for a row honoring escalation. Mirrors the
 * inline escalation handling in the main loop above. Defined here as a
 * helper so the funding-mix correction reads it the same way the original
 * driver computation did.
 */
function perStudentValue(
  row: RevenueRowAmountsRowLike,
  yearIdx: number,
): number {
  const esc =
    row.escalationRate !== undefined && row.escalationRate !== 0
      ? row.escalationRate
      : 0;
  if (esc !== 0 && yearIdx > 0) {
    return (row.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, yearIdx);
  }
  return row.amounts?.[yearIdx] ?? 0;
}

/**
 * Task #860 — Apply the funding-mix correction in-place to a per-row
 * dollar Map keyed by `row.id`. Mirrors the correction baked into
 * `computeRevenueRowAmountsForYear` so legacy duplicate revenue
 * summations (PDF / workbook / underwriting exports) can stay in-shape
 * without re-implementing the math. The Map is mutated and returned.
 *
 * Caller contract: `vals` already contains per-row dollars *as if* the
 * tuition + choice rows were additive — we then reduce gross_tuition to
 * the residual family-pay portion and proportionally cap stacked choice
 * rows. Non-per-student rows are untouched.
 */
export function applyFundingMixCorrection(
  vals: Map<string, number>,
  rows: readonly RevenueRowAmountsRowLike[],
  yearIdx: number,
  students: number,
): Map<string, number> {
  if (students <= 0) return vals;
  const grossTuitionRow = rows.find(
    (r) => r.enabled && r.id === "gross_tuition" && r.driverType === "per_student",
  );
  if (!grossTuitionRow) return vals;
  const seatPerStudent = perStudentValue(grossTuitionRow, yearIdx);
  if (seatPerStudent <= 0) return vals;
  const choiceRows = rows.filter(
    (r) => r.enabled && r.category === "school_choice" && r.driverType === "per_student",
  );
  if (choiceRows.length === 0) return vals;

  let choicePerStudentTotal = 0;
  for (const cr of choiceRows) {
    choicePerStudentTotal += perStudentValue(cr, yearIdx);
  }
  const cappedChoicePerStudent = Math.min(choicePerStudentTotal, seatPerStudent);
  if (choicePerStudentTotal > seatPerStudent && choicePerStudentTotal > 0) {
    const scale = cappedChoicePerStudent / choicePerStudentTotal;
    for (const cr of choiceRows) {
      const cur = vals.get(cr.id) || 0;
      vals.set(cr.id, cur * scale);
    }
  }
  const residualPerStudent = Math.max(0, seatPerStudent - cappedChoicePerStudent);
  const grossCurrent = vals.get("gross_tuition") || 0;
  const scaledResidual = grossCurrent * (residualPerStudent / seatPerStudent);
  vals.set("gross_tuition", scaledResidual);
  return vals;
}

/**
 * Task #860 — Detect a year where the founder has entered per-student
 * funding sources (ESA, voucher, tax-credit) that exceed the per-student
 * seat price. Used by the assumption-flags pipeline to surface a
 * `funding_mix_inconsistent` warning that blocks Lender Packet exports.
 *
 * Returns one entry per affected year with the seat price, total funding,
 * and the difference, so the flag message can name concrete dollars.
 */
export interface FundingMixInconsistency {
  yearIdx: number;
  seatPerStudent: number;
  fundingPerStudent: number;
  excessPerStudent: number;
}

export function detectFundingMixInconsistencies(
  rows: readonly RevenueRowAmountsRowLike[],
  yearCount: number,
): FundingMixInconsistency[] {
  const grossTuitionRow = rows.find(
    (r) => r.enabled && r.id === "gross_tuition" && r.driverType === "per_student",
  );
  if (!grossTuitionRow) return [];
  const choiceRows = rows.filter(
    (r) => r.enabled && r.category === "school_choice" && r.driverType === "per_student",
  );
  if (choiceRows.length === 0) return [];

  const out: FundingMixInconsistency[] = [];
  for (let y = 0; y < yearCount; y++) {
    const seat = perStudentValue(grossTuitionRow, y);
    if (seat <= 0) continue;
    let funding = 0;
    for (const cr of choiceRows) funding += perStudentValue(cr, y);
    if (funding > seat) {
      out.push({
        yearIdx: y,
        seatPerStudent: seat,
        fundingPerStudent: funding,
        excessPerStudent: funding - seat,
      });
    }
  }
  return out;
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
