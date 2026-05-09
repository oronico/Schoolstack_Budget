/**
 * Task #484 regression test — single-year workbook shape.
 *
 * Task #476 made the Underwriting Package and Formula Workbook honor
 * `schoolProfile.modelDuration === "single_year"` by collapsing every
 * cell-write loop and column array down to one year. This test loads
 * both workbooks for a single-year fixture and asserts:
 *   (a) every yc-driven sheet's column count matches yc + offset, and
 *       in single-year mode no Y2-Y5 year columns leak through
 *   (b) the operating-statement / model tabs are renamed
 *       ("Year 1 Operating Stmt", "Year 1 Model")
 *   (c) cross-sheet refs (Dashboard cumNIRef, Balance Sheet osTab) point
 *       at sheet names that exist in the workbook (and the dropped
 *       five-year tab name does not appear in any cross-sheet ref)
 *   (d) the Cover / Table-of-Contents hyperlinks list the dynamic tab
 *       name (and not the variant for the other mode)
 *
 * Mirrored against a five-year fixture so a regression in either
 * direction trips the test.
 */
import ExcelJS from "exceljs";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { generateFormulaWorkbook } from "../src/lib/formula-export.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function withDuration(payload: typeof microschoolStartup, duration: "single_year" | "five_year") {
  return {
    ...payload,
    schoolProfile: { ...payload.schoolProfile, modelDuration: duration },
  };
}

function getSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find(ws => ws.name === name);
}

function collectFormulas(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value as unknown;
      if (v && typeof v === "object" && "formula" in (v as object)) {
        out.push(String((v as { formula: string }).formula));
      }
    });
  });
  return out;
}

function collectHyperlinkTargets(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value as unknown;
      if (v && typeof v === "object" && "hyperlink" in (v as object)) {
        out.push(String((v as { hyperlink: string }).hyperlink));
      }
    });
  });
  return out;
}

/**
 * Count the columns whose declared width matches the yc-driver value
 * (16 for most sheets, 14 for the Lender Snapshot trend block).
 * This isolates the yc-driven array from sibling fixed-shape blocks
 * (e.g. the Debt Schedule loan-terms columns) so that "Y2-Y5 dropped"
 * is asserted on the same array `Array(yc).fill(...)` produced.
 */
function countYearColumns(ws: ExcelJS.Worksheet, yearWidth: number): number {
  const cols = ws.columns ?? [];
  let n = 0;
  for (const c of cols) {
    if (c && (c as { width?: number }).width === yearWidth) n++;
  }
  return n;
}

/**
 * Sheets in the underwriting workbook whose `ws.columns` array is built
 * from `Array(yc).fill({ width: <yearWidth> })`. Asserting the count of
 * year-width columns equals yc covers Debt Schedule (which also has a
 * fixed loan-terms block) without false positives.
 */
const UNDERWRITING_YEAR_SHEETS: Array<{ name: (yc: number) => string; yearWidth: number }> = [
  { name: () => "Tuition & Funding", yearWidth: 16 },
  { name: () => "OpEx Drivers", yearWidth: 16 },
  { name: () => "Enrollment Tuition Fcst", yearWidth: 16 },
  { name: () => "Staffing Costs Fcst", yearWidth: 16 },
  { name: () => "Budget Detail", yearWidth: 16 },
  { name: () => "Budget Summary", yearWidth: 16 },
  { name: (yc) => yc === 1 ? "Year 1 Operating Stmt" : "5-Year Operating Stmt", yearWidth: 16 },
  { name: () => "Debt Schedule", yearWidth: 16 },
  { name: () => "Balance Sheet", yearWidth: 16 },
  { name: () => "DSCR & Covenants", yearWidth: 16 },
  { name: () => "Scenarios", yearWidth: 16 },
  // Lender Snapshot uses width:14 for its yc trend columns and a
  // separate fixed left-side label block (widths 28 / 30 / 4).
  { name: () => "Lender Snapshot", yearWidth: 14 },
];

/**
 * Sheets in the formula workbook whose `ws.columns` array depends on yc.
 * The formula export only has the model tab; the other generated sheets
 * (Assumptions, Year 1 Pro Forma, Actuals vs. Projections) are
 * intentionally fixed-shape regardless of `modelDuration`.
 */
