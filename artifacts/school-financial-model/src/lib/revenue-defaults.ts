export type RevenueCategory =
  | "tuition_and_fees"
  | "tuition_offsets"
  | "public_funding"
  | "school_choice"
  | "grants_contributions"
  | "other_revenue";

export type RevenueDriverType = "annual_fixed" | "monthly" | "per_student" | "percent_of_base";

export type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

export interface RevenueRowData {
  id: string;
  category: RevenueCategory;
  lineItem: string;
  enabled: boolean;
  driverType: RevenueDriverType;
  amounts: number[];
  percentBase?: string;
  note?: string;
}

export const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  grants_contributions: "Grants, Contributions & Other Support",
  other_revenue: "Other Revenue",
};

export const CATEGORY_ORDER: RevenueCategory[] = [
  "tuition_and_fees",
  "tuition_offsets",
  "public_funding",
  "school_choice",
  "grants_contributions",
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

const ALL_PROFILES: FundingProfile[] = ["tuition_based", "charter_public_funded", "hybrid_mixed"];

const LINE_ITEM_CATALOG: LineItemDef[] = [
  { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Gross Tuition", driverType: "per_student", enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", driverType: "per_student", enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "student_fees", category: "tuition_and_fees", lineItem: "Student Fees", driverType: "per_student", enabledFor: [] },
  { id: "aftercare", category: "tuition_and_fees", lineItem: "Aftercare / Extended Day", driverType: "annual_fixed", enabledFor: [] },
  { id: "summer_program", category: "tuition_and_fees", lineItem: "Summer Program Revenue", driverType: "annual_fixed", enabledFor: [] },
  { id: "other_student_revenue", category: "tuition_and_fees", lineItem: "Other Earned Student Revenue", driverType: "annual_fixed", enabledFor: [] },

  { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", driverType: "percent_of_base", enabledFor: ["tuition_based", "hybrid_mixed"] },

  { id: "state_local_perpupil", category: "public_funding", lineItem: "State / Local Per-Pupil Revenue", driverType: "per_student", enabledFor: ["charter_public_funded", "hybrid_mixed"] },
  { id: "federal_revenue", category: "public_funding", lineItem: "Federal Revenue", driverType: "annual_fixed", enabledFor: ["charter_public_funded"] },
  { id: "sped_funding", category: "public_funding", lineItem: "Special Education Funding", driverType: "annual_fixed", enabledFor: [] },
  { id: "transportation_funding", category: "public_funding", lineItem: "Transportation Funding", driverType: "annual_fixed", enabledFor: [] },
  { id: "food_reimbursement", category: "public_funding", lineItem: "Food Service Reimbursement", driverType: "per_student", enabledFor: ["charter_public_funded"] },
  { id: "other_public_funding", category: "public_funding", lineItem: "Other Public Funding", driverType: "annual_fixed", enabledFor: [] },

  { id: "esa_revenue", category: "school_choice", lineItem: "ESA Revenue", driverType: "per_student", enabledFor: ["hybrid_mixed"] },
  { id: "voucher_revenue", category: "school_choice", lineItem: "Voucher Revenue", driverType: "per_student", enabledFor: [] },
  { id: "scholarship_org", category: "school_choice", lineItem: "Scholarship Organization Revenue", driverType: "per_student", enabledFor: [] },

  { id: "grants", category: "grants_contributions", lineItem: "Grants", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "donations_fundraising", category: "grants_contributions", lineItem: "Donations / Fundraising", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "philanthropy_other", category: "grants_contributions", lineItem: "Philanthropy / Other Contributions", driverType: "annual_fixed", enabledFor: [] },

  { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental", driverType: "annual_fixed", enabledFor: [] },
  { id: "partnerships", category: "other_revenue", lineItem: "Partnerships", driverType: "annual_fixed", enabledFor: [] },
  { id: "misc_other", category: "other_revenue", lineItem: "Miscellaneous Other Revenue", driverType: "annual_fixed", enabledFor: [] },
];

export function generateDefaultRevenueRows(
  fundingProfile: FundingProfile,
  yearCount: number = 5
): RevenueRowData[] {
  return LINE_ITEM_CATALOG
    .filter((item) => item.enabledFor.includes(fundingProfile))
    .map((item) => ({
      id: item.id,
      category: item.category,
      lineItem: item.lineItem,
      enabled: true,
      driverType: item.driverType,
      amounts: new Array(yearCount).fill(0),
      ...(item.id === "scholarships_aid" ? { percentBase: "gross_tuition" } : {}),
    }));
}

export function getCategoryOrder(fundingProfile: FundingProfile): RevenueCategory[] {
  if (fundingProfile === "charter_public_funded") {
    return [
      "public_funding",
      "grants_contributions",
      "school_choice",
      "tuition_and_fees",
      "tuition_offsets",
      "other_revenue",
    ];
  }
  return CATEGORY_ORDER;
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
