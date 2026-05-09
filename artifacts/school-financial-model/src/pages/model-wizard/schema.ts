import { z } from "zod";
import { BENCHMARK_DSCR_GREEN, DECISION_TYPES, DECISION_OUTCOME_STATUSES } from "@workspace/finance";

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
export const schoolTypeSchema = z.enum(["catholic_school", "charter_school", "chesterton_academy", "homeschool_coop", "learning_pod", "microschool", "private_school", "tutoring_center", "other"], {
  required_error: "Please select the type of school you're building",
  invalid_type_error: "Please select a valid school type",
});

// Duration of the financial model. "five_year" is the historical default and
// remains so for all legacy models — the field is optional + defaulted on read
// so models created before single-year shipped continue to validate as 5-year.
// "single_year" collapses every multi-year input on the wizard down to Year 1
// only, and gates the Lender Packet / Board Packet exports (which intrinsically
// need a multi-year projection) behind a "Requires 5-year model" tooltip.
export const modelDurationSchema = z.enum(["single_year", "five_year"], {
  required_error: "Please pick a model duration",
  invalid_type_error: "Please pick a valid model duration",
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

// Per-program × per-year × per-group enrollment cells. `null` = N/A
// (excluded from totals/warnings); `undefined` = empty (treated as 0).
export const programEnrollmentMatrixSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.record(z.string(), z.coerce.number().min(0).nullable().optional()),
  ),
).optional();

export const programNotOfferedMaskSchema = z.record(
  z.string(),
  z.record(z.string(), z.boolean().optional()),
).optional();

