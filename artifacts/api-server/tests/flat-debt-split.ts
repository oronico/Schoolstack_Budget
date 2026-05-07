/**
 * Task #623 — Interest / Principal split for guest (flat) debt rows.
 *
 * Exercises computeFlatDebtSplit directly and the Debt Schedule + Balance
 * Sheet output from generateUnderwritingWorkbook for a guest-debt-only
 * scenario whose flat row carries an optional interest rate + starting
 * balance. Locks in:
 *   - sub-line totals tie back to the annual payment when interest <= payment
 *   - interest is *capped* at the annual payment when accrued > payment
 *     (no negative amortization, principal cannot go negative)
 *   - balanceByYear amortizes down by principal each year and reaches 0
 *   - Debt Schedule renders Interest / Principal / Ending Balance sub-lines
 *   - Balance Sheet "Long-Term Debt" reflects the amortizing balance
 */
import ExcelJS from "exceljs";
import { computeFlatDebtSplit } from "../src/lib/workbook-helpers.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { microschoolStartup } from "./sample-payloads.js";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}
function approx(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps;
}

// 1. Normal amortization: payment > accrued interest.
{
  const split = computeFlatDebtSplit(12000, 100000, 7, 5);
  check("normal: 5 years emitted", split.interest.length === 5 && split.principal.length === 5 && split.balance.length === 5);
  check("normal: y0 interest = 7000", approx(split.interest[0], 7000));
  check("normal: y0 principal = 5000", approx(split.principal[0], 5000));
  check("normal: y0 balance = 95000", approx(split.balance[0], 95000));
  check("normal: y1 interest accrues on remaining balance", approx(split.interest[1], 95000 * 0.07));
  for (let y = 0; y < 5; y++) {
    check(
      `normal: y${y} interest+principal = annual payment`,
      approx(split.interest[y] + split.principal[y], 12000),
    );
  }
}

// 2. Edge case the code reviewer flagged: payment < accrued interest.
//    Interest must be capped at the payment so principal is not negative.
{
  const split = computeFlatDebtSplit(5000, 100000, 10, 3); // accrued = 10,000 > 5,000 payment
  check("capped: y0 interest capped at payment (5000)", approx(split.interest[0], 5000));
  check("capped: y0 principal = 0", approx(split.principal[0], 0));
  check("capped: y0 balance unchanged at 100000", approx(split.balance[0], 100000));
  check("capped: y0 interest never exceeds payment", split.interest[0] <= 5000 + 1e-6);
  check("capped: principal never negative", split.principal.every((p) => p >= 0));
}

// 3. Balance reaches zero — subsequent years emit nothing.
{
  const split = computeFlatDebtSplit(60000, 100000, 5, 5);
  // Year 0: interest 5000, principal 55000, bal 45000
  // Year 1: interest 2250, principal 45000 (capped at remaining bal), bal 0
  // Years 2-4: zero across the board
  check("payoff: y1 balance = 0", approx(split.balance[1], 0));
  check("payoff: y2 interest = 0", approx(split.interest[2], 0));
  check("payoff: y2 principal = 0", approx(split.principal[2], 0));
  check("payoff: y2 balance = 0", approx(split.balance[2], 0));
  check("payoff: principal capped at remaining balance in payoff year", split.principal[1] <= 45000 + 1e-6);
}

// 4. Defensive: zero/negative inputs.
{
  const zeroBal = computeFlatDebtSplit(12000, 0, 7, 3);
  check("zero balance: all zeros", zeroBal.interest.every((v) => v === 0) && zeroBal.principal.every((v) => v === 0) && zeroBal.balance.every((v) => v === 0));
  const zeroPay = computeFlatDebtSplit(0, 100000, 7, 3);
  check("zero payment: all zeros", zeroPay.interest.every((v) => v === 0) && zeroPay.principal.every((v) => v === 0) && zeroPay.balance.every((v) => v === 0));
}

// 5. End-to-end: workbook renders sub-lines and balance sheet reflects amortization.
async function workbookCheck() {
  const data = {
    ...microschoolStartup,
    capitalAndDebtRows: [
      {
        id: "guest-flat",
        lineItem: "Founder Personal Note",
        enabled: true,
        isLoan: false,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        flatAnnualDebtService: 12000,
        flatInterestRate: 7,
        flatStartingBalance: 100000,
      },
    ],
  } as unknown as Record<string, unknown>;

  const built = await generateUnderwritingWorkbook(data);
  const buf = await built.xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ds = wb.getWorksheet("Debt Schedule");
  check("workbook: Debt Schedule exists", !!ds);
  if (!ds) return;

  let intRow = -1, prinRow = -1, balRow = -1, totalRow = -1;
  ds.eachRow((row, rn) => {
    const v = String(row.getCell(1).value ?? "").trim();
    if (v === "Founder Personal Note") totalRow = rn;
    else if (v === "Interest") intRow = rn;
    else if (v === "Principal") prinRow = rn;
    else if (v === "Ending Balance") balRow = rn;
  });
  check("workbook: total flat row rendered", totalRow > 0);
  check("workbook: Interest sub-line rendered", intRow > 0);
  check("workbook: Principal sub-line rendered", prinRow > 0);
  check("workbook: Ending Balance sub-line rendered", balRow > 0);

  if (intRow > 0 && prinRow > 0 && balRow > 0) {
    const y0Int = Number(ds.getCell(intRow, 2).value ?? 0);
    const y0Prin = Number(ds.getCell(prinRow, 2).value ?? 0);
    const y0Bal = Number(ds.getCell(balRow, 2).value ?? 0);
    check("workbook: y0 interest ≈ 7000", Math.abs(y0Int - 7000) <= 1);
    check("workbook: y0 principal ≈ 5000", Math.abs(y0Prin - 5000) <= 1);
    check("workbook: y0 ending balance ≈ 95000", Math.abs(y0Bal - 95000) <= 1);
    check("workbook: y0 sub-lines sum to payment", Math.abs(y0Int + y0Prin - 12000) <= 1);
  }

  const bs = wb.getWorksheet("Balance Sheet");
  check("workbook: Balance Sheet exists", !!bs);
  if (bs) {
    let ltdRow = -1;
    bs.eachRow((row, rn) => {
      const v = String(row.getCell(1).value ?? "").trim();
      if (v === "Long-Term Debt") ltdRow = rn;
    });
    check("workbook: Long-Term Debt row found", ltdRow > 0);
    if (ltdRow > 0) {
      const y0 = Number(bs.getCell(ltdRow, 2).value ?? 0);
      const y1 = Number(bs.getCell(ltdRow, 3).value ?? 0);
      check("workbook: BS LTD year 0 ≈ 95000 (amortized by principal)", Math.abs(y0 - 95000) <= 1);
      check("workbook: BS LTD year 1 < year 0 (still amortizing)", y1 < y0);
    }
  }
}

(async () => {
  await workbookCheck();
  if (failures.length === 0) {
    console.log(`flat-debt-split: ${passed} passed, 0 failed`);
    process.exit(0);
  } else {
    console.log(`flat-debt-split: ${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }
})();
