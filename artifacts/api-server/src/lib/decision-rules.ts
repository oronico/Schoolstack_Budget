import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "./benchmark-thresholds.js";

export interface DecisionIssue {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  /**
   * Task #658 — short, concrete one-line next step the founder can take
   * right now. Required, never empty. Example:
   *   "Open Step 4: Enrollment and grow Year 1 by 5 students."
   */
  nextStep: string;
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
    title: "Let's close a cash gap in your early years",
    summary: `Your current model dips into negative cash in Year${negativeYears.length > 1 ? "s" : ""} ${negativeYears.join(", ")}, with the deepest gap of ${fmt(deficit)} in Year ${worstYear.year}. That's a fixable signal — most founders close it with a mix of bridge funding and small expense trims.`,
    whyItMatters: "When the model dips below zero cash, you'd need outside funding to make payroll that month. Surfacing it now lets you plan the bridge before reviewers notice it.",
    recommendedAction: `Identify how you'll bridge the ${fmt(deficit)} gap — startup grants, a line of credit, or phased expense reductions. Then adjust your revenue or cost assumptions to close it faster.`,
    nextStep: `Open Step 7: Expenses and trim ${fmt(Math.round(deficit / yearFinancials.length))} of annual cost, or revisit Step 5: Revenue to add a funding source covering the gap.`,
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
    title: "Let's grow your operating reserve cushion",
    summary: `By Year ${yearNum}, your projected reserve covers ${lastYear.reserveMonths.toFixed(1)} months of expenses. Most healthy schools aim for 3–6 months — you're close, and small adjustments can get you there.`,
    whyItMatters: "A thicker reserve gives you room to absorb a slow enrollment month or an unexpected repair without scrambling. Building it gradually now is much easier than rebuilding it later.",
    recommendedAction: "Look for ways to widen your surplus in the early years. Even small margin improvements compound into meaningful reserves by Year 3–4.",
    nextStep: "Open Step 7: Expenses and trim 3-5% of annual cost, or grow Step 4: Enrollment by 5-10 students, until reserves reach at least 3 months of expenses.",
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
    title: "Let's bring staffing in line with revenue",
    summary: `Payroll currently runs ${pct(staffPct)} of Year 1 revenue. Most sustainable schools land under 65% — a few small staffing tweaks can get you there.`,
    whyItMatters: "Keeping staffing under 65% of revenue leaves room for facilities, curriculum, and a small surplus. Tuning this now also gives the model more resilience to a slow enrollment year.",
    recommendedAction: "Review your staffing plan for phased hiring — start lean in Year 1 and add positions as enrollment grows. Consider whether any roles can be part-time or shared.",
    nextStep: "Open Step 6: Staffing and move at least one Year 1 role to a Year 2 start date, or convert one full-time role to part-time, to bring staffing back under 65% of revenue.",
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
    title: "Let's right-size your facility footprint",
    summary: `Facility costs are ${pct(occPct)} of Year 1 revenue. A typical comfortable target is under 20% — let's see what tweaks get you there.`,
    whyItMatters: "Facility costs are fixed, so trimming them gives the rest of your model more breathing room. Even a small reduction translates into months of added cash runway.",
    recommendedAction: "Explore shared-space arrangements, negotiate lease terms, or consider a smaller facility until enrollment supports the full space.",
    nextStep: "Open Step 7: Expenses, find your facility line, and reduce it (smaller square footage, shared space, or phased build-out) until facility lands under 20% of Year 1 revenue.",
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
    title: "Let's back the enrollment ramp with evidence",
    summary: summaryParts.join(", and ") + ". Adding documented demand (waitlists, signed letters, or a clear recruitment pipeline) makes this story land.",
    whyItMatters: "Enrollment is the engine of every revenue and staffing assumption downstream. The more evidence we can attach to each year's number, the more confident the rest of the model becomes.",
    recommendedAction: "Back every enrollment target with documented demand — signed letters of intent, waitlist depth, community survey results, or recruitment pipeline data. Growth over 25% per year typically requires an exceptional recruitment engine or facility expansion.",
    nextStep: "Open Step 4: Enrollment and either soften the steepest year to a 15-25% jump, or paste your waitlist count, signed letters of intent, and recruitment plan into the Story step so reviewers see the evidence.",
    relatedStep: 2,
    supportingMetrics: [
      ...enrollmentByYear.map((e, i) => ({ label: `Year ${i + 1}`, value: `${e} students` })),
      ...(maxCapacity > 0 ? [{ label: "Capacity", value: `${maxCapacity}` }] : []),
    ],
  };
};

