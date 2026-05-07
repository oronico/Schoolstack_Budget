/**
 * Task #615 — One-page "Lender Summary" data contract.
 *
 * Pulls every value the lender summary tab + first PDF page needs from the
 * canonical engine: ConsultantOutput (lender readiness verdict, revenue
 * quality mix, top issues, cash runway) and computeBaseFinancials (DSCR by
 * year, break-even students + utilization). No hand-typed numbers — every
 * dollar / ratio / percent is sourced from the same engine that powers the
 * dashboard, scenario planner, and full lender packet, so the one-pager
 * cannot drift from the rest of the deliverables.
 */
import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import {
  computeBaseFinancials,
  ASSUMPTION_REGISTRY,
  type AssumptionKey,
  type DecisionEngineModelData,
} from "@workspace/finance";

export interface LenderSummaryDscrYear {
  year: number;
  /** "As-planned" DSCR — founder draws what they actually plan. */
  planned: number | null;
  /** Normalized DSCR — founder comp marked to market (lender-primary view).
   *  Matches the multi-page lender packet's normalized financials. */
  normalized: number | null;
  /**
   * Back-compat alias for the planned DSCR. Earlier consumers (and the
   * first cut of this one-pager) only had a single DSCR series; we keep
   * this populated so existing callers / fixtures don't break.
   */
  dscr: number | null;
}

export interface LenderSummaryBreakEvenYear {
  year: number;
  breakEvenStudents: number | null;
  utilization: number | null;
  plannedEnrollment: number;
}

export interface LenderSummaryRevenueMix {
  contractedPct: number;
  projectedPct: number;
  donorDependentPct: number;
  policyDependentPct: number;
}

export interface LenderSummaryRisk {
  severity: "critical" | "high" | "medium";
  risk: string;
  mitigant: string;
}

export interface LenderSummaryAssumption {
  key: AssumptionKey;
  label: string;
  value: string;
  stepNumber: number;
  stepTitle: string;
}

export interface LenderSummaryData {
  schoolName: string;
  generatedAt: Date;
  /** Single-line "lender verdict" — readiness status + explanation. */
  verdict: {
    status: "Strong" | "Needs Work" | "Not Yet Ready";
    line: string;
  };
  dscrByYear: LenderSummaryDscrYear[];
  cashRunwayMonths: number;
  breakEven: LenderSummaryBreakEvenYear[];
  maxCapacity: number | null;
  /** Year-1 revenue mix (contracted / projected / donor / policy %). */
  revenueQualityY1: LenderSummaryRevenueMix;
  /** Top 3 risks paired with their mitigants from the consultant engine. */
  topRisks: LenderSummaryRisk[];
  /** 6-8 key assumptions, each with the wizard step that set it. */
  keyAssumptions: LenderSummaryAssumption[];
}

const SUMMARY_ASSUMPTION_KEYS: AssumptionKey[] = [
  "enrollment_y1",
  "enrollment_y5",
  "retention_rate",
  "tuition_per_student",
  "staffing_total_cost",
  "facility_rent_y1",
  "loan_principal",
  "starting_cash",
];

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtPercent(pct: number): string {
  // `pct` here is in percent-form (e.g. 85 => 85%). Matches how
  // ASSUMPTION_REGISTRY documents `format: "percent"`.
  return `${pct.toFixed(1)}%`;
}

function trimToSentence(s: string, maxLen = 220): string {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  // Single-line: take the first sentence, fall back to a hard char cap.
  const period = trimmed.indexOf(". ");
  if (period > 0 && period < maxLen) return trimmed.slice(0, period + 1);
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1).trimEnd() + "\u2026";
}

function extractAssumptionValue(
  modelData: ModelData,
  key: AssumptionKey,
  baseStaffingY1: number,
  baseFacilityY1: number,
): string | null {
  const raw = modelData as unknown as Record<string, unknown>;
  const sp = (raw.schoolProfile as Record<string, unknown>) || {};
  const en = (raw.enrollment as Record<string, unknown>) || {};
  const ob = (raw.openingBalances as Record<string, unknown>) || {};
  const meta = ASSUMPTION_REGISTRY[key];

  switch (key) {
    case "enrollment_y1": {
      const v = Number(en.year1 ?? 0);
      return fmtNumber(v);
    }
    case "enrollment_y5": {
      const v = Number(en.year5 ?? 0);
      return fmtNumber(v);
    }
    case "retention_rate": {
      const v = en.retentionRate;
      if (v === undefined || v === null) return null;
      return fmtPercent(Number(v));
    }
    case "tuition_per_student": {
      // Take Year-1 amount of the first enabled tuition_and_fees row that
      // uses a per-student driver. Falls back to schoolProfile.tuitionPerStudent
      // for older models that never created an explicit revenue row.
      const rows = (raw.revenueRows as Array<Record<string, unknown>>) || [];
      const tuitionRow = rows.find(
        (r) =>
          r.enabled !== false &&
          r.category === "tuition_and_fees" &&
          r.driverType === "per_student",
      );
      if (tuitionRow) {
        const amounts = (tuitionRow.amounts as number[]) || [];
        return fmtCurrency(Number(amounts[0] || 0));
      }
      const fallback = sp.tuitionPerStudent;
      if (fallback !== undefined) return fmtCurrency(Number(fallback));
      return null;
    }
    case "staffing_total_cost": {
      // Year-1 fully-loaded staffing cost from the canonical engine.
      return fmtCurrency(baseStaffingY1);
    }
    case "facility_rent_y1": {
      // Use the engine's Year-1 facility cost (rent + facility-tagged opex).
      // Falls back to schoolProfile.monthlyRent * 12 for older models.
      if (baseFacilityY1 > 0) return fmtCurrency(baseFacilityY1);
      const monthly = Number(sp.monthlyRent ?? 0);
      return monthly > 0 ? fmtCurrency(monthly * 12) : null;
    }
    case "loan_principal": {
      const rows = (raw.capitalAndDebtRows as Array<Record<string, unknown>>) || [];
      const total = rows
        .filter((r) => r.enabled !== false && r.isLoan)
        .reduce((sum, r) => sum + Number(r.loanPrincipal || 0), 0);
      if (total <= 0) return null;
      return fmtCurrency(total);
    }
    case "starting_cash": {
      const v = ob.cash;
      if (v === undefined || v === null) return null;
      return fmtCurrency(Number(v));
    }
    default:
      return null;
  }
  // Unused but documents the registry exists for consumers.
  void meta;
}