// Per-column "didn't offer" mask keyed by yearKey → groupKey. Mirrors the
// row-level `programNotOffered` mask so a founder's "we didn't offer this
// grade/band in this actuals year" choice survives reload even if a single
// cell in the column ends up with a stray non-null value (e.g. via the —
// placeholder click that resets a cell to 0). The cell-content-only check
// would silently lose the user's intent in that case.
export const columnNotOfferedMaskSchema = z.record(
  z.string(),
  z.record(z.string(), z.boolean().optional()),
).optional();

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
  // Optional city/municipality. Used by the Local / City Business License
  // toggle on the Expense step to pre-fill a starter annual amount when the
  // (state, city) pair matches a curated jurisdiction in
  // `local-business-license-data.ts`. Free-text so any city is allowed; only
  // the curated set drives a suggestion.
  city: z.string().optional(),
  schoolType: schoolTypeSchema,
  schoolTypeOther: z.string().optional(),
  // Picked next to school type on this step. Optional + defaulted to
  // "five_year" so legacy models without it continue to validate. Read via
  // `getModelDuration(data)` so consumers don't all need to re-implement the
  // default fallback. The preprocess step coerces the empty string that
  // `FormSelect` emits when nothing is picked yet to `undefined` — without it,
  // `z.enum().optional()` would reject `""` and block the wizard's Continue
  // button on Step 2.
  modelDuration: z.preprocess(
    v => (v === "" || v === null ? undefined : v),
    modelDurationSchema.optional(),
  ),
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
  // Long-term enrollment goal — captured up front in the Story step's
  // "Your program" sequence so we have a year-5 target to grow toward
  // even before the founder reaches the Enrollment step. Optional so
  // legacy models without it keep validating.
  longTermEnrollmentGoal: z.coerce.number(numMsg("long-term enrollment goal")).min(0, "Please enter a positive enrollment goal").optional(),
  maxCapacity: z.coerce.number(numMsg("capacity")).min(1, "Enter your building's maximum student capacity (at least 1)"),
  fiscalYearStartMonth: z.coerce.number(numMsg("fiscal year start month")).min(1, "Choose a fiscal year start month").max(12, "Month must be between 1 and 12"),
  isPartialFirstYear: z.boolean(),
  year1OperatingMonths: z.coerce.number(numMsg("operating months")).min(1, "Your first year needs at least 1 operating month").max(12, "Operating months can't exceed 12"),
  // Task #703 — Assumptions-first launch checklist for new schools.
  // Captures the early-stage realities a brand-new school can already
  // commit to (committed students, signed agreements, deposits, opening
  // cadence) so the model is grounded in evidence rather than pure
  // estimates. All sub-fields are optional + permissive so legacy
  // models without the checklist round-trip cleanly through save/load.
  launchAssumptions: z.object({
    committedStudents: z.coerce.number(numMsg("committed students")).min(0, "Please enter a positive number").optional(),
    signedEnrollmentAgreements: z.coerce.number(numMsg("signed enrollment agreements")).min(0, "Please enter a positive number").optional(),
    depositsCollected: z.coerce.number(numMsg("deposits collected")).min(0, "Please enter a positive amount").optional(),
    projectedOpeningMonth: z.string().optional(),
    firstMonthWithRevenue: z.string().optional(),
    firstMonthWithPayroll: z.string().optional(),
    firstMonthWithRent: z.string().optional(),
    preOpeningCashNeeds: z.coerce.number(numMsg("pre-opening cash needs")).min(0, "Please enter a positive amount").optional(),
    startupCosts: z.coerce.number(numMsg("startup costs")).min(0, "Please enter a positive amount").optional(),
  }).optional(),
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
  hasLocalBusinessLicense: z.boolean().optional().default(false),
  localBusinessLicenseAnnualCost: z.coerce.number(numMsg("local business license cost")).min(0, "Please enter a positive dollar amount").optional().default(0),
  hasSavingsAccount: z.boolean().optional().default(false),
  hasBusinessAccount: z.boolean().optional().default(false),
  hasCreditCard: z.boolean().optional().default(false),
  hasLoan: z.boolean().optional().default(false),
  loanAmount: z.coerce.number(numMsg("loan amount")).min(0, "Please enter a positive loan amount").optional().default(0),
  loanRate: z.coerce.number(numMsg("interest rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Interest rate can't exceed 100%").optional().default(0),
  loanTermYears: z.coerce.number(numMsg("loan term")).min(0, "Please enter a positive loan term").max(50, "Loan term can't exceed 50 years").optional().default(0),
  lendingLabIntent: lendingLabIntentSchema,
  debtIncluded: z.boolean().optional().default(true),
  // Grade band fields. Task #302 added optional toddlers/preK/other so the
  // gentle "Your program" sequence in StoryStep can capture early-childhood
  // and custom-named programs. RevenueStep + EnrollmentStep iterate via the
  // shared GRADE_BAND_KEYS constant so adding a band only requires touching
  // the schema + the constant below.
  // Grouping mode + explicit on/off sets — see StoryStep / EnrollmentStep.
  studentGroupingMode: z.enum(["grades", "age_bands", "both"]).optional(),
  gradeBandActive: z.array(z.string()).optional(),
  gradeActive: z.array(z.string()).optional(),
  // Cells are nullable so null = "didn't offer" (N/A), distinct from 0.
  gradeBandEnrollment: z.object({
    toddlers: z.array(z.coerce.number().min(0).nullable()).optional(),
    preK: z.array(z.coerce.number().min(0).nullable()).optional(),
    k5: z.array(z.coerce.number().min(0).nullable()).optional(),
    m68: z.array(z.coerce.number().min(0).nullable()).optional(),
    h912: z.array(z.coerce.number().min(0).nullable()).optional(),
    other: z.array(z.coerce.number().min(0).nullable()).optional(),
  }).optional(),
  // Per-grade enrollment vectors keyed by GRADE_KEYS (k, g1..g12).
  gradeEnrollment: z.record(z.string(), z.array(z.coerce.number().min(0).nullable())).optional(),
  gradePerPupil: z.record(z.string(), z.coerce.number().min(0)).optional(),
  gradeLongTermGoal: z.record(z.string(), z.coerce.number().min(0)).optional(),
  gradeRatio: z.record(z.string(), z.coerce.number().min(1)).optional(),
  gradeBandPerPupil: z.object({
    toddlers: z.coerce.number().min(0).optional(),
    preK: z.coerce.number().min(0).optional(),
    k5: z.coerce.number().min(0).default(0),
    m68: z.coerce.number().min(0).default(0),
    h912: z.coerce.number().min(0).default(0),
    other: z.coerce.number().min(0).optional(),
  }).optional(),
  gradeBandLongTermGoal: z.object({
    toddlers: z.coerce.number().min(0).optional(),
    preK: z.coerce.number().min(0).optional(),
    k5: z.coerce.number().min(0).optional(),
    m68: z.coerce.number().min(0).optional(),
    h912: z.coerce.number().min(0).optional(),
    other: z.coerce.number().min(0).optional(),
  }).optional(),
  gradeBandRatio: z.object({
    toddlers: z.coerce.number().min(1).optional(),
    preK: z.coerce.number().min(1).optional(),
    k5: z.coerce.number().min(1).optional(),
    m68: z.coerce.number().min(1).optional(),
    h912: z.coerce.number().min(1).optional(),
    other: z.coerce.number().min(1).optional(),
  }).optional(),
  gradeBandOtherLabel: z.string().max(40).optional(),
  sameTuitionForAllBands: z.boolean().optional(),
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
  // Task #657 — explicit pathway choice. Operating-school founders default
  // to "actuals" (an Actuals Intake step is inserted right after Story and
  // those numbers seed Y1 projections). Launching founders default to
  // "assumptions" (a planning-from-assumptions framing block + persistent
  // "Built from assumptions" badge). Stored separately from `schoolStage`
  // so a founder can override the default mapping with the path-switcher
  // without flipping their stage.
  wizardPathway: z.enum(["actuals", "assumptions"]).optional(),
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

// Persisted snapshot of an uploaded accounting export (e.g. a QuickBooks
// Profit & Loss CSV). The parsed top-level totals feed the saved-scenario
// actuals editor's "Suggest from latest data" affordance, with a source
// label like "From quickbooks-2026Q1.csv uploaded Mar 14". Re-uploading
// replaces this entire object so suggestions auto-refresh on next render.
export const accountingExportTotalsSchema = z.object({
  totalRevenue: z.number().optional(),
  totalExpenses: z.number().optional(),
  netIncome: z.number().optional(),
  // Curated category subtotals — surfaced as breakdown chips on the upload
  // summary card and as contributing accounts under revenue / expense in
  // the saved-scenario actuals editor. Each is optional so a sparse export
  // (e.g. one with no facility line) still validates and round-trips.
  tuitionRevenue: z.number().optional(),
  philanthropyRevenue: z.number().optional(),
  payrollExpense: z.number().optional(),
  facilityExpense: z.number().optional(),
});

export const accountingExportSchema = z.object({
  filename: z.string().min(1),
  uploadedAt: z.string(),
  totals: accountingExportTotalsSchema.optional(),
  parseWarnings: z.array(z.string()).optional(),
});

// Persisted live-sync snapshot from a connected accounting tool
// (QuickBooks Online / Xero). Today we only persist a single tagged
// "students enrolled" count — the founder picks the tag in
// `AccountingConnectionCard` and each successful sync overwrites this
// object. The actuals-suggestion engine reads `enrollment` straight
// from here for year 1 (with priority over the typed-in prior-year
// number) so a stale wizard entry can't shadow a fresh sync.
export const liveSnapshotSchema = z.object({
  // "QuickBooks", "Xero", etc. Required so the suggestion source label
  // can name the provider ("From QuickBooks tag 'Students FY26'").
  provider: z.string().min(1),
  // Founder-facing name of the tag whose count was pulled (a
  // QuickBooks "Class" or Xero "Tracking Category"). Required so the
  // editor's subtitle can identify which tag is feeding the number.
  tagName: z.string().min(1),
  enrollment: z.coerce.number().min(0),
  syncedAt: z.string(),
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
  // True when the per-row escalationRate was stamped by the Extend-to-5-Year
  // seeder (rather than typed by the founder). Used by RevenueStep to render
  // a "seeded from Extend-to-5-Year" indicator next to the rate, mirroring
  // the same flag on expenseRowSchema (Task #514).
  escalationRateSeeded: z.boolean().optional(),
  note: z.string().optional(),
  billingMonths: z.union([z.literal(9), z.literal(10), z.literal(12)]).optional(),
  collectionMethod: z.enum(["autopay", "invoiced", "mixed"]).optional(),
  // Cap at 0-100% — uncapped values previously let the wizard form ship
  // a 150% collection assumption that the JS engine ignored (assumes
  // 100% accrual for net income) but the Excel monthly cash flow
  // honored, producing impossible cash positions in lender exports.
  collectionRate: z.coerce.number().min(0, "Collection rate can't be negative").max(100, "Collection rate can't exceed 100%").optional(),
  collectionDelayDays: z.number().optional(),
  paymentFrequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]).optional(),
  paymentTiming: z.enum(["upfront", "arrears"]).optional(),
  disbursementType: z.enum(["direct", "reimbursement"]).optional(),
  reimbursementLagMonths: z.number().optional(),
  grantStatus: z.enum(["confirmed", "projected"]).optional(),
  receiptQuarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  timingOverridden: z.boolean().optional(),
  // Task #613: revenue quality classification. Defaults are inferred per
  // category + id by the engine (`inferRevenueQuality`) when this field is
  // absent, so legacy models migrate transparently. The wizard surfaces a
  // dropdown so founders can override.
  revenueQuality: z.enum(["contracted", "projected", "donor_dependent", "policy_dependent"]).optional(),
  revenueQualityOverridden: z.boolean().optional(),
  // Task #610: marks gifts/grants the school cannot legally spend on general
  // operations (capital campaigns, program-restricted, scholarship-restricted,
  // etc.). When undefined the engine infers from the row id — any line item
  // whose id starts with `restricted_` is treated as restricted by default
  // so legacy models migrate without surprises.
  isRestricted: z.boolean().optional(),
});

