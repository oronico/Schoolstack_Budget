import type { FullModelData } from "./decision-engine/model-shape.js";
import { computeBaseFinancials } from "./decision-engine/scenario-engine.js";

export type AssumptionKey =
  | "enrollment_y1"
  | "enrollment_y5"
  | "retention_rate"
  | "tuition_per_student"
  | "tuition_collection_rate"
  | "tuition_escalation"
  | "staffing_total_cost"
  | "staffing_salary_escalation"
  | "benefits_rate"
  | "payroll_tax_rate"
  | "facility_rent_y1"
  | "operating_expenses_y1"
  | "general_cost_inflation"
  | "loan_principal"
  | "loan_rate"
  | "loan_term_years"
  | "loan_debt_service_y1"
  | "starting_cash"
  | "year1_operating_months";

export type AssumptionFormat = "currency" | "percent" | "number" | "months" | "years" | "text";

export interface AssumptionMeta {
  key: AssumptionKey;
  label: string;
  /** Wizard step title (matches StepDef.title in model-wizard/index.tsx). */
  stepTitle: string;
  /** Default 1-based step number in the standard 12-step layout. Wizard
   *  steps may be reordered by mode; the registry is the source of truth
   *  for *labeling* (popovers, PDF appendix, workbook headers). Use
   *  `stepIdByTitle(stepTitle)` at the call site if a live mapping is
   *  required. */
  defaultStepNumber: number;
  format: AssumptionFormat;
  /** Short founder-facing description used in the "Why this number?"
   *  popover sub-text. */
  description: string;
}

export const ASSUMPTION_REGISTRY: Record<AssumptionKey, AssumptionMeta> = {
  enrollment_y1: {
    key: "enrollment_y1",
    label: "Year 1 enrollment",
    stepTitle: "Enrollment",
    defaultStepNumber: 3,
    format: "number",
    description: "Total students enrolled in Year 1.",
  },
  enrollment_y5: {
    key: "enrollment_y5",
    label: "Year 5 enrollment",
    stepTitle: "Enrollment",
    defaultStepNumber: 3,
    format: "number",
    description: "Total students enrolled by Year 5.",
  },
  retention_rate: {
    key: "retention_rate",
    label: "Retention rate",
    stepTitle: "Enrollment",
    defaultStepNumber: 3,
    format: "percent",
    description: "Share of returning students year-over-year.",
  },
  tuition_per_student: {
    key: "tuition_per_student",
    label: "Tuition per student",
    stepTitle: "Revenue",
    defaultStepNumber: 4,
    format: "currency",
    description: "Base annual per-student tuition.",
  },
  tuition_collection_rate: {
    key: "tuition_collection_rate",
    label: "Tuition collection rate",
    stepTitle: "Revenue",
    defaultStepNumber: 4,
    format: "percent",
    description: "Share of billed tuition actually collected.",
  },
  tuition_escalation: {
    key: "tuition_escalation",
    label: "Tuition escalation",
    stepTitle: "Revenue",
    defaultStepNumber: 4,
    format: "percent",
    description: "Annual tuition increase.",
  },
  staffing_total_cost: {
    key: "staffing_total_cost",
    label: "Year 1 staffing cost",
    stepTitle: "Staffing",
    defaultStepNumber: 5,
    format: "currency",
    description: "Total Year 1 salaries + benefits + payroll taxes.",
  },
  staffing_salary_escalation: {
    key: "staffing_salary_escalation",
    label: "Annual salary increase",
    stepTitle: "Staffing",
    defaultStepNumber: 5,
    format: "percent",
    description: "COLA / merit increase applied to salaries each year.",
  },
  benefits_rate: {
    key: "benefits_rate",
    label: "Benefits rate",
    stepTitle: "Staffing",
    defaultStepNumber: 5,
    format: "percent",
    description: "Benefits load as a percent of salary.",
  },
  payroll_tax_rate: {
    key: "payroll_tax_rate",
    label: "Payroll tax rate",
    stepTitle: "Staffing",
    defaultStepNumber: 5,
    format: "percent",
    description: "Effective payroll tax rate (FICA, FUTA, SUI).",
  },
  facility_rent_y1: {
    key: "facility_rent_y1",
    label: "Year 1 facility cost",
    stepTitle: "Expenses",
    defaultStepNumber: 6,
    format: "currency",
    description: "Year 1 occupancy / facility costs.",
  },
  operating_expenses_y1: {
    key: "operating_expenses_y1",
    label: "Year 1 operating expenses",
    stepTitle: "Expenses",
    defaultStepNumber: 6,
    format: "currency",
    description: "Year 1 non-personnel, non-facility operating expenses.",
  },
  general_cost_inflation: {
    key: "general_cost_inflation",
    label: "General cost inflation",
    stepTitle: "Expenses",
    defaultStepNumber: 6,
    format: "percent",
    description: "Default escalation applied to expenses without a row-level override.",
  },
  loan_principal: {
    key: "loan_principal",
    label: "Loan principal",
    stepTitle: "Capital & Financing",
    defaultStepNumber: 7,
    format: "currency",
    description: "Principal balance of modeled loans.",
  },
  loan_rate: {
    key: "loan_rate",
    label: "Loan interest rate",
    stepTitle: "Capital & Financing",
    defaultStepNumber: 7,
    format: "percent",
    description: "Annual interest rate on modeled loans.",
  },
  loan_term_years: {
    key: "loan_term_years",
    label: "Loan term",
    stepTitle: "Capital & Financing",
    defaultStepNumber: 7,
    format: "years",
    description: "Amortization term in years.",
  },
  loan_debt_service_y1: {
    key: "loan_debt_service_y1",
    label: "Year 1 debt service",
    stepTitle: "Capital & Financing",
    defaultStepNumber: 7,
    format: "currency",
    description: "Annual principal + interest payments in Year 1.",
  },
  starting_cash: {
    key: "starting_cash",
    label: "Starting cash",
    stepTitle: "Assumptions & Sensitivity",
    defaultStepNumber: 8,
    format: "currency",
    description: "Cash on hand at the start of Year 1.",
  },
  year1_operating_months: {
    key: "year1_operating_months",
    label: "Year 1 operating months",
    stepTitle: "School Details",
    defaultStepNumber: 2,
    format: "months",
    description: "Number of months the school operates in Year 1 (partial-year proration).",
  },
};

