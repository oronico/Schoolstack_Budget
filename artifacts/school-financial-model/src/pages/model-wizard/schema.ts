import { z } from "zod";
import { BENCHMARK_DSCR_GREEN } from "@workspace/finance";

const numMsg = (field: string) => ({
  invalid_type_error: `Please enter a valid number for ${field}`,
  required_error: `Please enter a value for ${field}`,
});

export const schoolStageSchema = z.enum(["new_school", "operating_school"], {
  required_error: "Please tell us whether you're planning a new school or already operating",
  invalid_type_error: "Please select a valid school stage",
});
export const fundingProfileSchema = z.enum(["tuition_based", "charter_public_funded", "hybrid_mixed"], {
  required_error: "Please select a funding profile",
  invalid_type_error: "Please select a valid funding profile",
});
export const schoolTypeSchema = z.enum(["catholic_school", "charter_school", "homeschool_coop", "learning_pod", "microschool", "private_school", "tutoring_center", "other"], {
  required_error: "Please select the type of school you're building",
  invalid_type_error: "Please select a valid school type",
});
export const entityTypeSchema = z.enum(["sole_practitioner", "llc_single", "llc_partnership", "c_corp", "s_corp", "nonprofit_501c3", "undetermined"], {
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
  discountPercent: z.coerce.number(numMsg("discount")).min(0, "Please enter a discount of 0% or higher").max(100, "Discount percentage can't exceed 100%"),
  studentCounts: z.array(z.coerce.number(numMsg("student count")).min(0, "Please enter a positive number")),
});

export const programSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Give this program a name so we can track its enrollment"),
  annualTuition: z.coerce.number(numMsg("tuition")).min(0, "Enter an annual tuition amount (even $0 is fine)"),
  priorYear: z.coerce.number(numMsg("prior year enrollment")).min(0, "Please enter a positive number for enrollment").optional(),
  currentYear: z.coerce.number(numMsg("current year enrollment")).min(0, "Please enter a positive number for enrollment").optional(),
  year1: z.coerce.number(numMsg("Year 1 enrollment")).min(0, "Please enter a positive number for enrollment").default(0),
  year2: z.coerce.number(numMsg("Year 2 enrollment")).min(0, "Please enter a positive number for enrollment").default(0),
  year3: z.coerce.number(numMsg("Year 3 enrollment")).min(0, "Please enter a positive number for enrollment").default(0),
  year4: z.coerce.number(numMsg("Year 4 enrollment")).min(0, "Please enter a positive number for enrollment").default(0),
  year5: z.coerce.number(numMsg("Year 5 enrollment")).min(0, "Please enter a positive number for enrollment").default(0),
});

export const tuitionEscalationSchema = z.object({
  rate: z.coerce.number(numMsg("escalation rate")).min(0, "Please enter a rate of 0% or higher").max(20, "Escalation rate can't exceed 20%").default(3),
});

export const revenueSourcesSchema = z.object({
  tuition: z.boolean().default(false),
  publicFunding: z.boolean().default(false),
  schoolChoice: z.boolean().default(false),
  philanthropy: z.boolean().default(false),
});

export const lendingLabIntentSchema = z.enum(["plan_to_apply", "want_to_understand", "budget_only"], {
  required_error: "Please let us know your intent",
  invalid_type_error: "Please select an option",
}).optional();

export const ownershipTypeSchema = z.enum(["own", "rent", "donated", "home_based"], {
  required_error: "Please tell us about your facility arrangement",
  invalid_type_error: "Please select a valid facility arrangement",
});