export const revenueDefaultsSchema = z.object({
  billingMonths: z.union([z.literal(9), z.literal(10), z.literal(12)]).optional().default(10),
  collectionMethod: z.enum(["autopay", "invoiced", "mixed"]).optional().default("autopay"),
  collectionRate: z.coerce.number().min(0).max(100).optional().default(100),
  collectionDelayDays: z.coerce.number().min(0).max(90).optional().default(0),
  // Task #610: tuition delinquency assumption (% of tuition that ultimately
  // goes uncollected on top of the row-level collectionRate slippage).
  // Defaulted from the school-type benchmark in the wizard but always
  // overridable. 0 means no incremental delinquency above row-level
  // collection rates.
  tuitionDelinquencyRate: z.coerce.number().min(0).max(50).optional().default(0),
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
  // Per-component breakdown (FICA, Medicare, FUTA, state SUI, etc) with per-component
  // wage-base caps. When present and `payrollTaxRateOverridden` is false, the engine
  // computes payroll tax per-component capped at each component's wage base — this is
  // the correct accounting (FICA caps at $176.1k, FUTA at $7k, state SUI per state).
  payrollTaxComponents: z.array(z.object({
    label: z.string().optional(),
    rate: z.number(),
    wageBase: z.number().optional(),
  })).optional(),
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
  /** Task #611: per-year founder comp the founder *actually plans to draw*
   *  ("as planned"). Drives the founder-facing dashboard. Length up to 5
   *  (Y1-Y5). When absent, the engine falls back to the legacy
   *  `founderSalary` field, then to the school_leadership row in the
   *  staffing roster. */
  reportedFounderComp: z.array(z.coerce.number().min(0, "Please enter a positive amount")).max(5).optional(),
  /** Task #611: per-year founder comp at *market rate* ("normalized").
   *  Lender / board packets use this as the primary view; the difference vs
   *  reported is surfaced as a normalization adjustment to staffing cost,
   *  net income, and DSCR. Length up to 5. */
  normalizedFounderComp: z.array(z.coerce.number().min(0, "Please enter a positive amount")).max(5).optional(),
  /** Task #685: founder-friendly "when do I start paying myself" inputs.
   *  When `notPayingFounderYet` is true, the entire `reportedFounderComp[]`
   *  series is zero. Otherwise, `founderCompAnnualAmount` paid starting at
   *  `founderCompStartMonth` (1-12) of `founderCompStartYear` (1-N) drives
   *  the per-year reported series — Y1 of the start year is prorated by the
   *  number of months remaining in that year, subsequent years escalate by
   *  the model's COLA. Lets founders see the tradeoff side-by-side without
   *  filling out a per-year array by hand. */
  notPayingFounderYet: z.boolean().optional(),
  founderCompAnnualAmount: z.coerce.number(numMsg("founder annual compensation")).min(0, "Please enter a positive amount").optional(),
  founderCompStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  founderCompStartYear: z.coerce.number().int().min(1).max(5).optional(),
  /** Task #693: named pay scenarios so a founder can compare two real
   *  options side-by-side (e.g. "Start now at $40k" vs "Wait til Y2 at
   *  $70k"). Up to 3 saved at once. The scenario marked active by
   *  `activeFounderCompScenarioId` mirrors its values into the four
   *  fields above on selection — so the rest of the wizard, engine, and
   *  exports keep reading from a single source of truth. */
  founderCompScenarios: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1, "Give this scenario a name").max(60),
        notPayingYet: z.boolean().optional(),
        annualAmount: z.coerce.number().min(0).optional(),
        startMonth: z.coerce.number().int().min(1).max(12).optional(),
        startYear: z.coerce.number().int().min(1).max(5).optional(),
      }),
    )
    .max(3)
    .optional(),
  activeFounderCompScenarioId: z.string().optional(),
  offersBenefits: z.boolean().optional(),
  benefitsRate: z.coerce.number(numMsg("benefits rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Benefits rate can't exceed 100%").optional(),
  payrollTaxRate: z.coerce.number(numMsg("payroll tax rate")).min(0, "Please enter a rate of 0% or higher").max(100, "Payroll tax rate can't exceed 100%").optional(),
  payrollTaxRateUserOverride: z.boolean().optional(),
});

