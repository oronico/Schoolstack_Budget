// Task #739 — Single-year "Monthly Cash Flow" sheet content test.
//
// Verifies that when generateWorkbook (excel-export.ts) runs in
// single-year mode (yearCount === 1), the workbook includes a
// "Monthly Cash Flow" sheet with:
//   - 12 month columns aligned to the school's fiscal year (default
//     Jul–Jun) plus an "Annual Total" column.
//   - Opening cash, cash inflows by source, cash outflows by category,
//     net change, and ending cash rows.
//   - Trough-month + ending-cash callouts.
//   - Annual totals tied to the matching Financial Model cells.
//   - No NaN / formula-error cells anywhere on the sheet.
//
// Five-year mode must NOT emit the sheet (regression guard).

import ExcelJS from "exceljs";
import { generateWorkbook } from "../src/lib/excel-export.js";
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

function singleYearFixture(): Record<string, unknown> {
  // Deep-clone microschoolStartup, then collapse every per-year amounts
  // array to a single year so generateWorkbook detects yearCount === 1.
  const f = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  for (const key of ["revenueRows", "expenseRows", "capitalAndDebtRows"] as const) {
    const rows = f[key] as Array<{ amounts?: number[] }> | undefined;
    if (!rows) continue;
    for (const r of rows) {
      if (Array.isArray(r.amounts)) r.amounts = [r.amounts[0] ?? 0];
    }
  }
  (f.schoolProfile as Record<string, unknown>).modelDuration = "single_year";
  return f;
}

function getNumeric(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = parseFloat(r);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function getText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    if ("richText" in v) {
      return (v as { richText: Array<{ text: string }> }).richText.map(p => p.text ?? "").join("");
    }
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  return "";
}

function findRow(ws: ExcelJS.Worksheet, label: string | RegExp): number | null {
  let found: number | null = null;
  ws.eachRow((row, rn) => {
    if (found !== null) return;
    const t = getText(row.getCell(1)).trim();
    if (typeof label === "string" ? t.toLowerCase().includes(label.toLowerCase()) : label.test(t)) {
      found = rn;
    }
  });
  return found;
}

function scanForBadCells(ws: ExcelJS.Worksheet): string[] {
  const bad: string[] = [];
  const ERR = ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A", "#NULL!", "#NUM!"];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value;
      if (v === null || v === undefined) return;
      if (typeof v === "number") {
        if (isNaN(v) || !isFinite(v)) bad.push(`${cell.address}: NaN/Inf`);
        return;
      }
      if (typeof v === "object" && "result" in v) {
        const r = (v as { result: unknown }).result;
        if (typeof r === "number" && (isNaN(r) || !isFinite(r))) {
          bad.push(`${cell.address}: formula result NaN/Inf`);
          return;
        }
        if (typeof r === "string") {
          for (const e of ERR) if (r.includes(e)) bad.push(`${cell.address}: ${e}`);
        }
        return;
      }
      const s = String(v);
      for (const e of ERR) if (s.includes(e)) bad.push(`${cell.address}: ${e}`);
      if (s === "undefined" || s === "NaN" || s === "[object Object]") {
        bad.push(`${cell.address}: ${s}`);
      }
    });
  });
  return bad;
}

