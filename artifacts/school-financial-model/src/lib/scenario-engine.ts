import type { FullModelData } from "@/pages/model-wizard/schema";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "./benchmark-thresholds";

export interface ScenarioAdjustments {
  name: string;
  enrollmentAdjustment: number;
  tuitionAdjustment: number;
  expenseAdjustment: number;
  staffingAdjustment: number;
  facilityAdjustment: number;
}

export interface ScenarioMetrics {
  enrollment: number[];
  revenue: number[];
  staffingCost: number[];
  facilityCost: number[];
  opex: number[];
  totalExpenses: number[];
  netIncome: number[];
  netMargin: number[];
  dscr: number[];
  staffingPctOfRevenue: number[];
  breakEvenYear: number | null;
  cashRunwayMonths: number;
  reserveMonths: number;
  /**
   * Year-end cash position for each of the 5 modeled years, in dollars.
   * Computed as openingBalances.cash + cumulative net income through year Y.
   * Lets founders see the per-year trough — the year cash is tightest — which
   * is critical for spotting the "runway crunch year" lenders zero in on.
   */
  cashPosition: number[];
  loanDebtService?: number[];
}

export interface NudgeItem {
  signal: "green" | "amber" | "red";
  label: string;
  message: string;
}

export interface ScenarioResult {
  name: string;
  adjustments: ScenarioAdjustments;
  metrics: ScenarioMetrics;
  nudges: NudgeItem[];
}

function seNewStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

function seReturningStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

function driverVal(
  amounts: number[] | undefined,
  y: number,
  driverType: string,
  students: number,
  escalationRate?: number,
  fallbackEsc?: number,
  newStudents?: number,
  returningStudents?: number,
  escalationRateOverridden?: boolean,
): number {
  const raw = amounts?.[y] ?? 0;
  const esc = escalationRateOverridden ? (escalationRate ?? 0) : ((escalationRate !== undefined && escalationRate !== 0) ? escalationRate : (fallbackEsc ?? 0));
  let base: number;
  if (esc !== 0 && y > 0) {
    base = (amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
  } else {
    base = raw;
  }
  switch (driverType) {
    case "monthly":
      return base * 12;
    case "per_student":
      return base * students;
    case "per_new_student":
      return base * (newStudents ?? students);
    case "per_returning_student":
      return base * (returningStudents ?? 0);
    default:
      return base;
  }
}

function computeTotalFTE(staffingRows: Array<{ fte?: number; startYear?: number; endYear?: number; staffingMode?: string; studentRatio?: number; minFte?: number; maxFte?: number }>, year: number, students: number): number {
  let total = 0;
  for (const r of staffingRows) {
    let fte = r.fte || 0;
    if (r.startYear && (year + 1) < r.startYear) fte = 0;
    else if (r.endYear && (year + 1) > r.endYear) fte = 0;
    else if (r.staffingMode === "ratio" && r.studentRatio && r.studentRatio > 0) {
      let computed = students / r.studentRatio;
      if (r.minFte !== undefined) computed = Math.max(computed, r.minFte);
      if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte);
      fte = Math.ceil(computed * 2) / 2;
    }
    total += fte;
  }
  return total;
}

