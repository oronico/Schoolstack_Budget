import {
  distributeRevenueMonthly,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";

export type RevenueCategory =
  | "tuition_and_fees"
  | "tuition_offsets"
  | "public_funding"
  | "school_choice"
  | "philanthropy"
  | "other_revenue";

export type RevenueDriverType = "annual_fixed" | "monthly" | "per_student" | "percent_of_base";

export type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

export type EnrollmentRevenueMethod = "count_days" | "adm" | "ada";
export type CharterDepositTiming = "monthly" | "quarterly" | "semi_annual" | "annual";

export const ENROLLMENT_REVENUE_METHOD_LABELS: Record<EnrollmentRevenueMethod, string> = {
  count_days: "Count Days (Membership)",
  adm: "Average Daily Membership (ADM)",
  ada: "Average Daily Attendance (ADA)",
};

export const CHARTER_DEPOSIT_TIMING_LABELS: Record<CharterDepositTiming, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

// Task #302: bands ordered ascending by typical age. Toddlers / preK / other
// are optional and only show up in StoryStep + downstream views when the
// founder turns them on. RevenueStep + EnrollmentStep iterate using
// `GRADE_BAND_KEYS` so adding a band only requires updating this constant
// and the schema.
export type GradeBandKey = "toddlers" | "preK" | "k5" | "m68" | "h912" | "other";

export const GRADE_BAND_KEYS: readonly GradeBandKey[] = [
  "toddlers",
  "preK",
  "k5",
  "m68",
  "h912",
  "other",
] as const;

export const GRADE_BAND_LABELS: Record<GradeBandKey, string> = {
  toddlers: "Toddlers (0-2)",
  preK: "Pre-K (3-4)",
  k5: "K-5 (Elementary)",
  m68: "6-8 (Middle)",
  h912: "9-12 (High)",
  other: "Other",
};

// Default students-per-teacher when the founder hasn't overridden the band's
// own ratio. Lower for early childhood (state licensing usually requires
// tighter ratios), looser for older grades.
export const GRADE_BAND_DEFAULT_RATIO: Record<GradeBandKey, number> = {
  toddlers: 4,
  preK: 8,
  k5: 12,
  m68: 14,
  h912: 16,
  other: 12,
};

// Individual grade levels (K through 12). Founders who run a
// traditional K-12 model can choose to enter enrollment per grade instead of
// per band. Bands and grades are independent — the founder picks one, the
// other, or both via `schoolProfile.studentGroupingMode`. We keep grades
// flat (no "9th-grade Honors" sub-tracks) because the matrix already
// handles program × grade combinations.
export type GradeKey = "k" | "g1" | "g2" | "g3" | "g4" | "g5" | "g6" | "g7" | "g8" | "g9" | "g10" | "g11" | "g12";

export const GRADE_KEYS: readonly GradeKey[] = [
  "k", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12",
] as const;

export const GRADE_LABELS: Record<GradeKey, string> = {
  k: "K",
  g1: "1st",
  g2: "2nd",
  g3: "3rd",
  g4: "4th",
  g5: "5th",
  g6: "6th",
  g7: "7th",
  g8: "8th",
  g9: "9th",
  g10: "10th",
  g11: "11th",
  g12: "12th",
};

// Default students-per-teacher per grade. Lower for K (typical state cap is
// ~15-18); steady around 14-18 for elementary/middle; ~18-22 for high. Used
// only as placeholder text — founders override per grade in Story / Staffing.
export const GRADE_DEFAULT_RATIO: Record<GradeKey, number> = {
  k: 14, g1: 14, g2: 14, g3: 16, g4: 16, g5: 16,
  g6: 18, g7: 18, g8: 18,
  g9: 20, g10: 20, g11: 20, g12: 20,
};

// Map a grade to its parent band so downstream charter per-pupil math (which
// runs off bands) keeps working when the founder enters per-grade enrollment
// only.
export const GRADE_TO_BAND: Record<GradeKey, GradeBandKey> = {
  k: "k5", g1: "k5", g2: "k5", g3: "k5", g4: "k5", g5: "k5",
  g6: "m68", g7: "m68", g8: "m68",
  g9: "h912", g10: "h912", g11: "h912", g12: "h912",
};

export type StudentGroupingMode = "grades" | "age_bands" | "both";

// Suggested default grouping mode by school type. Microschools, learning
// pods, homeschool co-ops, and tutoring centers usually think in age bands
// (mixed-age studios). Charter / private K-12 schools typically run grade
// cohorts. We default rather than force so founders always retain control.
export function defaultGroupingModeForSchoolType(schoolType: string | undefined): StudentGroupingMode {
  switch (schoolType) {
    case "microschool":
    case "learning_pod":
    case "homeschool_coop":
    case "tutoring_center":
      return "age_bands";
    case "charter_school":
    case "chesterton_academy":
    case "catholic_school":
    case "private_school":
      return "grades";
    default:
      return "both";
  }
}

export type CollectionMethod = "autopay" | "invoiced" | "mixed";
export type PaymentFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";
export type PaymentTiming = "upfront" | "arrears";
export type DisbursementType = "direct" | "reimbursement";
export type GrantStatus = "confirmed" | "projected";

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  autopay: "Autopay",
  invoiced: "Invoiced",
  mixed: "Mixed",
};

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

