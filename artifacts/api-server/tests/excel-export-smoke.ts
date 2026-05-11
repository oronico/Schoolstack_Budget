// Task #553 — Excel export smoke test (CI gate).
// Task #563 — extended to exercise multiple fixture variants so single-year
// and no-debt builder branches are covered too (not just the original
// five-year + rows + debt path).
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
// What this test DOES cover for each export format × fixture variant:
//   1. The export builder runs end-to-end without throwing.
//   2. The serialized .xlsx buffer starts with the ZIP magic bytes "PK".
//   3. ExcelJS can re-parse the workbook (catches corrupt OOXML).
//   4. Every expected sheet name is present (variant-aware: e.g. the
//      underwriting workbook renames "5-Year Operating Stmt" to
//      "Year 1 Operating Stmt" when modelDuration === "single_year",
//      and the legacy export inserts a "Monthly Cash Flow" tab when
//      yearCount === 1).
//   5. Every sheet in the workbook has at least one populated cell
//      (catches "blank tab" regressions where a build step silently
//      drops its writes).
//
// Variant matrix:
//   - five_year_with_debt: the original microschoolStartup shape with a
//     loan in capitalAndDebtRows and debtIncluded:true. Exercises the
//     happy path with every conditional sheet present.
//   - single_year:         modelDuration === "single_year" + amounts
//     arrays truncated to length 1. Triggers
//     getYearCount() === 1 in underwriting/formula and the
//     amounts-length-driven yearCount === 1 branch in the legacy
//     export (which inserts a "Monthly Cash Flow" sheet).
//   - no_debt:             debtIncluded:false + capitalAndDebtRows
//     stripped of loans. Triggers underwriting's effectiveData filter
//     that drops loan rows from every downstream tab. The Debt Schedule
//     sheet itself is still emitted (header rows only) — this matches
//     current builder behavior, which always renders the tab so the
//     workbook layout stays stable.

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

type FixturePayload = Record<string, unknown>;

interface Variant {
  id: string;
  description: string;
  build: () => FixturePayload;
}

interface FormatSpec {
  label: string;
  // Expected sheets per variant id. Builder may add more (e.g. conditional
  // or future sheets) — those are fine. Missing any sheet in this list
  // fails the check.
  requiredSheetsByVariant: Record<string, string[]>;
  buildBuffer: (data: FixturePayload) => Promise<Buffer>;
}

// Deep clone of the base microschoolStartup fixture. The base has
// debtIncluded:false in schoolProfile but DOES include a loan in
// capitalAndDebtRows; the variants below normalize both fields together
// so each variant truly exercises its branch.
function cloneBase(): FixturePayload {
  return JSON.parse(JSON.stringify(microschoolStartup)) as FixturePayload;
}

function withFiveYearDebt(): FixturePayload {
  const data = cloneBase();
  const sp = data.schoolProfile as Record<string, unknown>;
  sp.modelDuration = "five_year";
  sp.debtIncluded = true;
  // Base fixture already carries a loan row; keep it to exercise the
  // debt-amortization path in every builder.
  return data;
}

function withSingleYear(): FixturePayload {
  const data = cloneBase();
  const sp = data.schoolProfile as Record<string, unknown>;
  sp.modelDuration = "single_year";
  sp.debtIncluded = true;

  // The legacy export's yearCount is detected from the FIRST row's
  // amounts.length (excel-export.ts ~L1290) rather than from
  // modelDuration. Truncate every row's amounts to length 1 so the
  // legacy builder also takes its single-year path (which inserts a
  // "Monthly Cash Flow" sheet between Financial Model and Summary).
  const truncate = (rows: unknown): void => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (Array.isArray(r.amounts)) r.amounts = [r.amounts[0] ?? 0];
    }
  };
  truncate(data.revenueRows);
  truncate(data.staffingRows);
  truncate(data.expenseRows);
  truncate(data.capitalAndDebtRows);

  // Mirror the truncation in the schoolProfile-level annual arrays the
  // builders sometimes consult.
  if (Array.isArray(sp.spedCount)) sp.spedCount = [(sp.spedCount as number[])[0] ?? 0];
  if (Array.isArray(sp.ellCount)) sp.ellCount = [(sp.ellCount as number[])[0] ?? 0];
  if (Array.isArray(sp.ecoDisCount)) sp.ecoDisCount = [(sp.ecoDisCount as number[])[0] ?? 0];

  return data;
}

function withNoDebt(): FixturePayload {
  const data = cloneBase();
  const sp = data.schoolProfile as Record<string, unknown>;
  sp.modelDuration = "five_year";
  sp.debtIncluded = false;
  // Strip every loan row so underwriting's effectiveData filter (which
  // drops isLoan rows when debtIncluded === false) actually has nothing
  // to fall back on. Non-loan capital expenditure rows would normally be
  // preserved; the base fixture only carries loan rows here so we end up
  // with an empty array, which is the realistic "no debt" shape.
  data.capitalAndDebtRows = [];
  return data;
}

const VARIANTS: Variant[] = [
  {
    id: "five_year_with_debt",
    description: "5-year mode, rows populated, debtIncluded:true",
    build: withFiveYearDebt,
  },
  {
    id: "single_year",
    description: "modelDuration=single_year, amounts truncated to length 1",
    build: withSingleYear,
  },
  {
    id: "no_debt",
    description: "debtIncluded:false, no loans in capitalAndDebtRows",
    build: withNoDebt,
  },
];

// Sheet lists shared across multiple variants are extracted to keep the
// matrix readable. "Capital & Debt" is a sheet name in the legacy export
// (always emitted by the row-aware branch regardless of debtIncluded).
const LEGACY_BASE_SHEETS = [
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
];
// Legacy single-year mode inserts a "Monthly Cash Flow" tab between
// Financial Model and Summary (excel-export.ts ~L1339).
const LEGACY_SINGLE_YEAR_SHEETS = [...LEGACY_BASE_SHEETS, "Monthly Cash Flow"];

