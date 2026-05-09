import type { FullModelData } from "./decision-engine/model-shape.js";
import { computeBaseFinancials } from "./decision-engine/scenario-engine.js";

export type AssumptionKey =
  | "enrollment_y1"
  | "enrollment_y5"
  | "retention_rate"
  | "tuition_per_student"
  | "tuition_collection_rate"
  | "tuition_escalation"
  | "public_funding_y1"
  | "philanthropy_revenue_y1"
  | "staffing_total_cost"
  | "staffing_salary_escalation"
  | "benefits_rate"
  | "payroll_tax_rate"
  | "founder_compensation_y1"
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
  public_funding_y1: {
    key: "public_funding_y1",
    label: "Year 1 public funding",
    stepTitle: "Revenue",
    defaultStepNumber: 4,
    format: "currency",
    description: "Per-pupil state, federal, or local government funding in Year 1.",
  },
  philanthropy_revenue_y1: {
    key: "philanthropy_revenue_y1",
    label: "Year 1 philanthropy",
    stepTitle: "Revenue",
    defaultStepNumber: 4,
    format: "currency",
    description: "Grants, major gifts, and annual fund total in Year 1.",
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
  founder_compensation_y1: {
    key: "founder_compensation_y1",
    label: "Year 1 founder compensation",
    stepTitle: "Staffing",
    defaultStepNumber: 5,
    format: "currency",
    description: "Founder / head-of-school compensation drawn in Year 1.",
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

  // Task #659 — sum public-funding and philanthropy revenue rows for Y1
  // so the registry can drive picker rows for those assumption families.
  const enrollmentY1 = (en.year1 as number) || 0;
  const sumCategoryY1 = (cat: string): number => {
    return (data.revenueRows || [])
      .filter((r) => r.enabled !== false && r.category === cat)
      .reduce((acc, r) => {
        const a = r.amounts?.[0] ?? 0;
        return acc + (r.driverType === "per_student" ? a * enrollmentY1 : a);
      }, 0);
  };
  const publicFundingY1 = sumCategoryY1("public_funding");
  const philanthropyY1 = sumCategoryY1("philanthropy");

  // Founder compensation Y1: prefer normalized > reported > legacy single value.
  const staffingLike = (data.staffing || {}) as Record<string, unknown>;
  const normalizedComp = (staffingLike.normalizedFounderComp as number[] | undefined)?.[0];
  const reportedComp = (staffingLike.reportedFounderComp as number[] | undefined)?.[0];
  const legacyComp = staffingLike.founderSalary as number | undefined;
  const founderCompY1 = normalizedComp ?? reportedComp ?? legacyComp;

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
    public_funding_y1: publicFundingY1,
    philanthropy_revenue_y1: philanthropyY1,
    staffing_total_cost: staffingTotal,
    staffing_salary_escalation: (fac.annualSalaryIncrease as number) ?? (sp.annualSalaryIncrease as number),
    benefits_rate: staffingFirst?.benefitsRate,
    payroll_tax_rate: staffingFirst?.payrollTaxRate,
    founder_compensation_y1: founderCompY1,
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

/** Task #659 — five-level confidence ladder used by the Assumptions
 *  Confidence layer. Ordered strongest → weakest evidence. */
export type AssumptionConfidenceLevel =
  | "actuals"
  | "signed_agreement"
  | "quote"
  | "research"
  | "estimate";

export interface AssumptionEvidenceFile {
  /** Stable client-generated id so the UI can key + remove individual files. */
  id: string;
  /** Original filename as uploaded (e.g. "lease-2025.pdf"). */
  name: string;
  /** MIME type captured at upload (e.g. "application/pdf"). */
  mimeType: string;
  /** Byte length of the original file. */
  size: number;
  /** ISO timestamp the file was attached. */
  uploadedAt: string;
  /** Legacy (Task #707): raw file bytes base64-encoded inline in the model
   *  JSON (no data: prefix). Older models still load with this field, but
   *  new uploads use App Storage instead — see `objectPath`. Consumers
   *  that only need filename + size may strip this before serializing. */
  dataBase64?: string;
  /** Task #714 — App Storage path for the uploaded file
   *  (e.g. `/objects/uploads/<uuid>`). When set, the file lives in
   *  cloud object storage and the model JSON no longer carries the bytes
   *  inline. Serve via `GET /api/storage{objectPath}`. */
  objectPath?: string;
}

export interface AssumptionConfidenceEntry {
  confidence: AssumptionConfidenceLevel;
  evidenceNote?: string;
  /** Task #707 — founder-uploaded evidence files (lease, MOU, payroll
   *  quote, etc.). A non-empty list counts as evidence for rollup math
   *  with at least the same weight as a "signed agreement" tag, so a
   *  tagged "estimate" + uploaded lease still earns full credit. */
  evidenceFiles?: AssumptionEvidenceFile[];
}

export const ASSUMPTION_CONFIDENCE_LEVELS: AssumptionConfidenceLevel[] = [
  "actuals",
  "signed_agreement",
  "quote",
  "research",
  "estimate",
];

export const ASSUMPTION_CONFIDENCE_LABELS: Record<AssumptionConfidenceLevel, string> = {
  actuals: "Actuals",
  signed_agreement: "Signed agreement",
  quote: "Written quote",
  research: "Research / benchmark",
  estimate: "Estimate",
};

/** Short founder-facing description shown under the picker option. */
export const ASSUMPTION_CONFIDENCE_DESCRIPTIONS: Record<AssumptionConfidenceLevel, string> = {
  actuals: "Pulled from your books or last year's financials.",
  signed_agreement: "Backed by an executed contract, lease, or letter.",
  quote: "Written quote or proposal from a vendor / partner.",
  research: "Industry benchmark, peer-school data, or a published source.",
  estimate: "Best-guess placeholder you'd like to firm up later.",
};

/** Task #659 — high-impact assumption keys whose "estimate" confidence
 *  with no evidence note triggers a coach-tone AssumptionFlag. Kept small
 *  and strategic so the founder isn't drowned in nudges. */
export const HIGH_IMPACT_CONFIDENCE_KEYS: AssumptionKey[] = [
  "tuition_per_student",
  "enrollment_y1",
  "enrollment_y5",
];

/** True when the entry is "estimate" with no evidence note AND no
 *  uploaded evidence files — the trigger condition for the
 *  AssumptionFlag in detectUnusualAssumptions. Task #707: an uploaded
 *  document (lease, MOU, payroll quote) hardens the assumption the
 *  same way a written note does, so we no longer flag the entry as
 *  bare. */
export function isEstimateWithoutEvidence(entry: AssumptionConfidenceEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.confidence !== "estimate") return false;
  const hasNote = !!entry.evidenceNote && entry.evidenceNote.trim().length > 0;
  const hasFiles = Array.isArray(entry.evidenceFiles) && entry.evidenceFiles.length > 0;
  return !hasNote && !hasFiles;
}

/** All registry keys grouped by their wizard step title. Used by the
 *  AssumptionConfidenceCard to render one card per step listing only
 *  the keys that step owns. */
export function listAssumptionKeysByStep(stepTitle: string): AssumptionKey[] {
  return (Object.keys(ASSUMPTION_REGISTRY) as AssumptionKey[]).filter(
    (k) => ASSUMPTION_REGISTRY[k].stepTitle === stepTitle,
  );
}

// Task #703 — Assumptions Confidence rollup.
//
// Combines the per-assumption tags collected by the AssumptionConfidenceCard
// into a single Strong / Moderate / Needs Support status that surfaces on
// the Review step, the lender / board PDFs, and the Founder Planning
// Workbook so a reviewer can read the model's evidence posture at a glance.
//
// Scoring:
//   • Each registered key is worth 1 point. High-impact keys
//     (HIGH_IMPACT_CONFIDENCE_KEYS) are weighted 2x — those are the
//     swing-factor levers a lender will challenge first.
//   • A key earns its weight when tagged with anything other than a bare
//     "estimate" (i.e. actuals / signed_agreement / quote / research, or
//     "estimate" with an evidence note). This matches the per-step tally
//     in AssumptionConfidenceCard.
//   • Status thresholds: Strong ≥ 70%, Moderate ≥ 40%, else Needs Support.
//
// The verbatim "Needs Support" copy is taken straight from the founder-
// facing brief and must not be paraphrased on any surface.
export type AssumptionConfidenceStatus = "Strong" | "Moderate" | "Needs Support";

export interface AssumptionConfidenceRollup {
  status: AssumptionConfidenceStatus;
  /** 0..1 share of weighted points earned. */
  evidenceRatio: number;
  /** Sum of weights actually earned (with high-impact 2x). */
  earnedWeight: number;
  /** Total possible weighted points across the registry. */
  totalWeight: number;
  /** Count of keys (any weight) tagged with evidence. */
  taggedKeys: number;
  /** Total registered key count. */
  totalKeys: number;
  /** High-impact keys that are still bare estimates (or untagged) and
   *  therefore the highest-leverage thing the founder can firm up. */
  weakHighImpactKeys: AssumptionKey[];
  /** Founder-facing copy block matched to the status, ready to drop on
   *  the Review screen / PDF cover. */
  message: string;
}

export const ASSUMPTION_CONFIDENCE_STATUS_COPY: Record<AssumptionConfidenceStatus, string> = {
  Strong:
    "Most of the levers in this model are anchored to actuals, signed agreements, written quotes, or named research. A reviewer can follow your reasoning back to a source.",
  Moderate:
    "Some of the levers in this model are anchored, but several are still tagged as estimates. Adding a one-line source to the highest-impact ones below is the fastest way to build trust.",
  // Verbatim from the Task #703 brief — do not paraphrase.
  "Needs Support":
    "This does not mean your plan is weak. It means this part needs more clarity.",
};

// Permissive shape: the wizard schema stores `confidence` as a string
// (zod-narrowed at parse time), and downstream consumers (api-server
// excel/PDF code paths) hand us the same `Record<string, { confidence:
// string; evidenceNote?: string }>`. Accepting the wider shape here keeps
// every caller compiling without unsafe casts.
interface ConfidenceLikeEntry {
  confidence: string;
  evidenceNote?: string;
  evidenceFiles?: Array<{ id?: string; name?: string; mimeType?: string; size?: number; uploadedAt?: string; dataBase64?: string; objectPath?: string }>;
}
interface ConfidenceLikeMap {
  [key: string]: ConfidenceLikeEntry | undefined;
}

/** True when the entry counts as "evidence-backed" for rollup purposes —
 *  any non-estimate level, an estimate that carries an evidence note, or
 *  (Task #707) an entry with at least one uploaded evidence file. An
 *  uploaded document is at least as defensible as a "signed agreement"
 *  tag, so it earns the same full weight in the rollup. */
function entryHasEvidence(entry: ConfidenceLikeEntry | undefined): boolean {
  if (!entry) return false;
  const hasFiles = Array.isArray(entry.evidenceFiles) && entry.evidenceFiles.length > 0;
  if (hasFiles) return true;
  if (entry.confidence !== "estimate") return true;
  return !!(entry.evidenceNote && entry.evidenceNote.trim().length > 0);
}

export function computeAssumptionConfidenceRollup(
  data: { assumptionConfidence?: ConfidenceLikeMap | null } | null | undefined,
): AssumptionConfidenceRollup {
  const map = (data?.assumptionConfidence || {}) as ConfidenceLikeMap;
  const allKeys = listAssumptionKeys();
  let earned = 0;
  let total = 0;
  let tagged = 0;
  const weakHighImpact: AssumptionKey[] = [];
  for (const key of allKeys) {
    const weight = HIGH_IMPACT_CONFIDENCE_KEYS.includes(key) ? 2 : 1;
    total += weight;
    const entry = map[key];
    if (entryHasEvidence(entry)) {
      earned += weight;
      tagged += 1;
    } else if (HIGH_IMPACT_CONFIDENCE_KEYS.includes(key)) {
      weakHighImpact.push(key);
    }
  }
  const ratio = total > 0 ? earned / total : 0;
  const status: AssumptionConfidenceStatus =
    ratio >= 0.7 ? "Strong" : ratio >= 0.4 ? "Moderate" : "Needs Support";
  return {
    status,
    evidenceRatio: ratio,
    earnedWeight: earned,
    totalWeight: total,
    taggedKeys: tagged,
    totalKeys: allKeys.length,
    weakHighImpactKeys: weakHighImpact,
    message: ASSUMPTION_CONFIDENCE_STATUS_COPY[status],
  };
}

// Task #703 — pathway-specific verbatim founder copy. These two blocks
// must appear word-for-word on the Actuals Intake step and the
// assumptions-first launch checklist respectively (the brief calls them
// out as the single source of framing for both pathways).
export const PATHWAY_FRAMING_COPY = {
  actuals:
    "Your actuals are the best starting point. Last year's books tell us what really happened — we'll use them to seed Year 1 so you're projecting forward from real numbers, not from a blank page.",
  assumptions:
    "Since you do not have actuals yet, every input from here on is an assumption. That's normal for a school you're still launching — the checklist below walks through the ones reviewers will look at first so you can anchor each to a piece of evidence as you go.",
} as const;

// Task #703 — assumptions-first launch checklist. Each item maps to an
// existing field on the model so the Story step can show progress / "still
// to do" without inventing new schema. The id is stable so tests can pin
// the item set.
export interface LaunchChecklistItem {
  id:
    | "opening_month"
    | "year1_operating_months"
    | "committed_students"
    | "waitlist"
    | "pre_opening_cash"
    | "first_revenue_month"
    | "first_payroll_month"
    | "first_rent_month"
    | "startup_costs";
  label: string;
  detail: string;
  /** Where on the model the founder will firm this up. */
  stepTitle: string;
}

export const LAUNCH_CHECKLIST_ITEMS: LaunchChecklistItem[] = [
  {
    id: "opening_month",
    label: "Planned opening month",
    detail: "Which month / year you expect the doors to open.",
    stepTitle: "School Details",
  },
  {
    id: "year1_operating_months",
    label: "Year 1 operating months",
    detail: "How many months of school happen inside Year 1 (partial-year proration).",
    stepTitle: "School Details",
  },
  {
    id: "committed_students",
    label: "Committed students",
    detail: "Families who have signed an enrollment agreement or paid a deposit.",
    stepTitle: "Enrollment",
  },
  {
    id: "waitlist",
    label: "Applications & waitlist",
    detail: "Families in your pipeline who haven't yet committed.",
    stepTitle: "Enrollment",
  },
  {
    id: "pre_opening_cash",
    label: "Pre-opening cash on hand",
    detail: "Cash you have today (founder capital, raised philanthropy, deposits).",
    stepTitle: "Capital & Financing",
  },
  {
    id: "first_revenue_month",
    label: "First month with revenue",
    detail: "When tuition or per-pupil funding starts hitting your bank account.",
    stepTitle: "Revenue",
  },
  {
    id: "first_payroll_month",
    label: "First month with payroll",
    detail: "When you start paying staff — usually a month or two before doors open.",
    stepTitle: "Staffing",
  },
  {
    id: "first_rent_month",
    label: "First month with rent",
    detail: "When the lease clock starts (usually before you can collect tuition).",
    stepTitle: "Expenses",
  },
  {
    id: "startup_costs",
    label: "One-time startup costs",
    detail: "Build-out, deposits, furniture, curriculum — the spend before Day 1.",
    stepTitle: "Capital & Financing",
  },
];

// Task #703 — backwards-compatible adapter for the HEAD branch's
// `rollupAssumptionConfidence` API. Internal callers and the existing
// HEAD-side test suite (`assumption-rollup.test.ts`) read this shape;
// keeping the adapter lets both the weighted scoring and the legacy
// posture-with-breakdown shape coexist without duplicating logic.
export type AssumptionConfidencePosture = AssumptionConfidenceStatus;

export interface LegacyAssumptionConfidenceRollup {
  posture: AssumptionConfidencePosture;
  total: number;
  withEvidence: number;
  breakdown: Record<AssumptionConfidenceLevel, number>;
  highImpactGap: boolean;
}

export const ASSUMPTION_CONFIDENCE_POSTURE_DESCRIPTIONS: Record<
  AssumptionConfidencePosture,
  string
> = ASSUMPTION_CONFIDENCE_STATUS_COPY;

export function rollupAssumptionConfidence(
  map: Record<string, AssumptionConfidenceEntry | undefined> | undefined | null,
): LegacyAssumptionConfidenceRollup {
  const safe = (map ?? {}) as ConfidenceLikeMap;
  const allKeys = listAssumptionKeys();
  const breakdown: Record<AssumptionConfidenceLevel, number> = {
    actuals: 0,
    signed_agreement: 0,
    quote: 0,
    research: 0,
    estimate: 0,
  };
  let withEvidence = 0;
  for (const k of allKeys) {
    const entry = safe[k];
    if (!entry) continue;
    if (entry.confidence in breakdown) {
      breakdown[entry.confidence as AssumptionConfidenceLevel] += 1;
    }
    if (entryHasEvidence(entry)) withEvidence += 1;
  }
  const highImpactGap = HIGH_IMPACT_CONFIDENCE_KEYS.some((k) =>
    isEstimateWithoutEvidence(safe[k] as AssumptionConfidenceEntry | undefined),
  );
  const weighted = computeAssumptionConfidenceRollup({ assumptionConfidence: safe });
  // High-impact gap forces the floor to "Needs Support" even when the
  // weighted ratio is otherwise healthy — the HEAD-side test pins this
  // behavior and reviewers expect a single bare-estimate tuition or
  // enrollment number to dominate the posture.
  const posture: AssumptionConfidencePosture = highImpactGap ? "Needs Support" : weighted.status;
  return {
    posture,
    total: allKeys.length,
    withEvidence,
    breakdown,
    highImpactGap,
  };
}
