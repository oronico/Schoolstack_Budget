import { z } from "zod";

export const schoolStageSchema = z.enum(["new_school", "operating_school"], {
  required_error: "Please tell us whether you're planning a new school or already operating",
  invalid_type_error: "Please select a valid school stage",
});
export const fundingProfileSchema = z.enum(["tuition_based", "charter_public_funded", "hybrid_mixed"], {
  required_error: "Please select a funding profile",
  invalid_type_error: "Please select a valid funding profile",
});
export const schoolTypeSchema = z.enum(["charter_school", "homeschool_coop", "learning_pod", "microschool", "private_school", "tutoring_center", "other"], {
  required_error: "Please select the type of school you're building",
  invalid_type_error: "Please select a valid school type",
});
export const entityTypeSchema = z.enum(["sole_practitioner", "llc_single", "llc_partnership", "c_corp", "s_corp", "nonprofit_501c3"], {
  required_error: "Please select your school's legal entity type",
  invalid_type_error: "Please select a valid entity type",
});

export const tuitionTierTypeSchema = z.enum(["full_pay", "staff_discount", "sibling_discount", "high_need_scholarship", "custom"], {
  required_error: "Please select a tier type",
  invalid_type_error: "Please select a valid tier type",
});

export const tuitionTierSchema = z.object({
  id: z.string(),
  tierType: tuitionTierTypeSchema,
  label: z.string(),
  discountPercent: z.coerce.number().min(0).max(100, "Discount percentage can't exceed 100%"),
  studentCounts: z.array(z.coerce.number().min(0)),
});

export const programSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Give this program a name so we can track its enrollment"),
  annualTuition: z.coerce.number().min(0, "Enter an annual tuition amount (even $0 is fine)"),
  priorYear: z.coerce.number().min(0).optional(),
  currentYear: z.coerce.number().min(0).optional(),
  year1: z.coerce.number().min(0).default(0),
  year2: z.coerce.number().min(0).default(0),
  year3: z.coerce.number().min(0).default(0),
  year4: z.coerce.number().min(0).default(0),
  year5: z.coerce.number().min(0).default(0),
});

export const tuitionEscalationSchema = z.object({
  rate: z.coerce.number().min(0).max(20, "Escalation rate can't exceed 20%").default(3),
});

export const revenueSourcesSchema = z.object({
  tuition: z.boolean().default(false),
  publicFunding: z.boolean().default(false),
  schoolChoice: z.boolean().default(false),
  grantsContributions: z.boolean().default(false),
  philanthropy: z.boolean().default(false),
});

export const schoolProfileSchema = z.object({
  schoolName: z.string().min(1, "We'll need your school's name to continue"),
  state: z.string().min(1, "Please select the state where your school is located"),
  schoolType: schoolTypeSchema,
  schoolTypeOther: z.string().optional(),
  entityType: entityTypeSchema,
  ein: z.string().optional(),
  schoolStage: schoolStageSchema,
  fundingProfile: fundingProfileSchema.optional(),
  plannedOpeningYear: z.string().optional(),
  operatingYear: z.enum(["first_year", "second_year_plus"], {
    required_error: "Please tell us how long you've been operating",
    invalid_type_error: "Please select a valid operating year option",
  }).optional(),
  openingYear: z.coerce.number().min(2000, "Enter a valid year (2000 or later)").max(2100, "Enter a valid year (2100 or earlier)").optional(),
  currentStudents: z.coerce.number().min(0).optional(),
  maxCapacity: z.coerce.number().min(1, "Enter your building's maximum student capacity (at least 1)"),
  fiscalYearStartMonth: z.coerce.number().min(1, "Choose a fiscal year start month").max(12, "Month must be between 1 and 12"),
  isPartialFirstYear: z.boolean(),
  year1OperatingMonths: z.coerce.number().min(1, "Your first year needs at least 1 operating month").max(12, "Operating months can't exceed 12"),
  isAccredited: z.boolean().optional(),
  accreditingBody: z.string().optional(),
  hasManagementFee: z.boolean().optional(),
  managementFeePercent: z.coerce.number().min(0).max(100, "Management fee percentage can't exceed 100%").optional(),
  hasBookkeeper: z.boolean().optional().default(false),
  bookkeeperMonthlyCost: z.coerce.number().min(0).optional().default(0),
  hasLawyer: z.boolean().optional().default(false),
  lawyerMonthlyCost: z.coerce.number().min(0).optional().default(0),
  hasGeneralLiabilityInsurance: z.boolean().optional().default(false),
  insuranceCost: z.coerce.number().min(0).optional().default(0),
  hasSavingsAccount: z.boolean().optional().default(false),
  hasBusinessAccount: z.boolean().optional().default(false),
  hasCreditCard: z.boolean().optional().default(false),
  hasLoan: z.boolean().optional().default(false),
  loanAmount: z.coerce.number().min(0).optional().default(0),
  loanRate: z.coerce.number().min(0).max(100, "Interest rate can't exceed 100%").optional().default(0),
  loanTermYears: z.coerce.number().min(0).max(50, "Loan term can't exceed 50 years").optional().default(0),
});