export const expenseRowSchema = z.object({
  id: z.string(),
  category: z.string().min(1, "Please select an expense category"),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "per_new_student", "per_returning_student", "percent_of_revenue", "per_fte"], {
    required_error: "Please select how this expense is calculated",
    invalid_type_error: "Please select a valid calculation method",
  }),
  amounts: z.array(z.number()),
  escalationRate: z.number().optional(),
  escalationRateOverridden: z.boolean().optional(),
  // True when the per-row escalationRate was stamped by the Extend-to-5-Year
  // seeder rather than typed by the founder. Used by ExpenseStep to surface a
  // "seeded from Extend-to-5-Year" tooltip so founders understand where the
  // Y2-Y5 numbers came from.
  escalationRateSeeded: z.boolean().optional(),
  note: z.string().default(""),
});

export const capitalDebtRowSchema = z.object({
  id: z.string(),
  lineItem: z.string(),
  enabled: z.boolean(),
  driverType: z.enum(["annual_fixed", "monthly", "per_student", "per_new_student", "per_returning_student", "percent_of_revenue", "per_fte"], {
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
  openingStory: z.string().default(""),
  foundingQuestions: z.array(z.string()).default([]),
  missionAndVision: z.string().default(""),
  enrollmentStrategy: z.string().default(""),
  retentionPlan: z.string().default(""),
  revenueAssumptions: z.string().default(""),
  staffingPhilosophy: z.string().default(""),
  expenseAssumptions: z.string().default(""),
  growthStrategy: z.string().default(""),
  riskMitigation: z.string().default(""),
  additionalContext: z.string().default(""),
  // Inline rationales captured per category card across the wizard. Keys are
  // semantic `step:categoryId` strings (e.g. `revenue:tuition_and_fees`,
  // `staffing:instructional`) so they survive wizard-step reorders. The
  // Lender Narrative roll-up task will read from this map.
  inlineRationales: z.record(z.string(), z.string()).default({}),
});

export const assumptionFlagResponseSchema = z.object({
  field: z.string(),
  flagType: z.string(),
  reason: z.string().default(""),
});

// The list of valid decision types lives in `@workspace/finance`
// (`DECISION_TYPES`) so the Zod schema here, the `DecisionType` union exported
// from the shared package, and the bullet/label maps can never silently fall
// out of sync. Adding a fourth decision type means editing exactly one tuple.
export const decisionTypeSchema = z.enum(DECISION_TYPES);
export type DecisionType = z.infer<typeof decisionTypeSchema>;

// Same single-source-of-truth pattern as `decisionTypeSchema` above: the list
// of valid outcome statuses lives in `@workspace/finance`
// (`DECISION_OUTCOME_STATUSES`) so the Zod schema here, the
// `DecisionOutcomeStatus` union, the `OUTCOME_LABELS` map, and the scenarios
// page's option list can never silently fall out of sync.
export const outcomeStatusSchema = z.enum(DECISION_OUTCOME_STATUSES);
export type OutcomeStatus = z.infer<typeof outcomeStatusSchema>;

// Actuals snapshot — what *actually* happened after the decision was pursued.
// Lets a founder record realized numbers for one model year alongside their
// projection so they can see at a glance how good their forecasting was. The
// shape is intentionally a flat record (rather than nested per-year) so the
// future "forecast accuracy" view can aggregate across many scenarios without
// shape gymnastics. Decision-specific fields (signedMonthlyRent for sites,
// programEnrollmentActual for add-program) sit alongside the common metrics
// and are only shown by the UI when relevant.
export const customScenarioActualsSchema = z.object({
  asOfYear: z.coerce.number().min(1, "Pick the model year these actuals reflect").max(5, "Pick a year between 1 and 5").optional(),
  enrollmentActual: z.coerce.number().min(0, "Enrollment can't be negative").optional(),
  revenueActual: z.coerce.number().optional(),
  expenseActual: z.coerce.number().optional(),
  netIncomeActual: z.coerce.number().optional(),
  signedMonthlyRent: z.coerce.number().min(0, "Signed rent can't be negative").optional(),
  programEnrollmentActual: z.coerce.number().min(0, "Program enrollment can't be negative").optional(),
  notes: z.string().optional(),
  updatedAt: z.string().optional(),
  // Per-field provenance captured at save time so the saved-actuals summary
  // can render a compact "Pulled from quickbooks-q1.csv (uploaded Mar 14)"
  // caption alongside the numbers — not just while the editor is open. Map
  // keys are CustomScenarioActuals field names (e.g. "revenueActual"); values
  // are the human-readable source label string from `buildActualsSuggestion`
  // (e.g. "From quickbooks-q1.csv uploaded Mar 14"). A field that is manually
  // edited after being suggested drops its entry here so the caption never
  // misrepresents typed-in numbers as books-sourced.
  sourceByField: z.record(z.string(), z.string()).optional(),
});
export type CustomScenarioActuals = z.infer<typeof customScenarioActualsSchema>;

// Compact diff record returned by `summarizeDecisionChanges` and rendered in
// the apply confirmation modal. Persisted on `appliedDecisionUndo` so the
// model dashboard's "Undo last applied decision" banner can show the same
// label list even after the founder has navigated away.
export const decisionFieldChangeSchema = z.object({
  label: z.string(),
  before: z.string(),
  after: z.string(),
  kind: z.enum(["added", "modified"]),
});
export type DecisionFieldChangeRecord = z.infer<typeof decisionFieldChangeSchema>;

// Persisted snapshot of the model exactly as it was *before* the most recent
// "Apply to my model" succeeded. Lets the founder undo a decision after the
// confirmation modal closes — including from a fresh page load. We keep at
// most one record (the latest apply); a subsequent apply replaces the older
// snapshot. The model dashboard surfaces the undo control while this record
// exists and is within the rolling 24-hour window.
export const appliedDecisionUndoSchema = z.object({
  decisionType: decisionTypeSchema,
  scenarioName: z.string(),
  appliedAt: z.string(),
  // The full pre-apply `data` blob. Restored verbatim by the undo control,
  // which also clears this record so the banner doesn't linger.
  snapshot: z.record(z.string(), z.unknown()),
  // Optional rendered before/after diff so the banner can echo "Restoring will
  // remove: <name>" in the confirm prompt without re-running the engine.
  changes: z.array(decisionFieldChangeSchema).optional(),
});
export type AppliedDecisionUndo = z.infer<typeof appliedDecisionUndoSchema>;

export const customScenarioSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  overrides: z.object({
    enrollmentDelta: z.array(z.number()).length(5).optional(),
    retentionRate: z.number().optional(),
    tuitionDeltaPerStudent: z.number().optional(),
    monthlyRent: z.number().optional(),
    rentEscalation: z.number().optional(),
    rentChangeStartYear: z.number().optional(),
    sqftDelta: z.number().optional(),
    // Decision-flow extras (forward-compatible — engine ignores unknown overrides)
    addProgramName: z.string().optional(),
    addProgramGradeBand: z.string().optional(),
    addProgramTuition: z.number().optional(),
    addProgramEnrollment: z.array(z.number()).length(5).optional(),
    addProgramAddedFte: z.number().optional(),
    addProgramAddedFteSalary: z.number().optional(),
    addProgramAddedAnnualSpace: z.number().optional(),
    addProgramStaffingTbd: z.boolean().optional(),
    siteFitOutCost: z.number().optional(),
  }),
  decisionType: decisionTypeSchema.optional(),
  narrative: z.string().optional(),
  // Outcome tracking — captures what actually happened after the decision was modeled.
  // Pursued / Declined / On hold lets the saved scenario become a historical record
  // rather than a one-off projection, and the optional retrospective note lets the
  // founder jot a short reflection ("we signed the lease, but enrollment came in 5
  // students under plan", etc.).
  outcomeStatus: outcomeStatusSchema.optional(),
  retrospective: z.string().optional(),
  outcomeUpdatedAt: z.string().optional(),
  // Set once the founder folds a Pursued scenario back into their base model so
  // we can hide the "Apply to model" nudge and avoid re-applying it twice.
  appliedToModelAt: z.string().optional(),
  // Snapshot of the field-level before/after diff captured AT APPLY TIME (the
  // same list `summarizeDecisionChanges` returns and the ApplyConfirmation
  // modal renders). Persisted here because once a decision is applied to the
  // base model, re-running `summarizeDecisionChanges` server-side compares
  // the post-apply state against itself and yields an empty diff. The lender
  // / board PDF "Decision history" section reads this back to show reviewers
  // exactly which fields the decision moved. Older scenarios saved before
  // this field existed simply omit it and the PDF degrades gracefully.
  appliedFieldChanges: z
    .array(
      z.object({
        label: z.string(),
        before: z.string(),
        after: z.string(),
        kind: z.enum(["added", "modified"]),
      }),
    )
    .optional(),
  // Optional realized-numbers snapshot — see customScenarioActualsSchema.
  // Surfaced in the saved scenario card once a decision is marked Pursued so
  // founders can record what actually happened (signed rent, realized
  // enrollment, etc.) and compare it side-by-side with the projection.
  actuals: customScenarioActualsSchema.optional(),
});
export type CustomScenario = z.infer<typeof customScenarioSchema>;

