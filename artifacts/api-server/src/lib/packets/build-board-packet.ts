import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData, SchoolProfile } from "../workbook-helpers";
import {
  getEnrollmentArray,
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  normalizeStaffingRow,
  computeNewStudents,
  computeReturningStudents,
  computeTotalFTE,
} from "../workbook-helpers";
import {
  computeForecastAccuracy,
  type ForecastAccuracyRollup,
  type DecisionEngineModelData,
} from "@workspace/finance";
import { buildPacketData } from "./build-packet-data";
import { buildCashRunway, type CashRunwayView } from "./build-cash-runway";
import { buildDecisionHistory, type DecisionHistoryItem } from "./build-decision-history";
import {
  buildAllRollups,
  withFounderReasoning,
  type SectionRationaleRollup,
  type RationaleSectionKey,
} from "./inline-rationale-rollup";
import type { PacketData, PacketSection, PacketTable, PacketTableRow, LinkedMetric, SectionId } from "./packet-types";

export interface BoardFocusArea {
  title: string;
  priority: "high" | "medium" | "low";
  description: string;
  impact: string;
}

export interface BoardRiskItem {
  risk: string;
  severity: "critical" | "high" | "medium";
  plainLanguage: string;
  suggestedAction: string;
}

export interface ScenarioSnapshot {
  name: string;
  y5Revenue: string;
  y5NetIncome: string;
  y5Margin: string;
  signal: "green" | "amber" | "red";
}

export type { CashRunwayView } from "./build-cash-runway";

export interface BoardNarrativeData {
  enrollmentStrategy?: string;
  retentionPlan?: string;
  riskMitigation?: string;
  missionAndVision?: string;
}

export interface BoardFlaggedAssumption {
  severity: string;
  description: string;
  explanation: string;
}

export interface BoardPacket extends PacketData {
  topRisks: BoardRiskItem[];
  focusAreas: BoardFocusArea[];
  scenarioSnapshots: ScenarioSnapshot[];
  cashRunway: CashRunwayView;
  financialOutlook: {
    headline: string;
    status: "healthy" | "watch" | "needs_attention";
    summary: string;
  };
  boardNarrative: BoardNarrativeData;
  boardFlaggedAssumptions: BoardFlaggedAssumption[];
  decisionHistory: DecisionHistoryItem[];
  // Projected-vs-actual roll-up across every Pursued saved scenario that has
  // realized actuals captured. Empty arrays when no eligible scenarios exist
  // — the PDF renderer skips the section gracefully in that case (Task #216).
  forecastAccuracy: ForecastAccuracyRollup;
}

const BOARD_PACKET_SECTIONS: SectionId[] = [
  "cover",
  "executive_summary",
  "school_overview",
  "five_year_projection",
  // Personnel/Staffing Plan section follows the financial projection so the
  // board sees the team that will deliver the model. Task #322 also surfaces
  // the wage-base cap savings sentence here (appended inside
  // `buildStaffingPlan`), so excluding `staffing_plan` would suppress that
  // insight from the board PDF.
  "staffing_plan",
  "health_assessment",
  "key_strengths",
  "key_risks",
  "cash_flow",
  "board_action_items",
  "decision_history",
];

