import ExcelJS from "exceljs";

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  openingYear?: number;
  currentStudents?: number;
  maxCapacity?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface Revenue {
  tuitionPerStudent?: number;
  esaRevenuePerStudent?: number;
  otherRevenuePerStudent?: number;
  scholarshipRate?: number;
  annualFundraising?: number;
}

interface Staffing {
  studentsPerTeacher?: number;
  teacherSalary?: number;
  adminStaffCount?: number;
  adminSalary?: number;
  founderSalary?: number;
  benefitsRate?: number;
}

interface Facilities {
  monthlyRent?: number;
  annualRentIncrease?: number;
  annualUtilities?: number;
  annualInsurance?: number;
  curriculumCostPerStudent?: number;
  techCostPerStudent?: number;
  annualMarketing?: number;
  otherAnnualExpenses?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  revenue?: Revenue;
  staffing?: Staffing;
  facilities?: Facilities;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
  name: "Calibri",
};
const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EDF2" },
};
const SECTION_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 11,
  color: { argb: "FF1E293B" },
  name: "Calibri",
};
const INPUT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFDE7" },
};
const INPUT_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD4A574" } },
  bottom: { style: "thin", color: { argb: "FFD4A574" } },
  left: { style: "thin", color: { argb: "FFD4A574" } },
  right: { style: "thin", color: { argb: "FFD4A574" } },
};
const NORMAL_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BOLD_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const CURRENCY_FORMAT = '#,##0.00;[Red](#,##0.00);"-"';
const CURRENCY_WHOLE_FORMAT = '#,##0;[Red](#,##0);"-"';
const PERCENT_FORMAT = '0.0%;[Red](0.0%);"-"';
const NUMBER_FORMAT = '#,##0;[Red](#,##0);"-"';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  }
  ws.getRow(row).height = 28;
}

function styleSectionRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL;
    cell.font = SECTION_FONT;
    cell.border = THIN_BORDER;
  }
  ws.getRow(row).height = 24;
}

function styleInputCell(cell: ExcelJS.Cell) {
  cell.fill = INPUT_FILL;
  cell.border = INPUT_BORDER;
  cell.font = NORMAL_FONT;
}

function styleDataCell(cell: ExcelJS.Cell) {
  cell.font = NORMAL_FONT;
  cell.border = THIN_BORDER;
}

function styleBoldDataCell(cell: ExcelJS.Cell) {
  cell.font = BOLD_FONT;
  cell.border = THIN_BORDER;
}

function schoolTypeDisplay(type?: string): string {
  switch (type) {
    case "microschool": return "Microschool";
    case "private_school": return "Private School";
    case "charter_school": return "Charter School";
    case "other": return "Other";
    default: return type || "";
  }
}