export function computeBaseFinancials(data: FullModelData): ScenarioMetrics {
  const sp = data.schoolProfile;
  const en = (data.enrollment || {}) as Record<string, unknown>;
  const enrollment = [(en.year1 as number) || 0, (en.year2 as number) || 0, (en.year3 as number) || 0, (en.year4 as number) || 0, (en.year5 as number) || 0];
  const seRR = (en.retentionRate as number) ?? 85;
  const prorationFactor = sp?.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
  const costInflation = data.facilities?.generalCostInflation || 0;

  const revenueRows = (data.revenueRows || []).filter((r) => r.enabled);
  const staffingRows = data.staffingRows || [];
  const expenseRows = (data.expenseRows || []).filter((r) => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter((r) => r.enabled);
  const tiers = data.tuitionTiers || [];

  const revenue: number[] = [];
  const staffingCost: number[] = [];
  const facilityCost: number[] = [];
  const opex: number[] = [];
  const totalExpenses: number[] = [];
  const netIncome: number[] = [];
  const netMargin: number[] = [];
  const dscr: number[] = [];
  const staffingPctOfRevenue: number[] = [];
  const loanDS: number[] = [];

  for (let y = 0; y < 5; y++) {
    const students = enrollment[y];
    const pf = y === 0 ? prorationFactor : 1;

    let revTotal = 0;
    const revVals = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.driverType === "percent_of_base") continue;
      let val: number;
      if (r.driverType === "per_student" && r.category === "tuition_and_fees" && tiers.length > 0) {
        const baseTuition = r.amounts?.[0] ?? 0;
        const escRate = (data.tuitionEscalation?.rate ?? r.escalationRate ?? 0) / 100;
        const adjTuition = baseTuition * Math.pow(1 + escRate, y);

        let rawTierTotal = 0;
        for (const t of tiers) {
          rawTierTotal += t.studentCounts?.[y] ?? 0;
        }
        const scaleFactor = rawTierTotal > students ? students / rawTierTotal : 1;

        let tierRev = 0;
        let allocatedStudents = 0;
        for (const t of tiers) {
          const disc = 1 - (t.discountPercent || 0) / 100;
          const rawCount = t.studentCounts?.[y] ?? 0;
          const scaledCount = rawCount * scaleFactor;
          allocatedStudents += scaledCount;
          tierRev += adjTuition * disc * scaledCount;
        }

        const remaining = students - allocatedStudents;
        if (remaining > 0) {
          tierRev += adjTuition * remaining;
        }
        val = tierRev;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate);
      }
      val *= pf;
      revVals.set(r.id, val);
    }
    for (const r of revenueRows) {
      if (r.driverType !== "percent_of_base") continue;
      const baseVal = revVals.get(r.percentBase || "") || 0;
      let pctVal = r.amounts?.[y] ?? 0;
      if (r.escalationRate && r.escalationRate !== 0 && y > 0) {
        pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      revVals.set(r.id, baseVal * (pctVal / 100));
    }
    for (const r of revenueRows) {
      const v = revVals.get(r.id) || 0;
      if (r.category === "tuition_offsets") revTotal -= Math.abs(v);
      else revTotal += v;
    }

    let persTotal = 0;
    for (const r of staffingRows) {
      let effectiveFte = r.fte || 0;
      if (r.startYear && (y + 1) < r.startYear) { effectiveFte = 0; }
      else if (r.endYear && (y + 1) > r.endYear) { effectiveFte = 0; }
      else if ((r as Record<string, unknown>).staffingMode === "ratio" && (r as Record<string, unknown>).studentRatio) {
        const ratio = (r as Record<string, unknown>).studentRatio as number;
        if (ratio > 0) {
          let computed = students / ratio;
          const minFte = (r as Record<string, unknown>).minFte as number | undefined;
          const maxFte = (r as Record<string, unknown>).maxFte as number | undefined;
          if (minFte !== undefined) computed = Math.max(computed, minFte);
          if (maxFte !== undefined) computed = Math.min(computed, maxFte);
          effectiveFte = Math.ceil(computed * 2) / 2;
        }
      }
      const annual = effectiveFte * (r.annualizedRate || 0);
      const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
      let benefits = 0, tax = 0;
      if (!isContractNoPL) {
        if (r.benefitsEligible) benefits = annual * ((r.benefitsRate || 0) / 100);
        tax = annual * ((r.payrollTaxRate || 0) / 100);
      }
      persTotal += annual + benefits + tax;
    }
    const persEsc = Math.pow(1 + salaryEscRate, y);
    persTotal = persTotal * persEsc * pf;

    const yearFTE = computeTotalFTE(staffingRows, y, students);

    let facTotal = 0;
    let opexTotal = 0;
    for (const r of expenseRows) {
      let val: number;
      if (r.driverType === "percent_of_revenue") {
        const esc = r.escalationRateOverridden ? (r.escalationRate ?? 0) : ((r.escalationRate !== undefined && r.escalationRate !== 0) ? r.escalationRate : (costInflation ?? 0));
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = r.amounts?.[y] ?? 0;
        }
        val = (pct / 100) * revTotal;
      } else if (r.driverType === "per_fte") {
        val = driverVal(r.amounts, y, "annual_fixed", students, r.escalationRate, costInflation, undefined, undefined, r.escalationRateOverridden);
        val = val * yearFTE * pf;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation, seNewStudents(enrollment, seRR, y), seReturningStudents(enrollment, seRR, y), r.escalationRateOverridden);
        val *= pf;
      }
      if (r.category === "occupancy_facility") {
        facTotal += val;
      } else {
        opexTotal += val;
      }
    }

    let cdTotal = 0;
    let loanDebtService = 0;
    for (const r of capDebtRows) {
      if (r.isLoan) {
        const principal = r.loanPrincipal || 0;
        const rate = (r.loanRate || 0) / 100;
        const term = r.loanTermYears || 0;
        if (principal > 0 && term > 0 && y < term) {
          let annualPmt: number;
          if (rate <= 0) {
            annualPmt = principal / term;
          } else {
            const monthlyRate = rate / 12;
            const numPayments = term * 12;
            const monthlyPmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
            annualPmt = monthlyPmt * 12;
          }
          cdTotal += annualPmt;
          loanDebtService += annualPmt;
        }
      } else {
        cdTotal += driverVal(r.amounts, y, r.driverType, students);
      }
    }

    const totalExp = persTotal + facTotal + opexTotal + cdTotal;
    const ni = revTotal - totalExp;

    revenue.push(revTotal);
    staffingCost.push(persTotal);
    facilityCost.push(facTotal);
    opex.push(opexTotal);
    totalExpenses.push(totalExp);
    netIncome.push(ni);
    netMargin.push(revTotal > 0 ? ni / revTotal : 0);

    loanDS.push(loanDebtService);
    if (loanDebtService > 0) {
      dscr.push(Math.round(((ni + loanDebtService) / loanDebtService) * 100) / 100);
    } else {
      dscr.push(0);
    }

    staffingPctOfRevenue.push(revTotal > 0 ? persTotal / revTotal : 0);
  }

  const breakEvenIdx = netIncome.findIndex((ni) => ni >= 0);

  let cumNI = 0;
  for (const ni of netIncome) cumNI += ni;
  const monthlyExp = totalExpenses[4] / 12;
  const reserveMonths = monthlyExp > 0 && cumNI > 0 ? cumNI / monthlyExp : 0;

  let cashRunwayMonths = 60;
  const startingCash = data.openingBalances?.cash || 0;
  let runningCash = startingCash;
  for (let y = 0; y < 5; y++) {
    const monthlyNI = netIncome[y] / 12;
    for (let m = 0; m < 12; m++) {
      runningCash += monthlyNI;
      if (runningCash <= 0) {
        cashRunwayMonths = y * 12 + m + 1;
        break;
      }
    }
    if (runningCash <= 0) break;
  }

  const cashPosition: number[] = [];
  let cumCash = startingCash;
  for (let y = 0; y < 5; y++) {
    cumCash += netIncome[y];
    cashPosition.push(cumCash);
  }

  return {
    enrollment,
    revenue,
    staffingCost,
    facilityCost,
    opex,
    totalExpenses,
    netIncome,
    netMargin,
    dscr,
    staffingPctOfRevenue,
    breakEvenYear: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
    cashRunwayMonths: Math.round(cashRunwayMonths * 10) / 10,
    reserveMonths: Math.round(reserveMonths * 10) / 10,
    cashPosition,
    loanDebtService: loanDS,
  };
}

