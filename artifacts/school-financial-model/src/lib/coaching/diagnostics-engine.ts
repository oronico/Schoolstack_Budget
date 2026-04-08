import type { FullModelData } from "@/pages/model-wizard/schema";
import { computeAnnualDebt, DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE, DEFAULT_COLA_PCT } from "@workspace/finance";
import { computeQuickLevers } from "@/lib/scenario-engine";

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
        headline: `I'm seeing cash go negative in Year ${badYear + 1}`,
        explanation: `Your projected ending cash drops below zero in Year ${badYear + 1}. That means the school wouldn't be able to cover its bills. We see this a lot in early drafts, so don't worry - it's fixable.`,
        action: "I'd start by reviewing your revenue assumptions or trimming expenses so cash stays positive every year. Even small timing adjustments can make a big difference.",
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
            headline: `I'd question this - enrollment jumps ${Math.round(growth)}% in Year ${y + 1}`,
            explanation: `Growing by more than ${THRESHOLDS.enrollmentGrowthPct}% in a single year is hard to achieve. Most new schools grow 15-25% per year. Anyone reviewing your model will want to understand how you plan to recruit this many students.`,
            action: "I'd make sure you have evidence to support this growth - waitlist data, marketing plans, or community partnerships. If you can't back it up, consider moderating the projection.",
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
        headline: "Here's something I'd watch - expenses are growing faster than revenue",
        explanation: "Over the 5-year projection, your costs are increasing faster than your income. That means your financial health deteriorates over time, even if Year 1 looks fine. This is worth addressing early.",
        action: "I'd check whether your expense escalation rates (COLA, rent increases, inflation) are outpacing your revenue growth assumptions. That's usually where the mismatch lives.",
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
        headline: "I see a healthy surplus, but I'd note your cash reserves are thin",
        explanation: "Your annual budget shows a surplus - that's great. But ending cash stays tight relative to monthly expenses. Timing mismatches between when revenue arrives and bills are due are one of the most common cash flow problems we see with new schools.",
        action: "I'd review your revenue collection timing. Make sure tuition payments and grant disbursements align with your monthly expense obligations. That alignment is often the difference between a model that works on paper and one that works in practice.",
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
          targetStep: 3,
        };
      }
      return {
        severity: "warning",
        headline: `I'd note you're within 10% of breakeven - ${m.breakevenEnrollment} students needed`,
        explanation: `Your breakeven point is ${m.breakevenEnrollment} students and you're projecting ${m.enrollment[0]} in Year 1 - that's only ${Math.round(margin * 100)}% above breakeven. Any enrollment shortfall could push you into a deficit. That's a thin margin, and it's worth building more cushion.`,
        action: "We'd recommend looking at whether you can grow enrollment, add revenue sources, or reduce fixed costs to build more cushion above breakeven. A 15-20% buffer is much more comfortable.",
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
