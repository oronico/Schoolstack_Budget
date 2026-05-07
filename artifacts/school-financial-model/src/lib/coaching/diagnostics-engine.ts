import { isSingleYearModel, type FullModelData } from "@/pages/model-wizard/schema";
import { computeAnnualDebt, DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE, DEFAULT_COLA_PCT, assertEveryNextStep } from "@workspace/finance";
import { computeQuickLevers } from "@/lib/scenario-engine";

// Task #658 — engine ownership map.
//
// Coach-tone "next step" guidance lives in five engines, each owning a
// distinct flag type and surface:
//
// 1. THIS FILE — DiagnosticFinding (frontend wizard / DiagnosticPanel).
//    Owns the 8 required diagnostic checks the founder sees while
//    building the model: negative_cash_y1, weak_break_even, high_staffing,
//    high_facility, grant_dependency, retention_assumption,
//    revenue_per_student_high, staffing_too_low, founder_comp_missing,
//    public_funding_timing, plus a few advisory checks.
// 2. artifacts/api-server/src/lib/decision-rules.ts — DecisionIssue
//    (consultant + lender top-issues panel and packets). Independent rule
//    set focused on lender-readiness rollups, not duplicated here on
//    purpose: the wizard wants founder-language coaching, the lender
//    packet wants concise underwriting commentary.
// 3. artifacts/api-server/src/lib/financial-health.ts — HealthSignal (8
//    health dimensions × 3 statuses, used in HealthSignalCard).
// 4. artifacts/api-server/src/lib/assumption-flags.ts — AssumptionFlag
//    (NarrativeStep "answer about your assumption" cards).
// 5. lib/finance/src/decision-engine/{scenario-engine,decision-flows}.ts
//    — NudgeItem (scenario-comparison NudgeCards + program-pathway
//    decision flows).
//
// All five engines are required to populate `nextStep`; the
// next-step-registry.test.ts source-scan enforces this at PR time.
export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  headline: string;
  explanation: string;
  /** Coach-voice prose explaining the broader fix (kept for backwards
   *  compatibility — most surfaces still render this above the concrete
   *  next step). */
  action: string;
  /** Task #658 — short, concrete one-line next step the founder can take
   *  right now. Required, never empty. Example: "Open Step 5: Staffing
   *  and shift one role to part-time for Year 1." */
  nextStep: string;
  targetStep: number;
}

interface DiagnosticRule {
  id: string;
  /**
   * `true` if the rule reads from per-year arrays at index >= 1 (Y2-Y5).
   * In single-year mode every Y2-Y5 entry is phantom (computed against a
   * zero-padded enrollment array or the Y1 fallback the engine uses for
   * empty years), so multi-year rules would fire on data the founder never
   * entered. We skip them entirely when the model is single-year.
   */
  multiYear?: boolean;
  check: (data: FullModelData, computed: ComputedMetrics) => Omit<DiagnosticFinding, "id"> | null;
}

export interface ComputedMetrics {
  y1Revenue: number;
  y1StaffingCost: number;
  y1TotalExpenses: number;
  y1NetIncome: number;
  y1FacilityCost: number;
  enrollment: number[];
  revenueByYear: number[];
  expensesByYear: number[];
  staffingByYear: number[];
  opexByYear: number[];
  capDebtByYear: number[];
  grantRevenue: number;
  // Task #658 — Year 1 public-funding revenue, computed with the same
  // driver-expanded math as `revenueByYear` (handles `per_student`,
  // `monthly`, `annual_fixed`, etc.). Used by the `public_funding_timing`
  // required diagnostic so the trigger fires on real public-funding
  // exposure rather than on the raw amount cell.
  publicY1Revenue: number;
  endingCashByYear: number[];
  breakevenEnrollment: number;
  y1VariableCostPerStudent: number;
  y1FixedCosts: number;
}

const THRESHOLDS = {
  staffingPctCritical: 75,
  staffingPctWarning: 65,
  rentPctWarning: 25,
  grantDependencyPct: 40,
  enrollmentGrowthPct: 50,
  minReserveMonths: 1,
} as const;


