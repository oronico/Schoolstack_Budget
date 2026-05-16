/**
 * Task #862 — Workbook Accuracy Fixes regression test.
 *
 * Locks in the audit-found math/formula corrections for the V2
 * underwriting workbook and the Lender Pro Forma workbook so a future
 * refactor cannot silently regress them. Each case maps 1:1 to a
 * numbered audit issue:
 *
 *   Issue 2  — Scholarship sign normalization (abs(val) * sign)
 *              on `Enrollment Tuition Fcst` and `Tuition & Funding`.
 *   Issue 4  — Lender PF Summary!C13 Net Margin references the
 *              dynamic Net Income row on `5-Year P&L`, not the
 *              hard-coded G21 (which is the Principal row).
 *   Issue 5  — Lender PF Net Income = NOI − Interest only; principal
 *              repayments are a balance-sheet movement, not a P&L
 *              expense.
 *   Issue 6  — Lender PF Interest Expense uses CUMIPMT against the
 *              Assumptions inputs (D59 amount / D60 rate / D61 term).
 *   Issue 12 — DSCR & Covenants capacity threshold normalizes
 *              fraction-vs-percent inputs (a stored "75" must render
 *              as "Capacity ≥ 75%", not 7500%).
 */
import ExcelJS from "exceljs";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

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

function cellFormula(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value as unknown;
  if (v && typeof v === "object" && "formula" in (v as object)) {
    return String((v as { formula: unknown }).formula ?? "");
  }
  return "";
}

function cellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function findRowByLabel(ws: ExcelJS.Worksheet, label: string, labelCol = 1): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found > 0) return;
    if (cellString(ws, n, labelCol) === label) found = n;
  });
  return found;
}

function findRowStarting(ws: ExcelJS.Worksheet, prefix: string): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found > 0) return;
    if (cellString(ws, n, 1).startsWith(prefix)) found = n;
  });
  return found;
}

type AnyBuffer = Parameters<ExcelJS.Xlsx["load"]>[0];

async function loadV2(data: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  const wb = await generateUnderwritingWorkbook(data);
  const buf = await wb.xlsx.writeBuffer();
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buf as unknown as AnyBuffer);
  return out;
}

async function loadLenderPF(data: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  const buf = await generateLenderProFormaWorkbook(data);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buf as unknown as AnyBuffer);
  return out;
}

// ---------- Case 1: Scholarship sign on V2 (Issue 2) ----------------------
async function caseScholarshipSign(): Promise<void> {
  // microschoolStartup carries r5 = tuition_offsets / percent_of_base 10%
  // (positive 10 stored). After the fix the rendered Y1 value must be
  // negative on both Enrollment Tuition Fcst and Tuition & Funding.
  const wb = await loadV2(microschoolStartup as unknown as Record<string, unknown>);

  const etf = wb.getWorksheet("Enrollment Tuition Fcst");
  check("Enrollment Tuition Fcst sheet exists", !!etf);
  if (etf) {
    const r = findRowByLabel(etf, "Scholarship Discount");
    check("Scholarship Discount row found on Enrollment Tuition Fcst", r > 0);
    if (r > 0) {
      const y1 = cellNumber(etf, r, 2);
      check(
        "Scholarship Y1 is negative on Enrollment Tuition Fcst",
        y1 < 0,
        `got ${y1}`,
      );
    }
  }

  const tf = wb.getWorksheet("Tuition & Funding");
  check("Tuition & Funding sheet exists", !!tf);
  if (tf) {
    const r = findRowByLabel(tf, "Scholarship Discount");
    check("Scholarship Discount row found on Tuition & Funding", r > 0);
    if (r > 0) {
      const y1 = cellNumber(tf, r, 2);
      check(
        "Scholarship Y1 is negative on Tuition & Funding",
        y1 < 0,
        `got ${y1}`,
      );
    }
  }
}