function applyAdjustments(
  base: ScenarioMetrics,
  adj: ScenarioAdjustments,
  startingCash: number
): ScenarioMetrics {
  const enrollFactor = 1 + adj.enrollmentAdjustment / 100;
  const revFactor = 1 + adj.tuitionAdjustment / 100;
  const staffFactor = 1 + adj.staffingAdjustment / 100;
  const facFactor = 1 + adj.facilityAdjustment / 100;
  const expFactor = 1 + adj.expenseAdjustment / 100;

  const enrollment = base.enrollment.map((e) => Math.round(e * enrollFactor));
  const revenue = base.revenue.map((r) => r * revFactor);
  const staffingCost = base.staffingCost.map((s) => s * staffFactor);
  const facilityCost = base.facilityCost.map((f) => f * facFactor);
  const opex = base.opex.map((o) => o * expFactor);
  const baseLoanDS = base.loanDebtService || base.enrollment.map(() => 0);
  const capNonLoan = base.totalExpenses.map((te, i) => te - base.staffingCost[i] - base.facilityCost[i] - base.opex[i] - baseLoanDS[i]);
  const totalExpenses = staffingCost.map((s, i) => s + facilityCost[i] + opex[i] + baseLoanDS[i] + capNonLoan[i]);
  const netIncome = revenue.map((r, i) => r - totalExpenses[i]);
  const netMargin = revenue.map((r, i) => (r > 0 ? netIncome[i] / r : 0));

  const dscr = baseLoanDS.map((ds, i) => {
    if (ds > 0) {
      return Math.round(((netIncome[i] + ds) / ds) * 100) / 100;
    }
    return 0;
  });

  const staffingPctOfRevenue = revenue.map((r, i) => (r > 0 ? staffingCost[i] / r : 0));
  const breakEvenIdx = netIncome.findIndex((ni) => ni >= 0);

  let cumNI = 0;
  for (const ni of netIncome) cumNI += ni;
  const monthlyExp = totalExpenses[4] / 12;
  const reserveMonths = monthlyExp > 0 && cumNI > 0 ? cumNI / monthlyExp : 0;

  let cashRunwayMonths = 60;
  let runningCash = startingCash;
  for (let y = 0; y < 5; y++) {
    const monthlyNI = netIncome[y] / 12;
    for (let m = 0; m < 12; m++) {
      runningCash += monthlyNI;
      if (runningCash <= 0) {
        cashRunwayMonths = y * 12 + m + 1;
        break;
      }
    }
    if (runningCash <= 0) break;
  }

  const cashPosition: number[] = [];
  let cumCash = startingCash;
  for (let y = 0; y < 5; y++) {
    cumCash += netIncome[y];
    cashPosition.push(cumCash);
  }

  return {
    enrollment,
    revenue,
    staffingCost,
    facilityCost,
    opex,
    totalExpenses,
    netIncome,
    netMargin,
    dscr,
    staffingPctOfRevenue,
    breakEvenYear: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
    cashRunwayMonths: Math.round(cashRunwayMonths * 10) / 10,
    reserveMonths: Math.round(reserveMonths * 10) / 10,
    cashPosition,
    loanDebtService: baseLoanDS,
  };
}