export function computeMetrics(data: FullModelData): ComputedMetrics {
  const programs = data.programs || [];
  const enrollment = [0, 0, 0, 0, 0];
  for (const prog of programs) {
    enrollment[0] += prog.year1 || 0;
    enrollment[1] += prog.year2 || 0;
    enrollment[2] += prog.year3 || 0;
    enrollment[3] += prog.year4 || 0;
    enrollment[4] += prog.year5 || 0;
  }
  if (enrollment[0] === 0 && data.enrollment) {
    enrollment[0] = data.enrollment.year1 || 0;
    enrollment[1] = data.enrollment.year2 || 0;
    enrollment[2] = data.enrollment.year3 || 0;
    enrollment[3] = data.enrollment.year4 || 0;
    enrollment[4] = data.enrollment.year5 || 0;
  }

  const y1Students = enrollment[0] || 1;
  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const sp = data.schoolProfile;
  const cola = (sp && typeof sp === "object" && "annualSalaryIncrease" in sp)
    ? (sp as { annualSalaryIncrease?: number }).annualSalaryIncrease ?? DEFAULT_COLA_PCT
    : DEFAULT_COLA_PCT;
  const costInflation = (data.facilities as Record<string, unknown> | undefined)?.generalCostInflation as number ?? 0;
  const retentionRate = (data.enrollment as Record<string, unknown> | undefined)?.retentionRate as number ?? 85;

  function driverVal(
    amounts: number[] | undefined, y: number, driverType: string, students: number,
    escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number, fte?: number
  ): number {
    let base = amounts?.[y] ?? 0;
    const esc = escalationRate ?? fallbackInflation ?? 0;
    if (esc !== 0 && y > 0) {
      base = (amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
    }
    switch (driverType) {
      case "monthly": return base * 12;
      case "per_student": return base * students;
      case "per_new_student": return base * (newStudents ?? students);
      case "per_returning_student": return base * (returningStudents ?? 0);
      case "per_fte": return base * (fte ?? 0);
      case "annual_fixed": return base;
      default: return base;
    }
  }

  const revenueByYear = [0, 0, 0, 0, 0];
  let grantRevenue = 0;
  let publicY1Revenue = 0;

  for (let y = 0; y < 5; y++) {
    const students = enrollment[y] || y1Students;
    const rowVals = new Map<string, number>();
    for (const r of revenueRows) {
      if (!r.enabled || r.driverType === "percent_of_base") continue;
      const val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation);
      rowVals.set(r.id, val);
    }
    for (const r of revenueRows) {
      if (!r.enabled || r.driverType !== "percent_of_base") continue;
      const baseVal = rowVals.get(r.percentBase || "") || 0;
      let pctVal = r.amounts?.[y] ?? 0;
      if (r.escalationRate && r.escalationRate !== 0 && y > 0) {
        pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      rowVals.set(r.id, baseVal * (pctVal / 100));
    }
    for (const r of revenueRows) {
      if (!r.enabled) continue;
      const v = rowVals.get(r.id) || 0;
      if (r.category === "tuition_offsets") revenueByYear[y] -= Math.abs(v);
      else revenueByYear[y] += v;
      if (y === 0 && (r.category === "grants_contributions" || r.category === "philanthropy")) {
        grantRevenue += v;
      }
      // Task #658 — accumulate driver-expanded public funding for Year 1
      // so the `public_funding_timing` rule sees real exposure, not raw
      // `amounts[0]` (which under-counts per-student / monthly drivers).
      if (y === 0 && r.category === "public_funding") {
        publicY1Revenue += v;
      }
    }
  }

  let y1StaffingCost = 0;
  for (const s of staffingRows) {
    const base = (s.fte || 0) * (s.annualizedRate || 0);
    const isContractNotPayrollLike = s.employmentType === "contract" && !s.payrollLike;
    let rowCost = base;
    if (!isContractNotPayrollLike) {
      if (s.benefitsEligible) rowCost += base * ((s.benefitsRate ?? DEFAULT_BENEFITS_RATE) / 100);
      rowCost += base * ((s.payrollTaxRate ?? DEFAULT_PAYROLL_TAX_RATE) / 100);
    }
    y1StaffingCost += rowCost;
  }

  function computeFTEForYear(year: number, students: number): number {
    let total = 0;
    for (const s of staffingRows) {
      let fte = s.fte || 0;
      const startYr = (s as Record<string, unknown>).startYear as number | undefined;
      const endYr = (s as Record<string, unknown>).endYear as number | undefined;
      const staffMode = (s as Record<string, unknown>).staffingMode as string | undefined;
      const ratio = (s as Record<string, unknown>).studentRatio as number | undefined;
      const minF = (s as Record<string, unknown>).minFte as number | undefined;
      const maxF = (s as Record<string, unknown>).maxFte as number | undefined;
      if (startYr && (year + 1) < startYr) fte = 0;
      else if (endYr && (year + 1) > endYr) fte = 0;
      else if (staffMode === "ratio" && ratio && ratio > 0) {
        let computed = students / ratio;
        if (minF !== undefined) computed = Math.max(computed, minF);
        if (maxF !== undefined) computed = Math.min(computed, maxF);
        fte = Math.ceil(computed * 2) / 2;
      }
      total += fte;
    }
    return total;
  }

  const y1TotalFTE = computeFTEForYear(0, y1Students);

  let y1OpExpenses = 0;
  let y1FacilityCost = 0;
  let y1VariableCostPerStudent = 0;
  let y1FixedCosts = 0;
  const y1Revenue = revenueByYear[0];
  for (const e of expenseRows) {
    if (!e.enabled) continue;
    let val: number;
    if (e.driverType === "percent_of_revenue") {
      val = ((e.amounts?.[0] ?? 0) / 100) * y1Revenue;
    } else if (e.driverType === "per_fte") {
      val = (e.amounts?.[0] ?? 0) * y1TotalFTE;
    } else {
      val = driverVal(e.amounts, 0, e.driverType, y1Students, e.escalationRate, costInflation);
    }
    y1OpExpenses += val;
    if (e.category === "occupancy_facility") {
      y1FacilityCost += val;
    }
    const dt = e.driverType as string;
    if (dt === "per_student" || dt === "per_new_student" || dt === "per_returning_student") {
      y1VariableCostPerStudent += e.amounts?.[0] ?? 0;
    } else if (e.driverType !== "percent_of_revenue") {
      y1FixedCosts += val;
    }
  }
  y1FixedCosts += y1StaffingCost;

  let y1CapDebt = 0;
  for (const c of capDebtRows) {
    if (!c.enabled) continue;
    if (c.isLoan && c.loanPrincipal && c.loanRate && c.loanTermYears) {
      y1CapDebt += computeAnnualDebt(c.loanPrincipal, c.loanRate / 100, c.loanTermYears);
    } else {
      y1CapDebt += driverVal(c.amounts, 0, c.driverType, y1Students);
    }
  }
  y1FixedCosts += y1CapDebt;

  const revenuePerStudent = y1Students > 0 ? revenueByYear[0] / y1Students : 0;
  const contributionMargin = revenuePerStudent - y1VariableCostPerStudent;
  const breakevenEnrollment = contributionMargin > 0 ? Math.ceil(y1FixedCosts / contributionMargin) : Infinity;

  const expensesByYear = [0, 0, 0, 0, 0];
  const staffingByYear = [0, 0, 0, 0, 0];
  const opexByYear = [0, 0, 0, 0, 0];
  const capDebtByYear = [0, 0, 0, 0, 0];
  for (let y = 0; y < 5; y++) {
    const students = enrollment[y] || y1Students;
    const ns = y === 0 ? students : Math.max(0, students - Math.min(students, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100))));
    const rs = y === 0 ? 0 : Math.min(students, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
    const staffY = y1StaffingCost * Math.pow(1 + cola / 100, y);
    const yearFTE = computeFTEForYear(y, students);
    let opY = 0;
    for (const e of expenseRows) {
      if (!e.enabled) continue;
      if (e.driverType === "percent_of_revenue") {
        const esc = e.escalationRate ?? costInflation ?? 0;
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = (e.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = e.amounts?.[y] ?? 0;
        }
        opY += (pct / 100) * revenueByYear[y];
      } else {
        opY += driverVal(e.amounts, y, e.driverType, students, e.escalationRate, costInflation, ns, rs, yearFTE);
      }
    }
    let capDebtY = 0;
    for (const c of capDebtRows) {
      if (!c.enabled) continue;
      if (c.isLoan && c.loanPrincipal && c.loanRate && c.loanTermYears) {
        if (y < c.loanTermYears) {
          capDebtY += computeAnnualDebt(c.loanPrincipal, c.loanRate / 100, c.loanTermYears);
        }
      } else {
        capDebtY += driverVal(c.amounts, y, c.driverType, students, (c as Record<string, unknown>).escalationRate as number | undefined, costInflation);
      }
    }
    expensesByYear[y] = staffY + opY + capDebtY;
    staffingByYear[y] = staffY;
    opexByYear[y] = opY;
    capDebtByYear[y] = capDebtY;
  }

  const y1TotalExpenses = y1StaffingCost + y1OpExpenses + y1CapDebt;
  const y1NetIncome = y1Revenue - y1TotalExpenses;

  const startingCash = data.openingBalances?.cash ?? 0;
  const endingCashByYear = [0, 0, 0, 0, 0];
  let cumCash = startingCash;
  for (let y = 0; y < 5; y++) {
    cumCash += revenueByYear[y] - expensesByYear[y];
    endingCashByYear[y] = cumCash;
  }

  return {
    y1Revenue,
    y1StaffingCost,
    y1TotalExpenses,
    y1NetIncome,
    y1FacilityCost,
    publicY1Revenue,
    enrollment,
    revenueByYear,
    expensesByYear,
    staffingByYear,
    opexByYear,
    capDebtByYear,
    grantRevenue,
    endingCashByYear,
    breakevenEnrollment,
    y1VariableCostPerStudent,
    y1FixedCosts,
  };
}