export type HeadlineMetricKey =
  | "y1_revenue"
  | "y1_total_expenses"
  | "y1_net_income"
  | "y1_operating_surplus"
  | "y1_dscr"
  | "y1_reserve_months"
  | "y1_ending_cash"
  | "y5_ending_cash"
  | "break_even_year";

export interface AssumptionDriver {
  key: AssumptionKey;
  /** Snapshot of the underlying value, formatted for display. May be empty
   *  if the driver is not populated (e.g. no loan modeled). */
  value: string;
  /** Set when the value is unavailable / not modeled. */
  missing?: boolean;
}

export interface MetricDriverInfo {
  metricKey: HeadlineMetricKey;
  label: string;
  drivers: AssumptionDriver[];
}

/** Mapping every headline metric to the assumption keys that drive it. The
 *  set is intentionally small — top 4-5 levers per metric — so the popover
 *  copy stays scannable. Order matters: drivers are listed strongest-to-
 *  weakest influence. */
export const METRIC_DRIVER_KEYS: Record<HeadlineMetricKey, AssumptionKey[]> = {
  y1_revenue: [
    "enrollment_y1",
    "tuition_per_student",
    "tuition_collection_rate",
    "tuition_escalation",
  ],
  y1_total_expenses: [
    "staffing_total_cost",
    "facility_rent_y1",
    "operating_expenses_y1",
    "loan_debt_service_y1",
    "general_cost_inflation",
  ],
  y1_net_income: [
    "enrollment_y1",
    "tuition_per_student",
    "staffing_total_cost",
    "facility_rent_y1",
    "operating_expenses_y1",
  ],
  y1_operating_surplus: [
    "enrollment_y1",
    "tuition_per_student",
    "staffing_total_cost",
    "facility_rent_y1",
    "operating_expenses_y1",
  ],
  y1_dscr: [
    "loan_principal",
    "loan_rate",
    "loan_term_years",
    "loan_debt_service_y1",
    "staffing_total_cost",
  ],
  y1_reserve_months: [
    "starting_cash",
    "operating_expenses_y1",
    "staffing_total_cost",
    "tuition_collection_rate",
  ],
  y1_ending_cash: [
    "starting_cash",
    "enrollment_y1",
    "tuition_per_student",
    "staffing_total_cost",
    "loan_debt_service_y1",
  ],
  y5_ending_cash: [
    "starting_cash",
    "enrollment_y5",
    "retention_rate",
    "tuition_escalation",
    "staffing_salary_escalation",
  ],
  break_even_year: [
    "enrollment_y1",
    "enrollment_y5",
    "tuition_per_student",
    "staffing_total_cost",
    "facility_rent_y1",
  ],
};

export const HEADLINE_METRIC_LABELS: Record<HeadlineMetricKey, string> = {
  y1_revenue: "Year 1 revenue",
  y1_total_expenses: "Year 1 total expenses",
  y1_net_income: "Year 1 net income",
  y1_operating_surplus: "Year 1 operating surplus",
  y1_dscr: "Debt service coverage (DSCR)",
  y1_reserve_months: "Cash reserve (months)",
  y1_ending_cash: "Year 1 ending cash",
  y5_ending_cash: "Year 5 ending cash",
  break_even_year: "Break-even year",
};

/** Headline metric → driver list, with values pulled from the model. Values
 *  use rough formatting suitable for a popover / appendix; callers that
 *  want precise locale formatting should re-format from raw fields. */
