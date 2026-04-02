import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import type { AssumptionFlag } from "../assumption-flags";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../benchmark-thresholds";
import { buildPacketData } from "./build-packet-data";
import type { PacketData, PacketSection, PacketTable, PacketTableRow, LinkedMetric } from "./packet-types";

export interface RiskMitigant {
  risk: string;
  severity: "critical" | "high" | "medium";
  mitigant: string;
  whyItMatters: string;
  supportingMetrics: { label: string; value: string }[];
}

export interface BudgetNarrativeData {
  missionAndVision?: string;
  enrollmentStrategy?: string;
  retentionPlan?: string;
  revenueAssumptions?: string;
  staffingPhilosophy?: string;
  expenseAssumptions?: string;
  growthStrategy?: string;
  riskMitigation?: string;
  additionalContext?: string;
}

export interface FlaggedAssumptionExport {
  flag: AssumptionFlag;
  userExplanation: string;
}

export interface LenderPacket extends PacketData {
  riskMitigants: RiskMitigant[];
  dscrSummary: DSCRSummary | null;
  lenderReadiness: {
    status: "Strong" | "Needs Work" | "Not Yet Ready";
    explanation: string;
  };
  budgetNarrative: BudgetNarrativeData;
  flaggedAssumptions: FlaggedAssumptionExport[];
}

export interface DSCRSummary {
  currentDSCR: string;
  status: "good" | "warning" | "danger";
  benchmark: string;
  trendDescription: string;
}

export function buildLenderPacket(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  modelId: number,
): LenderPacket {
  const basePacket = buildPacketData({
    modelData,
    consultantOutput,
    modelId,
    packetType: "lender",
  });

  const riskMitigants = buildRiskMitigants(consultantOutput);

  const enrichedSections = basePacket.sections.map((section) => {
    if (section.id === "key_risks") {
      return enrichKeyRisksSection(section, riskMitigants);
    }
    if (section.id === "debt_service") {
      return enrichDebtServiceSection(section, consultantOutput);
    }
    return section;
  });

  const dscrSummary = extractDSCRSummary(consultantOutput);

  const raw = modelData as unknown as Record<string, unknown>;
  const budgetNarrative: BudgetNarrativeData = (raw.budgetNarrative as BudgetNarrativeData) || {};
  const flagResponses = (raw.assumptionFlagResponses as Array<{ field: string; flagType: string; reason: string }>) || [];
  const assumptionFlags = consultantOutput.assumptionFlags || [];

  const flaggedAssumptions: FlaggedAssumptionExport[] = assumptionFlags.map(flag => {
    const response = flagResponses.find(r => r.flagType === flag.flagType && r.field === flag.field);
    return {
      flag,
      userExplanation: response?.reason || "",
    };
  });

  return {
    ...basePacket,
    sections: enrichedSections,
    riskMitigants,
    dscrSummary,
    lenderReadiness: {
      status: consultantOutput.lenderReadiness,
      explanation: consultantOutput.lenderReadinessExplanation,
    },
    budgetNarrative,
    flaggedAssumptions,
  };
}

function buildRiskMitigants(co: ConsultantOutput): RiskMitigant[] {
  const mitigants: RiskMitigant[] = [];

  for (const issue of co.topIssues) {
    mitigants.push({
      risk: issue.title,
      severity: issue.severity,
      mitigant: issue.recommendedAction,
      whyItMatters: issue.whyItMatters,
      supportingMetrics: issue.supportingMetrics,
    });
  }

  const coveredRisks = new Set(mitigants.map((m) => m.risk.toLowerCase()));

  for (const signal of co.healthSignals) {
    if (signal.status !== "at_risk") continue;
    const dimension = signal.dimension.replace(/_/g, " ");
    const title = dimension.charAt(0).toUpperCase() + dimension.slice(1);
    if (coveredRisks.has(title.toLowerCase())) continue;

    mitigants.push({
      risk: title,
      severity: "high",
      mitigant: buildSignalMitigant(signal.dimension),
      whyItMatters: signal.explanation,
      supportingMetrics: [{ label: dimension, value: signal.label }],
    });
  }

  return mitigants.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
}

function severityOrder(s: "critical" | "high" | "medium"): number {
  if (s === "critical") return 0;
  if (s === "high") return 1;
  return 2;
}

