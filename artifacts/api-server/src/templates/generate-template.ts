import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NAVY = "1E293B";
const AMBER = "D97706";
const TEAL = "0D9488";
const WHITE = "FFFFFF";
const CREAM = "FAF9F7";
const LIGHT_GRAY = "F1F5F9";
const GREEN = "16A34A";

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: `FF${WHITE}` }, size: 11, name: "Calibri" };
const LABEL_FONT: Partial<ExcelJS.Font> = { size: 10, name: "Calibri", color: { argb: `FF${NAVY}` } };
const VALUE_FONT: Partial<ExcelJS.Font> = { size: 10, name: "Calibri", color: { argb: `FF${NAVY}` } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, name: "Calibri", color: { argb: `FF${NAVY}` } };

const navyFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY}` } };
const tealFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${TEAL}` } };
const amberFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${AMBER}` } };
const creamFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CREAM}` } };
const lightFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GRAY}` } };
const greenFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };

function col(c: string): string { return c; }

async function generate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const assumptions = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  assumptions.columns = [
    { width: 4 }, { width: 6 }, { width: 36 }, { width: 22 },
  ];

  let r = 1;
  assumptions.mergeCells(`B${r}:D${r}`);
  assumptions.getCell(`B${r}`).value = "SchoolStack Budget — Lender Pro Forma Assumptions";
  assumptions.getCell(`B${r}`).font = TITLE_FONT;
  r += 2;

  const addSectionHeader = (row: number, label: string, fill: ExcelJS.FillPattern) => {
    assumptions.mergeCells(`B${row}:D${row}`);
    assumptions.getCell(`B${row}`).value = label;
    assumptions.getCell(`B${row}`).font = HEADER_FONT;
    assumptions.getCell(`B${row}`).fill = fill;
    assumptions.getCell(`C${row}`).fill = fill;
    assumptions.getCell(`D${row}`).fill = fill;
  };

  const addRow = (row: number, label: string, cellRef: string, defaultVal: string | number = "", fmt?: string) => {
    assumptions.getCell(`C${row}`).value = label;
    assumptions.getCell(`C${row}`).font = LABEL_FONT;
    assumptions.getCell(`C${row}`).fill = creamFill;
    assumptions.getCell(cellRef).font = VALUE_FONT;
    assumptions.getCell(cellRef).fill = creamFill;
    if (defaultVal !== "") assumptions.getCell(cellRef).value = defaultVal as any;
    if (fmt) assumptions.getCell(cellRef).numFmt = fmt;
  };

  addSectionHeader(r, "SCHOOL PROFILE", navyFill); r++;
  r++; addRow(r, "School Name", `D${r}`);
  r++; addRow(r, "State", `D${r}`);
  r++; addRow(r, "School Type", `D${r}`);
  r++; addRow(r, "First Operating Year", `D${r}`, 2026, "#,##0");
  r += 2;

  addSectionHeader(r, "ENROLLMENT FORECAST", tealFill); r++;
  r++; addRow(r, "Year 1 Enrollment", `D${r}`, 0, "#,##0");
  r++; addRow(r, "Year 2 Enrollment", `D${r}`, 0, "#,##0");
  r++; addRow(r, "Year 3 Enrollment", `D${r}`, 0, "#,##0");
  r++; addRow(r, "Year 4 Enrollment", `D${r}`, 0, "#,##0");
  r++; addRow(r, "Year 5 Enrollment", `D${r}`, 0, "#,##0");
  r += 2;

  addSectionHeader(r, "REVENUE ASSUMPTIONS", tealFill); r++;
  r++; addRow(r, "Tuition per Student (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Tuition Annual Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "ESA per Student (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "ESA Annual Growth %", `D${r}`, 0, "0.0%");
  r++; addRow(r, "Other Per-Student Revenue (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Other Revenue Growth %", `D${r}`, 0.02, "0.0%");
  r++; addRow(r, "Collection Rate %", `D${r}`, 0.95, "0.0%");
  r++; addRow(r, "Grants & Contributions (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Grants Growth %", `D${r}`, 0, "0.0%");
  r += 2;

  addSectionHeader(r, "STAFFING ASSUMPTIONS", amberFill); r++;
  r++; addRow(r, "Students per Teacher", `D${r}`, 12, "#,##0");
  r++; addRow(r, "Avg Teacher Salary (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Teacher Salary Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "Admin FTE — Year 1", `D${r}`, 0, "0.0");
  r++; addRow(r, "Admin FTE — Year 2", `D${r}`, 0, "0.0");
  r++; addRow(r, "Admin FTE — Year 3", `D${r}`, 0, "0.0");
  r++; addRow(r, "Admin FTE — Year 4", `D${r}`, 0, "0.0");
  r++; addRow(r, "Admin FTE — Year 5", `D${r}`, 0, "0.0");
  r++; addRow(r, "Avg Admin Salary (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Admin Salary Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "Benefits Burden %", `D${r}`, 0.10, "0.0%");
  r += 2;

  addSectionHeader(r, "OPERATING EXPENSE ASSUMPTIONS", amberFill); r++;
  r++; addRow(r, "Annual Rent (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Rent Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "Other Facility Cost (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Other Facility Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "Program Cost per Student (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Program Cost Growth %", `D${r}`, 0.03, "0.0%");
  r++; addRow(r, "Fixed Operating Costs (Year 1)", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Fixed Operating Growth %", `D${r}`, 0.03, "0.0%");
  r += 2;

  addSectionHeader(r, "CAPITAL & DEBT", navyFill); r++;
  r++; addRow(r, "Starting Cash", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Existing Annual Debt Service", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Proposed Loan Amount", `D${r}`, 0, "$#,##0");
  r++; addRow(r, "Interest Rate %", `D${r}`, 0.08, "0.0%");
  r++; addRow(r, "Term (Years)", `D${r}`, 5, "#,##0");

  const ASSUMPTION_ROWS = {
    schoolName: 5, state: 6, schoolType: 7, firstOperatingYear: 8,
    enrollY1: 11, enrollY2: 12, enrollY3: 13, enrollY4: 14, enrollY5: 15,
    tuitionPerStudent: 18, tuitionGrowth: 19,
    esaPerStudent: 20, esaGrowth: 21,
    otherPerStudent: 22, otherGrowth: 23,
    collectionRate: 24, grantsY1: 25, grantsGrowth: 26,
    studentsPerTeacher: 29, teacherSalary: 30, teacherSalaryGrowth: 31,
    adminFteY1: 32, adminFteY2: 33, adminFteY3: 34, adminFteY4: 35, adminFteY5: 36,
    adminSalary: 37, adminSalaryGrowth: 38, benefitsBurden: 39,
    annualRent: 42, rentGrowth: 43,
    otherFacility: 44, otherFacilityGrowth: 45,
    programPerStudent: 46, programGrowth: 47,
    fixedOps: 48, fixedOpsGrowth: 49,
    startingCash: 52, existingDebt: 53,
    proposedLoan: 54, interestRate: 55, termYears: 56,
  };

  const A = ASSUMPTION_ROWS;
  const aRef = (key: keyof typeof A) => `Assumptions!D${A[key]}`;

  const drivers = wb.addWorksheet("Drivers", { views: [{ showGridLines: false }] });
  drivers.columns = [
    { width: 4 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  let dr = 1;
  drivers.mergeCells(`B${dr}:G${dr}`);
  drivers.getCell(`B${dr}`).value = "Revenue & Expense Drivers";
  drivers.getCell(`B${dr}`).font = TITLE_FONT;
  dr += 2;

  for (let y = 0; y < 5; y++) {
    drivers.getCell(`${String.fromCharCode(67 + y)}${dr}`).value = `Year ${y + 1}`;
    drivers.getCell(`${String.fromCharCode(67 + y)}${dr}`).font = HEADER_FONT;
    drivers.getCell(`${String.fromCharCode(67 + y)}${dr}`).fill = navyFill;
  }
  drivers.getCell(`B${dr}`).fill = navyFill;
  dr++;

  const enrollRef = (y: number) => `${aRef(`enrollY${y + 1}` as keyof typeof A)}`;
  const growthFormula = (baseRef: string, growthRef: string, y: number) =>
    y === 0 ? `=${baseRef}` : `=${baseRef}*(1+${growthRef})^${y}`;

  drivers.getCell(`B${dr}`).value = "Enrollment";
  drivers.getCell(`B${dr}`).font = { ...LABEL_FONT, bold: true };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=${enrollRef(y)}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "#,##0";
  }
  dr++;

  const addDriverRow = (row: number, label: string, baseRef: string, growthRef: string, fmt: string, perStudent?: boolean) => {
    drivers.getCell(`B${row}`).value = label;
    drivers.getCell(`B${row}`).font = LABEL_FONT;
    for (let y = 0; y < 5; y++) {
      const c = String.fromCharCode(67 + y);
      let formula: string;
      if (perStudent) {
        const rateFormula = y === 0 ? baseRef : `${baseRef}*(1+${growthRef})^${y}`;
        formula = `=${enrollRef(y)}*${rateFormula}`;
      } else {
        formula = growthFormula(baseRef, growthRef, y);
      }
      drivers.getCell(`${c}${row}`).value = { formula } as any;
      drivers.getCell(`${c}${row}`).numFmt = fmt;
    }
  };

  addDriverRow(dr, "Tuition Revenue (Net)", aRef("tuitionPerStudent"), aRef("tuitionGrowth"), "$#,##0", true);
  dr++;
  drivers.getCell(`B${dr}`).value = "  × Collection Rate Applied";
  drivers.getCell(`B${dr}`).font = { ...LABEL_FONT, italic: true, color: { argb: "FF94A3B8" } };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=${c}${dr - 1}*${aRef("collectionRate")}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
  }
  const tuitionNetRow = dr;
  dr++;

  addDriverRow(dr, "ESA / School Choice Revenue", aRef("esaPerStudent"), aRef("esaGrowth"), "$#,##0", true);
  const esaRow = dr; dr++;

  addDriverRow(dr, "Other Earned Revenue", aRef("otherPerStudent"), aRef("otherGrowth"), "$#,##0", true);
  const otherRevRow = dr; dr++;

  addDriverRow(dr, "Grants & Contributions", aRef("grantsY1"), aRef("grantsGrowth"), "$#,##0");
  const grantsRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Total Revenue";
  drivers.getCell(`B${dr}`).font = { ...LABEL_FONT, bold: true };
  drivers.getCell(`B${dr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=${c}${tuitionNetRow}+${c}${esaRow}+${c}${otherRevRow}+${c}${grantsRow}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
    drivers.getCell(`${c}${dr}`).fill = lightFill;
    drivers.getCell(`${c}${dr}`).font = { ...VALUE_FONT, bold: true };
  }
  const totalRevRow = dr;
  dr += 2;

  drivers.getCell(`B${dr}`).value = "Teacher FTE (Enrollment ÷ Ratio)";
  drivers.getCell(`B${dr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=CEILING(${enrollRef(y)}/${aRef("studentsPerTeacher")},1)` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "#,##0";
  }
  const teacherFteRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Teacher Salaries";
  drivers.getCell(`B${dr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    const salaryFormula = y === 0 ? aRef("teacherSalary") : `${aRef("teacherSalary")}*(1+${aRef("teacherSalaryGrowth")})^${y}`;
    drivers.getCell(`${c}${dr}`).value = { formula: `=${c}${teacherFteRow}*${salaryFormula}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
  }
  const teacherSalaryRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Admin Salaries";
  drivers.getCell(`B${dr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    const adminFteRef = aRef(`adminFteY${y + 1}` as keyof typeof A);
    const salaryFormula = y === 0 ? aRef("adminSalary") : `${aRef("adminSalary")}*(1+${aRef("adminSalaryGrowth")})^${y}`;
    drivers.getCell(`${c}${dr}`).value = { formula: `=${adminFteRef}*${salaryFormula}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
  }
  const adminSalaryRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Benefits & Payroll Taxes";
  drivers.getCell(`B${dr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=(${c}${teacherSalaryRow}+${c}${adminSalaryRow})*${aRef("benefitsBurden")}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
  }
  const benefitsRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Total Staffing Cost";
  drivers.getCell(`B${dr}`).font = { ...LABEL_FONT, bold: true };
  drivers.getCell(`B${dr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=${c}${teacherSalaryRow}+${c}${adminSalaryRow}+${c}${benefitsRow}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
    drivers.getCell(`${c}${dr}`).fill = lightFill;
    drivers.getCell(`${c}${dr}`).font = { ...VALUE_FONT, bold: true };
  }
  const totalStaffRow = dr;
  dr += 2;

  addDriverRow(dr, "Rent / Lease", aRef("annualRent"), aRef("rentGrowth"), "$#,##0");
  const rentRow_d = dr; dr++;
  addDriverRow(dr, "Other Facility Costs", aRef("otherFacility"), aRef("otherFacilityGrowth"), "$#,##0");
  const otherFacRow = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Program / Curriculum";
  drivers.getCell(`B${dr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    const rateFormula = y === 0 ? aRef("programPerStudent") : `${aRef("programPerStudent")}*(1+${aRef("programGrowth")})^${y}`;
    drivers.getCell(`${c}${dr}`).value = { formula: `=${enrollRef(y)}*${rateFormula}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
  }
  const programRow_d = dr; dr++;

  addDriverRow(dr, "G&A / Technology", aRef("fixedOps"), aRef("fixedOpsGrowth"), "$#,##0");
  const fixedRow_d = dr; dr++;

  drivers.getCell(`B${dr}`).value = "Total Operating Expenses";
  drivers.getCell(`B${dr}`).font = { ...LABEL_FONT, bold: true };
  drivers.getCell(`B${dr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    drivers.getCell(`${c}${dr}`).value = { formula: `=${c}${rentRow_d}+${c}${otherFacRow}+${c}${programRow_d}+${c}${fixedRow_d}` } as any;
    drivers.getCell(`${c}${dr}`).numFmt = "$#,##0";
    drivers.getCell(`${c}${dr}`).fill = lightFill;
    drivers.getCell(`${c}${dr}`).font = { ...VALUE_FONT, bold: true };
  }
  const totalOpexRow = dr;

  const pl = wb.addWorksheet("5-Year P&L", { views: [{ showGridLines: false }] });
  pl.columns = [
    { width: 4 }, { width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  let pr = 1;
  pl.mergeCells(`B${pr}:G${pr}`);
  pl.getCell(`B${pr}`).value = "5-Year Pro Forma Profit & Loss";
  pl.getCell(`B${pr}`).font = TITLE_FONT;
  pr += 2;

  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    pl.getCell(`${c}${pr}`).value = `Year ${y + 1}`;
    pl.getCell(`${c}${pr}`).font = HEADER_FONT;
    pl.getCell(`${c}${pr}`).fill = navyFill;
  }
  pl.getCell(`B${pr}`).fill = navyFill;
  const plHeaderRow = pr;
  pr++;

  const plRef = (sheetRow: number) => (y: number) => `Drivers!${String.fromCharCode(67 + y)}${sheetRow}`;

  const addPLRow = (row: number, label: string, driverRow: number, fmt: string, isBold?: boolean, fill?: ExcelJS.FillPattern) => {
    pl.getCell(`B${row}`).value = label;
    pl.getCell(`B${row}`).font = isBold ? { ...LABEL_FONT, bold: true } : LABEL_FONT;
    if (fill) pl.getCell(`B${row}`).fill = fill;
    for (let y = 0; y < 5; y++) {
      const c = String.fromCharCode(67 + y);
      pl.getCell(`${c}${row}`).value = { formula: `=Drivers!${c}${driverRow}` } as any;
      pl.getCell(`${c}${row}`).numFmt = fmt;
      if (isBold) pl.getCell(`${c}${row}`).font = { ...VALUE_FONT, bold: true };
      if (fill) pl.getCell(`${c}${row}`).fill = fill;
    }
  };

  pl.getCell(`B${pr}`).value = "Enrollment";
  pl.getCell(`B${pr}`).font = { ...LABEL_FONT, bold: true };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    pl.getCell(`${c}${pr}`).value = { formula: `=${enrollRef(y)}` } as any;
    pl.getCell(`${c}${pr}`).numFmt = "#,##0";
  }
  pr += 2;

  addPLRow(pr, "Tuition Revenue (Net)", tuitionNetRow, "$#,##0"); pr++;
  if (true) { addPLRow(pr, "ESA / School Choice", esaRow, "$#,##0"); pr++; }
  addPLRow(pr, "Other Revenue", otherRevRow, "$#,##0"); pr++;
  addPLRow(pr, "Grants & Contributions", grantsRow, "$#,##0"); pr++;
  addPLRow(pr, "Total Revenue", totalRevRow, "$#,##0", true, lightFill);
  const plTotalRevRow = pr;
  pr += 2;

  addPLRow(pr, "Total Staffing", totalStaffRow, "$#,##0", true, lightFill);
  const plStaffRow = pr;
  pr++;
  addPLRow(pr, "Total Operating Expenses", totalOpexRow, "$#,##0", true, lightFill);
  const plOpexRow = pr;
  pr += 2;

  pl.getCell(`B${pr}`).value = "Total Expenses";
  pl.getCell(`B${pr}`).font = { ...LABEL_FONT, bold: true };
  pl.getCell(`B${pr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    pl.getCell(`${c}${pr}`).value = { formula: `=${c}${plStaffRow}+${c}${plOpexRow}` } as any;
    pl.getCell(`${c}${pr}`).numFmt = "$#,##0";
    pl.getCell(`${c}${pr}`).fill = lightFill;
    pl.getCell(`${c}${pr}`).font = { ...VALUE_FONT, bold: true };
  }
  const plTotalExpRow = pr;
  pr++;

  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    pl.getCell(`B${pr}`).value = "Net Operating Income (NOI)";
    pl.getCell(`B${pr}`).font = { ...HEADER_FONT };
    pl.getCell(`B${pr}`).fill = navyFill;
    pl.getCell(`${c}${pr}`).value = { formula: `=${c}${plTotalRevRow}-${c}${plTotalExpRow}` } as any;
    pl.getCell(`${c}${pr}`).numFmt = "$#,##0";
    pl.getCell(`${c}${pr}`).font = { bold: true, color: { argb: `FF${WHITE}` }, size: 10 };
    pl.getCell(`${c}${pr}`).fill = navyFill;
  }
  const plNOIRow = pr;
  pr++;

  pl.getCell(`B${pr}`).value = "Operating Margin";
  pl.getCell(`B${pr}`).font = { ...LABEL_FONT, italic: true };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    pl.getCell(`${c}${pr}`).value = { formula: `=IF(${c}${plTotalRevRow}>0,${c}${plNOIRow}/${c}${plTotalRevRow},0)` } as any;
    pl.getCell(`${c}${pr}`).numFmt = "0.0%";
    pl.getCell(`${c}${pr}`).font = { ...LABEL_FONT, italic: true };
  }

  const cf = wb.addWorksheet("Cash Flow & DSCR", { views: [{ showGridLines: false }] });
  cf.columns = [
    { width: 4 }, { width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  let cr = 1;
  cf.mergeCells(`B${cr}:G${cr}`);
  cf.getCell(`B${cr}`).value = "Cash Flow & Debt Service Coverage";
  cf.getCell(`B${cr}`).font = TITLE_FONT;
  cr += 2;

  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = `Year ${y + 1}`;
    cf.getCell(`${c}${cr}`).font = HEADER_FONT;
    cf.getCell(`${c}${cr}`).fill = navyFill;
  }
  cf.getCell(`B${cr}`).fill = navyFill;
  cr++;

  cf.getCell(`B${cr}`).value = "Net Operating Income";
  cf.getCell(`B${cr}`).font = { ...LABEL_FONT, bold: true };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = { formula: `='5-Year P&L'!${c}${plNOIRow}` } as any;
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
    cf.getCell(`${c}${cr}`).font = { ...VALUE_FONT, bold: true };
  }
  const cfNOIRow = cr;
  cr += 2;

  cf.getCell(`B${cr}`).value = "Existing Debt Service";
  cf.getCell(`B${cr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = { formula: `=${aRef("existingDebt")}` } as any;
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
  }
  const cfExistDebtRow = cr;
  cr++;

  cf.getCell(`B${cr}`).value = "Proposed Loan Debt Service";
  cf.getCell(`B${cr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = {
      formula: `=IF(${aRef("proposedLoan")}>0,PMT(${aRef("interestRate")}/12,${aRef("termYears")}*12,-${aRef("proposedLoan")})*12,0)`
    } as any;
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
  }
  const cfPropDebtRow = cr;
  cr++;

  cf.getCell(`B${cr}`).value = "Total Debt Service";
  cf.getCell(`B${cr}`).font = { ...LABEL_FONT, bold: true };
  cf.getCell(`B${cr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = { formula: `=${c}${cfExistDebtRow}+${c}${cfPropDebtRow}` } as any;
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
    cf.getCell(`${c}${cr}`).fill = lightFill;
    cf.getCell(`${c}${cr}`).font = { ...VALUE_FONT, bold: true };
  }
  const cfTotalDebtRow = cr;
  cr += 2;

  cf.getCell(`B${cr}`).value = "DSCR (NOI ÷ Total Debt Service)";
  cf.getCell(`B${cr}`).font = { ...LABEL_FONT, bold: true };
  cf.getCell(`B${cr}`).fill = greenFill;
  cf.getCell(`B${cr}`).font = { ...HEADER_FONT };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = {
      formula: `=IF(${c}${cfTotalDebtRow}>0,${c}${cfNOIRow}/${c}${cfTotalDebtRow},IF(${c}${cfNOIRow}>0,99.9,0))`
    } as any;
    cf.getCell(`${c}${cr}`).numFmt = "0.00\"x\"";
    cf.getCell(`${c}${cr}`).fill = greenFill;
    cf.getCell(`${c}${cr}`).font = { bold: true, size: 12, color: { argb: `FF${WHITE}` } };
  }
  const cfDSCRRow = cr;
  cr += 2;

  cf.getCell(`B${cr}`).value = "Net Income After Debt";
  cf.getCell(`B${cr}`).font = { ...LABEL_FONT, bold: true };
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    cf.getCell(`${c}${cr}`).value = { formula: `=${c}${cfNOIRow}-${c}${cfTotalDebtRow}` } as any;
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
    cf.getCell(`${c}${cr}`).font = { ...VALUE_FONT, bold: true };
  }
  const cfNetIncRow = cr;
  cr += 2;

  cf.getCell(`B${cr}`).value = "Cumulative Cash";
  cf.getCell(`B${cr}`).font = { ...LABEL_FONT, bold: true };
  cf.getCell(`B${cr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    if (y === 0) {
      cf.getCell(`${c}${cr}`).value = { formula: `=${aRef("startingCash")}+${c}${cfNetIncRow}` } as any;
    } else {
      const prevC = String.fromCharCode(66 + y);
      cf.getCell(`${c}${cr}`).value = { formula: `=${prevC}${cr}+${c}${cfNetIncRow}` } as any;
    }
    cf.getCell(`${c}${cr}`).numFmt = "$#,##0";
    cf.getCell(`${c}${cr}`).fill = lightFill;
    cf.getCell(`${c}${cr}`).font = { ...VALUE_FONT, bold: true };
  }

  const staffDetail = wb.addWorksheet("Staffing", { views: [{ showGridLines: false }] });
  staffDetail.columns = [
    { width: 4 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];
  let sr = 1;
  staffDetail.mergeCells(`B${sr}:G${sr}`);
  staffDetail.getCell(`B${sr}`).value = "Staffing Detail";
  staffDetail.getCell(`B${sr}`).font = TITLE_FONT;
  sr += 2;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    staffDetail.getCell(`${c}${sr}`).value = `Year ${y + 1}`;
    staffDetail.getCell(`${c}${sr}`).font = HEADER_FONT;
    staffDetail.getCell(`${c}${sr}`).fill = amberFill;
  }
  staffDetail.getCell(`B${sr}`).fill = amberFill;
  sr++;
  staffDetail.getCell(`B${sr}`).value = "Teacher FTE";
  staffDetail.getCell(`B${sr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    staffDetail.getCell(`${c}${sr}`).value = { formula: `=Drivers!${c}${teacherFteRow}` } as any;
    staffDetail.getCell(`${c}${sr}`).numFmt = "#,##0";
  }
  sr++;
  staffDetail.getCell(`B${sr}`).value = "Admin FTE";
  staffDetail.getCell(`B${sr}`).font = LABEL_FONT;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    staffDetail.getCell(`${c}${sr}`).value = { formula: `=${aRef(`adminFteY${y+1}` as keyof typeof A)}` } as any;
    staffDetail.getCell(`${c}${sr}`).numFmt = "0.0";
  }
  sr++;
  staffDetail.getCell(`B${sr}`).value = "Total FTE";
  staffDetail.getCell(`B${sr}`).font = { ...LABEL_FONT, bold: true };
  staffDetail.getCell(`B${sr}`).fill = lightFill;
  for (let y = 0; y < 5; y++) {
    const c = String.fromCharCode(67 + y);
    staffDetail.getCell(`${c}${sr}`).value = { formula: `=${c}${sr-2}+${c}${sr-1}` } as any;
    staffDetail.getCell(`${c}${sr}`).numFmt = "0.0";
    staffDetail.getCell(`${c}${sr}`).fill = lightFill;
  }

  const loanSnap = wb.addWorksheet("Loan Snapshot", { views: [{ showGridLines: false }] });
  loanSnap.columns = [
    { width: 4 }, { width: 30 }, { width: 22 },
  ];
  let lr = 1;
  loanSnap.mergeCells(`B${lr}:C${lr}`);
  loanSnap.getCell(`B${lr}`).value = "Proposed Loan Summary";
  loanSnap.getCell(`B${lr}`).font = TITLE_FONT;
  lr += 2;

  const addLoanRow = (row: number, label: string, ref: string, fmt: string) => {
    loanSnap.getCell(`B${row}`).value = label;
    loanSnap.getCell(`B${row}`).font = LABEL_FONT;
    loanSnap.getCell(`C${row}`).value = { formula: `=${ref}` } as any;
    loanSnap.getCell(`C${row}`).numFmt = fmt;
    loanSnap.getCell(`C${row}`).font = VALUE_FONT;
  };

  addLoanRow(lr, "Loan Amount", aRef("proposedLoan"), "$#,##0"); lr++;
  addLoanRow(lr, "Interest Rate", aRef("interestRate"), "0.0%"); lr++;
  addLoanRow(lr, "Term (Years)", aRef("termYears"), "#,##0"); lr++;
  loanSnap.getCell(`B${lr}`).value = "Annual Debt Service";
  loanSnap.getCell(`B${lr}`).font = { ...LABEL_FONT, bold: true };
  loanSnap.getCell(`C${lr}`).value = {
    formula: `=IF(${aRef("proposedLoan")}>0,PMT(${aRef("interestRate")}/12,${aRef("termYears")}*12,-${aRef("proposedLoan")})*12,0)`
  } as any;
  loanSnap.getCell(`C${lr}`).numFmt = "$#,##0";
  loanSnap.getCell(`C${lr}`).font = { ...VALUE_FONT, bold: true };
  lr += 2;

  loanSnap.getCell(`B${lr}`).value = "Year 1 DSCR";
  loanSnap.getCell(`B${lr}`).font = { ...LABEL_FONT, bold: true };
  loanSnap.getCell(`B${lr}`).fill = greenFill;
  loanSnap.getCell(`B${lr}`).font = HEADER_FONT;
  loanSnap.getCell(`C${lr}`).value = { formula: `='Cash Flow & DSCR'!C${cfDSCRRow}` } as any;
  loanSnap.getCell(`C${lr}`).numFmt = "0.00\"x\"";
  loanSnap.getCell(`C${lr}`).fill = greenFill;
  loanSnap.getCell(`C${lr}`).font = { bold: true, size: 14, color: { argb: `FF${WHITE}` } };

  const summary = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  summary.columns = [
    { width: 4 }, { width: 30 }, { width: 22 },
  ];
  let smr = 1;
  summary.mergeCells(`B${smr}:C${smr}`);
  summary.getCell(`B${smr}`).value = "Model Summary";
  summary.getCell(`B${smr}`).font = TITLE_FONT;
  smr += 2;

  summary.getCell(`B${smr}`).value = "School Name";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=${aRef("schoolName")}` } as any;
  smr++;
  summary.getCell(`B${smr}`).value = "School Type";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=${aRef("schoolType")}` } as any;
  smr++;
  summary.getCell(`B${smr}`).value = "State";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=${aRef("state")}` } as any;
  smr++;
  summary.getCell(`B${smr}`).value = "Opening Year";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=${aRef("firstOperatingYear")}` } as any;
  smr += 2;

  summary.getCell(`B${smr}`).value = "Year 5 Enrollment";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=${aRef("enrollY5")}` } as any;
  summary.getCell(`C${smr}`).numFmt = "#,##0";
  smr++;
  summary.getCell(`B${smr}`).value = "Year 5 Revenue";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `=Drivers!G${totalRevRow}` } as any;
  summary.getCell(`C${smr}`).numFmt = "$#,##0";
  smr++;
  summary.getCell(`B${smr}`).value = "Year 5 NOI";
  summary.getCell(`B${smr}`).font = LABEL_FONT;
  summary.getCell(`C${smr}`).value = { formula: `='5-Year P&L'!G${plNOIRow}` } as any;
  summary.getCell(`C${smr}`).numFmt = "$#,##0";
  smr += 2;

  summary.mergeCells(`B${smr}:C${smr}`);
  summary.getCell(`B${smr}`).value = "Generated by SchoolStack Budget (schoolstack.ai)";
  summary.getCell(`B${smr}`).font = { size: 8, color: { argb: "FF94A3B8" }, italic: true };

  const outPath = path.join(__dirname, "SchoolStack_Prelaunch_ProForma_Template_v1.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log(`Template written to ${outPath}`);
}

generate().catch(console.error);
