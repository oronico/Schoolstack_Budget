import type { ConsultantOutput } from "../consultant-engine";
import { formatCapCallout } from "../lender-readiness-caps";
import type { ModelData } from "../workbook-helpers";
import type { AssumptionFlag } from "../assumption-flags";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../benchmark-thresholds";
import {
  computeForecastAccuracy,
  filterForecastAccuracy,
  computeBaseFinancials,
  computeDownsideBand,
  computeProgramBreakEven,
  computeSensitivityGrid,
  computeFounderCompNormalization,
  buildPerSeatFundingMix,
  type ForecastAccuracyFilter,
  type ForecastAccuracyRollup,
  type DecisionEngineModelData,
  type DownsideBand,
  type LenderStressTestResults,
  type PerSeatFundingMix,
  type ProgramBreakEven,
  type SensitivityGrid,
  getFounderCompBenchmarkPerYear,
  getFounderCompBandTransitions,
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
  /**
   * Task #706 / #740 — founder-editable Board / Grant / Lender narrative
   * drafts. The Lender Narrative wizard step seeds each draft from the
   * canonical engine when blank and then exposes it as an editable
   * textarea. The PDF exports embed the founder's edited prose when
   * present, falling back to the deterministic
   * `buildLenderCommentary` / `buildBoardCommentary` /
   * `buildGrantCommentary` output so the figure-allowlist guard still
   * applies to the auto-drafts.
   */
  audienceDrafts?: {
    board?: string;
    grant?: string;
    lender?: string;
  };
}

export interface FlaggedAssumptionExport {
  flag: AssumptionFlag;
  userExplanation: string;
}

/**
 * Task #699 — Founder compensation breakdown surfaced in the lender and
 * board packet PDFs. Mirrors the labeled "Founder compensation" block the
 * Excel export now renders (Task #692): per-year reported (as planned),
 * fully-loaded reported, normalized (market rate), fully-loaded
 * normalized, and the lender adjustment delta. `notPayingYet` carries the
 * founder's "not paying yet" toggle so the renderer can surface the
 * matching note. `null` when none of (`hasReported`, `notPayingYet`,
 * `hasAdjustment`) is true — same gate as the workbook.
 */
export interface FounderCompPdfBlock {
  reported: number[];
  reportedLoaded: number[];
  normalized: number[];
  normalizedLoaded: number[];
  delta: number[];
  totalDelta: number;
  hasAdjustment: boolean;
  notPayingYet: boolean;
}

export function buildFounderCompPdfBlock(modelData: ModelData): FounderCompPdfBlock | null {
  const fc = computeFounderCompNormalization(
    modelData as unknown as Parameters<typeof computeFounderCompNormalization>[0],
  );
  const stRaw = ((modelData as unknown as Record<string, unknown>).staffing || {}) as Record<string, unknown>;
  const notPayingYet = stRaw.notPayingFounderYet === true;
  const hasReported = fc.reported.some((v) => v > 0);
  if (!hasReported && !notPayingYet && !fc.hasAdjustment) return null;
  return {
    reported: fc.reported,
    reportedLoaded: fc.reportedLoaded,
    normalized: fc.normalized,
    normalizedLoaded: fc.normalizedLoaded,
    delta: fc.delta,
    totalDelta: fc.totalDelta,
    hasAdjustment: fc.hasAdjustment,
    notPayingYet,
  };
}