// ---------- Case 1b: Scholarship reduces Grand Total Revenue --------------
async function caseScholarshipFlowsToGrandTotal(): Promise<void> {
  // Build two scenarios — one with the 10% scholarship row and one without.
  // The "with" Y1 Tuition & Funding GRAND TOTAL REVENUE must be strictly
  // less than the "without" total, proving the negative discount actually
  // flows into the rolled-up totals.
  const base = microschoolStartup as unknown as Record<string, unknown>;
  const withRows = base.revenueRows as Array<Record<string, unknown>>;
  const withoutScholarship = {
    ...base,
    revenueRows: withRows.filter(r => r.category !== "tuition_offsets"),
  };

  const wbWith = await loadV2(base);
  const wbWithout = await loadV2(withoutScholarship);

  for (const tabName of ["Tuition & Funding", "Enrollment Tuition Fcst"]) {
    const wsW = wbWith.getWorksheet(tabName);
    const wsN = wbWithout.getWorksheet(tabName);
    if (!wsW || !wsN) {
      check(`${tabName} exists in both fixtures`, false);
      continue;
    }
    const totalLabel = tabName === "Tuition & Funding" ? "GRAND TOTAL REVENUE" : "TOTAL REVENUE";
    const rowW = findRowStarting(wsW, totalLabel);
    const rowN = findRowStarting(wsN, totalLabel);
    if (rowW <= 0 || rowN <= 0) {
      check(`${tabName} ${totalLabel} row found`, false);
      continue;
    }
    // The label row is a section header; the actual total values sit on
    // the next row in the workbook layout.
    const tryRows = [rowW, rowW + 1];
    let yWith = 0;
    for (const r of tryRows) {
      const v = cellNumber(wsW, r, 2);
      if (v > 0) { yWith = v; break; }
    }
    const tryRowsN = [rowN, rowN + 1];
    let yWithout = 0;
    for (const r of tryRowsN) {
      const v = cellNumber(wsN, r, 2);
      if (v > 0) { yWithout = v; break; }
    }
    check(
      `${tabName}: Y1 total without scholarship is positive`,
      yWithout > 0,
      `got ${yWithout}`,
    );
    check(
      `${tabName}: Y1 total WITH 10% scholarship < total WITHOUT it`,
      yWith > 0 && yWith < yWithout,
      `with=${yWith}, without=${yWithout}`,
    );
  }
}

