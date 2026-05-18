import {
  BENCHMARK_PAYROLL_GREEN,
  BENCHMARK_PAYROLL_AMBER,
  BENCHMARK_FACILITY_GREEN,
  BENCHMARK_FACILITY_AMBER,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
  BENCHMARK_DCOH_GREEN,
  BENCHMARK_DCOH_AMBER,
} from "./benchmark-thresholds.js";
import { assertEveryNextStep } from "@workspace/finance";

export type HealthStatus = "healthy" | "watch" | "at_risk";

export interface HealthSignal {
  dimension: string;
  status: HealthStatus;
  label: string;
  explanation: string;
  watchItem: string;
  /**
   * Task #658 — short, concrete one-line next step the founder can take
   * right now. Required, never empty. For "healthy" signals this is a
   * confirmation step ("Re-check after each enrollment update"); for
   * "watch" / "at_risk" it points at a specific wizard step + lever.
   */
  nextStep: string;
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
  daysCashOnHand?: number;
  /**
   * Task #909 — lowest cumulative-cash position across every month of
   * every modeled year, in dollars. Negative means the school's bank
   * balance dips below zero at some point. This is the canonical
   * trigger for the liquidity "cash goes negative" signal (prior
   * versions misread `cashRunwayMonths` as a depletion-month index
   * after #908 re-defined it as a coverage ratio). Optional so older
   * callers (workbook signals sheet) keep working with the legacy
   * runway-only heuristic.
   */
  lowestCumulativeCash?: number;
  /** Calendar month label (e.g. "Jul") of the cumulative-cash trough. */
  lowestCumulativeCashMonthLabel?: string;
  /** 0-based year index the cumulative trough falls in. */
  lowestCumulativeCashYearIndex?: number;
  /**
   * Approximate average monthly operating burn (used to decide whether
   * a positive-but-thin cumulative trough counts as "buffer thin").
   */
  avgMonthlyBurn?: number;
  /**
   * Task #909 — count of months across all modeled years where the
   * monthly net cash flow (inflow − outflow) is negative. Distinct
   * from {@link lowestCumulativeCash}: a model can burn more cash than
   * it generates in some months while the cumulative balance stays
   * positive thanks to opening cash + earlier surpluses. When this is
   * > 0 and the cumulative trough stays >= 0, surface a separate
   * `cash_flow_timing` signal instead of the at-risk "goes negative"
   * copy.
   */
  negativeNetCashFlowMonths?: number;
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const rounded = abs >= 1000 ? Math.round(abs / 100) * 100 : Math.round(abs);
  const s = `$${rounded.toLocaleString()}`;
  return n < 0 ? `-${s}` : s;
}

