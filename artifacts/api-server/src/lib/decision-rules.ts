export interface DecisionIssue {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  relatedStep: number;
  supportingMetrics: { label: string; value: string }[];
}

interface YearFinancials {
  year: number;
  students: number;
  totalRevenue: number;
  tuitionRevenue: number;
  publicRevenue: number;
  philanthropyRevenue: number;
  totalStaffingCost: number;
  facilityCost: number;
  totalOpex: number;
  debtService: number;
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
}

interface CumulativeYear {
  year: number;
  cumulativeNetIncome: number;
  reserveMonths: number;
}

interface IssueInput {
  yearFinancials: YearFinancials[];
  cumulativeFinancials: CumulativeYear[];
  enrollmentByYear: number[];
  cashRunwayMonths: number;
  maxCapacity: number;
  schoolType: string;
  fundingProfile: string;
  entityType: string;
  hasDebt: boolean;
  dscr: number;
  retentionRate?: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function profitTerm(entityType: string): string {
  return entityType === "nonprofit_501c3" ? "net income" : "profit";
}

type RuleFn = (input: IssueInput) => DecisionIssue | null;

const negativeCashRule: RuleFn = (input) => {
  const { yearFinancials, cumulativeFinancials } = input;
  const negativeYears: number[] = [];
  for (let i = 0; i < yearFinancials.length; i++) {
    if (cumulativeFinancials[i] && cumulativeFinancials[i].cumulativeNetIncome < 0) {
      negativeYears.push(i + 1);
    }
  }
  if (negativeYears.length === 0) return null;

  const worstYear = cumulativeFinancials.reduce(
    (worst, cf) => cf.cumulativeNetIncome < worst.cumulativeNetIncome ? cf : worst,
    cumulativeFinancials[0],
  );
  const deficit = Math.abs(worstYear.cumulativeNetIncome);

  return {
    id: "negative_cash",
    severity: negativeYears.length >= 3 ? "critical" : "high",
    title: "Cash goes negative",
    summary: `Your model shows negative cumulative cash in Year${negativeYears.length > 1 ? "s" : ""} ${negativeYears.join(", ")}. The deepest shortfall is ${fmt(deficit)} in Year ${worstYear.year}.`,
    whyItMatters: "Negative cash means the school cannot pay its bills without outside funding. Lenders and authorizers will flag this immediately.",
    recommendedAction: `Identify how you'll bridge the ${fmt(deficit)} gap — startup grants, a line of credit, or phased expense reductions. Then adjust your revenue or cost assumptions to close it faster.`,
    relatedStep: 6,
    supportingMetrics: [
      { label: "Deepest shortfall", value: fmt(-deficit) },
      { label: "Years negative", value: negativeYears.join(", ") },
    ],
  };
};

const weakReservesRule: RuleFn = (input) => {
  const { cumulativeFinancials, yearFinancials } = input;
  const lastYear = cumulativeFinancials[cumulativeFinancials.length - 1];
  if (!lastYear || lastYear.reserveMonths >= 3) return null;
  if (lastYear.cumulativeNetIncome < 0) return null;

  const yearNum = yearFinancials.length;
  return {
    id: "weak_reserves",
    severity: lastYear.reserveMonths < 1 ? "high" : "medium",
    title: "Operating reserves are thin",
    summary: `By Year ${yearNum}, your projected reserve covers ${lastYear.reserveMonths.toFixed(1)} months of expenses. The standard target is 3–6 months.`,
    whyItMatters: "Without adequate reserves, any unexpected cost or revenue dip could force emergency decisions — cutting programs, delaying payroll, or taking on expensive short-term debt.",
    recommendedAction: "Look for ways to widen your surplus in the early years. Even small margin improvements compound into meaningful reserves by Year 3–4.",
    relatedStep: 6,
    supportingMetrics: [
      { label: "Reserve months", value: `${lastYear.reserveMonths.toFixed(1)}` },
      { label: "Target", value: "3–6 months" },
    ],
  };
};

const highStaffingCostRule: RuleFn = (input) => {
  const { yearFinancials } = input;
  const y1 = yearFinancials[0];
  const staffPct = y1.totalRevenue > 0 ? y1.totalStaffingCost / y1.totalRevenue : 0;
  if (staffPct <= 0.65) return null;

  return {
    id: "high_staffing_cost",
    severity: staffPct > 0.75 ? "critical" : "high",
    title: "Staffing costs are too high relative to revenue",
    summary: `Payroll is ${pct(staffPct)} of Year 1 revenue. Most sustainable schools keep this under 65%.`,
    whyItMatters: "When staffing consumes this much revenue, there's little left for facilities, programs, and reserves. A small enrollment dip could push you into deficit.",
    recommendedAction: "Review your staffing plan for phased hiring — start lean in Year 1 and add positions as enrollment grows. Consider whether any roles can be part-time or shared.",
    relatedStep: 4,
    supportingMetrics: [
      { label: "Staffing % of revenue", value: pct(staffPct) },
      { label: "Staffing cost", value: fmt(y1.totalStaffingCost) },
      { label: "Healthy range", value: "50–65%" },
    ],
  };
};

const highOccupancyCostRule: RuleFn = (input) => {
  const { yearFinancials } = input;
  const y1 = yearFinancials[0];
  const occPct = y1.totalRevenue > 0 ? y1.facilityCost / y1.totalRevenue : 0;
  if (occPct <= 0.20) return null;

  return {
    id: "high_occupancy_cost",
    severity: occPct > 0.30 ? "high" : "medium",
    title: "Occupancy costs are high relative to revenue",
    summary: `Facility costs are ${pct(occPct)} of Year 1 revenue. The typical target is under 20%.`,
    whyItMatters: "High occupancy costs are fixed — they don't shrink if enrollment dips. This makes your budget rigid and harder to adjust in a downturn.",
    recommendedAction: "Explore shared-space arrangements, negotiate lease terms, or consider a smaller facility until enrollment supports the full space.",
    relatedStep: 5,
    supportingMetrics: [
      { label: "Facility % of revenue", value: pct(occPct) },
      { label: "Facility cost", value: fmt(y1.facilityCost) },
      { label: "Target", value: "Under 20%" },
    ],
  };
};

const aggressiveEnrollmentRule: RuleFn = (input) => {
  const { enrollmentByYear, maxCapacity } = input;
  const bigJumps: { fromYear: number; toYear: number; growthPct: number }[] = [];
  for (let i = 1; i < enrollmentByYear.length; i++) {
    if (enrollmentByYear[i - 1] > 0) {
      const growth = (enrollmentByYear[i] - enrollmentByYear[i - 1]) / enrollmentByYear[i - 1];
      if (growth > 0.25) {
        bigJumps.push({ fromYear: i, toYear: i + 1, growthPct: growth });
      }
    }
  }
  const overCapacity = maxCapacity > 0 && enrollmentByYear.some(e => e > maxCapacity);

  if (bigJumps.length === 0 && !overCapacity) return null;

  const worstJump = bigJumps.sort((a, b) => b.growthPct - a.growthPct)[0];
  const summaryParts: string[] = [];
  if (worstJump) {
    summaryParts.push(`Year ${worstJump.fromYear} to Year ${worstJump.toYear} projects ${Math.round(worstJump.growthPct * 100)}% enrollment growth`);
  }
  if (overCapacity) {
    summaryParts.push(`enrollment exceeds your facility capacity of ${maxCapacity} students`);
  }

  return {
    id: "aggressive_enrollment",
    severity: overCapacity ? "high" : "medium",
    title: "Enrollment growth may be overly aggressive",
    summary: summaryParts.join(", and ") + ".",
    whyItMatters: "Unrealistic enrollment targets undermine the entire model. If you miss enrollment, every revenue and staffing assumption downstream breaks.",
    recommendedAction: "Base enrollment targets on documented demand — applications, waitlist, community surveys. Growth over 25% per year typically requires an exceptional marketing engine or facility expansion.",
    relatedStep: 2,
    supportingMetrics: [
      ...enrollmentByYear.map((e, i) => ({ label: `Year ${i + 1}`, value: `${e} students` })),
      ...(maxCapacity > 0 ? [{ label: "Capacity", value: `${maxCapacity}` }] : []),
    ],
  };
};

const grantDependencyRule: RuleFn = (input) => {
  const { yearFinancials } = input;
  const y1 = yearFinancials[0];
  const philPct = y1.totalRevenue > 0 ? y1.philanthropyRevenue / y1.totalRevenue : 0;
  if (philPct <= 0.30) return null;

  const y3 = yearFinancials[Math.min(2, yearFinancials.length - 1)];
  const y3PhilPct = y3.totalRevenue > 0 ? y3.philanthropyRevenue / y3.totalRevenue : 0;

  return {
    id: "grant_dependency",
    severity: philPct > 0.50 ? "critical" : "high",
    title: "Heavy reliance on grants and donations",
    summary: `Philanthropy accounts for ${pct(philPct)} of Year 1 revenue${y3PhilPct > 0.20 ? ` and is still ${pct(y3PhilPct)} by Year ${Math.min(3, yearFinancials.length)}` : ""}.`,
    whyItMatters: "Grants are competitive, time-limited, and unpredictable. A model built on philanthropy as the primary revenue source is fragile — one missed grant cycle can create a cash crisis.",
    recommendedAction: "Build a transition plan to shift toward earned revenue (tuition, fees, per-pupil funding) so that philanthropy becomes supplemental rather than foundational. Aim for under 20% by Year 3.",
    relatedStep: 3,
    supportingMetrics: [
      { label: "Philanthropy % (Y1)", value: pct(philPct) },
      { label: "Philanthropy revenue", value: fmt(y1.philanthropyRevenue) },
      { label: "Target", value: "Under 20%" },
    ],
  };
};

const weakDscrRule: RuleFn = (input) => {
  const { hasDebt, dscr, yearFinancials } = input;
  if (!hasDebt || dscr >= 1.25) return null;

  const y1 = yearFinancials[0];
  return {
    id: "weak_dscr",
    severity: dscr < 1.0 ? "critical" : "high",
    title: dscr < 1.0 ? "Debt payments exceed operating income" : "Debt coverage ratio is tight",
    summary: `Your DSCR is ${dscr.toFixed(2)}x.${dscr < 1.0 ? " The school cannot currently cover its debt payments from operations alone." : " Lenders typically require 1.25x minimum."}`,
    whyItMatters: dscr < 1.0
      ? "A DSCR below 1.0x means every dollar of debt service requires outside cash. No lender will approve this without a clear path to improvement."
      : "A DSCR below 1.25x gives you almost no margin. A small revenue dip could push you below 1.0x and trigger loan covenant violations.",
    recommendedAction: dscr < 1.0
      ? "Reduce loan amounts, extend terms, or increase revenue before committing to this debt load. Consider whether the capital expenditure can be phased."
      : "Look for ways to boost operating income by 10–15% or negotiate slightly better loan terms to widen this buffer.",
    relatedStep: 5,
    supportingMetrics: [
      { label: "DSCR", value: `${dscr.toFixed(2)}x` },
      { label: "Annual debt service", value: fmt(y1.debtService) },
      { label: "Minimum target", value: "1.25x" },
    ],
  };
};

const shortCashRunwayRule: RuleFn = (input) => {
  const { cashRunwayMonths, yearFinancials } = input;
  if (cashRunwayMonths === 0 || cashRunwayMonths > 18) return null;

  return {
    id: "short_cash_runway",
    severity: cashRunwayMonths <= 6 ? "critical" : cashRunwayMonths <= 12 ? "high" : "medium",
    title: "Cash runway is short",
    summary: `Based on your projected revenue and expenses, cash runs out in ${cashRunwayMonths} month${cashRunwayMonths === 1 ? "" : "s"}.`,
    whyItMatters: "A short cash runway means you need revenue to arrive on schedule with no delays. Any hiccup — late tuition payments, delayed public funding, or unexpected costs — could create a cash crisis.",
    recommendedAction: "Build a cash buffer through startup fundraising, a line of credit, or by reducing early expenses. Target at least 18 months of runway before opening.",
    relatedStep: 6,
    supportingMetrics: [
      { label: "Cash runway", value: `${cashRunwayMonths} months` },
      { label: "Target", value: "18+ months" },
    ],
  };
};

const ALL_RULES: RuleFn[] = [
  negativeCashRule,
  weakDscrRule,
  shortCashRunwayRule,
  highStaffingCostRule,
  grantDependencyRule,
  highOccupancyCostRule,
  aggressiveEnrollmentRule,
  weakReservesRule,
];

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 };

export function generateTopIssues(input: IssueInput, maxIssues = 3): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  for (const rule of ALL_RULES) {
    const issue = rule(input);
    if (issue) issues.push(issue);
  }

  issues.sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sevDiff !== 0) return sevDiff;
    return 0;
  });

  return issues.slice(0, maxIssues);
}
