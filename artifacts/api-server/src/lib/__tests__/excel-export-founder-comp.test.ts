/**
 * Task #700 — Lock in the founder-pay Excel breakdown with an export test.
 *
 * The Excel export now writes a dedicated "FOUNDER COMPENSATION" section
 * to the Staffing & Personnel tab and a memo block to the Financial Model
 * (P&L) tab. Without coverage, a future refactor of `buildStaffingTab` /
 * `buildPnLTab` could silently drop them. This test:
 *
 *   1. Renders a workbook from a model with a founder row + per-year
 *      reported / normalized series and asserts the Staffing tab has the
 *      labeled "FOUNDER COMPENSATION" section with the expected per-year
 *      values + 5-year totals.
 *   2. Asserts the "not paying yet" note appears (and reported values are
 *      $0 across all years) when `staffing.notPayingFounderYet` is true.
 *   3. Asserts the P&L memo block matches `computeFounderCompNormalization`
 *      for the same model.
 */
import ExcelJS from "exceljs";
import { computeFounderCompNormalization } from "@workspace/finance";
import { generateWorkbook } from "../excel-export.js";

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

/** Pull a numeric value from a cell, whether it's a literal number or a
 *  formula cell whose `result` carries the cached value. */
function cellNumber(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function cellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

/** Find the first row whose column-1 string starts with `prefix`. */
function findRowStarting(ws: ExcelJS.Worksheet, prefix: string): number {
  let found = -1;
  ws.eachRow((row, rowNumber) => {
    if (found > 0) return;
    const v = row.getCell(1).value as unknown;
    const s = typeof v === "string" ? v : (v == null ? "" : String(v));
    if (s.startsWith(prefix)) found = rowNumber;
  });
  return found;
}

// --- Fixture --------------------------------------------------------------
// 5-year microschool with explicit per-year reported + normalized founder
// comp arrays so the math is fully pinned (no benchmark fallback). The
// founder row carries explicit benefits + payroll-tax rates so the loaded
// values are deterministic.
function baseFixture(): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Test Microschool",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      openingYear: 2026,
    },
    enrollment: { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
    revenueRows: [
      { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [12000, 12000, 12000, 12000, 12000] },
    ],
    staffing: {
      benefitsRate: 20,
      payrollTaxRate: 7.65,
      // Per-year founder comp series — the founder is paying themselves
      // below market in years 1-2 (sweat equity), catching up in 3-5.
      reportedFounderComp: [40000, 50000, 60000, 70000, 80000],
      normalizedFounderComp: [80000, 85000, 90000, 95000, 100000],
    },
    staffingRows: [
      {
        id: "s1",
        roleName: "Founder / Head of School",
        functionCategory: "school_leadership",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: 40000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 7.65,
        payrollLike: false,
      },
      {
        id: "s2",
        roleName: "Lead Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: 45000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 7.65,
        payrollLike: false,
      },
    ],
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [2500, 2500, 2500, 2500, 2500] },
    ],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
  };
}

function notPayingYetFixture(): Record<string, unknown> {
  const base = baseFixture();
  const st = base.staffing as Record<string, unknown>;
  st.notPayingFounderYet = true;
  // Reported is forced to all-zero by the helper when notPayingYet is set,
  // but we also blank the input to make the test intent explicit.
  st.reportedFounderComp = [0, 0, 0, 0, 0];
  st.normalizedFounderComp = [80000, 85000, 90000, 95000, 100000];
  return base;
}

// Local alias matches the parameter shape of `wb.xlsx.load` after lib
// upgrades widened the global Buffer's backing-store generic; lets us call
// `load()` without a per-callsite cast.
type AnyBuffer = Parameters<ExcelJS.Xlsx["load"]>[0];

async function loadWorkbook(data: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  const buf = await generateWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as AnyBuffer);
  return wb;
}

