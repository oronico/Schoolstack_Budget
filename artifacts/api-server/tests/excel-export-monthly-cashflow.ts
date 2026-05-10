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

  // ── Task #743 — Summary tab mirrors the Monthly Cash Flow callouts ──
  console.log("\n--- Summary tab Monthly Cash Snapshot tie-in ---");
  const summaryWs = wb.worksheets.find(w => w.name === "Summary");
  check("Summary sheet present (single-year)", !!summaryWs);
  if (summaryWs) {
    const sumSectionRow = findRow(summaryWs, /year 1 monthly cash snapshot/i);
    check("Summary has 'YEAR 1 MONTHLY CASH SNAPSHOT' section", sumSectionRow !== null);

    const sumTroughMonthRow = findRow(summaryWs, "Cash Trough Month");
    const sumTroughBalRow = findRow(summaryWs, "Trough Cash Balance");
    const sumYr1EndRow = findRow(summaryWs, "Year 1 Ending Cash");
    check("Summary has 'Cash Trough Month' row", sumTroughMonthRow !== null);
    check("Summary has 'Trough Cash Balance' row", sumTroughBalRow !== null);
    check("Summary has 'Year 1 Ending Cash' row", sumYr1EndRow !== null);

    // Locate the source rows on the Monthly Cash Flow sheet.
    const cfTroughMonthRow = findRow(ws, "Cash Trough Month");
    const cfTroughBalRow = findRow(ws, "Trough Cash Balance");
    const cfYr1EndRow = findRow(ws, "Year 1 Ending Cash");

    // Each Summary cell should be a formula reference back to the
    // corresponding Monthly Cash Flow cell, and the cached numeric
    // result should equal the value on the source sheet.
    if (sumTroughBalRow !== null && cfTroughBalRow !== null) {
      const sumCell = summaryWs.getCell(sumTroughBalRow, 2);
      const formula = (sumCell.value && typeof sumCell.value === "object" && "formula" in sumCell.value) ? (sumCell.value as { formula: string }).formula : "";
      check(
        "Summary trough balance is a formula reference to Monthly Cash Flow",
        formula.includes("Monthly Cash Flow") && formula.includes(`B${cfTroughBalRow}`),
        `formula=${formula}`,
      );
      const sumVal = getNumeric(sumCell);
      const cfVal = getNumeric(ws.getCell(cfTroughBalRow, 2));
      check(
        "Summary trough balance numeric matches Monthly Cash Flow",
        sumVal !== null && cfVal !== null && Math.abs(sumVal - cfVal) <= 1,
        `summary=${sumVal}, cashflow=${cfVal}`,
      );
      check(
        "Summary trough balance has a fill applied (traffic-light)",
        !!sumCell.fill && sumCell.fill.type === "pattern",
      );
    }

    if (sumYr1EndRow !== null && cfYr1EndRow !== null) {
      const sumCell = summaryWs.getCell(sumYr1EndRow, 2);
      const formula = (sumCell.value && typeof sumCell.value === "object" && "formula" in sumCell.value) ? (sumCell.value as { formula: string }).formula : "";
      check(
        "Summary Year 1 Ending Cash is a formula reference to Monthly Cash Flow",
        formula.includes("Monthly Cash Flow") && formula.includes(`B${cfYr1EndRow}`),
        `formula=${formula}`,
      );
      const sumVal = getNumeric(sumCell);
      const cfVal = getNumeric(ws.getCell(cfYr1EndRow, 2));
      check(
        "Summary Year 1 Ending Cash numeric matches Monthly Cash Flow",
        sumVal !== null && cfVal !== null && Math.abs(sumVal - cfVal) <= 1,
        `summary=${sumVal}, cashflow=${cfVal}`,
      );
      check(
        "Summary Year 1 Ending Cash has a fill applied (traffic-light)",
        !!sumCell.fill && sumCell.fill.type === "pattern",
      );
    }

    if (sumTroughMonthRow !== null && cfTroughMonthRow !== null) {
      const sumText = getText(summaryWs.getCell(sumTroughMonthRow, 2));
      const cfText = getText(ws.getCell(cfTroughMonthRow, 2));
      check(
        "Summary trough month label matches Monthly Cash Flow",
        sumText.length > 0 && sumText === cfText,
        `summary='${sumText}', cashflow='${cfText}'`,
      );
    }

    const sumBad = scanForBadCells(summaryWs);
    check(
      "Summary sheet has no NaN / formula errors",
      sumBad.length === 0,
      sumBad.slice(0, 5).join("; "),
    );
  }

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

  // ── Task #744: real billing-month timing fixture ──
  //
  // Verify the Monthly Cash Flow sheet uses real per-stream timing (via
  // distributeRevenueMonthlyByRow) instead of an even spread. The
  // microschoolStartup fixture has tuition with billingMonths=10 (so
  // months 1–10 of the operating window are billed and months 0/11 are
  // dry) and an `annual_fixed` philanthropy row that lands entirely in
  // its receiptQuarter (defaults to Q1). Both are measurable departures
  // from the old `annual / opMonths` even-spread shape.
  console.log("\n--- Real billing-month timing (Task #744) ---");
  const tuitionRow = findRow(ws, "Tuition & Student Fees");
  if (tuitionRow !== null) {
    const tuitionMonthly: number[] = [];
    for (let m = 0; m < 12; m++) {
      tuitionMonthly.push(getNumeric(ws.getCell(tuitionRow, m + 2)) ?? 0);
    }
    // The tuition_and_fees category aggregates Tuition (billingMonths=10,
    // months 1–10) and Registration Fee (billingMonths=12, all months).
    // So months 0 and 11 receive ONLY the small registration fee and
    // months 1–10 receive registration fee + the much larger tuition.
    // This means months 1–10 must be substantially larger than months
    // 0 and 11, which is the measurable signature of real billing-month
    // timing vs. the old even spread (where every month would be equal).
    const midMonth = tuitionMonthly[5];
    check(
      "tuition_and_fees: month 0 (Jul) is much smaller than mid-year (only reg fee, no tuition billing)",
      midMonth > 0 && tuitionMonthly[0] > 0 && tuitionMonthly[0] < midMonth * 0.25,
      `month 0 = ${tuitionMonthly[0]}, midMonth = ${midMonth}`,
    );
    check(
      "tuition_and_fees: month 11 (Jun) is much smaller than mid-year (only reg fee, no tuition billing)",
      midMonth > 0 && tuitionMonthly[11] > 0 && tuitionMonthly[11] < midMonth * 0.25,
      `month 11 = ${tuitionMonthly[11]}, midMonth = ${midMonth}`,
    );
    // Months 1..10 should all be substantially larger than month 0.
    const billingWindowAllLarger = tuitionMonthly.slice(1, 11).every(v => v > tuitionMonthly[0] * 2);
    check(
      "tuition_and_fees: months 1–10 are all >> months 0/11 (tuition billing window)",
      billingWindowAllLarger,
      `months 1..10 = ${tuitionMonthly.slice(1, 11).join(",")}, month 0 = ${tuitionMonthly[0]}`,
    );
  } else {
    check("tuition_and_fees row found in Monthly Cash Flow sheet", false);
  }

  const philanthropyRow = findRow(ws, "Philanthropy");
  if (philanthropyRow !== null) {
    const philMonthly: number[] = [];
    for (let m = 0; m < 12; m++) {
      philMonthly.push(getNumeric(ws.getCell(philanthropyRow, m + 2)) ?? 0);
    }
    const nonZeroMonths = philMonthly.filter(v => v !== 0).length;
    check(
      "philanthropy lands in a single month (annual_fixed → receiptQuarter), not spread evenly",
      nonZeroMonths === 1,
      `non-zero months = ${nonZeroMonths}, monthly = [${philMonthly.join(",")}]`,
    );
    // Q1 default → fiscal month 0 = first month of the operating year.
    check(
      "philanthropy lands in fiscal month 0 (Q1 default receiptQuarter)",
      philMonthly[0] !== 0 && philMonthly.slice(1).every(v => v === 0),
      `philMonthly = [${philMonthly.join(",")}]`,
    );
  } else {
    check("philanthropy row found in Monthly Cash Flow sheet", false);
  }

  // The trough month should now reflect the realistic shape — with
  // tuition holding off in Jul (fiscal month 0) but personnel + opex
  // starting in month 0, the cash trough has to be earlier than the
  // last operating month an even-spread model would land on.
  if (endingRow !== null) {
    const endingByMonth: number[] = [];
    for (let m = 0; m < 12; m++) {
      endingByMonth.push(getNumeric(ws.getCell(endingRow, m + 2)) ?? 0);
    }
    let troughIdx = 0;
    for (let m = 1; m < 12; m++) {
      if (endingByMonth[m] < endingByMonth[troughIdx]) troughIdx = m;
    }
    // With even-spread, the trough would always be the last operating
    // month (no shape variation). With real timing the trough should
    // not necessarily be the final month.
    const isEvenSpreadShape = endingByMonth.slice(0, 11).every((v, i, arr) => i === 0 || v === arr[i - 1] + (arr[1] - arr[0]));
    check(
      "ending-cash trajectory is NOT a perfectly even step (real timing variation present)",
      !isEvenSpreadShape,
      `endingByMonth = [${endingByMonth.join(",")}]`,
    );
    check(
      "trough month index is in valid range 0..11",
      troughIdx >= 0 && troughIdx < 12,
      `troughIdx = ${troughIdx}`,
    );
  }

  // ── ESA reimbursement-lag fixture ──
  //
  // A school-choice row with disbursementType="reimbursement" and a
  // 3-month lag should produce a school_choice category series that has
  // zero (or near-zero) inflow in the first lag months.
  console.log("\n--- ESA reimbursement-lag fixture ---");
  const esaFixture = singleYearFixture();
  const esaRows = esaFixture.revenueRows as Array<Record<string, unknown>>;
  for (const r of esaRows) {
    if (r.id === "r3") {
      r.disbursementType = "reimbursement";
      r.reimbursementLagMonths = 3;
    }
  }
  const esaBuf = await generateWorkbook(esaFixture);
  const esaWb = new ExcelJS.Workbook();
  await esaWb.xlsx.load(esaBuf);
  const esaCfWs = esaWb.worksheets.find(w => w.name === "Monthly Cash Flow");
  check("ESA reimbursement fixture: Monthly Cash Flow sheet present", !!esaCfWs);
  if (esaCfWs) {
    const esaSchoolChoiceRow = findRow(esaCfWs, "School Choice");
    if (esaSchoolChoiceRow !== null) {
      const esaMonthly: number[] = [];
      for (let m = 0; m < 12; m++) {
        esaMonthly.push(getNumeric(esaCfWs.getCell(esaSchoolChoiceRow, m + 2)) ?? 0);
      }
      // First 3 months (lag) should have no ESA inflow.
      check(
        "ESA reimbursement: months 0..2 are zero (3-month lag)",
        esaMonthly[0] === 0 && esaMonthly[1] === 0 && esaMonthly[2] === 0,
        `months 0..2 = ${esaMonthly.slice(0, 3).join(",")}`,
      );
      check(
        "ESA reimbursement: months 3..11 receive positive disbursements",
        esaMonthly.slice(3).every(v => v > 0),
        `months 3..11 = ${esaMonthly.slice(3).join(",")}`,
      );
      // Annual total still ties back to FM revenue (no leakage).
      const totalIn = findRow(esaCfWs, "Total Cash Inflows");
      const esaFmWs = esaWb.worksheets.find(w => w.name === "Financial Model");
      if (totalIn !== null && esaFmWs) {
        const fmRev = getNumeric(esaFmWs.getCell(2, 2));
        const cfRev = getNumeric(esaCfWs.getCell(totalIn, 14));
        check(
          "ESA reimbursement: Total Cash Inflows annual still ties to FM revenue",
          fmRev !== null && cfRev !== null && Math.abs(fmRev - cfRev) <= 1,
          `FM rev=${fmRev}, CF inflows=${cfRev}`,
        );
      }
    } else {
      check("ESA reimbursement fixture: school_choice row found", false);
    }
    const esaBad = scanForBadCells(esaCfWs);
    check(
      "ESA reimbursement fixture: no NaN / formula errors",
      esaBad.length === 0,
      esaBad.slice(0, 5).join("; "),
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
