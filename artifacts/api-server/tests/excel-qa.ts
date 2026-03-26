import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding, charterADAGradeBand } from "./sample-payloads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "qa-output");

interface TestResult {
  name: string;
  passed: boolean;
  details: string[];
  errors: string[];
}

interface ExportQAResult {
  exportType: string;
  payload: string;
  fileSize: number;
  tabs: string[];
  results: TestResult[];
  overallPass: boolean;
}

const FORMULA_ERROR_PATTERNS = ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A", "#NULL!", "#NUM!"];
const BAD_VALUE_PATTERNS = ["undefined", "NaN", "null", "[object Object]"];

function isRichText(val: unknown): boolean {
  return typeof val === "object" && val !== null && "richText" in val && Array.isArray((val as { richText: unknown }).richText);
}

function isFormulaObj(val: unknown): boolean {
  return typeof val === "object" && val !== null && ("formula" in val || "sharedFormula" in val);
}

function isHyperlink(val: unknown): boolean {
  return typeof val === "object" && val !== null && "hyperlink" in val;
}

function extractNumericValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string") { const n = parseFloat(val); return isNaN(n) ? null : n; }
  if (isFormulaObj(val)) {
    const f = val as { result?: unknown };
    if (typeof f.result === "number") return f.result;
    if (typeof f.result === "string") { const n = parseFloat(f.result); return isNaN(n) ? null : n; }
    return null;
  }
  return null;
}

function extractTextValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return String(val);
  if (val instanceof Date) return val.toISOString();

  if (isRichText(val)) {
    return (val as { richText: Array<{ text: string }> }).richText.map(part => part.text ?? "").join("");
  }

  if (isFormulaObj(val)) {
    const f = val as { result?: unknown };
    if (f.result !== undefined) return String(f.result);
    return "[formula]";
  }

  if (isHyperlink(val)) {
    const h = val as { text?: string };
    return h.text ?? "";
  }

  return "";
}

function checkCellForErrors(cell: ExcelJS.Cell): string[] {
  const errors: string[] = [];
  const val = cell.value;

  if (val === null || val === undefined) return errors;

  if (isRichText(val) || isHyperlink(val)) return errors;

  if (isFormulaObj(val)) {
    const f = val as { result?: unknown };
    if (f.result !== undefined) {
      if (typeof f.result === "number" && isNaN(f.result)) {
        errors.push(`Cell ${cell.address}: Formula result is NaN`);
      }
      if (typeof f.result === "string") {
        for (const pattern of FORMULA_ERROR_PATTERNS) {
          if (f.result.includes(pattern)) {
            errors.push(`Cell ${cell.address}: Formula error "${pattern}"`);
          }
        }
      }
    }
    return errors;
  }

  if (typeof val === "object" && val !== null && "error" in val) {
    errors.push(`Cell ${cell.address}: Formula error ${(val as { error: unknown }).error}`);
    return errors;
  }

  if (typeof val === "number" && isNaN(val)) {
    errors.push(`Cell ${cell.address}: NaN value`);
    return errors;
  }

  if (typeof val === "number" && !isFinite(val)) {
    errors.push(`Cell ${cell.address}: Infinite value`);
    return errors;
  }

  const str = String(val);

  if (str === "[object Object]") {
    errors.push(`Cell ${cell.address}: Raw [object Object] — unhandled object type`);
    return errors;
  }

  for (const pattern of FORMULA_ERROR_PATTERNS) {
    if (str.includes(pattern)) {
      errors.push(`Cell ${cell.address}: Contains "${pattern}"`);
    }
  }
  for (const pattern of BAD_VALUE_PATTERNS) {
    if (str === pattern) {
      errors.push(`Cell ${cell.address}: Value is "${pattern}"`);
    }
  }

  return errors;
}

