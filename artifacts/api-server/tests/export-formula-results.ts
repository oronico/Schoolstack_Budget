import ExcelJS from "exceljs";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-export.js";
import { microschoolStartup, privateSchoolWithESA } from "./sample-payloads.js";

interface FormulaCheck {
  sheet: string;
  row: number;
  col: number;
  address: string;
  formula: string;
  result: unknown;
  hasResult: boolean;
}

function scanFormulaCells(wb: ExcelJS.Workbook): FormulaCheck[] {
  const checks: FormulaCheck[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row, rowNum) => {
      row.eachCell((cell, colNum) => {
        const val = cell.value;
        if (val && typeof val === "object" && "formula" in val) {
          const f = val as { formula: string; result?: unknown };
          checks.push({
            sheet: ws.name,
            row: rowNum,
            col: colNum,
            address: `${ws.name}!${cell.address}`,
            formula: f.formula,
            result: f.result,
            hasResult: f.result !== undefined && f.result !== null,
          });
        }
      });
    });
  }
  return checks;
}

function getNumericResult(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function getCellValue(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const cell = ws.getCell(row, col);
  const val = cell.value;
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "result" in val) {
    return getNumericResult((val as { result: unknown }).result);
  }
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

async function testGenerateWorkbook(payloadName: string, data: Record<string, unknown>): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];

  const buffer = await generateWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const tabs = wb.worksheets.map(w => w.name);
  console.log(`  [${payloadName}] Tabs: ${tabs.join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  [${payloadName}] Total formula cells: ${formulas.length}`);

  const missing = formulas.filter(f => !f.hasResult);
  if (missing.length > 0) {
    for (const m of missing.slice(0, 10)) {
      errors.push(`Missing result: ${m.address} formula="${m.formula}"`);
    }
    if (missing.length > 10) {
      errors.push(`... and ${missing.length - 10} more missing results`);
    }
  }

  const pnl = wb.getWorksheet("Financial Model");
  if (pnl) {
    for (let y = 0; y < 3; y++) {
      const col = y + 2;
      const rev = getCellValue(pnl, 2, col);
      const pers = getCellValue(pnl, 3, col);
      const opex = getCellValue(pnl, 4, col);
      const capd = getCellValue(pnl, 5, col);
      const totalExp = getCellValue(pnl, 6, col);
      const ni = getCellValue(pnl, 7, col);

      const expectedTotalExp = pers + opex + capd;
      if (Math.abs(totalExp - expectedTotalExp) > 2) {
        errors.push(`P&L Year ${y + 1}: Total Expenses ${Math.round(totalExp)} != Personnel ${Math.round(pers)} + OpEx ${Math.round(opex)} + CapDebt ${Math.round(capd)} = ${Math.round(expectedTotalExp)}`);
      }

      const expectedNI = rev - totalExp;
      if (Math.abs(ni - expectedNI) > 2) {
        errors.push(`P&L Year ${y + 1}: Net Income ${Math.round(ni)} != Revenue ${Math.round(rev)} - TotalExp ${Math.round(totalExp)} = ${Math.round(expectedNI)}`);
      }
    }

    const cum1 = getCellValue(pnl, 8, 2);
    const ni1 = getCellValue(pnl, 7, 2);
    if (Math.abs(cum1 - ni1) > 2) {
      errors.push(`P&L Year 1: Cumulative NI ${Math.round(cum1)} != NI ${Math.round(ni1)}`);
    }
    if (pnl.columnCount >= 3) {
      const cum2 = getCellValue(pnl, 8, 3);
      const ni2 = getCellValue(pnl, 7, 3);
      if (Math.abs(cum2 - (cum1 + ni2)) > 2) {
        errors.push(`P&L Year 2: Cumulative NI ${Math.round(cum2)} != prev ${Math.round(cum1)} + NI ${Math.round(ni2)}`);
      }
    }
  } else {
    errors.push("Financial Model tab not found");
  }

  const revWs = wb.getWorksheet("Revenue Schedule");
  if (revWs) {
    let lastDataRow = 0;
    revWs.eachRow((_, rn) => { lastDataRow = rn; });
    const revTotal = getCellValue(revWs, lastDataRow, 2);
    const pnlRev = pnl ? getCellValue(pnl, 2, 2) : null;
    if (pnlRev !== null && Math.abs(revTotal - pnlRev) > 2) {
      errors.push(`Revenue Schedule grand total ${Math.round(revTotal)} != P&L revenue ${Math.round(pnlRev)}`);
    }
  }

  return { passed: errors.length === 0, errors };
}

async function testUnderwritingExport(payloadName: string, data: Record<string, unknown>): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];

  const buffer = await generateUnderwritingWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const tabs = wb.worksheets.map(w => w.name);
  console.log(`  [UW ${payloadName}] Tabs: ${tabs.join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  [UW ${payloadName}] Total formula cells: ${formulas.length}`);

  if (formulas.length > 0) {
    const missing = formulas.filter(f => !f.hasResult);
    if (missing.length > 0) {
      for (const m of missing.slice(0, 10)) {
        errors.push(`UW Missing result: ${m.address} formula="${m.formula}"`);
      }
      if (missing.length > 10) {
        errors.push(`... and ${missing.length - 10} more`);
      }
    }
  } else {
    console.log(`  [UW ${payloadName}] No formula cells (static values only) - OK`);
  }

  if (buffer.length < 1000) {
    errors.push("Underwriting export file is suspiciously small");
  }

  const plWs = wb.getWorksheet("5-Year P&L");
  if (plWs) {
    let revRow: number | null = null;
    let niRow: number | null = null;
    plWs.eachRow((row, rn) => {
      const label = String(row.getCell(1).value || "").toLowerCase();
      if (label.includes("total revenue")) revRow = rn;
      if (label.includes("net income") || label.includes("profit")) niRow = rn;
    });
    if (revRow) {
      const rev1 = getCellValue(plWs, revRow, 2);
      console.log(`  [UW ${payloadName}] P&L Year 1 Revenue: $${Math.round(rev1).toLocaleString()}`);
    }
  }

  return { passed: errors.length === 0, errors };
}

async function main() {
  console.log("\n=== E2E Excel Export Formula Results Verification ===\n");

  const payloads: [string, Record<string, unknown>][] = [
    ["Microschool Startup", microschoolStartup as unknown as Record<string, unknown>],
    ["Private School ESA", privateSchoolWithESA as unknown as Record<string, unknown>],
  ];

  let totalPass = 0;
  let totalFail = 0;

  for (const [name, data] of payloads) {
    console.log(`\n--- Standard Export: ${name} ---`);
    const stdResult = await testGenerateWorkbook(name, data);
    if (stdResult.passed) {
      console.log(`  PASS: All formula cells have cached results, P&L tie-outs match`);
      totalPass++;
    } else {
      console.log(`  FAIL:`);
      stdResult.errors.forEach(e => console.log(`    - ${e}`));
      totalFail++;
    }

    console.log(`\n--- Underwriting Export: ${name} ---`);
    const uwResult = await testUnderwritingExport(name, data);
    if (uwResult.passed) {
      console.log(`  PASS: Underwriting export valid`);
      totalPass++;
    } else {
      console.log(`  FAIL:`);
      uwResult.errors.forEach(e => console.log(`    - ${e}`));
      totalFail++;
    }
  }

  console.log(`\n\n=== RESULTS: ${totalPass} passed, ${totalFail} failed ===\n`);

  if (totalFail > 0) {
    process.exit(1);
  } else {
    console.log("All exports verified successfully.\n");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(2);
});