export const PAYMENT_TIMING_LABELS: Record<PaymentTiming, string> = {
  upfront: "Upfront",
  arrears: "In Arrears (Reimbursement)",
};

export const DISBURSEMENT_TYPE_LABELS: Record<DisbursementType, string> = {
  direct: "Direct (Scheduled Tranches)",
  reimbursement: "Reimbursement",
};

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  confirmed: "Confirmed",
  projected: "Projected",
};

export interface RevenueRowData {
  id: string;
  category: RevenueCategory;
  lineItem: string;
  enabled: boolean;
  driverType: RevenueDriverType;
  amounts: number[];
  percentBase?: string;
  escalationRate?: number;
  escalationRateOverridden?: boolean;
  // Set by the Extend-to-5-Year seeder when it stamps the per-row
  // escalationRate. RevenueStep reads this to render a "seeded from
  // Extend-to-5-Year" badge (Task #514). Cleared/absent for rows the
  // founder has explicitly overridden.
  escalationRateSeeded?: boolean;
  note?: string;
  billingMonths?: 9 | 10 | 12;
  collectionMethod?: CollectionMethod;
  collectionRate?: number;
  collectionDelayDays?: number;
  paymentFrequency?: PaymentFrequency;
  paymentTiming?: PaymentTiming;
  disbursementType?: DisbursementType;
  reimbursementLagMonths?: number;
  grantStatus?: GrantStatus;
  receiptQuarter?: 1 | 2 | 3 | 4;
  timingOverridden?: boolean;
  // Task #613 — revenue quality classification. When absent, callers infer
  // a default from category + id via `inferRevenueQuality` in @workspace/finance.
  revenueQuality?: "contracted" | "projected" | "donor_dependent" | "policy_dependent";
  revenueQualityOverridden?: boolean;
}

const DEPOSIT_TIMING_TO_FREQUENCY: Record<string, PaymentFrequency> = {
  monthly: "monthly",
  quarterly: "quarterly",
  semi_annual: "semi_annual",
  annual: "annual",
};

export function getTimingDefaults(
  category: RevenueCategory,
  fundingProfile: FundingProfile,
  itemId?: string,
  charterDepositTiming?: CharterDepositTiming
): Partial<RevenueRowData> {
  switch (category) {
    case "tuition_and_fees":
      if (itemId && itemId !== "gross_tuition") {
        return {};
      }
      return {
        billingMonths: fundingProfile === "charter_public_funded" ? 12 : 10,
        collectionMethod: "autopay",
        collectionRate: 98,
        collectionDelayDays: 0,
      };
    case "tuition_offsets":
      return {
        billingMonths: fundingProfile === "charter_public_funded" ? 12 : 10,
        collectionMethod: "autopay",
        collectionRate: 100,
        collectionDelayDays: 0,
      };
    case "public_funding": {
      const freq = charterDepositTiming
        ? (DEPOSIT_TIMING_TO_FREQUENCY[charterDepositTiming] || "quarterly")
        : (fundingProfile === "charter_public_funded" ? "quarterly" : "monthly");
      return {
        paymentFrequency: freq,
        paymentTiming: fundingProfile === "charter_public_funded" ? "arrears" : "upfront",
        collectionDelayDays: 30,
        collectionRate: 100,
      };
    }
    case "school_choice":
      return {
        disbursementType: "direct",
        reimbursementLagMonths: 2,
        collectionDelayDays: 45,
        collectionRate: 100,
      };
    case "philanthropy":
      return {
        grantStatus: "projected",
        receiptQuarter: 1,
        collectionDelayDays: 60,
        collectionRate: 95,
      };
    case "other_revenue":
      return {};
    default:
      return {};
  }
}

