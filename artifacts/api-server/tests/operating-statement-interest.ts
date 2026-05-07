/**
 * Task #664 — Lock in the Operating Statement's Interest Expense row.
 *
 * The Operating Statement now splits the legacy "Capital & Debt Service"
 * line into "Interest Expense" (driven by computeInterestByYear) and
 * "Principal & Capital Outlays" (the remainder of cdByYear). Without a
 * guard, a future refactor of buildDebtSchedule or buildOperatingStatement
 * could silently break either the per-year interest match or the identity
 * that keeps Net Income tied to Total Revenue - Total Expenses.
 *
 * Fixture: an amortizing equipment loan AND a guest flat-debt row that
 * carries both flatInterestRate and flatStartingBalance, so the workbook
 * exercises both interest sources (computeInterestPortion for the loan
 * and computeFlatDebtSplit for the guest row).
 */
import ExcelJS from "exceljs";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import {
  computeInterestPortion,
  computeFlatDebtSplit,
} from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

const failures: string[] = [];
let passed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Disable Year 1 proration so the test math is straightforward — the
 * split logic under test runs the same way regardless of partial-year.
 */
function fixture(): Record<string, unknown> {
  return {
    ...microschoolStartup,
    schoolProfile: {
      ...microschoolStartup.schoolProfile,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
    },
    capitalAndDebtRows: [
      {
        id: "loan1",
        lineItem: "Equipment Loan",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        isLoan: true,
        loanPrincipal: 30000,
        loanRate: 6,
        loanTermYears: 5,
        purpose: "startup",
      },
      {
        id: "guest1",
        lineItem: "Founder Personal Note",
        enabled: true,
        isLoan: false,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        flatAnnualDebtService: 6000,
        flatInterestRate: 5,
        flatStartingBalance: 24000,
      },
    ],
  } as unknown as Record<string, unknown>;
}

function readNumeric(cell: ExcelJS.Cell): number | null {
  const v = cell.value as unknown;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : null;
    }
  }
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function findRow(sheet: ExcelJS.Worksheet, label: string): number {
  let found = -1;
  sheet.eachRow((row, rowNumber) => {
    if (found > 0) return;
    if (row.getCell(1).value === label) found = rowNumber;
  });
  return found;
}

function readYearRow(sheet: ExcelJS.Worksheet, row: number, yc: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < yc; y++) {
    const v = readNumeric(sheet.getCell(row, y + 2));
    out.push(v ?? 0);
  }
  return out;
}

