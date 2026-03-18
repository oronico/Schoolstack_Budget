import ExcelJS from "exceljs";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-export.js";
import { generateUnderwritingWorkbook as generateUnderwritingV2 } from "../src/lib/underwriting-workbook.js";
import { microschoolStartup, charterPublicFunding } from "./sample-payloads.js";

interface FormulaCheck {
  address: string;
  formula: string;
  result: unknown;
  hasResult: boolean;
}

function scanFormulaCells(wb: ExcelJS.Workbook): FormulaCheck[] {
  const checks: FormulaCheck[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row, _rowNum) => {
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
  ws.eachRow((_row, rn) => {
    if (found) return;
    const label = String(ws.getCell(rn, 1).value || "");
    if (typeof pattern === "string" ? label.includes(pattern) : pattern.test(label)) {
      found = rn;
    }
  });
  return found;
}

function findLastRowByLabel(ws: ExcelJS.Worksheet, pattern: string): number | null {
  let found: number | null = null;
  ws.eachRow((_row, rn) => {
    const label = String(ws.getCell(rn, 1).value || "");
    if (label.includes(pattern)) {
      found = rn;
    }
  });
  return found;
}

function assertClose(label: string, actual: number, expected: number, tolerance: number, errors: string[]): void {
  if (Math.abs(actual - expected) > tolerance) {
    errors.push(`${label}: got ${Math.round(actual)}, expected ${expected} (diff=${Math.round(actual - expected)})`);
  }
}

const TOL = 1;

const EXPECTED_PNL = [
  { rev: 221600, pers: 118934, opex: 48600, capDebt: 6960, totalExp: 174494, ni: 47106, cumNI: 47106 },
  { rev: 340512, pers: 147003, opex: 54963, capDebt: 6960, totalExp: 208926, ni: 131586, cumNI: 178692 },
  { rev: 427946, pers: 151413, opex: 59946, capDebt: 6960, totalExp: 218319, ni: 209627, cumNI: 388319 },
  { rev: 500518, pers: 155955, opex: 64338, capDebt: 6960, totalExp: 227253, ni: 273265, cumNI: 661584 },
  { rev: 516085, pers: 160634, opex: 66214, capDebt: 6960, totalExp: 233808, ni: 282277, cumNI: 943861 },
];

const EXPECTED_REV_CATEGORIES = {
  tuition: [147000, 226980, 285582, 334075, 343900],
  tuitionOffsets: [-14400, -22248, -28008, -32782, -33765],
  schoolChoice: [84000, 129780, 163372, 191225, 196950],
};

const EXPECTED_STAFF_TOTAL = [118934, 147003, 151413, 155955, 160634];

const EXPECTED_EXP_CATEGORIES = {
  instructional: [6000, 9270, 11660, 13650, 14050],
  technology: [3600, 5562, 6996, 8200, 8450],
  occupancy: [36000, 37056, 38138, 39257, 40402],
  administrative: [3000, 3075, 3152, 3231, 3312],
};

const EXPECTED_CAP_DEBT = [6960, 6960, 6960, 6960, 6960];

const EXPECTED_UW_PNL = [
  { rev: 184667, pers: 118934, opex: 40500, capDebt: 6960, totalExp: 166394, ni: 18273, cumNI: 18273 },
  { rev: 340512, pers: 147003, opex: 54885, capDebt: 6960, totalExp: 208848, ni: 131665, cumNI: 149938 },
  { rev: 427946, pers: 151413, opex: 59774, capDebt: 6960, totalExp: 218147, ni: 209800, cumNI: 359738 },
  { rev: 500518, pers: 155955, opex: 64012, capDebt: 6960, totalExp: 226927, ni: 273591, cumNI: 633329 },
  { rev: 516085, pers: 160634, opex: 65776, capDebt: 6960, totalExp: 233370, ni: 282716, cumNI: 916045 },
];

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
    const tuitionRow = findRowByLabel(rev, "Total TUITION & STUDENT FEES");
    const offsetRow = findRowByLabel(rev, "Total TUITION OFFSETS");
    const schoolChoiceRow = findRowByLabel(rev, /Total SCHOOL CHOICE/);
    let grandTotalRow = 0;
    rev.eachRow((_: ExcelJS.Row, rn: number) => { grandTotalRow = rn; });

    if (tuitionRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Rev Tuition Y${y+1}`, getCellValue(rev, tuitionRow, y+2), EXPECTED_REV_CATEGORIES.tuition[y], TOL, errors);
      }
    } else { errors.push("Revenue: Tuition subtotal row not found"); }

    if (offsetRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Rev TuitionOffset Y${y+1}`, getCellValue(rev, offsetRow, y+2), EXPECTED_REV_CATEGORIES.tuitionOffsets[y], TOL, errors);
      }
      const pobY1 = getCellValue(rev, offsetRow, 2);
      const tuitionBaseY1 = 12000 * 12;
      const expectedPobY1 = -(tuitionBaseY1 * 0.10);
      assertClose("percent_of_base: 10% of Tuition Y1", pobY1, expectedPobY1, TOL, errors);
    } else { errors.push("Revenue: Tuition Offsets subtotal row not found"); }

    if (schoolChoiceRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`Rev SchoolChoice Y${y+1}`, getCellValue(rev, schoolChoiceRow, y+2), EXPECTED_REV_CATEGORIES.schoolChoice[y], TOL, errors);
      }
    } else { errors.push("Revenue: School Choice subtotal row not found"); }

    for (let y = 0; y < 5; y++) {
      assertClose(`Rev GrandTotal=P&L Rev Y${y+1}`, getCellValue(rev, grandTotalRow, y+2), getCellValue(pnl, 2, y+2), TOL, errors);
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
      assertClose("Staff base=hand-calc(55k+45k+0.5×28k with ben/tax)", baseTotal, Math.round(s1 + s2 + s3), TOL, errors);
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

  const capWs = wb.getWorksheet("Capital & Debt");
  if (capWs) {
    const capTotalRow = findRowByLabel(capWs, "TOTAL CAPITAL & DEBT");
    if (capTotalRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`CapDebt Total Y${y+1}`, getCellValue(capWs, capTotalRow, y+2), EXPECTED_CAP_DEBT[y], TOL, errors);
      }
      assertClose("CapDebt Total=P&L CapDebt Y1", getCellValue(capWs, capTotalRow, 2), getCellValue(pnl, 5, 2), TOL, errors);
    } else { errors.push("Capital & Debt: TOTAL row not found"); }

    const loanRow = findRowByLabel(capWs, "Equipment Loan");
    if (loanRow) {
      const pmt = getCellValue(capWs, loanRow, 2);
      const r = 0.06 / 12;
      const n = 60;
      const expectedPmt = Math.round(30000 * r / (1 - Math.pow(1 + r, -n)) * 12);
      assertClose("Loan PMT=hand-calc(30k@6%/5yr)", pmt, expectedPmt, TOL, errors);
    } else { errors.push("Capital & Debt: Equipment Loan row not found"); }
  } else { errors.push("Capital & Debt tab not found"); }

  return { passed: errors.length === 0, errors };
}