const breakEvenNearCapacityRule: RuleFn = (input) => {
  const { yearFinancials, enrollmentByYear, maxCapacity } = input;
  if (maxCapacity <= 0) return null;

  let breakEvenEnrollment = 0;
  for (let i = 0; i < yearFinancials.length; i++) {
    const yf = yearFinancials[i];
    if (yf.netIncome >= 0 && enrollmentByYear[i] > 0) {
      const revenuePerStudent = yf.totalRevenue / enrollmentByYear[i];
      const fixedCosts = yf.totalStaffingCost + yf.debtService;
      const variableOpex = yf.totalOpex - yf.debtService;
      const variableCostPerStudent = enrollmentByYear[i] > 0 ? variableOpex / enrollmentByYear[i] : 0;
      const cm = revenuePerStudent - variableCostPerStudent;
      if (cm > 0) {
        breakEvenEnrollment = Math.ceil(fixedCosts / cm);
        break;
      }
    }
  }

  if (breakEvenEnrollment <= 0) return null;
  const utilizationAtBE = breakEvenEnrollment / maxCapacity;
  if (utilizationAtBE <= 0.85) return null;

  return {
    id: "breakeven_near_capacity",
    severity: utilizationAtBE > 0.95 ? "critical" : "high",
    title: "Let's open up some breathing room at break-even",
    summary: `You need ${breakEvenEnrollment} students to break even, which is ${pct(utilizationAtBE)} of your ${maxCapacity}-student capacity. Bringing that down to 70-80% gives you room to absorb a slow recruitment cycle.`,
    whyItMatters: "When break-even sits below capacity, a quiet enrollment season or mid-year withdrawals don't immediately put the school underwater. A small fixed-cost trim usually opens up that cushion.",
    recommendedAction: "Reduce fixed costs (phased hiring, smaller facility) or increase per-student revenue so break-even occurs at 70-80% of capacity. This gives your enrollment room to breathe.",
    nextStep: "Open Step 6: Staffing or Step 7: Expenses and trim fixed cost, or revisit Step 5: Revenue to lift per-student tuition, until break-even sits at 70-80% of capacity.",
    relatedStep: 6,
    supportingMetrics: [
      { label: "Break-even enrollment", value: `${breakEvenEnrollment} students` },
      { label: "Capacity", value: `${maxCapacity} students` },
      { label: "Utilization at break-even", value: pct(utilizationAtBE) },
    ],
  };
};