// ---------- Case 1c: Cross-tab Y1 revenue parity (V2) ---------------------
async function caseCrossTabY1RevenueParity(): Promise<void> {
  const wb = await loadV2(microschoolStartup as unknown as Record<string, unknown>);

  // Source of truth: Operating Statement "Total Revenue" row, Y1 column.
  const opStmt = wb.getWorksheet("Year 1 Operating Stmt")
    || wb.getWorksheet("5-Year Operating Stmt");
  check("Operating Statement sheet exists", !!opStmt);
  if (!opStmt) return;
  const opRow = findRowByLabel(opStmt, "Total Revenue");
  check("Operating Statement Total Revenue row found", opRow > 0);
  if (opRow <= 0) return;
  const truth = cellNumber(opStmt, opRow, 2);
  check("Operating Statement Y1 revenue > 0 (sample is sane)", truth > 0, `got ${truth}`);

  // Compare against other tabs that should match the same Y1 total.
  const checks: Array<[string, string, number]> = [
    ["Budget Summary", "Total Revenue", 0],
    ["Budget Detail", "Total Revenue", 0],
    ["DSCR & Covenants", "Revenue", 0],
  ];
  for (const [tab, label] of checks) {
    const ws = wb.getWorksheet(tab);
    if (!ws) {
      check(`${tab} sheet exists`, false);
      continue;
    }
    const row = findRowByLabel(ws, label);
    if (row <= 0) {
      check(`${tab} "${label}" row found`, false);
      continue;
    }
    const v = cellNumber(ws, row, 2);
    check(
      `${tab} Y1 revenue ties to Operating Statement (${truth})`,
      Math.abs(v - truth) <= 2,
      `${tab}=${v}, OpStmt=${truth}`,
    );
  }

  // Scenarios tab: the Base Case row's Y1 Revenue must match canonical
  // (it applies 0% adjustments to revByYear[0]).
  const scen = wb.getWorksheet("Scenarios");
  if (scen) {
    // Find the "BASE CASE" header row, then the next "Revenue" row beneath.
    let baseRow = 0;
    for (let r = 1; r <= scen.rowCount; r++) {
      const v = String(scen.getCell(r, 1).value ?? "").toUpperCase();
      if (v === "BASE CASE") { baseRow = r; break; }
    }
    if (baseRow > 0) {
      let revRow = 0;
      for (let r = baseRow; r <= Math.min(baseRow + 12, scen.rowCount); r++) {
        if (String(scen.getCell(r, 1).value ?? "").trim() === "Revenue") { revRow = r; break; }
      }
      if (revRow > 0) {
        const v = cellNumber(scen, revRow, 2);
        check(
          `Scenarios Base Case Y1 Revenue ties to Operating Statement (${truth})`,
          Math.abs(v - truth) <= 2,
          `Scenarios=${v}, OpStmt=${truth}`,
        );
      } else {
        check("Scenarios Base Case Revenue row found", false);
      }
    } else {
      check("Scenarios BASE CASE section found", false);
    }
  }

  // Monthly Cash Flow Y1: sum of months 1..12 in the "Total Revenue" row
  // should equal the canonical Y1 revenue (within rounding).
  const mcf = wb.getWorksheet("Monthly Cash Flow Y1");
  if (mcf) {
    const row = findRowByLabel(mcf, "Total Revenue");
    if (row > 0) {
      let sum = 0;
      for (let c = 2; c <= 13; c++) sum += cellNumber(mcf, row, c);
      check(
        `Monthly Cash Flow Y1 sum-of-months ties to Operating Statement (${truth})`,
        Math.abs(sum - truth) <= 24,
        `MCF sum=${sum}, OpStmt=${truth}`,
      );
    } else {
      check("Monthly Cash Flow Y1 Total Revenue row found", false);
    }
  }

  // Lender Snapshot lays the year columns out starting at column 4
  // (col 1 is label, cols 2-3 are gutter/value pair).
  const ls = wb.getWorksheet("Lender Snapshot");
  if (ls) {
    const row = findRowByLabel(ls, "Revenue");
    if (row > 0) {
      const v = cellNumber(ls, row, 4);
      check(
        `Lender Snapshot Y1 Revenue ties to Operating Statement (${truth})`,
        Math.abs(v - truth) <= 2,
        `LS=${v}, OpStmt=${truth}`,
      );
    } else {
      check("Lender Snapshot Revenue row found", false);
    }
  }
}