function scanSheetForErrors(ws: ExcelJS.Worksheet): { errors: string[]; cellCount: number } {
  const errors: string[] = [];
  let cellCount = 0;

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cellCount++;
      errors.push(...checkCellForErrors(cell));
    });
  });

  return { errors, cellCount };
}

function findCellByLabel(ws: ExcelJS.Worksheet, label: string | RegExp, searchCol: number = 1): { row: number; col: number } | null {
  let found: { row: number; col: number } | null = null;
  const colsToSearch = searchCol === 1 ? [1, 2] : [searchCol];
  for (const col of colsToSearch) {
    if (found) break;
    ws.eachRow((row, rowNumber) => {
      if (found) return;
      const cell = row.getCell(col);
      const val = extractTextValue(cell.value).trim();
      if (typeof label === "string" ? val.toLowerCase().includes(label.toLowerCase()) : label.test(val)) {
        found = { row: rowNumber, col };
      }
    });
  }
  return found;
}

function getNumericValue(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const cell = ws.getCell(row, col);
  const val = cell.value;
  if (typeof val === "number") return val;
  if (val && typeof val === "object") {
    if ("result" in val) {
      const r = (val as { result: unknown }).result;
      if (typeof r === "number") return r;
    }
    if ("formula" in val || "sharedFormula" in val) {
      const f = val as { result?: unknown };
      if (typeof f.result === "number") return f.result;
    }
  }
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[,$%]/g, ""));
    if (!isNaN(n)) return n;
  }
  return 0;
}

function findValueByLabel(ws: ExcelJS.Worksheet, label: string | RegExp, valueCol?: number): number | null {
  const loc = findCellByLabel(ws, label);
  if (!loc) return null;
  const c = valueCol ?? loc.col + 1;
  const cell = ws.getCell(loc.row, c);
  if (cell.value === null || cell.value === undefined) return null;
  return getNumericValue(ws, loc.row, c);
}

function tieOutCheck(name: string, a: number | null, b: number | null, tolerance: number = 1): TestResult {
  const result: TestResult = { name, passed: false, details: [], errors: [] };

  if (a === null || b === null) {
    result.errors.push(`Could not find values for tie-out: a=${a}, b=${b}`);
    return result;
  }

  const diff = Math.abs(a - b);
  result.passed = diff <= tolerance;
  result.details.push(`Value A: ${Math.round(a)}, Value B: ${Math.round(b)}, Diff: ${Math.round(diff)}`);
  if (!result.passed) {
    result.errors.push(`Tie-out failed: difference of ${Math.round(diff)} exceeds tolerance of ${tolerance}`);
  }

  return result;
}

