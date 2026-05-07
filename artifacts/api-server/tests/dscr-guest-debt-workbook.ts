/**
 * Task #607 — DSCR & Covenants regression for guest-debt-only models.
 *
 * Before the capDebt-loop fix, a wizard-shaped model whose only debt
 * was a non-loan row carrying `flatAnnualDebtService` (a "guest debt" —
 * principal/term unknown, but the founder typed the annual payment)
 * silently produced a DSCR of 0 in the lender packet. The Underwriting
 * Workbook's DSCR & Covenants sheet folds those amounts into
 * `debtByYear` so the ratio reflects real debt burden.
 *
 * This test exports the workbook for a guest-debt-only scenario and
 * asserts the DSCR cell on the DSCR & Covenants sheet is a finite,
 * non-zero number — the actual symptom that misled lenders.
 */
import ExcelJS from "exceljs";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
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

/**
 * Build a wizard-shaped guest-debt scenario by replacing the
 * sample-payload's amortizing equipment loan with a single non-loan
 * row whose only debt signal is `flatAnnualDebtService`. Mirrors what
 * the wizard saves when the founder enters an annual payment without
 * principal/term details.
 */
function guestDebtScenario(): Record<string, unknown> {
  return {
    ...microschoolStartup,
    capitalAndDebtRows: [
      {
        id: "guest1",
        lineItem: "Founder Personal Note",
        enabled: true,
        isLoan: false,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        flatAnnualDebtService: 6000,
      },
    ],
  } as unknown as Record<string, unknown>;
}

/**
 * Read the cached numeric result of a DSCR cell. setFormula() stores
 * `{ formula, result }`; round-tripping through xlsx serialization
 * preserves the cached result so we can assert the engine's number
 * without recomputing the formula.
 */
function readNumeric(cell: ExcelJS.Cell): number | string | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      if (typeof r === "number") return r;
      if (typeof r === "string") {
        const n = Number(r);
        return Number.isFinite(n) ? n : r;
      }
    }
  }
  return null;
}

async function main() {
  const wb = await generateUnderwritingWorkbook(guestDebtScenario());
  // Round-trip through xlsx serialization so we exercise the same
  // path the API hands to clients (matches the single-year-workbook-shape
  // test pattern).
  const buf = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buf as unknown as ArrayBuffer);

  const sheet = loaded.worksheets.find(ws => ws.name === "DSCR & Covenants");
  check("DSCR & Covenants sheet exists", !!sheet);
  if (!sheet) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  // Locate the "DSCR" label row. The sheet also contains "DSCR Step-Up"
  // and "DSCR ≥ 1.20x" covenant rows, so match the bare "DSCR" label
  // exactly to pick the cash-flow ratio row.
  let dscrRow = -1;
  let dsRow = -1;
  sheet.eachRow((row, rowNumber) => {
    const label = row.getCell(1).value;
    if (label === "DSCR" && dscrRow < 0) dscrRow = rowNumber;
    if (label === "Debt Service (Loan)" && dsRow < 0) dsRow = rowNumber;
  });
  check("found DSCR ratio row", dscrRow > 0, `dscrRow=${dscrRow}`);
  check("found Debt Service (Loan) row", dsRow > 0, `dsRow=${dsRow}`);
  if (dscrRow < 0 || dsRow < 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  // Year 1 sits at column 2 (column 1 is the label column).
  const dsY1 = readNumeric(sheet.getCell(dsRow, 2));
  check(
    "Debt Service Y1 picks up flatAnnualDebtService (was 0 before fix)",
    typeof dsY1 === "number" && (dsY1 as number) >= 6000,
    `Debt Service Y1=${String(dsY1)} expected≥6000`
  );

  const dscrY1 = readNumeric(sheet.getCell(dscrRow, 2));
  check(
    "DSCR Y1 is a finite number (not N/A) for guest-debt scenario",
    typeof dscrY1 === "number" && Number.isFinite(dscrY1 as number),
    `DSCR Y1=${String(dscrY1)}`
  );
  check(
    "DSCR Y1 is non-zero (regression: was silently 0 before fix)",
    typeof dscrY1 === "number" && (dscrY1 as number) !== 0,
    `DSCR Y1=${String(dscrY1)}`
  );

  console.log(`\nDSCR guest-debt workbook: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test crashed:", err);
  process.exit(1);
});