// ── Chesterton Schools Network (CSN) Operating Manual ─────────────────────────
// All Chesterton sub-schemas are optional so non-Chesterton models stay
// backwards-compatible. They populate when the founder picks "Chesterton
// Academy" on School Profile (see `applyChestertonTemplate` in
// `src/lib/chesterton/template.ts`).
export const chestertonSubjectRowSchema = z.object({
  id: z.string(),
  subject: z.string().min(1),
  periodsPerSection: z.coerce.number().min(0).max(10).default(5),
  notes: z.string().optional(),
});

export const chestertonFundraisingRowSchema = z.object({
  id: z.string(),
  category: z.string().min(1),
  goalAmount: z.coerce.number().min(0).default(0),
  numberOfGifts: z.coerce.number().min(0).default(0),
  averageGift: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export const chestertonGiftRowSchema = z.object({
  id: z.string(),
  giftAmount: z.coerce.number().min(0).default(0),
  numberOfGifts: z.coerce.number().min(0).default(0),
  numberOfProspects: z.coerce.number().min(0).default(0),
});

export const chestertonRecruitingRowSchema = z.object({
  id: z.string(),
  source: z.string().min(1),
  prospectiveStudents: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export const chestertonGradeRowSchema = z.object({
  grade: z.enum(["freshman", "sophomore", "junior", "senior"]),
  year0: z.coerce.number().min(0).default(0),
  year1: z.coerce.number().min(0).default(0),
  year2: z.coerce.number().min(0).default(0),
  year3: z.coerce.number().min(0).default(0),
  year4: z.coerce.number().min(0).default(0),
  year5: z.coerce.number().min(0).default(0),
});

export const chestertonContactRowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  affiliation: z.string().optional(),
  teamMember: z.string().optional(),
});

export const chestertonFacilityRowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  capacity: z.coerce.number().min(0).default(0),
  location: z.string().optional(),
});