// ---------- Case 1d: Teacher FTE scaling (ratio mode) ---------------------
async function caseTeacherFteScaling(): Promise<void> {
  // Use a fixture with a ratio-mode teacher whose FTE must grow with
  // enrollment. With 12 students Y1 → 25 students Y5 at 1:8 ratio
  // (rounded up), Y1 needs ceil(12/8)=2 FTE and Y5 needs ceil(25/8)=4.
  // The Staffing Costs Fcst Y5 cost should roughly double the Y1 cost
  // (modulo the salary escalator).
  const data = {
    ...microschoolStartup,
    enrollment: { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
    staffingRows: [
      {
        id: "s_ratio",
        roleName: "Lead Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 2,
        annualizedRate: 50000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 7.65,
        payrollLike: false,
        staffingMode: "ratio",
        studentRatio: 8,
        minFte: 1,
        maxFte: 10,
      },
    ],
  } as unknown as Record<string, unknown>;
  const wb = await loadV2(data);
  const ws = wb.getWorksheet("Staffing Costs Fcst");
  check("Staffing Costs Fcst sheet exists", !!ws);
  if (!ws) return;
  const row = findRowStarting(ws, "  Lead Teacher");
  check("Lead Teacher (ratio-tagged) row found", row > 0);
  if (row <= 0) return;
  const y1 = cellNumber(ws, row, 2);
  const y5 = cellNumber(ws, row, 6);
  check("Lead Teacher Y1 cost > 0", y1 > 0, `got ${y1}`);
  check(
    "Lead Teacher Y5 cost scales with enrollment (Y5 ≥ 1.6× Y1)",
    y5 >= y1 * 1.6,
    `Y1=${y1}, Y5=${y5}, ratio=${(y5 / Math.max(1, y1)).toFixed(2)}`,
  );
}

// ---------- Case 2: Capacity covenant threshold (Issue 12) ----------------
async function caseCapacityCovenant(): Promise<void> {
  // Pass minCapacityUtil=75 (whole-percent legacy form). The covenant
  // label must render as "Capacity ≥ 75%", NOT 7500%.
  const data = {
    ...microschoolStartup,
    covenantThresholds: { ...microschoolStartup.covenantThresholds, minCapacityUtil: 75 },
  } as unknown as Record<string, unknown>;
  const wb = await loadV2(data);
  const ws = wb.getWorksheet("DSCR & Covenants");
  check("DSCR & Covenants sheet exists", !!ws);
  if (!ws) return;

  const row = findRowStarting(ws, "Capacity ≥ ");
  check("Capacity covenant row found", row > 0);
  if (row > 0) {
    const label = cellString(ws, row, 1);
    check(
      "Capacity covenant label normalizes 75 → 75% (not 7500%)",
      label.includes("75%") && !label.includes("7500%"),
      `label="${label}"`,
    );
  }

  // And the fraction form (0.75) still renders as 75%.
  const dataFrac = {
    ...microschoolStartup,
    covenantThresholds: { ...microschoolStartup.covenantThresholds, minCapacityUtil: 0.75 },
  } as unknown as Record<string, unknown>;
  const wb2 = await loadV2(dataFrac);
  const ws2 = wb2.getWorksheet("DSCR & Covenants");
  if (ws2) {
    const row2 = findRowStarting(ws2, "Capacity ≥ ");
    if (row2 > 0) {
      const label2 = cellString(ws2, row2, 1);
      check(
        "Capacity covenant label keeps 0.75 → 75%",
        label2.includes("75%"),
        `label="${label2}"`,
      );
    }
    // Also assert the numeric Capacity Utilization row stores fractions
    // (e.g., 25/25=1.0), proving the percent vs fraction normalization
    // affects the threshold, not the actual utilization value.
    const utilRow = findRowByLabel(ws2, "Capacity Utilization");
    if (utilRow > 0) {
      const y5 = cellNumber(ws2, utilRow, 6);
      check(
        "Capacity Utilization Y5 stored as fraction in [0,1]",
        y5 >= 0 && y5 <= 1.001,
        `got ${y5} (expected fraction, not 100×)`,
      );
    }
  }
}

// ---------- Case 2b: Profitable scenario → positive Net Margin ------------
async function caseProfitableNetMargin(): Promise<void> {
  // A clearly-profitable scenario: scale tuition way up and shrink the
  // loan. Y5 Net Margin in the V2 Lender Snapshot must be strictly > 0,
  // proving the workbook plumbs revenue through to a positive bottom line
  // when the underlying numbers warrant it.
  const data = {
    ...microschoolStartup,
    schoolProfile: { ...microschoolStartup.schoolProfile, debtIncluded: true },
    enrollment: { year1: 30, year2: 45, year3: 60, year4: 75, year5: 90 },
    revenueRows: [
      ...(microschoolStartup.revenueRows || []).filter((r: { lineItem?: string }) => r.lineItem === "Tuition" || (r as { category?: string }).category === "tuition_and_fees").map((r: Record<string, unknown>) => ({
        ...r,
        amounts: [40000, 41200, 42436, 43709, 45020],
      })),
    ],
    capitalAndDebtRows: [
      {
        id: "loan1",
        lineItem: "Startup Loan",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        isLoan: true,
        loanPrincipal: 50000,
        loanRate: 6,
        loanTermYears: 10,
        purpose: "startup",
      },
    ],
  } as unknown as Record<string, unknown>;
  const wb = await loadV2(data);
  const ls = wb.getWorksheet("Lender Snapshot");
  check("Lender Snapshot exists (profitable scenario)", !!ls);
  if (!ls) return;
  const nmRow = findRowByLabel(ls, "Net Margin");
  check("Lender Snapshot Net Margin row found", nmRow > 0);
  if (nmRow <= 0) return;
  // Year columns start at col 4 in Lender Snapshot; Y5 is col 8.
  const y5 = cellNumber(ls, nmRow, 8);
  check(
    "Lender Snapshot Y5 Net Margin > 0 with profitable inputs",
    y5 > 0,
    `got ${y5}`,
  );
}

// ---------- Lender PF cases (Issues 4, 5, 6) ------------------------------
async function caseLenderProForma(): Promise<void> {
  // Use a scenario with a real amortizing loan so interest, principal,
  // and net margin are all non-trivial.
  const data = {
    ...microschoolStartup,
    schoolProfile: { ...microschoolStartup.schoolProfile, debtIncluded: true },
    capitalAndDebtRows: [
      {
        id: "loan1",
        lineItem: "Startup Loan",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
        isLoan: true,
        loanPrincipal: 250000,
        loanRate: 7,
        loanTermYears: 10,
        purpose: "startup",
      },
    ],
  } as unknown as Record<string, unknown>;

  const wb = await loadLenderPF(data);
  const pnl = wb.getWorksheet("5-Year P&L");
  check("Lender PF '5-Year P&L' sheet exists", !!pnl);
  if (!pnl) return;

  // Locate the rows by label so a future row-shift doesn't break the test.
  // Lender PF P&L puts labels in column B (col 1 is the gutter).
  const noiRow = findRowByLabel(pnl, "Net Operating Income (NOI)", 2);
  const interestRow = findRowByLabel(pnl, "Interest Expense", 2);
  const principalRow = findRowByLabel(pnl, "Principal & Capital Outlays", 2);
  const niRow = findRowByLabel(pnl, "Net Income", 2);
  check("found NOI row", noiRow > 0);
  check("found Interest Expense row", interestRow > 0);
  check("found Principal & Capital Outlays row", principalRow > 0);
  check("found Net Income row", niRow > 0);
  if (noiRow <= 0 || interestRow <= 0 || principalRow <= 0 || niRow <= 0) return;

  // Issue 6 — Interest Expense formula uses CUMIPMT against Assumptions.
  const interestFormula = cellFormula(pnl, interestRow, 3); // Y1 / col C
  check(
    "Interest Expense Y1 uses CUMIPMT(Assumptions!D60/12, ...)",
    interestFormula.includes("CUMIPMT(") && interestFormula.includes("Assumptions!$D$60"),
    `formula="${interestFormula}"`,
  );
  const interestY1 = cellNumber(pnl, interestRow, 3);
  check(
    "Interest Expense Y1 > 0 with a real amortizing loan",
    interestY1 > 0,
    `got ${interestY1}`,
  );

  // Issue 5 — Net Income = NOI − Interest only (principal NOT subtracted).
  const niFormula = cellFormula(pnl, niRow, 3);
  check(
    "Net Income Y1 formula = NOI − Interest (no principal term)",
    niFormula.includes(`C${noiRow}`)
      && niFormula.includes(`C${interestRow}`)
      && !niFormula.includes(`C${principalRow}`),
    `formula="${niFormula}"`,
  );
  // And cached value: NI ≈ NOI − Interest (within $1 rounding).
  const noi = cellNumber(pnl, noiRow, 3);
  const ni = cellNumber(pnl, niRow, 3);
  check(
    "Net Income Y1 numerically equals NOI − Interest",
    Math.abs(ni - (noi - interestY1)) <= 1,
    `NI=${ni} NOI=${noi} Int=${interestY1}`,
  );

  // Issue 4 — Summary!C13 Net Margin references '5-Year P&L'!G<niRow>,
  // not the hard-coded G21 (which is the Principal row).
  const summary = wb.getWorksheet("Summary");
  check("Lender PF 'Summary' sheet exists", !!summary);
  if (summary) {
    const c13Formula = cellFormula(summary, 13, 3);
    check(
      "Summary!C13 Net Margin formula references P&L Net Income row",
      c13Formula.includes(`'5-Year P&L'!G${niRow}`),
      `formula="${c13Formula}" expected ref to G${niRow}`,
    );
    check(
      "Summary!C13 does NOT point at the Principal row (G" + principalRow + ")",
      !c13Formula.includes(`'5-Year P&L'!G${principalRow}`),
      `formula="${c13Formula}"`,
    );
    // The cached value must tie to Y5 NI / Y5 Revenue. We don't assert
    // sign — a startup microschool with a $250K loan can legitimately
    // run at a loss in Y5; what matters is that the cell is computed
    // from the right rows.
    const netMargin = cellNumber(summary, 13, 3);
    const y5Rev = cellNumber(pnl, findRowByLabel(pnl, "Total Revenue", 2), 7);
    const y5NI = cellNumber(pnl, niRow, 7);
    const expected = y5Rev > 0 ? y5NI / y5Rev : 0;
    check(
      "Summary!C13 Net Margin cached value = Y5 NI / Y5 Revenue",
      Math.abs(netMargin - expected) < 1e-4,
      `got ${netMargin}, expected ${expected}`,
    );
  }
}

// ---------- Case: Tuition & Funding cached GTR == SUM formula (#898) ------
async function caseTuitionFundingCachedEqualsFormula(): Promise<void> {
  // Task #898 — when Excel recomputes the SUM formula on
  // "Tuition & Funding!GRAND TOTAL REVENUE", the displayed value must
  // match the cached number we shipped in the file. Previously we
  // cached `computeRevenueForYear` (which applies funding-mix
  // correction & percent_of_base handling) while the formula is
  // SUM over per-category subtotals — they diverged by ~$15K on the
  // microschool fixture and ~$1.9M on the private-school fixture.
  const personas: Array<[string, Record<string, unknown>]> = [
    ["microschool", microschoolStartup as unknown as Record<string, unknown>],
    ["private", privateSchoolWithESA as unknown as Record<string, unknown>],
    ["charter", charterPublicFunding as unknown as Record<string, unknown>],
  ];
  for (const [tag, payload] of personas) {
    const wb = await loadV2(payload);
    const tf = wb.getWorksheet("Tuition & Funding");
    if (!tf) { check(`${tag}: Tuition & Funding sheet exists`, false); continue; }

    // Find the GTR row. The label cell is the section header row; the
    // numeric row that carries the SUM formula and cached value is the
    // same row (label is in col 1, values start in col 2).
    const gtrRow = findRowByLabel(tf, "GRAND TOTAL REVENUE");
    if (gtrRow <= 0) { check(`${tag}: GRAND TOTAL REVENUE row found`, false); continue; }

    // Collect the cached value of every "Total <Category>" subtotal row
    // and assert that GTR cached equals their sum, year-by-year.
    const subtotalRows: number[] = [];
    tf.eachRow((_row, n) => {
      const lbl = cellString(tf, n, 1);
      if (lbl.startsWith("Total ") && n < gtrRow) subtotalRows.push(n);
    });
    check(
      `${tag}: T&F exposes at least one category subtotal row`,
      subtotalRows.length > 0,
    );

    // Probe Y1..Y5 (columns 2..6). Not every fixture uses all 5 years,
    // so we skip columns where the cached GTR is 0 AND the sum is 0.
    for (let col = 2; col <= 6; col++) {
      const cached = cellNumber(tf, gtrRow, col);
      let summed = 0;
      for (const sr of subtotalRows) summed += cellNumber(tf, sr, col);
      if (cached === 0 && summed === 0) continue;
      check(
        `${tag} Y${col - 1}: cached GTR == SUM(category subtotals)`,
        Math.abs(cached - summed) <= 1,
        `cached=${cached}, summed=${summed}, delta=${cached - summed}`,
      );
      // Also confirm the cell carries the SUM formula (so Excel's
      // recompute path is the path we're matching against, not a
      // plain number).
      const f = cellFormula(tf, gtrRow, col);
      check(
        `${tag} Y${col - 1}: GTR cell is a SUM formula`,
        f.startsWith("SUM("),
        `formula="${f}"`,
      );
    }
  }
}

async function main(): Promise<void> {
  await caseScholarshipSign();
  await caseScholarshipFlowsToGrandTotal();
  await caseCrossTabY1RevenueParity();
  await caseTeacherFteScaling();
  await caseCapacityCovenant();
  await caseProfitableNetMargin();
  await caseLenderProForma();
  await caseTuitionFundingCachedEqualsFormula();

  console.log(`workbook-accuracy-task-862: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("workbook-accuracy-task-862: unexpected error", err);
  process.exit(1);
});