export const priorYearSnapshotSchema = z.object({
  endingEnrollment: z.coerce.number().min(0).optional(),
  totalRevenue: z.coerce.number().min(0).optional(),
  totalExpenses: z.coerce.number().min(0).optional(),
  endingCash: z.coerce.number().min(0).optional(),
});

export const currentYearProjectionSchema = z.object({
  currentEnrollment: z.coerce.number().min(0).optional(),
  projectedRevenue: z.coerce.number().min(0).optional(),
  projectedExpenses: z.coerce.number().min(0).optional(),
  currentCash: z.coerce.number().min(0).optional(),
  monthsCompleted: z.coerce.number().min(0).max(12).optional(),
});

export const enrollmentSchema = z.object({
  year1: z.coerce.number().min(0, "Enter your projected enrollment for Year 1"),
  year2: z.coerce.number().min(0, "Enter your projected enrollment for Year 2"),
  year3: z.coerce.number().min(0, "Enter your projected enrollment for Year 3"),
  year4: z.coerce.number().min(0, "Enter your projected enrollment for Year 4"),
  year5: z.coerce.number().min(0, "Enter your projected enrollment for Year 5"),
});

export const revenueRowSchema = z.object({
  id: z.string(),
  category: z.enum(["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "grants_contributions", "other_revenue"], {
    required_error: "Please select a revenue category",
    invalid_type_error: "Please select a valid revenue category",
  }),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_base"], {
    required_error: "Please select how this revenue is calculated",
    invalid_type_error: "Please select a valid calculation method",
  }),
  amounts: z.array(z.number()),
  percentBase: z.string().optional(),
  escalationRate: z.number().optional(),
  note: z.string().optional(),
  billingMonths: z.union([z.literal(9), z.literal(10), z.literal(12)]).optional(),
  collectionMethod: z.enum(["autopay", "invoiced", "mixed"]).optional(),
  collectionRate: z.number().optional(),
  collectionDelayDays: z.number().optional(),
  paymentFrequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]).optional(),
  paymentTiming: z.enum(["upfront", "arrears"]).optional(),
  disbursementType: z.enum(["direct", "reimbursement"]).optional(),
  reimbursementLagMonths: z.number().optional(),
  grantStatus: z.enum(["confirmed", "projected"]).optional(),
  receiptQuarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

export const revenueSchema = z.object({
  tuitionPerStudent: z.coerce.number().min(0).optional(),
  annualTuitionIncrease: z.coerce.number().min(0).max(100, "Annual tuition increase can't exceed 100%").optional(),
  esaRevenuePerStudent: z.coerce.number().min(0).optional(),
  publicFundingPerStudent: z.coerce.number().min(0).optional(),
  otherRevenuePerStudent: z.coerce.number().min(0).optional(),
  scholarshipRate: z.coerce.number().min(0).max(100, "Scholarship rate can't exceed 100%").optional(),
  annualDonations: z.coerce.number().min(0).optional(),
  foundationGrants: z.coerce.number().min(0).optional(),
  capitalGifts: z.coerce.number().min(0).optional(),
});

export const staffingRowSchema = z.object({
  id: z.string(),
  roleName: z.string(),
  functionCategory: z.enum(["instructional", "school_leadership", "student_support", "operations", "administrative", "other"], {
    required_error: "Please select a function category for this role",
    invalid_type_error: "Please select a valid function category",
  }),
  employmentType: z.enum(["full_time", "part_time", "contract"], {
    required_error: "Please select the employment type",
    invalid_type_error: "Please select a valid employment type",
  }),
  fte: z.number().min(0).max(1, "FTE can't exceed 1.0 (full-time equivalent)"),
  annualizedRate: z.number().min(0),
  benefitsEligible: z.boolean(),
  benefitsRate: z.number().min(0).max(100, "Benefits rate can't exceed 100%"),
  payrollTaxRate: z.number().min(0).max(100, "Payroll tax rate can't exceed 100%"),
  payrollLike: z.boolean(),
  notes: z.string().default(""),
});

export const staffingSchema = z.object({
  studentsPerTeacher: z.coerce.number().min(1, "Enter your target student-to-teacher ratio (at least 1)").optional(),
  teacherSalary: z.coerce.number().min(0).optional(),
  adminStaffCount: z.coerce.number().min(0).optional(),
  adminSalary: z.coerce.number().min(0).optional(),
  founderSalary: z.coerce.number().min(0).optional(),
  benefitsRate: z.coerce.number().min(0).max(100, "Benefits rate can't exceed 100%").optional(),
});

export const expenseRowSchema = z.object({
  id: z.string(),
  category: z.enum(["personnel", "instructional_program", "technology", "occupancy_facility", "administrative_general", "capital_financing"], {
    required_error: "Please select an expense category",
    invalid_type_error: "Please select a valid expense category",
  }),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_revenue"], {
    required_error: "Please select how this expense is calculated",
    invalid_type_error: "Please select a valid calculation method",
  }),
  amounts: z.array(z.number()),
  escalationRate: z.number().optional(),
  note: z.string().default(""),
});