function buildSignalMitigant(dimension: string): string {
  const mitigants: Record<string, string> = {
    viability: "Review revenue assumptions and cost structure to ensure operating margins support long-term sustainability.",
    liquidity: "Build operating reserves through fundraising, lines of credit, or phased expense deployment to maintain adequate cash position.",
    staffing_burden: "Evaluate staffing ratios against enrollment growth and consider phased hiring aligned to revenue milestones.",
    facility_burden: "Negotiate facility costs or explore co-location to keep occupancy below 15-20% of total revenue.",
    debt_affordability: "Restructure debt terms, extend maturities, or increase operating income to improve Debt Service Coverage Ratio.",
    revenue_concentration: "Strengthen enrollment pipeline evidence (waitlist, LOIs, retention data) and ensure revenue is anchored to demand-driven income rather than uncertain grants.",
    reserve_strength: "Establish a reserve fund policy targeting 3-6 months of operating expenses.",
  };
  return mitigants[dimension] || "Monitor this metric and develop a remediation plan if trends persist.";
}

function enrichKeyRisksSection(
  section: PacketSection,
  riskMitigants: RiskMitigant[],
): PacketSection {
  if (riskMitigants.length === 0) return section;

  const riskRows: PacketTableRow[] = riskMitigants.map((rm) => ({
    label: rm.risk,
    values: [
      rm.severity.toUpperCase(),
      rm.whyItMatters,
      rm.mitigant,
    ],
    isBold: rm.severity === "critical",
  }));

  const riskTable: PacketTable = {
    title: "Risk Assessment & Mitigation Strategies",
    headers: ["Risk Factor", "Severity", "Impact", "Recommended Mitigation"],
    rows: riskRows,
  };

  const narrative = riskMitigants.length > 0
    ? `${riskMitigants.length} risk factor${riskMitigants.length > 1 ? "s" : ""} ${riskMitigants.length > 1 ? "have" : "has"} been identified. ${
        riskMitigants.filter((r) => r.severity === "critical").length > 0
          ? `Of these, ${riskMitigants.filter((r) => r.severity === "critical").length} ${riskMitigants.filter((r) => r.severity === "critical").length > 1 ? "are" : "is"} rated critical and should be addressed prior to lender submission.`
          : "None are rated critical, but each should have a documented mitigation plan."
      }`
    : section.narrative;

  return {
    ...section,
    narrative,
    tables: [riskTable, ...(section.tables || [])],
  };
}

function enrichDebtServiceSection(
  section: PacketSection,
  co: ConsultantOutput,
): PacketSection {
  const reserveMetrics: LinkedMetric[] = [];

  for (const cf of co.cumulativeFinancials) {
    reserveMetrics.push({
      label: `Year ${cf.year} Reserve Months`,
      value: `${cf.reserveMonths.toFixed(1)} months`,
      status: cf.reserveMonths >= 3 ? "good" : cf.reserveMonths >= 1.5 ? "warning" : "danger",
      benchmark: "Target: 3+ months",
      sourceEngine: "consultant",
    });
  }

  const reserveTable: PacketTable = {
    title: "Operating Reserve Analysis",
    headers: ["Year", "Reserve Months", "Status"],
    rows: co.cumulativeFinancials.map((cf) => ({
      label: `Year ${cf.year}`,
      values: [
        `${cf.reserveMonths.toFixed(1)} months`,
        cf.reserveMonths >= 3 ? "Adequate" : cf.reserveMonths >= 1.5 ? "Below Target" : "Insufficient",
      ],
    })),
  };

  return {
    ...section,
    linkedMetrics: [...section.linkedMetrics, ...reserveMetrics],
    tables: [...(section.tables || []), reserveTable],
  };
}

function extractDSCRSummary(co: ConsultantOutput): DSCRSummary | null {
  const dscrMetric = co.keyMetrics.find(
    (m) => m.name.toLowerCase().includes("dscr") || m.name.toLowerCase().includes("debt service coverage"),
  );

  if (!dscrMetric) return null;

  return {
    currentDSCR: dscrMetric.value,
    status: dscrMetric.status as "good" | "warning" | "danger",
    benchmark: dscrMetric.benchmark || `Minimum: ${BENCHMARK_DSCR_AMBER.toFixed(2)}x; target: ${BENCHMARK_DSCR_GREEN.toFixed(2)}x`,
    trendDescription: dscrMetric.interpretation,
  };
}