async function testUnderwritingExport(): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const data = microschoolStartup as unknown as Record<string, unknown>;

  const buffer = await generateUnderwritingWorkbook(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const tabs = wb.worksheets.map(w => w.name);
  console.log(`  Tabs: ${tabs.join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  Total formula cells: ${formulas.length}`);
  const missing = formulas.filter(f => !f.hasResult);
  if (missing.length > 0) {
    for (const m of missing.slice(0, 5)) errors.push(`UW Missing result: ${m.address}`);
    if (missing.length > 5) errors.push(`... and ${missing.length - 5} more`);
  }

  if (buffer.length < 1000) errors.push("File suspiciously small");

  const plWs = wb.getWorksheet("5-Year P&L");
  if (!plWs) { errors.push("5-Year P&L tab not found"); return { passed: false, errors }; }

  const revRow = findRowByLabel(plWs, "Total Revenue");
  const persRow = findRowByLabel(plWs, "Personnel");
  const opexRow = findRowByLabel(plWs, "Operating Expenses");
  const capDebtRow = findRowByLabel(plWs, /Capital.*Debt/);
  const totalExpRow = findRowByLabel(plWs, "Total Expenses");
  const niRow = findRowByLabel(plWs, /Profit.*Loss/);
  const cumNIRow = findRowByLabel(plWs, "Cumulative Net Income");

  if (!revRow || !persRow || !opexRow || !totalExpRow || !niRow || !cumNIRow) {
    errors.push(`UW P&L missing key rows: rev=${revRow} pers=${persRow} opex=${opexRow} totalExp=${totalExpRow} ni=${niRow} cumNI=${cumNIRow}`);
    return { passed: false, errors };
  }

  for (let y = 0; y < 5; y++) {
    const c = y + 2;
    const yr = `UW Y${y + 1}`;
    const exp = EXPECTED_UW_PNL[y];

    assertClose(`${yr} Revenue`, getCellValue(plWs, revRow, c), exp.rev, TOL, errors);
    assertClose(`${yr} Personnel`, getCellValue(plWs, persRow, c), exp.pers, TOL, errors);
    assertClose(`${yr} OpEx`, getCellValue(plWs, opexRow, c), exp.opex, TOL, errors);
    if (capDebtRow) {
      assertClose(`${yr} CapDebt`, getCellValue(plWs, capDebtRow, c), exp.capDebt, TOL, errors);
    }
    assertClose(`${yr} TotalExp`, getCellValue(plWs, totalExpRow, c), exp.totalExp, TOL, errors);
    assertClose(`${yr} Net Income`, getCellValue(plWs, niRow, c), exp.ni, TOL, errors);
    assertClose(`${yr} Cumulative NI`, getCellValue(plWs, cumNIRow, c), exp.cumNI, TOL, errors);

    const actNI = getCellValue(plWs, revRow, c) - getCellValue(plWs, totalExpRow, c);
    assertClose(`${yr} NI=Rev-TotalExp`, getCellValue(plWs, niRow, c), actNI, TOL, errors);
  }

  console.log(`  P&L Y1 Revenue: $${Math.round(getCellValue(plWs, revRow, 2)).toLocaleString()}`);

  const dscrWs = wb.getWorksheet("DSCR & Covenants");
  if (dscrWs) {
    const noiRow = findRowByLabel(dscrWs, "Net Operating Income");
    const debtSvcRow = findRowByLabel(dscrWs, "Annual Debt Service");
    if (noiRow && debtSvcRow) {
      const noi1 = getCellValue(dscrWs, noiRow, 2);
      const ds1 = getCellValue(dscrWs, debtSvcRow, 2);
      assertClose("UW DSCR NOI Y1", noi1, 25233, TOL, errors);
      assertClose("UW DSCR Debt Service Y1", ds1, 6960, TOL, errors);
      if (ds1 > 0) {
        const expectedDSCR = noi1 / ds1;
        let dscrRow: number | null = null;
        dscrWs.eachRow((_row, rn) => {
          if (dscrRow) return;
          const label = String(dscrWs.getCell(rn, 1).value || "");
          if (label === "DSCR") dscrRow = rn;
        });
        if (dscrRow) {
          assertClose("UW DSCR ratio Y1", getCellValue(dscrWs, dscrRow, 2), expectedDSCR, 0.01, errors);
        }
      }
    }
  }

  const bsWs = wb.getWorksheet("5-Year Balance Sheet");
  if (bsWs) {
    const balCheckRow = findRowByLabel(bsWs, "BALANCE CHECK");
    if (balCheckRow) {
      for (let y = 0; y < 5; y++) {
        assertClose(`UW BS Balance Check Y${y+1}`, getCellValue(bsWs, balCheckRow, y + 2), 0, TOL, errors);
      }
    }
    const totalAssetsRow = findRowByLabel(bsWs, "Total Assets");
    if (totalAssetsRow) {
      assertClose("UW BS Total Assets Y1", getCellValue(bsWs, totalAssetsRow, 2), 48273, TOL, errors);
    }
  }

  const cashWs = wb.getWorksheet("Cash Flow Monthly Y1");
  if (cashWs) {
    const endCashRow = findRowByLabel(cashWs, /Ending Cash.*Month 12/);
    if (endCashRow) {
      const endCash = getCellValue(cashWs, endCashRow, 2);
      assertClose("UW Cash Flow ending cash", endCash, 48273, TOL, errors);
    }
  }

  return { passed: errors.length === 0, errors };
}