export const chestertonSchema = z.object({
  planningYear: z.coerce.number().int().min(2024).max(2050).default(2027),
  startingTuition: z.coerce.number().min(0).default(8500),
  tuitionGrowthRate: z.coerce.number().min(0).max(0.5).default(0.04),
  bookSupplyFee: z.coerce.number().min(0).default(600),
  financialAidPct: z.coerce.number().min(0).max(1).default(0.10),
  startingTeacherSalary: z.coerce.number().min(0).default(44000),
  benefitsFirstYearAmount: z.coerce.number().min(0).default(0),
  attritionRate: z.coerce.number().min(0).max(1).default(0.10),
  totalFundraisingGoal: z.coerce.number().min(0).default(0),
  // Divisor for the recruiting "projected enrollment" math: 1-in-N prospects
  // convert. Defaults to the CSN rule of thumb (1-in-3).
  prospectConversionDivisor: z.coerce.number().int().min(2).max(10).default(3),
  phaseEnrollment: z.array(chestertonGradeRowSchema).optional(),
  classesPerGrade: z.array(z.coerce.number().min(0)).optional(),
  salarySchedule: z.array(chestertonSubjectRowSchema).optional(),
  fundraisingGoals: z.array(chestertonFundraisingRowSchema).optional(),
  giftChart: z.array(chestertonGiftRowSchema).optional(),
  recruitingPipeline: z.array(chestertonRecruitingRowSchema).optional(),
  prospectiveFacilities: z.array(chestertonFacilityRowSchema).optional(),
  priestlyOutreach: z.array(chestertonContactRowSchema).optional(),
  keyInfluencers: z.array(chestertonContactRowSchema).optional(),
});