async function main() {
  const data = fixture();
  const wb = await generateUnderwritingWorkbook(data);
  // Round-trip through xlsx serialization to exercise the same path the
  // API hands to clients (mirrors dscr-guest-debt-workbook.ts).
  const buf = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buf as unknown as ArrayBuffer);

  const yc = 5;
  const osTab = "5-Year Operating Stmt";
  const os = loaded.worksheets.find(ws => ws.name === osTab);
  check(`${osTab} sheet exists`, !!os);
  const ds = loaded.worksheets.find(ws => ws.name === "Debt Schedule");
  check("Debt Schedule sheet exists", !!ds);
  if (!os || !ds) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  // 1) Interest Expense row exists on the Operating Statement.
  const intRow = findRow(os, "Interest Expense");
  check("Operating Statement has 'Interest Expense' row", intRow > 0, `intRow=${intRow}`);
  const pcRow = findRow(os, "Principal & Capital Outlays");
  check("Operating Statement has 'Principal & Capital Outlays' row", pcRow > 0, `pcRow=${pcRow}`);
  const revRow = findRow(os, "Total Revenue");
  const totExpRow = findRow(os, "Total Expenses");
  check("Operating Statement has 'Total Revenue' row", revRow > 0);
  check("Operating Statement has 'Total Expenses' row", totExpRow > 0);
  if (intRow < 0 || pcRow < 0 || revRow < 0 || totExpRow < 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  // Net Income row sits below "BOTTOM LINE"; it's the first row whose
  // label starts with "Net" or "Profit" after totExpRow. The exact label
  // depends on entityType (microschool fixture is llc_single → "Net
  // Income").
  let niRow = -1;
  os.eachRow((row, rowNumber) => {
    if (rowNumber <= totExpRow || niRow > 0) return;
    const v = row.getCell(1).value;
    if (typeof v === "string" && (v === "Net Income" || v.startsWith("Net Income") || v === "Net Profit" || v === "Net Surplus")) {
      niRow = rowNumber;
    }
  });
  check("Operating Statement has Net Income row", niRow > 0, `niRow=${niRow}`);
  if (niRow < 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  const interestY = readYearRow(os, intRow, yc);
  const principalCapY = readYearRow(os, pcRow, yc);
  const revY = readYearRow(os, revRow, yc);
  const totExpY = readYearRow(os, totExpRow, yc);
  const niY = readYearRow(os, niRow, yc);

  // 2) Interest Expense Y1..Y5 matches the Debt Schedule's per-year
  // interest totals (loan amortization + guest flat-debt split).
  const expectedInterest: number[] = [];
  for (let y = 0; y < yc; y++) {
    const loanInt = computeInterestPortion(30000, 0.06, 5, y);
    const flatSplit = computeFlatDebtSplit(6000, 24000, 5, yc);
    expectedInterest.push(Math.round(loanInt) + Math.round(flatSplit.interest[y]));
  }

  // Cross-check by summing the Debt Schedule's own interest rows so a
  // future refactor of either side trips the test.
  // Loan amortization block: row labeled "Interest".
  const dsLoanIntRow = findRow(ds, "Interest");
  check("Debt Schedule has loan 'Interest' row", dsLoanIntRow > 0);
  // Guest flat-debt row: indented "  Interest" inside the OTHER
  // CONTRACTUAL DEBT SERVICE section.
  const dsFlatIntRow = findRow(ds, "  Interest");
  check("Debt Schedule has guest-debt '  Interest' row", dsFlatIntRow > 0);
  if (dsLoanIntRow < 0 || dsFlatIntRow < 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
  const dsLoanIntY = readYearRow(ds, dsLoanIntRow, yc);
  const dsFlatIntY = readYearRow(ds, dsFlatIntRow, yc);
  const dsTotalIntY = dsLoanIntY.map((v, y) => v + dsFlatIntY[y]);

  for (let y = 0; y < yc; y++) {
    check(
      `Y${y + 1} Interest Expense matches expected (loan + flat-debt split)`,
      near(interestY[y], expectedInterest[y], 2),
      `os=${interestY[y]} expected=${expectedInterest[y]}`,
    );
    check(
      `Y${y + 1} Interest Expense matches Debt Schedule's interest rows`,
      near(interestY[y], dsTotalIntY[y], 2),
      `os=${interestY[y]} debtSchedule=${dsTotalIntY[y]}`,
    );
  }

  // 3) Interest + Principal & Capital Outlays still equals the legacy
  // Capital & Debt Service total. We pull the legacy total from the
  // Budget Detail's "Total Capital & Debt" row, which is the canonical
  // cdByYear that fed the Operating Statement before the split.
  const bd = loaded.worksheets.find(ws => ws.name === "Budget Detail");
  check("Budget Detail sheet exists", !!bd);
  if (!bd) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
  const bdCdRow = findRow(bd, "Total Capital & Debt");
  check("Budget Detail has 'Total Capital & Debt' row", bdCdRow > 0, `bdCdRow=${bdCdRow}`);
  if (bdCdRow < 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
  const cdY = readYearRow(bd, bdCdRow, yc);
  for (let y = 0; y < yc; y++) {
    const sum = interestY[y] + principalCapY[y];
    check(
      `Y${y + 1} Interest + Principal&Cap == legacy Capital & Debt Service total`,
      near(sum, cdY[y], 2),
      `sum=${sum} cdByYear=${cdY[y]}`,
    );
  }

  // 4) Net Income still equals Total Revenue - Total Expenses on the
  // Operating Statement (the bottom-line identity that ties to the
  // Balance Sheet).
  for (let y = 0; y < yc; y++) {
    const expectedNI = revY[y] - totExpY[y];
    check(
      `Y${y + 1} Net Income == Total Revenue - Total Expenses`,
      near(niY[y], expectedNI, 2),
      `ni=${niY[y]} rev-exp=${expectedNI}`,
    );
  }

  console.log(`\nOperating Statement Interest Expense: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test crashed:", err);
  process.exit(1);
});