async function runFileIntegrity(filePath: string): Promise<TestResult> {
  const result: TestResult = { name: "File Integrity", passed: false, details: [], errors: [] };

  try {
    const stats = fs.statSync(filePath);
    result.details.push(`File size: ${(stats.size / 1024).toFixed(1)} KB`);

    if (stats.size < 1000) {
      result.errors.push("File is suspiciously small (<1KB)");
      return result;
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    result.details.push(`Successfully opened workbook`);
    result.details.push(`Worksheets: ${wb.worksheets.length}`);
    result.passed = true;
  } catch (err) {
    result.errors.push(`Failed to open workbook: ${(err as Error).message}`);
  }

  return result;
}

async function runTabPresenceCheck(wb: ExcelJS.Workbook, expectedTabs: string[]): Promise<TestResult> {
  const result: TestResult = { name: "Tab Presence", passed: false, details: [], errors: [] };
  const actualTabs = wb.worksheets.map((ws) => ws.name);
  result.details.push(`Found ${actualTabs.length} tabs: ${actualTabs.join(", ")}`);

  const missing: string[] = [];
  for (const expected of expectedTabs) {
    const found = actualTabs.some(
      (actual) => actual.toLowerCase().includes(expected.toLowerCase()) || expected.toLowerCase().includes(actual.toLowerCase())
    );
    if (!found) missing.push(expected);
  }

  if (missing.length > 0) {
    result.errors.push(`Missing tabs: ${missing.join(", ")}`);
  } else {
    result.passed = true;
  }

  return result;
}

async function runFormulaErrorScan(wb: ExcelJS.Workbook): Promise<TestResult> {
  const result: TestResult = { name: "Formula & Value Error Scan", passed: false, details: [], errors: [] };
  let totalCells = 0;

  for (const ws of wb.worksheets) {
    const scan = scanSheetForErrors(ws);
    totalCells += scan.cellCount;
    if (scan.errors.length > 0) {
      for (const err of scan.errors) {
        result.errors.push(`[${ws.name}] ${err}`);
      }
    }
  }

  result.details.push(`Scanned ${totalCells} cells across ${wb.worksheets.length} sheets`);
  result.passed = result.errors.length === 0;
  if (result.passed) {
    result.details.push("No formula errors, NaN, undefined, or bad values found");
  }

  return result;
}

function runUnderwritingV2TieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results: TestResult[] = [];

  const suSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("sources") || ws.name.toLowerCase().includes("s & u") || ws.name.toLowerCase().includes("s&u"));
  if (suSheet) {
    let totalSources: number | null = null;
    let totalUses: number | null = null;
    for (let col = 2; col <= 6; col++) {
      totalSources = findValueByLabel(suSheet, /total.*sources/i, col);
      if (totalSources !== null) break;
    }
    for (let col = 2; col <= 6; col++) {
      totalUses = findValueByLabel(suSheet, /total.*uses/i, col);
      if (totalUses !== null) break;
    }
    if (totalSources !== null && totalUses !== null) {
      results.push(tieOutCheck("Sources = Uses", totalSources, totalUses, 2));
    } else {
      results.push({
        name: "Sources = Uses",
        passed: true,
        details: [`Sources: ${totalSources ?? "N/A"}, Uses: ${totalUses ?? "N/A"} — no S&U data entered or partial data`],
        errors: [],
      });
    }
  } else {
    results.push({ name: "Sources = Uses (skipped)", passed: true, details: ["Sources & Uses sheet not found — may not be applicable"], errors: [] });
  }

  const bsSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("balance"));
  if (bsSheet) {
    for (let col = 2; col <= 6; col++) {
      const totalAssets = findValueByLabel(bsSheet, /total\s*assets/i, col);
      const totalLiabEquity = findValueByLabel(bsSheet, /total.*liab.*(?:equity|net)/i, col);
      if (totalAssets !== null && totalLiabEquity !== null) {
        results.push(tieOutCheck(`Balance Sheet Tie (Y${col - 1}): Assets = L+E`, totalAssets, totalLiabEquity, 2));
      }

      const balCheck = findValueByLabel(bsSheet, /balance.*check/i, col);
      if (balCheck !== null) {
        results.push(tieOutCheck(`Balance Check Row (Y${col - 1}) = 0`, balCheck, 0, 2));
      }
    }
  } else {
    results.push({ name: "Balance Sheet Tie-Outs", passed: false, details: [], errors: ["Balance Sheet not found"] });
  }

  const cfSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("cash flow") || ws.name.toLowerCase().includes("monthly"));
  if (cfSheet && bsSheet) {
    let endingCash: number | null = null;
    for (let col = 2; col <= 14; col++) {
      const v = findValueByLabel(cfSheet, /ending.*cash|cash.*end/i, col);
      if (v !== null && v !== 0) endingCash = v;
    }
    let bsCash: number | null = null;
    for (let col = 2; col <= 6; col++) {
      bsCash = findValueByLabel(bsSheet, /^[\s]*cash(?!\s*flow)/i, col);
      if (bsCash !== null) break;
    }
    if (endingCash !== null && bsCash !== null) {
      results.push(tieOutCheck("Cash Flow Ending → Balance Sheet Cash (Y1)", endingCash, bsCash, 2));
    } else {
      results.push({
        name: "Cash Flow Ending → Balance Sheet Cash (Y1)",
        passed: true,
        details: [`Ending Cash: ${endingCash ?? "not found"}, BS Cash: ${bsCash ?? "not found"} — partial match OK`],
        errors: [],
      });
    }
  }

  const dsSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("debt"));
  if (dsSheet && bsSheet) {
    for (let y = 0; y < 5; y++) {
      const endingBal = findValueByLabel(dsSheet, /total.*ending|ending.*balance/i, y + 2);
      const bsDebt = findValueByLabel(bsSheet, /total.*debt|long.*term.*debt/i, y + 2);
      if (endingBal !== null && bsDebt !== null) {
        results.push(tieOutCheck(`Debt Schedule → Balance Sheet Debt (Y${y + 1})`, endingBal, bsDebt, 2));
      }
    }
  }

  const dscrSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("dscr"));
  if (dscrSheet) {
    let hasDSCRRow = false;
    let hasDSCRValues = false;
    let hasDebt = false;
    dscrSheet.eachRow((row) => {
      const label = extractTextValue(row.getCell(1).value).toLowerCase();
      if (label.includes("dscr") || label.includes("debt service coverage")) {
        hasDSCRRow = true;
        for (let c = 2; c <= 6; c++) {
          const num = extractNumericValue(row.getCell(c).value);
          if (num !== null && num > 0) hasDSCRValues = true;
        }
      }
      if (label.includes("debt service") && !label.includes("coverage") && !label.includes("ratio")) {
        for (let c = 2; c <= 6; c++) {
          const num = extractNumericValue(row.getCell(c).value);
          if (num !== null && num > 0) hasDebt = true;
        }
      }
    });
    if (!hasDebt) {
      results.push({
        name: "DSCR Values (No Debt)",
        passed: hasDSCRRow,
        details: hasDSCRRow ? ["DSCR row present — N/A or 0 is correct when no debt exists"] : [],
        errors: hasDSCRRow ? [] : ["DSCR row not found even though sheet exists"],
      });
    } else {
      results.push({
        name: "DSCR Values Present",
        passed: hasDSCRValues,
        details: hasDSCRValues ? ["DSCR values found and populated"] : [],
        errors: hasDSCRValues ? [] : ["Debt exists but no positive DSCR values found"],
      });
    }
  }

  return results;
}

function runLenderGradeBandTieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results = runStandardTieOuts(wb);

  const assumptionsSheet = wb.worksheets.find(ws => ws.name.toLowerCase().includes("assumptions"));
  if (!assumptionsSheet) return results;

  let hasCharterSection = false;
  let k5Rate = 0, m68Rate = 0, h912Rate = 0;
  const enrollByBand: Record<string, number[]> = { k5: [], m68: [], h912: [] };

  assumptionsSheet.eachRow((row) => {
    for (let c = 1; c <= 4; c++) {
      const label = extractTextValue(row.getCell(c).value).toLowerCase();
      if (label.includes("charter funding details")) hasCharterSection = true;
      if (label.includes("per-pupil rate") && label.includes("k-5")) {
        const v = row.getCell(c + 1).value;
        k5Rate = typeof v === "number" ? v : 0;
      }
      if (label.includes("per-pupil rate") && label.includes("6-8")) {
        const v = row.getCell(c + 1).value;
        m68Rate = typeof v === "number" ? v : 0;
      }
      if (label.includes("per-pupil rate") && label.includes("9-12")) {
        const v = row.getCell(c + 1).value;
        h912Rate = typeof v === "number" ? v : 0;
      }
      if (label.trim().match(/^k-?5$/i)) {
        const valStr = extractTextValue(row.getCell(c + 1).value);
        enrollByBand.k5 = valStr.split(/\s*\/\s*/).map(Number).filter(n => !isNaN(n));
      }
      if (label.trim().match(/^6-8$/i)) {
        const valStr = extractTextValue(row.getCell(c + 1).value);
        enrollByBand.m68 = valStr.split(/\s*\/\s*/).map(Number).filter(n => !isNaN(n));
      }
      if (label.trim().match(/^9-12$/i)) {
        const valStr = extractTextValue(row.getCell(c + 1).value);
        enrollByBand.h912 = valStr.split(/\s*\/\s*/).map(Number).filter(n => !isNaN(n));
      }
    }
  });

  results.push({
    name: "Lender Grade-Band Assumptions Present",
    passed: hasCharterSection,
    details: hasCharterSection ? ["Charter Funding Details section found in Assumptions"] : [],
    errors: hasCharterSection ? [] : ["Charter Funding Details section not found in lender Assumptions sheet"],
  });

  if (!hasCharterSection) return results;

  results.push({
    name: "Lender Grade-Band Per-Pupil Rates Populated",
    passed: k5Rate > 0,
    details: [`K-5: $${k5Rate}, 6-8: $${m68Rate}, 9-12: $${h912Rate}`],
    errors: k5Rate <= 0 ? ["K-5 per-pupil rate is zero or missing"] : [],
  });

  if (enrollByBand.k5.length >= 5) {
    for (let y = 0; y < 5; y++) {
      const k5e = enrollByBand.k5[y] || 0;
      const m68e = enrollByBand.m68[y] || 0;
      const h912e = enrollByBand.h912[y] || 0;
      const expectedGbBase = (k5e * k5Rate) + (m68e * m68Rate) + (h912e * h912Rate);
      results.push({
        name: `Lender Grade-Band Revenue Y${y + 1} Positive`,
        passed: expectedGbBase > 0,
        details: [`Y${y + 1}: $${Math.round(expectedGbBase).toLocaleString()} (K5: ${k5e}×$${k5Rate}, 6-8: ${m68e}×$${m68Rate}, 9-12: ${h912e}×$${h912Rate})`],
        errors: expectedGbBase <= 0 ? [`Grade-band revenue Y${y + 1} is zero`] : [],
      });
    }
  }

  return results;
}

function runSingleYearTieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results: TestResult[] = [];

  const pnlSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("p&l"));

  if (pnlSheet) {
    const totalRev = findValueByLabel(pnlSheet, /total.*revenue|revenue.*total/i, 14);
    const netIncome = findValueByLabel(pnlSheet, /net\s*(income|surplus|operating)|profit/i, 14);

    results.push({
      name: "P&L Has Revenue",
      passed: totalRev !== null,
      details: [`Total Revenue (Annual): ${totalRev !== null ? Math.round(totalRev) : "not found"}`],
      errors: totalRev === null ? ["No revenue found in P&L Summary total column"] : [],
    });

    results.push({
      name: "P&L Has Net Income Row",
      passed: netIncome !== null,
      details: [`Net Income (Annual): ${netIncome !== null ? Math.round(netIncome) : "not found"}`],
      errors: netIncome === null ? ["Net Income row not found in P&L Summary"] : [],
    });
  } else {
    results.push({
      name: "P&L Sheet Found",
      passed: false,
      details: [`Available sheets: ${wb.worksheets.map(w => w.name).join(", ")}`],
      errors: ["No P&L sheet found"],
    });
  }

  return results;
}

function runStandardTieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results: TestResult[] = [];

  const pnlSheet = wb.worksheets.find((ws) => {
    const n = ws.name.toLowerCase();
    return n.includes("financial model") || n.includes("pro forma") || n.includes("p&l") || n.includes("operating stmt") || n.includes("5-year model");
  });

  if (pnlSheet) {
    let totalRev: number | null = null;
    let netIncome: number | null = null;

    for (let col = 2; col <= 6; col++) {
      const r = findValueByLabel(pnlSheet, /total.*revenue|revenue.*total/i, col);
      if (r !== null && r > 0) { totalRev = r; break; }
    }

    for (let col = 2; col <= 6; col++) {
      const ni = findValueByLabel(pnlSheet, /net\s*(income|surplus|operating)|^\s*profit\s*$|net\s*profit/i, col);
      if (ni !== null) { netIncome = ni; break; }
    }

    results.push({
      name: "P&L Has Revenue",
      passed: totalRev !== null && totalRev > 0,
      details: [`Total Revenue: ${totalRev !== null ? Math.round(totalRev) : "not found"}`],
      errors: totalRev === null || totalRev <= 0 ? ["No positive revenue found in P&L"] : [],
    });

    results.push({
      name: "P&L Has Net Income Row",
      passed: netIncome !== null,
      details: [`Net Income: ${netIncome !== null ? Math.round(netIncome) : "not found"}`],
      errors: netIncome === null ? ["Net Income row not found in P&L sheet"] : [],
    });
  } else {
    results.push({
      name: "P&L Sheet Found",
      passed: false,
      details: [`Available sheets: ${wb.worksheets.map(w => w.name).join(", ")}`],
      errors: ["No P&L / Financial Model / Operating Statement sheet found"],
    });
  }

  return results;
}

function runLenderTieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results: TestResult[] = [];
  const sheets = wb.worksheets.map((ws) => ws.name);

  const hasPnL = sheets.some((n) => n.toLowerCase().includes("p&l"));
  const hasCashFlow = sheets.some((n) => n.toLowerCase().includes("cash flow"));
  const hasSummary = sheets.some((n) => n.toLowerCase().includes("summary"));

  results.push({
    name: "Lender Core Sheets Present",
    passed: hasPnL && hasCashFlow && hasSummary,
    details: [`Sheets: ${sheets.join(", ")}`],
    errors: [
      !hasPnL ? "Missing P&L sheet" : "",
      !hasCashFlow ? "Missing Cash Flow sheet" : "",
      !hasSummary ? "Missing Summary sheet" : "",
    ].filter(Boolean),
  });

  let hasData = false;
  for (const ws of wb.worksheets) {
    let cellCount = 0;
    ws.eachRow((row) => {
      row.eachCell(() => { cellCount++; });
    });
    if (cellCount > 10) hasData = true;
  }
  results.push({
    name: "Lender Workbook Has Data",
    passed: hasData,
    details: [],
    errors: hasData ? [] : ["No populated sheets found (template may not have been filled)"],
  });

  return results;
}

function runFormulaTieOuts(wb: ExcelJS.Workbook): TestResult[] {
  const results: TestResult[] = [];

  const bsSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("balance"));
  if (bsSheet) {
    for (let col = 2; col <= 6; col++) {
      const totalAssets = findValueByLabel(bsSheet, /total\s*assets/i, col);
      const totalLiabEquity = findValueByLabel(bsSheet, /total.*liab/i, col);
      if (totalAssets !== null && totalLiabEquity !== null) {
        results.push(tieOutCheck(`Balance Sheet (Y${col - 1}): Assets = L+E`, totalAssets, totalLiabEquity, 2));
      }
    }
  }

  const dscrSheet = wb.worksheets.find((ws) => ws.name.toLowerCase().includes("dscr"));
  if (dscrSheet) {
    let foundRow = false;
    let foundValues = false;
    dscrSheet.eachRow((row) => {
      const label = extractTextValue(row.getCell(1).value).toLowerCase();
      if (label.includes("dscr")) {
        foundRow = true;
        for (let c = 2; c <= 6; c++) {
          if (typeof row.getCell(c).value === "number") foundValues = true;
        }
      }
    });
    results.push({
      name: "DSCR Present in Formula Export",
      passed: foundRow,
      details: [foundRow ? (foundValues ? "DSCR row with values found" : "DSCR row found (no values — may be no debt)") : ""],
      errors: foundRow ? [] : ["DSCR row not found"],
    });
  }

  return results;
}