const FORMULA_FIVE_YEAR_SHEETS = [
  "Instructions",
  "Assumptions",
  "5-Year Model",
  "Year 1 Pro Forma",
  "Decision History",
  "Financial Health",
];
const FORMULA_SINGLE_YEAR_SHEETS = [
  "Instructions",
  "Assumptions",
  "Year 1 Model", // operatingTabName(1) collapses "5-Year Model"
  "Year 1 Pro Forma",
  "Decision History",
  "Financial Health",
];

const LENDER_SHEETS = [
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
];

// Underwriting V2 tab list from getTabNames(yc) + the always-on
// Financial Health (added by addDashboardSheet) and Decision History
// (added at the very end). The Debt Schedule sheet is intentionally kept
// in the no-debt expectation list because buildDebtSchedule unconditionally
// adds the worksheet and writes its header block — only the loan content
// is filtered out when debtIncluded === false.
const UNDERWRITING_FIVE_YEAR_SHEETS = [
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
];
const UNDERWRITING_SINGLE_YEAR_SHEETS = UNDERWRITING_FIVE_YEAR_SHEETS.map((n) =>
  n === "5-Year Operating Stmt" ? "Year 1 Operating Stmt" : n,
);

const FORMATS: FormatSpec[] = [
  {
    label: "Legacy 5-year workbook (excel-export.ts)",
    buildBuffer: async (data) => generateLegacyWorkbook(data),
    requiredSheetsByVariant: {
      five_year_with_debt: LEGACY_BASE_SHEETS,
      single_year: LEGACY_SINGLE_YEAR_SHEETS,
      no_debt: LEGACY_BASE_SHEETS,
    },
  },
  {
    label: "Formula workbook (formula-export.ts)",
    buildBuffer: async (data) => generateFormulaWorkbook(data),
    requiredSheetsByVariant: {
      five_year_with_debt: FORMULA_FIVE_YEAR_SHEETS,
      single_year: FORMULA_SINGLE_YEAR_SHEETS,
      no_debt: FORMULA_FIVE_YEAR_SHEETS,
    },
  },
  {
    label: "Lender Pro Forma workbook (lender-proforma-export.ts)",
    buildBuffer: async (data) => generateLenderProFormaWorkbook(data),
    // Lender pro forma does not branch on modelDuration or debtIncluded
    // — the same sheet set is emitted regardless.
    requiredSheetsByVariant: {
      five_year_with_debt: LENDER_SHEETS,
      single_year: LENDER_SHEETS,
      no_debt: LENDER_SHEETS,
    },
  },
  {
    label: "Underwriting V2 workbook (underwriting-workbook.ts)",
    buildBuffer: async (data) => {
      // generateUnderwritingWorkbook returns an ExcelJS.Workbook (not a
      // Buffer) so the route layer can attach computedFlags. Serialize
      // here so the smoke test exercises the same write path Excel sees.
      const wb = await generateUnderwritingWorkbook(data, []);
      const ab = await wb.xlsx.writeBuffer();
      return Buffer.from(ab);
    },
    requiredSheetsByVariant: {
      five_year_with_debt: UNDERWRITING_FIVE_YEAR_SHEETS,
      single_year: UNDERWRITING_SINGLE_YEAR_SHEETS,
      no_debt: UNDERWRITING_FIVE_YEAR_SHEETS,
    },
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

async function smokeFormatVariant(spec: FormatSpec, variant: Variant): Promise<void> {
  console.log(`\n— ${spec.label} [${variant.id}] —`);

  let buf: Buffer;
  try {
    buf = await spec.buildBuffer(variant.build());
  } catch (err) {
    check(`[${variant.id}] builder runs without throwing`, false, (err as Error).message);
    return;
  }
  check(`[${variant.id}] builder runs without throwing`, true);

  check(
    `[${variant.id}] buffer starts with ZIP magic 'PK'`,
    buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b,
    `got first bytes ${buf.subarray(0, 4).toString("hex")}, length ${buf.length}`,
  );
  check(
    `[${variant.id}] buffer is non-trivial in size (> 1KB)`,
    buf.length > 1024,
    `got ${buf.length} bytes`,
  );

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch (err) {
    check(`[${variant.id}] ExcelJS can re-parse the generated workbook`, false, (err as Error).message);
    return;
  }
  check(`[${variant.id}] ExcelJS can re-parse the generated workbook`, true);

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const required = spec.requiredSheetsByVariant[variant.id];
  if (!required) {
    check(`[${variant.id}] required sheet list is defined for this variant`, false);
    return;
  }
  for (const name of required) {
    check(
      `[${variant.id}] workbook contains expected sheet "${name}"`,
      sheetNames.includes(name),
      `available: ${JSON.stringify(sheetNames)}`,
    );
  }

  // Every sheet — including any not in requiredSheets — must have at
  // least one populated cell. A blank sheet usually means a build step
  // silently bailed out without writing its rows.
  for (const ws of wb.worksheets) {
    check(
      `[${variant.id}] sheet "${ws.name}" has at least one populated cell`,
      hasPopulatedCell(ws),
      `rowCount=${ws.rowCount}, columnCount=${ws.columnCount}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("=== Excel Export Smoke Test (no DB / no HTTP) ===");
  console.log(`Variants: ${VARIANTS.map((v) => v.id).join(", ")}`);

  for (const spec of FORMATS) {
    for (const variant of VARIANTS) {
      await smokeFormatVariant(spec, variant);
    }
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