// === Case 1: Staffing tab "FOUNDER COMPENSATION" section ==================
async function runCase1(): Promise<void> {
  console.log("\nCase 1: Staffing tab founder-comp section");
  const data = baseFixture();
  const yearCount = 5;
  const fc = computeFounderCompNormalization(data as never, yearCount);
  const wb = await loadWorkbook(data);

  const staffWs = wb.getWorksheet("Staffing & Personnel");
  check("Staffing & Personnel sheet exists", !!staffWs);
  if (!staffWs) return;

  const headerRow = findRowStarting(staffWs, "FOUNDER COMPENSATION");
  check("'FOUNDER COMPENSATION' section header is present", headerRow > 0);
  if (headerRow <= 0) return;

  const totalCol = yearCount + 2; // 7 for 5-year
  check(
    "section header carries '5-Year Total' label in the total column",
    cellString(staffWs, headerRow, totalCol) === "5-Year Total",
  );

  // Layout (mirrors buildStaffingTab):
  //   header
  //   +1: Founder Compensation (as planned)
  //   +2:   Fully-loaded (incl. benefits + payroll tax)  [reported]
  //   +3: Founder Compensation (market rate, normalized)
  //   +4:   Fully-loaded (incl. benefits + payroll tax)  [normalized]
  //   +5: Lender Normalization Adjustment (market - planned)  [bold]
  const rows: Array<{ offset: number; label: string; values: number[] }> = [
    { offset: 1, label: "Founder Compensation (as planned)", values: fc.reported },
    { offset: 2, label: "  Fully-loaded (incl. benefits + payroll tax)", values: fc.reportedLoaded },
    { offset: 3, label: "Founder Compensation (market rate, normalized)", values: fc.normalized },
    { offset: 4, label: "  Fully-loaded (incl. benefits + payroll tax)", values: fc.normalizedLoaded },
    { offset: 5, label: "Lender Normalization Adjustment (market - planned)", values: fc.delta },
  ];

  for (const row of rows) {
    const r = headerRow + row.offset;
    check(
      `Staffing row "${row.label.trim()}" label`,
      cellString(staffWs, r, 1) === row.label,
      `got "${cellString(staffWs, r, 1)}"`,
    );
    let expectedTotal = 0;
    for (let y = 0; y < yearCount; y++) {
      const got = cellNumber(staffWs, r, y + 2);
      const want = Math.round(row.values[y] || 0);
      expectedTotal += want;
      check(
        `Staffing "${row.label.trim()}" Y${y + 1} = ${want}`,
        got === want,
        `got ${got}`,
      );
    }
    const totalGot = cellNumber(staffWs, r, totalCol);
    check(
      `Staffing "${row.label.trim()}" 5-year total = ${expectedTotal}`,
      totalGot === expectedTotal,
      `got ${totalGot}`,
    );
  }

  // Note row is the row immediately after the last data row.
  const noteRow = headerRow + 6;
  const note = cellString(staffWs, noteRow, 1);
  check(
    "Sweat-equity note appears (reported < market)",
    note.startsWith("Note:") && note.includes("sweat equity"),
    `got "${note}"`,
  );
}

