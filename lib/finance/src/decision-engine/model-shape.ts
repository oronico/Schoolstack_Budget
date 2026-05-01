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
  driverType: string;
  amounts?: number[];
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
  // wizard's other suggestion sources can still fill the gap.
  totals?: {
    totalRevenue?: number;
    totalExpenses?: number;
    netIncome?: number;
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
}

export { type DecisionType } from "../decision-types.js";