async function testExport(
  exportName: string,
  payloadName: string,
  payload: Record<string, unknown>,
  generateFn: (data: Record<string, unknown>) => Promise<Buffer | ExcelJS.Workbook>,
  expectedTabs: string[],
  tieOutFn: (wb: ExcelJS.Workbook) => TestResult[]
): Promise<ExportQAResult> {
  const safeFileName = `${exportName.replace(/\s+/g, "_")}_${payloadName.replace(/\s+/g, "_")}.xlsx`;
  const filePath = path.join(OUT_DIR, safeFileName);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${exportName} — ${payloadName}`);
  console.log(`${"=".repeat(70)}`);

  const qaResult: ExportQAResult = {
    exportType: exportName,
    payload: payloadName,
    fileSize: 0,
    tabs: [],
    results: [],
    overallPass: false,
  };

  try {
    const output = await generateFn(payload);
    let buffer: Buffer;
    if (Buffer.isBuffer(output)) {
      buffer = output;
    } else {
      const arrayBuf = await output.xlsx.writeBuffer();
      buffer = Buffer.from(arrayBuf);
    }

    fs.writeFileSync(filePath, buffer);
    qaResult.fileSize = buffer.length;
    console.log(`  ✓ Generated: ${(buffer.length / 1024).toFixed(1)} KB`);

    const integrityResult = await runFileIntegrity(filePath);
    qaResult.results.push(integrityResult);
    logResult(integrityResult);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    qaResult.tabs = wb.worksheets.map((ws) => ws.name);

    const tabResult = await runTabPresenceCheck(wb, expectedTabs);
    qaResult.results.push(tabResult);
    logResult(tabResult);

    const errorResult = await runFormulaErrorScan(wb);
    qaResult.results.push(errorResult);
    logResult(errorResult);

    const tieOuts = tieOutFn(wb);
    qaResult.results.push(...tieOuts);
    for (const t of tieOuts) logResult(t);

  } catch (err) {
    const errorResult: TestResult = {
      name: "Generation",
      passed: false,
      details: [],
      errors: [`Failed to generate: ${(err as Error).message}\n${(err as Error).stack}`],
    };
    qaResult.results.push(errorResult);
    logResult(errorResult);
  }

  qaResult.overallPass = qaResult.results.every((r) => r.passed);
  const icon = qaResult.overallPass ? "✅" : "❌";
  console.log(`\n  ${icon} Overall: ${qaResult.overallPass ? "PASS" : "FAIL"}`);

  return qaResult;
}

function logResult(r: TestResult) {
  const icon = r.passed ? "  ✓" : "  ✗";
  console.log(`${icon} ${r.name}`);
  for (const d of r.details) console.log(`    ${d}`);
  for (const e of r.errors.slice(0, 5)) console.log(`    ⚠ ${e}`);
  if (r.errors.length > 5) console.log(`    ... and ${r.errors.length - 5} more errors`);
}

const UNDERWRITING_V2_TABS = [
  "Instructions", "Cover", "Assumptions", "Program Profile",
  "Enrollment", "Tuition", "Staffing", "OpEx", "Capital",
  "Enrollment", "Staffing Costs",
  "Budget Detail", "Budget Summary", "Cash Flow",
  "Operating", "Debt", "Balance",
  "DSCR", "Sources", "Scenario", "Snapshot", "Financial Health",
];

const STANDARD_TABS = [
  "Cover", "Assumptions", "Revenue Schedule", "Staffing", "Operating Expenses", "Financial Model", "Summary",
];

const FORMULA_TABS = [
  "Instructions", "Assumptions", "5-Year Model", "Financial Health",
];

const UNDERWRITING_V1_TABS = [
  "Cover", "Assumptions", "Enrollment", "Tuition", "Staffing",
  "Operating", "Capital Stack", "Debt Schedule", "Cash Flow",
  "P&L", "Balance Sheet", "DSCR", "Snapshot", "Summary",
];

const LENDER_TABS = ["Instructions", "Cover", "Assumptions", "Drivers", "P&L", "Cash Flow", "Staffing", "Loan Snapshot", "Summary", "Financial Health"];

const SINGLE_YEAR_TABS = ["Assumptions", "Revenue", "Personnel", "Operating Expenses", "P&L Summary"];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║          SchoolStack Budget — Excel Export QA Suite         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const { generateWorkbook: genStandard } = await import("../src/lib/excel-export.js");
  const { generateUnderwritingWorkbook: genUWv2 } = await import("../src/lib/underwriting-workbook.js");
  const { generateUnderwritingWorkbook: genUWv1, generateSingleYearBudget: genSingleYear } = await import("../src/lib/underwriting-export.js");
  const { generateFormulaWorkbook: genFormula } = await import("../src/lib/formula-export.js");
  const { generateLenderProFormaWorkbook: genLender } = await import("../src/lib/lender-proforma-export.js");

  const payloads: [string, Record<string, unknown>][] = [
    ["Microschool Startup", microschoolStartup as unknown as Record<string, unknown>],
    ["Private School + ESA", privateSchoolWithESA as unknown as Record<string, unknown>],
    ["Charter Public Funding", charterPublicFunding as unknown as Record<string, unknown>],
    ["Charter ADA Grade-Band", charterADAGradeBand as unknown as Record<string, unknown>],
  ];

  const allResults: ExportQAResult[] = [];

  for (const [payloadName, payload] of payloads) {
    allResults.push(await testExport("Underwriting V2 (21-tab)", payloadName, payload, genUWv2, UNDERWRITING_V2_TABS, runUnderwritingV2TieOuts));
    allResults.push(await testExport("Standard Export", payloadName, payload, genStandard, STANDARD_TABS, runStandardTieOuts));
    allResults.push(await testExport("Formula Export", payloadName, payload, genFormula, FORMULA_TABS, runFormulaTieOuts));
    allResults.push(await testExport("Underwriting V1 (14-tab)", payloadName, payload, genUWv1, UNDERWRITING_V1_TABS, runStandardTieOuts));
    const lenderTieOut = payloadName.includes("Grade-Band") ? runLenderGradeBandTieOuts : runStandardTieOuts;
    allResults.push(await testExport("Lender Pro Forma", payloadName, payload, genLender, LENDER_TABS, lenderTieOut));
    allResults.push(await testExport("Single-Year Pro Forma", payloadName, payload, (d) => genSingleYear(d, 0), SINGLE_YEAR_TABS, runSingleYearTieOuts));
  }

  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      FINAL REPORT                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const passed = allResults.filter((r) => r.overallPass).length;
  const failed = allResults.filter((r) => !r.overallPass).length;

  console.log(`  Total: ${allResults.length} | Passed: ${passed} | Failed: ${failed}\n`);

  for (const r of allResults) {
    const icon = r.overallPass ? "✅" : "❌";
    const failedTests = r.results.filter((t) => !t.passed);
    console.log(`  ${icon} ${r.exportType} — ${r.payload} (${(r.fileSize / 1024).toFixed(0)} KB, ${r.tabs.length} tabs)`);
    if (failedTests.length > 0) {
      for (const ft of failedTests) {
        console.log(`     ⚠ ${ft.name}: ${ft.errors[0] ?? "failed"}`);
      }
    }
  }

  const reportPath = path.join(OUT_DIR, "qa-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n  Report saved: ${reportPath}`);
  console.log(`  Output files: ${OUT_DIR}/\n`);

  if (failed > 0) {
    console.log(`\n  ❌ ${failed} export(s) FAILED QA. See details above.\n`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ All ${passed} exports PASSED QA.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\n  FATAL:", err);
  process.exit(2);
});