// === Case 2: "not paying yet" note + zero reported series =================
async function runCase2(): Promise<void> {
  console.log("\nCase 2: notPayingFounderYet → zero reported + 'not paying yet' note");
  const data = notPayingYetFixture();
  const yearCount = 5;
  const wb = await loadWorkbook(data);

  const staffWs = wb.getWorksheet("Staffing & Personnel");
  check("Staffing & Personnel sheet exists", !!staffWs);
  if (!staffWs) return;

  const headerRow = findRowStarting(staffWs, "FOUNDER COMPENSATION");
  check("'FOUNDER COMPENSATION' section is still rendered when not-paying-yet", headerRow > 0);
  if (headerRow <= 0) return;

  // Reported (offset +1) and reportedLoaded (offset +2) must be all-zero.
  const totalCol = yearCount + 2;
  for (const offset of [1, 2]) {
    const r = headerRow + offset;
    let allZero = true;
    for (let y = 0; y < yearCount; y++) {
      if (cellNumber(staffWs, r, y + 2) !== 0) { allZero = false; break; }
    }
    check(`Reported row at offset +${offset} is all-zero`, allZero);
    check(
      `Reported row at offset +${offset} 5-year total is 0`,
      cellNumber(staffWs, r, totalCol) === 0,
    );
  }

  // Normalized rows (offsets +3, +4) must be > 0 in at least one year.
  const normRow = headerRow + 4;
  let normTotal = 0;
  for (let y = 0; y < yearCount; y++) normTotal += cellNumber(staffWs, normRow, y + 2);
  check("Normalized loaded series is non-zero (lender market-rate line)", normTotal > 0);

  const noteRow = headerRow + 6;
  const note = cellString(staffWs, noteRow, 1);
  check(
    "'not paying yet' note appears verbatim",
    note.startsWith("Note:") && note.includes('"not paying yet"'),
    `got "${note}"`,
  );
}

// === Case 3: P&L memo block matches computeFounderCompNormalization ======
async function runCase3(): Promise<void> {
  console.log("\nCase 3: P&L memo block matches computeFounderCompNormalization");
  const data = baseFixture();
  const yearCount = 5;
  const fc = computeFounderCompNormalization(data as never, yearCount);
  const wb = await loadWorkbook(data);

  const pnlWs = wb.getWorksheet("Financial Model");
  check("Financial Model sheet exists", !!pnlWs);
  if (!pnlWs) return;

  const headerRow = findRowStarting(pnlWs, "FOUNDER COMPENSATION (memo");
  check("P&L 'FOUNDER COMPENSATION (memo …)' header is present", headerRow > 0);
  if (headerRow <= 0) return;

  const totalCol = yearCount + 2;
  check(
    "P&L memo header carries '5-Year Total' in total column",
    cellString(pnlWs, headerRow, totalCol) === "5-Year Total",
  );

  // Memo layout (mirrors buildPnLTab):
  //   +1: "  Founder compensation (as planned)"           → fc.reportedLoaded
  //   +2: "  Founder compensation (market rate, normalized)" → fc.normalizedLoaded
  //   +3: "  Lender Normalization Adjustment (market - planned)" → fc.delta (bold)
  const rows: Array<{ offset: number; label: string; values: number[] }> = [
    { offset: 1, label: "  Founder compensation (as planned)", values: fc.reportedLoaded },
    { offset: 2, label: "  Founder compensation (market rate, normalized)", values: fc.normalizedLoaded },
    { offset: 3, label: "  Lender Normalization Adjustment (market - planned)", values: fc.delta },
  ];

  for (const row of rows) {
    const r = headerRow + row.offset;
    check(
      `P&L memo "${row.label.trim()}" label`,
      cellString(pnlWs, r, 1) === row.label,
      `got "${cellString(pnlWs, r, 1)}"`,
    );
    let expectedTotal = 0;
    for (let y = 0; y < yearCount; y++) {
      const got = cellNumber(pnlWs, r, y + 2);
      const want = Math.round(row.values[y] || 0);
      expectedTotal += want;
      check(
        `P&L memo "${row.label.trim()}" Y${y + 1} = ${want}`,
        got === want,
        `got ${got}`,
      );
    }
    const totalGot = cellNumber(pnlWs, r, totalCol);
    check(
      `P&L memo "${row.label.trim()}" 5-year total = ${expectedTotal}`,
      totalGot === expectedTotal,
      `got ${totalGot}`,
    );
  }
}

async function main(): Promise<void> {
  await runCase1();
  await runCase2();
  await runCase3();

  console.log(`\nfounder-comp Excel export: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("founder-comp Excel export: unexpected error", err);
  process.exit(1);
});