export const facilityPhaseSchema = z.object({
  id: z.string(),
  ownershipType: ownershipTypeSchema,
  startYear: z.coerce.number().min(1).max(5).default(1),
  endYear: z.coerce.number().min(1).max(5).default(5),
  monthlyRent: z.coerce.number().min(0).optional().default(0),
  annualRentEscalation: z.coerce.number().min(0).max(100).optional().default(3),
  postLeaseRenewalBump: z.coerce.number().min(0).max(100).optional().default(15),
  leaseExpirationMonth: z.coerce.number().min(1).max(12).optional(),
  leaseExpirationYear: z.coerce.number().min(2024).max(2050).optional(),
  isNNNLease: z.boolean().optional().default(false),
  nnnCamCharges: z.coerce.number().min(0).optional().default(0),
  nnnMaintenance: z.coerce.number().min(0).optional().default(0),
  nnnUtilities: z.coerce.number().min(0).optional().default(0),
  propertyTaxAnnual: z.coerce.number().min(0).optional().default(0),
  hasMortgage: z.boolean().optional().default(false),
  mortgageMonthlyPayment: z.coerce.number().min(0).optional().default(0),
  facilityArrangementEndDate: z.string().optional(),
  comparableMarketRent: z.coerce.number().min(0).optional().default(0),
  hasWrittenAgreement: z.boolean().optional().default(false),
  monthlyFacilityAllocation: z.coerce.number().min(0).optional().default(0),
  squareFootage: z.coerce.number(numMsg("square footage")).min(0).optional(),
  hasRenewalOption: z.boolean().optional().default(false),
}).refine(d => d.startYear <= d.endYear, {
  message: "Start year must be before or equal to end year",
  path: ["endYear"],
});