export interface LenderPacket extends PacketData {
  riskMitigants: RiskMitigant[];
  dscrSummary: DSCRSummary | null;
  lenderReadiness: {
    status: "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";
    explanation: string;
    /**
     * Task #929 — Structured Confidence-Gated Rating result. Carries
     * both the uncapped rating the metrics produced and the effective
     * rating consumers must display, plus the cap payload that drives
     * the cap callout. The PDF cover and the in-app preview both read
     * this via `formatCapCallout` so a founder and a lender see one
     * verbatim sentence end-to-end. Re-encoded as plain JSON
     * (matching `LenderReadinessResult`) for transport.
     */
    result: {
      uncappedRating: "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";
      effectiveRating: "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";
      cap: {
        applied: boolean;
        reason: string;
        pendingEvidenceCount: number;
        totalAssumptionCount: number;
        taggedCount: number;
        taggedFraction: number;
        capTier: {
          taggedFractionMin: number;
          taggedFractionMax: number;
          capAt: "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready" | null;
          rationale: string;
          source: string;
          lastValidated: string;
        };
      };
      // Canonical callout copy already formatted via `formatCapCallout`.
      // Empty string when no cap bites; consumers render iff non-empty.
      callout: string;
    };
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
  /**
   * Task #860 EXPANDED — Per-seat funding mix for Year 1, computed via
   * the same engine helper that powers the dashboard card and consultant
   * view, so the lender PDF agrees with every other surface on how each
   * seat is funded (sticker → net → ESA / voucher / tax-credit funders →
   * residual family pay). `null` for models with no per-student tuition
   * row (e.g. fully-grant-funded microschool variants).
   */
  perSeatFundingMixY1: PerSeatFundingMix | null;
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
   * Task #668 — per-program break-even for Year 1. Surfaces "which programs
   * carry the school?" in the lender packet PDF (the planner already shows
   * this on screen). For each program: students enrolled, students needed
   * to break even on its allocated fixed-cost share, the allocated fixed
   * cost itself, and the surplus / subsidy the program contributes today.
   * Computed from the canonical `computeProgramBreakEven` helper so the
   * dashboard, scenario planner, and lender PDF all reconcile. Empty array
   * when the founder has not defined any programs.
   */
  programBreakEvenY1: ProgramBreakEven[];
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
  /**
   * Task #699 — Founder compensation breakdown for the lender PDF (and
   * mirrored on the board PDF). Built from `computeFounderCompNormalization`
   * so the per-year reported / normalized / adjustment numbers match the
   * Excel export, the in-app dashboard, and the staffing-section
   * normalization tables. `null` when there is no reported pay, no "not
   * paying yet" toggle, and no adjustment — same gate as the workbook.
   */
  founderCompNormalization: FounderCompPdfBlock | null;
}

export interface BreakEvenDownsideExport {
  breakEvenStudents: Array<number | null>;
  breakEvenUtilization: Array<number | null>;
  maxCapacity: number | null;
  enrollment: number[];
  downsideBand: DownsideBand;
  /**
   * Task #628 — two-variable sensitivity grid (enrollment delta × tuition
   * delta). Rendered as a heatmap-style table in the lender PDF so a
   * reviewer can answer "what if enrollment is down 10% AND we can't push
   * tuition the planned 5%?" in one glance.
   */
  sensitivityGrid: SensitivityGrid;
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
      next = enrichStaffingPlanSection(next, consultantOutput, modelData);
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
  const sensitivityGrid = computeSensitivityGrid(engineData);
  const breakEvenDownside: BreakEvenDownsideExport = {
    breakEvenStudents: baseMetrics.breakEvenStudents,
    breakEvenUtilization: baseMetrics.breakEvenUtilization,
    maxCapacity,
    enrollment: baseMetrics.enrollment,
    downsideBand,
    sensitivityGrid,
  };

  // Task #668 — per-program break-even for Year 1. Same canonical helper the
  // scenario planner UI uses so the lender packet, dashboard, and planner all
  // agree on which programs carry vs subsidise the school.
  const programBreakEvenY1: ProgramBreakEven[] = computeProgramBreakEven(
    engineData,
    baseMetrics,
    0,
  );

