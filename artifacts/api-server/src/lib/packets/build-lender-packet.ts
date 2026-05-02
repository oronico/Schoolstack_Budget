import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import type { AssumptionFlag } from "../assumption-flags";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../benchmark-thresholds";
import {
  computeForecastAccuracy,
  filterForecastAccuracy,
  type ForecastAccuracyFilter,
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
  decisionHistory: DecisionHistoryItem[];
  /**
   * Year-by-year ending cash position with the trough year called out.
   * Sourced from the same helper as the board packet so both deliverables
   * show identical numbers (Task #213).
   */
  cashRunway: CashRunwayView;
  // Projected-vs-actual roll-up across every Pursued saved scenario that has
  // realized actuals captured. Empty arrays when no eligible scenarios exist
  // — the PDF renderer skips the section gracefully in that case (Task #216).
  // When the founder triggered the export with a filter active on the
  // on-screen Forecast Accuracy view (`?metric=…&asOfYear=…`), this carries
  // the *filtered* slice and `forecastAccuracyFilter` records which slice was
  // applied so the renderer can call it out (Task #391).
  forecastAccuracy: ForecastAccuracyRollup;
  // The metric / year filter that was active when the founder downloaded the
  // packet. `null` when no filter was forwarded — the PDF then renders the
  // full population with no caption, identical to pre-Task-#391 behavior.
  forecastAccuracyFilter: ForecastAccuracyFilter | null;
  // Population size *before* `forecastAccuracyFilter` was applied. Used by
  // the renderer to print "(N of M scenarios)" so the reader can tell at a
  // glance how aggressive the slice was.
  forecastAccuracyUnfilteredCount: number;
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
  personaComfort?: "new_to_budgeting" | "comfortable" | null,
  // Optional metric / year slice the founder had active on the on-screen
  // Forecast Accuracy view when they triggered the export. We apply it to the
  // computed roll-up so the lender sees the same slice the founder did, and
  // record it on the returned packet so the PDF renderer can print a
  // "Filtered to ..." caption identifying which view was exported (Task #391).
  forecastAccuracyFilter?: ForecastAccuracyFilter | null,
): LenderPacket {
  const basePacket = buildPacketData({
    modelData,
    consultantOutput,
    modelId,
    packetType: "lender",
    personaComfort: personaComfort ?? null,
  });

  const riskMitigants = buildRiskMitigants(consultantOutput);

  // Build the year-by-year ending cash + trough view first so the debt-service
  // section enrichment can fold the per-year ending cash into its reserve
  // table (Task #213).
  const cashRunway = buildCashRunway(consultantOutput, modelData);

  // Roll up the inline rationales captured during the wizard so we can append
  // a "Founder's reasoning:" footer to each matching section's narrative
  // (Task #331). When no rationale exists for a section, the narrative is
  // unchanged.
  const rollups = buildAllRollups(modelData);

  const enrichedSections = basePacket.sections.map((section) => {
    let next = section;
    if (next.id === "key_risks") {
      next = enrichKeyRisksSection(next, riskMitigants);
    }
    if (next.id === "debt_service") {
      next = enrichDebtServiceSection(next, consultantOutput, cashRunway);
    }
    return appendFounderReasoning(next, rollups);
  });

  const dscrSummary = extractDSCRSummary(consultantOutput, modelData);

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

  const decisionHistory = buildDecisionHistory(modelData);
  // Forecast accuracy roll-up — same shared engine the planner UI uses, so
  // the founder, lender, and board see identical projected-vs-actual numbers.
  // Cast: api-server's strict zod-typed `ModelData` is a structural subset
  // of finance's permissive `FullModelData` (which uses index signatures on
  // its sub-shapes); routing through `unknown` matches the convention used
  // by every other api-server → finance call site in this folder.
  const fullForecastAccuracy = computeForecastAccuracy(modelData as unknown as DecisionEngineModelData);
  // When the founder triggered the export with a filter active on the
  // on-screen Forecast Accuracy view, slice the roll-up so the printable
  // packet mirrors what they were looking at (Task #391). When no filter is
  // forwarded, `filterForecastAccuracy` short-circuits and returns the full
  // roll-up unchanged.
  const normalizedFilter = normalizeForecastAccuracyFilter(forecastAccuracyFilter);
  const forecastAccuracy = normalizedFilter
    ? filterForecastAccuracy(fullForecastAccuracy, normalizedFilter)
    : fullForecastAccuracy;

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
    decisionHistory,
    cashRunway,
    forecastAccuracy,
    forecastAccuracyFilter: normalizedFilter,
    forecastAccuracyUnfilteredCount: fullForecastAccuracy.entries.length,
  };
}