export function buildBoardPacket(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  modelId: number,
  personaComfort?: "new_to_budgeting" | "comfortable" | null,
): BoardPacket {
  const basePacket = buildPacketData({
    modelData,
    consultantOutput,
    modelId,
    packetType: "board",
    personaComfort: personaComfort ?? null,
  });

  const boardSectionIds = new Set(BOARD_PACKET_SECTIONS);
  const filteredSections = basePacket.sections
    .filter((s) => boardSectionIds.has(s.id))
    .sort((a, b) => BOARD_PACKET_SECTIONS.indexOf(a.id) - BOARD_PACKET_SECTIONS.indexOf(b.id))
    .map((s, i) => ({ ...s, order: i }));

  const cashFlowSection = basePacket.sections.find((s) => s.id === "cash_flow");
  if (cashFlowSection && !filteredSections.find((s) => s.id === "cash_flow")) {
    filteredSections.splice(filteredSections.length - 1, 0, { ...cashFlowSection, order: filteredSections.length - 1 });
  }

  // Build per-section roll-ups of the inline rationales captured during the
  // wizard so we can append a "Founder's reasoning:" footer to each matching
  // packet section (Task #331). When no rationale exists for a section, the
  // narrative is unchanged.
  const rollups = buildAllRollups(modelData);

  const enrichedSections = filteredSections.map((section) => {
    let next = section;
    if (next.id === "executive_summary") {
      next = simplifyExecutiveSummary(next, consultantOutput);
    }
    if (next.id === "key_risks") {
      next = simplifyRisksForBoard(next, consultantOutput);
    }
    if (next.id === "board_action_items") {
      next = enrichBoardActions(next, consultantOutput);
    }
    return appendFounderReasoningBoard(next, rollups);
  });

  const topRisks = buildTopRisks(consultantOutput);
  const focusAreas = buildFocusAreas(consultantOutput);
  const scenarioSnapshots = buildScenarioSnapshots(modelData, consultantOutput);
  const cashRunway = buildCashRunway(consultantOutput, modelData);
  const financialOutlook = buildFinancialOutlook(consultantOutput);

  const raw = modelData as unknown as Record<string, unknown>;
  const narrativeData = (raw.budgetNarrative || {}) as Record<string, string>;
  const boardNarrative: BoardNarrativeData = {
    enrollmentStrategy: narrativeData.enrollmentStrategy || undefined,
    retentionPlan: narrativeData.retentionPlan || undefined,
    riskMitigation: narrativeData.riskMitigation || undefined,
    missionAndVision: narrativeData.missionAndVision || undefined,
  };

  const flagResponses = (raw.assumptionFlagResponses as Array<{ field: string; flagType: string; reason: string }>) || [];
  const assumptionFlags = consultantOutput.assumptionFlags || [];
  const boardFlaggedAssumptions: BoardFlaggedAssumption[] = assumptionFlags
    .filter(f => f.severity === "critical" || f.severity === "warning")
    .map(flag => {
      const resp = flagResponses.find(r => r.field === flag.field && r.flagType === flag.flagType);
      return {
        severity: flag.severity,
        description: flag.currentValue,
        explanation: resp?.reason?.trim() || "",
      };
    });

  const decisionHistory = buildDecisionHistory(modelData);
  // Forecast accuracy roll-up — same shared engine the planner UI uses, so
  // the founder, lender, and board see identical projected-vs-actual numbers.
  // Cast: api-server's strict zod-typed `ModelData` is a structural subset
  // of finance's permissive `FullModelData` (which uses index signatures on
  // its sub-shapes); routing through `unknown` matches the convention used
  // by every other api-server → finance call site in this folder.
  const forecastAccuracy = computeForecastAccuracy(modelData as unknown as DecisionEngineModelData);

  return {
    ...basePacket,
    sections: enrichedSections,
    topRisks,
    focusAreas,
    scenarioSnapshots,
    cashRunway,
    financialOutlook,
    boardNarrative,
    boardFlaggedAssumptions,
    decisionHistory,
    forecastAccuracy,
  };
}

function buildTopRisks(co: ConsultantOutput): BoardRiskItem[] {
  return co.topIssues.slice(0, 3).map((issue) => ({
    risk: issue.title,
    severity: issue.severity,
    plainLanguage: issue.whyItMatters,
    suggestedAction: issue.recommendedAction,
  }));
}

function buildFocusAreas(co: ConsultantOutput): BoardFocusArea[] {
  const areas: BoardFocusArea[] = [];

  for (const rec of co.recommendations.slice(0, 3)) {
    areas.push({
      title: rec.title,
      priority: rec.priority as "high" | "medium" | "low",
      description: rec.description,
      impact: rec.priority === "high"
        ? "Addressing this will materially improve financial position."
        : "This strengthens the model and reduces future risk.",
    });
  }

  if (areas.length === 0) {
    areas.push({
      title: "Continue Building the Model",
      priority: "medium",
      description: "The financial model is developing. Continue refining assumptions as the school takes shape.",
      impact: "A complete model enables better decisions and stakeholder confidence.",
    });
  }

  return areas;
}

function buildScenarioSnapshots(md: ModelData, co: ConsultantOutput): ScenarioSnapshot[] {
  const scenarios = (md as Record<string, unknown>).scenarios as Array<{
    name: string;
    enrollmentAdjustment: number;
    tuitionAdjustment: number;
    expenseAdjustment: number;
    staffingAdjustment: number;
    facilityAdjustment: number;
  }> | undefined;

  if (!scenarios || scenarios.length === 0) return [];

  const snapshots: ScenarioSnapshot[] = [];
  const sp = md.schoolProfile || ({} as SchoolProfile);
  const enrollment = getEnrollmentArray(md.enrollment);
  const normalized = (md.staffingRows || []).map(
    (r) => normalizeStaffingRow(r as unknown as Record<string, unknown>),
  );
  const prorationFactor = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 12) / 12 : 1;
  const salaryEsc = ((md.facilities as Record<string, unknown> | undefined)?.annualSalaryIncrease as number | undefined ?? 0) / 100;
  const costInflPct = (md.facilities as Record<string, unknown> | undefined)?.generalCostInflation as number | undefined ?? 0;
  const boardRR = (md.enrollment as Record<string, unknown> | undefined)?.retentionRate as number | undefined ?? 85;

  for (const scenario of scenarios.slice(0, 3)) {
    try {
      const adjEnrollment = enrollment.map((e) => Math.round(e * (1 + (scenario.enrollmentAdjustment || 0) / 100)));
      const y = 4;
      const students = adjEnrollment[y] || 0;
      const bns = computeNewStudents(adjEnrollment, boardRR, y);
      const brs = computeReturningStudents(adjEnrollment, boardRR, y);
      const baseRevenue = computeRevenueForYear(md.revenueRows || [], y, students, md.tuitionTiers, costInflPct, sp);
      const revenue = baseRevenue * (1 + (scenario.tuitionAdjustment || 0) / 100);
      const baseStaffing = computePersonnelForYear(normalized, salaryEsc || 0, prorationFactor, y, students);
      const staffing = baseStaffing * (1 + (scenario.staffingAdjustment || 0) / 100);
      const bfte = computeTotalFTE(normalized, y, students);
      const baseOpex = computeExpenseForYear(md.expenseRows || [], y, students, revenue, costInflPct, bns, brs, bfte);
      const opex = baseOpex * (1 + (scenario.expenseAdjustment || 0) / 100);
      const baseCapDebt = computeCapDebtForYear(md.capitalAndDebtRows || [], y, students);
      const capDebt = baseCapDebt * (1 + (scenario.facilityAdjustment || 0) / 100);
      const totalExpenses = staffing + opex + capDebt;
      const netIncome = revenue - totalExpenses;
      const margin = revenue > 0 ? netIncome / revenue : 0;

      const signal: "green" | "amber" | "red" = margin > 0.05 ? "green" : margin > -0.02 ? "amber" : "red";

      snapshots.push({
        name: scenario.name,
        y5Revenue: fmt(revenue),
        y5NetIncome: fmt(netIncome),
        y5Margin: `${(margin * 100).toFixed(1)}%`,
        signal,
      });
    } catch {
      continue;
    }
  }

  return snapshots;
}

