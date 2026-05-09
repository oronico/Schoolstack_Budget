// Task #553 — Excel export smoke test (CI gate).
//
// Mirrors the migration-check.yml pattern for database migrations: a fast,
// no-DB-required smoke test that exercises every Excel export builder
// directly. The intent is to catch broken workbooks (corrupt sheets,
// missing tabs, ExcelJS write errors) on the PR check itself, before the
// founder downloads a file that fails to open in Excel.
//
// What this test does NOT cover (intentionally):
//   - HTTP/route layer, auth, exports/events DB rows, flag gating —
//     that's already in tests/excel-export-routes.ts (which requires a
//     live Postgres + JWT_SECRET and is therefore unsuitable for the
//     no-services CI lane this test runs in).
//   - Numerical correctness of the model math — covered by the parity,
//     cross-engine, and golden-model tests.
//
// What this test DOES cover for each of the four export formats
// (Formula, Lender Pro Forma, Underwriting V2, Legacy):
//   1. The export builder runs end-to-end without throwing.
//   2. The serialized .xlsx buffer starts with the ZIP magic bytes "PK".
//   3. ExcelJS can re-parse the workbook (catches corrupt OOXML).
//   4. Every expected sheet name is present.
//   5. Every sheet in the workbook has at least one populated cell
//      (catches "blank tab" regressions where a build step silently
//      drops its writes).
//
// The four format constants below are the *expected* sheet names that
// the corresponding builder ALWAYS writes for the microschoolStartup
// fixture. Conditional sheets (e.g. "Actuals vs. Projections", which
// only appears when prior-year snapshot data is present) are excluded
// from the required-set on purpose so the test stays stable as those
// optional features evolve.

import ExcelJS from "exceljs";
import { generateWorkbook as generateLegacyWorkbook } from "../src/lib/excel-export.js";
import { generateFormulaWorkbook } from "../src/lib/formula-export.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

interface FormatSpec {
  label: string;
  build: () => Promise<Buffer>;
  // Sheets that MUST exist in the output. The builder may add more
  // (e.g. conditional or future sheets) — those are fine. Missing any
  // sheet in this list fails the check.
  requiredSheets: string[];
}

// The microschoolStartup fixture has revenueRows/staffingRows/expenseRows
// populated, no priorYearSnapshot, and no currentYearProjection. That
// means the row-aware branches of every builder fire and the
// "Actuals vs. Projections" / "Prior-Year Snapshot" sheets do not
// (matching what most founders will produce on a brand-new model).
function fixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(microschoolStartup));
}

const FORMATS: FormatSpec[] = [
  {
    label: "Legacy 5-year workbook (excel-export.ts)",
    build: async () => generateLegacyWorkbook(fixture()),
    // Sheets always emitted by the row-aware branch of generateWorkbook
    // (excel-export.ts ~L855-L893) plus the always-on Decision History,
    // Cover, and Financial Health additions at the end of the function.
    requiredSheets: [
      "Assumptions",
      "Revenue Schedule",
      "Staffing & Personnel",
      "Operating Expenses",
      "Capital & Debt",
      "Financial Model",
      "Summary",
      "Decision History",
      "Cover",
      "Financial Health",
    ],
  },
  {
    label: "Formula workbook (formula-export.ts)",
    build: async () => generateFormulaWorkbook(fixture()),
    // Always-on sheets emitted by generateFormulaWorkbook. The optional
    // "Actuals vs. Projections" sheet is intentionally excluded — it only
    // appears when prior-year or current-year snapshot data is present.
    requiredSheets: [
      "Instructions",
      "Assumptions",
      "5-Year Model",
      "Year 1 Pro Forma",
      "Decision History",
      "Financial Health",
    ],
  },
  {
    label: "Lender Pro Forma workbook (lender-proforma-export.ts)",
    build: async () => generateLenderProFormaWorkbook(fixture()),
    // Sheets emitted in order by generateLenderProFormaWorkbook (see
    // lender-proforma-export.ts ~L1683-L1724).
    requiredSheets: [
      "Instructions",
      "Cover",
      "Assumptions",
      "Drivers",
      "5-Year P&L",
      "Cash Flow & DSCR",
      "Staffing",
      "Loan Snapshot",
      "Summary",
      "Decision History",
      "Financial Health",
    ],
  },
  {
    label: "Underwriting V2 workbook (underwriting-workbook.ts)",
    build: async () => {
      // generateUnderwritingWorkbook returns an ExcelJS.Workbook (not a
      // Buffer) so the route layer can attach computedFlags. Serialize
      // here so the smoke test exercises the same write path Excel sees.
      const wb = await generateUnderwritingWorkbook(fixture(), []);
      const ab = await wb.xlsx.writeBuffer();
      return Buffer.from(ab);
    },
    // The 22 named tabs from underwriting-workbook.ts getTabNames() for a
    // 5-year model (microschoolStartup defaults to five_year mode). The
    // 23rd tab from getTabNames ("Financial Health") is added by
    // addDashboardSheet, and Decision History is added at the very end.
    requiredSheets: [
      "Instructions",
      "Cover",
      "Assumptions",
      "Program Profile",
      "Enrollment Drivers",
      "Tuition & Funding",
      "Staffing Drivers",
      "OpEx Drivers",
      "Capital Stack",
      "Enrollment Tuition Fcst",
      "Staffing Costs Fcst",
      "Budget Detail",
      "Budget Summary",
      "Monthly Cash Flow Y1",
      "5-Year Operating Stmt",
      "Debt Schedule",
      "Balance Sheet",
      "DSCR & Covenants",
      "Sources & Uses",
      "Scenarios",
      "Lender Snapshot",
      "Budget Narrative",
      "Financial Health",
      "Decision History",
    ],
  },
];

function hasPopulatedCell(ws: ExcelJS.Worksheet): boolean {
  let found = false;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (found) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (found) return;
      const v = cell.value;
      if (v === null || v === undefined) return;
      if (typeof v === "string" && v.length === 0) return;
      // ExcelJS represents formulas as { formula: "...", result: ... } and
      // rich text as { richText: [...] }; both count as "populated".
      found = true;
    });
  });
  return found;
}

async function smokeFormat(spec: FormatSpec): Promise<void> {
  console.log(`\n— ${spec.label} —`);

  let buf: Buffer;
  try {
    buf = await spec.build();
  } catch (err) {
    check("builder runs without throwing", false, (err as Error).message);
    return;
  }
  check("builder runs without throwing", true);

  check(
    "buffer starts with ZIP magic 'PK'",
    buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b,
    `got first bytes ${buf.subarray(0, 4).toString("hex")}, length ${buf.length}`,
  );
  check("buffer is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch (err) {
    check("ExcelJS can re-parse the generated workbook", false, (err as Error).message);
    return;
  }
  check("ExcelJS can re-parse the generated workbook", true);

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  for (const required of spec.requiredSheets) {
    check(
      `workbook contains expected sheet "${required}"`,
      sheetNames.includes(required),
      `available: ${JSON.stringify(sheetNames)}`,
    );
  }

  // Every sheet — including any not in requiredSheets — must have at
  // least one populated cell. A blank sheet usually means a build step
  // silently bailed out without writing its rows.
  for (const ws of wb.worksheets) {
    check(
      `sheet "${ws.name}" has at least one populated cell`,
      hasPopulatedCell(ws),
      `rowCount=${ws.rowCount}, columnCount=${ws.columnCount}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("=== Excel Export Smoke Test (no DB / no HTTP) ===");

  for (const spec of FORMATS) {
    await smokeFormat(spec);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