// Collapse `{ metric: null, asOfYear: null }` (or an all-undefined object)
// down to `null` so downstream code only has to check one condition. Both
// the lender and board builders share the same normalization, hence a
// helper rather than two inline ternaries.
function normalizeForecastAccuracyFilter(
  filter: ForecastAccuracyFilter | null | undefined,
): ForecastAccuracyFilter | null {
  if (!filter) return null;
  const metric = filter.metric ?? null;
  const asOfYear = filter.asOfYear ?? null;
  if (!metric && asOfYear === null) return null;
  return { metric, asOfYear };
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
  cashRunway: CashRunwayView,
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

  // Pair each reserve year with its ending cash position (Task #213). Ending
  // cash is what lenders ask for directly — reserve months alone hides whether
  // the school is dipping toward zero in any given year. The trough year is
  // labeled inline so it stands out in both the preview and the PDF.
  const cashByYear = new Map(cashRunway.yearByYearCash.map((c) => [c.year, c]));

  const reserveTable: PacketTable = {
    title: "Operating Reserve & Ending Cash",
    headers: ["Year", "Ending Cash", "Reserve Months", "Status"],
    rows: co.cumulativeFinancials.map((cf) => {
      const cash = cashByYear.get(cf.year);
      const yearLabel = cash?.isTrough ? `Year ${cf.year} (trough)` : `Year ${cf.year}`;
      return {
        label: yearLabel,
        values: [
          cash?.endingCash ?? "—",
          `${cf.reserveMonths.toFixed(1)} months`,
          cf.reserveMonths >= 3 ? "Adequate" : cf.reserveMonths >= 1.5 ? "Below Target" : "Insufficient",
        ],
        isBold: cash?.isTrough ?? false,
      };
    }),
  };

  return {
    ...section,
    linkedMetrics: [...section.linkedMetrics, ...reserveMetrics],
    tables: [...(section.tables || []), reserveTable],
  };
}

/**
 * Mapping of packet section IDs to the rationale roll-up they should pull
 * their "Founder's reasoning:" footer from. Sections not in this map are
 * untouched. Task #331.
 */
const SECTION_RATIONALE_KEY: Partial<Record<SectionId, RationaleSectionKey>> = {
  enrollment_plan: "enrollmentStrategy",
  revenue_model: "revenueAssumptions",
  staffing_plan: "staffingPhilosophy",
  expense_summary: "expenseAssumptions",
  capital_debt: "riskMitigation",
  debt_service: "riskMitigation",
  key_risks: "riskMitigation",
};

function appendFounderReasoning(
  section: PacketSection,
  rollups: Record<RationaleSectionKey, SectionRationaleRollup>,
): PacketSection {
  const rkey = SECTION_RATIONALE_KEY[section.id];
  if (!rkey) return section;
  const rollup = rollups[rkey];
  if (!rollup || !rollup.text) return section;
  return {
    ...section,
    narrative: withFounderReasoning(section.narrative, rollup.text),
  };
}

function extractDSCRSummary(co: ConsultantOutput, modelData?: ModelData): DSCRSummary | null {
  const dscrMetric = co.keyMetrics.find(
    (m) => m.name.toLowerCase().includes("dscr") || m.name.toLowerCase().includes("debt service coverage"),
  );

  if (!dscrMetric) return null;

  const ct = modelData?.covenantThresholds as { dscrByYear?: number[] } | undefined;
  const dscrByYear = ct?.dscrByYear && ct.dscrByYear.length === 5 ? ct.dscrByYear : null;
  let benchmarkText: string;
  if (dscrByYear) {
    benchmarkText = `Step-up: ${dscrByYear.map((v, i) => `Y${i + 1} ≥${v.toFixed(2)}x`).join(", ")}`;
  } else {
    benchmarkText = dscrMetric.benchmark || `Minimum: ${BENCHMARK_DSCR_AMBER.toFixed(2)}x; target: ${BENCHMARK_DSCR_GREEN.toFixed(2)}x`;
  }

  return {
    currentDSCR: dscrMetric.value,
    status: dscrMetric.status as "good" | "warning" | "danger",
    benchmark: benchmarkText,
    trendDescription: dscrMetric.interpretation,
  };
}