export type ChestertonSubjectRow = z.infer<typeof chestertonSubjectRowSchema>;
export type ChestertonFundraisingRow = z.infer<typeof chestertonFundraisingRowSchema>;
export type ChestertonGiftRow = z.infer<typeof chestertonGiftRowSchema>;
export type ChestertonRecruitingRow = z.infer<typeof chestertonRecruitingRowSchema>;
export type ChestertonGradeRow = z.infer<typeof chestertonGradeRowSchema>;
export type ChestertonContactRow = z.infer<typeof chestertonContactRowSchema>;
export type ChestertonFacilityRow = z.infer<typeof chestertonFacilityRowSchema>;
export type ChestertonData = z.infer<typeof chestertonSchema>;

export const fullModelSchema = z.object({
  schoolProfile: schoolProfileSchema.optional(),
  enrollment: enrollmentSchema.optional(),
  programs: z.array(programSchema).optional(),
  // Per-program × per-year × per-group enrollment matrix + N/A mask.
  programEnrollmentMatrix: programEnrollmentMatrixSchema,
  programNotOffered: programNotOfferedMaskSchema,
  columnNotOffered: columnNotOfferedMaskSchema,
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
  accountingExport: accountingExportSchema.optional(),
  liveSnapshot: liveSnapshotSchema.optional(),
  openingBalances: openingBalancesSchema.optional(),
  sourcesAndUses: sourcesAndUsesSchema.optional(),
  scenarios: z.array(scenarioDefSchema).optional(),
  customScenarios: z.array(customScenarioSchema).optional(),
  // Persisted "undo record" for the most recent Apply-to-my-model. Lets the
  // founder roll back from the model dashboard even after they've dismissed
  // the apply confirmation modal or navigated away. See
  // `appliedDecisionUndoSchema` for shape and `UndoLastAppliedDecisionBanner`
  // for the surfacing logic (24h rolling window).
  appliedDecisionUndo: appliedDecisionUndoSchema.optional(),
  // Persisted "Compare decisions side-by-side" picker selection. Each entry
  // is a `${name}|${createdAt}` composite key referencing a saved
  // customScenario. Reconciled at render time against the current scenario
  // list so deletions naturally drop out. Capped at 4 to mirror the
  // MAX_DECISION_COMPARE limit on the picker UI.
  decisionComparisonSelection: z.array(z.string()).max(4).optional(),
  covenantThresholds: covenantThresholdsSchema.optional(),
  budgetNarrative: budgetNarrativeSchema.optional(),
  assumptionFlagResponses: z.array(assumptionFlagResponseSchema).optional(),
  // Task #659 — per-assumption confidence + evidence note. Keys correspond
  // to AssumptionKey in lib/finance/src/assumption-registry.ts. Optional
  // map so older models without confidence data continue to load. The
  // wizard's AssumptionConfidenceCard writes to this field; lender PDF,
  // underwriting workbook, and share-link page read from it.
  assumptionConfidence: z
    .record(
      z.string(),
      z.object({
        confidence: z.enum(["actuals", "signed_agreement", "quote", "research", "estimate"]),
        evidenceNote: z.string().optional(),
      }),
    )
    .optional(),
  chesterton: chestertonSchema.optional(),
});

