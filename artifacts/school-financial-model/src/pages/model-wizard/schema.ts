import { z } from "zod";

export const schoolStageSchema = z.enum(["new_school", "operating_school"]);
export const fundingProfileSchema = z.enum(["tuition_based", "charter_public_funded", "hybrid_mixed"]);
export const schoolTypeSchema = z.enum(["charter_school", "homeschool_coop", "learning_pod", "microschool", "private_school", "tutoring_center", "other"]);
export const entityTypeSchema = z.enum(["sole_practitioner", "llc_single", "llc_partnership", "c_corp", "s_corp", "nonprofit_501c3"]);

export const schoolProfileSchema = z.object({
  schoolName: z.string().min(1, "School name is required"),
  state: z.string().min(1, "State is required"),
  schoolType: schoolTypeSchema,
  schoolTypeOther: z.string().optional(),
  entityType: entityTypeSchema,
  ein: z.string().optional(),
  schoolStage: schoolStageSchema,
  fundingProfile: fundingProfileSchema,
  openingYear: z.coerce.number().min(2000).max(2100),
  currentStudents: z.coerce.number().min(0),
  maxCapacity: z.coerce.number().min(1, "Capacity must be at least 1"),
  fiscalYearStartMonth: z.coerce.number().min(1).max(12),
  isPartialFirstYear: z.boolean(),
  year1OperatingMonths: z.coerce.number().min(1).max(12),
});

export const priorYearSnapshotSchema = z.object({
  endingEnrollment: z.coerce.number().min(0).optional(),
  totalRevenue: z.coerce.number().min(0).optional(),
  totalExpenses: z.coerce.number().min(0).optional(),
  endingCash: z.coerce.number().min(0).optional(),
});

export const enrollmentSchema = z.object({
  year1: z.coerce.number().min(0, "Required"),
  year2: z.coerce.number().min(0, "Required"),
  year3: z.coerce.number().min(0, "Required"),
  year4: z.coerce.number().min(0, "Required").optional(),
  year5: z.coerce.number().min(0, "Required").optional(),
});

export const revenueRowSchema = z.object({
  id: z.string(),
  category: z.enum(["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "grants_contributions", "other_revenue"]),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_base"]),
  amounts: z.array(z.number()),
  percentBase: z.string().optional(),
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
  annualTuitionIncrease: z.coerce.number().min(0).max(100).optional(),
  esaRevenuePerStudent: z.coerce.number().min(0).optional(),
  publicFundingPerStudent: z.coerce.number().min(0).optional(),
  otherRevenuePerStudent: z.coerce.number().min(0).optional(),
  scholarshipRate: z.coerce.number().min(0).max(100).optional(),
  annualDonations: z.coerce.number().min(0).optional(),
  foundationGrants: z.coerce.number().min(0).optional(),
  capitalGifts: z.coerce.number().min(0).optional(),
});

export const staffingRowSchema = z.object({
  id: z.string(),
  roleName: z.string(),
  functionCategory: z.enum(["instructional", "school_leadership", "student_support", "operations", "administrative", "other"]),
  employmentType: z.enum(["full_time", "part_time", "contract"]),
  fte: z.number().min(0).max(1),
  annualizedRate: z.number().min(0),
  benefitsEligible: z.boolean(),
  benefitsRate: z.number().min(0).max(100),
  payrollTaxRate: z.number().min(0).max(100),
  payrollLike: z.boolean(),
  notes: z.string().default(""),
});

export const staffingSchema = z.object({
  studentsPerTeacher: z.coerce.number().min(1, "Must be at least 1").optional(),
  teacherSalary: z.coerce.number().min(0).optional(),
  adminStaffCount: z.coerce.number().min(0).optional(),
  adminSalary: z.coerce.number().min(0).optional(),
  founderSalary: z.coerce.number().min(0).optional(),
  benefitsRate: z.coerce.number().min(0).max(100).optional(),
});

export const expenseRowSchema = z.object({
  id: z.string(),
  category: z.enum(["personnel", "instructional_program", "technology", "occupancy_facility", "administrative_general", "capital_financing"]),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_revenue"]),
  amounts: z.array(z.number()),
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
  loanRate: z.number().min(0).max(100).default(0),
  loanTermYears: z.number().min(0).max(50).default(0),
});

export const facilitiesSchema = z.object({
  monthlyRent: z.coerce.number().min(0).optional(),
  annualRentIncrease: z.coerce.number().min(0).max(100).optional(),
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
  annualInterestRate: z.coerce.number().min(0).max(100).optional(),
  loanTermYears: z.coerce.number().min(0).max(50).optional(),
  annualSalaryIncrease: z.coerce.number().min(0).max(100).optional(),
  generalCostInflation: z.coerce.number().min(0).max(100).optional(),
});

export const fullModelSchema = z.object({
  schoolProfile: schoolProfileSchema.optional(),
  enrollment: enrollmentSchema.optional(),
  revenue: revenueSchema.optional(),
  revenueRows: z.array(revenueRowSchema).optional(),
  staffing: staffingSchema.optional(),
  staffingRows: z.array(staffingRowSchema).optional(),
  facilities: facilitiesSchema.optional(),
  expenseRows: z.array(expenseRowSchema).optional(),
  capitalAndDebtRows: z.array(capitalDebtRowSchema).optional(),
  priorYearSnapshot: priorYearSnapshotSchema.optional(),
});

export type FullModelData = z.infer<typeof fullModelSchema>;
export type SchoolStage = z.infer<typeof schoolStageSchema>;
export type FundingProfile = z.infer<typeof fundingProfileSchema>;
export type SchoolType = z.infer<typeof schoolTypeSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;

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
