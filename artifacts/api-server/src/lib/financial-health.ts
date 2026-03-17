export type HealthStatus = "healthy" | "watch" | "at_risk";

export interface HealthSignal {
  dimension: string;
  status: HealthStatus;
  label: string;
  explanation: string;
  watchItem: string;
}

interface HealthInput {
  y1NetMargin: number;
  lastYearNetMargin: number;
  breakEvenYear: number;
  yearCount: number;
  cashRunwayMonths: number;
  reserveMonths: number;
  staffingCostPct: number;
  facilityCostPct: number;
  dscr: number;
  hasDebt: boolean;
  philanthropyPct: number;
  publicRevenuePct: number;
  tuitionPct: number;
  entityType: string;
}

function profitTerm(entityType: string): string {
  return entityType === "nonprofit_501c3" ? "net income" : "profit";
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

interface ThresholdBand {
  healthy: (v: number) => boolean;
  watch: (v: number) => boolean;
}

const DIMENSIONS: {
  id: string;
  label: string;
  compute: (input: HealthInput) => HealthSignal | null;
}[] = [
  {
    id: "viability",
    label: "Viability",
    compute: (input) => {
      const { y1NetMargin, lastYearNetMargin, breakEvenYear, yearCount, entityType } = input;
      const pt = profitTerm(entityType);
      if (lastYearNetMargin >= 0.10 && breakEvenYear <= 1) {
        return {
          dimension: "viability",
          status: "healthy",
          label: "Healthy",
          explanation: `The model reaches ${pt} early and sustains strong margins through Year ${yearCount}.`,
          watchItem: "Monitor enrollment actuals vs. projections in Year 1.",
        };
      }
      if (lastYearNetMargin >= 0 && breakEvenYear >= 0) {
        return {
          dimension: "viability",
          status: "watch",
          label: "Watch closely",
          explanation: `The model reaches break-even by Year ${breakEvenYear + 1}, but margins remain thin. A revenue shortfall could push it negative.`,
          watchItem: "Track monthly revenue vs. budget and have a contingency plan if you miss targets.",
        };
      }
      return {
        dimension: "viability",
        status: "at_risk",
        label: "Needs attention",
        explanation: breakEvenYear < 0
          ? `The model does not reach break-even within ${yearCount} years. This needs to be addressed before approaching lenders.`
          : `Year ${yearCount} margin of ${pct(lastYearNetMargin)} signals the model is not yet on a sustainable path.`,
        watchItem: "Revisit revenue assumptions and cost structure to build a clear path to break-even.",
      };
    },
  },
  {
    id: "liquidity",
    label: "Liquidity",
    compute: (input) => {
      const { cashRunwayMonths, reserveMonths } = input;
      if (cashRunwayMonths === 0 && reserveMonths >= 3) {
        return {
          dimension: "liquidity",
          status: "healthy",
          label: "Healthy",
          explanation: "Cash stays positive throughout the projection and reserves exceed 3 months of expenses.",
          watchItem: "Maintain reserves as a buffer against seasonal revenue dips.",
        };
      }
      if (cashRunwayMonths === 0 && reserveMonths >= 1) {
        return {
          dimension: "liquidity",
          status: "watch",
          label: "Watch closely",
          explanation: `Cash stays positive but reserves cover only ${reserveMonths.toFixed(1)} months. Any unexpected cost could create a cash crunch.`,
          watchItem: "Build reserves toward 3 months by controlling early-year spending.",
        };
      }
      return {
        dimension: "liquidity",
        status: "at_risk",
        label: "Needs attention",
        explanation: cashRunwayMonths > 0
          ? `Cash runs out in month ${cashRunwayMonths}. The school will need outside funding to continue operating.`
          : "No meaningful cash reserve has been built. The school is operating without a safety net.",
        watchItem: "Secure a line of credit or bridge funding before operations begin.",
      };
    },
  },
  {
    id: "staffing_burden",
    label: "Staffing burden",
    compute: (input) => {
      const { staffingCostPct } = input;
      if (staffingCostPct <= 0.55) {
        return {
          dimension: "staffing_burden",
          status: "healthy",
          label: "Healthy",
          explanation: `Staffing at ${pct(staffingCostPct)} of revenue leaves room for facilities, programs, and reserves.`,
          watchItem: "As you add staff, ensure staffing stays below 60% of revenue.",
        };
      }
      if (staffingCostPct <= 0.65) {
        return {
          dimension: "staffing_burden",
          status: "watch",
          label: "Watch closely",
          explanation: `Staffing at ${pct(staffingCostPct)} of revenue is within range but leaves limited margin for other costs.`,
          watchItem: "Phase new hires with enrollment growth to prevent staffing from exceeding 65%.",
        };
      }
      return {
        dimension: "staffing_burden",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Staffing at ${pct(staffingCostPct)} of revenue is above the sustainable range. There's too little left for everything else.`,
        watchItem: "Review staffing plan for phased hiring, shared roles, or adjusted ratios.",
      };
    },
  },
  {
    id: "facility_burden",
    label: "Facility burden",
    compute: (input) => {
      const { facilityCostPct } = input;
      if (facilityCostPct <= 0.15) {
        return {
          dimension: "facility_burden",
          status: "healthy",
          label: "Healthy",
          explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are well-managed and leave budget for programs.`,
          watchItem: "Watch for rent escalation clauses that could push this higher over time.",
        };
      }
      if (facilityCostPct <= 0.22) {
        return {
          dimension: "facility_burden",
          status: "watch",
          label: "Watch closely",
          explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are moderate but could become a constraint as other costs grow.`,
          watchItem: "Ensure enrollment growth keeps pace with any rent increases.",
        };
      }
      return {
        dimension: "facility_burden",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are high. Fixed costs this size create rigidity in your budget.`,
        watchItem: "Explore shared space, renegotiate terms, or consider a smaller facility.",
      };
    },
  },
  {
    id: "debt_affordability",
    label: "Debt affordability",
    compute: (input) => {
      const { hasDebt, dscr } = input;
      if (!hasDebt) return null;
      if (dscr >= 1.50) {
        return {
          dimension: "debt_affordability",
          status: "healthy",
          label: "Healthy",
          explanation: `DSCR of ${dscr.toFixed(2)}x provides comfortable coverage of debt payments with room to spare.`,
          watchItem: "Maintain this ratio as you take on any additional debt.",
        };
      }
      if (dscr >= 1.10) {
        return {
          dimension: "debt_affordability",
          status: "watch",
          label: "Watch closely",
          explanation: `DSCR of ${dscr.toFixed(2)}x covers debt payments but with little margin. A revenue dip could trigger covenant issues.`,
          watchItem: "Look for ways to boost operating income or reduce debt service to widen this buffer.",
        };
      }
      return {
        dimension: "debt_affordability",
        status: "at_risk",
        label: "Needs attention",
        explanation: dscr < 1.0
          ? `DSCR of ${dscr.toFixed(2)}x means operating income does not cover debt payments. This must be resolved.`
          : `DSCR of ${dscr.toFixed(2)}x is barely above 1.0x. Any shortfall in revenue makes debt unaffordable.`,
        watchItem: "Reduce loan amounts, extend terms, or increase revenue before committing to this debt.",
      };
    },
  },
  {
    id: "revenue_concentration",
    label: "Revenue concentration",
    compute: (input) => {
      const { philanthropyPct, publicRevenuePct, tuitionPct } = input;
      const dominant = Math.max(philanthropyPct, publicRevenuePct, tuitionPct);
      if (dominant <= 0.60) {
        return {
          dimension: "revenue_concentration",
          status: "healthy",
          label: "Healthy",
          explanation: "Revenue is reasonably diversified across sources, reducing dependency on any single stream.",
          watchItem: "Continue building multiple revenue channels as the school grows.",
        };
      }
      if (dominant <= 0.80) {
        const source = philanthropyPct >= publicRevenuePct && philanthropyPct >= tuitionPct
          ? "philanthropy"
          : publicRevenuePct >= tuitionPct
            ? "public funding"
            : "tuition";
        return {
          dimension: "revenue_concentration",
          status: "watch",
          label: "Watch closely",
          explanation: `${pct(dominant)} of revenue comes from ${source}. This creates moderate concentration risk.`,
          watchItem: `Develop supplementary revenue streams so a disruption in ${source} doesn't threaten operations.`,
        };
      }
      const source = philanthropyPct >= publicRevenuePct && philanthropyPct >= tuitionPct
        ? "philanthropy"
        : publicRevenuePct >= tuitionPct
          ? "public funding"
          : "tuition";
      return {
        dimension: "revenue_concentration",
        status: "at_risk",
        label: "Needs attention",
        explanation: `${pct(dominant)} of revenue depends on ${source}. A single policy change, enrollment dip, or funding cut could be devastating.`,
        watchItem: `Urgently diversify revenue — no school should depend on one source for more than 70% of its budget.`,
      };
    },
  },
  {
    id: "reserve_strength",
    label: "Reserve strength",
    compute: (input) => {
      const { reserveMonths, yearCount } = input;
      if (reserveMonths >= 3) {
        return {
          dimension: "reserve_strength",
          status: "healthy",
          label: "Healthy",
          explanation: `${reserveMonths.toFixed(1)} months of reserves by Year ${yearCount} — a strong buffer for unexpected costs.`,
          watchItem: "Continue growing reserves toward 6 months for best-in-class financial health.",
        };
      }
      if (reserveMonths >= 1) {
        return {
          dimension: "reserve_strength",
          status: "watch",
          label: "Watch closely",
          explanation: `${reserveMonths.toFixed(1)} months of reserves by Year ${yearCount}. Enough for small surprises, but not a major disruption.`,
          watchItem: "Target 3 months of reserves through controlled spending and surplus accumulation.",
        };
      }
      return {
        dimension: "reserve_strength",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Less than 1 month of reserves by Year ${yearCount}. The school has no financial cushion.`,
        watchItem: "Prioritize building reserves — even a small surplus each year compounds into meaningful protection.",
      };
    },
  },
];

export function generateHealthSignals(input: HealthInput): HealthSignal[] {
  const signals: HealthSignal[] = [];
  for (const dim of DIMENSIONS) {
    const signal = dim.compute(input);
    if (signal) signals.push(signal);
  }
  return signals;
}