export interface LeverMetrics {
  netIncome: number;
  cashTrough: number;
  breakEvenEnrollment: number;
  dscr: number;
}

export interface QuickLever {
  id: string;
  label: string;
  description: string;
  icon: "users" | "dollar" | "scissors";
  before: LeverMetrics;
  after: LeverMetrics;
  coaching: string;
  relatedDiagnosticIds: string[];
}

function cashTrough(metrics: ScenarioMetrics, startingCash: number): number {
  let running = startingCash;
  let min = startingCash;
  for (let y = 0; y < 5; y++) {
    const monthlyNI = metrics.netIncome[y] / 12;
    for (let m = 0; m < 12; m++) {
      running += monthlyNI;
      if (running < min) min = running;
    }
  }
  return min;
}

function computeBreakEvenEnrollment(m: ScenarioMetrics): number {
  const y1Students = m.enrollment[0] || 0;
  if (y1Students <= 0) return -1;
  const revenuePerStudent = m.revenue[0] / y1Students;
  const fixedCosts = m.staffingCost[0] + (m.facilityCost?.[0] ?? 0) + (m.loanDebtService?.[0] ?? 0);
  const variableOpex = m.opex[0] ?? 0;
  const variableCostPerStudent = y1Students > 0 ? variableOpex / y1Students : 0;
  const contributionMargin = revenuePerStudent - variableCostPerStudent;
  if (contributionMargin <= 0) return -1;
  return Math.ceil(fixedCosts / contributionMargin);
}