export function computeMetricDrivers(data: FullModelData): Record<HeadlineMetricKey, MetricDriverInfo> {
  const values = extractAssumptionValues(data);

  const make = (metricKey: HeadlineMetricKey): MetricDriverInfo => ({
    metricKey,
    label: HEADLINE_METRIC_LABELS[metricKey],
    drivers: METRIC_DRIVER_KEYS[metricKey].map((key) => values[key]),
  });

  return {
    y1_revenue: make("y1_revenue"),
    y1_total_expenses: make("y1_total_expenses"),
    y1_net_income: make("y1_net_income"),
    y1_operating_surplus: make("y1_operating_surplus"),
    y1_dscr: make("y1_dscr"),
    y1_reserve_months: make("y1_reserve_months"),
    y1_ending_cash: make("y1_ending_cash"),
    y5_ending_cash: make("y5_ending_cash"),
    break_even_year: make("break_even_year"),
  };
}

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
}

function fmtPercent(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function formatValue(meta: AssumptionMeta, raw: number | string | null | undefined): { value: string; missing: boolean } {
  if (raw === null || raw === undefined || raw === "" || (typeof raw === "number" && !Number.isFinite(raw))) {
    return { value: "Not entered", missing: true };
  }
  if (typeof raw === "string") return { value: raw, missing: false };
  switch (meta.format) {
    case "currency":
      return { value: fmtCurrency(raw), missing: false };
    case "percent":
      return { value: fmtPercent(raw), missing: false };
    case "months":
      return { value: `${fmtNumber(raw)} mo`, missing: false };
    case "years":
      return { value: `${fmtNumber(raw)} yr`, missing: false };
    case "number":
    default:
      return { value: fmtNumber(raw), missing: false };
  }
}

function extractAssumptionValues(data: FullModelData): Record<AssumptionKey, AssumptionDriver> {
  const sp = (data.schoolProfile || {}) as Record<string, unknown>;
  const en = (data.enrollment || {}) as Record<string, unknown>;
  const fac = (data.facilities || {}) as Record<string, unknown>;
  const ob = (data.openingBalances || {}) as Record<string, unknown>;

  const tuitionRow = (data.revenueRows || []).find(
    (r) => r.enabled !== false && r.category === "tuition_and_fees" && r.driverType === "per_student",
  );
  const tuitionAmount = tuitionRow?.amounts?.[0];
  const tuitionCollection = tuitionRow?.collectionRate;
  const tuitionEsc = data.tuitionEscalation?.rate ?? tuitionRow?.escalationRate;

  // Compute base financials once for derived headline drivers.
  let metrics: ReturnType<typeof computeBaseFinancials> | null = null;
  try {
    metrics = computeBaseFinancials(data);
  } catch {
    metrics = null;
  }
  const staffingTotal = metrics?.staffingCost?.[0] ?? 0;
  const facilityTotal = metrics?.facilityCost?.[0] ?? 0;
  const opexTotal = metrics?.opex?.[0] ?? 0;
  const debtServiceY1 = metrics?.loanDebtService?.[0] ?? 0;

  // Loan-level: take the largest enabled loan as the headline driver.
  const loans = (data.capitalAndDebtRows || []).filter((r) => r.enabled !== false && r.isLoan);
  const headLoan = loans
    .slice()
    .sort((a, b) => (b.loanPrincipal || 0) - (a.loanPrincipal || 0))[0];

  const staffingFirst = (data.staffingRows || [])[0];

  const raws: Record<AssumptionKey, number | string | null | undefined> = {
    enrollment_y1: en.year1 as number,
    enrollment_y5: en.year5 as number,
    retention_rate: en.retentionRate as number,
    tuition_per_student: tuitionAmount,
    tuition_collection_rate: tuitionCollection,
    tuition_escalation: tuitionEsc,
    staffing_total_cost: staffingTotal,
    staffing_salary_escalation: (fac.annualSalaryIncrease as number) ?? (sp.annualSalaryIncrease as number),
    benefits_rate: staffingFirst?.benefitsRate,
    payroll_tax_rate: staffingFirst?.payrollTaxRate,
    facility_rent_y1: facilityTotal,
    operating_expenses_y1: opexTotal,
    general_cost_inflation: fac.generalCostInflation as number,
    loan_principal: headLoan?.loanPrincipal,
    loan_rate: headLoan?.loanRate,
    loan_term_years: headLoan?.loanTermYears,
    loan_debt_service_y1: debtServiceY1,
    starting_cash: ob.cash as number,
    year1_operating_months: sp.isPartialFirstYear ? (sp.year1OperatingMonths as number) : 12,
  };

  const out = {} as Record<AssumptionKey, AssumptionDriver>;
  for (const key of Object.keys(ASSUMPTION_REGISTRY) as AssumptionKey[]) {
    const meta = ASSUMPTION_REGISTRY[key];
    const { value, missing } = formatValue(meta, raws[key]);
    out[key] = { key, value, missing };
  }
  return out;
}

/** True when `key` is a registered assumption. Used by the unit test that
 *  guards against typos in metric driver tables, lender packet appendix
 *  builders, and popover wiring. */
export function isAssumptionKey(key: string): key is AssumptionKey {
  return Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, key);
}

/** All registered keys, useful for regression tests and the lender-packet
 *  "Assumption sources" appendix. */
export function listAssumptionKeys(): AssumptionKey[] {
  return Object.keys(ASSUMPTION_REGISTRY) as AssumptionKey[];
}