  // Task #860 EXPANDED — Year-1 per-seat funding mix. Reuses the same
  // engine helper that powers the dashboard PerSeatFundingMixCard so the
  // lender PDF, board PDF, and on-screen views all show identical
  // numbers (sticker → net → ESA / voucher / tax-credit funders →
  // residual family pay). `null` for non-tuition models.
  const y1Enrollment = modelData.enrollment?.year1 ?? 0;
  const perSeatFundingMixY1 = buildPerSeatFundingMix(
    (modelData.revenueRows ?? []) as unknown as Parameters<typeof buildPerSeatFundingMix>[0],
    0,
    y1Enrollment,
    (modelData.tuitionTiers ?? []) as unknown as Parameters<typeof buildPerSeatFundingMix>[3],
  );

  return {
    ...basePacket,
    sections: enrichedSections,
    riskMitigants,
    dscrSummary,
    lenderReadiness: {
      status: consultantOutput.lenderReadiness,
      explanation: consultantOutput.lenderReadinessExplanation,
      // Task #929 — Pass the full structured result through to render
      // surfaces. `callout` is pre-rendered via `formatCapCallout` so
      // every consumer prints the same sentence without re-formatting.
      result: {
        ...consultantOutput.lenderReadinessResult,
        callout: formatCapCallout(consultantOutput.lenderReadinessResult),
      },
    },
    budgetNarrative,
    assumptionConfidence,
    flaggedAssumptions,
    decisionHistory,
    cashRunway,
    perSeatFundingMixY1,
    forecastAccuracy,
    forecastAccuracyFilter: normalizedFilter,
    forecastAccuracyUnfilteredCount: fullForecastAccuracy.entries.length,
    breakEvenDownside,
    programBreakEvenY1,
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
    // Task #699 — Founder compensation breakdown for the PDF, mirrored
    // from the Excel export's labeled "Founder compensation" block.
    founderCompNormalization: buildFounderCompPdfBlock(modelData),
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
  // Task #910 — buildDebtService (shared with the board packet) seeds
  // the section's narrative and linkedMetrics from
  // `consultantOutput.keyMetrics`' DSCR entry, a third independent
  // aggregation that matched neither the normalized series (printed in
  // the DSCR Summary section) nor the as-planned series (printed in
  // the As-Planned vs Normalized table). Repoint both at the canonical
  // normalized Y1 DSCR so the entire debt-service section speaks with
  // one voice and there are exactly two canonical DSCR values per year
  // on the rendered packet.
  const normalizedY1 = co.normalizedView?.normalized?.dscr?.[0];
  let nextSection = section;
  if (typeof normalizedY1 === "number" && Number.isFinite(normalizedY1)) {
    const dscrStr = `${normalizedY1.toFixed(2)}x`;
    const interpretation =
      normalizedY1 >= BENCHMARK_DSCR_GREEN
        ? `Year-1 debt service coverage is ${dscrStr} on the normalized (lender-primary) view.`
        : normalizedY1 >= BENCHMARK_DSCR_AMBER
          ? `Year-1 debt service coverage is ${dscrStr} on the normalized (lender-primary) view — above the ${BENCHMARK_DSCR_AMBER.toFixed(2)}x minimum but below the ${BENCHMARK_DSCR_GREEN.toFixed(2)}x target.`
          : `Year-1 debt service coverage is ${dscrStr} on the normalized (lender-primary) view — below the ${BENCHMARK_DSCR_AMBER.toFixed(2)}x lender minimum.`;
    const benchmark = `Minimum: ${BENCHMARK_DSCR_AMBER.toFixed(2)}x; target: ${BENCHMARK_DSCR_GREEN.toFixed(2)}x`;
    const status: "good" | "warning" | "danger" =
      normalizedY1 >= BENCHMARK_DSCR_GREEN
        ? "good"
        : normalizedY1 >= BENCHMARK_DSCR_AMBER
          ? "warning"
          : "danger";
    const replacedMetrics: LinkedMetric[] = section.linkedMetrics.map((m) =>
      m.label.toLowerCase().includes("dscr") || m.label.toLowerCase().includes("debt service")
        ? { ...m, value: dscrStr, benchmark, status }
        : m,
    );
    nextSection = {
      ...section,
      narrative: `${interpretation} ${benchmark}. See the "As-Planned vs Normalized: Net Income & DSCR" table for the founder / board (as-planned) view alongside this normalized series.`,
      linkedMetrics: replacedMetrics,
    };
  }

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
    ...nextSection,
    linkedMetrics: [...nextSection.linkedMetrics, ...reserveMetrics],
    tables: [...(nextSection.tables || []), reserveTable],
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
  modelData: ModelData,
): PacketSection {
  const nv = co.normalizedView;
  const hasAdjustment = !!nv && nv.founderComp.hasAdjustment;

  const fmtUSD = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  // Task #665 — derive the per-year suggested founder-comp benchmark series
  // (the same one the wizard shows founders) so lenders / boards see exactly
  // when the market rate steps up as enrollment crosses NAIS / NACSA size
  // bands, rather than only the Y1 figure.
  const yearCountForBench =
    nv?.founderComp.delta.length ??
    co.costComposition?.length ??
    5;
  const perYearBenchmarks = getFounderCompBenchmarkPerYear(
    modelData as unknown as DecisionEngineModelData,
    yearCountForBench,
  );
  const bandTransitions = getFounderCompBandTransitions(perYearBenchmarks);
  const hasPerYearBenchmark = perYearBenchmarks.some((b) => b && b.escalatedAmount > 0);

  const benchmarkTables: PacketTable[] = [];
  const benchmarkNarrativeChunks: string[] = [];

  if (hasPerYearBenchmark) {
    const benchRows: PacketTableRow[] = perYearBenchmarks.map((b, i) => {
      const isTransition =
        i > 0 &&
        b?.benchmark.sizeBand.key !==
          perYearBenchmarks[i - 1]?.benchmark.sizeBand.key &&
        !!b &&
        !!perYearBenchmarks[i - 1];
      const bandLabel = b ? b.benchmark.sizeBand.label : "-";
      return {
        label: `Year ${i + 1}`,
        values: [
          b ? String(b.enrollment) : "-",
          bandLabel + (isTransition ? " (new band)" : ""),
          b ? fmtUSD(b.escalatedAmount) : "-",
        ],
      };
    });
    benchmarkTables.push({
      title: "Suggested Founder Compensation Benchmark by Year",
      headers: ["Year", "Projected Enrollment", "Size Band", "Suggested Market Rate"],
      rows: benchRows,
    });

    const firstWithSource = perYearBenchmarks.find((b) => b);
    if (firstWithSource) {
      // PDFKit's built-in Helvetica only ships Latin-1; en/em dashes from
      // citation strings (e.g. "NAIS 2023-24") are normalized to ASCII
      // hyphens so they don't corrupt downstream PDF text rendering.
      const safeCitation = firstWithSource.benchmark.source.citation
        .replace(/[\u2013\u2014]/g, "-");
      benchmarkNarrativeChunks.push(
        `Suggested founder compensation steps up year over year as projected enrollment crosses NAIS / NACSA size bands (escalated by COLA from Y1). Source: ${safeCitation}.`,
      );
    }

    if (bandTransitions.length > 0) {
      const items = bandTransitions
        .map((t) => {
          const amt = perYearBenchmarks[t.year - 1]?.escalatedAmount ?? 0;
          return `Year ${t.year} (${t.fromBand.label.toLowerCase()} to ${t.toBand.label.toLowerCase()}, suggested rate ${fmtUSD(amt)})`;
        })
        .join("; ");
      benchmarkNarrativeChunks.push(
        `Size-band transitions during the forecast: ${items}. Each crossing bumps the lender-side market rate for the founder / head-of-school role.`,
      );
    }
  }

  const appendBenchmarkNarrative = (base: string): string => {
    if (benchmarkNarrativeChunks.length === 0) return base;
    const trimmed = base.trim();
    const sep = trimmed.length > 0 ? "\n\n" : "";
    return `${trimmed}${sep}${benchmarkNarrativeChunks.join(" ")}`;
  };

  if (!hasAdjustment) {
    if (!hasPerYearBenchmark) return section;
    return {
      ...section,
      narrative: appendBenchmarkNarrative(section.narrative),
      tables: [...(section.tables || []), ...benchmarkTables],
    };
  }

  const fc = nv!.founderComp;
  const yearCount = fc.delta.length;

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
  // Task #915 cross-section consistency note. Both columns of this
  // table come from `nv = co.normalizedView` (computeNormalizedFinancials
  // → computeBaseFinancials path in lib/finance scenario-engine.ts),
  // which is BY DESIGN a different computation pipeline from the
  // canonical Op Stmt change-in-net-assets row driving the "5-Year
  // Change in Net Assets Projection" table (which uses
  // `computeYearFinancialsFromData` in consultant-engine.ts).
  //
  // The two pipelines differ in what they include in "net income":
  //   - `computeBaseFinancials` (this table's source) is a cash /
  //     EBITDA-style view that does NOT subtract depreciation.
  //   - `computeYearFinancialsFromData` (canonical Op Stmt) is the
  //     full GAAP change-in-net-assets that DOES subtract depreciation
  //     (and uses the loaded staffing cost including founder-comp
  //     normalization built into the model rows).
  //
  // Within this table, the two columns differ only in founder-comp
  // treatment: `applyFounderCompDelta` adds the per-year delta to
  // staffing cost and subtracts it from NI, so
  //   normalized.netIncome[y] = reported.netIncome[y] − founderComp.delta[y]
  //
  // Concrete Riverside Y1 example (private_school demo): canonical
  // NI = $2,176,259; nv.reported.NI = $2,297,688 (~$121K higher,
  // matches the Y1 depreciation add-back); nv.normalized.NI =
  // $2,187,485 (= reported − $110,203 founder-comp delta). All three
  // figures are correct for their respective sources; the original
  // 2.3 review called out the $121K reported↔canonical gap as the
  // "by design" delta to document here.
  //
  // demo-math-smoke pins (a) the Reported Y1 figure to
  // `nv.reported.netIncome[0]` near the column label and (b) both
  // column labels' presence in this window, so a future refactor
  // cannot silently collapse the two views.
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

  const baseNarrative = section.narrative
    ? section.narrative.trimEnd() + " " + adjNarrative
    : adjNarrative;

  return {
    ...section,
    narrative: appendBenchmarkNarrative(baseNarrative),
    tables: [
      ...(section.tables || []),
      ...benchmarkTables,
      normalizationTable,
      comparisonTable,
      runwayTable,
    ],
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

  // Task #910 — point the DSCR Summary at the canonical normalized
  // (lender-primary) Y1 DSCR from `normalizedView.normalized.dscr[0]`,
  // the same series the "As-Planned vs Normalized: Net Income & DSCR"
  // table prints. Pre-#910 we printed `dscrMetric.value`, which is a
  // third independent figure (a separate aggregation in the consultant
  // engine's keyMetrics) that matched neither the normalized nor the
  // as-planned series and showed up as the orphan third DSCR on every
  // packet. The trend line now explicitly redirects founders / boards
  // to the comparison table for the as-planned view.
  const normalizedY1 = co.normalizedView?.normalized?.dscr?.[0];
  const currentDSCR =
    typeof normalizedY1 === "number" && Number.isFinite(normalizedY1)
      ? `${normalizedY1.toFixed(2)}x`
      : dscrMetric.value;
  const trendDescription =
    typeof normalizedY1 === "number" && Number.isFinite(normalizedY1)
      ? "Normalized (lender-primary) Y1 DSCR. See the \u201CAs-Planned vs Normalized: Net Income & DSCR\u201D table for the founder / board (as-planned) view alongside the normalized series."
      : dscrMetric.interpretation;

  return {
    currentDSCR,
    status: dscrMetric.status as "good" | "warning" | "danger",
    benchmark: benchmarkText,
    trendDescription,
  };
}