export function buildLenderSummary(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
): LenderSummaryData {
  const raw = modelData as unknown as Record<string, unknown>;
  const sp = (raw.schoolProfile as Record<string, unknown>) || {};
  const schoolName =
    (typeof sp.schoolName === "string" && sp.schoolName.trim()) || "School";

  // Canonical engine — same call site used by buildLenderPacket so the
  // numbers match the multi-page packet, dashboard, and scenario planner.
  const baseMetrics = computeBaseFinancials(
    modelData as unknown as DecisionEngineModelData,
  );

  // Normalized view (founder comp marked to market) is the lender-primary
  // series per Task #611 / buildLenderPacket. Planned series falls back to
  // base finance when the consultant engine wasn't run with a normalized
  // view available.
  const reportedDscr =
    consultantOutput.normalizedView?.reported.dscr ?? baseMetrics.dscr;
  const normalizedDscr =
    consultantOutput.normalizedView?.normalized.dscr ?? baseMetrics.dscr;

  const yearCount = Math.max(reportedDscr.length, normalizedDscr.length, 5);
  const dscrByYear: LenderSummaryDscrYear[] = [];
  for (let y = 0; y < yearCount; y++) {
    const planned = Number.isFinite(reportedDscr[y]) ? reportedDscr[y] : null;
    const normalized = Number.isFinite(normalizedDscr[y])
      ? normalizedDscr[y]
      : null;
    dscrByYear.push({
      year: y + 1,
      planned,
      normalized,
      dscr: planned,
    });
  }

  const maxCapRaw = sp.maxCapacity;
  const maxCapacity =
    typeof maxCapRaw === "number" && maxCapRaw > 0 ? maxCapRaw : null;

  const breakEven: LenderSummaryBreakEvenYear[] = [];
  for (let y = 0; y < yearCount; y++) {
    breakEven.push({
      year: y + 1,
      breakEvenStudents: baseMetrics.breakEvenStudents[y] ?? null,
      utilization: baseMetrics.breakEvenUtilization[y] ?? null,
      plannedEnrollment: baseMetrics.enrollment[y] ?? 0,
    });
  }

  // Year-1 revenue quality mix from the consultant engine. The rollup
  // already holds % shares per quality bucket, so we just lift them out.
  const rqY1 = consultantOutput.revenueQuality.find((r) => r.year === 1)
    || consultantOutput.revenueQuality[0];
  const revenueQualityY1: LenderSummaryRevenueMix = rqY1
    ? {
        contractedPct: rqY1.pctByBucket.contracted,
        projectedPct: rqY1.pctByBucket.projected,
        donorDependentPct: rqY1.pctByBucket.donor_dependent,
        policyDependentPct: rqY1.pctByBucket.policy_dependent,
      }
    : { contractedPct: 0, projectedPct: 0, donorDependentPct: 0, policyDependentPct: 0 };

  // Top 3 risks + their mitigants. We pull straight from `topIssues`
  // (already severity-ordered by the engine) so the summary matches the
  // "Risk Assessment" section in the full packet.
  const topRisks: LenderSummaryRisk[] = consultantOutput.topIssues
    .slice(0, 3)
    .map((iss) => ({
      severity: iss.severity,
      risk: iss.title,
      mitigant: iss.recommendedAction,
    }));

  // 6-8 key assumptions, each tagged with the wizard step that set it.
  // The registry is the source of truth for labels + step numbers, so the
  // founder can trace any number on the one-pager back to a single screen.
  const keyAssumptions: LenderSummaryAssumption[] = [];
  const baseStaffingY1 = baseMetrics.staffingCost[0] ?? 0;
  const baseFacilityY1 = baseMetrics.facilityCost[0] ?? 0;
  for (const key of SUMMARY_ASSUMPTION_KEYS) {
    const value = extractAssumptionValue(
      modelData,
      key,
      baseStaffingY1,
      baseFacilityY1,
    );
    if (value === null) continue;
    const meta = ASSUMPTION_REGISTRY[key];
    keyAssumptions.push({
      key,
      label: meta.label,
      value,
      stepNumber: meta.defaultStepNumber,
      stepTitle: meta.stepTitle,
    });
    if (keyAssumptions.length >= 8) break;
  }

  return {
    schoolName,
    generatedAt: new Date(),
    verdict: {
      status: consultantOutput.lenderReadiness,
      line: trimToSentence(consultantOutput.lenderReadinessExplanation),
    },
    dscrByYear,
    cashRunwayMonths: consultantOutput.cashRunwayMonths,
    breakEven,
    maxCapacity,
    revenueQualityY1,
    topRisks,
    keyAssumptions,
  };
}