function troughLocation(label?: string, yearIndex?: number): string {
  if (!label) return "at the cash trough";
  if (yearIndex === undefined || yearIndex === null) return label;
  return `${label} of Year ${yearIndex + 1}`;
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
          watchItem: "Compare your real Year 1 enrollment against this projection as students enroll.",
          nextStep: "Re-check this dimension after every enrollment or major staffing change in Steps 4–6.",
        };
      }
      if (lastYearNetMargin >= 0 && breakEvenYear >= 0) {
        return {
          dimension: "viability",
          status: "watch",
          label: "Watch closely",
          explanation: `The model reaches break-even by Year ${breakEvenYear + 1}, but margins remain thin. A revenue shortfall could push it negative.`,
          watchItem: "Track monthly revenue vs. budget and have a contingency plan if you miss targets.",
          nextStep: "Open Step 7: Expenses and trim 3-5% of cost, or grow Step 4: Enrollment by a handful of students, until your last-year margin clears 10%.",
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
        nextStep: "Open Step 4: Enrollment to grow students, Step 5: Revenue to add a line, or Step 7: Expenses to cut cost — pick whichever is most realistic and re-run the model.",
      };
    },
  },
  {
    id: "liquidity",
    label: "Liquidity",
    compute: (input) => {
      const {
        cashRunwayMonths,
        reserveMonths,
        lowestCumulativeCash,
        lowestCumulativeCashMonthLabel,
        lowestCumulativeCashYearIndex,
        avgMonthlyBurn,
      } = input;

      // Task #909 — prefer the cumulative-cash trough as the
      // "goes negative" trigger. `cashRunwayMonths` is the canonical
      // coverage ratio (#908) — months of fixed-cost coverage from
      // year-end cash — *not* a depletion-month index. Reading it as a
      // month number produces nonsense copy like "Cash goes negative in
      // month 1.9". The cumulative-cash series exposes the actual
      // trough (e.g. Oakwood: lowest = $4,932 in July, stays positive).
      const cumulativeAvailable = typeof lowestCumulativeCash === "number";

      if (cumulativeAvailable && lowestCumulativeCash! < 0) {
        const where = troughLocation(
          lowestCumulativeCashMonthLabel,
          lowestCumulativeCashYearIndex,
        );
        return {
          dimension: "liquidity",
          status: "at_risk",
          label: "Needs attention",
          explanation: `Cumulative cash dips to ${fmtMoney(lowestCumulativeCash!)} in ${where}. The school will need outside funding to continue operating.`,
          watchItem: "Secure a line of credit or bridge funding before the trough month.",
          nextStep: "Open Step 2: School Details to raise opening cash, or trim Step 7: Expenses to push the cash trough above zero.",
        };
      }

      // Buffer-thin: cumulative stays positive but dips below one
      // month of average burn. Replaces the old "goes negative" copy
      // for the Oakwood-style case (positive trough, slim buffer).
      const bufferThreshold = avgMonthlyBurn && avgMonthlyBurn > 0 ? avgMonthlyBurn : Infinity;
      if (cumulativeAvailable && lowestCumulativeCash! >= 0 && lowestCumulativeCash! < bufferThreshold) {
        const where = troughLocation(
          lowestCumulativeCashMonthLabel,
          lowestCumulativeCashYearIndex,
        );
        return {
          dimension: "liquidity",
          status: "watch",
          label: "Watch closely",
          explanation: `Cash stays positive, but the buffer thins to ${fmtMoney(lowestCumulativeCash!)} in ${where} — less than one month of operating burn. A small revenue miss could push it below zero.`,
          watchItem: "Watch the trough month closely and line up a credit facility before it hits.",
          nextStep: "Open Step 2: School Details and raise opening cash, or trim Step 7: Expenses, until the trough holds at least one month of burn.",
        };
      }

      // Cumulative healthy: branch on reserveMonths for the remaining
      // healthy / reserve-thin verdicts. When cumulative data isn't
      // available (legacy workbook caller), fall back to a runway
      // proxy: canonical `cashRunwayMonths` >= 3 = comfortable.
      const cumulativeHealthy = cumulativeAvailable
        ? lowestCumulativeCash! >= bufferThreshold
        : cashRunwayMonths >= 3;

      if (cumulativeHealthy && reserveMonths >= 3) {
        return {
          dimension: "liquidity",
          status: "healthy",
          label: "Healthy",
          explanation: "Cash stays positive throughout the projection and reserves exceed 3 months of expenses.",
          watchItem: "Maintain reserves as a buffer against seasonal revenue dips.",
          nextStep: "Keep cash and reserves where they are; revisit Step 2: School Details after any large capital plan change.",
        };
      }
      if (cumulativeHealthy && reserveMonths >= 1) {
        return {
          dimension: "liquidity",
          status: "watch",
          label: "Watch closely",
          explanation: `Cash stays positive but reserves cover only ${reserveMonths.toFixed(1)} months. Any unexpected cost could create a cash crunch.`,
          watchItem: "Build reserves toward 3 months by controlling early-year spending.",
          nextStep: "Open Step 2: School Details and raise opening cash, or trim Step 7: Expenses, until reserves cover at least 3 months of expenses.",
        };
      }
      if (cumulativeHealthy) {
        return {
          dimension: "liquidity",
          status: "watch",
          label: "Watch closely",
          explanation: "Cash stays positive but reserves are thin. Build a buffer before unexpected costs arise.",
          watchItem: "Target at least 1 month of operating reserves.",
          nextStep: "Open Step 2: School Details and raise opening cash, or trim Step 7: Expenses, until reserves cover at least 3 months of expenses.",
        };
      }

      // Legacy fallback (no cumulative data): canonical runway < 3
      // months. Phrase as "thin coverage" rather than the old broken
      // "goes negative in month N" copy.
      return {
        dimension: "liquidity",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Year-end cash covers only ${cashRunwayMonths.toFixed(1)} months of fixed costs. The school will need outside funding to continue operating.`,
        watchItem: "Secure a line of credit or bridge funding before operations begin.",
        nextStep: "Open Step 2: School Details to raise opening cash, or trim Step 7: Expenses to widen the runway past 3 months.",
      };
    },
  },
  {
    // Task #909 — parallel signal for the "uses more cash than it
    // generates in some months" case. Triggers when there is at least
    // one month with negative monthly net cash flow but the cumulative
    // balance never dips below zero (otherwise the at-risk liquidity
    // signal above carries the message). Distinct copy so the founder
    // sees timing risk separately from outright depletion risk.
    id: "cash_flow_timing",
    label: "Cash flow timing",
    compute: (input) => {
      const { negativeNetCashFlowMonths, lowestCumulativeCash } = input;
      if (negativeNetCashFlowMonths === undefined || negativeNetCashFlowMonths === null) {
        return null;
      }
      const cumulativeBelowZero =
        typeof lowestCumulativeCash === "number" && lowestCumulativeCash < 0;
      if (cumulativeBelowZero) {
        // Liquidity signal already covers the at-risk depletion case;
        // emitting a second signal would double-count the same risk.
        return null;
      }
      if (negativeNetCashFlowMonths <= 0) {
        return {
          dimension: "cash_flow_timing",
          status: "healthy",
          label: "Healthy",
          explanation: "Every month generates at least as much cash as it consumes — no timing gaps to bridge.",
          watchItem: "Re-check after any change to billing cadence or payroll timing in Step 6.",
          nextStep: "Re-check this dimension after every billing-cadence or payroll-timing change in Steps 5-6.",
        };
      }
      return {
        dimension: "cash_flow_timing",
        status: "watch",
        label: "Watch closely",
        explanation: `The school uses more cash than it generates in ${negativeNetCashFlowMonths} ${negativeNetCashFlowMonths === 1 ? "month" : "months"}. Opening cash absorbs the gap today, but tight timing leaves no margin for late tuition or a delayed disbursement.`,
        watchItem: "Track receivables and payroll dates against the trough month so a single late payment doesn't tip the cumulative balance negative.",
        nextStep: "Open Step 5: Revenue and tighten billing cadence (or grow an enrollment-driven line), or trim Step 7: Expenses, until monthly net stays positive.",
      };
    },
  },
  {
    id: "staffing_burden",
    label: "Staffing burden",
    compute: (input) => {
      const { staffingCostPct } = input;
      if (staffingCostPct <= BENCHMARK_PAYROLL_GREEN) {
        return {
          dimension: "staffing_burden",
          status: "healthy",
          label: "Healthy",
          explanation: `Staffing at ${pct(staffingCostPct)} of revenue leaves room for facilities, programs, and reserves.`,
          watchItem: "As you add staff, ensure staffing stays below 60% of revenue.",
          nextStep: "Re-check after every staffing change in Step 6 to make sure payroll stays under 60% of revenue.",
        };
      }
      if (staffingCostPct <= BENCHMARK_PAYROLL_AMBER) {
        return {
          dimension: "staffing_burden",
          status: "watch",
          label: "Watch closely",
          explanation: `Staffing at ${pct(staffingCostPct)} of revenue is within range but leaves limited margin for other costs.`,
          watchItem: "Phase new hires with enrollment growth to prevent staffing from exceeding 65%.",
          nextStep: "Open Step 6: Staffing and shift one Year 1 role to part-time or to a Year 2 start date so payroll stays under 65% of revenue.",
        };
      }
      return {
        dimension: "staffing_burden",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Staffing at ${pct(staffingCostPct)} of revenue is above the sustainable range. There's too little left for everything else.`,
        watchItem: "Review staffing plan for phased hiring, shared roles, or adjusted ratios.",
        nextStep: "Open Step 6: Staffing and remove or defer at least one role until staffing is back under 65% of revenue.",
      };
    },
  },
  {
    id: "facility_burden",
    label: "Facility burden",
    compute: (input) => {
      const { facilityCostPct } = input;
      if (facilityCostPct <= BENCHMARK_FACILITY_GREEN) {
        return {
          dimension: "facility_burden",
          status: "healthy",
          label: "Healthy",
          explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are well-managed and leave budget for programs.`,
          watchItem: "Watch for rent escalation clauses that could push this higher over time.",
          nextStep: "Watch your lease for rent escalation clauses and re-check this signal in Step 7 each year.",
        };
      }
      if (facilityCostPct <= BENCHMARK_FACILITY_AMBER) {
        return {
          dimension: "facility_burden",
          status: "watch",
          label: "Watch closely",
          explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are moderate but could become a constraint as other costs grow.`,
          watchItem: "Ensure enrollment growth keeps pace with any rent increases.",
          nextStep: "Open Step 7: Expenses and confirm your facility line and any rent escalation; trim it if enrollment growth is uncertain.",
        };
      }
      return {
        dimension: "facility_burden",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Facility costs at ${pct(facilityCostPct)} of revenue are high. Fixed costs this size create rigidity in your budget.`,
        watchItem: "Explore shared space, renegotiate terms, or consider a smaller facility.",
        nextStep: "Open Step 7: Expenses and reduce facility cost (smaller space, shared site, or phased build-out) until facility lands under 25% of revenue.",
      };
    },
  },
  {
    id: "debt_affordability",
    label: "Debt affordability",
    compute: (input) => {
      const { hasDebt, dscr } = input;
      if (!hasDebt) return null;
      if (dscr >= BENCHMARK_DSCR_GREEN) {
        return {
          dimension: "debt_affordability",
          status: "healthy",
          label: "Healthy",
          explanation: `DSCR of ${dscr.toFixed(2)}x provides comfortable coverage of debt payments with room to spare.`,
          watchItem: "Maintain this ratio as you take on any additional debt.",
          nextStep: "Re-check DSCR after any new debt is added in Step 5 to keep coverage at or above 1.25x.",
        };
      }
      if (dscr >= BENCHMARK_DSCR_AMBER) {
        return {
          dimension: "debt_affordability",
          status: "watch",
          label: "Watch closely",
          explanation: `DSCR of ${dscr.toFixed(2)}x covers debt payments but with little margin. A revenue dip could trigger covenant issues.`,
          watchItem: "Look for ways to boost operating income or reduce debt service to widen this buffer.",
          nextStep: "Open Step 7: Expenses and trim 5-10% of operating cost, or revisit your loan terms in Step 5, to widen DSCR to 1.25x.",
        };
      }
      return {
        dimension: "debt_affordability",
        status: "at_risk",
        label: "Needs attention",
        explanation: `DSCR of ${dscr.toFixed(2)}x is below the ${BENCHMARK_DSCR_AMBER}x amber threshold. Any shortfall in revenue makes debt unaffordable.`,
        watchItem: "Reduce loan amounts, extend terms, or increase revenue before committing to this debt.",
        nextStep: "Open Step 5: Revenue and lower the loan principal, extend the term, or phase the capex until DSCR clears 1.25x.",
      };
    },
  },
  {
    id: "revenue_concentration",
    label: "Enrollment & demand reliability",
    compute: (input) => {
      const { philanthropyPct, publicRevenuePct } = input;

      const philanthropyHeavy = philanthropyPct > 0.40;
      const singleGrantRisk = philanthropyPct > 0.30;
      const publicFundingVolatile = publicRevenuePct > 0.70;

      if (philanthropyHeavy) {
        return {
          dimension: "revenue_concentration",
          status: "at_risk",
          label: "Needs attention",
          explanation: `${pct(philanthropyPct)} of revenue depends on grants and donations, which are inherently unpredictable. A focused revenue model is fine — but it should be anchored to dependable, demand-driven income, not fundraising.`,
          watchItem: "Shift toward earned revenue (tuition, per-pupil funding) so philanthropy becomes supplemental rather than foundational.",
          nextStep: "Open Step 5: Revenue and add or grow an enrollment-driven line until grants drop below 40% of total revenue.",
        };
      }

      if (singleGrantRisk) {
        return {
          dimension: "revenue_concentration",
          status: "watch",
          label: "Watch closely",
          explanation: `Grants and donations account for ${pct(philanthropyPct)} of revenue. This is manageable, but grants are competitive and time-limited — pressure-test whether this support is renewable.`,
          watchItem: "Confirm grant renewal expectations and build a plan to grow earned revenue so the model isn't dependent on fundraising cycles.",
          nextStep: "Open Step 5: Revenue and grow tuition or per-pupil lines, or document grant renewal evidence in Step 1: Story.",
        };
      }

      if (publicFundingVolatile) {
        return {
          dimension: "revenue_concentration",
          status: "watch",
          label: "Watch closely",
          explanation: `${pct(publicRevenuePct)} of revenue comes from public funding. This is typical for charter schools, but disbursement timing and policy changes can create cash flow gaps.`,
          watchItem: "Model disbursement timing carefully, maintain cash reserves for funding gaps, and track legislative changes that could affect per-pupil allocations.",
          nextStep: "Open Step 5: Revenue and grow tuition or per-pupil lines, or document grant renewal evidence in Step 1: Story.",
        };
      }

      return {
        dimension: "revenue_concentration",
        status: "healthy",
        label: "Healthy",
        explanation: "Revenue is anchored to enrollment-driven income — the strongest foundation for a school model. A focused revenue stream is a strength when backed by dependable demand.",
        watchItem: "Continue to pressure-test enrollment assumptions: recruitment pipeline, waitlist depth, retention rates, and collection reliability.",
        nextStep: "Pressure-test your enrollment pipeline each cycle and re-check this signal after Step 4 updates.",
      };
    },
  },
  {
    id: "days_cash",
    label: "Days cash on hand",
    compute: (input) => {
      const dcoh = input.daysCashOnHand;
      if (dcoh === undefined || dcoh === null) return null;
      const rounded = Math.round(dcoh);
      if (rounded >= BENCHMARK_DCOH_GREEN) {
        return {
          dimension: "days_cash",
          status: "healthy",
          label: "Healthy",
          explanation: `${rounded} days of cash on hand exceeds the 90-day benchmark, providing a strong liquidity cushion.`,
          watchItem: "Maintain this buffer to weather seasonal revenue dips or unexpected expenses.",
          nextStep: "Maintain this buffer; re-check after any large planned outflow.",
        };
      }
      if (rounded >= BENCHMARK_DCOH_AMBER) {
        return {
          dimension: "days_cash",
          status: "watch",
          label: "Watch closely",
          explanation: `${rounded} days of cash on hand is above the minimum but below the 90-day target. A large unexpected cost could create a cash crunch.`,
          watchItem: "Build toward 90+ days of cash on hand by controlling early-year spending and building reserves.",
          nextStep: "Open Step 2: School Details and raise opening cash, or trim Step 7: Expenses, until days cash on hand clears 90.",
        };
      }
      return {
        dimension: "days_cash",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Only ${rounded} days of cash on hand — well below the 45-day minimum. The school is at risk of running out of cash.`,
        watchItem: "Secure a line of credit or bridge funding, and prioritize building cash reserves.",
        nextStep: "Open Step 2: School Details and raise opening cash, or secure a line of credit, then re-run the model.",
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
          nextStep: "Keep building toward 6 months of reserves through controlled spending in Step 7.",
        };
      }
      if (reserveMonths >= 1) {
        return {
          dimension: "reserve_strength",
          status: "watch",
          label: "Watch closely",
          explanation: `${reserveMonths.toFixed(1)} months of reserves by Year ${yearCount}. Enough for small surprises, but not a major disruption.`,
          watchItem: "Target 3 months of reserves through controlled spending and surplus accumulation.",
          nextStep: "Open Step 7: Expenses and trim 3-5% of annual cost, or grow enrollment by 5-10 students in Step 4, until reserves reach 3 months.",
        };
      }
      return {
        dimension: "reserve_strength",
        status: "at_risk",
        label: "Needs attention",
        explanation: `Less than 1 month of reserves by Year ${yearCount}. The school has no financial cushion.`,
        watchItem: "Prioritize building reserves — even a small surplus each year compounds into meaningful protection.",
        nextStep: "Open Step 7: Expenses and trim cost, or revisit Step 5: Revenue, until you accumulate at least 1 month of operating reserves.",
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
  // Task #686 — guardrail: every emitted HealthSignal must carry a
  // concrete coach-voice nextStep.
  return assertEveryNextStep(signals, "HealthSignal") as HealthSignal[];
}
