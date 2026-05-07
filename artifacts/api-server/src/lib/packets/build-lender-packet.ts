import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import type { AssumptionFlag } from "../assumption-flags";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../benchmark-thresholds";
import {
  computeForecastAccuracy,
  filterForecastAccuracy,
  computeBaseFinancials,
  computeDownsideBand,
  type ForecastAccuracyFilter,
  type ForecastAccuracyRollup,
  type DecisionEngineModelData,
  type DownsideBand,
  type LenderStressTestResults,
} from "@workspace/finance";
import { buildPacketData } from "./build-packet-data";
import {
  buildNarrativeBundle,
  buildLenderCommentary,
  type NarrativeCommentary,
} from "./build-narrative-commentary";
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
  /**
   * Task #659 — per-assumption Confidence + evidence note collected by
   * the wizard's AssumptionConfidenceCard. Keyed by AssumptionKey from
   * lib/finance/src/assumption-registry.ts. The PDF / workbook render an
   * "Assumptions Confidence" section grouping entries by step so a
   * lender can see, at a glance, which numbers are anchored vs. an
   * estimate. Empty record when no founder confidence data exists.
   */
  assumptionConfidence: Record<
    string,
    { confidence: "actuals" | "signed_agreement" | "quote" | "research" | "estimate"; evidenceNote?: string }
  >;
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
  /**
   * Break-even & downside sensitivity (Task #612). Per-year break-even
   * students + utilization vs `schoolProfile.maxCapacity`, plus a -10% /
   * -20% enrollment downside band showing DSCR and ending cash impact.
   * The PDF renderer surfaces this as the "Break-even & Downside" section.
   */
  breakEvenDownside: BreakEvenDownsideExport;
  /**
   * Task #616 — fixed lender stress-test battery (-10/-20% enrollment, ESA
   * delay, rent shock, founder normalization). Pulled straight off
   * `consultantOutput.lenderStressTests` so the packet, dashboard, and
   * workbook all show identical numbers.
   */
  lenderStressTests: LenderStressTestResults;
  /**
   * Task #617 - lender-ready narrative commentary block. Renders as the
   * lead block in the PDF (after the one-page summary, before the
   * executive summary) and surfaces in the in-app preview with a
   * "Regenerate" affordance. Every numeric figure in `paragraphs` is
   * present in `allowedFigures` (guard test enforces).
   */
  lenderCommentary: NarrativeCommentary;
}

export interface BreakEvenDownsideExport {
  breakEvenStudents: Array<number | null>;
  breakEvenUtilization: Array<number | null>;
  maxCapacity: number | null;
  enrollment: number[];
  downsideBand: DownsideBand;
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
    // Task #611: surface the founder-comp normalization adjustment on the
    // staffing section. Lenders / boards underwrite to the *market* cost of
    // running the school, not the founder's voluntary discount, so the
    // packet uses the normalized view as primary and prints the per-year
    // delta vs the as-planned comp the founder actually plans to draw.
    if (next.id === "staffing_plan") {
      next = enrichStaffingPlanSection(next, consultantOutput);
    }
    return appendFounderReasoning(next, rollups);
  });

  const dscrSummary = extractDSCRSummary(consultantOutput, modelData);

  const raw = modelData as unknown as Record<string, unknown>;
  const budgetNarrative: BudgetNarrativeData = (raw.budgetNarrative as BudgetNarrativeData) || {};
  // Task #659 — pull-through. The shape is enforced upstream by zod
  // (`assumptionConfidenceSchema` in the wizard schema), so a permissive
  // cast through unknown is safe here.
  const assumptionConfidence =
    (raw.assumptionConfidence as LenderPacket["assumptionConfidence"]) || {};
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

  // Break-even & downside sensitivity — Task #612. Computed from the same
  // canonical engine that powers the dashboard card and scenario planner so
  // every surface shows identical numbers.
  const engineData = modelData as unknown as DecisionEngineModelData;
  const baseMetrics = computeBaseFinancials(engineData);
  const downsideBand = computeDownsideBand(engineData);
  const spRaw = (modelData as unknown as Record<string, unknown>).schoolProfile as Record<string, unknown> | undefined;
  const maxCapRaw = spRaw?.maxCapacity;
  const maxCapacity = typeof maxCapRaw === "number" && maxCapRaw > 0 ? maxCapRaw : null;
  const breakEvenDownside: BreakEvenDownsideExport = {
    breakEvenStudents: baseMetrics.breakEvenStudents,
    breakEvenUtilization: baseMetrics.breakEvenUtilization,
    maxCapacity,
    enrollment: baseMetrics.enrollment,
    downsideBand,
  };

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
    assumptionConfidence,
    flaggedAssumptions,
    decisionHistory,
    cashRunway,
    forecastAccuracy,
    forecastAccuracyFilter: normalizedFilter,
    forecastAccuracyUnfilteredCount: fullForecastAccuracy.entries.length,
    breakEvenDownside,
    // Task #616 — pull-through from the consultant output. The engine
    // already ran the stress battery off the same canonical model the rest
    // of the packet is built from, so reusing that result keeps every
    // surface (dashboard, PDF, workbook) reconciled.
    lenderStressTests: consultantOutput.lenderStressTests,
    // Task #617 - deterministic lender commentary, built from a typed
    // source bundle so every numeric figure in the paragraphs reconciles
    // to the canonical engine output (guard test enforces no hallucinations).
    lenderCommentary: buildLenderCommentary(
      buildNarrativeBundle(modelData, consultantOutput),
    ),
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
      // Task #686 — `nextStep` is a required field on every DecisionIssue.
      mitigant: `${issue.recommendedAction} Next step: ${issue.nextStep}`,
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
 * Task #611: Append the founder-compensation normalization view to the
 * staffing section so the lender / board reader sees both:
 *   - what the founder *plans to draw* (as planned, dashboard primary), and
 *   - what a market-rate hire in the same role would cost (normalized,
 *     packet primary).
 * The per-year delta is the adjustment that flows through to staffing
 * cost, net income, and DSCR on the normalized view. When the founder is
 * already paying market rate (or no leadership row exists), there's
 * nothing to normalize and we leave the section unchanged.
 */
