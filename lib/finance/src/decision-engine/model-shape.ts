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

// Snapshot of actuals pulled from a live accounting connection (QuickBooks /
// Xero). Sourced from `accounting_connections.snapshot_json` and threaded into
// the model data when the scenarios page loads — not persisted with the rest
// of the model. Treated as the highest-priority source for the actuals editor
// because it represents books-of-record numbers, not founder estimates.
export type AccountingSnapshotProvider = "quickbooks" | "xero";

// Founder-visible classification for a single account row from the connected
// accounting system. Mirrors `AccountKind` in @workspace/db, duplicated here
// so the engine package can stay free of the server's drizzle dependency.
export type AccountingAccountKindLike = "revenue" | "expense" | "rent" | "ignore";

// Per-account row discovered during the latest sync. The actuals-suggestion
// helper uses these (combined with the founder's `accountMappings` overrides)
// to surface a short "Revenue = Tuition + Workshops" breakdown so the founder
// can sanity-check the mapping before accepting a suggestion. Stays optional
// because older snapshots and non-live sources won't carry it.
export interface AccountingDiscoveredAccountLike {
  key: string;
  name: string;
  section: "income" | "expense" | "other";
  // Period total as it appeared on the latest P&L. Same scale as the
  // snapshot-level `revenue` / `expenses` figures (i.e. NOT annualized).
  amount: number;
  defaultKind: AccountingAccountKindLike;
}

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
  // Optional per-account breakdown + the founder's mapping overrides. When
  // present, the actuals-suggestion helper can compute a top-N list of
  // contributing accounts per field (e.g. "Revenue = Tuition Income +
  // Workshop Income"). Threaded through from the AccountingConnectionCard so
  // the breakdown updates as soon as the founder saves a new mapping —
  // without re-syncing from the provider.
  discoveredAccounts?: AccountingDiscoveredAccountLike[];
  accountMappings?: Record<string, AccountingAccountKindLike>;
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
  accountingExport?: AccountingExportLike;
}

export type DecisionType = "add_program" | "evaluate_site" | "change_enrollment";