export const facilityPhasesArraySchema = z.array(facilityPhaseSchema).optional().superRefine((phases, ctx) => {
  if (!phases || phases.length <= 1) return;
  const indexed = phases.map((p, originalIndex) => ({ p, originalIndex }));
  indexed.sort((a, b) => a.p.startYear - b.p.startYear);
  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i].p.startYear <= indexed[i - 1].p.endYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Phase overlaps with an adjacent phase`,
        path: [indexed[i].originalIndex, "startYear"],
      });
    }
  }
});

export const schoolProfileSchema = z.object({
  schoolName: z.string().min(1, "We'll need your school's name to continue"),
  state: z.string().min(1, "Please select the state where your school is located"),
  schoolType: schoolTypeSchema,
  schoolTypeOther: z.string().optional(),
  entityType: entityTypeSchema,
  ein: z.string().optional(),
  website: z.string().optional(),
  schoolStage: schoolStageSchema,
  fundingProfile: fundingProfileSchema.optional(),
  plannedOpeningYear: z.string().optional(),
  operatingYear: z.enum(["first_year", "second_year_plus"], {
    required_error: "Please tell us how long you've been operating",
    invalid_type_error: "Please select a valid operating year option",
  }).optional(),
  openingYear: z.coerce.number(numMsg("opening year")).min(2000, "Enter a valid year (2000 or later)").max(2100, "Enter a valid year (2100 or earlier)").optional(),
  currentStudents: z.coerce.number(numMsg("current students")).min(0, "Please enter a positive number for students").optional(),
  maxCapacity: z.coerce.number(numMsg("capacity")).min(1, "Enter your building's maximum student capacity (at least 1)"),
  fiscalYearStartMonth: z.coerce.number(numMsg("fiscal year start month")).min(1, "Choose a fiscal year start month").max(12, "Month must be between 1 and 12"),
  isPartialFirstYear: z.boolean(),
  year1OperatingMonths: z.coerce.number(numMsg("operating months")).min(1, "Your first year needs at least 1 operating month").max(12, "Operating months can't exceed 12"),
  isAccredited: z.boolean().optional(),
  accreditingBody: z.string().optional(),
  hasManagementFee: z.boolean().optional(),
  managementFeePercent: z.coerce.number(numMsg("management fee")).min(0, "Please enter a percentage of 0% or higher").max(100, "Management fee percentage can't exceed 100%").optional(),
  locationSecured: z.boolean().optional().default(false),
  facilityStreet: z.string().optional(),
  facilityCity: z.string().optional(),
  facilityState: z.string().optional(),
  facilityZip: z.string().optional(),
  ownershipType: ownershipTypeSchema.optional(),
  propertyTaxAnnual: z.coerce.number(numMsg("property tax")).min(0, "Please enter a positive property tax amount").optional().default(0),
  hasMortgage: z.boolean().optional().default(false),
  mortgageMonthlyPayment: z.coerce.number(numMsg("mortgage payment")).min(0, "Please enter a positive mortgage amount").optional().default(0),
  leaseExpirationMonth: z.coerce.number(numMsg("lease expiration month")).min(1, "Choose a month").max(12, "Month must be between 1 and 12").optional(),
  leaseExpirationYear: z.coerce.number(numMsg("lease expiration year")).min(2024, "Enter a valid year (2024 or later)").max(2050, "Enter a valid year (2050 or earlier)").optional(),
  monthlyRent: z.coerce.number(numMsg("monthly rent")).min(0, "Please enter a positive rent amount").optional().default(0),
  annualRentEscalation: z.coerce.number(numMsg("rent escalation")).min(0, "Please enter a rate of 0% or higher").max(100, "Escalation rate can't exceed 100%").optional().default(3),
  postLeaseRenewalBump: z.coerce.number(numMsg("post-lease renewal bump")).min(0, "Please enter a rate of 0% or higher").max(100, "Renewal bump can't exceed 100%").optional().default(15),
  isNNNLease: z.boolean().optional().default(false),
  nnnCamCharges: z.coerce.number(numMsg("CAM charges")).min(0, "Please enter a positive CAM amount").optional().default(0),
  nnnMaintenance: z.coerce.number(numMsg("NNN maintenance")).min(0, "Please enter a positive maintenance amount").optional().default(0),
  nnnUtilities: z.coerce.number(numMsg("NNN utilities")).min(0, "Please enter a positive utilities amount").optional().default(0),
  estimatedMonthlyFacilityBudget: z.coerce.number(numMsg("estimated facility budget")).min(0, "Please enter a positive monthly amount").optional().default(0),
  facilityArrangementEndDate: z.string().optional(),
  comparableMarketRent: z.coerce.number(numMsg("comparable market rent")).min(0, "Please enter a positive amount").optional().default(0),
  hasWrittenAgreement: z.boolean().optional().default(false),
  monthlyFacilityAllocation: z.coerce.number(numMsg("monthly facility allocation")).min(0, "Please enter a positive amount").optional().default(0),
  hasBookkeeper: z.boolean().optional().default(false),
  bookkeeperMonthlyCost: z.coerce.number(numMsg("bookkeeper cost")).min(0, "Please enter a positive dollar amount").optional().default(0),
  hasLawyer: z.boolean().optional().default(false),
  lawyerMonthlyCost: z.coerce.number(numMsg("lawyer cost")).min(0, "Please enter a positive dollar amount").optional().default(0),
  hasGeneralLiabilityInsurance: z.boolean().optional().default(false),
  insuranceCost: z.coerce.number(numMsg("insurance cost")).min(0, "Please enter a positive dollar amount").optional().default(0),
  hasSavingsAccount: z.boolean().optional().default(false),
  hasBusinessAccount: z.boolean().optional().default(false),
  hasCreditCard: z.boolean().optional().default(false),
  hasLoan: z.boolean().optional().default(false),
  loanAmount: z.coerce.number(numMsg("loan amount")).min(0, "Please enter a positive loan amount").optional().default(0),
  loanRate: z.coerce.number(numMsg("interest rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Interest rate can't exceed 100%").optional().default(0),
  loanTermYears: z.coerce.number(numMsg("loan term")).min(0, "Please enter a positive loan term").max(50, "Loan term can't exceed 50 years").optional().default(0),
  lendingLabIntent: lendingLabIntentSchema,
  debtIncluded: z.boolean().optional().default(true),
  gradeBandEnrollment: z.object({
    k5: z.array(z.coerce.number().min(0)).default([0, 0, 0, 0, 0]),
    m68: z.array(z.coerce.number().min(0)).default([0, 0, 0, 0, 0]),
    h912: z.array(z.coerce.number().min(0)).default([0, 0, 0, 0, 0]),
  }).optional(),
  gradeBandPerPupil: z.object({
    k5: z.coerce.number().min(0).default(0),
    m68: z.coerce.number().min(0).default(0),
    h912: z.coerce.number().min(0).default(0),
  }).optional(),
  enrollmentRevenueMethod: z.enum(["count_days", "adm", "ada"]).optional(),
  charterDepositTiming: z.enum(["monthly", "quarterly", "semi_annual", "annual"]).optional(),
  priorYearADM: z.coerce.number().min(0).optional(),
  priorYearADA: z.coerce.number().min(0).optional(),
  spedCount: z.array(z.coerce.number().min(0)).optional(),
  ellCount: z.array(z.coerce.number().min(0)).optional(),
  ecoDisCount: z.array(z.coerce.number().min(0)).optional(),
  enrollmentGrowthRate: z.coerce.number().min(-100).max(100).optional(),
  schoolFteCount: z.coerce.number().min(0).optional(),
  newFteCount: z.coerce.number().min(0).optional(),
  stateFundingMethodology: z.enum(["ada", "adm", "single_count_day", "multiple_count_dates", "single_count_period", "multiple_count_periods", "other"]).optional(),
  accountingBasis: z.enum(["cash", "accrual", "not_sure"]).optional(),
  facilityPhases: facilityPhasesArraySchema,
  isDiocesan: z.boolean().optional(),
  isFaithAffiliated: z.boolean().optional(),
  congregationSupport: z.boolean().optional(),
  congregationAssessment: z.boolean().optional(),
  doesFundraise: z.boolean().optional(),
  hasFiscalSponsor: z.boolean().optional(),
  fiscalSponsorName: z.string().optional(),
  fiscalSponsorInterest: z.boolean().optional(),
});

export const priorYearSnapshotSchema = z.object({
  endingEnrollment: z.coerce.number(numMsg("ending enrollment")).min(0, "Please enter a positive number for enrollment").optional(),
  totalRevenue: z.coerce.number(numMsg("total revenue")).min(0, "Please enter a positive revenue amount").optional(),
  totalExpenses: z.coerce.number(numMsg("total expenses")).min(0, "Please enter a positive expense amount").optional(),
  endingCash: z.coerce.number(numMsg("ending cash")).min(0, "Please enter a positive cash balance").optional(),
  tuitionRevenue: z.coerce.number(numMsg("tuition revenue")).min(0).optional(),
  publicFundingRevenue: z.coerce.number(numMsg("public funding revenue")).min(0).optional(),
  philanthropyRevenue: z.coerce.number(numMsg("philanthropy revenue")).min(0).optional(),
  otherRevenue: z.coerce.number(numMsg("other revenue")).min(0).optional(),
  personnelExpenses: z.coerce.number(numMsg("personnel expenses")).min(0).optional(),
  facilityExpenses: z.coerce.number(numMsg("facility expenses")).min(0).optional(),
  instructionalExpenses: z.coerce.number(numMsg("instructional expenses")).min(0).optional(),
  adminExpenses: z.coerce.number(numMsg("admin expenses")).min(0).optional(),
});

export const currentYearProjectionSchema = z.object({
  currentEnrollment: z.coerce.number(numMsg("current enrollment")).min(0, "Please enter a positive number for enrollment").optional(),
  projectedRevenue: z.coerce.number(numMsg("projected revenue")).min(0, "Please enter a positive revenue amount").optional(),
  projectedExpenses: z.coerce.number(numMsg("projected expenses")).min(0, "Please enter a positive expense amount").optional(),
  currentCash: z.coerce.number(numMsg("current cash")).min(0, "Please enter a positive cash balance").optional(),
  monthsCompleted: z.coerce.number(numMsg("months completed")).min(0, "Please enter 0 or more months").max(12, "Months completed can't exceed 12").optional(),
});

export const enrollmentSchema = z.object({
  year1: z.coerce.number(numMsg("Year 1 enrollment")).min(0, "Enter your projected enrollment for Year 1"),
  year2: z.coerce.number(numMsg("Year 2 enrollment")).min(0, "Enter your projected enrollment for Year 2"),
  year3: z.coerce.number(numMsg("Year 3 enrollment")).min(0, "Enter your projected enrollment for Year 3"),
  year4: z.coerce.number(numMsg("Year 4 enrollment")).min(0, "Enter your projected enrollment for Year 4"),
  year5: z.coerce.number(numMsg("Year 5 enrollment")).min(0, "Enter your projected enrollment for Year 5"),
  retentionRate: z.coerce.number(numMsg("retention rate")).min(0, "Retention rate must be 0% or higher").max(100, "Retention rate can't exceed 100%").optional(),
  applicationsReceived: z.coerce.number(numMsg("applications received")).min(0, "Please enter a positive number").optional(),
  waitlistCount: z.coerce.number(numMsg("waitlist count")).min(0, "Please enter a positive number").optional(),
});

export const revenueRowSchema = z.object({
  id: z.string(),
  category: z.enum(["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "grants_contributions", "philanthropy", "other_revenue"], {
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
  escalationRateOverridden: z.boolean().optional(),
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
  timingOverridden: z.boolean().optional(),
});

export const revenueDefaultsSchema = z.object({
  billingMonths: z.union([z.literal(9), z.literal(10), z.literal(12)]).optional().default(10),
  collectionMethod: z.enum(["autopay", "invoiced", "mixed"]).optional().default("autopay"),
  collectionRate: z.coerce.number().min(0).max(100).optional().default(100),
  collectionDelayDays: z.coerce.number().min(0).max(90).optional().default(0),
});

export const revenueSchema = z.object({
  tuitionPerStudent: z.coerce.number(numMsg("tuition per student")).min(0, "Please enter a positive tuition amount").optional(),
  annualTuitionIncrease: z.coerce.number(numMsg("tuition increase")).min(0, "Please enter a rate of 0% or higher").max(100, "Annual tuition increase can't exceed 100%").optional(),
  esaRevenuePerStudent: z.coerce.number(numMsg("ESA revenue")).min(0, "Please enter a positive ESA amount").optional(),
  publicFundingPerStudent: z.coerce.number(numMsg("public funding")).min(0, "Please enter a positive funding amount").optional(),
  otherRevenuePerStudent: z.coerce.number(numMsg("other revenue")).min(0, "Please enter a positive revenue amount").optional(),
  scholarshipRate: z.coerce.number(numMsg("scholarship rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Scholarship rate can't exceed 100%").optional(),
  annualDonations: z.coerce.number(numMsg("annual donations")).min(0, "Please enter a positive donation amount").optional(),
  foundationGrants: z.coerce.number(numMsg("foundation grants")).min(0, "Please enter a positive grant amount").optional(),
  capitalGifts: z.coerce.number(numMsg("capital gifts")).min(0, "Please enter a positive amount").optional(),
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
  fte: z.number().min(0, "Please enter a positive FTE value").max(50, "FTE can't exceed 50"),
  annualizedRate: z.number().min(0, "Please enter a positive annual rate"),
  benefitsEligible: z.boolean(),
  benefitsRate: z.number().min(0, "Please enter a rate of 0% or higher").max(100, "Benefits rate can't exceed 100%"),
  payrollTaxRate: z.number().min(0, "Please enter a rate of 0% or higher").max(100, "Payroll tax rate can't exceed 100%"),
  payrollLike: z.boolean(),
  benefitsRateOverridden: z.boolean().optional(),
  payrollTaxRateOverridden: z.boolean().optional(),
  notes: z.string().default(""),
  staffingMode: z.enum(["fixed", "ratio"]).default("fixed"),
  studentRatio: z.number().min(1).max(1000).optional(),
  minFte: z.number().min(0).max(50).optional(),
  maxFte: z.number().min(0).max(100).optional(),
  startYear: z.number().min(1).max(5).optional(),
  endYear: z.number().min(1).max(5).optional(),
});

export const staffingSchema = z.object({
  studentsPerTeacher: z.coerce.number(numMsg("student-to-teacher ratio")).min(1, "Enter your target student-to-teacher ratio (at least 1)").optional(),
  teacherSalary: z.coerce.number(numMsg("teacher salary")).min(0, "Please enter a positive salary amount").optional(),
  adminStaffCount: z.coerce.number(numMsg("admin staff count")).min(0, "Please enter a positive staff count").optional(),
  adminSalary: z.coerce.number(numMsg("admin salary")).min(0, "Please enter a positive salary amount").optional(),
  founderSalary: z.coerce.number(numMsg("founder salary")).min(0, "Please enter a positive salary amount").optional(),
  benefitsRate: z.coerce.number(numMsg("benefits rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Benefits rate can't exceed 100%").optional(),
  payrollTaxRate: z.coerce.number(numMsg("payroll tax rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Payroll tax rate can't exceed 100%").optional(),
});

export const expenseRowSchema = z.object({
  id: z.string(),
  category: z.string().min(1, "Please select an expense category"),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_revenue"], {
    required_error: "Please select how this expense is calculated",
    invalid_type_error: "Please select a valid calculation method",
  }),
  amounts: z.array(z.number()),
  escalationRate: z.number().optional(),
  escalationRateOverridden: z.boolean().optional(),
  note: z.string().default(""),
});

export const capitalDebtRowSchema = z.object({
  id: z.string(),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "percent_of_revenue"], {
    required_error: "Please select how this is calculated",
    invalid_type_error: "Please select a valid calculation method",
  }),
  amounts: z.array(z.number()),
  note: z.string().default(""),
  isLoan: z.boolean().default(false),
  loanPrincipal: z.number().min(0, "Please enter a positive loan principal").default(0),
  loanRate: z.number().min(0, "Please enter a rate of 0% or higher").max(100, "Interest rate can't exceed 100%").default(0),
  loanTermYears: z.number().min(0, "Please enter a positive loan term").max(50, "Loan term can't exceed 50 years").default(0),
  purpose: z.enum(["startup", "operating", "refinance"]).optional(),
});

export const openingBalancesSchema = z.object({
  cash: z.coerce.number(numMsg("cash")).min(0).optional().default(0),
  accountsReceivable: z.coerce.number(numMsg("accounts receivable")).min(0).optional().default(0),
  fixedAssets: z.coerce.number(numMsg("fixed assets")).min(0).optional().default(0),
  fixedAssetUsefulLife: z.coerce.number(numMsg("useful life")).min(1).max(50).optional().default(7),
  otherAssets: z.coerce.number(numMsg("other assets")).min(0).optional().default(0),
  accountsPayable: z.coerce.number(numMsg("accounts payable")).min(0).optional().default(0),
  currentDebtPortion: z.coerce.number(numMsg("current debt portion")).min(0).optional().default(0),
  longTermDebt: z.coerce.number(numMsg("long-term debt")).min(0).optional().default(0),
});

export const sourcesAndUsesLineSchema = z.object({
  lineItem: z.string(),
  amount: z.coerce.number(numMsg("amount")).min(0),
  category: z.string(),
});

export const sourcesAndUsesSchema = z.object({
  sources: z.array(sourcesAndUsesLineSchema).optional().default([]),
  uses: z.array(sourcesAndUsesLineSchema).optional().default([]),
});

export const scenarioDefSchema = z.object({
  name: z.string(),
  enrollmentAdjustment: z.number().default(0),
  tuitionAdjustment: z.number().default(0),
  expenseAdjustment: z.number().default(0),
  staffingAdjustment: z.number().default(0),
  facilityAdjustment: z.number().default(0),
});

export const covenantThresholdsSchema = z.object({
  minDSCR: z.coerce.number(numMsg("minimum DSCR")).min(0).optional().default(BENCHMARK_DSCR_GREEN),
  dscrByYear: z.array(z.coerce.number().min(0)).length(5).optional(),
  minDaysCashOnHand: z.coerce.number(numMsg("minimum days cash on hand")).min(0).optional().default(45),
  minMonthsRunway: z.coerce.number(numMsg("minimum months runway")).min(0).optional().default(2),
  minCapacityUtil: z.coerce.number(numMsg("minimum capacity utilization")).min(0).max(1).optional().default(0.7),
  minCurrentRatio: z.coerce.number(numMsg("minimum current ratio")).min(0).optional().default(1.1),
});

export const facilitiesSchema = z.object({
  monthlyRent: z.coerce.number(numMsg("monthly rent")).min(0, "Please enter a positive rent amount").optional(),
  annualRentIncrease: z.coerce.number(numMsg("rent increase")).min(0, "Please enter a rate of 0% or higher").max(100, "Rent increase percentage can't exceed 100%").optional(),
  annualUtilities: z.coerce.number(numMsg("utilities")).min(0, "Please enter a positive utilities amount").optional(),
  annualInsurance: z.coerce.number(numMsg("insurance")).min(0, "Please enter a positive insurance amount").optional(),
  facilityMaintenance: z.coerce.number(numMsg("maintenance")).min(0, "Please enter a positive maintenance amount").optional(),
  curriculumCostPerStudent: z.coerce.number(numMsg("curriculum cost")).min(0, "Please enter a positive curriculum cost").optional(),
  techCostPerStudent: z.coerce.number(numMsg("tech cost")).min(0, "Please enter a positive tech cost").optional(),
  annualMarketing: z.coerce.number(numMsg("marketing")).min(0, "Please enter a positive marketing amount").optional(),
  professionalDevelopment: z.coerce.number(numMsg("professional development")).min(0, "Please enter a positive amount").optional(),
  foodServicePerStudent: z.coerce.number(numMsg("food service cost")).min(0, "Please enter a positive food service cost").optional(),
  transportationAnnual: z.coerce.number(numMsg("transportation")).min(0, "Please enter a positive transportation amount").optional(),
  studentServicesAnnual: z.coerce.number(numMsg("student services")).min(0, "Please enter a positive amount").optional(),
  otherAnnualExpenses: z.coerce.number(numMsg("other expenses")).min(0, "Please enter a positive expense amount").optional(),
  loanAmount: z.coerce.number(numMsg("loan amount")).min(0, "Please enter a positive loan amount").optional(),
  annualInterestRate: z.coerce.number(numMsg("interest rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Interest rate can't exceed 100%").optional(),
  loanTermYears: z.coerce.number(numMsg("loan term")).min(0, "Please enter a positive loan term").max(50, "Loan term can't exceed 50 years").optional(),
  annualSalaryIncrease: z.coerce.number(numMsg("salary increase")).min(0, "Please enter a rate of 0% or higher").max(100, "Salary increase can't exceed 100%").optional(),
  generalCostInflation: z.coerce.number(numMsg("inflation rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Inflation rate can't exceed 100%").optional(),
});

export const budgetNarrativeSchema = z.object({
  missionAndVision: z.string().default(""),
  enrollmentStrategy: z.string().default(""),
  retentionPlan: z.string().default(""),
  revenueAssumptions: z.string().default(""),
  staffingPhilosophy: z.string().default(""),
  expenseAssumptions: z.string().default(""),
  growthStrategy: z.string().default(""),
  riskMitigation: z.string().default(""),
  additionalContext: z.string().default(""),
});

export const assumptionFlagResponseSchema = z.object({
  field: z.string(),
  flagType: z.string(),
  reason: z.string().default(""),
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
  revenueDefaults: revenueDefaultsSchema.optional(),
  staffing: staffingSchema.optional(),
  staffingRows: z.array(staffingRowSchema).min(1, "Add at least one staff member to continue").optional(),
  facilities: facilitiesSchema.optional(),
  expenseRows: z.array(expenseRowSchema).optional(),
  customCategoryLabels: z.record(z.string(), z.string()).optional(),
  capitalAndDebtRows: z.array(capitalDebtRowSchema).optional(),
  priorYearSnapshot: priorYearSnapshotSchema.optional(),
  currentYearProjection: currentYearProjectionSchema.optional(),
  openingBalances: openingBalancesSchema.optional(),
  sourcesAndUses: sourcesAndUsesSchema.optional(),
  scenarios: z.array(scenarioDefSchema).optional(),
  covenantThresholds: covenantThresholdsSchema.optional(),
  budgetNarrative: budgetNarrativeSchema.optional(),
  assumptionFlagResponses: z.array(assumptionFlagResponseSchema).optional(),
});

export type FullModelData = z.infer<typeof fullModelSchema>;
export type SchoolStage = z.infer<typeof schoolStageSchema>;
export type FundingProfile = z.infer<typeof fundingProfileSchema>;
export type SchoolType = z.infer<typeof schoolTypeSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type OwnershipType = z.infer<typeof ownershipTypeSchema>;
export type FacilityPhase = z.infer<typeof facilityPhaseSchema>;
export type TuitionTierType = z.infer<typeof tuitionTierTypeSchema>;
export type TuitionTier = z.infer<typeof tuitionTierSchema>;
export type Program = z.infer<typeof programSchema>;
export type TuitionEscalation = z.infer<typeof tuitionEscalationSchema>;
export type BudgetNarrative = z.infer<typeof budgetNarrativeSchema>;
export type AssumptionFlagResponse = z.infer<typeof assumptionFlagResponseSchema>;

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  sole_practitioner: "Sole Practitioner (no EIN)",
  llc_single: "LLC - Single Member",
  llc_partnership: "LLC - Partnership",
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  nonprofit_501c3: "501(c)(3) Nonprofit",
  undetermined: "Undetermined \u2014 I haven't decided yet",
};

export const SCHOOL_TYPE_LABELS: Record<string, string> = {
  catholic_school: "Catholic School",
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

export function isForProfit(entityType?: string): boolean {
  return !!entityType && entityType !== "nonprofit_501c3" && entityType !== "undetermined";
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
  return schoolType === "private_school" || schoolType === "catholic_school";
}

export function isCatholicSchool(schoolType?: string): boolean {
  return schoolType === "catholic_school";
}

export function getDefaultTuitionTiers(yearCount: number): TuitionTier[] {
  return [
    { id: "tier_full_pay", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_staff", tierType: "staff_discount", label: "Staff Discount", discountPercent: 50, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_sibling", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 10, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_high_need", tierType: "high_need_scholarship", label: "High Need / Scholarship", discountPercent: 100, studentCounts: new Array(yearCount).fill(0) },
  ];
}
