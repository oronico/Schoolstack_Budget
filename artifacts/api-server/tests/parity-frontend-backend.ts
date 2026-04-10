import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeAnnualDebt,
  driverVal,
  getEnrollmentArray,
  computeEffectiveFte,
  type RevenueRow,
  type ExpenseRow,
  type StaffingRow,
  type CapitalDebtRow,
} from "../src/lib/workbook-helpers.js";
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding, homeschoolCoopMixed } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerancePct = 0.5) {
  const absTol = Math.max(Math.abs(expected) * (tolerancePct / 100), 2);
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${Math.round(expected)}, got ${Math.round(actual)} (diff ${Math.round(diff)}, tol ${Math.round(absTol)})`);
  }
}

function bool(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; }
  else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function normalizeRow(raw: Record<string, unknown>): StaffingRow {
  return {
    id: (raw.id as string) || "",
    roleName: (raw.roleName as string) || "",
    functionCategory: (raw.functionCategory as string) || "",
    employmentType: (raw.employmentType as string) || "full_time",
    fte: (raw.fte as number) || 1,
    annualizedRate: (raw.annualizedRate as number) || 0,
    benefitsEligible: raw.benefitsEligible !== false,
    benefitsRate: (raw.benefitsRate as number) || 0,
    payrollTaxRate: (raw.payrollTaxRate as number) || 7.65,
    payrollLike: (raw.payrollLike as boolean) || false,
    notes: (raw.notes as string) || "",
    staffingMode: (raw.staffingMode as "fixed" | "ratio") || "fixed",
    studentRatio: raw.studentRatio != null ? (raw.studentRatio as number) : undefined,
    minFte: raw.minFte != null ? (raw.minFte as number) : undefined,
    maxFte: raw.maxFte != null ? (raw.maxFte as number) : undefined,
    startYear: raw.startYear != null ? (raw.startYear as number) : undefined,
    endYear: raw.endYear != null ? (raw.endYear as number) : undefined,
  };
}

function frontendDriverVal(
  amounts: number[] | undefined,
  y: number,
  driverType: string,
  students: number,
  escalationRate?: number,
  fallbackEsc?: number,
): number {
  const raw = amounts?.[y] ?? 0;
  const esc = (escalationRate !== undefined && escalationRate !== 0) ? escalationRate : (fallbackEsc ?? 0);
  let base: number;
  if (esc !== 0 && y > 0) {
    base = (amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
  } else {
    base = raw;
  }
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    default: return base;
  }
}

function frontendComputeBaseFinancials(data: Record<string, unknown>) {
  const sp = (data.schoolProfile || {}) as Record<string, unknown>;
  const en = (data.enrollment || {}) as Record<string, unknown>;
  const enrollment = [(en.year1 as number) || 0, (en.year2 as number) || 0, (en.year3 as number) || 0, (en.year4 as number) || 0, (en.year5 as number) || 0];
  const prorationFactor = sp.isPartialFirstYear ? ((sp.year1OperatingMonths as number) || 10) / 12 : 1;
  const salaryEscRate = ((data.facilities as Record<string, unknown>)?.annualSalaryIncrease as number || 0) / 100;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation as number || 0;

  const revenueRows = ((data.revenueRows as Array<Record<string, unknown>>) || []).filter((r) => r.enabled);
  const rawStaffingRows = ((data.staffingRows as Array<Record<string, unknown>>) || []);
  const expenseRows = ((data.expenseRows as Array<Record<string, unknown>>) || []).filter((r) => r.enabled);
  const capDebtRows = ((data.capitalAndDebtRows as Array<Record<string, unknown>>) || []).filter((r) => r.enabled);

  const revenue: number[] = [];
  const personnel: number[] = [];
  const expenses: number[] = [];
  const capDebt: number[] = [];
  const loanDS: number[] = [];

  for (let y = 0; y < 5; y++) {
    const students = enrollment[y];
    const pf = y === 0 ? prorationFactor : 1;

    let revTotal = 0;
    const revVals = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.driverType === "percent_of_base") continue;
      const val = frontendDriverVal(r.amounts as number[], y, r.driverType as string, students, r.escalationRate as number | undefined);
      revVals.set(r.id as string, val * pf);
    }
    for (const r of revenueRows) {
      if (r.driverType !== "percent_of_base") continue;
      const baseVal = revVals.get((r.percentBase as string) || "") || 0;
      let pctVal = (r.amounts as number[])?.[y] ?? 0;
      if (r.escalationRate && (r.escalationRate as number) !== 0 && y > 0) {
        pctVal = ((r.amounts as number[])?.[0] ?? 0) * Math.pow(1 + (r.escalationRate as number) / 100, y);
      }
      revVals.set(r.id as string, baseVal * (pctVal / 100));
    }
    for (const r of revenueRows) {
      const v = revVals.get(r.id as string) || 0;
      if (r.category === "tuition_offsets") revTotal -= Math.abs(v);
      else revTotal += v;
    }
    revenue.push(revTotal);

    let persTotal = 0;
    for (const r of rawStaffingRows) {
      let effectiveFte = (r.fte as number) || 0;
      if (r.startYear && (y + 1) < (r.startYear as number)) { effectiveFte = 0; }
      else if (r.endYear && (y + 1) > (r.endYear as number)) { effectiveFte = 0; }
      else if (r.staffingMode === "ratio" && r.studentRatio) {
        const ratio = r.studentRatio as number;
        if (ratio > 0) {
          let computed = students / ratio;
          if (r.minFte !== undefined) computed = Math.max(computed, r.minFte as number);
          if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte as number);
          effectiveFte = Math.ceil(computed * 2) / 2;
        }
      }
      const annual = effectiveFte * ((r.annualizedRate as number) || 0);
      const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
      let benefits = 0, tax = 0;
      if (!isContractNoPL) {
        if (r.benefitsEligible) benefits = annual * (((r.benefitsRate as number) || 0) / 100);
        tax = annual * (((r.payrollTaxRate as number) || 0) / 100);
      }
      persTotal += annual + benefits + tax;
    }
    const persEsc = Math.pow(1 + salaryEscRate, y);
    persTotal = persTotal * persEsc * pf;
    personnel.push(persTotal);

    let expTotal = 0;
    for (const r of expenseRows) {
      let val: number;
      if (r.driverType === "percent_of_revenue") {
        const esc = (r.escalationRate !== undefined && (r.escalationRate as number) !== 0) ? (r.escalationRate as number) : (costInflation ?? 0);
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = ((r.amounts as number[])?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = (r.amounts as number[])?.[y] ?? 0;
        }
        val = (pct / 100) * revTotal;
      } else {
        val = frontendDriverVal(r.amounts as number[], y, r.driverType as string, students, r.escalationRate as number | undefined, costInflation);
        val *= pf;
      }
      expTotal += val;
    }
    expenses.push(expTotal);

    let cdTotal = 0;
    let loanDebtService = 0;
    for (const r of capDebtRows) {
      if (r.isLoan) {
        const principal = (r.loanPrincipal as number) || 0;
        const rate = ((r.loanRate as number) || 0) / 100;
        const term = (r.loanTermYears as number) || 0;
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
        cdTotal += frontendDriverVal(r.amounts as number[], y, r.driverType as string, students);
      }
    }
    capDebt.push(cdTotal);
    loanDS.push(loanDebtService);
  }

  return { revenue, personnel, expenses, capDebt, loanDS };
}

function testPayloadParity(payload: Record<string, unknown>, label: string) {
  console.log(`\n— Parity: ${label} —`);

  const sp = (payload.schoolProfile || {}) as Record<string, unknown>;
  const enrollment = getEnrollmentArray(payload.enrollment as Record<string, unknown>);
  const revenueRows = payload.revenueRows as unknown as RevenueRow[];
  const rawStaffingRows = (payload.staffingRows as unknown as Record<string, unknown>[]);
  const staffingRows = rawStaffingRows.map(normalizeRow);
  const expenseRows = payload.expenseRows as unknown as ExpenseRow[];
  const capDebtRows = (payload.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];
  const prorationFactor = sp.isPartialFirstYear ? ((sp.year1OperatingMonths as number) || 10) / 12 : 1;
  const salaryEsc = ((payload.facilities as Record<string, unknown>)?.annualSalaryIncrease as number || 0) / 100;
  const costInflPct = (payload.facilities as Record<string, unknown>)?.generalCostInflation as number || 0;

  const fe = frontendComputeBaseFinancials(payload);

  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;

    const beRev = computeRevenueForYear(revenueRows, y, enrollment[y], undefined, undefined, sp as any);
    check(`${label} Y${y + 1} Revenue parity`, fe.revenue[y], beRev * pf, 2);

    const bePers = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y, enrollment[y]);
    check(`${label} Y${y + 1} Personnel parity`, fe.personnel[y], bePers, 2);

    const beExp = computeExpenseForYear(expenseRows, y, enrollment[y], beRev * pf, costInflPct);
    check(`${label} Y${y + 1} Expenses parity`, fe.expenses[y], beExp * pf, 2);

    const beCd = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
    check(`${label} Y${y + 1} CapDebt parity`, fe.capDebt[y], beCd, 2);

    const feNetIncome = fe.revenue[y] - fe.personnel[y] - fe.expenses[y] - fe.capDebt[y];
    const beNetIncome = beRev * pf - bePers - beExp * pf - beCd;
    check(`${label} Y${y + 1} Net Income parity`, feNetIncome, beNetIncome, 2);

    if (fe.loanDS[y] > 0) {
      const feDscr = (feNetIncome + fe.loanDS[y]) / fe.loanDS[y];
      const beLoanDS = computeCapDebtForYear(capDebtRows.filter(r => r.isLoan), y, enrollment[y]);
      if (beLoanDS > 0) {
        const beDscr = (beNetIncome + beLoanDS) / beLoanDS;
        check(`${label} Y${y + 1} DSCR parity`, feDscr, beDscr, 2);
      }
    }
  }
}

function testDriverValParity() {
  console.log("\n— driverVal parity: frontend vs backend —");

  const amts = [1000, 1000, 1000, 1000, 1000];

  check("driverVal annual_fixed Y0", frontendDriverVal(amts, 0, "annual_fixed", 50), driverVal(amts, 0, "annual_fixed", 50), 0);
  check("driverVal monthly Y0", frontendDriverVal(amts, 0, "monthly", 50), driverVal(amts, 0, "monthly", 50), 0);
  check("driverVal per_student Y0", frontendDriverVal(amts, 0, "per_student", 50), driverVal(amts, 0, "per_student", 50), 0);

  check("driverVal annual_fixed Y2 esc=3", frontendDriverVal(amts, 2, "annual_fixed", 50, 3), driverVal(amts, 2, "annual_fixed", 50, 3), 0);
  check("driverVal per_student Y2 esc=5", frontendDriverVal(amts, 2, "per_student", 50, 5), driverVal(amts, 2, "per_student", 50, 5), 0);
  check("driverVal monthly Y3 esc=2", frontendDriverVal(amts, 3, "monthly", 50, 2), driverVal(amts, 3, "monthly", 50, 2), 0);

  check("driverVal fallback esc Y2 (FE)", frontendDriverVal(amts, 2, "annual_fixed", 50, 0, 4), driverVal(amts, 2, "annual_fixed", 50, 4), 1);
}

function testLoanPMTParity() {
  console.log("\n— Loan PMT parity: frontend vs backend —");

  function frontendLoanPMT(principal: number, ratePercent: number, term: number): number {
    const rate = ratePercent / 100;
    if (principal <= 0 || term <= 0) return 0;
    if (rate <= 0) return principal / term;
    const mr = rate / 12;
    const n = term * 12;
    const monthlyPmt = (principal * mr) / (1 - Math.pow(1 + mr, -n));
    return monthlyPmt * 12;
  }

  const cases = [
    [250000, 6.5, 10],
    [500000, 5.75, 15],
    [30000, 6, 5],
    [120000, 0, 10],
    [100000, 5, 20],
  ];

  for (const [p, r, t] of cases) {
    const fe = frontendLoanPMT(p, r, t);
    const be = computeAnnualDebt(p, r / 100, t);
    check(`Loan PMT ${p}@${r}%/${t}yr`, fe, be, 0.01);
  }
}

function testEscalationOverridedParity() {
  console.log("\n— escalationRateOverridden parity —");

  const staticRow: ExpenseRow = {
    id: "static",
    lineItem: "Fixed Contract",
    enabled: true,
    category: "administration",
    driverType: "annual_fixed",
    amounts: [10000, 10000, 10000, 10000, 10000],
    escalationRate: 0,
    escalationRateOverridden: true,
  };
  const floatingRow: ExpenseRow = {
    id: "floating",
    lineItem: "Inflation-Linked",
    enabled: true,
    category: "administration",
    driverType: "annual_fixed",
    amounts: [10000, 10000, 10000, 10000, 10000],
  };

  const beStatic = computeExpenseForYear([staticRow], 2, 100, 0, 3);
  const beFloating = computeExpenseForYear([floatingRow], 2, 100, 0, 3);
  check("BE: static escalation stays at 10000 in Y3", beStatic, 10000, 0);
  check("BE: floating inherits 3% inflation in Y3", beFloating, 10000 * Math.pow(1.03, 2), 1);

  const feStatic = frontendDriverVal([10000, 10000, 10000, 10000, 10000], 2, "annual_fixed", 100, 0, 3);
  const feFloating = frontendDriverVal([10000, 10000, 10000, 10000, 10000], 2, "annual_fixed", 100, undefined, 3);

  bool("FE: escalationRate=0 falls back to costInflation (known parity gap)",
    Math.abs(feStatic - 10000 * Math.pow(1.03, 2)) < 2,
    `feStatic=${feStatic} — frontend uses fallback 3% even when escalationRateOverridden=true`
  );
  check("FE: undefined escalation falls back to costInflation", feFloating, 10000 * Math.pow(1.03, 2), 1);

  console.log("  ℹ️  Known parity gap: frontend driverVal doesn't check escalationRateOverridden flag.");
  console.log("     Backend treats escalationRate=0 + overridden=true as literally 0%.");
  console.log("     Frontend treats escalationRate=0 as 'use fallback' regardless of override flag.");
}

function testEffectiveFteParity() {
  console.log("\n— Effective FTE parity: frontend vs backend —");

  function frontendEffectiveFte(r: Record<string, unknown>, y: number, enrollment: number): number {
    let fte = (r.fte as number) || 0;
    if (r.startYear && (y + 1) < (r.startYear as number)) return 0;
    if (r.endYear && (y + 1) > (r.endYear as number)) return 0;
    if (r.staffingMode === "ratio" && r.studentRatio && (r.studentRatio as number) > 0) {
      let computed = enrollment / (r.studentRatio as number);
      if (r.minFte !== undefined) computed = Math.max(computed, r.minFte as number);
      if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte as number);
      fte = Math.ceil(computed * 2) / 2;
    }
    return fte;
  }

  const cases: Array<{ row: Record<string, unknown>; y: number; enrollment: number; label: string }> = [
    { row: { fte: 3, staffingMode: "fixed" }, y: 0, enrollment: 100, label: "fixed 3 FTE" },
    { row: { fte: 6, staffingMode: "ratio", studentRatio: 22, minFte: 4 }, y: 0, enrollment: 120, label: "ratio 120/22 min4" },
    { row: { fte: 6, staffingMode: "ratio", studentRatio: 22, minFte: 4 }, y: 2, enrollment: 300, label: "ratio 300/22 min4" },
    { row: { fte: 6, staffingMode: "ratio", studentRatio: 22, minFte: 4, maxFte: 15 }, y: 4, enrollment: 400, label: "ratio 400/22 min4 max15" },
    { row: { fte: 1, startYear: 3 }, y: 0, enrollment: 100, label: "startYear=3 y=0" },
    { row: { fte: 1, startYear: 3 }, y: 2, enrollment: 100, label: "startYear=3 y=2" },
    { row: { fte: 1, endYear: 2 }, y: 2, enrollment: 100, label: "endYear=2 y=2" },
  ];

  for (const { row, y, enrollment, label } of cases) {
    const feVal = frontendEffectiveFte(row, y, enrollment);
    const beVal = computeEffectiveFte(normalizeRow({ ...row, id: "test", roleName: "Test", functionCategory: "test", annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0 }), y, enrollment);
    check(`EffectiveFTE ${label}`, feVal, beVal, 0);
  }
}

function testMultiPayloadNetIncomeTrend() {
  console.log("\n— Net income 5-year trend parity —");

  for (const [label, payload] of [
    ["Microschool", microschoolStartup],
    ["Private+ESA", privateSchoolWithESA],
    ["Charter", charterPublicFunding],
    ["Homeschool Co-Op", homeschoolCoopMixed],
  ] as const) {
    const fe = frontendComputeBaseFinancials(payload as unknown as Record<string, unknown>);
    const sp = (payload.schoolProfile || {}) as Record<string, unknown>;
    const enrollment = getEnrollmentArray(payload.enrollment as Record<string, unknown>);
    const revenueRows = payload.revenueRows as unknown as RevenueRow[];
    const staffingRows = ((payload.staffingRows as unknown as Record<string, unknown>[]) || []).map(normalizeRow);
    const expenseRows = payload.expenseRows as unknown as ExpenseRow[];
    const capDebtRows = (payload.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];
    const pf = sp.isPartialFirstYear ? ((sp.year1OperatingMonths as number) || 10) / 12 : 1;
    const salaryEsc = ((payload.facilities as Record<string, unknown>)?.annualSalaryIncrease as number || 0) / 100;
    const costInflPct = (payload.facilities as Record<string, unknown>)?.generalCostInflation as number || 0;

    let feNITrend = 0;
    let beNITrend = 0;
    for (let y = 0; y < 5; y++) {
      const yPf = y === 0 ? pf : 1;
      const beRev = computeRevenueForYear(revenueRows, y, enrollment[y], undefined, undefined, sp as any) * yPf;
      const bePers = computePersonnelForYear(staffingRows, salaryEsc, pf, y, enrollment[y]);
      const beExp = computeExpenseForYear(expenseRows, y, enrollment[y], beRev, costInflPct) * yPf;
      const beCd = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
      beNITrend += beRev - bePers - beExp - beCd;
      feNITrend += fe.revenue[y] - fe.personnel[y] - fe.expenses[y] - fe.capDebt[y];
    }

    const totalRevFE = fe.revenue.reduce((a, b) => a + b, 0);
    const toleranceAbs = Math.max(Math.abs(totalRevFE) * 0.05, 1000);
    check(`${label}: 5Y cumulative NI parity`, feNITrend, beNITrend, 2);

    const feIsNeg = feNITrend < 0;
    const beIsNeg = beNITrend < 0;
    bool(`${label}: 5Y NI sign agreement`, feIsNeg === beIsNeg,
      `FE=${Math.round(feNITrend)} BE=${Math.round(beNITrend)}`);
  }
}

async function main() {
  console.log("=== Frontend ↔ Backend Parity Tests ===");

  testDriverValParity();
  testLoanPMTParity();
  testEscalationOverridedParity();
  testEffectiveFteParity();

  testPayloadParity(microschoolStartup as unknown as Record<string, unknown>, "Microschool");
  testPayloadParity(privateSchoolWithESA as unknown as Record<string, unknown>, "Private+ESA");
  testPayloadParity(charterPublicFunding as unknown as Record<string, unknown>, "Charter");
  testPayloadParity(homeschoolCoopMixed as unknown as Record<string, unknown>, "Homeschool");

  testMultiPayloadNetIncomeTrend();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
