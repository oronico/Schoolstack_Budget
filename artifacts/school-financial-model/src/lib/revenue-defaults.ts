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

export const GRADE_BAND_LABELS: Record<string, string> = {
  k5: "K-5 (Elementary)",
  m68: "6-8 (Middle)",
  h912: "9-12 (High)",
};

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
        collectionRate: 100,
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
      };
    }
    case "school_choice":
      return {
        disbursementType: "direct",
        reimbursementLagMonths: 2,
      };
    case "philanthropy":
      return {
        grantStatus: "projected",
        receiptQuarter: 1,
      };
    case "other_revenue":
      return {};
    default:
      return {};
  }
}

export function computeMonthlyCashInflow(
  rows: RevenueRowData[],
  yearIndex: number = 0,
  students: number = 0
): number[] {
  const monthly = new Array(12).fill(0);

  const rowValues = new Map<string, number>();
  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;
    const base = row.amounts?.[yearIndex] ?? 0;
    let val = 0;
    switch (row.driverType) {
      case "monthly": val = base * 12; break;
      case "per_student": val = base * students; break;
      case "annual_fixed": val = base; break;
      default: val = base;
    }
    rowValues.set(row.id, val);
  }

  for (const row of rows) {
    if (!row.enabled || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase ?? "") ?? 0;
    const percentage = (row.amounts?.[yearIndex] ?? 0) / 100;
    rowValues.set(row.id, baseVal * percentage);
  }

  for (const row of rows) {
    if (!row.enabled) continue;
    const annualAmount = rowValues.get(row.id) ?? 0;
    if (annualAmount === 0) continue;

    const category = row.category;

    if (category === "tuition_and_fees" || category === "tuition_offsets") {
      const isTuition = row.id === "gross_tuition" || category === "tuition_offsets";
      if (isTuition) {
        const billingMonths = row.billingMonths ?? 10;
        const collectionRate = (row.collectionMethod === "invoiced" || row.collectionMethod === "mixed")
          ? (row.collectionRate ?? 95) / 100
          : 1;
        const delayDays = (row.collectionMethod === "invoiced" || row.collectionMethod === "mixed")
          ? (row.collectionDelayDays ?? 0)
          : 0;
        const delayMonths = Math.floor(delayDays / 30);
        const effectiveAmount = category === "tuition_offsets" ? -annualAmount : annualAmount;
        const adjustedAmount = effectiveAmount * collectionRate;
        const perMonth = adjustedAmount / billingMonths;
        const startMonth = (billingMonths === 12 ? 0 : 1) + delayMonths;
        for (let i = startMonth; i < startMonth + billingMonths && i < 12; i++) {
          monthly[i] += perMonth;
        }
      } else {
        monthly[0] += annualAmount;
      }
    } else if (category === "public_funding") {
      const freq = row.paymentFrequency ?? "monthly";
      const timing = row.paymentTiming ?? "upfront";
      if (freq === "monthly") {
        const perMonth = annualAmount / 12;
        if (timing === "arrears") {
          for (let i = 1; i < 12; i++) monthly[i] += perMonth;
          monthly[0] += 0;
        } else {
          for (let i = 0; i < 12; i++) monthly[i] += perMonth;
        }
      } else if (freq === "quarterly") {
        const perPayment = annualAmount / 4;
        const months = timing === "arrears" ? [2, 5, 8, 11] : [0, 3, 6, 9];
        months.forEach(m => { monthly[m] += perPayment; });
      } else if (freq === "semi_annual") {
        const perPayment = annualAmount / 2;
        const months = timing === "arrears" ? [5, 11] : [0, 6];
        months.forEach(m => { monthly[m] += perPayment; });
      } else if (freq === "annual") {
        const month = timing === "arrears" ? 11 : 0;
        monthly[month] += annualAmount;
      }
    } else if (category === "school_choice") {
      const disbType = row.disbursementType ?? "direct";
      if (disbType === "direct") {
        const perQuarter = annualAmount / 4;
        [0, 3, 6, 9].forEach(m => { monthly[m] += perQuarter; });
      } else {
        const lagMonths = row.reimbursementLagMonths ?? 2;
        const perMonth = annualAmount / 12;
        for (let i = lagMonths; i < 12; i++) {
          monthly[i] += perMonth;
        }
        if (lagMonths > 0 && lagMonths < 12) {
          const deferred = perMonth * lagMonths;
          const remainingMonths = 12 - lagMonths;
          for (let i = lagMonths; i < 12; i++) {
            monthly[i] += deferred / remainingMonths;
          }
        }
      }
    } else if (category === "philanthropy" || (category as string) === "grants_contributions") {
      const quarter = row.receiptQuarter ?? 1;
      const startMonth = (quarter - 1) * 3;
      monthly[startMonth] += annualAmount;
    } else {
      const perMonth = annualAmount / 12;
      for (let i = 0; i < 12; i++) monthly[i] += perMonth;
    }
  }

  return monthly;
}

export const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
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

  { id: "grants", category: "philanthropy", lineItem: "Grants", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "fundraising_events", category: "philanthropy", lineItem: "Fundraising Events", driverType: "annual_fixed", enabledFor: [] },

  { id: "unrestricted_annual_fund", category: "philanthropy", lineItem: "Annual Fund / Unrestricted Giving", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "unrestricted_board_giving", category: "philanthropy", lineItem: "Board Giving / Board Commitments", driverType: "annual_fixed", enabledFor: ALL_PROFILES },
  { id: "unrestricted_individual", category: "philanthropy", lineItem: "Individual Donations", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_capital", category: "philanthropy", lineItem: "Restricted - Capital / Building", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_program", category: "philanthropy", lineItem: "Restricted - Program-Specific", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_scholarship", category: "philanthropy", lineItem: "Restricted - Scholarship / Financial Aid", driverType: "annual_fixed", enabledFor: [] },
  { id: "restricted_other", category: "philanthropy", lineItem: "Restricted - Other Designated Funds", driverType: "annual_fixed", enabledFor: [] },

  { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental", driverType: "annual_fixed", enabledFor: [] },
  { id: "partnerships", category: "other_revenue", lineItem: "Partnerships", driverType: "annual_fixed", enabledFor: [] },
  { id: "misc_other", category: "other_revenue", lineItem: "Miscellaneous Other Revenue", driverType: "annual_fixed", enabledFor: [] },
];

export function generateDefaultRevenueRows(
  fundingProfile: FundingProfile,
  yearCount: number = 5,
  charterDepositTiming?: CharterDepositTiming
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
      ...getTimingDefaults(item.category, fundingProfile, item.id, charterDepositTiming),
    }));
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
    if ((r.category as string) === "grants_contributions") {
      return { ...r, category: "philanthropy" as RevenueCategory };
    }
    return r;
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