export const capitalDebtRowSchema = z.object({
  id: z.string(),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_revenue"]),
  amounts: z.array(z.number()),
  note: z.string().default(""),
  isLoan: z.boolean().default(false),
  loanPrincipal: z.number().min(0).default(0),
  loanRate: z.number().min(0).max(100, "Interest rate can't exceed 100%").default(0),
  loanTermYears: z.number().min(0).max(50, "Loan term can't exceed 50 years").default(0),
});

export const facilitiesSchema = z.object({
  monthlyRent: z.coerce.number().min(0).optional(),
  annualRentIncrease: z.coerce.number().min(0).max(100, "Rent increase percentage can't exceed 100%").optional(),
  annualUtilities: z.coerce.number().min(0).optional(),
  annualInsurance: z.coerce.number().min(0).optional(),
  facilityMaintenance: z.coerce.number().min(0).optional(),
  curriculumCostPerStudent: z.coerce.number().min(0).optional(),
  techCostPerStudent: z.coerce.number().min(0).optional(),
  annualMarketing: z.coerce.number().min(0).optional(),
  professionalDevelopment: z.coerce.number().min(0).optional(),
  foodServicePerStudent: z.coerce.number().min(0).optional(),
  transportationAnnual: z.coerce.number().min(0).optional(),
  studentServicesAnnual: z.coerce.number().min(0).optional(),
  otherAnnualExpenses: z.coerce.number().min(0).optional(),
  loanAmount: z.coerce.number().min(0).optional(),
  annualInterestRate: z.coerce.number().min(0).max(100, "Interest rate can't exceed 100%").optional(),
  loanTermYears: z.coerce.number().min(0).max(50, "Loan term can't exceed 50 years").optional(),
  annualSalaryIncrease: z.coerce.number().min(0).max(100, "Salary increase can't exceed 100%").optional(),
  generalCostInflation: z.coerce.number().min(0).max(100, "Inflation rate can't exceed 100%").optional(),
});

export const fullModelSchema = z.object({
  schoolProfile: schoolProfileSchema.optional(),
  enrollment: enrollmentSchema.optional(),
  programs: z.array(programSchema).optional(),
  tuitionEscalation: tuitionEscalationSchema.optional(),
  revenueSources: revenueSourcesSchema.optional(),
  tuitionTiers: z.array(tuitionTierSchema).optional(),
  revenue: revenueSchema.optional(),
  revenueRows: z.array(revenueRowSchema).optional(),
  staffing: staffingSchema.optional(),
  staffingRows: z.array(staffingRowSchema).optional(),
  facilities: facilitiesSchema.optional(),
  expenseRows: z.array(expenseRowSchema).optional(),
  capitalAndDebtRows: z.array(capitalDebtRowSchema).optional(),
  priorYearSnapshot: priorYearSnapshotSchema.optional(),
  currentYearProjection: currentYearProjectionSchema.optional(),
});

export type FullModelData = z.infer<typeof fullModelSchema>;
export type SchoolStage = z.infer<typeof schoolStageSchema>;
export type FundingProfile = z.infer<typeof fundingProfileSchema>;
export type SchoolType = z.infer<typeof schoolTypeSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type TuitionTierType = z.infer<typeof tuitionTierTypeSchema>;
export type TuitionTier = z.infer<typeof tuitionTierSchema>;
export type Program = z.infer<typeof programSchema>;
export type TuitionEscalation = z.infer<typeof tuitionEscalationSchema>;

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  sole_practitioner: "Sole Practitioner (no EIN)",
  llc_single: "LLC — Single Member",
  llc_partnership: "LLC — Partnership",
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  nonprofit_501c3: "501(c)(3) Nonprofit",
};

export const SCHOOL_TYPE_LABELS: Record<string, string> = {
  charter_school: "Charter School",
  homeschool_coop: "Homeschool Co-Op",
  learning_pod: "Learning Pod",
  microschool: "Microschool",
  private_school: "Private School",
  tutoring_center: "Tutoring Center",
  other: "Other",
};

export function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

export function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Income" : "Profit";
}

export function profitMarginLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Margin" : "Profit Margin";
}

export function cumulativeProfitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Cumulative Net Income" : "Cumulative Profit";
}

export const TUITION_TIER_LABELS: Record<string, string> = {
  full_pay: "Full Pay",
  staff_discount: "Staff Discount",
  sibling_discount: "Sibling Discount",
  high_need_scholarship: "High Need / Scholarship",
  custom: "Custom Tier",
};

export function isCharterSchool(schoolType?: string): boolean {
  return schoolType === "charter_school";
}

export function isPrivateSchool(schoolType?: string): boolean {
  return schoolType === "private_school";
}

export function getDefaultTuitionTiers(yearCount: number): TuitionTier[] {
  return [
    { id: "tier_full_pay", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_staff", tierType: "staff_discount", label: "Staff Discount", discountPercent: 50, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_sibling", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 10, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_high_need", tierType: "high_need_scholarship", label: "High Need / Scholarship", discountPercent: 100, studentCounts: new Array(yearCount).fill(0) },
  ];
}