/**
 * Wizard-facing wrapper around the canonical
 * `distributeRevenueMonthly` helper from `@workspace/finance`. Task #609
 * deduplicated this — the wizard, the api-server lender PDF, and the
 * underwriting workbook now all share the same per-stream timing logic
 * so the founder, the lender, and the underwriter see identical month-
 * by-month inflows.
 */
export function computeMonthlyCashInflow(
  rows: RevenueRowData[],
  yearIndex: number = 0,
  students: number = 0,
): number[] {
  return distributeRevenueMonthly(
    rows as unknown as MonthlyRevenueRowLike[],
    yearIndex,
    students,
    12,
  );
}

export const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets (Scholarships & Discounts)",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  philanthropy: "Philanthropy",
  other_revenue: "Other Revenue",
};

export const CATEGORY_ORDER: RevenueCategory[] = [
  "tuition_and_fees",
  "tuition_offsets",
  "public_funding",
  "school_choice",
  "philanthropy",
  "other_revenue",
];

export const DRIVER_TYPE_LABELS: Record<RevenueDriverType, string> = {
  annual_fixed: "Annual Fixed",
  monthly: "Monthly",
  per_student: "Per Student",
  percent_of_base: "% of Base",
};

interface LineItemDef {
  id: string;
  category: RevenueCategory;
  lineItem: string;
  driverType: RevenueDriverType;
  enabledFor: FundingProfile[];
}