async function testUnderwritingV2CrossTab(): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const data = charterPublicFunding as unknown as Record<string, unknown>;

  const rawWb = await generateUnderwritingV2(data);
  const buffer = await rawWb.xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as Buffer);

  const tabs = wb.worksheets.map(w => w.name);
  console.log(`  Tabs: ${tabs.join(", ")}`);

  const formulas = scanFormulaCells(wb);
  console.log(`  Total formula cells: ${formulas.length}`);
  const missing = formulas.filter(f => !f.hasResult);
  if (missing.length > 0) {
    for (const m of missing.slice(0, 5)) errors.push(`V2 Missing result: ${m.address}`);
    if (missing.length > 5) errors.push(`... and ${missing.length - 5} more`);
  }

  const cfWs = wb.getWorksheet("Monthly Cash Flow Y1");
  const bsWs = wb.getWorksheet("Balance Sheet");
  const dsWs = wb.getWorksheet("Debt Schedule");
  const osWs = wb.getWorksheet("5-Year Operating Stmt");
  const dscrWs = wb.getWorksheet("DSCR & Covenants");

  if (!cfWs) { errors.push("Monthly Cash Flow Y1 tab not found"); return { passed: false, errors }; }
  if (!bsWs) { errors.push("Balance Sheet tab not found"); return { passed: false, errors }; }
  if (!dsWs) { errors.push("Debt Schedule tab not found"); return { passed: false, errors }; }
  if (!osWs) { errors.push("5-Year Operating Stmt tab not found"); return { passed: false, errors }; }

  const cfEndCashRow = findRowByLabel(cfWs, /Ending Cash.*Month 12/);
  const cfCumCashRow = findRowByLabel(cfWs, "Cumulative Cash");
  const bsCashRow = findRowByLabel(bsWs, "Cash & Equivalents");
  const bsLtdRow = findRowByLabel(bsWs, "Long-Term Debt");
  const bsTaRow = findRowByLabel(bsWs, "Total Assets");
  const bsTlRow = findRowByLabel(bsWs, "Total Liabilities");
  const bsEqRow = findRowByLabel(bsWs, /Equity|Net Assets/);
  const bsCheckRow = findRowByLabel(bsWs, /Balance Check/);
  let dsEbRow = findRowByLabel(dsWs, "Total Outstanding Debt");
  if (!dsEbRow) dsEbRow = findLastRowByLabel(dsWs, "Ending Balance");
  const osNiRow = findRowByLabel(osWs, /Net Income|Change in Net Assets|Profit.*Loss|Surplus/);

  if (!cfEndCashRow) errors.push("CF: Ending Cash row not found");
  if (!cfCumCashRow) errors.push("CF: Cumulative Cash row not found");
  if (!bsCashRow) errors.push("BS: Cash row not found");
  if (!bsLtdRow) errors.push("BS: Long-Term Debt row not found");
  if (!bsTaRow) errors.push("BS: Total Assets row not found");
  if (!bsTlRow) errors.push("BS: Total Liabilities row not found");
  if (!bsEqRow) errors.push("BS: Equity row not found");
  if (!dsEbRow) errors.push("DS: Ending Balance row not found");
  if (!osNiRow) errors.push("OS: Net Income row not found");

  if (errors.length > 0) return { passed: false, errors };

  const cfEndingCash = getCellValue(cfWs, cfEndCashRow!, 2);
  const cfCumCashM12 = getCellValue(cfWs, cfCumCashRow!, 13);

  console.log(`  CF Ending Cash: $${Math.round(cfEndingCash).toLocaleString()}`);
  console.log(`  CF Cumulative Cash M12: $${Math.round(cfCumCashM12).toLocaleString()}`);

  assertClose("CROSS-TAB: CF Ending Cash = CF Cumulative M12", cfEndingCash, cfCumCashM12, TOL, errors);

  const bsCashY1 = getCellValue(bsWs, bsCashRow!, 2);
  assertClose("CROSS-TAB: CF Ending Cash = BS Cash Y1", cfEndingCash, bsCashY1, TOL, errors);

  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const dsDebt = getCellValue(dsWs, dsEbRow!, col);
    const bsDebt = getCellValue(bsWs, bsLtdRow!, col);
    assertClose(`CROSS-TAB: DS Ending Balance = BS LTD Y${y + 1}`, dsDebt, bsDebt, TOL, errors);
  }

  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const ta = getCellValue(bsWs, bsTaRow!, col);
    const tl = getCellValue(bsWs, bsTlRow!, col);
    const eq = getCellValue(bsWs, bsEqRow!, col);
    assertClose(`BS A=L+E Y${y + 1}`, ta, tl + eq, TOL, errors);

    const check = getCellValue(bsWs, bsCheckRow!, col);
    assertClose(`BS Balance Check Y${y + 1}`, check, 0, TOL, errors);
  }

  let cumNI = 0;
  for (let y = 1; y < 5; y++) {
    const col = y + 2;
    cumNI += getCellValue(osWs, osNiRow!, col);
    const bsCash = getCellValue(bsWs, bsCashRow!, col);
    assertClose(`CROSS-TAB: BS Cash Y${y + 1} = CF Y1 Cash + cum NI`, bsCash, bsCashY1 + cumNI, TOL, errors);
  }

  if (dscrWs) {
    const dscrCashRow = findRowByLabel(dscrWs, /Ending Cash|Cash Balance/);
    if (dscrCashRow) {
      for (let y = 0; y < 5; y++) {
        const col = y + 2;
        const dscrCash = getCellValue(dscrWs, dscrCashRow, col);
        const bsCash = getCellValue(bsWs, bsCashRow!, col);
        assertClose(`CROSS-TAB: DSCR Cash = BS Cash Y${y + 1}`, dscrCash, bsCash, TOL, errors);
      }
    }
  }

  const crossTabFormulas = formulas.filter(f =>
    f.formula.includes("'Monthly Cash Flow Y1'!") ||
    f.formula.includes("'5-Year Operating Stmt'!") ||
    f.formula.includes("'Debt Schedule'!")
  );
  console.log(`  Cross-tab formula cells: ${crossTabFormulas.length}`);
  if (crossTabFormulas.length === 0) {
    errors.push("No cross-tab formulas found — Balance Sheet should reference other tabs");
  }

  return { passed: errors.length === 0, errors };
}

