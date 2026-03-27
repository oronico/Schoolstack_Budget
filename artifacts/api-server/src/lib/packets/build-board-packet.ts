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
} from "../workbook-helpers";
import { buildPacketData } from "./build-packet-data";
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

export interface CashRunwayView {
  runwayMonths: number;
  runwayLabel: string;
  status: "good" | "warning" | "danger";
  yearByYearCash: { year: number; cumulative: string; reserveMonths: string }[];
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
}

const BOARD_PACKET_SECTIONS: SectionId[] = [
  "cover",
  "executive_summary",
  "school_overview",
  "five_year_projection",
  "health_assessment",
  "key_strengths",
  "key_risks",
  "cash_flow",
  "board_action_items",
];

export function buildBoardPacket(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  modelId: number,
): BoardPacket {
  const basePacket = buildPacketData({
    modelData,
    consultantOutput,
    modelId,
    packetType: "board",
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

  const enrichedSections = filteredSections.map((section) => {
    if (section.id === "executive_summary") {
      return simplifyExecutiveSummary(section, consultantOutput);
    }
    if (section.id === "key_risks") {
      return simplifyRisksForBoard(section, consultantOutput);
    }
    if (section.id === "board_action_items") {
      return enrichBoardActions(section, consultantOutput);
    }
    return section;
  });

  const topRisks = buildTopRisks(consultantOutput);
  const focusAreas = buildFocusAreas(consultantOutput);
  const scenarioSnapshots = buildScenarioSnapshots(modelData, consultantOutput);
  const cashRunway = buildCashRunway(consultantOutput);
  const financialOutlook = buildFinancialOutlook(consultantOutput);

  return {
    ...basePacket,
    sections: enrichedSections,
    topRisks,
    focusAreas,
    scenarioSnapshots,
    cashRunway,
    financialOutlook,
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
  const salaryEsc = (sp as Record<string, unknown>).salaryEscalation as number | undefined;
  const costInflPct = (sp as Record<string, unknown>).costInflationPct as number | undefined;
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
      const baseOpex = computeExpenseForYear(md.expenseRows || [], y, students, revenue, costInflPct, bns, brs);
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

function buildCashRunway(co: ConsultantOutput): CashRunwayView {
  const months = co.cashRunwayMonths;
  const status: "good" | "warning" | "danger" =
    months >= 36 ? "good" : months >= 18 ? "warning" : "danger";

  const runwayLabel = months >= 60
    ? "Cash remains positive through the full 5-year projection"
    : `Cash runway is approximately ${months} months`;

  const yearByYearCash = co.cumulativeFinancials.map((cf) => ({
    year: cf.year,
    cumulative: fmt(cf.cumulativeNetIncome),
    reserveMonths: `${cf.reserveMonths.toFixed(1)} mo`,
  }));

  return { runwayMonths: months, runwayLabel, status, yearByYearCash };
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

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