function metricsToLever(m: ScenarioMetrics, startingCash: number): LeverMetrics {
  return {
    netIncome: m.netIncome[0],
    cashTrough: cashTrough(m, startingCash),
    breakEvenEnrollment: computeBreakEvenEnrollment(m),
    dscr: m.dscr[0],
  };
}

function computeLeverNudges(data: FullModelData, baseMetrics: ScenarioMetrics): QuickLever[] {
  const startingCash = data.openingBalances?.cash || 0;
  const staffingRows = data.staffingRows || [];
  const levers: QuickLever[] = [];

  const baseLM = metricsToLever(baseMetrics, startingCash);
  const baseEnrollment = baseMetrics.enrollment[0] ?? 0;

  if (baseEnrollment > 0) {
    const upData = cloneDataWithEnrollmentAdjustment(data, 10);
    const upM = computeBaseFinancials(upData);
    const upLM = metricsToLever(upM, startingCash);
    levers.push({
      id: "enrollment_up_10",
      label: "Add 10% More Students",
      description: `Increase enrollment from ${baseEnrollment} to ${Math.round(baseEnrollment * 1.1)} students`,
      icon: "users",
      before: baseLM,
      after: upLM,
      coaching: upLM.netIncome > baseLM.netIncome
        ? `Adding ${Math.round(baseEnrollment * 0.1)} students could improve Year 1 net income by ${fmtCurrency(upLM.netIncome - baseLM.netIncome)}. Make sure your facility and staffing can absorb the growth.`
        : `Even with 10% more students, net income doesn't improve - check whether your per-student costs exceed per-student revenue.`,
      relatedDiagnosticIds: ["near_breakeven_enrollment", "fast_enrollment_growth"],
    });

    const downData = cloneDataWithEnrollmentAdjustment(data, -10);
    const downM = computeBaseFinancials(downData);
    const downLM = metricsToLever(downM, startingCash);
    levers.push({
      id: "enrollment_down_10",
      label: "Lose 10% of Students",
      description: `Enrollment drops from ${baseEnrollment} to ${Math.round(baseEnrollment * 0.9)} students`,
      icon: "users",
      before: baseLM,
      after: downLM,
      coaching: downLM.netIncome < baseLM.netIncome
        ? `Losing ${Math.round(baseEnrollment * 0.1)} students would reduce Year 1 net income by ${fmtCurrencyAbs(baseLM.netIncome - downLM.netIncome)}. ${downLM.breakEvenEnrollment > 0 && Math.round(baseEnrollment * 0.9) <= downLM.breakEvenEnrollment ? `At ${Math.round(baseEnrollment * 0.9)} students you'd be at or below your break-even enrollment of ${downLM.breakEvenEnrollment}.` : "Build a contingency plan for lower-than-projected enrollment."}`
        : `A 10% enrollment drop has minimal financial impact - your cost structure is not enrollment-driven.`,
      relatedDiagnosticIds: ["near_breakeven_enrollment"],
    });
  }

  if (staffingRows.length > 0) {
    const highestCostRow = [...staffingRows].sort((a, b) => {
      const costA = (a.fte || 0) * (a.annualizedRate || 0);
      const costB = (b.fte || 0) * (b.annualizedRate || 0);
      return costB - costA;
    })[0];
    if (highestCostRow && highestCostRow.fte > 0) {
      const oneFteCost = highestCostRow.annualizedRate || 0;
      const fteToRemove = Math.min(1, highestCostRow.fte);
      const savingsBase = fteToRemove * oneFteCost;
      const totalStaffCost = staffingRows.reduce((s, r) => s + (r.fte || 0) * (r.annualizedRate || 0), 0);
      const pctReduction = totalStaffCost > 0 ? -(savingsBase / totalStaffCost) * 100 : 0;
      const adj: ScenarioAdjustments = { name: "-1 FTE", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: Math.round(pctReduction * 10) / 10, facilityAdjustment: 0 };
      const m = applyAdjustments(baseMetrics, adj, startingCash);
      const afterLM = metricsToLever(m, startingCash);
      levers.push({
        id: "staff_minus_1",
        label: "Remove 1 FTE",
        description: `Defer 1 FTE of the highest-cost role (~${fmtCurrencyAbs(savingsBase)}/year)`,
        icon: "scissors",
        before: baseLM,
        after: afterLM,
        coaching: `Deferring 1 FTE saves ~${fmtCurrencyAbs(savingsBase)}/year. ${afterLM.netIncome >= 0 && baseLM.netIncome < 0 ? "This alone could move you from a deficit to a surplus." : `Year 1 net income shifts by ${fmtCurrency(afterLM.netIncome - baseLM.netIncome)}.`}${afterLM.dscr > baseLM.dscr && baseLM.dscr > 0 ? ` DSCR improves from ${baseLM.dscr.toFixed(2)}x to ${afterLM.dscr.toFixed(2)}x.` : ""}${afterLM.breakEvenEnrollment > 0 && baseLM.breakEvenEnrollment > 0 && afterLM.breakEvenEnrollment < baseLM.breakEvenEnrollment ? ` Break-even enrollment drops from ${baseLM.breakEvenEnrollment} to ${afterLM.breakEvenEnrollment} students.` : ""} Consider whether you can phase in this hire later.`,
        relatedDiagnosticIds: ["high_staffing_critical", "high_staffing_warning"],
      });
    }
  }

  if (baseMetrics.revenue[0] > 0) {
    const adj: ScenarioAdjustments = { name: "+5% Tuition", enrollmentAdjustment: 0, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 };
    const m = applyAdjustments(baseMetrics, adj, startingCash);
    const afterLM = metricsToLever(m, startingCash);
    levers.push({
      id: "tuition_up_5",
      label: "Raise Revenue 5%",
      description: `Increase tuition or per-pupil funding by 5%`,
      icon: "dollar",
      before: baseLM,
      after: afterLM,
      coaching: `A 5% revenue increase adds ~${fmtCurrency(m.revenue[0] - baseMetrics.revenue[0])}/year. ${afterLM.cashTrough > baseLM.cashTrough ? `Cash trough improves from ${fmtCurrencyAbs(baseLM.cashTrough)} to ${fmtCurrencyAbs(afterLM.cashTrough)}.` : "Cash trough stays about the same."} Check that tuition stays competitive in your market.`,
      relatedDiagnosticIds: ["negative_cash", "surplus_but_tight_cash", "no_reserves"],
    });
  }

  return levers;
}