function buildFinancialOutlook(co: ConsultantOutput): BoardPacket["financialOutlook"] {
  const atRisk = co.healthSignals.filter((s) => s.status === "at_risk").length;
  const watch = co.healthSignals.filter((s) => s.status === "watch").length;
  const healthy = co.healthSignals.filter((s) => s.status === "healthy").length;

  let status: "healthy" | "watch" | "needs_attention";
  let headline: string;

  if (atRisk === 0 && watch <= 1) {
    status = "healthy";
    headline = "The school's financial outlook is strong.";
  } else if (atRisk <= 1) {
    status = "watch";
    headline = "The financial outlook is stable but has areas to monitor.";
  } else {
    status = "needs_attention";
    headline = "The financial outlook needs attention in several areas.";
  }

  const parts: string[] = [];
  if (healthy > 0) parts.push(`${healthy} health dimension${healthy > 1 ? "s are" : " is"} in good standing`);
  if (watch > 0) parts.push(`${watch} should be monitored`);
  if (atRisk > 0) parts.push(`${atRisk} need${atRisk > 1 ? "" : "s"} prompt attention`);

  return { headline, status, summary: parts.join(", ") + "." };
}

function simplifyExecutiveSummary(section: PacketSection, co: ConsultantOutput): PacketSection {
  const cashText = co.cashRunwayMonths >= 60
    ? "Cash flow remains positive over the full 5-year period."
    : `The school has approximately ${co.cashRunwayMonths} months of cash runway.`;

  const narrative = `${co.executiveSummary} ${cashText}`;

  return {
    ...section,
    title: "Financial Overview",
    narrative,
  };
}

function simplifyRisksForBoard(section: PacketSection, co: ConsultantOutput): PacketSection {
  const risks = co.topIssues.slice(0, 3);
  if (risks.length === 0) {
    return {
      ...section,
      title: "What to Watch",
      narrative: "No significant financial risks have been identified at this time. Continue monitoring key metrics as the model develops.",
    };
  }

  const rows: PacketTableRow[] = risks.map((issue) => ({
    label: issue.title,
    values: [issue.whyItMatters, issue.recommendedAction],
    isBold: issue.severity === "critical",
  }));

  return {
    ...section,
    title: "What to Watch",
    narrative: `There are ${risks.length} area${risks.length > 1 ? "s" : ""} the board should keep an eye on.`,
    tables: [{
      title: "Key Risks & Suggested Actions",
      headers: ["Risk", "Why It Matters", "What to Do"],
      rows,
    }],
  };
}

function enrichBoardActions(section: PacketSection, co: ConsultantOutput): PacketSection {
  return {
    ...section,
    title: "Recommended Next Steps",
  };
}

/**
 * Mapping of board packet section IDs to the rationale roll-up they should
 * pull their "Founder's reasoning:" footer from. Sections not in this map
 * are untouched. Task #331.
 */
const BOARD_SECTION_RATIONALE_KEY: Partial<Record<SectionId, RationaleSectionKey>> = {
  enrollment_plan: "enrollmentStrategy",
  revenue_model: "revenueAssumptions",
  staffing_plan: "staffingPhilosophy",
  expense_summary: "expenseAssumptions",
  capital_debt: "riskMitigation",
  debt_service: "riskMitigation",
  key_risks: "riskMitigation",
};

function appendFounderReasoningBoard(
  section: PacketSection,
  rollups: Record<RationaleSectionKey, SectionRationaleRollup>,
): PacketSection {
  const rkey = BOARD_SECTION_RATIONALE_KEY[section.id];
  if (!rkey) return section;
  const rollup = rollups[rkey];
  if (!rollup || !rollup.text) return section;
  return {
    ...section,
    narrative: withFounderReasoning(section.narrative, rollup.text),
  };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