async function main() {
  console.log("\n=== E2E Excel Export Formula Results Verification ===");
  console.log("  Fixture: microschoolStartup (std/UW v1), charterSchool (UW v2 cross-tab)\n");

  let totalPass = 0;
  let totalFail = 0;

  console.log("--- Standard Export ---");
  const stdResult = await testStandardExport();
  if (stdResult.passed) {
    console.log("  PASS: All formula cells cached, P&L/Revenue/Staff/Expense/CapDebt values match expected");
    totalPass++;
  } else {
    console.log("  FAIL:");
    stdResult.errors.forEach(e => console.log(`    - ${e}`));
    totalFail++;
  }

  console.log("\n--- Underwriting Export (v1) ---");
  const uwResult = await testUnderwritingExport();
  if (uwResult.passed) {
    console.log("  PASS: All formula cells cached, full 5-year P&L/BS/DSCR/Cash verified");
    totalPass++;
  } else {
    console.log("  FAIL:");
    uwResult.errors.forEach(e => console.log(`    - ${e}`));
    totalFail++;
  }

  console.log("\n--- Underwriting V2 Cross-Tab Consistency ---");
  const v2Result = await testUnderwritingV2CrossTab();
  if (v2Result.passed) {
    console.log("  PASS: All cross-tab assertions verified (CF↔BS cash, DS↔BS debt, BS A=L+E, NI accumulation)");
    totalPass++;
  } else {
    console.log("  FAIL:");
    v2Result.errors.forEach(e => console.log(`    - ${e}`));
    totalFail++;
  }

  console.log(`\n=== RESULTS: ${totalPass} passed, ${totalFail} failed ===\n`);

  if (totalFail > 0) process.exit(1);
  else { console.log("All exports verified successfully.\n"); process.exit(0); }
}

main().catch(err => { console.error("FATAL:", err); process.exit(2); });