function enrichStaffingPlanSection(
  section: PacketSection,
  co: ConsultantOutput,
): PacketSection {
  const nv = co.normalizedView;
  if (!nv || !nv.founderComp.hasAdjustment) return section;

  const fc = nv.founderComp;
  const yearCount = fc.delta.length;
  const fmtUSD = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const rows: PacketTableRow[] = [];
  for (let y = 0; y < yearCount; y++) {
    rows.push({
      label: `Year ${y + 1}`,
      values: [
        fmtUSD(fc.reported[y] || 0),
        fmtUSD(fc.normalized[y] || 0),
        fmtUSD(fc.delta[y] || 0),
      ],
    });
  }
  rows.push({
    label: "Total adjustment (Y1–Y" + yearCount + ")",
    values: ["—", "—", fmtUSD(fc.totalDelta)],
    isBold: true,
  });

  const normalizationTable: PacketTable = {
    title: "Founder Compensation Normalization",
    headers: ["Year", "As Planned (Reported)", "Market Rate (Normalized)", "Loaded Adjustment"],
    rows,
  };

  // Per-year DSCR / net income / runway comparison gives the lender the
  // headline "what changes when we normalize" in one glance.
  const cmpRows: PacketTableRow[] = [];
  for (let y = 0; y < yearCount; y++) {
    cmpRows.push({
      label: `Year ${y + 1}`,
      values: [
        fmtUSD(nv.reported.netIncome[y] || 0),
        fmtUSD(nv.normalized.netIncome[y] || 0),
        (nv.reported.dscr[y] ?? 0).toFixed(2) + "x",
        (nv.normalized.dscr[y] ?? 0).toFixed(2) + "x",
      ],
    });
  }
  const comparisonTable: PacketTable = {
    title: "As-Planned vs Normalized: Net Income & DSCR",
    headers: ["Year", "Net Income (Reported)", "Net Income (Normalized)", "DSCR (Reported)", "DSCR (Normalized)"],
    rows: cmpRows,
  };

  const runwayTable: PacketTable = {
    title: "As-Planned vs Normalized: Cash Runway",
    headers: ["View", "Cash Runway (months)", "Reserve (months)"],
    rows: [
      {
        label: "As Planned (Reported)",
        values: [
          (nv.reported.cashRunwayMonths ?? 0).toFixed(1),
          (nv.reported.reserveMonths ?? 0).toFixed(1),
        ],
      },
      {
        label: "Lender View (Normalized)",
        values: [
          (nv.normalized.cashRunwayMonths ?? 0).toFixed(1),
          (nv.normalized.reserveMonths ?? 0).toFixed(1),
        ],
      },
    ],
  };

  const totalLabel = fc.totalDelta >= 0 ? "increases" : "decreases";
  const sign = fc.totalDelta >= 0 ? "+" : "";
  const dscrR = nv.reported.dscr[0] ?? 0;
  const dscrN = nv.normalized.dscr[0] ?? 0;
  const runR = nv.reported.cashRunwayMonths ?? 0;
  const runN = nv.normalized.cashRunwayMonths ?? 0;
  const adjNarrative =
    `Founder compensation is normalized to market rate for the lender / board view. ` +
    `The 5-year normalization adjustment ${totalLabel} fully-loaded staffing cost by ${sign}${fmtUSD(fc.totalDelta)} ` +
    `(salary + benefits + payroll tax). Year-1 DSCR moves from ${dscrR.toFixed(2)}x to ${dscrN.toFixed(2)}x and ` +
    `cash runway moves from ${runR.toFixed(1)} to ${runN.toFixed(1)} months when normalized. ` +
    `DSCR, runway, and net income figures elsewhere in this packet reflect the normalized view; ` +
    `the founder dashboard reflects the as-planned view.`;

  return {
    ...section,
    narrative: section.narrative
      ? section.narrative.trimEnd() + " " + adjNarrative
      : adjNarrative,
    tables: [...(section.tables || []), normalizationTable, comparisonTable, runwayTable],
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
