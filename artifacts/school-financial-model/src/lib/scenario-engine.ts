import type { FullModelData } from "@/pages/model-wizard/schema";

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

function driverVal(
  amounts: number[] | undefined,
  y: number,
  driverType: string,
  students: number,
  escalationRate?: number,
  fallbackEsc?: number
): number {
  const raw = amounts?.[y] ?? amounts?.[0] ?? 0;
  const esc = escalationRate ?? fallbackEsc ?? 0;
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
    default:
      return base;
  }
}

function computeBaseFinancials(data: FullModelData): ScenarioMetrics {
  const sp = data.schoolProfile;
  const en = (data.enrollment || {}) as Record<string, unknown>;
  const enrollment = [(en.year1 as number) || 0, (en.year2 as number) || 0, (en.year3 as number) || 0, (en.year4 as number) || 0, (en.year5 as number) || 0];
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

  for (let y = 0; y < 5; y++) {
    const students = enrollment[y];
    const pf = y === 0 ? prorationFactor : 1;

    let revTotal = 0;
    const revVals = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.driverType === "percent_of_base") continue;
      let val: number;
      if (r.driverType === "per_student" && r.category === "tuition_and_fees" && tiers.length > 0) {
        let tierRev = 0;
        const baseTuition = r.amounts?.[0] ?? 0;
        const escRate = (data.tuitionEscalation?.rate ?? r.escalationRate ?? 0) / 100;
        const adjTuition = baseTuition * Math.pow(1 + escRate, y);
        for (const t of tiers) {
          const disc = 1 - (t.discountPercent || 0) / 100;
          const count = t.studentCounts?.[y] ?? 0;
          tierRev += adjTuition * disc * count;
        }
        val = tierRev;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation);
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
      const annual = (r.fte || 0) * (r.annualizedRate || 0);
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

    let facTotal = 0;
    let opexTotal = 0;
    for (const r of expenseRows) {
      let val: number;
      if (r.driverType === "percent_of_revenue") {
        const esc = r.escalationRate ?? costInflation ?? 0;
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = r.amounts?.[y] ?? 0;
        }
        val = (pct / 100) * revTotal;
      } else {
        val = driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation);
      }
      if (r.category === "occupancy_facility") {
        facTotal += val;
      } else {
        opexTotal += val;
      }
    }

    let cdTotal = 0;
    for (const r of capDebtRows) {
      if (r.isLoan) {
        const principal = r.loanPrincipal || 0;
        const rate = (r.loanRate || 0) / 100;
        const term = r.loanTermYears || 0;
        if (principal > 0 && rate > 0 && term > 0 && y < term) {
          const monthlyRate = rate / 12;
          const numPayments = term * 12;
          const monthlyPmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
          cdTotal += monthlyPmt * 12;
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

    const debtService = cdTotal;
    if (debtService > 0) {
      const cfads = revTotal - persTotal - facTotal - opexTotal;
      dscr.push(Math.round((cfads / debtService) * 100) / 100);
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
        cashRunwayMonths = y * 12 + m;
        break;
      }
    }
    if (runningCash <= 0) break;
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
  const revenue = base.revenue.map((r) => r * enrollFactor * revFactor);
  const staffingCost = base.staffingCost.map((s) => s * staffFactor);
  const facilityCost = base.facilityCost.map((f) => f * facFactor);
  const opex = base.opex.map((o) => o * expFactor);
  const debtService = base.totalExpenses.map((te, i) => te - base.staffingCost[i] - base.facilityCost[i] - base.opex[i]);
  const totalExpenses = staffingCost.map((s, i) => s + facilityCost[i] + opex[i] + debtService[i]);
  const netIncome = revenue.map((r, i) => r - totalExpenses[i]);
  const netMargin = revenue.map((r, i) => (r > 0 ? netIncome[i] / r : 0));

  const dscr = revenue.map((r, i) => {
    const ds = debtService[i];
    if (ds > 0) {
      const cfads = r - staffingCost[i] - facilityCost[i] - opex[i];
      return Math.round((cfads / ds) * 100) / 100;
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
        cashRunwayMonths = y * 12 + m;
        break;
      }
    }
    if (runningCash <= 0) break;
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
  };
}

function generateNudges(metrics: ScenarioMetrics, name: string): NudgeItem[] {
  const nudges: NudgeItem[] = [];
  const y1 = metrics.netIncome[0];
  const y5 = metrics.netIncome[4];

  if (metrics.breakEvenYear !== null) {
    if (metrics.breakEvenYear <= 2) {
      nudges.push({ signal: "green", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}.` });
    } else if (metrics.breakEvenYear <= 4) {
      nudges.push({ signal: "amber", label: "Break-Even", message: `${name} reaches break-even in Year ${metrics.breakEvenYear}. Earlier is better for lenders.` });
    } else {
      nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't break even until Year ${metrics.breakEvenYear}. Consider reducing costs or increasing revenue.` });
    }
  } else {
    nudges.push({ signal: "red", label: "Break-Even", message: `${name} doesn't reach break-even in 5 years. This scenario needs significant adjustments.` });
  }

  const avgStaffPct = metrics.staffingPctOfRevenue.reduce((a, b) => a + b, 0) / 5;
  if (avgStaffPct > 0.7) {
    nudges.push({ signal: "red", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue. Lenders will flag anything over 70%.` });
  } else if (avgStaffPct > 0.6) {
    nudges.push({ signal: "amber", label: "Staffing", message: `Staffing costs average ${Math.round(avgStaffPct * 100)}% of revenue. That's within range but worth watching.` });
  } else if (avgStaffPct > 0) {
    nudges.push({ signal: "green", label: "Staffing", message: `Staffing costs are ${Math.round(avgStaffPct * 100)}% of revenue. Well managed.` });
  }

  const hasDscr = metrics.dscr.some((d) => d > 0);
  if (hasDscr) {
    const y1Dscr = metrics.dscr[0];
    if (y1Dscr >= 1.25) {
      nudges.push({ signal: "green", label: "DSCR", message: `Debt service coverage of ${y1Dscr.toFixed(2)}x exceeds the 1.25x minimum lenders want.` });
    } else if (y1Dscr >= 1.0) {
      nudges.push({ signal: "amber", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is tight. Most lenders want at least 1.25x.` });
    } else {
      nudges.push({ signal: "red", label: "DSCR", message: `DSCR of ${y1Dscr.toFixed(2)}x is below 1.0x. The school can't cover its debt payments.` });
    }
  }

  if (y5 > 0 && y1 < 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Starts negative in Year 1 but reaches $${Math.round(y5).toLocaleString()} by Year 5. Normal growth trajectory.` });
  } else if (y5 > 0) {
    nudges.push({ signal: "green", label: "Trajectory", message: `Positive throughout with $${Math.round(y5).toLocaleString()} net income by Year 5.` });
  } else {
    nudges.push({ signal: "red", label: "Trajectory", message: `Still negative by Year 5. This scenario needs stronger revenue or lower costs.` });
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
): { base: ScenarioResult; scenarios: ScenarioResult[] } {
  const baseMetrics = computeBaseFinancials(data);
  const startingCash = data.openingBalances?.cash || 0;
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
    nudges: generateNudges(baseMetrics, "Your base model"),
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

  return { base: baseResult, scenarios: scenarioResults };
}
