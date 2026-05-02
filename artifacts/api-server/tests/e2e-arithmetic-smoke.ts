import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { computeRevenueForYear, computeExpenseForYear, type RevenueRow, type ExpenseRow } from "../src/lib/workbook-helpers.js";
import { privateSchoolWithESA, charterPublicFunding, homeschoolCoopMixed } from "./sample-payloads.js";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function num(ws: import("exceljs").Worksheet, row: number, col: number): number {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) {
    const r = (v as { result?: unknown }).result;
    if (typeof r === "number") return r;
  }
  return Number(v) || 0;
}

function findRow(ws: import("exceljs").Worksheet, label: string, start = 1, end = 120): number {
  for (let r = start; r <= end; r++) {
    const v = ws.getCell(r, 1).value;
    if (typeof v === "string" && v.trim() === label) return r;
  }
  return -1;
}

async function testWorkbookArithmetic(payload: Record<string, unknown>, label: string, opts: { expectDebt?: boolean } = {}) {
  const expectDebt = opts.expectDebt !== false;
  console.log(`\n— Workbook arithmetic smoke: ${label} —`);
  const wb = await generateUnderwritingWorkbook(payload);
  const summary = wb.getWorksheet("Budget Summary");
  const dscr = wb.getWorksheet("DSCR & Covenants");
  check(`${label}: Budget Summary exists`, !!summary);
  check(`${label}: DSCR sheet exists`, !!dscr);
  if (!summary || !dscr) return;

  const revRow = findRow(summary, "Total Revenue");
  const persRow = findRow(summary, "Total Personnel");
  const opexRow = findRow(summary, "Total Operating Expenses");
  const capDebtRow = findRow(summary, "Total Capital & Debt Service");
  const expRow = findRow(summary, "Total Expenses");
  let niRow = findRow(summary, "Net Income");
  if (niRow < 0) niRow = findRow(summary, "Net Surplus");
  if (niRow < 0) niRow = findRow(summary, "Change in Net Assets");
  check(`${label}: summary rows found`, [revRow, persRow, opexRow, capDebtRow, expRow, niRow].every((r) => r > 0));
  if ([revRow, persRow, opexRow, capDebtRow, expRow, niRow].some((r) => r < 0)) return;

  // Use Year 2 and Year 4 to avoid trivial zero/identity checks.
  for (const yearCol of [3, 5]) {
    const rev = num(summary, revRow, yearCol);
    const pers = num(summary, persRow, yearCol);
    const opex = num(summary, opexRow, yearCol);
    const capDebt = num(summary, capDebtRow, yearCol);
    const exp = num(summary, expRow, yearCol);
    const ni = num(summary, niRow, yearCol);

    const calcExp = pers + opex + capDebt;
    const calcNi = rev - exp;
    check(`${label}: Y${yearCol - 1} expenses tie`, Math.abs(exp - calcExp) <= 2, `exp=${exp} calc=${calcExp}`);
    check(`${label}: Y${yearCol - 1} net income tie`, Math.abs(ni - calcNi) <= 2, `ni=${ni} calc=${calcNi}`);
  }

  let dsRow = findRow(dscr, "Debt Service");
  if (dsRow < 0) dsRow = findRow(dscr, "Debt Service (Loan)");
  let dscrRow = findRow(dscr, "DSCR");
  check(`${label}: DSCR rows found`, dsRow > 0 && dscrRow > 0);
  if (dsRow < 0 || dscrRow < 0) return;

  const y2Debt = num(dscr, dsRow, 3);
  const y2Dscr = num(dscr, dscrRow, 3);
  if (expectDebt) {
    check(`${label}: Year 2 debt service non-trivial`, y2Debt > 10000, `debt=${y2Debt}`);
  } else {
    check(`${label}: Year 2 debt service zero (no-debt fixture)`, y2Debt === 0, `debt=${y2Debt}`);
  }
  check(`${label}: Year 2 DSCR numeric`, Number.isFinite(y2Dscr), `dscr=${y2Dscr}`);
}

function testNonTrivialRowMath() {
  console.log("\n— Non-trivial row arithmetic smoke —");
  const enrollment = 137;

  const revenueRows: RevenueRow[] = [
    { id: "tuition", lineItem: "Tuition", category: "tuition_and_fees", enabled: true, driverType: "per_student", amounts: [12345, 12345, 12345, 12345, 12345], escalationRate: 2.5, escalationRateOverridden: true },
    { id: "discount", lineItem: "Discount", category: "tuition_offsets", enabled: true, driverType: "percent_of_base", percentBase: "tuition", amounts: [11.25, 11.25, 11.25, 11.25, 11.25], escalationRate: 0, escalationRateOverridden: true },
  ];

  const y3Revenue = computeRevenueForYear(revenueRows, 2, enrollment, undefined, 3.4);
  const tuitionY3 = (12345 * Math.pow(1.025, 2)) * enrollment;
  const discountY3 = tuitionY3 * 0.1125;
  const expectedRevenue = tuitionY3 - discountY3;
  check("Revenue percent_of_base arithmetic (non-trivial)", Math.abs(y3Revenue - expectedRevenue) <= 2, `actual=${y3Revenue} expected=${expectedRevenue}`);

  const expenseRows: ExpenseRow[] = [
    { id: "insurance", lineItem: "Insurance", category: "administrative_general", enabled: true, driverType: "annual_fixed", amounts: [24850, 24850, 24850, 24850, 24850], escalationRate: 0, escalationRateOverridden: true },
    { id: "mgmt_fee", lineItem: "Mgmt Fee", category: "administrative_general", enabled: true, driverType: "percent_of_revenue", amounts: [4.35, 4.35, 4.35, 4.35, 4.35], escalationRate: 1.1, escalationRateOverridden: true },
  ];
  const y3Expense = computeExpenseForYear(expenseRows, 2, enrollment, y3Revenue, 2.8);
  const pctY3 = 4.35 * Math.pow(1.011, 2);
  const expectedExpense = 24850 + (pctY3 / 100) * y3Revenue;
  check("Expense percent_of_revenue arithmetic (non-trivial)", Math.abs(y3Expense - expectedExpense) <= 2, `actual=${y3Expense} expected=${expectedExpense}`);
}

async function main() {
  console.log("=== E2E Arithmetic Smoke (non-trivial values) ===");
  await testWorkbookArithmetic(privateSchoolWithESA as unknown as Record<string, unknown>, "Private+ESA");
  await testWorkbookArithmetic(charterPublicFunding as unknown as Record<string, unknown>, "Charter");
  await testWorkbookArithmetic(homeschoolCoopMixed as unknown as Record<string, unknown>, "HomeschoolCoop", { expectDebt: false });
  testNonTrivialRowMath();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