export async function generateWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const rev = data.revenue || {};
  const st = data.staffing || {};
  const fac = data.facilities || {};

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const assumptionsWs = wb.addWorksheet("Assumptions");
  const enrollmentWs = wb.addWorksheet("Enrollment");
  const revenueWs = wb.addWorksheet("Revenue");
  const staffingWs = wb.addWorksheet("Staffing");
  const opexWs = wb.addWorksheet("Operating Expenses");
  const fiveYearWs = wb.addWorksheet("Five-Year Model");
  const summaryWs = wb.addWorksheet("Summary");

  buildAssumptionsTab(assumptionsWs, sp, en, rev, st, fac);
  buildEnrollmentTab(enrollmentWs);
  buildRevenueTab(revenueWs);
  buildStaffingTab(staffingWs);
  buildOpexTab(opexWs);
  buildFiveYearTab(fiveYearWs);
  buildSummaryTab(summaryWs, sp);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function buildAssumptionsTab(ws: ExcelJS.Worksheet, sp: SchoolProfile, en: Enrollment, rev: Revenue, st: Staffing, fac: Facilities) {
  ws.columns = [
    { width: 35 },
    { width: 20 },
    { width: 5 },
    { width: 35 },
    { width: 20 },
  ];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget — Assumptions";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 5);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL PROFILE";

  r = 4;
  ws.getCell(r, 1).value = "School Name"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.schoolName || ""; styleInputCell(ws.getCell(r, 2));

  r = 5;
  ws.getCell(r, 1).value = "State"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.state || ""; styleInputCell(ws.getCell(r, 2));

  r = 6;
  ws.getCell(r, 1).value = "School Type"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = schoolTypeDisplay(sp.schoolType); styleInputCell(ws.getCell(r, 2));

  r = 7;
  ws.getCell(r, 1).value = "Opening Year"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.openingYear || 0; styleInputCell(ws.getCell(r, 2));

  r = 8;
  ws.getCell(r, 1).value = "Current Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.currentStudents || 0; styleInputCell(ws.getCell(r, 2));

  r = 9;
  ws.getCell(r, 1).value = "Max Student Capacity"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.maxCapacity || 0; styleInputCell(ws.getCell(r, 2));

  r = 11;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "ENROLLMENT (Students by Year)";

  r = 12; ws.getCell(r, 1).value = "Year 1 Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = en.year1 || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 13; ws.getCell(r, 1).value = "Year 2 Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = en.year2 || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 14; ws.getCell(r, 1).value = "Year 3 Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = en.year3 || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 15; ws.getCell(r, 1).value = "Year 4 Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = en.year4 || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 16; ws.getCell(r, 1).value = "Year 5 Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = en.year5 || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;

  r = 18;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "REVENUE";

  r = 19; ws.getCell(r, 1).value = "Annual Tuition per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.tuitionPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 20; ws.getCell(r, 1).value = "ESA / Voucher Revenue per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.esaRevenuePerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 21; ws.getCell(r, 1).value = "Other Annual Revenue per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.otherRevenuePerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 22; ws.getCell(r, 1).value = "Scholarship / Discount Rate"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (rev.scholarshipRate || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r = 23; ws.getCell(r, 1).value = "Annual Fundraising / Grants"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.annualFundraising || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 25;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "STAFFING";

  r = 26; ws.getCell(r, 1).value = "Students per Teacher"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.studentsPerTeacher || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 27; ws.getCell(r, 1).value = "Annual Teacher Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.teacherSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 28; ws.getCell(r, 1).value = "Number of Admin Staff"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.adminStaffCount || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 29; ws.getCell(r, 1).value = "Annual Admin Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.adminSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 30; ws.getCell(r, 1).value = "Founder / Leader Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.founderSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 31; ws.getCell(r, 1).value = "Benefits Rate"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (st.benefitsRate || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;

  r = 33;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "FACILITIES & OPERATING COSTS";

  r = 34; ws.getCell(r, 1).value = "Monthly Rent"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.monthlyRent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 35; ws.getCell(r, 1).value = "Annual Rent Increase"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (fac.annualRentIncrease || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r = 36; ws.getCell(r, 1).value = "Annual Utilities"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualUtilities || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 37; ws.getCell(r, 1).value = "Annual Insurance"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualInsurance || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 38; ws.getCell(r, 1).value = "Curriculum / Materials Cost per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.curriculumCostPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 39; ws.getCell(r, 1).value = "Technology Cost per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.techCostPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 40; ws.getCell(r, 1).value = "Annual Marketing / Outreach"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualMarketing || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 41; ws.getCell(r, 1).value = "Other Annual Operating Expenses"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.otherAnnualExpenses || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
}

function buildEnrollmentTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  ws.getCell(2, 1).value = "Students"; ws.getCell(2, 1).font = BOLD_FONT;
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(2, y + 2);
    cell.value = { formula: `Assumptions!B${12 + y}` };
    cell.numFmt = NUMBER_FORMAT;
    styleDataCell(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildRevenueTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const rows = [
    { label: "Students", row: 2, bold: false },
    { label: "Tuition Revenue", row: 3, bold: false },
    { label: "ESA / Voucher Revenue", row: 4, bold: false },
    { label: "Other Earned Revenue", row: 5, bold: false },
    { label: "Gross Revenue", row: 6, bold: true },
    { label: "Scholarship Discount", row: 7, bold: false },
    { label: "Fundraising / Grants", row: 8, bold: false },
    { label: "Net Revenue", row: 9, bold: true },
  ];

  for (const item of rows) {
    const r = item.row;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const studentRef = `Enrollment!${String.fromCharCode(66 + y)}2`;

      switch (item.label) {
        case "Students":
          cell.value = { formula: studentRef };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case "Tuition Revenue":
          cell.value = { formula: `${studentRef}*Assumptions!B19` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "ESA / Voucher Revenue":
          cell.value = { formula: `${studentRef}*Assumptions!B20` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Other Earned Revenue":
          cell.value = { formula: `${studentRef}*Assumptions!B21` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Gross Revenue":
          cell.value = { formula: `SUM(${c(r-3,col)}:${c(r-1,col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Scholarship Discount":
          cell.value = { formula: `-(${c(3,col)})*Assumptions!B22` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Fundraising / Grants":
          cell.value = { formula: `Assumptions!B23` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Net Revenue":
          cell.value = { formula: `${c(6,col)}+${c(7,col)}+${c(8,col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
      }
      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 6, 6);
  styleSectionRow(ws, 9, 6);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildStaffingTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const rowDefs = [
    { label: "Students", row: 2 },
    { label: "Teachers (Rounded Up)", row: 3 },
    { label: "Teacher Payroll", row: 4 },
    { label: "Admin Payroll", row: 5 },
    { label: "Founder / Leader Salary", row: 6 },
    { label: "Total Salaries", row: 7 },
    { label: "Benefits", row: 8 },
    { label: "Total Staffing Cost", row: 9 },
  ];

  for (const item of rowDefs) {
    const r = item.row;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = (r === 7 || r === 9) ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const studentRef = `Enrollment!${String.fromCharCode(66 + y)}2`;

      switch (item.label) {
        case "Students":
          cell.value = { formula: studentRef };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case "Teachers (Rounded Up)":
          cell.value = { formula: `IF(Assumptions!B26=0,0,ROUNDUP(${studentRef}/Assumptions!B26,0))` };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case "Teacher Payroll":
          cell.value = { formula: `${c(3,col)}*Assumptions!B27` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Admin Payroll":
          cell.value = { formula: `Assumptions!B28*Assumptions!B29` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Founder / Leader Salary":
          cell.value = { formula: `Assumptions!B30` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Total Salaries":
          cell.value = { formula: `SUM(${c(4,col)}:${c(6,col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Benefits":
          cell.value = { formula: `${c(7,col)}*Assumptions!B31` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Total Staffing Cost":
          cell.value = { formula: `${c(7,col)}+${c(8,col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
      }
      if (r === 7 || r === 9) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 7, 6);
  styleSectionRow(ws, 9, 6);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildOpexTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const rowDefs = [
    { label: "Students", row: 2 },
    { label: "Rent", row: 3 },
    { label: "Utilities", row: 4 },
    { label: "Insurance", row: 5 },
    { label: "Curriculum / Materials", row: 6 },
    { label: "Technology", row: 7 },
    { label: "Marketing / Outreach", row: 8 },
    { label: "Other Operating Expenses", row: 9 },
    { label: "Total Operating Expenses", row: 10 },
  ];

  for (const item of rowDefs) {
    const r = item.row;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = r === 10 ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const studentRef = `Enrollment!${String.fromCharCode(66 + y)}2`;

      switch (item.label) {
        case "Students":
          cell.value = { formula: studentRef };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case "Rent":
          cell.value = { formula: `Assumptions!B34*12*(1+Assumptions!B35)^${y}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Utilities":
          cell.value = { formula: `Assumptions!B36` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Insurance":
          cell.value = { formula: `Assumptions!B37` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Curriculum / Materials":
          cell.value = { formula: `${studentRef}*Assumptions!B38` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Technology":
          cell.value = { formula: `${studentRef}*Assumptions!B39` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Marketing / Outreach":
          cell.value = { formula: `Assumptions!B40` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Other Operating Expenses":
          cell.value = { formula: `Assumptions!B41` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Total Operating Expenses":
          cell.value = { formula: `SUM(${c(3,col)}:${c(9,col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
      }
      if (r === 10) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 10, 6);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildFiveYearTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["Five-Year Financial Model", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const rowDefs = [
    { label: "Students", row: 2, src: "Enrollment", srcRow: 2, fmt: NUMBER_FORMAT, bold: false },
    { label: "Net Revenue", row: 3, src: "Revenue", srcRow: 9, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Staffing Costs", row: 4, src: "Staffing", srcRow: 9, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Operating Expenses", row: 5, src: "'Operating Expenses'", srcRow: 10, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Total Expenses", row: 6, src: null, srcRow: 0, fmt: CURRENCY_WHOLE_FORMAT, bold: true },
    { label: "Net Income", row: 7, src: null, srcRow: 0, fmt: CURRENCY_WHOLE_FORMAT, bold: true },
  ];

  for (const item of rowDefs) {
    const r = item.row;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const colLetter = String.fromCharCode(66 + y);

      if (item.label === "Total Expenses") {
        cell.value = { formula: `${c(4,col)}+${c(5,col)}` };
      } else if (item.label === "Net Income") {
        cell.value = { formula: `${c(3,col)}-${c(6,col)}` };
      } else {
        cell.value = { formula: `${item.src}!${colLetter}${item.srcRow}` };
      }
      cell.numFmt = item.fmt;
      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 6, 6);
  styleSectionRow(ws, 7, 6);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildSummaryTab(ws: ExcelJS.Worksheet, sp: SchoolProfile) {
  ws.columns = [{ width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  let r = 1;
  ws.getCell(r, 1).value = "Financial Model Summary";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 6);
  ws.getRow(r).height = 36;

  r = 2;
  ws.getCell(r, 1).value = "Prepared by SchoolStack Budget";
  ws.getCell(r, 1).font = { italic: true, size: 10, color: { argb: "FF888888" }, name: "Calibri" };

  r = 4;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  r = 5; ws.getCell(r, 1).value = "School Name"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = { formula: "Assumptions!B4" }; ws.getCell(r, 2).font = BOLD_FONT;
  r = 6; ws.getCell(r, 1).value = "School Type"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = { formula: "Assumptions!B6" }; ws.getCell(r, 2).font = NORMAL_FONT;
  r = 7; ws.getCell(r, 1).value = "State"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = { formula: "Assumptions!B5" }; ws.getCell(r, 2).font = NORMAL_FONT;

  r = 9;
  const sumHeaders = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(r).values = sumHeaders;
  styleHeaderRow(ws, r, 6);

  const summaryRows = [
    { label: "Students", row: 10, fiveYearRow: 2, fmt: NUMBER_FORMAT, bold: false },
    { label: "Net Revenue", row: 11, fiveYearRow: 3, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Total Expenses", row: 12, fiveYearRow: 6, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Net Income", row: 13, fiveYearRow: 7, fmt: CURRENCY_WHOLE_FORMAT, bold: true },
  ];

  for (const item of summaryRows) {
    ws.getCell(item.row, 1).value = item.label;
    ws.getCell(item.row, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const colLetter = String.fromCharCode(66 + y);
      const cell = ws.getCell(item.row, col);
      cell.value = { formula: `'Five-Year Model'!${colLetter}${item.fiveYearRow}` };
      cell.numFmt = item.fmt;
      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }
  styleSectionRow(ws, 13, 6);

  r = 15;
  styleSectionRow(ws, r, 6);
  ws.getCell(r, 1).value = "KEY METRICS";

  const metricRows = [
    { label: "Revenue per Student", row: 16 },
    { label: "Staffing Cost as % of Revenue", row: 17 },
    { label: "Facility Cost as % of Revenue", row: 18 },
    { label: "Net Margin %", row: 19 },
  ];

  for (const item of metricRows) {
    ws.getCell(item.row, 1).value = item.label;
    ws.getCell(item.row, 1).font = NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(item.row, col);
      const colLetter = String.fromCharCode(66 + y);

      switch (item.label) {
        case "Revenue per Student":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}2=0,0,'Five-Year Model'!${colLetter}3/'Five-Year Model'!${colLetter}2)` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Staffing Cost as % of Revenue":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}3=0,0,'Five-Year Model'!${colLetter}4/'Five-Year Model'!${colLetter}3)` };
          cell.numFmt = PERCENT_FORMAT;
          break;
        case "Facility Cost as % of Revenue":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}3=0,0,'Operating Expenses'!${colLetter}3/'Five-Year Model'!${colLetter}3)` };
          cell.numFmt = PERCENT_FORMAT;
          break;
        case "Net Margin %":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}3=0,0,'Five-Year Model'!${colLetter}7/'Five-Year Model'!${colLetter}3)` };
          cell.numFmt = PERCENT_FORMAT;
          break;
      }
      styleDataCell(cell);
    }
  }

  ws.views = [{ state: "frozen", ySplit: 9, xSplit: 1 }];
}

function c(row: number, col: number): string {
  return `${String.fromCharCode(64 + col)}${row}`;
}
