import { resolveEsc, computeEffectiveFte } from "./staffing.js";
import { computeAnnualDebt } from "./amortization.js";
import type { TestModelPayload, TestRevenueRow, TestExpenseRow, TestCapDebtRow, TestStaffingRow } from "./test-fixtures.js";

export function driverVal(
  amounts: number[] | undefined,
  y: number,
  dt: string,
  students: number,
  escalationRate?: number,
  fallbackInflation?: number,
  escalationRateOverridden?: boolean,
): number {
  let base = amounts?.[y] ?? 0;
  const esc = escalationRateOverridden ? (escalationRate ?? 0) : resolveEsc(escalationRate, fallbackInflation);
  if (esc !== 0 && y > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + esc / 100, y);
  }
  switch (dt) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function computeRevenueForYear(
  rows: TestRevenueRow[],
  y: number,
  students: number,
  sp: { isPartialFirstYear?: boolean; year1OperatingMonths?: number },
): number {
  const enabled = rows.filter(r => r.enabled);
  const vals = new Map<string, number>();
  for (const r of enabled) {
    if (r.driverType === "percent_of_base") continue;
    vals.set(r.id, driverVal(r.amounts, y, r.driverType, students, r.escalationRate, undefined, r.escalationRateOverridden));
  }
  for (const r of enabled) {
    if (r.driverType !== "percent_of_base") continue;
    const baseVal = vals.get(r.percentBase || "") || 0;
    let pct = r.amounts?.[y] ?? 0;
    if (r.escalationRate && r.escalationRate !== 0 && y > 0) {
      pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
    }
    vals.set(r.id, baseVal * (pct / 100));
  }
  let total = 0;
  for (const r of enabled) {
    const v = vals.get(r.id) || 0;
    if (r.category === "tuition_offsets") total -= Math.abs(v);
    else total += v;
  }
  return total;
}

function computePersonnelForYear(
  rows: TestStaffingRow[],
  salaryEsc: number,
  pf: number,
  y: number,
  students: number,
): number {
  let total = 0;
  for (const r of rows) {
    const fte = computeEffectiveFte(r, y, students);
    const annual = fte * r.annualizedRate;
    const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
    let benefits = 0, tax = 0;
    if (!isContractNoPL) {
      if (r.benefitsEligible) benefits = annual * (r.benefitsRate / 100);
      tax = annual * (r.payrollTaxRate / 100);
    }
    total += annual + benefits + tax;
  }
  const yPf = y === 0 ? pf : 1;
  return total * Math.pow(1 + salaryEsc, y) * yPf;
}

function computeExpenseForYear(
  rows: TestExpenseRow[],
  y: number,
  students: number,
  revenue: number,
  costInflation: number,
  pf: number,
  yearFTE: number,
): number {
  const enabled = rows.filter(r => r.enabled);
  const yPf = y === 0 ? pf : 1;
  let total = 0;
  for (const r of enabled) {
    if (r.driverType === "percent_of_revenue") {
      const esc = r.escalationRateOverridden ? (r.escalationRate ?? 0) : resolveEsc(r.escalationRate, costInflation);
      let pct: number;
      if (esc !== 0 && y > 0) {
        pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
      } else {
        pct = r.amounts?.[y] ?? 0;
      }
      total += (pct / 100) * revenue;
    } else if (r.driverType === "per_fte") {
      const perFte = driverVal(r.amounts, y, "annual_fixed", students, r.escalationRate, costInflation, r.escalationRateOverridden);
      total += perFte * yearFTE * yPf;
    } else {
      total += driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflation, r.escalationRateOverridden) * yPf;
    }
  }
  return total;
}

function computeYearFTE(rows: TestStaffingRow[], y: number, students: number): number {
  let total = 0;
  for (const r of rows) {
    total += computeEffectiveFte(r, y, students);
  }
  return total;
}

function computeCapDebtForYear(
  rows: TestCapDebtRow[],
  y: number,
  students: number,
): number {
  const enabled = rows.filter(r => r.enabled);
  let total = 0;
  for (const r of enabled) {
    if (r.isLoan) {
      const principal = r.loanPrincipal || 0;
      const rate = (r.loanRate || 0) / 100;
      const term = r.loanTermYears || 0;
      if (principal > 0 && term > 0 && y < term) {
        total += computeAnnualDebt(principal, rate, term);
      }
    } else {
      total += driverVal(r.amounts, y, r.driverType, students);
    }
  }
  return total;
}

export interface BackendComputedValues {
  revenue: number[];
  personnel: number[];
  expenses: number[];
  capDebt: number[];
  netIncome: number[];
  loanDS: number[];
}

export function computeBackendValues(fixture: TestModelPayload): BackendComputedValues {
  const sp = fixture.schoolProfile;
  const enrollment = [
    fixture.enrollment.year1, fixture.enrollment.year2, fixture.enrollment.year3,
    fixture.enrollment.year4, fixture.enrollment.year5,
  ];
  const pf = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEsc = (fixture.facilities.annualSalaryIncrease || 0) / 100;
  const costInfl = fixture.facilities.generalCostInflation || 0;
  const loanRows = fixture.capitalAndDebtRows.filter(r => r.isLoan);

  const revenue: number[] = [], personnel: number[] = [], expenses: number[] = [], capDebt: number[] = [], loanDS: number[] = [];
  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    const rev = Math.round(computeRevenueForYear(fixture.revenueRows, y, enrollment[y], sp) * yPf);
    revenue.push(rev);
    personnel.push(Math.round(computePersonnelForYear(fixture.staffingRows, salaryEsc, pf, y, enrollment[y])));
    const yearFTE = computeYearFTE(fixture.staffingRows, y, enrollment[y]);
    expenses.push(Math.round(computeExpenseForYear(fixture.expenseRows, y, enrollment[y], rev, costInfl, pf, yearFTE)));
    capDebt.push(Math.round(computeCapDebtForYear(fixture.capitalAndDebtRows, y, enrollment[y])));
    loanDS.push(Math.round(computeCapDebtForYear(loanRows, y, enrollment[y])));
  }
  return {
    revenue, personnel, expenses, capDebt, loanDS,
    netIncome: revenue.map((r, i) => r - personnel[i] - expenses[i] - capDebt[i]),
  };
}