export type FullModelData = z.infer<typeof fullModelSchema>;
export type SchoolStage = z.infer<typeof schoolStageSchema>;
export type FundingProfile = z.infer<typeof fundingProfileSchema>;
export type SchoolType = z.infer<typeof schoolTypeSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type ModelDuration = z.infer<typeof modelDurationSchema>;
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
  chesterton_academy: "Chesterton Academy (CSN)",
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
  return schoolType === "catholic_school" || schoolType === "chesterton_academy";
}

export function isChestertonAcademy(schoolType?: string): boolean {
  return schoolType === "chesterton_academy";
}

// Single source of truth for reading model duration off the wizard data.
// Defaults to "five_year" so models created before single-year shipped — and
// any code path that hands us partial data — keep behaving exactly as they
// did before the toggle existed.
export function getModelDuration(data?: { schoolProfile?: { modelDuration?: string } } | null): ModelDuration {
  return data?.schoolProfile?.modelDuration === "single_year" ? "single_year" : "five_year";
}

export function isSingleYearModel(data?: { schoolProfile?: { modelDuration?: string } } | null): boolean {
  return getModelDuration(data) === "single_year";
}

export const MODEL_DURATION_LABELS: Record<ModelDuration, string> = {
  single_year: "Single-Year Budget (Year 1 only)",
  five_year: "5-Year Projection (recommended for lenders & boards)",
};

// Task #657 — pathway helpers.
//
// `wizardPathway` is the explicit founder choice ("actuals" | "assumptions");
// when missing we fall back to the schoolStage default so older models keep
// behaving as they did before the pathway prompt shipped:
//   • operating_school    → actuals  (we have last year's books to seed Y1)
//   • new_school / unset  → assumptions (no actuals to seed from)
export type WizardPathway = "actuals" | "assumptions";

export function getWizardPathway(
  data?: { schoolProfile?: { wizardPathway?: string; schoolStage?: string } } | null,
): WizardPathway {
  const sp = data?.schoolProfile;
  if (sp?.wizardPathway === "actuals" || sp?.wizardPathway === "assumptions") {
    return sp.wizardPathway;
  }
  return sp?.schoolStage === "operating_school" ? "actuals" : "assumptions";
}

export function getProvenanceLabel(
  data?: { schoolProfile?: { wizardPathway?: string; schoolStage?: string } } | null,
): "Built from actuals" | "Built from assumptions" {
  return getWizardPathway(data) === "actuals"
    ? "Built from actuals"
    : "Built from assumptions";
}

export function getDefaultTuitionTiers(yearCount: number): TuitionTier[] {
  return [
    { id: "tier_full_pay", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_staff", tierType: "staff_discount", label: "Staff Discount", discountPercent: 50, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_sibling", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 10, studentCounts: new Array(yearCount).fill(0) },
    { id: "tier_high_need", tierType: "high_need_scholarship", label: "High Need / Scholarship", discountPercent: 100, studentCounts: new Array(yearCount).fill(0) },
  ];
}