async function main(): Promise<void> {
  console.log("=== Monthly Cash Flow (single-year) — content test ===\n");

  const buf = await generateWorkbook(singleYearFixture());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheetNames = wb.worksheets.map(w => w.name);
  console.log(`  sheets: ${sheetNames.join(", ")}\n`);

  check("workbook contains 'Monthly Cash Flow' sheet (single-year)", sheetNames.includes("Monthly Cash Flow"));
  const ws = wb.worksheets.find(w => w.name === "Monthly Cash Flow");
  if (!ws) {
    console.log("\n(remaining checks skipped — sheet missing)");
    process.exit(1);
  }

  // Header row should have the 12 fiscal-year months + Annual Total.
  // microschoolStartup uses fiscalYearStartMonth: 7 → Jul..Jun.
  const headerRow = ws.getRow(2);
  const headers: string[] = [];
  for (let c = 2; c <= 14; c++) headers.push(getText(headerRow.getCell(c)).trim());
  const expected = ["July", "August", "September", "October", "November", "December", "January", "February", "March", "April", "May", "June", "Annual Total"];
  check(
    "header row has 12 fiscal-year months + Annual Total",
    headers.length === 13 && headers.every((h, i) => h === expected[i]),
    `got: ${JSON.stringify(headers)}`,
  );

  // Required structural rows.
  const openingRow = findRow(ws, "Opening Cash Balance");
  const totalInflowRow = findRow(ws, "Total Cash Inflows");
  const totalOutflowRow = findRow(ws, "Total Cash Outflows");
  const netCfRow = findRow(ws, "Net Cash Flow");
  const endingRow = findRow(ws, "Ending Cash Balance");
  const troughLabelRow = findRow(ws, "Cash Trough Month");
  const troughBalRow = findRow(ws, "Trough Cash Balance");

  check("Opening Cash Balance row present", openingRow !== null);
  check("Total Cash Inflows row present", totalInflowRow !== null);
  check("Total Cash Outflows row present", totalOutflowRow !== null);
  check("Net Cash Flow row present", netCfRow !== null);
  check("Ending Cash Balance row present", endingRow !== null);
  check("Cash Trough Month callout present", troughLabelRow !== null);
  check("Trough Cash Balance callout present", troughBalRow !== null);

  // The Total Cash Inflows annual total must tie to the Financial Model
  // Total Revenue cell (row 2, col B). The cell uses a direct formula
  // reference, so the cached `result` value should be the same numeric.
  const fmWs = wb.worksheets.find(w => w.name === "Financial Model");
  if (fmWs && totalInflowRow !== null && endingRow !== null) {
    const fmRevCell = fmWs.getCell(2, 2);
    const fmRev = getNumeric(fmRevCell);
    const cfRev = getNumeric(ws.getCell(totalInflowRow, 14));
    check(
      "Total Cash Inflows annual total ties to Financial Model revenue",
      fmRev !== null && cfRev !== null && Math.abs(fmRev - cfRev) <= 1,
      `FM rev=${fmRev}, CF inflows=${cfRev}`,
    );

    const fmNI = getNumeric(fmWs.getCell(7, 2));
    const cfNet = getNumeric(ws.getCell(netCfRow!, 14));
    check(
      "Net Cash Flow annual total ties to Financial Model net income",
      fmNI !== null && cfNet !== null && Math.abs(fmNI - cfNet) <= 1,
      `FM NI=${fmNI}, CF net=${cfNet}`,
    );

    // Ending cash annual total = startingCash + sum(monthly net) — for
    // microschoolStartup (no priorYearSnapshot) starting cash is 0, so
    // ending cash should equal net income.
    const cfEnd = getNumeric(ws.getCell(endingRow, 14));
    check(
      "Ending Cash annual total = starting cash (0) + net cash flow",
      cfEnd !== null && fmNI !== null && Math.abs(cfEnd - fmNI) <= 1,
      `ending=${cfEnd}, expected=${fmNI}`,
    );
  }

  // No formula errors / NaN anywhere on the sheet.
  const bad = scanForBadCells(ws);
  check(
    "Monthly Cash Flow sheet has no NaN / formula errors",
    bad.length === 0,
    bad.slice(0, 5).join("; "),
  );

  // Five-year regression guard: the sheet must NOT appear when
  // generateWorkbook runs against the original 5-year fixture.
  const fiveYearBuf = await generateWorkbook(JSON.parse(JSON.stringify(microschoolStartup)));
  const fiveYearWb = new ExcelJS.Workbook();
  await fiveYearWb.xlsx.load(fiveYearBuf);
  const fiveYearSheets = fiveYearWb.worksheets.map(w => w.name);
  check(
    "Monthly Cash Flow sheet is NOT emitted in five-year mode",
    !fiveYearSheets.includes("Monthly Cash Flow"),
    `5-year sheets: ${fiveYearSheets.join(", ")}`,
  );

  // ── Management-fee fixture: annual reconciliation guard ──
  //
  // When `hasManagementFee` is true the Financial Model inserts a
  // "Management Fee" row between Operating Expenses and Capital & Debt,
  // shifting downstream rows by 1. The Total Cash Outflows annual cell
  // must include the management fee — this is the regression flagged in
  // code review for task #739.
  console.log("\n--- Management-fee fixture reconciliation ---");
  const mgmtFixture = singleYearFixture();
  (mgmtFixture.schoolProfile as Record<string, unknown>).hasManagementFee = true;
  (mgmtFixture.schoolProfile as Record<string, unknown>).managementFeePercent = 5;
  // The Financial Model wires the management fee from an expense row
  // whose id === "authorizer_fee" (see precomputeFinancials → yearMgmtFee).
  // Inject one so the fee row is non-zero and exercises the row-shifting
  // path on the Financial Model + Monthly Cash Flow sheets.
  const mgmtExpenseRows = mgmtFixture.expenseRows as Array<Record<string, unknown>>;
  mgmtExpenseRows.push({
    id: "authorizer_fee",
    enabled: true,
    label: "Management Fee",
    category: "administrative_general",
    driverType: "percent_of_revenue",
    amounts: [5],
  });

  const mgmtBuf = await generateWorkbook(mgmtFixture);
  const mgmtWb = new ExcelJS.Workbook();
  await mgmtWb.xlsx.load(mgmtBuf);
  const mgmtCfWs = mgmtWb.worksheets.find(w => w.name === "Monthly Cash Flow");
  const mgmtFmWs = mgmtWb.worksheets.find(w => w.name === "Financial Model");

  check("mgmt fee fixture: Monthly Cash Flow sheet present", !!mgmtCfWs);
  check("mgmt fee fixture: Financial Model sheet present", !!mgmtFmWs);

  if (mgmtCfWs && mgmtFmWs) {
    const mgmtTotalInflowRow = findRow(mgmtCfWs, "Total Cash Inflows");
    const mgmtTotalOutflowRow = findRow(mgmtCfWs, "Total Cash Outflows");
    const mgmtNetCfRow = findRow(mgmtCfWs, "Net Cash Flow");
    const mgmtMgmtFeeRow = findRow(mgmtCfWs, "Management Fee");

    check("mgmt fee fixture: Management Fee outflow row present", mgmtMgmtFeeRow !== null);

    // Financial Model row layout with mgmt fee (mgmtOffset=1):
    //   row 4 = Operating Expenses (excl mgmt fee)
    //   row 5 = Management Fee
    //   row 6 = Capital & Debt
    //   row 7 = Total Expenses  ← outflow tie target
    //   row 8 = Net Income
    const fmOpex = getNumeric(mgmtFmWs.getCell(4, 2)) ?? 0;
    const fmMgmtFee = getNumeric(mgmtFmWs.getCell(5, 2)) ?? 0;
    const fmCapDebt = getNumeric(mgmtFmWs.getCell(6, 2)) ?? 0;
    const fmTotalExp = getNumeric(mgmtFmWs.getCell(7, 2)) ?? 0;
    const fmNI = getNumeric(mgmtFmWs.getCell(8, 2)) ?? 0;

    check(
      "mgmt fee fixture: management fee row is non-trivial (~5% of revenue)",
      fmMgmtFee > 0,
      `mgmtFee=${fmMgmtFee}`,
    );

    if (mgmtTotalOutflowRow !== null) {
      const cfOutAnnual = getNumeric(mgmtCfWs.getCell(mgmtTotalOutflowRow, 14)) ?? 0;
      check(
        "mgmt fee fixture: Total Cash Outflows annual = Financial Model Total Expenses (includes mgmt fee)",
        Math.abs(cfOutAnnual - fmTotalExp) <= 1,
        `cfOut=${cfOutAnnual}, fmTotalExp=${fmTotalExp}, fmMgmtFee=${fmMgmtFee}`,
      );
      // Sanity: the bug being guarded against would produce
      // cfOutAnnual = fmStaff + fmOpex + fmCapDebt (no mgmt fee).
      const buggyValue = (getNumeric(mgmtFmWs.getCell(3, 2)) ?? 0) + fmOpex + fmCapDebt;
      check(
        "mgmt fee fixture: outflows do NOT match the pre-fix buggy formula (staff + opex + capDebt only)",
        Math.abs(cfOutAnnual - buggyValue) > 1,
        `cfOut=${cfOutAnnual}, buggy=${buggyValue}`,
      );
    }

    if (mgmtTotalInflowRow !== null && mgmtNetCfRow !== null && mgmtTotalOutflowRow !== null) {
      const cfIn = getNumeric(mgmtCfWs.getCell(mgmtTotalInflowRow, 14)) ?? 0;
      const cfOut = getNumeric(mgmtCfWs.getCell(mgmtTotalOutflowRow, 14)) ?? 0;
      const cfNet = getNumeric(mgmtCfWs.getCell(mgmtNetCfRow, 14)) ?? 0;
      check(
        "mgmt fee fixture: inflows − outflows = net cash flow",
        Math.abs((cfIn - cfOut) - cfNet) <= 1,
        `inflows=${cfIn}, outflows=${cfOut}, net=${cfNet}`,
      );
      check(
        "mgmt fee fixture: net cash flow ties to FM net income",
        Math.abs(cfNet - fmNI) <= 1,
        `net=${cfNet}, fmNI=${fmNI}`,
      );
    }

    const mgmtBad = scanForBadCells(mgmtCfWs);
    check(
      "mgmt fee fixture: Monthly Cash Flow sheet has no NaN / formula errors",
      mgmtBad.length === 0,
      mgmtBad.slice(0, 5).join("; "),
    );
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
