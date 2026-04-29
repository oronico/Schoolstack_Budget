import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";

export type PacketType = "lender" | "board";

export type SectionId =
  | "cover"
  | "executive_summary"
  | "school_overview"
  | "enrollment_plan"
  | "revenue_model"
  | "staffing_plan"
  | "expense_summary"
  | "capital_debt"
  | "five_year_projection"
  | "cash_flow"
  | "debt_service"
  | "stress_tests"
  | "health_assessment"
  | "key_risks"
  | "key_strengths"
  | "lender_readiness"
  | "board_action_items"
  | "appendix_assumptions"
  | "prior_year_actuals"
  | "opening_balance_sheet"
  | "facility_kpis"
  | "decision_history";

export interface LinkedAssumption {
  label: string;
  value: string;
  sourceField: string;
}

export interface LinkedMetric {
  label: string;
  value: string;
  status?: "good" | "warning" | "danger";
  benchmark?: string;
  sourceEngine: "consultant" | "workbook-helpers";
}

export interface NarrativeSummary {
  headline: string;
  summary: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendedFocus: string;
}

export interface PacketSection {
  id: SectionId;
  title: string;
  order: number;
  included: boolean;
  narrative: string;
  linkedAssumptions: LinkedAssumption[];
  linkedMetrics: LinkedMetric[];
  tables?: PacketTable[];
}

export interface PacketTable {
  title: string;
  headers: string[];
  rows: PacketTableRow[];
}

export interface PacketTableRow {
  label: string;
  values: string[];
  isBold?: boolean;
  isSeparator?: boolean;
}

export interface PacketData {
  packetType: PacketType;
  schoolName: string;
  generatedAt: string;
  modelId: number;
  narrative: NarrativeSummary;
  sections: PacketSection[];
  formatRules: FormatRules;
}

export interface FormatRules {
  currencyFormat: string;
  percentFormat: string;
  dateFormat: string;
  showBenchmarks: boolean;
  includeAssumptionSources: boolean;
  pageBreakAfterSections: SectionId[];
}

export interface PacketInput {
  modelData: ModelData;
  consultantOutput: ConsultantOutput;
  modelId: number;
  packetType: PacketType;
}

export const LENDER_SECTIONS: SectionId[] = [
  "cover",
  "executive_summary",
  "school_overview",
  "enrollment_plan",
  "revenue_model",
  "staffing_plan",
  "expense_summary",
  "capital_debt",
  "five_year_projection",
  "prior_year_actuals",
  "opening_balance_sheet",
  "facility_kpis",
  "cash_flow",
  "debt_service",
  "stress_tests",
  "lender_readiness",
  "health_assessment",
  "key_risks",
  "decision_history",
  "appendix_assumptions",
];

export const BOARD_SECTIONS: SectionId[] = [
  "cover",
  "executive_summary",
  "school_overview",
  "enrollment_plan",
  "revenue_model",
  "staffing_plan",
  "expense_summary",
  "five_year_projection",
  "health_assessment",
  "key_strengths",
  "key_risks",
  "board_action_items",
  "decision_history",
  "appendix_assumptions",
];

export const SECTION_META: Record<SectionId, { title: string; description: string }> = {
  cover: { title: "Cover Page", description: "School name, date, and packet purpose" },
  executive_summary: { title: "Executive Summary", description: "High-level financial narrative and verdict" },
  school_overview: { title: "School Overview", description: "Type, stage, location, and mission summary" },
  enrollment_plan: { title: "Enrollment Plan", description: "5-year enrollment targets and growth trajectory" },
  revenue_model: { title: "Revenue Model", description: "Revenue sources, concentration, and projections" },
  staffing_plan: { title: "Staffing Plan", description: "Personnel costs, FTE counts, and staffing ratios" },
  expense_summary: { title: "Expense Summary", description: "Operating expenses by category" },
  capital_debt: { title: "Capital & Debt", description: "Loan structures, terms, and debt service requirements" },
  five_year_projection: { title: "5-Year Financial Projection", description: "Revenue, expenses, and net income over 5 years" },
  cash_flow: { title: "Cash Flow Analysis", description: "Monthly and annual cash position" },
  debt_service: { title: "Debt Service Coverage", description: "DSCR analysis and covenant compliance" },
  stress_tests: { title: "Stress Testing", description: "Downside scenarios and financial resilience" },
  health_assessment: { title: "Financial Health Assessment", description: "7-dimension health signal analysis" },
  key_risks: { title: "Key Risks", description: "Primary financial risks and mitigation strategies" },
  key_strengths: { title: "Key Strengths", description: "Financial advantages and positive indicators" },
  lender_readiness: { title: "Lender Readiness", description: "Assessment of readiness for debt financing" },
  board_action_items: { title: "Board Action Items", description: "Recommended priorities for board oversight" },
  appendix_assumptions: { title: "Appendix: Key Assumptions", description: "Complete list of model assumptions with sources" },
  prior_year_actuals: { title: "Prior-Year Actuals", description: "Categorized prior-year revenue and expense actuals with Year 1 variance" },
  opening_balance_sheet: { title: "Opening Balance Sheet", description: "Assets, liabilities, and net position at model start" },
  facility_kpis: { title: "Facility & Key Performance Indicators", description: "Facility cost metrics and breakeven enrollment analysis" },
  decision_history: { title: "Decision History", description: "Outcomes of saved decision scenarios — what was pursued, declined, or put on hold" },
};
