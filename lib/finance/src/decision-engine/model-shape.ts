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
}

export type DecisionType = "add_program" | "evaluate_site" | "change_enrollment";
