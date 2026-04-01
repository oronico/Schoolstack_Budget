import type { FullModelData } from "@/pages/model-wizard/schema";
import { computeAnnualDebt, DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE, DEFAULT_COLA_PCT } from "@workspace/finance";

export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  headline: string;
  explanation: string;
  action: string;
  targetStep: number;
}

interface DiagnosticRule {
  id: string;
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
  grantRevenue: number;
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
    escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number
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
      case "annual_fixed": return base;
      default: return base;
    }
  }

  const revenueByYear = [0, 0, 0, 0, 0];
  let grantRevenue = 0;

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
  for (let y = 0; y < 5; y++) {
    const students = enrollment[y] || y1Students;
    const ns = y === 0 ? students : Math.max(0, students - Math.min(students, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100))));
    const rs = y === 0 ? 0 : Math.min(students, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
    const staffY = y1StaffingCost * Math.pow(1 + cola / 100, y);
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
        opY += driverVal(e.amounts, y, e.driverType, students, e.escalationRate, costInflation, ns, rs);
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
    enrollment,
    revenueByYear,
    expensesByYear,
    grantRevenue,
    endingCashByYear,
    breakevenEnrollment,
    y1VariableCostPerStudent,
    y1FixedCosts,
  };
}

const RULES: DiagnosticRule[] = [
  {
    id: "negative_cash",
    check: (_data, m) => {
      const badYear = m.endingCashByYear.findIndex(c => c < 0);
      if (badYear === -1) return null;
      return {
        severity: "critical",
        headline: `Cash goes negative in Year ${badYear + 1}`,
        explanation: `Your projected ending cash drops below zero in Year ${badYear + 1}. This means the school wouldn't be able to cover its bills. Lenders and funders will see this as a major risk.`,
        action: "Review your revenue assumptions or reduce expenses so cash stays positive every year.",
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
        headline: `Staffing costs are ${Math.round(pct)}% of revenue`,
        explanation: `Personnel costs above ${THRESHOLDS.staffingPctCritical}% of revenue leave almost nothing for operations, facilities, and reserves. Most lenders flag anything over 65%.`,
        action: "Consider whether all positions are needed in Year 1, or if some roles can be phased in as enrollment grows.",
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
        headline: `Staffing costs are ${Math.round(pct)}% of revenue`,
        explanation: `Personnel costs between ${THRESHOLDS.staffingPctWarning}% and ${THRESHOLDS.staffingPctCritical}% are on the high side. Healthy schools typically stay between 50-60%.`,
        action: "Look at whether some roles can start part-time or be phased in after Year 1.",
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
        headline: `Facility costs are ${Math.round(pct)}% of revenue`,
        explanation: `Spending more than ${THRESHOLDS.rentPctWarning}% of revenue on your facility is a red flag. It crowds out staffing and program budgets.`,
        action: "Explore lower-cost space options, shared facilities, or phased facility upgrades.",
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
        headline: `${Math.round(pct)}% of revenue comes from grants`,
        explanation: `Relying on grants and philanthropy for more than ${THRESHOLDS.grantDependencyPct}% of revenue is risky. Grants are time-limited and competitive. Lenders prefer enrollment-driven revenue.`,
        action: "Focus on growing enrollment-driven revenue (tuition, per-pupil funding) so grants are supplemental, not foundational.",
        targetStep: 4,
      };
    },
  },
  {
    id: "fast_enrollment_growth",
    check: (_data, m) => {
      for (let y = 1; y < 5; y++) {
        const prev = m.enrollment[y - 1];
        if (prev <= 0) continue;
        const growth = ((m.enrollment[y] - prev) / prev) * 100;
        if (growth > THRESHOLDS.enrollmentGrowthPct) {
          return {
            severity: "warning",
            headline: `Enrollment jumps ${Math.round(growth)}% in Year ${y + 1}`,
            explanation: `Growing by more than ${THRESHOLDS.enrollmentGrowthPct}% in a single year is hard to achieve. Most new schools grow 15-25% per year. Lenders will ask how you plan to recruit this many students.`,
            action: "Make sure you have evidence to support this growth — waitlist data, marketing plans, or community partnerships.",
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
        headline: "No cash reserve cushion",
        explanation: "Your model shows less than one month of operating reserves. Any unexpected expense or delayed funding could force the school to close. Lenders require at least 45-60 days of reserves.",
        action: "Build in a reserve target — either through additional fundraising, reduced spending, or a line of credit.",
        targetStep: 2,
      };
    },
  },
  {
    id: "expense_growth_exceeds_revenue",
    check: (_data, m) => {
      if (m.revenueByYear[0] <= 0 || m.expensesByYear[0] <= 0) return null;
      if (m.revenueByYear[4] <= 0) return null;
      const revGrowth = m.revenueByYear[4] / m.revenueByYear[0];
      const expGrowth = m.expensesByYear[4] / m.expensesByYear[0];
      if (expGrowth <= revGrowth * 1.1) return null;
      return {
        severity: "warning",
        headline: "Expenses are growing faster than revenue",
        explanation: "Over the 5-year projection, your costs are increasing faster than your income. This means your financial health deteriorates over time, even if Year 1 looks fine.",
        action: "Check whether expense escalation rates (COLA, rent increases, inflation) are outpacing your revenue growth assumptions.",
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
        headline: "No revenue entered yet",
        explanation: "Your model doesn't have any revenue sources. The financial projections can't work without knowing how your school will generate income.",
        action: "Add your primary revenue sources — tuition, per-pupil funding, or grants.",
        targetStep: 4,
      };
    },
  },
  {
    id: "surplus_but_tight_cash",
    check: (_data, m) => {
      if (m.y1NetIncome <= 0 || m.y1Revenue <= 0) return null;
      const minCash = Math.min(...m.endingCashByYear.slice(0, 3));
      const monthlyExpenses = m.y1TotalExpenses / 12;
      if (monthlyExpenses <= 0 || minCash >= monthlyExpenses * 2) return null;
      return {
        severity: "info",
        headline: "Annual surplus looks good, but cash reserves are thin",
        explanation: "Your annual budget shows a surplus, but ending cash stays tight relative to monthly expenses. Timing mismatches between when revenue arrives and bills are due are one of the most common cash flow problems for new schools.",
        action: "Review your revenue collection timing. Make sure tuition payments and grant disbursements align with your monthly expense obligations.",
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
          headline: `Enrollment is below breakeven (need ${m.breakevenEnrollment} students)`,
          explanation: `Your projected Year 1 enrollment of ${m.enrollment[0]} is below the ${m.breakevenEnrollment} students needed to cover your costs. The school would operate at a loss from day one. Lenders will not fund a model that starts below breakeven.`,
          action: "Increase enrollment targets, reduce fixed costs (staffing, facility), or add revenue sources to lower your breakeven point.",
          targetStep: 3,
        };
      }
      return {
        severity: "warning",
        headline: `Enrollment is within 10% of breakeven (${m.breakevenEnrollment} students)`,
        explanation: `Your breakeven point is ${m.breakevenEnrollment} students and you're projecting ${m.enrollment[0]} in Year 1 — that's only ${Math.round(margin * 100)}% above breakeven. Any enrollment shortfall could push you into a deficit. Lenders see this as a thin margin.`,
        action: "Consider whether you can grow enrollment, add revenue sources, or reduce fixed costs to build more cushion above breakeven.",
        targetStep: 3,
      };
    },
  },
];

export function runDiagnostics(data: FullModelData, maxResults = 3): DiagnosticFinding[] {
  const metrics = computeMetrics(data);
  const findings: DiagnosticFinding[] = [];

  for (const rule of RULES) {
    const result = rule.check(data, metrics);
    if (result) findings.push({ id: rule.id, ...result });
  }

  const severityOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings.slice(0, maxResults);
}
