// Structural minimum of the model data needed by the decision-impact engine.
// School-financial-model has a richer zod-inferred FullModelData; this shape is
// a *strict subset* so the zod-inferred type is structurally assignable to it
// (TypeScript: an object with extra fields satisfies a type with fewer fields).
//
// The api-server feeds JSON model data straight from the database into the
// engine, so fields are typed loosely (optional, indexable) to match what
// arrives over the wire.

export interface RevenueRowLike {
  id: string;
  enabled?: boolean;
  category?: string;
  driverType: string;
  amounts?: number[];
  escalationRate?: number;
  escalationRateOverridden?: boolean;
  percentBase?: string;
  lineItem?: string;
  note?: string;
  /** Optional 0-100 percentage. When present and the row's driverType is
   *  `per_student`, the engine multiplies the row's per-student value by
   *  `collectionRate / 100` (i.e. 95 = 95% collection / 5% slippage).
   *  Lets the engine apply collection slippage to P&L revenue instead of
   *  callers (wizard / API) pre-multiplying tuition amounts themselves. */
  collectionRate?: number;
  /** Tuition billing schedule (months/year tuition is invoiced). Default 10. */
  billingMonths?: number;
  /** Days collections lag invoicing — used for the cash-flow shift. */
  collectionDelayDays?: number;
  /** Public-funding cadence: monthly | quarterly | semi_annual | annual. */
  paymentFrequency?: string;
  /** Public-funding timing: upfront | arrears. */
  paymentTiming?: string;
  /** School-choice / ESA disbursement type: direct | reimbursement. */
  disbursementType?: string;
  /** Months of lag before reimbursement programs pay out. Default 2. */
  reimbursementLagMonths?: number;
  /** Quarter (1-4) philanthropy / grants are received in. Default 1. */
  receiptQuarter?: number;
}

export interface PayrollTaxComponentLike {
  label?: string;
  rate: number;
  /** Annual wage base in dollars; undefined = applies to all wages (no cap). */
  wageBase?: number;
}

export interface StaffingRowLike {
  id?: string;
  fte?: number;
  startYear?: number;
  endYear?: number;
  staffingMode?: string;
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  annualizedRate?: number;
  employmentType?: string;
  payrollLike?: boolean;
  benefitsEligible?: boolean;
  benefitsRate?: number;
  payrollTaxRate?: number;
  /** When provided AND the user has not manually overridden `payrollTaxRate`,
   *  the engine computes payroll tax per component with wage-base caps:
   *  `sum(min(salary, c.wageBase ?? salary) * c.rate / 100)`.
   *  This is the correct accounting (FICA caps at $176.1k, FUTA at $7k, state SUI
   *  at the state's wage base) — using a flat blended rate over-accrues taxes
   *  for any salary above the lowest cap. */
  payrollTaxComponents?: PayrollTaxComponentLike[];
  payrollTaxRateOverridden?: boolean;
  roleName?: string;
  functionCategory?: string;
  notes?: string;
}

export interface ExpenseRowLike {
  id: string;
  enabled?: boolean;
  category?: string;
  driverType: string;
  amounts?: number[];
  escalationRate?: number;
  escalationRateOverridden?: boolean;
  lineItem?: string;
  note?: string;
}

export interface CapitalDebtRowLike {
  id?: string;
  enabled?: boolean;
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
  flatAnnualDebtService?: number;
  flatInterestRate?: number;
  flatStartingBalance?: number;
  driverType: string;
  amounts?: number[];
  lineItem?: string;
}

export interface TuitionTierLike {
  discountPercent?: number;
  studentCounts?: number[];
}

export interface SchoolProfileLike {
  isPartialFirstYear?: boolean;
  year1OperatingMonths?: number;
  facilityPhases?: Array<Record<string, unknown>>;
  monthlyRent?: number;
  [key: string]: unknown;
}

export interface EnrollmentLike {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
  [key: string]: unknown;
}

export interface FacilitiesLike {
  annualSalaryIncrease?: number;
  generalCostInflation?: number;
  [key: string]: unknown;
}

export interface StaffingLike {
  benefitsRate?: number;
  payrollTaxRate?: number;
  /** Legacy single-value founder salary (Y1). Backward-compat input only;
   *  newer models populate `reportedFounderComp` per year. */
  founderSalary?: number;
  /** Per-year founder comp the founder actually plans to draw ("as planned").
   *  Length up to 5 (Y1-Y5). Drives the founder-facing dashboard view. */
  reportedFounderComp?: number[];
  /** Per-year founder comp at market rate ("normalized"). Lender / board
   *  packets use this as the primary view, with the delta vs reported
   *  surfaced as a normalization adjustment. Length up to 5. */
  normalizedFounderComp?: number[];
  [key: string]: unknown;
}