const staffingAheadOfDemandRule: RuleFn = (input) => {
  const { yearFinancials, enrollmentByYear } = input;
  if (yearFinancials.length < 2) return null;

  const flaggedYears: number[] = [];
  for (let i = 1; i < yearFinancials.length; i++) {
    const enrollGrowth = enrollmentByYear[i - 1] > 0
      ? (enrollmentByYear[i] - enrollmentByYear[i - 1]) / enrollmentByYear[i - 1]
      : 0;
    const staffGrowth = yearFinancials[i - 1].totalStaffingCost > 0
      ? (yearFinancials[i].totalStaffingCost - yearFinancials[i - 1].totalStaffingCost) / yearFinancials[i - 1].totalStaffingCost
      : 0;
    if (staffGrowth > enrollGrowth + 0.10 && staffGrowth > 0.10) {
      flaggedYears.push(i + 1);
    }
  }

  if (flaggedYears.length === 0) return null;

  return {
    id: "staffing_ahead_of_demand",
    severity: flaggedYears.length >= 2 ? "high" : "medium",
    title: "Let's tie new hires to enrollment milestones",
    summary: `In Year${flaggedYears.length > 1 ? "s" : ""} ${flaggedYears.join(", ")}, staffing cost growth runs more than 10 points ahead of enrollment growth. Sequencing hires to match enrollment keeps the model resilient.`,
    whyItMatters: "Hiring slightly behind enrollment, rather than ahead of it, keeps fixed costs aligned with the revenue actually arriving. It also gives you a clean answer to 'what triggers each new role'.",
    recommendedAction: "Align staffing additions to enrollment milestones. Hire when students are enrolled, not when you hope they will be. Use part-time or contract roles to bridge gaps.",
    nextStep: "Open Step 6: Staffing and tie each new role's start date to a specific enrollment milestone (e.g. 'add when Y2 enrollment hits 60'), or push the role into a later year.",
    relatedStep: 4,
    supportingMetrics: [
      ...flaggedYears.map(y => ({ label: `Year ${y} enrollment`, value: `${enrollmentByYear[y - 1]} students` })),
      ...flaggedYears.map(y => ({ label: `Year ${y} staffing cost`, value: fmt(yearFinancials[y - 1].totalStaffingCost) })),
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
    title: "Let's diversify away from philanthropy over time",
    summary: `Philanthropy accounts for ${pct(philPct)} of Year 1 revenue${y3PhilPct > 0.20 ? ` and is still ${pct(y3PhilPct)} by Year ${Math.min(3, yearFinancials.length)}` : ""}. Building toward earned revenue makes the story stronger.`,
    whyItMatters: "Grants are wonderful but cyclical — shifting toward tuition or per-pupil revenue over a few years lets philanthropy stay supplemental rather than foundational, and the model holds up if a single grant cycle slips.",
    recommendedAction: "Build a transition plan to shift toward earned revenue (tuition, fees, per-pupil funding) so that philanthropy becomes supplemental rather than foundational. Aim for under 20% by Year 3.",
    nextStep: "Open Step 5: Revenue and either grow tuition / per-pupil lines, or wind down a grant line by Year 3, until philanthropy is below 20% of Year 3 revenue.",
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
  if (!hasDebt || dscr >= BENCHMARK_DSCR_GREEN) return null;

  const y1 = yearFinancials[0];
  return {
    id: "weak_dscr",
    severity: dscr < BENCHMARK_DSCR_AMBER ? "critical" : "high",
    title: dscr < BENCHMARK_DSCR_AMBER ? "Let's strengthen your debt-coverage cushion" : "Let's widen the buffer on debt coverage",
    summary: `Your DSCR is ${dscr.toFixed(2)}x.${dscr < BENCHMARK_DSCR_AMBER ? ` Most lenders look for at least ${BENCHMARK_DSCR_GREEN}x — there are a few levers we can pull together to get you there.` : ` Lenders typically look for ${BENCHMARK_DSCR_GREEN}x as a comfortable minimum, and a small adjustment usually clears it.`}`,
    whyItMatters: dscr < BENCHMARK_DSCR_AMBER
      ? `A DSCR below ${BENCHMARK_DSCR_AMBER}x leaves very little room for a slow enrollment year. Tuning the debt structure or revenue mix gives lenders a clearer story to support.`
      : `A DSCR below ${BENCHMARK_DSCR_GREEN}x doesn't leave much margin for a slow revenue month. A modest income lift or term tweak gives you a comfortable cushion.`,
    recommendedAction: dscr < BENCHMARK_DSCR_AMBER
      ? "Look at lowering loan amounts, extending terms, or phasing the capex into smaller tranches so debt service fits comfortably inside your operating income."
      : "Look for ways to boost operating income by 10–15% or negotiate slightly better loan terms to widen this buffer.",
    nextStep: dscr < BENCHMARK_DSCR_AMBER
      ? "Open Step 5: Revenue and lower the loan principal in your capital and debt rows, extend the loan term, or phase the capex into smaller tranches, then re-run the model."
      : "Open Step 7: Expenses and trim 5-10% of operating cost, or revisit your loan terms in Step 5 to lower annual debt service, until DSCR clears 1.25x.",
    relatedStep: 5,
    supportingMetrics: [
      { label: "DSCR", value: `${dscr.toFixed(2)}x` },
      { label: "Annual debt service", value: fmt(y1.debtService) },
      { label: "Minimum target", value: `${BENCHMARK_DSCR_GREEN}x` },
    ],
  };
};

const shortCashRunwayRule: RuleFn = (input) => {
  const { cashRunwayMonths, yearFinancials } = input;
  if (cashRunwayMonths === 0 || cashRunwayMonths > 18) return null;

  return {
    id: "short_cash_runway",
    severity: cashRunwayMonths <= 6 ? "critical" : cashRunwayMonths <= 12 ? "high" : "medium",
    title: "Let's extend your cash runway",
    summary: `Based on your projected revenue and expenses, cash currently lasts ${cashRunwayMonths} month${cashRunwayMonths === 1 ? "" : "s"}. Aiming for 18+ months gives you room to absorb late tuition payments or delayed public funding without scrambling.`,
    whyItMatters: "An 18-month runway means a single late tuition cycle or delayed state disbursement isn't an emergency. Building the cushion now is far easier than rebuilding it after opening day.",
    recommendedAction: "Build a cash buffer through startup fundraising, a line of credit, or by reducing early expenses. Target at least 18 months of runway before opening.",
    nextStep: "Open Step 2: School Details and raise opening cash, or trim Year 1 expenses in Step 7, until projected cash runway clears 18 months.",
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
  breakEvenNearCapacityRule,
  staffingAheadOfDemandRule,
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