function cloneDataWithEnrollmentAdjustment(data: FullModelData, pctIncrease: number): FullModelData {
  const factor = 1 + pctIncrease / 100;
  const enrollment = data.enrollment ? { ...data.enrollment } : {} as Record<string, unknown>;
  for (const key of ["year1", "year2", "year3", "year4", "year5"]) {
    if (typeof (enrollment as Record<string, unknown>)[key] === "number") {
      (enrollment as Record<string, unknown>)[key] = Math.round(((enrollment as Record<string, unknown>)[key] as number) * factor);
    }
  }
  return { ...data, enrollment: enrollment as FullModelData["enrollment"] };
}

function generateNudges(metrics: ScenarioMetrics, name: string, leverNudges?: QuickLever[]): NudgeItem[] {
  const nudges: NudgeItem[] = [];
  const y1 = metrics.netIncome[0];
  const y5 = metrics.netIncome[4];

  if (metrics.breakEvenYear !== null) {
    if (metrics.breakEvenYear <= 2) {
      nudges.push({ signal: "green", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}.` });
    } else if (metrics.breakEvenYear <= 4) {
      nudges.push({ signal: "amber", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}. Earlier is better for long-term stability.` });
    } else {
      nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't break even until Year ${metrics.breakEvenYear}. Consider reducing costs or increasing revenue.` });
    }
  } else {
    nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't reach break-even in 5 years. This scenario needs significant adjustments.` });
  }

  const avgStaffPct = metrics.staffingPctOfRevenue.reduce((a, b) => a + b, 0) / 5;
  if (avgStaffPct > 0.7) {
    const staffLever = leverNudges?.find(l => l.id === "staff_minus_1");
    const leverHint = staffLever ? ` ${staffLever.coaching}` : "";
    nudges.push({ signal: "red", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue - above 70% leaves very little room for other costs.${leverHint}` });
  } else if (avgStaffPct > 0.6) {
    const staffLever = leverNudges?.find(l => l.id === "staff_minus_1");
    const leverHint = staffLever ? ` ${staffLever.coaching}` : "";
    nudges.push({ signal: "amber", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue. That's within range but worth watching.${leverHint}` });
  } else if (avgStaffPct > 0) {
    nudges.push({ signal: "green", label: "Staffing", message: `Staffing costs are ${Math.round(avgStaffPct * 100)}% of revenue. Well managed.` });
  }

  const hasDscr = metrics.dscr.some((d) => d > 0);
  if (hasDscr) {
    const y1Dscr = metrics.dscr[0];
    if (y1Dscr >= BENCHMARK_DSCR_GREEN) {
      nudges.push({ signal: "green", label: "DSCR", message: `Debt service coverage of ${y1Dscr.toFixed(2)}x exceeds the ${BENCHMARK_DSCR_GREEN}x benchmark - strong position.` });
    } else if (y1Dscr >= BENCHMARK_DSCR_AMBER) {
      nudges.push({ signal: "amber", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is tight. A target of at least ${BENCHMARK_DSCR_GREEN}x gives more breathing room.` });
    } else {
      nudges.push({ signal: "red", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is below ${BENCHMARK_DSCR_AMBER}x. Debt coverage is critically thin.` });
    }
  }

  if (y5 > 0 && y1 < 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Starts negative in Year 1 but reaches $${Math.round(y5).toLocaleString()} by Year 5. Normal growth trajectory.` });
  } else if (y5 > 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Positive throughout with $${Math.round(y5).toLocaleString()} net income by Year 5.` });
  } else {
    const revLever = leverNudges?.find(l => l.id === "tuition_up_5");
    const leverHint = revLever ? ` ${revLever.coaching}` : "";
    nudges.push({ signal: "red", label: "Trajectory", message: `Still negative by Year 5. This scenario needs stronger revenue or lower costs.${leverHint}` });
  }

  if (metrics.reserveMonths >= 3) {
    nudges.push({ signal: "green", label: "Reserves", message: `${metrics.reserveMonths.toFixed(1)} months of operating reserves by Year 5. Solid cushion.` });
  } else if (metrics.reserveMonths > 0) {
    nudges.push({ signal: "amber", label: "Reserves", message: `Only ${metrics.reserveMonths.toFixed(1)} months of reserves. Target at least 3 months.` });
  } else {
    nudges.push({ signal: "red", label: "Reserves", message: `No operating reserves accumulated. The school has no financial cushion.` });
  }

  return nudges;
}

