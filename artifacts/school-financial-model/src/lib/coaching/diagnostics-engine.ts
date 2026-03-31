import type { FullModelData } from "@/pages/model-wizard/schema";

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
  check: (data: FullModelData, computed: ComputedMetrics) => DiagnosticFinding | null;
}

interface ComputedMetrics {
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
}

const THRESHOLDS = {
  staffingPctCritical: 75,
  staffingPctWarning: 65,
  rentPctWarning: 25,
  grantDependencyPct: 40,
  enrollmentGrowthPct: 50,
  minReserveMonths: 1,
};

function computeMetrics(data: FullModelData): ComputedMetrics {
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
  const defaultBenefitsRate = 25;
  const defaultPayrollTaxRate = 8;
  const cola = (data.schoolProfile as Record<string, unknown>)?.annualSalaryIncrease as number ?? 3;

  function driverVal(amounts: number[] | undefined, y: number, driverType: string, students: number): number {
    const raw = amounts?.[y] ?? amounts?.[0] ?? 0;
    switch (driverType) {
      case "monthly": return raw * 12;
      case "per_student": return raw * students;
      default: return raw;
    }
  }

  const revenueByYear = [0, 0, 0, 0, 0];
  let grantRevenue = 0;
  const rowValues = new Map<string, number>();
  for (const r of revenueRows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_base") continue;
    for (let y = 0; y < 5; y++) {
      revenueByYear[y] += driverVal(r.amounts, y, r.driverType, enrollment[y] || y1Students);
    }
    rowValues.set(r.id, driverVal(r.amounts, 0, r.driverType, y1Students));
    if (r.category === "grants_contributions" || r.category === "philanthropy") {
      grantRevenue += driverVal(r.amounts, 0, r.driverType, y1Students);
    }
  }
  for (const r of revenueRows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(r.percentBase || "") || 0;
    const pct = (r.amounts?.[0] ?? 0) / 100;
    const val = baseVal * pct;
    for (let y = 0; y < 5; y++) {
      revenueByYear[y] += val;
    }
    if (r.category === "tuition_offsets") {
      revenueByYear.forEach((_, i) => { revenueByYear[i] -= Math.abs(val) * 2; });
    }
  }

  let y1StaffingCost = 0;
  for (const s of staffingRows) {
    const base = (s.fte || 0) * (s.annualizedRate || 0);
    const isContractNotPayrollLike = s.employmentType === "contract" && !s.payrollLike;
    let rowCost = base;
    if (!isContractNotPayrollLike) {
      if (s.benefitsEligible) rowCost += base * ((s.benefitsRate ?? defaultBenefitsRate) / 100);
      rowCost += base * ((s.payrollTaxRate ?? defaultPayrollTaxRate) / 100);
    }
    y1StaffingCost += rowCost;
  }

  let y1OpExpenses = 0;
  let y1FacilityCost = 0;
  for (const e of expenseRows) {
    if (!e.enabled) continue;
    const val = driverVal(e.amounts, 0, e.driverType, y1Students);
    y1OpExpenses += val;
    if (e.category === "occupancy_facility") {
      y1FacilityCost += val;
    }
  }

  let y1CapDebt = 0;
  for (const c of capDebtRows) {
    if (!c.enabled) continue;
    if (c.isLoan && c.loanPrincipal && c.loanRate && c.loanTermYears) {
      const r = (c.loanRate / 100) / 12;
      const n = c.loanTermYears * 12;
      if (r > 0 && n > 0) {
        y1CapDebt += (c.loanPrincipal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) * 12;
      }
    } else {
      y1CapDebt += driverVal(c.amounts, 0, c.driverType, y1Students);
    }
  }

  const expensesByYear = [0, 0, 0, 0, 0];
  for (let y = 0; y < 5; y++) {
    let staffY = y1StaffingCost * Math.pow(1 + cola / 100, y);
    let opY = 0;
    for (const e of expenseRows) {
      if (!e.enabled) continue;
      opY += driverVal(e.amounts, y, e.driverType, enrollment[y] || y1Students);
    }
    expensesByYear[y] = staffY + opY + y1CapDebt;
  }

  const y1Revenue = revenueByYear[0];
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
  };
}

const RULES: DiagnosticRule[] = [
  {
    id: "negative_cash",
    check: (_data, m) => {
      const badYear = m.endingCashByYear.findIndex(c => c < 0);
      if (badYear === -1) return null;
      return {
        id: "negative_cash",
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
        id: "high_staffing_critical",
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
        id: "high_staffing_warning",
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
        id: "high_occupancy",
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
        id: "grant_dependency",
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
            id: "fast_enrollment_growth",
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
        id: "no_reserves",
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
        id: "expense_growth_exceeds_revenue",
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
        id: "no_revenue_entered",
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
        id: "surplus_but_tight_cash",
        severity: "info",
        headline: "Annual surplus looks good, but cash reserves are thin",
        explanation: "Your annual budget shows a surplus, but ending cash stays tight relative to monthly expenses. Timing mismatches between when revenue arrives and bills are due are one of the most common cash flow problems for new schools.",
        action: "Review your revenue collection timing. Make sure tuition payments and grant disbursements align with your monthly expense obligations.",
        targetStep: 4,
      };
    },
  },
];

export function runDiagnostics(data: FullModelData, maxResults: number = 3): DiagnosticFinding[] {
  const metrics = computeMetrics(data);
  const findings: DiagnosticFinding[] = [];

  for (const rule of RULES) {
    const result = rule.check(data, metrics);
    if (result) findings.push(result);
  }

  const severityOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings.slice(0, maxResults);
}

export function runAllDiagnostics(data: FullModelData): DiagnosticFinding[] {
  return runDiagnostics(data, 999);
}
