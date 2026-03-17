import type { ScenarioMetrics, ScenarioAdjustments } from "./scenario-engine";

export type DeltaDirection = "improved" | "worsened" | "unchanged";
export type DeltaSeverity = "minor" | "moderate" | "major";

export interface MetricDelta {
  id: string;
  label: string;
  baseValue: number;
  compareValue: number;
  delta: number;
  deltaPct: number;
  direction: DeltaDirection;
  severity: DeltaSeverity;
  explanation: string;
  higherIsBetter: boolean;
}

export interface AssumptionChange {
  label: string;
  baseValue: string;
  compareValue: string;
  delta: string;
}

export type OverallVerdict = "stronger" | "weaker" | "mixed";

export interface ComparisonResult {
  verdict: OverallVerdict;
  verdictExplanation: string;
  biggestImprovement: MetricDelta | null;
  biggestRisk: MetricDelta | null;
  metricDeltas: MetricDelta[];
  assumptionChanges: AssumptionChange[];
  improvementCount: number;
  worsenedCount: number;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function deltaPctSafe(base: number, compare: number): number {
  if (base === 0) return compare === 0 ? 0 : compare > 0 ? 1 : -1;
  return (compare - base) / Math.abs(base);
}

function severity(deltaPct: number): DeltaSeverity {
  const abs = Math.abs(deltaPct);
  if (abs < 0.05) return "minor";
  if (abs < 0.15) return "moderate";
  return "major";
}

function revenueExplanation(base: number, compare: number, delta: number): string {
  if (Math.abs(delta) < 1000) return "Revenue stays roughly the same across both scenarios.";
  const dir = delta > 0 ? "higher" : "lower";
  const word = delta > 0 ? "more" : "less";
  return `Year 5 revenue is ${fmt(Math.abs(delta))} ${dir} (${fmt(base)} → ${fmt(compare)}), meaning the school collects ${word} each year to fund operations.`;
}

function expenseExplanation(base: number, compare: number, delta: number): string {
  if (Math.abs(delta) < 1000) return "Expenses are virtually unchanged between scenarios.";
  const dir = delta > 0 ? "higher" : "lower";
  return `Year 5 expenses are ${fmt(Math.abs(delta))} ${dir} (${fmt(base)} → ${fmt(compare)}). ${delta > 0 ? "This increases the cost pressure on the school." : "This frees up budget for programs or reserves."}`;
}

function netIncomeExplanation(base: number, compare: number, delta: number): string {
  if (Math.abs(delta) < 1000) return "Net income is essentially the same in both scenarios.";
  if (compare > 0 && base <= 0) return `The scenario turns a deficit into a surplus of ${fmt(compare)} by Year 5 — a meaningful improvement.`;
  if (compare <= 0 && base > 0) return `The scenario turns a Year 5 surplus into a deficit of ${fmt(Math.abs(compare))} — this needs attention.`;
  const dir = delta > 0 ? "stronger" : "weaker";
  return `Year 5 bottom line is ${dir} by ${fmt(Math.abs(delta))} (${fmt(base)} → ${fmt(compare)}).`;
}

function marginExplanation(base: number, compare: number): string {
  if (Math.abs(compare - base) < 0.005) return "Net margin is essentially unchanged.";
  if (compare >= 0.05) return `Net margin of ${pct(compare)} gives the school a healthy cushion for unexpected costs.`;
  if (compare >= 0 && compare < 0.05) return `Net margin of ${pct(compare)} is thin — the school is breaking even but has little room for error.`;
  return `Net margin of ${pct(compare)} means the school is spending more than it earns. This needs to be addressed.`;
}

function dscrExplanation(base: number, compare: number): string {
  if (base === 0 && compare === 0) return "No debt service in either scenario.";
  if (compare >= 1.25) return `DSCR of ${compare.toFixed(2)}x means the school comfortably covers its debt payments. Lenders look for 1.2x or higher.`;
  if (compare >= 1.0) return `DSCR of ${compare.toFixed(2)}x means debt payments are covered, but there is not much margin. Lenders may want more cushion.`;
  return `DSCR of ${compare.toFixed(2)}x means operating income does not fully cover debt payments. This is a concern for lenders.`;
}

function reserveExplanation(base: number, compare: number): string {
  if (Math.abs(compare - base) < 0.2) return "Reserve strength is similar in both scenarios.";
  if (compare >= 3) return `${compare.toFixed(1)} months of reserves gives the school a strong buffer against unexpected costs.`;
  if (compare >= 1) return `${compare.toFixed(1)} months of reserves provides some cushion, but less than the recommended 3 months.`;
  return `Less than 1 month of reserves leaves the school vulnerable to any unplanned expense.`;
}

function cashRunwayExplanation(base: number, compare: number): string {
  if (compare >= 60 && base >= 60) return "Cash stays positive throughout both scenarios — no liquidity concerns.";
  if (compare >= 60 && base < 60) return `Cash now stays positive for the full 5 years, up from month ${base}. A significant improvement in liquidity.`;
  if (compare < 60 && base >= 60) return `Cash goes negative in month ${compare}, down from staying positive the full period. This introduces liquidity risk.`;
  if (compare > base) return `Cash runway extends to month ${compare}, up from month ${base}. Better, but still an area to watch.`;
  if (compare < base) return `Cash runway shortens to month ${compare}, down from month ${base}. Liquidity is tighter.`;
  return "Cash runway is the same in both scenarios.";
}

function enrollmentExplanation(base: number, compare: number, delta: number): string {
  if (Math.abs(delta) < 1) return "Enrollment is the same in both scenarios.";
  const dir = delta > 0 ? "more" : "fewer";
  return `Year 5 enrollment is ${Math.abs(Math.round(delta))} students ${dir} (${Math.round(base)} → ${Math.round(compare)}). ${delta > 0 ? "More students typically means more revenue, but watch that staffing scales appropriately." : "Fewer students means less tuition revenue and may require adjusting staff."}`;
}

function breakEvenExplanation(base: number | null, compare: number | null): string {
  if (base === compare) return "Break-even timing is unchanged.";
  if (compare !== null && base === null) return `The scenario reaches break-even in Year ${compare}, which the base model never achieves within 5 years.`;
  if (compare === null && base !== null) return `The scenario no longer reaches break-even within 5 years, while the base model breaks even in Year ${base}.`;
  if (compare !== null && base !== null) {
    if (compare < base) return `Break-even moves earlier, from Year ${base} to Year ${compare}. The school becomes self-sustaining sooner.`;
    return `Break-even is delayed from Year ${base} to Year ${compare}. It takes longer to become self-sustaining.`;
  }
  return "Neither scenario reaches break-even within 5 years.";
}

interface MetricSpec {
  id: string;
  label: string;
  getBase: (m: ScenarioMetrics) => number;
  getCompare: (m: ScenarioMetrics) => number;
  higherIsBetter: boolean;
  explain: (base: number, compare: number, delta: number) => string;
}

const METRIC_SPECS: MetricSpec[] = [
  {
    id: "revenue_y5",
    label: "Year 5 Revenue",
    getBase: (m) => m.revenue[4] ?? m.revenue[m.revenue.length - 1] ?? 0,
    getCompare: (m) => m.revenue[4] ?? m.revenue[m.revenue.length - 1] ?? 0,
    higherIsBetter: true,
    explain: revenueExplanation,
  },
  {
    id: "expenses_y5",
    label: "Year 5 Expenses",
    getBase: (m) => m.totalExpenses[4] ?? m.totalExpenses[m.totalExpenses.length - 1] ?? 0,
    getCompare: (m) => m.totalExpenses[4] ?? m.totalExpenses[m.totalExpenses.length - 1] ?? 0,
    higherIsBetter: false,
    explain: expenseExplanation,
  },
  {
    id: "net_income_y5",
    label: "Year 5 Net Income",
    getBase: (m) => m.netIncome[4] ?? m.netIncome[m.netIncome.length - 1] ?? 0,
    getCompare: (m) => m.netIncome[4] ?? m.netIncome[m.netIncome.length - 1] ?? 0,
    higherIsBetter: true,
    explain: netIncomeExplanation,
  },
  {
    id: "net_margin_y5",
    label: "Year 5 Net Margin",
    getBase: (m) => m.netMargin[4] ?? m.netMargin[m.netMargin.length - 1] ?? 0,
    getCompare: (m) => m.netMargin[4] ?? m.netMargin[m.netMargin.length - 1] ?? 0,
    higherIsBetter: true,
    explain: marginExplanation,
  },
  {
    id: "dscr_y5",
    label: "Year 5 DSCR",
    getBase: (m) => m.dscr[4] ?? m.dscr[m.dscr.length - 1] ?? 0,
    getCompare: (m) => m.dscr[4] ?? m.dscr[m.dscr.length - 1] ?? 0,
    higherIsBetter: true,
    explain: dscrExplanation,
  },
  {
    id: "reserve_months",
    label: "Reserve Months (Year 5)",
    getBase: (m) => m.reserveMonths,
    getCompare: (m) => m.reserveMonths,
    higherIsBetter: true,
    explain: reserveExplanation,
  },
  {
    id: "cash_runway",
    label: "Cash Runway",
    getBase: (m) => m.cashRunwayMonths,
    getCompare: (m) => m.cashRunwayMonths,
    higherIsBetter: true,
    explain: cashRunwayExplanation,
  },
  {
    id: "enrollment_y5",
    label: "Year 5 Enrollment",
    getBase: (m) => m.enrollment[4] ?? m.enrollment[m.enrollment.length - 1] ?? 0,
    getCompare: (m) => m.enrollment[4] ?? m.enrollment[m.enrollment.length - 1] ?? 0,
    higherIsBetter: true,
    explain: enrollmentExplanation,
  },
];

function computeDirection(delta: number, higherIsBetter: boolean): DeltaDirection {
  if (Math.abs(delta) < 0.001) return "unchanged";
  if (higherIsBetter) return delta > 0 ? "improved" : "worsened";
  return delta < 0 ? "improved" : "worsened";
}

export function compareScenarios(
  baseMetrics: ScenarioMetrics,
  compareMetrics: ScenarioMetrics,
  baseAdjustments?: ScenarioAdjustments,
  compareAdjustments?: ScenarioAdjustments,
): ComparisonResult {
  const metricDeltas: MetricDelta[] = METRIC_SPECS.map((spec) => {
    const baseValue = spec.getBase(baseMetrics);
    const compareValue = spec.getCompare(compareMetrics);
    const delta = compareValue - baseValue;
    const dPct = deltaPctSafe(baseValue, compareValue);
    const direction = computeDirection(delta, spec.higherIsBetter);

    return {
      id: spec.id,
      label: spec.label,
      baseValue,
      compareValue,
      delta,
      deltaPct: dPct,
      direction,
      severity: severity(dPct),
      explanation: spec.explain(baseValue, compareValue, delta),
      higherIsBetter: spec.higherIsBetter,
    };
  });

  const breakEvenDelta: MetricDelta = {
    id: "break_even",
    label: "Break-Even Year",
    baseValue: baseMetrics.breakEvenYear ?? -1,
    compareValue: compareMetrics.breakEvenYear ?? -1,
    delta: (compareMetrics.breakEvenYear ?? 99) - (baseMetrics.breakEvenYear ?? 99),
    deltaPct: 0,
    direction: compareMetrics.breakEvenYear !== null && baseMetrics.breakEvenYear === null
      ? "improved"
      : compareMetrics.breakEvenYear === null && baseMetrics.breakEvenYear !== null
        ? "worsened"
        : compareMetrics.breakEvenYear !== null && baseMetrics.breakEvenYear !== null && compareMetrics.breakEvenYear < baseMetrics.breakEvenYear
          ? "improved"
          : compareMetrics.breakEvenYear !== null && baseMetrics.breakEvenYear !== null && compareMetrics.breakEvenYear > baseMetrics.breakEvenYear
            ? "worsened"
            : "unchanged",
    severity: "moderate",
    explanation: breakEvenExplanation(baseMetrics.breakEvenYear, compareMetrics.breakEvenYear),
    higherIsBetter: false,
  };
  metricDeltas.push(breakEvenDelta);

  const improved = metricDeltas.filter((d) => d.direction === "improved");
  const worsened = metricDeltas.filter((d) => d.direction === "worsened");

  const biggestImprovement = improved.length > 0
    ? improved.reduce((best, d) => Math.abs(d.deltaPct) > Math.abs(best.deltaPct) ? d : best)
    : null;

  const biggestRisk = worsened.length > 0
    ? worsened.reduce((worst, d) => Math.abs(d.deltaPct) > Math.abs(worst.deltaPct) ? d : worst)
    : null;

  let verdict: OverallVerdict;
  let verdictExplanation: string;

  if (improved.length > 0 && worsened.length === 0) {
    verdict = "stronger";
    verdictExplanation = `This scenario improves ${improved.length} metric${improved.length > 1 ? "s" : ""} with no trade-offs. It is clearly stronger than the base.`;
  } else if (worsened.length > 0 && improved.length === 0) {
    verdict = "weaker";
    verdictExplanation = `This scenario worsens ${worsened.length} metric${worsened.length > 1 ? "s" : ""} with no improvements. It is weaker than the base.`;
  } else if (improved.length === 0 && worsened.length === 0) {
    verdict = "mixed";
    verdictExplanation = "The two scenarios are essentially identical across all key metrics.";
  } else {
    const impScore = improved.reduce((s, d) => s + Math.abs(d.deltaPct), 0);
    const worScore = worsened.reduce((s, d) => s + Math.abs(d.deltaPct), 0);
    if (impScore > worScore * 1.5) {
      verdict = "stronger";
      verdictExplanation = `On balance, this scenario is stronger — ${improved.length} metric${improved.length > 1 ? "s" : ""} improve${improved.length === 1 ? "s" : ""} while ${worsened.length} worsen${worsened.length === 1 ? "s" : ""}, but the improvements outweigh the trade-offs.`;
    } else if (worScore > impScore * 1.5) {
      verdict = "weaker";
      verdictExplanation = `On balance, this scenario is weaker — ${worsened.length} metric${worsened.length > 1 ? "s" : ""} worsen${worsened.length === 1 ? "s" : ""} while ${improved.length} improve${improved.length === 1 ? "s" : ""}, and the downsides outweigh the gains.`;
    } else {
      verdict = "mixed";
      verdictExplanation = `This scenario involves real trade-offs: ${improved.length} metric${improved.length > 1 ? "s" : ""} improve${improved.length === 1 ? "s" : ""} and ${worsened.length} worsen${worsened.length === 1 ? "s" : ""}. Review each change to decide which matters more for your school.`;
    }
  }

  const assumptionChanges: AssumptionChange[] = [];
  if (baseAdjustments && compareAdjustments) {
    const fields: { key: keyof ScenarioAdjustments; label: string }[] = [
      { key: "enrollmentAdjustment", label: "Enrollment" },
      { key: "tuitionAdjustment", label: "Tuition / Revenue" },
      { key: "staffingAdjustment", label: "Staffing Costs" },
      { key: "facilityAdjustment", label: "Facility Costs" },
      { key: "expenseAdjustment", label: "Other Expenses" },
    ];
    for (const f of fields) {
      const bv = baseAdjustments[f.key] as number;
      const cv = compareAdjustments[f.key] as number;
      if (bv !== cv) {
        const sign = (v: number) => (v > 0 ? `+${v}%` : v < 0 ? `${v}%` : "0%");
        assumptionChanges.push({
          label: f.label,
          baseValue: sign(bv),
          compareValue: sign(cv),
          delta: sign(cv - bv),
        });
      }
    }
  }

  return {
    verdict,
    verdictExplanation,
    biggestImprovement,
    biggestRisk,
    metricDeltas,
    assumptionChanges,
    improvementCount: improved.length,
    worsenedCount: worsened.length,
  };
}