const LINE_ITEM_CATALOG: LineItemDef[] = [
  { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", driverType: "per_student", enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", driverType: "per_student", enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "student_fees", category: "tuition_and_fees", lineItem: "Student Fees", driverType: "per_student", enabledFor: [] },
  { id: "aftercare", category: "tuition_and_fees", lineItem: "Aftercare / Extended Day", driverType: "annual_fixed", enabledFor: [] },
  { id: "summer_program", category: "tuition_and_fees", lineItem: "Summer Program Revenue", driverType: "annual_fixed", enabledFor: [] },
  { id: "other_student_revenue", category: "tuition_and_fees", lineItem: "Other Earned Student Revenue", driverType: "annual_fixed", enabledFor: [] },

  { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", driverType: "percent_of_base", enabledFor: ["tuition_based", "hybrid_mixed"] },

  { id: "state_local_perpupil", category: "public_funding", lineItem: "State / Local Per-Pupil Revenue", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "title_i", category: "public_funding", lineItem: "Title I - Low-Income Students", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "title_ii", category: "public_funding", lineItem: "Title II - Teacher Quality", driverType: "annual_fixed", enabledFor: ["charter_public_funded"] },
  { id: "title_iii", category: "public_funding", lineItem: "Title III - English Learners", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "sped_funding", category: "public_funding", lineItem: "IDEA - Special Education", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "sped_weighted", category: "public_funding", lineItem: "SPED Weighted Funding (State)", driverType: "per_student", enabledFor: [] },
  { id: "ell_weighted", category: "public_funding", lineItem: "ELL Weighted Funding (State)", driverType: "per_student", enabledFor: [] },
  { id: "at_risk_weighted", category: "public_funding", lineItem: "At-Risk Weighted Funding (State)", driverType: "per_student", enabledFor: [] },
  { id: "federal_revenue", category: "public_funding", lineItem: "Other Federal Funding", driverType: "annual_fixed", enabledFor: ["charter_public_funded"] },
  { id: "transportation_funding", category: "public_funding", lineItem: "Transportation Funding", driverType: "annual_fixed", enabledFor: [] },
  { id: "food_reimbursement", category: "public_funding", lineItem: "Food Service Reimbursement", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "other_public_funding", category: "public_funding", lineItem: "Other Public Funding", driverType: "annual_fixed", enabledFor: [] },

  { id: "esa_revenue", category: "school_choice", lineItem: "ESA Revenue", driverType: "per_student", enabledFor: ["hybrid_mixed"] },
  { id: "voucher_revenue", category: "school_choice", lineItem: "Voucher Revenue", driverType: "per_student", enabledFor: [] },
  { id: "scholarship_org", category: "school_choice", lineItem: "Scholarship Organization Revenue", driverType: "per_student", enabledFor: [] },

  { id: "csp_grant", category: "philanthropy", lineItem: "Charter School Program (CSP) Grant", driverType: "annual_fixed", enabledFor: ["charter_public_funded"] },
  { id: "private_scholarships", category: "philanthropy", lineItem: "Private Scholarships", driverType: "annual_fixed", enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "grants", category: "philanthropy", lineItem: "Grants", driverType: "annual_fixed", enabledFor: [] },
  { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", driverType: "annual_fixed", enabledFor: [] },
  { id: "fundraising_events", category: "philanthropy", lineItem: "Fundraising Events", driverType: "annual_fixed", enabledFor: [] },

  { id: "unrestricted_annual_fund", category: "philanthropy", lineItem: "Annual Fund / Unrestricted Giving", driverType: "annual_fixed", enabledFor: [] },
  { id: "unrestricted_board_giving", category: "philanthropy", lineItem: "Board Giving / Board Commitments", driverType: "annual_fixed", enabledFor: [] },
  { id: "unrestricted_individual", category: "philanthropy", lineItem: "Individual Donations", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_capital", category: "philanthropy", lineItem: "Restricted - Capital / Building", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_program", category: "philanthropy", lineItem: "Restricted - Program-Specific", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_scholarship", category: "philanthropy", lineItem: "Restricted - Scholarship / Financial Aid", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_other", category: "philanthropy", lineItem: "Restricted - Other Designated Funds", driverType: "annual_fixed", enabledFor: [] },

  { id: "parish_diocese_subsidy", category: "philanthropy", lineItem: "Parish / Diocese Subsidy", driverType: "annual_fixed", enabledFor: [] },
  { id: "congregation_support", category: "philanthropy", lineItem: "Congregation / Organization Support", driverType: "annual_fixed", enabledFor: [] },

  { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental", driverType: "annual_fixed", enabledFor: [] },
  { id: "partnerships", category: "other_revenue", lineItem: "Partnerships", driverType: "annual_fixed", enabledFor: [] },
  { id: "misc_other", category: "other_revenue", lineItem: "Miscellaneous Other Revenue", driverType: "annual_fixed", enabledFor: [] },
];

export interface FundraisingProfile {
  isCatholic?: boolean;
  isDiocesan?: boolean;
  isFaithAffiliated?: boolean;
  congregationSupport?: boolean;
  doesFundraise?: boolean;
  hasFiscalSponsor?: boolean;
  isNonprofit?: boolean;
}

export function generateDefaultRevenueRows(
  fundingProfile: FundingProfile,
  yearCount: number = 5,
  charterDepositTiming?: CharterDepositTiming,
  options?: {
    isCharter?: boolean;
    openingYear?: number;
    perPupilMidpoint?: number;
    fundraising?: FundraisingProfile;
  }
): RevenueRowData[] {
  const isCharter = options?.isCharter ?? false;
  const fr = options?.fundraising;
  const currentYear = new Date().getFullYear();
  const charterAge = options?.openingYear ? Math.max(0, currentYear - options.openingYear) : Infinity;
  const isCSPEligible = isCharter && charterAge <= 3;

  const CHARTER_NOTES: Record<string, string> = {
    title_i: "Title I: ~$500-$1,100/qualifying low-income student. Enter your projected qualifying student count.",
    title_ii: "Title II: Annual fixed allocation for professional development & teacher quality. Confirm amount with your authorizer.",
    title_iii: "Title III: ~$130/qualifying English Learner student. Enter your projected EL student count.",
    sped_funding: "IDEA: ~$1,500-$2,500/IEP student. Enter your projected IEP student count.",
    sped_weighted: "State-level SPED weighting - varies by state and disability category. Check your state's weighted formula.",
    ell_weighted: "State-level ELL weighting - varies by state. Check your state's weighted formula.",
    at_risk_weighted: "State-level at-risk weighting - varies by state. Check your state's weighted formula.",
  };

  const FAITH_FUNDRAISE_IDS: Record<string, boolean> = {};
  const FAITH_NOTES: Record<string, string> = {};
  if (fr?.isDiocesan) {
    FAITH_FUNDRAISE_IDS["parish_diocese_subsidy"] = true;
    FAITH_NOTES["parish_diocese_subsidy"] = "Annual subsidy from your parish or diocese. Confirm the committed amount with your diocesan office.";
  }
  if (fr?.congregationSupport) {
    FAITH_FUNDRAISE_IDS["congregation_support"] = true;
    FAITH_NOTES["congregation_support"] = "Annual support from your congregation or faith organization. Enter the confirmed or expected commitment.";
  }

  const fundraisingAnswered = fr?.doesFundraise !== undefined;
  const nonprofitFundraiser = fr?.doesFundraise && fr?.isNonprofit;
  const forProfitWithSponsor = fr?.doesFundraise && !fr?.isNonprofit && fr?.hasFiscalSponsor;
  const includePhilanthropy = !fundraisingAnswered || nonprofitFundraiser || forProfitWithSponsor;
  if (includePhilanthropy) {
    FAITH_FUNDRAISE_IDS["grants"] = true;
    FAITH_FUNDRAISE_IDS["donations_fundraising"] = true;
    FAITH_FUNDRAISE_IDS["unrestricted_annual_fund"] = true;
    FAITH_FUNDRAISE_IDS["unrestricted_board_giving"] = true;
  }
  if (nonprofitFundraiser || forProfitWithSponsor) {
    FAITH_FUNDRAISE_IDS["unrestricted_individual"] = true;
    FAITH_FUNDRAISE_IDS["fundraising_events"] = true;
  }

  return LINE_ITEM_CATALOG
    .filter((item) => {
      if (item.enabledFor.includes(fundingProfile)) return true;
      if (item.id === "csp_grant" && isCharter) return true;
      const CHARTER_OPTIONAL_ROWS = ["sped_weighted", "ell_weighted", "at_risk_weighted"];
      if (isCharter && CHARTER_OPTIONAL_ROWS.includes(item.id)) return true;
      if (FAITH_FUNDRAISE_IDS[item.id]) return true;
      return false;
    })
    .map((item) => {
      let amounts = new Array(yearCount).fill(0);
      let note: string | undefined;
      let enabled = true;

      if (item.id === "state_local_perpupil" && options?.perPupilMidpoint) {
        amounts = new Array(yearCount).fill(options.perPupilMidpoint);
        note = "Pre-filled with your state's midpoint estimate. Confirm the exact rate with your authorizer or state agency.";
      }

      if (isCharter && CHARTER_NOTES[item.id]) {
        note = CHARTER_NOTES[item.id];
      }

      if (FAITH_NOTES[item.id]) {
        note = FAITH_NOTES[item.id];
      }

      const CHARTER_DISABLED_OPTIONAL = ["sped_weighted", "ell_weighted", "at_risk_weighted"];
      if (isCharter && CHARTER_DISABLED_OPTIONAL.includes(item.id)) {
        enabled = false;
      }

      if (item.id === "csp_grant" && isCSPEligible) {
        amounts = new Array(yearCount).fill(0);
        const remainingYears = Math.min(3, Math.max(0, 3 - charterAge));
        for (let i = 0; i < remainingYears && i < yearCount; i++) {
          amounts[i] = 150000;
        }
        note = "Federal CSP grants typically $150K/yr for first 3 years. Confirm eligibility with your authorizer.";
      } else if (item.id === "csp_grant" && isCharter && !isCSPEligible) {
        enabled = false;
        note = "CSP grants are typically available only for charter schools in their first 3 years of operation.";
      }

      return {
        id: item.id,
        category: item.category,
        lineItem: item.lineItem,
        enabled,
        driverType: item.driverType,
        amounts,
        ...(item.id === "scholarships_aid" ? { percentBase: "gross_tuition" } : {}),
        ...(note ? { note } : {}),
        ...getTimingDefaults(item.category, fundingProfile, item.id, charterDepositTiming),
      };
    });
}

export const CHARTER_HIDDEN_CATEGORIES: RevenueCategory[] = [
  "tuition_and_fees",
  "tuition_offsets",
  "school_choice",
];

export function getCategoryOrder(fundingProfile: FundingProfile, schoolType?: string): RevenueCategory[] {
  const isCharter = schoolType === "charter_school";
  if (fundingProfile === "charter_public_funded") {
    const order: RevenueCategory[] = [
      "public_funding",
      "philanthropy",
      "school_choice",
      "tuition_and_fees",
      "tuition_offsets",
      "other_revenue",
    ];
    if (isCharter) {
      return order.filter(cat => !CHARTER_HIDDEN_CATEGORIES.includes(cat));
    }
    return order;
  }
  return CATEGORY_ORDER;
}

export function migrateGrantsToPhilanthropy(rows: RevenueRowData[]): RevenueRowData[] {
  return rows.map(r => {
    let updated = r;
    if ((r.category as string) === "grants_contributions") {
      updated = { ...updated, category: "philanthropy" as RevenueCategory };
    }
    if (r.id === "gross_tuition" && r.lineItem === "Gross Tuition") {
      updated = { ...updated, lineItem: "Private Pay / Tuition" };
    }
    return updated;
  });
}

export interface AvailableLineItem {
  id: string;
  category: RevenueCategory;
  lineItem: string;
  driverType: RevenueDriverType;
}

export function getAvailableLineItems(
  category: RevenueCategory,
  existingIds: string[]
): AvailableLineItem[] {
  return LINE_ITEM_CATALOG
    .filter((item) => item.category === category && !existingIds.includes(item.id))
    .map(({ id, category, lineItem, driverType }) => ({ id, category, lineItem, driverType }));
}

export interface SchoolChoiceLineItem {
  id: string;
  category: RevenueCategory;
  lineItem: string;
  driverType: RevenueDriverType;
  defaultAmount: number;
  note?: string;
  statusNote?: string;
}

export function generateSchoolChoiceRows(
  programs: Array<{
    type: string;
    label: string;
    minPerStudent: number;
    maxPerStudent: number;
    status: string;
    optIn?: boolean;
    notes?: string;
  }>,
  yearCount: number = 5,
  fundingProfile: FundingProfile = "tuition_based",
): RevenueRowData[] {
  const PROGRAM_TYPE_TO_ROW_ID: Record<string, string> = {
    esa: "esa_revenue",
    voucher: "voucher_revenue",
    tax_credit_scholarship: "scholarship_org",
    refundable_tax_credit: "refundable_tax_credit",
    individual_tax_credit: "individual_tax_credit",
    federal_tax_credit_sgo: "federal_tax_credit_sgo",
    correspondence_charter: "correspondence_charter",
    private_scholarship: "private_scholarship_revenue",
  };

  const PROGRAM_TYPE_TO_LABEL: Record<string, string> = {
    esa: "ESA Revenue",
    voucher: "Voucher Revenue",
    tax_credit_scholarship: "Tax-Credit Scholarship Revenue",
    refundable_tax_credit: "Refundable Tax Credit",
    individual_tax_credit: "Individual Tax Credit / Deduction",
    federal_tax_credit_sgo: "Federal Tax Credit (SGO)",
    correspondence_charter: "Correspondence / Charter Pathway",
    private_scholarship: "Private Scholarship Revenue",
  };

  return programs
    .filter(p => p.status !== "blocked")
    .map(p => {
      const id = PROGRAM_TYPE_TO_ROW_ID[p.type] || `sc_${p.type}`;
      const defaultAmount = Math.round((p.minPerStudent + p.maxPerStudent) / 2);
      const statusNote = p.status === "litigated" ? " (legal challenge pending)" :
                         p.status === "pending" ? " (not yet launched)" : "";
      const note = p.notes ? `${p.notes}${statusNote}` : statusNote || undefined;

      return {
        id,
        category: "school_choice" as RevenueCategory,
        lineItem: p.type === "private_scholarship" ? p.label : (PROGRAM_TYPE_TO_LABEL[p.type] || p.label),
        enabled: p.status === "active" && !p.optIn,
        driverType: "per_student" as RevenueDriverType,
        amounts: new Array(yearCount).fill(defaultAmount),
        note,
        ...getTimingDefaults("school_choice", fundingProfile),
      };
    });
}