const FORMULA_YEAR_SHEETS: Array<{ name: (yc: number) => string; yearWidth: number }> = [
  { name: (yc) => yc === 1 ? "Year 1 Model" : "5-Year Model", yearWidth: 16 },
];

/** Formula sheets that must NOT scale with yc (regression guard). */
const FORMULA_FIXED_SHEETS: Array<{ name: string; expectedColumnCount: number }> = [
  // Assumptions: fixed-shape header block (10 populated columns after
  // xlsx round-trip; widths array declares 11 but the trailing column
  // is never written to so it doesn't survive serialization).
  { name: "Assumptions", expectedColumnCount: 10 },
  // Year 1 Pro Forma: month-grid plus total → 14 cols regardless of yc.
  { name: "Year 1 Pro Forma", expectedColumnCount: 14 },
];

async function checkUnderwriting(label: string, payload: Record<string, unknown>, yc: number) {
  const wb = await generateUnderwritingWorkbook(payload);
  const opTab = yc === 1 ? "Year 1 Operating Stmt" : "5-Year Operating Stmt";
  const otherOpTab = yc === 1 ? "5-Year Operating Stmt" : "Year 1 Operating Stmt";

  // (b) Renamed operating-statement tab.
  check(`[${label}] underwriting has tab "${opTab}"`, !!getSheet(wb, opTab));
  check(`[${label}] underwriting does NOT have tab "${otherOpTab}"`, !getSheet(wb, otherOpTab));

  // (a) Every yc-driven sheet has exactly yc year-width columns.
  for (const spec of UNDERWRITING_YEAR_SHEETS) {
    const sheetName = spec.name(yc);
    const ws = getSheet(wb, sheetName);
    if (!ws) {
      check(`[${label}] underwriting sheet "${sheetName}" exists`, false);
      continue;
    }
    const actual = countYearColumns(ws, spec.yearWidth);
    check(
      `[${label}] underwriting "${sheetName}" has ${yc} year column(s)`,
      actual === yc,
      `actual=${actual} (yearWidth=${spec.yearWidth})`
    );
  }

  // (c) Balance Sheet cross-sheet refs to Operating Stmt resolve.
  // For yc=1 the cash-row formula collapses to the cumNI cell and emits
  // no extra Y2-Y5 NI references back to the operating tab; for yc=5
  // it emits four such refs (Year 2-Year 5).
  const bs = getSheet(wb, "Balance Sheet");
  if (bs) {
    const formulas = collectFormulas(bs);
    const refsOp = formulas.filter(f => f.includes(`'${opTab}'!`));
    const refsOther = formulas.filter(f => f.includes(`'${otherOpTab}'!`));
    if (yc === 1) {
      check(
        `[${label}] Balance Sheet single-year drops Y2-Y5 op-stmt refs`,
        refsOp.length === 0,
        `found ${refsOp.length} op-tab refs in single-year mode`
      );
    } else {
      check(
        `[${label}] Balance Sheet references "${opTab}"`,
        refsOp.length > 0,
        "no formulas reference the operating statement tab"
      );
    }
    check(
      `[${label}] Balance Sheet has no stale "${otherOpTab}" refs`,
      refsOther.length === 0,
      `found ${refsOther.length} stale refs`
    );
  }

  // (c) Dashboard cumNIRef sheetName resolves: any cross-sheet ref to
  // the operating tab in the Dashboard must point at the active tab,
  // never the dropped variant.
  const dashboard = wb.worksheets.find(ws => /dashboard/i.test(ws.name));
  if (dashboard) {
    const formulas = collectFormulas(dashboard);
    const stale = formulas.filter(f => f.includes(`'${otherOpTab}'!`));
    check(
      `[${label}] Dashboard has no stale cumNIRef to "${otherOpTab}"`,
      stale.length === 0,
      `found ${stale.length} stale refs`
    );
  }

  // (d) Cover Table-of-Contents lists the dynamic operating-stmt tab
  // and every TOC hyperlink target maps to a worksheet that exists in
  // the workbook (no orphaned ToC entries).
  const cover = getSheet(wb, "Cover");
  if (cover) {
    const targets = collectHyperlinkTargets(cover);
    check(
      `[${label}] Cover ToC links to "${opTab}"`,
      targets.some(t => t.includes(`'${opTab}'`)),
      "no Cover hyperlink found for active op-stmt tab"
    );
    check(
      `[${label}] Cover ToC has no stale link to "${otherOpTab}"`,
      !targets.some(t => t.includes(`'${otherOpTab}'`)),
      "stale ToC hyperlink remains"
    );
    const sheetNames = new Set(wb.worksheets.map(w => w.name));
    const orphans: string[] = [];
    for (const t of targets) {
      // Hyperlink format: "#'<sheet>'!A1"
      const m = t.match(/^#'([^']+)'!/);
      if (m && !sheetNames.has(m[1])) orphans.push(m[1]);
    }
    check(
      `[${label}] Cover ToC has no orphaned tab links`,
      orphans.length === 0,
      orphans.length ? `orphans: ${orphans.join(", ")}` : ""
    );
  } else {
    check(`[${label}] underwriting has Cover sheet`, false);
  }
}

async function checkFormula(label: string, payload: Record<string, unknown>, yc: number) {
  // The formula workbook is round-tripped through xlsx serialization to
  // exercise the same path the API hands to clients.
  const buf = await generateFormulaWorkbook(payload);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const modelTab = yc === 1 ? "Year 1 Model" : "5-Year Model";
  const otherModelTab = yc === 1 ? "5-Year Model" : "Year 1 Model";

  // (b) Renamed model tab.
  check(`[${label}] formula has tab "${modelTab}"`, !!getSheet(wb, modelTab));
  check(`[${label}] formula does NOT have tab "${otherModelTab}"`, !getSheet(wb, otherModelTab));

  // (a) Every yc-driven sheet has exactly yc + 1 populated columns.
  // Round-trip drops the explicit `ws.columns` width array, so use
  // `columnCount` (highest populated column) as the post-load signal.
  for (const spec of FORMULA_YEAR_SHEETS) {
    const sheetName = spec.name(yc);
    const ws = getSheet(wb, sheetName);
    if (!ws) {
      check(`[${label}] formula sheet "${sheetName}" exists`, false);
      continue;
    }
    const cc = ws.columnCount;
    check(
      `[${label}] formula "${sheetName}" populated columns = ${yc + 1}`,
      cc === yc + 1,
      `actual=${cc}`
    );
  }

  // (a-guard) Sheets that intentionally do NOT scale with yc must keep
  // the same column count in both modes — guards against a future
  // regression that wires modelDuration into the wrong sheet.
  for (const spec of FORMULA_FIXED_SHEETS) {
    const ws = getSheet(wb, spec.name);
    if (!ws) {
      check(`[${label}] formula fixed-shape sheet "${spec.name}" exists`, false);
      continue;
    }
    const cc = ws.columnCount;
    check(
      `[${label}] formula "${spec.name}" stays at ${spec.expectedColumnCount} columns`,
      cc === spec.expectedColumnCount,
      `actual=${cc}`
    );
  }

  // (c) cumNIRef sheetName resolves: any `'<modelTab>'!` formula in the
  // Dashboard must point at the model tab that actually exists; the
  // dropped variant must not appear after a single-year render.
  const dashboard = wb.worksheets.find(ws => /dashboard/i.test(ws.name));
  if (dashboard) {
    const formulas = collectFormulas(dashboard);
    const stale = formulas.filter(f => f.includes(`'${otherModelTab}'!`));
    check(
      `[${label}] formula Dashboard has no stale ref to "${otherModelTab}"`,
      stale.length === 0,
      `found ${stale.length} stale refs`
    );
    const live = formulas.filter(f => f.includes(`'${modelTab}'!`));
    check(
      `[${label}] formula Dashboard references "${modelTab}"`,
      live.length > 0,
      "no Dashboard formula points at active model tab"
    );
  }
}

async function main() {
  const single = withDuration(microschoolStartup, "single_year") as unknown as Record<string, unknown>;
  const five = withDuration(microschoolStartup, "five_year") as unknown as Record<string, unknown>;

  await checkUnderwriting("single_year", single, 1);
  await checkUnderwriting("five_year", five, 5);
  await checkFormula("single_year", single, 1);
  await checkFormula("five_year", five, 5);

  console.log(`\nSingle-year workbook shape: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test crashed:", err);
  process.exit(1);
});
