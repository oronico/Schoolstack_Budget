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

// Snapshot of actuals pulled from a live accounting connection (QuickBooks /
// Xero). Sourced from `accounting_connections.snapshot_json` and threaded into
// the model data when the scenarios page loads — not persisted with the rest
// of the model. Treated as the highest-priority source for the actuals editor
// because it represents books-of-record numbers, not founder estimates.
export type AccountingSnapshotProvider = "quickbooks" | "xero";

export interface AccountingSnapshotLike {
  provider: AccountingSnapshotProvider;
  // ISO-8601 timestamp of when the sync that produced this snapshot ran.
  syncedAt: string;
  // ISO-8601 date string for the last day covered by the P&L. Used for the
  // year-1 / year-N matching the suggestion helper does.
  periodEnd?: string;
  // 1..12; needed to annualize partial-year P&L numbers like the
  // current-year projection helper does.
  monthsCompleted?: number;
  enrollment?: number;
  revenue?: number;
  expenses?: number;
  monthlyRent?: number;
  // Optional human label for the source company file ("Acme School - QBO"),
  // shown in the source caption so the founder knows which books were pulled.
  realmDisplayName?: string;
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
  // Live accounting snapshot, threaded in by the scenarios page when the
  // founder has connected QuickBooks / Xero. Highest-priority source for the
  // actuals editor.
  accountingSnapshot?: AccountingSnapshotLike;
}

export type DecisionType = "add_program" | "evaluate_site" | "change_enrollment";