export interface OpeningBalancesLike {
  cash?: number;
  [key: string]: unknown;
}

export interface PriorYearSnapshotLike {
  endingEnrollment?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  [key: string]: unknown;
}

export interface CurrentYearProjectionLike {
  currentEnrollment?: number;
  projectedRevenue?: number;
  projectedExpenses?: number;
  monthsCompleted?: number;
  [key: string]: unknown;
}

// Persisted live-sync snapshot from a connected accounting tool
// (QuickBooks Online / Xero). Unlike an uploaded CSV — which is a
// point-in-time file the founder dropped in — a live snapshot is the
// most recent value pulled directly from the connected provider via
// the AccountingConnectionCard. Today we only persist a tagged
// "students enrolled" count (e.g. a QuickBooks "Class" or Xero
// "Tracking Category" the founder mapped to enrollment); future
// expansion can add tagged revenue / expense buckets here too.
//
// The actuals-suggestion engine treats `liveSnapshot.enrollment` as
// higher-trust than a typed-in prior-year number for year 1, since it
// was just synced from the books. A label like
// "From QuickBooks tag 'Students FY26'" tells the founder exactly
// where the number came from so they can audit (or disconnect) it
// from the AccountingConnectionCard.
export interface LiveSnapshotLike {
  // Display name of the source (e.g. "QuickBooks", "Xero"). Used in
  // the UI subtitle and source label. Required so the badge always
  // names a provider — anything else would be a misleading "From  tag …".
  provider?: string;
  // Founder-facing name of the tag whose count was pulled (e.g. a
  // QuickBooks "Class" called "Students FY26" or a Xero "Tracking
  // Category"). Required so the founder can identify *which* tag is
  // feeding the number when multiple are configured.
  tagName?: string;
  // Most recent count of students recorded against the tag. Treated as
  // an integer headcount; the engine rounds defensively.
  enrollment?: number;
  // ISO-8601 timestamp of the last successful sync. Surfaced in the
  // tooltip so the founder can tell if the live count is stale.
  syncedAt?: string;
}

// Persisted accounting-export upload (e.g. a QuickBooks Profit & Loss
// CSV). Kept on the model so the actuals-suggestion engine can pull
// directly from real books, with a clear source label like
// "From quickbooks-2026Q1.csv uploaded Mar 14".
export interface AccountingExportLike {
  filename?: string;
  // ISO-8601 timestamp of when the founder uploaded the file. Rendered as a
  // friendly month-day in the source label.
  uploadedAt?: string;
  // Top-level totals extracted from the export. Optional fields stay
  // undefined when the parser couldn't confidently identify a row, so the
  // wizard's other suggestion sources can still fill the gap. The
  // category-level fields (tuition / philanthropy / payroll / facility)
  // are pulled from a curated list of subtotal labels and feed both the
  // upload summary card's breakdown chips and the actuals editor's
  // contributing-account list.
  totals?: {
    totalRevenue?: number;
    totalExpenses?: number;
    netIncome?: number;
    tuitionRevenue?: number;
    philanthropyRevenue?: number;
    payrollExpense?: number;
    facilityExpense?: number;
  };
  // Number of recognized rows the parser matched (revenue / expenses /
  // net income lines). Used by the post-upload coach to tell the founder
  // *how many* account categories we picked up before they head into
  // mapping.
  recognizedRowCount?: number;
  // Short founder-facing notes from the parser, surfaced near the upload
  // affordance ("Couldn't find a Total Expenses row.").
  parseWarnings?: string[];
}

export interface FullModelData {
  schoolProfile?: SchoolProfileLike;
  enrollment?: EnrollmentLike;
  facilities?: FacilitiesLike;
  staffing?: StaffingLike;
  revenueRows?: RevenueRowLike[];
  staffingRows?: StaffingRowLike[];
  expenseRows?: ExpenseRowLike[];
  capitalAndDebtRows?: CapitalDebtRowLike[];
  tuitionTiers?: TuitionTierLike[];
  tuitionEscalation?: { rate?: number };
  openingBalances?: OpeningBalancesLike;
  customScenarios?: Array<Record<string, unknown>>;
  priorYearSnapshot?: PriorYearSnapshotLike;
  currentYearProjection?: CurrentYearProjectionLike;
  accountingExport?: AccountingExportLike;
  liveSnapshot?: LiveSnapshotLike;
}

export { type DecisionType } from "../decision-types.js";
