import ExcelJS from "exceljs";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-export.js";
import { microschoolStartup } from "./sample-payloads.js";

interface FormulaCheck {
  address: string;
  formula: string;
  result: unknown;
  hasResult: boolean;
}

function scanFormulaCells(wb: ExcelJS.Workbook): FormulaCheck[] {
  const checks: FormulaCheck[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row, rowNum) => {
      row.eachCell((cell) => {
        const val = cell.value;
        if (val && typeof val === "object" && "formula" in val) {
          const f = val as { formula: string; result?: unknown };
          checks.push({
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

function getCellValue(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const val = ws.getCell(row, col).value;
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "result" in val) {
    const res = (val as { result: unknown }).result;
    if (typeof res === "number") return res;
    if (typeof res === "string") return parseFloat(res) || 0;
  }
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function findRowByLabel(ws: ExcelJS.Worksheet, pattern: string | RegExp): number | null {
  let found: number | null = null;
  ws.eachRow((row, rn) => {
    if (found) return;
    const label = String(row.getCell(1).value || "");
    if (typeof pattern === "string" ? label.includes(pattern) : pattern.test(label)) {
      found = rn;
    }
  });
  return found;
}

function assertClose(label: string, actual: number, expected: number, tolerance: number, errors: string[]): void {
  if (Math.abs(actual - expected) > tolerance) {
    errors.push(`${label}: got ${Math.round(actual)}, expected ${Math.round(expected)} (diff=${Math.round(actual - expected)})`);
  }
}

const EXPECTED_PNL = [
  { rev: 236000, pers: 118934, opex: 48600, capDebt: 0, totalExp: 167534, ni: 68466, cumNI: 68466 },
  { rev: 362760, pers: 147003, opex: 54963, capDebt: 0, totalExp: 201966, ni: 160794, cumNI: 229260 },
  { rev: 455954, pers: 151413, opex: 59946, capDebt: 0, totalExp: 211359, ni: 244595, cumNI: 473855 },
  { rev: 533300, pers: 155955, opex: 64338, capDebt: 0, totalExp: 220293, ni: 313007, cumNI: 786862 },
  { rev: 549850, pers: 160634, opex: 66214, capDebt: 0, totalExp: 226848, ni: 323002, cumNI: 1109864 },
];

const EXPECTED_REV_CATEGORIES = {
  tuition: [147000, 226980, 285582, 334075, 343900],
  schoolChoice: [84000, 129780, 163372, 191225, 196950],
};

const EXPECTED_STAFF_TOTAL = [118934, 147003, 151413, 155955, 160634];

const EXPECTED_EXP_CATEGORIES = {
  instructional: [6000, 9270, 11660, 13650, 14050],
  technology: [3600, 5562, 6996, 8200, 8450],
  occupancy: [36000, 37056, 38138, 39257, 40402],
  administrative: [3000, 3075, 3152, 3231, 3312],
};

const TOL = 2;

async function testStandardExport(): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const data = microschoolStartup as unknown as Record<string, unknown>;

  const buffer = await generateWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const tabs = wb.worksheets.map(w => w.name);
  console.log(`  Tabs: ${tabs.join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  Total formula cells: ${formulas.length}`);
  const missing = formulas.filter(f => !f.hasResult);
  if (missing.length > 0) {
    for (const m of missing.slice(0, 5)) errors.push(`Missing result: ${m.address}`);
    if (missing.length > 5) errors.push(`... and ${missing.length - 5} more missing`);
  }

  const pnl = wb.getWorksheet("Financial Model");
  if (!pnl) { errors.push("Financial Model tab not found"); return { passed: false, errors }; }

  for (let y = 0; y < 5; y++) {
    const c = y + 2;
    const yr = `Y${y + 1}`;
    const exp = EXPECTED_PNL[y];

    assertClose(`${yr} Revenue`, getCellValue(pnl, 2, c), exp.rev, TOL, errors);
    assertClose(`${yr} Personnel`, getCellValue(pnl, 3, c), exp.pers, TOL, errors);
    assertClose(`${yr} OpEx`, getCellValue(pnl, 4, c), exp.opex, TOL, errors);
    assertClose(`${yr} CapDebt`, getCellValue(pnl, 5, c), exp.capDebt, TOL, errors);
    assertClose(`${yr} TotalExp`, getCellValue(pnl, 6, c), exp.totalExp, TOL, errors);
    assertClose(`${yr} Net Income`, getCellValue(pnl, 7, c), exp.ni, TOL, errors);
    assertClose(`${yr} Cumulative NI`, getCellValue(pnl, 8, c), exp.cumNI, TOL, errors);

    const actTotalExp = getCellValue(pnl, 3, c) + getCellValue(pnl, 4, c) + getCellValue(pnl, 5, c);
    assertClose(`${yr} TotalExp=Pers+OpEx+CapDebt`, getCellValue(pnl, 6, c), actTotalExp, TOL, errors);

    const actNI = getCellValue(pnl, 2, c) - getCellValue(pnl, 6, c);
    assertClose(`${yr} NI=Rev-TotalExp`, getCellValue(pnl, 7, c), actNI, TOL, errors);
  }

  const rev = wb.getWorksheet("Revenue Schedule");
  if (rev) {
    const tuitionRow = findRowByLabel(rev, "Total TUITION");
    const schoolChoiceRow = findRowByLabel(rev, /Total SCHOOL CHOICE/);
    let grandTotalRow = 0;
    rev.eachRow((_: ExcelJS.Row, rn: number) => { grandTotalRow = rn; });

    if (tuitionRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Rev Tuition Y${y+1}`, getCellValue(rev, tuitionRow, y+2), EXPECTED_REV_CATEGORIES.tuition[y], TOL, errors);
      }
    } else { errors.push("Revenue: Tuition subtotal row not found"); }

    if (schoolChoiceRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Rev SchoolChoice Y${y+1}`, getCellValue(rev, schoolChoiceRow, y+2), EXPECTED_REV_CATEGORIES.schoolChoice[y], TOL, errors);
      }
    } else { errors.push("Revenue: School Choice subtotal row not found"); }

    for (let y = 0; y < 5; y++) {
      assertClose(`Rev GrandTotal=P&L Rev Y${y+1}`, getCellValue(rev, grandTotalRow, y+2), getCellValue(pnl, 2, y+2), TOL, errors);
    }

    const revGrandY1 = getCellValue(rev, grandTotalRow, 2);
    if (revGrandY1 === 0 && EXPECTED_PNL[0].rev > 0) {
      errors.push("Revenue grand total is zero but expected non-zero");
    }
  } else { errors.push("Revenue Schedule tab not found"); }

  const staff = wb.getWorksheet("Staffing & Personnel");
  if (staff) {
    const totalRow = findRowByLabel(staff, "Total Personnel Cost");
    if (totalRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Staff Total Y${y+1}`, getCellValue(staff, totalRow, y+2), EXPECTED_STAFF_TOTAL[y], TOL, errors);
      }
      assertClose("Staff Total=P&L Personnel Y1", getCellValue(staff, totalRow, 2), getCellValue(pnl, 3, 2), TOL, errors);
    } else { errors.push("Staffing: Total Personnel Cost row not found"); }

    const baseTotalRow = findRowByLabel(staff, "Total Annual Personnel Cost");
    if (baseTotalRow) {
      const baseTotal = getCellValue(staff, baseTotalRow, 2);
      const s1 = 55000 * (1 + 0.20 + 0.0765);
      const s2 = 45000 * (1 + 0.20 + 0.0765);
      const s3 = 0.5 * 28000 * (1 + 0.0765);
      assertClose("Staff base = hand-calc", baseTotal, Math.round(s1 + s2 + s3), TOL, errors);
    }
  } else { errors.push("Staffing tab not found"); }

  const expWs = wb.getWorksheet("Operating Expenses");
  if (expWs) {
    const instrRow = findRowByLabel(expWs, "Total INSTRUCTIONAL");
    const techRow = findRowByLabel(expWs, "Total TECHNOLOGY");
    const occRow = findRowByLabel(expWs, "Total OCCUPANCY");
    const adminRow = findRowByLabel(expWs, "Total ADMINISTRATIVE");

    const catRows = [
      { name: "Instructional", row: instrRow, expected: EXPECTED_EXP_CATEGORIES.instructional },
      { name: "Technology", row: techRow, expected: EXPECTED_EXP_CATEGORIES.technology },
      { name: "Occupancy", row: occRow, expected: EXPECTED_EXP_CATEGORIES.occupancy },
      { name: "Administrative", row: adminRow, expected: EXPECTED_EXP_CATEGORIES.administrative },
    ];

    for (const cat of catRows) {
      if (cat.row) {
        for (let y = 0; y < 5; y++) {
          assertClose(`Exp ${cat.name} Y${y+1}`, getCellValue(expWs, cat.row, y+2), cat.expected[y], TOL, errors);
        }
      } else { errors.push(`Expense: ${cat.name} subtotal row not found`); }
    }

    let expSumY1 = 0;
    for (const cat of catRows) {
      if (cat.row) expSumY1 += getCellValue(expWs, cat.row, 2);
    }
    assertClose("Exp Sum=P&L OpEx Y1", expSumY1, getCellValue(pnl, 4, 2), TOL, errors);
  } else { errors.push("Operating Expenses tab not found"); }

  return { passed: errors.length === 0, errors };
}

async function testUnderwritingExport(): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const data = microschoolStartup as unknown as Record<string, unknown>;

  const buffer = await generateUnderwritingWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  console.log(`  Tabs: ${wb.worksheets.map(w => w.name).join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  Total formula cells: ${formulas.length}`);
  const missing = formulas.filter(f => !f.hasResult);
  if (missing.length > 0) {
    for (const m of missing.slice(0, 5)) errors.push(`UW Missing result: ${m.address}`);
    if (missing.length > 5) errors.push(`... and ${missing.length - 5} more`);
  }

  if (buffer.length < 1000) errors.push("File suspiciously small");

  const plWs = wb.getWorksheet("5-Year P&L");
  if (plWs) {
    const revRow = findRowByLabel(plWs, "Total Revenue");
    const niRow = findRowByLabel(plWs, /Profit|Net Income/);
    if (revRow) {
      const rev1 = getCellValue(plWs, revRow, 2);
      console.log(`  P&L Y1 Revenue: $${Math.round(rev1).toLocaleString()}`);
      assertClose("UW P&L Y1 Revenue", rev1, 196667, 100, errors);
    }
    if (niRow && revRow) {
      const totalExpRow = findRowByLabel(plWs, "Total Expenses");
      if (totalExpRow) {
        const rev1 = getCellValue(plWs, revRow, 2);
        const exp1 = getCellValue(plWs, totalExpRow, 2);
        const ni1 = getCellValue(plWs, niRow, 2);
        assertClose("UW P&L NI=Rev-Exp Y1", ni1, rev1 - exp1, TOL, errors);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

async function main() {
  console.log("\n=== E2E Excel Export Formula Results Verification ===\n");

  let totalPass = 0;
  let totalFail = 0;

  console.log("--- Standard Export: Microschool Startup ---");
  const stdResult = await testStandardExport();
  if (stdResult.passed) {
    console.log("  PASS: All formula cells cached, all P&L/Revenue/Staff/Expense values match expected");
    totalPass++;
  } else {
    console.log("  FAIL:");
    stdResult.errors.forEach(e => console.log(`    - ${e}`));
    totalFail++;
  }

  console.log("\n--- Underwriting Export: Microschool Startup ---");
  const uwResult = await testUnderwritingExport();
  if (uwResult.passed) {
    console.log("  PASS: Underwriting export valid, formula results cached, P&L tie-outs match");
    totalPass++;
  } else {
    console.log("  FAIL:");
    uwResult.errors.forEach(e => console.log(`    - ${e}`));
    totalFail++;
  }

  console.log(`\n\n=== RESULTS: ${totalPass} passed, ${totalFail} failed ===\n`);

  if (totalFail > 0) process.exit(1);
  else { console.log("All exports verified successfully.\n"); process.exit(0); }
}

main().catch(err => { console.error("FATAL:", err); process.exit(2); });