export function computeScenarios(
  data: FullModelData,
  scenarios: ScenarioAdjustments[]
): { base: ScenarioResult; scenarios: ScenarioResult[]; leverNudges: QuickLever[] } {
  const baseMetrics = computeBaseFinancials(data);
  const startingCash = data.openingBalances?.cash || 0;
  const leverNudges = computeLeverNudges(data, baseMetrics);
  const baseResult: ScenarioResult = {
    name: "Base Model",
    adjustments: {
      name: "Base Model",
      enrollmentAdjustment: 0,
      tuitionAdjustment: 0,
      expenseAdjustment: 0,
      staffingAdjustment: 0,
      facilityAdjustment: 0,
    },
    metrics: baseMetrics,
    nudges: generateNudges(baseMetrics, "Your base model", leverNudges),
  };

  const scenarioResults = scenarios.map((adj) => {
    const adjusted = applyAdjustments(baseMetrics, adj, startingCash);
    return {
      name: adj.name,
      adjustments: adj,
      metrics: adjusted,
      nudges: generateNudges(adjusted, adj.name),
    };
  });

  return { base: baseResult, scenarios: scenarioResults, leverNudges };
}

export function computeQuickLevers(data: FullModelData): QuickLever[] {
  const baseMetrics = computeBaseFinancials(data);
  return computeLeverNudges(data, baseMetrics);
}

function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtCurrencyAbs(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}