const RULES: DiagnosticRule[] = [
  // Multi-year: scans all 5 years of ending cash. In single-year mode the
  // engine still emits length-5 arrays computed against phantom Y1-fallback
  // students, so a Y2-Y5 negative would not be a real founder-modelled
  // condition. The single-year-safe variant below covers Y1 only.
  {
    id: "negative_cash",
    multiYear: true,
    check: (_data, m) => {
      const badYear = m.endingCashByYear.findIndex(c => c < 0);
      if (badYear === -1) return null;
      return {
        severity: "critical",
        headline: `I'm seeing cash go negative in Year ${badYear + 1}`,
        explanation: `Your projected ending cash drops below zero in Year ${badYear + 1}. That means the school wouldn't be able to cover its bills. We see this a lot in early drafts, so don't worry - it's fixable.`,
        action: "I'd start by reviewing your revenue assumptions or trimming expenses so cash stays positive every year. Even small timing adjustments can make a big difference.",
        nextStep: `Open Step 7: Expenses and trim ${Math.round(Math.abs(m.endingCashByYear[badYear]) / 1000)}K of cost from Year ${badYear + 1}, or revisit Step 4: Enrollment to add a revenue source.`,
        targetStep: 7,
      };
    },
  },
  {
    id: "negative_cash_y1",
    check: (_data, m) => {
      const y1Cash = m.endingCashByYear[0];
      if (y1Cash === undefined || y1Cash >= 0) return null;
      return {
        severity: "critical",
        headline: "I'm seeing Year 1 cash go negative",
        explanation: "Your projected ending cash for Year 1 drops below zero. That means the school wouldn't be able to cover its bills. We see this a lot in early drafts, so don't worry - it's fixable.",
        action: "I'd start by reviewing your revenue assumptions or trimming expenses so cash stays positive in Year 1. Even small timing adjustments can make a big difference.",
        nextStep: `Open Step 7: Expenses and trim about ${Math.round(Math.abs(y1Cash) / 1000)}K of Year 1 cost, or add a revenue line in Step 5.`,
        targetStep: 7,
      };
    },
  },
  {
    id: "high_staffing_critical",
    check: (_data, m) => {
      if (m.y1Revenue <= 0) return null;
      const pct = (m.y1StaffingCost / m.y1Revenue) * 100;
      if (pct < THRESHOLDS.staffingPctCritical) return null;
      return {
        severity: "critical",
        headline: `I'd watch this - staffing costs are ${Math.round(pct)}% of revenue`,
        explanation: `Personnel costs above ${THRESHOLDS.staffingPctCritical}% of revenue leave almost nothing for operations, facilities, and reserves. This is one of the most common issues we see in early-stage models - and it's very fixable.`,
        action: "We'd recommend looking at whether all positions are truly needed in Year 1. Phasing in roles as enrollment grows is one of the most effective levers you have.",
        nextStep: "Open Step 6: Staffing and move at least one role to a Year 2 start date, or convert a full-time line to part-time.",
        targetStep: 5,
      };
    },
  },
  {
    id: "high_staffing_warning",
    check: (_data, m) => {
      if (m.y1Revenue <= 0) return null;
      const pct = (m.y1StaffingCost / m.y1Revenue) * 100;
      if (pct < THRESHOLDS.staffingPctWarning || pct >= THRESHOLDS.staffingPctCritical) return null;
      return {
        severity: "warning",
        headline: `I'd keep an eye on this - staffing costs are at ${Math.round(pct)}% of revenue`,
        explanation: `Personnel costs between ${THRESHOLDS.staffingPctWarning}% and ${THRESHOLDS.staffingPctCritical}% are on the high side. Healthy schools typically stay between 50-60%. You still have room to adjust, but it's worth looking at whether you can trim here.`,
        action: "I'd look at whether some roles can start part-time or be phased in after Year 1. That's usually the quickest way to create breathing room.",
        nextStep: "Open Step 6: Staffing and lower one Year 1 role's FTE (e.g. 1.0 → 0.5) to bring staffing back under 60% of revenue.",
        targetStep: 5,
      };
    },
  },
  {
    id: "high_occupancy",
    check: (_data, m) => {
      if (m.y1Revenue <= 0) return null;
      const pct = (m.y1FacilityCost / m.y1Revenue) * 100;
      if (pct < THRESHOLDS.rentPctWarning) return null;
      return {
        severity: "warning",
        headline: `Worth watching - facility costs are ${Math.round(pct)}% of revenue`,
        explanation: `Spending more than ${THRESHOLDS.rentPctWarning}% of revenue on your facility is something we see often. It crowds out staffing and program budgets, which puts pressure on the whole model.`,
        action: "I'd explore lower-cost space options, shared facilities, or phased facility upgrades. Many successful schools start in modest space and upgrade as enrollment proves out.",
        nextStep: "Open Step 7: Expenses, find your facility line, and reduce it (smaller square footage, shared space, or phased build-out) until facility lands under 25% of Year 1 revenue.",
        targetStep: 6,
      };
    },
  },
  {
    id: "grant_dependency",
    check: (_data, m) => {
      if (m.y1Revenue <= 0) return null;
      const pct = (m.grantRevenue / m.y1Revenue) * 100;
      if (pct < THRESHOLDS.grantDependencyPct) return null;
      return {
        severity: "warning",
        headline: `I'd watch this - ${Math.round(pct)}% of your revenue comes from grants`,
        explanation: `Relying on grants and philanthropy for more than ${THRESHOLDS.grantDependencyPct}% of revenue is worth watching. Grants are time-limited and competitive. The strongest models are anchored to enrollment-driven revenue.`,
        action: "We'd recommend focusing on growing enrollment-driven revenue (tuition, per-pupil funding) so grants become supplemental, not foundational. That's what makes a model resilient.",
        nextStep: "Open Step 5: Revenue and add or grow an enrollment-driven line (tuition or per-pupil) so grants drop below 40% of total revenue.",
        targetStep: 4,
      };
    },
  },
  {
    // Multi-year: compares Y2-Y4 enrollment against the prior year. Phantom
    // in single-year mode (Y2-Y5 enrollment is zero / Y1 fallback there).
    id: "fast_enrollment_growth",
    multiYear: true,
    check: (_data, m) => {
      for (let y = 1; y < 5; y++) {
        const prev = m.enrollment[y - 1];
        if (prev <= 0) continue;
        const growth = ((m.enrollment[y] - prev) / prev) * 100;
        if (growth > THRESHOLDS.enrollmentGrowthPct) {
          return {
            severity: "warning",
            headline: `I'd question this - enrollment jumps ${Math.round(growth)}% in Year ${y + 1}`,
            explanation: `Growing by more than ${THRESHOLDS.enrollmentGrowthPct}% in a single year is hard to achieve. Most new schools grow 15-25% per year. Anyone reviewing your model will want to understand how you plan to recruit this many students.`,
            action: "I'd make sure you have evidence to support this growth - waitlist data, marketing plans, or community partnerships. If you can't back it up, consider moderating the projection.",
            nextStep: `Open Step 4: Enrollment, and either lower Year ${y + 1} enrollment to a 15-25% jump or add a note describing the waitlist, marketing, or partnership evidence behind the ${Math.round(growth)}% growth.`,
            targetStep: 3,
          };
        }
      }
      return null;
    },
  },
  {
    id: "no_reserves",
    check: (data, m) => {
      if (m.y1Revenue <= 0) return null;
      const monthlyExpense = m.y1TotalExpenses / 12;
      if (monthlyExpense <= 0) return null;
      const startingCash = data.openingBalances?.cash ?? 0;
      const reserveMonths = (startingCash + m.y1NetIncome) / monthlyExpense;
      if (reserveMonths >= THRESHOLDS.minReserveMonths) return null;
      return {
        severity: "critical",
        headline: "I see no cash reserve cushion here - we need to address this",
        explanation: "Your model shows less than one month of operating reserves. Any unexpected expense or delayed funding could put the school at risk. Best practice is at least 45-60 days of reserves - and we'd encourage you to aim higher.",
        action: "I'd build in a reserve target - either through additional fundraising, reduced spending, or a line of credit. Even a modest cushion makes a big difference in how strong your model looks.",
        nextStep: "Open Step 2: School Details and raise opening cash, or trim Step 7: Expenses, until you have at least 45 days of operating cushion.",
        targetStep: 2,
      };
    },
  },
  {
    // Multi-year: ratios Y5 over Y1 for both revenue and expenses. In
    // single-year mode Y5 is engine-computed against phantom Y1-fallback
    // enrollment + escalation, so the ratio is meaningless.
    id: "expense_growth_exceeds_revenue",
    multiYear: true,
    check: (_data, m) => {
      if (m.revenueByYear[0] <= 0 || m.expensesByYear[0] <= 0) return null;
      if (m.revenueByYear[4] <= 0) return null;
      const revGrowth = m.revenueByYear[4] / m.revenueByYear[0];
      const expGrowth = m.expensesByYear[4] / m.expensesByYear[0];
      if (expGrowth <= revGrowth * 1.1) return null;
      return {
        severity: "warning",
        headline: "Here's something I'd watch - expenses are growing faster than revenue",
        explanation: "Over the 5-year projection, your costs are increasing faster than your income. That means your financial health deteriorates over time, even if Year 1 looks fine. This is worth addressing early.",
        action: "I'd check whether your expense escalation rates (COLA, rent increases, inflation) are outpacing your revenue growth assumptions. That's usually where the mismatch lives.",
        nextStep: "Open Step 3: Assumptions and lower your salary increase or general cost inflation rates so they line up with your revenue growth assumption.",
        targetStep: 2,
      };
    },
  },
  {
    id: "no_revenue_entered",
    check: (_data, m) => {
      if (m.y1Revenue > 0) return null;
      return {
        severity: "info",
        headline: "I notice you haven't entered any revenue yet - let's fix that",
        explanation: "Your model doesn't have any revenue sources yet. We can't run meaningful financial projections without knowing how your school will generate income.",
        action: "Go ahead and add your primary revenue sources - tuition, per-pupil funding, or grants. We'll start generating insights as soon as we have numbers to work with.",
        nextStep: "Open Step 5: Revenue and add at least one revenue line (tuition, per-pupil, or grants) so we can run the rest of the analysis.",
        targetStep: 4,
      };
    },
  },
  {
    // Multi-year: scans the minimum ending cash across Y1-Y3. Phantom in
    // single-year mode for the Y2/Y3 components.
    id: "surplus_but_tight_cash",
    multiYear: true,
    check: (_data, m) => {
      if (m.y1NetIncome <= 0 || m.y1Revenue <= 0) return null;
      const minCash = Math.min(...m.endingCashByYear.slice(0, 3));
      const monthlyExpenses = m.y1TotalExpenses / 12;
      if (monthlyExpenses <= 0 || minCash >= monthlyExpenses * 2) return null;
      return {
        severity: "info",
        headline: "I see a healthy surplus, but I'd note your cash reserves are thin",
        explanation: "Your annual budget shows a surplus - that's great. But ending cash stays tight relative to monthly expenses. Timing mismatches between when revenue arrives and bills are due are one of the most common cash flow problems we see with new schools.",
        action: "I'd review your revenue collection timing. Make sure tuition payments and grant disbursements align with your monthly expense obligations. That alignment is often the difference between a model that works on paper and one that works in practice.",
        nextStep: "Open Step 5: Revenue, set realistic collection delay days and collection rates on each line, and confirm tuition cadence matches when bills hit.",
        targetStep: 4,
      };
    },
  },
  {
    id: "near_breakeven_enrollment",
    check: (_data, m) => {
      if (m.enrollment[0] <= 0 || m.breakevenEnrollment === Infinity || m.breakevenEnrollment <= 0) return null;
      const margin = (m.enrollment[0] - m.breakevenEnrollment) / m.breakevenEnrollment;
      if (margin >= 0.10) return null;
      if (margin < 0) {
        return {
          severity: "critical",
          headline: `I see enrollment is below breakeven - you'll need ${m.breakevenEnrollment} students`,
          explanation: `Your projected Year 1 enrollment of ${m.enrollment[0]} is below the ${m.breakevenEnrollment} students needed to cover your costs. The school would operate at a loss from day one. The good news: most founders fix this by adjusting staffing or phasing costs.`,
          action: "I'd focus on three levers: increase enrollment targets, reduce fixed costs (staffing, facility), or add revenue sources to lower your breakeven point. Even small changes can move the needle significantly.",
          nextStep: `Open Step 4: Enrollment and grow Year 1 by ${Math.max(1, m.breakevenEnrollment - m.enrollment[0])} student${m.breakevenEnrollment - m.enrollment[0] === 1 ? "" : "s"}, or trim Step 6: Staffing / Step 7: Expenses to lower the breakeven number itself.`,
          targetStep: 3,
        };
      }
      return {
        severity: "warning",
        headline: `I'd note you're within 10% of breakeven - ${m.breakevenEnrollment} students needed`,
        explanation: `Your breakeven point is ${m.breakevenEnrollment} students and you're projecting ${m.enrollment[0]} in Year 1 - that's only ${Math.round(margin * 100)}% above breakeven. Any enrollment shortfall could push you into a deficit. That's a thin margin, and it's worth building more cushion.`,
        action: "We'd recommend looking at whether you can grow enrollment, add revenue sources, or reduce fixed costs to build more cushion above breakeven. A 15-20% buffer is much more comfortable.",
        nextStep: "Open Step 4: Enrollment and grow Year 1 by 5-10 students, or trim Step 6: Staffing or Step 7: Expenses to give yourself a 15-20% breakeven cushion.",
        targetStep: 3,
      };
    },
  },
  // Task #658 — required check: revenue per student is unusually high.
  // Anchored to a coarse $40K/student ceiling — well above K-12 norms
  // (charters typically run $10-18K/pupil, private microschools
  // $15-30K). Above $40K means either a niche premium tuition
  // assumption or a data-entry error worth flagging.
  {
    id: "revenue_per_student_high",
    check: (_data, m) => {
      const students = m.enrollment[0] || 0;
      if (students <= 0 || m.y1Revenue <= 0) return null;
      const rps = m.y1Revenue / students;
      if (rps < 40000) return null;
      return {
        severity: "warning",
        headline: `Revenue per student looks high at $${Math.round(rps).toLocaleString()}`,
        explanation: `Your model brings in $${Math.round(rps).toLocaleString()} per student in Year 1. Most schools land in the $10-30K range. A higher number can be right for a premium private model, but it's worth a sanity check before a reviewer sees it.`,
        action: "I'd double-check that tuition rates and per-pupil figures are entered as annual amounts (not multiplied by months) and that grant or in-kind dollars aren't being counted twice.",
        nextStep: "Open Step 5: Revenue and confirm each line is an annual figure (not monthly × 12) and that no grant is also double-counted in tuition.",
        targetStep: 4,
      };
    },
  },
  // Task #658 — required check: staffing may be too low. Mirror of the
  // existing "too high" check on the other side of the band. Below 35%
  // of revenue usually signals missing staffing rows or unrealistically
  // low FTEs.
  {
    id: "staffing_too_low",
    check: (_data, m) => {
      if (m.y1Revenue <= 0 || m.y1StaffingCost <= 0) return null;
      const pct = (m.y1StaffingCost / m.y1Revenue) * 100;
      if (pct >= 35) return null;
      return {
        severity: "warning",
        headline: `Staffing looks light at ${Math.round(pct)}% of revenue`,
        explanation: `Personnel costs are only ${Math.round(pct)}% of Year 1 revenue. Most schools spend 50-65% on staff. A number this low usually means a teacher or admin role is missing, or FTEs are entered as fractions when they should be whole positions.`,
        action: "I'd revisit your staffing roster and confirm every role you'll need on day one is listed, with realistic FTEs and salaries.",
        nextStep: "Open Step 6: Staffing and add any missing roles (lead teachers, head of school, ops/admin) or correct FTE entries so total payroll matches your actual hiring plan.",
        targetStep: 5,
      };
    },
  },
  // Task #658 — required check: founder compensation missing. Looks
  // for any leadership-style staffing row (head of school / director /
  // founder / principal). When none exists, lenders and boards will
  // assume the founder is working unpaid — which masks the real cost
  // of running the school.
  {
    id: "founder_compensation_missing",
    check: (data) => {
      const rows = data.staffingRows || [];
      const leadershipKeywords = ["founder", "head of school", "director", "principal", "executive", "head teacher"];
      const hasPaidLeader = rows.some((r) => {
        const enabled = (r as Record<string, unknown>).enabled !== false;
        if (!enabled) return false;
        const role = ((r.roleName || "") as string).toLowerCase();
        const cat = ((r.functionCategory || "") as string).toLowerCase();
        const matches = leadershipKeywords.some((k) => role.includes(k) || cat.includes(k));
        const fte = (r.fte || 0) as number;
        const rate = (r.annualizedRate || 0) as number;
        return matches && fte > 0 && rate > 0;
      });
      if (hasPaidLeader) return null;
      return {
        severity: "warning",
        headline: "I don't see a paid leadership role in your staffing plan",
        explanation: "Your staffing roster doesn't include a paid head of school, director, or founder line. Reviewers will assume you're working unpaid, which hides the real cost of running the school and breaks down once a board or lender normalizes to market rates.",
        action: "I'd add a leadership role at a market-rate salary even if you plan to take a personal discount. Showing the full cost first, then the discount, is the cleanest way to present this.",
        nextStep: "Open Step 6: Staffing, add a Head of School / Director / Founder row at a market-rate salary (typical range $70K-$120K), and note any voluntary discount separately.",
        targetStep: 5,
      };
    },
  },
  // Task #658 — required check: public funding timing. Schools that
  // depend on per-pupil public funding face a real cash gap because
  // the state typically pays in arrears. If public funding is more
  // than 30% of Year 1 revenue and opening cash is light, surface it.
  {
    id: "public_funding_timing",
    check: (data, m) => {
      if (m.y1Revenue <= 0) return null;
      // Task #658 — use the driver-expanded Y1 public-funding total from
      // computeMetrics. Reading `r.amounts[0]` directly under-counts
      // per-student or monthly driver types and would silently fail to
      // fire on the very models that face the worst cash-timing risk.
      const publicPct = m.publicY1Revenue / m.y1Revenue;
      if (publicPct < 0.30) return null;
      const startingCash = data.openingBalances?.cash ?? 0;
      const monthlyExp = m.y1TotalExpenses / 12;
      const monthsCash = monthlyExp > 0 ? startingCash / monthlyExp : 99;
      return {
        severity: monthsCash < 2 ? "critical" : "warning",
        headline: `${Math.round(publicPct * 100)}% of revenue depends on public funding timing`,
        explanation: `Public per-pupil dollars are reliable, but they typically arrive 30-90 days after enrollment is verified. With only ${monthsCash.toFixed(1)} months of opening cash, you may not be able to cover payroll while you wait for the first state check.`,
        action: "I'd look at adding bridge cash — a startup grant, a short-term line of credit, or pushing some early hires to a slightly later start date — so you can carry payroll through the first state disbursement.",
        nextStep: "Open Step 5: Revenue and set the collection delay days on each public funding line to a realistic value (60-90 days), then revisit Step 2: School Details to confirm opening cash covers at least the first 90 days.",
        targetStep: 4,
      };
    },
  },
];

