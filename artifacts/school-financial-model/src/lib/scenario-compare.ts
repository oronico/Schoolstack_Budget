import type { ScenarioMetrics, ScenarioAdjustments } from "./scenario-engine";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "./benchmark-thresholds";

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

export interface CompareScenariosOptions {
  isSingleYear?: boolean;
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
  if (base === 0 && compare === 0) return 0;
  if (base === 0) {
    const abs = Math.abs(compare);
    if (abs < 1000) return compare > 0 ? 0.1 : -0.1;
    if (abs < 10000) return compare > 0 ? 0.3 : -0.3;
    return compare > 0 ? 0.5 : -0.5;
  }
  return (compare - base) / Math.abs(base);
}

function severity(deltaPct: number): DeltaSeverity {
  const abs = Math.abs(deltaPct);
  if (abs < 0.05) return "minor";
  if (abs < 0.15) return "moderate";
  return "major";
}

function revenueExplanation(yearLabel: string) {
  return (base: number, compare: number, delta: number): string => {
    if (Math.abs(delta) < 1000) return "Revenue stays roughly the same across both scenarios.";
    const dir = delta > 0 ? "higher" : "lower";
    const word = delta > 0 ? "more" : "less";
    return `${yearLabel} revenue is ${fmt(Math.abs(delta))} ${dir} (${fmt(base)} → ${fmt(compare)}), meaning the school collects ${word} each year to fund operations.`;
  };
}

function expenseExplanation(yearLabel: string) {
  return (base: number, compare: number, delta: number): string => {
    if (Math.abs(delta) < 1000) return "Expenses are virtually unchanged between scenarios.";
    const dir = delta > 0 ? "higher" : "lower";
    return `${yearLabel} expenses are ${fmt(Math.abs(delta))} ${dir} (${fmt(base)} → ${fmt(compare)}). ${delta > 0 ? "This increases the cost pressure on the school." : "This frees up budget for programs or reserves."}`;
  };
}

function netIncomeExplanation(yearLabel: string) {
  return (base: number, compare: number, delta: number): string => {
    if (Math.abs(delta) < 1000) return "Net income is essentially the same in both scenarios.";
    if (compare > 0 && base <= 0) return `The scenario turns a deficit into a surplus of ${fmt(compare)} by ${yearLabel} - a meaningful improvement.`;
    if (compare <= 0 && base > 0) return `The scenario turns a ${yearLabel} surplus into a deficit of ${fmt(Math.abs(compare))} - this needs attention.`;
    const dir = delta > 0 ? "stronger" : "weaker";
    return `${yearLabel} bottom line is ${dir} by ${fmt(Math.abs(delta))} (${fmt(base)} → ${fmt(compare)}).`;
  };
}

function marginExplanation(_base: number, compare: number): string {
  if (Math.abs(compare - _base) < 0.005) return "Net margin is essentially unchanged.";
  if (compare >= 0.05) return `Net margin of ${pct(compare)} gives the school a healthy cushion for unexpected costs.`;
  if (compare >= 0 && compare < 0.05) return `Net margin of ${pct(compare)} is thin - the school is breaking even but has little room for error.`;
  return `Net margin of ${pct(compare)} means the school is spending more than it earns. This needs to be addressed.`;
}

function dscrExplanation(base: number, compare: number): string {
  if (base === 0 && compare === 0) return "No debt service in either scenario.";
  if (compare >= BENCHMARK_DSCR_GREEN) return `DSCR of ${compare.toFixed(2)}x means the school comfortably covers its debt payments. The benchmark is ${BENCHMARK_DSCR_GREEN}x or higher.`;
  if (compare >= BENCHMARK_DSCR_AMBER) return `DSCR of ${compare.toFixed(2)}x means debt payments are covered, but there is not much margin. More cushion would strengthen the model.`;
  return `DSCR of ${compare.toFixed(2)}x means operating income does not fully cover debt payments. This needs attention.`;
}

function reserveExplanation(base: number, compare: number): string {
  if (Math.abs(compare - base) < 0.2) return "Reserve strength is similar in both scenarios.";
  if (compare >= 3) return `${compare.toFixed(1)} months of reserves gives the school a strong buffer against unexpected costs.`;
  if (compare >= 1) return `${compare.toFixed(1)} months of reserves provides some cushion, but less than the recommended 3 months.`;
  return `Less than 1 month of reserves leaves the school vulnerable to any unplanned expense.`;
}