export function runDiagnostics(data: FullModelData, maxResults = 3): DiagnosticFinding[] {
  const metrics = computeMetrics(data);
  const findings: DiagnosticFinding[] = [];
  const isSingleYear = isSingleYearModel(data);

  for (const rule of RULES) {
    if (isSingleYear && rule.multiYear) continue;
    if (!isSingleYear && rule.id === "negative_cash_y1") continue;
    const result = rule.check(data, metrics);
    if (result) findings.push({ id: rule.id, ...result });
  }

  const severityOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Task #686 — guardrail: every emitted DiagnosticFinding must carry a
  // concrete coach-voice nextStep.
  return assertEveryNextStep(findings.slice(0, maxResults), "DiagnosticFinding") as DiagnosticFinding[];
}

export interface WhatIfSuggestion {
  findingId: string;
  lever: string;
  impact: string;
}

export function computeWhatIfSuggestions(data: FullModelData): WhatIfSuggestion[] {
  const leverNudges = computeQuickLevers(data);
  const suggestions: WhatIfSuggestion[] = [];

  for (const lever of leverNudges) {
    for (const diagId of lever.relatedDiagnosticIds) {
      suggestions.push({
        findingId: diagId,
        lever: lever.label,
        impact: lever.coaching,
      });
    }
  }

  return suggestions;
}