function cashRunwayExplanation(base: number, compare: number): string {
  if (compare >= 60 && base >= 60) return "Cash stays positive throughout both scenarios - no liquidity concerns.";
  if (compare >= 60 && base < 60) return `Cash now stays positive for the full 5 years, up from month ${base}. A significant improvement in liquidity.`;
  if (compare < 60 && base >= 60) return `Cash goes negative in month ${compare}, down from staying positive the full period. This introduces liquidity risk.`;
  if (compare > base) return `Cash runway extends to month ${compare}, up from month ${base}. Better, but still an area to watch.`;
  if (compare < base) return `Cash runway shortens to month ${compare}, down from month ${base}. Liquidity is tighter.`;
  return "Cash runway is the same in both scenarios.";
}

function enrollmentExplanation(yearLabel: string) {
  return (base: number, compare: number, delta: number): string => {
    if (Math.abs(delta) < 1) return "Enrollment is the same in both scenarios.";
    const dir = delta > 0 ? "more" : "fewer";
    return `${yearLabel} enrollment is ${Math.abs(Math.round(delta))} students ${dir} (${Math.round(base)} → ${Math.round(compare)}). ${delta > 0 ? "More students typically means more revenue, but watch that staffing scales appropriately." : "Fewer students means less tuition revenue and may require adjusting staff."}`;
  };
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

function buildMetricSpecs(isSingleYear: boolean): MetricSpec[] {
  const idx = isSingleYear ? 0 : 4;
  const yearLabel = isSingleYear ? "Year 1" : "Year 5";
  const yearTag = isSingleYear ? "y1" : "y5";
  const at = (arr: number[]): number => arr[idx] ?? arr[arr.length - 1] ?? 0;

  return [
    {
      id: `revenue_${yearTag}`,
      label: `${yearLabel} Revenue`,
      getBase: (m) => at(m.revenue),
      getCompare: (m) => at(m.revenue),
      higherIsBetter: true,
      explain: revenueExplanation(yearLabel),
    },
    {
      id: `expenses_${yearTag}`,
      label: `${yearLabel} Expenses`,
      getBase: (m) => at(m.totalExpenses),
      getCompare: (m) => at(m.totalExpenses),
      higherIsBetter: false,
      explain: expenseExplanation(yearLabel),
    },
    {
      id: `net_income_${yearTag}`,
      label: `${yearLabel} Net Income`,
      getBase: (m) => at(m.netIncome),
      getCompare: (m) => at(m.netIncome),
      higherIsBetter: true,
      explain: netIncomeExplanation(yearLabel),
    },
    {
      id: `net_margin_${yearTag}`,
      label: `${yearLabel} Net Margin`,
      getBase: (m) => at(m.netMargin),
      getCompare: (m) => at(m.netMargin),
      higherIsBetter: true,
      explain: marginExplanation,
    },
    {
      id: `dscr_${yearTag}`,
      label: `${yearLabel} DSCR`,
      getBase: (m) => at(m.dscr),
      getCompare: (m) => at(m.dscr),
      higherIsBetter: true,
      explain: dscrExplanation,
    },
    // `reserveMonths` and `cashRunwayMonths` are scalar metrics the engine
    // derives from the full 5-year cash trajectory. They are not Y1-safe
    // (Y2-Y5 phantom zeros leak into both numbers) so we drop them in
    // single-year mode rather than mislabel a multi-year-derived value as
    // "Year 1". The five-year branch keeps them.
    ...(isSingleYear ? [] : [
      {
        id: "reserve_months",
        label: "Reserve Months",
        getBase: (m: ScenarioMetrics) => m.reserveMonths,
        getCompare: (m: ScenarioMetrics) => m.reserveMonths,
        higherIsBetter: true,
        explain: reserveExplanation,
      },
      {
        id: "cash_runway",
        label: "Cash Runway",
        getBase: (m: ScenarioMetrics) => m.cashRunwayMonths,
        getCompare: (m: ScenarioMetrics) => m.cashRunwayMonths,
        higherIsBetter: true,
        explain: cashRunwayExplanation,
      },
    ]),
    {
      id: `enrollment_${yearTag}`,
      label: `${yearLabel} Enrollment`,
      getBase: (m) => at(m.enrollment),
      getCompare: (m) => at(m.enrollment),
      higherIsBetter: true,
      explain: enrollmentExplanation(yearLabel),
    },
  ];
}

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
  options?: CompareScenariosOptions,
): ComparisonResult {
  const isSingleYear = options?.isSingleYear === true;
  const specs = buildMetricSpecs(isSingleYear);

  const metricDeltas: MetricDelta[] = specs.map((spec) => {
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

  if (!isSingleYear) {
    const beBase = baseMetrics.breakEvenYear;
    const beCompare = compareMetrics.breakEvenYear;
    let beDirection: DeltaDirection = "unchanged";
    let beDeltaPct = 0;
    let beDelta = 0;

    if (beCompare !== null && beBase === null) {
      beDirection = "improved";
      beDeltaPct = 0.4;
    } else if (beCompare === null && beBase !== null) {
      beDirection = "worsened";
      beDeltaPct = 0.4;
    } else if (beCompare !== null && beBase !== null) {
      beDelta = beCompare - beBase;
      if (beDelta < 0) {
        beDirection = "improved";
        beDeltaPct = Math.abs(beDelta) / 5 * 0.3;
      } else if (beDelta > 0) {
        beDirection = "worsened";
        beDeltaPct = Math.abs(beDelta) / 5 * 0.3;
      }
    }

    const breakEvenDelta: MetricDelta = {
      id: "break_even",
      label: "Break-Even Year",
      baseValue: beBase ?? -1,
      compareValue: beCompare ?? -1,
      delta: beDelta,
      deltaPct: beDeltaPct,
      direction: beDirection,
      severity: beDeltaPct >= 0.15 ? "major" : beDeltaPct >= 0.05 ? "moderate" : "minor",
      explanation: breakEvenExplanation(beBase, beCompare),
      higherIsBetter: false,
    };
    metricDeltas.push(breakEvenDelta);
  }

  const improved = metricDeltas.filter((d) => d.direction === "improved");
  const worsened = metricDeltas.filter((d) => d.direction === "worsened");

  const biggestImprovement = improved.length > 0
    ? improved.reduce((best, d) => Math.abs(d.deltaPct) > Math.abs(best.deltaPct) ? d : best)
    : null;

  const biggestRisk = worsened.length > 0
    ? worsened.reduce((worst, d) => Math.abs(d.deltaPct) > Math.abs(worst.deltaPct) ? d : worst)
    : null;

  const yearPhrase = isSingleYear ? "Year 1" : "across the 5-year projection";
  let verdict: OverallVerdict;
  let verdictExplanation: string;

  if (improved.length > 0 && worsened.length === 0) {
    verdict = "stronger";
    verdictExplanation = `This scenario improves ${improved.length} ${yearPhrase} metric${improved.length > 1 ? "s" : ""} with no trade-offs. It is clearly stronger than the base.`;
  } else if (worsened.length > 0 && improved.length === 0) {
    verdict = "weaker";
    verdictExplanation = `This scenario worsens ${worsened.length} ${yearPhrase} metric${worsened.length > 1 ? "s" : ""} with no improvements. It is weaker than the base.`;
  } else if (improved.length === 0 && worsened.length === 0) {
    verdict = "mixed";
    verdictExplanation = isSingleYear
      ? "The two scenarios are essentially identical across every Year 1 metric."
      : "The two scenarios are essentially identical across all key metrics.";
  } else {
    const impScore = improved.reduce((s, d) => s + Math.abs(d.deltaPct), 0);
    const worScore = worsened.reduce((s, d) => s + Math.abs(d.deltaPct), 0);
    if (impScore > worScore * 1.5) {
      verdict = "stronger";
      verdictExplanation = `On balance, this scenario is stronger ${isSingleYear ? "in Year 1" : ""} - ${improved.length} metric${improved.length > 1 ? "s" : ""} improve${improved.length === 1 ? "s" : ""} while ${worsened.length} worsen${worsened.length === 1 ? "s" : ""}, but the improvements outweigh the trade-offs.`.replace("  ", " ");
    } else if (worScore > impScore * 1.5) {
      verdict = "weaker";
      verdictExplanation = `On balance, this scenario is weaker ${isSingleYear ? "in Year 1" : ""} - ${worsened.length} metric${worsened.length > 1 ? "s" : ""} worsen${worsened.length === 1 ? "s" : ""} while ${improved.length} improve${improved.length === 1 ? "s" : ""}, and the downsides outweigh the gains.`.replace("  ", " ");
    } else {
      verdict = "mixed";
      verdictExplanation = `This scenario involves real trade-offs${isSingleYear ? " in Year 1" : ""}: ${improved.length} metric${improved.length > 1 ? "s" : ""} improve${improved.length === 1 ? "s" : ""} and ${worsened.length} worsen${worsened.length === 1 ? "s" : ""}. Review each change to decide which matters more for your school.`;
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
