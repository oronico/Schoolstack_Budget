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
  publicFundingPerStudent?: number;
  otherRevenuePerStudent?: number;
  scholarshipRate?: number;
  annualDonations?: number;
  foundationGrants?: number;
  capitalGifts?: number;
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
  facilityMaintenance?: number;
  curriculumCostPerStudent?: number;
  techCostPerStudent?: number;
  annualMarketing?: number;
  professionalDevelopment?: number;
  foodServicePerStudent?: number;
  transportationAnnual?: number;
  studentServicesAnnual?: number;
  otherAnnualExpenses?: number;
  loanAmount?: number;
  annualInterestRate?: number;
  loanTermYears?: number;
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
const CURRENCY_WHOLE_FORMAT = '#,##0.00;[Red](#,##0.00);"-"';
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

function c(row: number, col: number): string {
  return `${String.fromCharCode(64 + col)}${row}`;
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
    { width: 40 },
    { width: 22 },
    { width: 5 },
    { width: 40 },
    { width: 22 },
  ];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget — Assumptions";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 5);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL PROFILE";

  r = 4; ws.getCell(r, 1).value = "School Name"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.schoolName || ""; styleInputCell(ws.getCell(r, 2));

  r = 5; ws.getCell(r, 1).value = "State"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.state || ""; styleInputCell(ws.getCell(r, 2));

  r = 6; ws.getCell(r, 1).value = "School Type"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = schoolTypeDisplay(sp.schoolType); styleInputCell(ws.getCell(r, 2));

  r = 7; ws.getCell(r, 1).value = "Opening Year"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.openingYear || 0; styleInputCell(ws.getCell(r, 2));

  r = 8; ws.getCell(r, 1).value = "Current Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = sp.currentStudents || 0; styleInputCell(ws.getCell(r, 2));

  r = 9; ws.getCell(r, 1).value = "Max Student Capacity"; ws.getCell(r, 1).font = NORMAL_FONT;
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
  ws.getCell(r, 1).value = "TUITION & FEES";

  r = 19; ws.getCell(r, 1).value = "Annual Tuition per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.tuitionPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 20; ws.getCell(r, 1).value = "Scholarship / Discount Rate"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (rev.scholarshipRate || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r = 21; ws.getCell(r, 1).value = "Other Fees per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.otherRevenuePerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 23;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "PUBLIC & AID REVENUE";

  r = 24; ws.getCell(r, 1).value = "ESA / Voucher Revenue per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.esaRevenuePerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 25; ws.getCell(r, 1).value = "Per-Pupil Public Funding"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.publicFundingPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 27;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "PHILANTHROPY & GRANTS";

  r = 28; ws.getCell(r, 1).value = "Annual Donations / Individual Giving"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.annualDonations || rev.annualFundraising || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 29; ws.getCell(r, 1).value = "Foundation & Corporate Grants"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.foundationGrants || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 30; ws.getCell(r, 1).value = "One-Time / Capital Gifts"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rev.capitalGifts || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 32;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "STAFFING";

  r = 33; ws.getCell(r, 1).value = "Students per Teacher"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.studentsPerTeacher || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 34; ws.getCell(r, 1).value = "Annual Teacher Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.teacherSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 35; ws.getCell(r, 1).value = "Number of Admin Staff"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.adminStaffCount || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 36; ws.getCell(r, 1).value = "Annual Admin Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.adminSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 37; ws.getCell(r, 1).value = "Founder / Leader Salary"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = st.founderSalary || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 38; ws.getCell(r, 1).value = "Benefits Rate"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (st.benefitsRate || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;

  r = 40;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "FACILITY COSTS";

  r = 41; ws.getCell(r, 1).value = "Monthly Rent"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.monthlyRent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 42; ws.getCell(r, 1).value = "Annual Rent Increase"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (fac.annualRentIncrease || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r = 43; ws.getCell(r, 1).value = "Annual Utilities"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualUtilities || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 44; ws.getCell(r, 1).value = "Annual Insurance"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualInsurance || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 45; ws.getCell(r, 1).value = "Annual Maintenance & Repairs"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.facilityMaintenance || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 47;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "INSTRUCTIONAL & PER-STUDENT COSTS";

  r = 48; ws.getCell(r, 1).value = "Curriculum / Materials per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.curriculumCostPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 49; ws.getCell(r, 1).value = "Technology per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.techCostPerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 51;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "STUDENT SERVICES";

  r = 52; ws.getCell(r, 1).value = "Food / Meal Service per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.foodServicePerStudent || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 53; ws.getCell(r, 1).value = "Annual Transportation"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.transportationAnnual || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 54; ws.getCell(r, 1).value = "Other Student Services"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.studentServicesAnnual || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 56;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "ADMINISTRATIVE & OVERHEAD";

  r = 57; ws.getCell(r, 1).value = "Annual Marketing & Admissions"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.annualMarketing || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 58; ws.getCell(r, 1).value = "Professional Development"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.professionalDevelopment || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 59; ws.getCell(r, 1).value = "Other Annual Overhead"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.otherAnnualExpenses || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r = 61;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "DEBT SERVICE";

  r = 62; ws.getCell(r, 1).value = "Total Loan Amount"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.loanAmount || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r = 63; ws.getCell(r, 1).value = "Annual Interest Rate"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = (fac.annualInterestRate || 0) / 100; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r = 64; ws.getCell(r, 1).value = "Loan Term (Years)"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = fac.loanTermYears || 0; styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  r = 65; ws.getCell(r, 1).value = "Annual Debt Service (P&I)"; ws.getCell(r, 1).font = BOLD_FONT;
  ws.getCell(r, 2).value = { formula: `IF(B64=0,0,IF(B63=0,B62/B64,PMT(B63,B64,-B62)))` };
  styleInputCell(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

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
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const ROW = {
    students: 2,
    tuition: 3,
    otherFees: 4,
    grossTuition: 5,
    scholarshipDiscount: 6,
    netTuition: 7,
    esa: 8,
    publicFunding: 9,
    totalPublic: 10,
    donations: 11,
    grants: 12,
    capitalGifts: 13,
    totalPhilanthropy: 14,
    netRevenue: 15,
  };

  const rows: Array<{ label: string; row: number; bold: boolean; section?: boolean }> = [
    { label: "Students", row: ROW.students, bold: false },
    { label: "Tuition Revenue", row: ROW.tuition, bold: false },
    { label: "Other Fees Revenue", row: ROW.otherFees, bold: false },
    { label: "Gross Tuition & Fees", row: ROW.grossTuition, bold: true, section: true },
    { label: "Scholarship / Discount", row: ROW.scholarshipDiscount, bold: false },
    { label: "Net Tuition & Fees", row: ROW.netTuition, bold: true, section: true },
    { label: "ESA / Voucher Revenue", row: ROW.esa, bold: false },
    { label: "Per-Pupil Public Funding", row: ROW.publicFunding, bold: false },
    { label: "Total Public & Aid Revenue", row: ROW.totalPublic, bold: true, section: true },
    { label: "Individual Donations", row: ROW.donations, bold: false },
    { label: "Foundation & Corporate Grants", row: ROW.grants, bold: false },
    { label: "Capital Gifts (Year 1 Only)", row: ROW.capitalGifts, bold: false },
    { label: "Total Philanthropy", row: ROW.totalPhilanthropy, bold: true, section: true },
    { label: "Total Net Revenue", row: ROW.netRevenue, bold: true, section: true },
  ];

  for (const item of rows) {
    ws.getCell(item.row, 1).value = item.label;
    ws.getCell(item.row, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(item.row, col);
      const studentRef = `Enrollment!${String.fromCharCode(66 + y)}2`;

      switch (item.row) {
        case ROW.students:
          cell.value = { formula: studentRef };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case ROW.tuition:
          cell.value = { formula: `${studentRef}*Assumptions!B19` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.otherFees:
          cell.value = { formula: `${studentRef}*Assumptions!B21` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.grossTuition:
          cell.value = { formula: `${c(ROW.tuition, col)}+${c(ROW.otherFees, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.scholarshipDiscount:
          cell.value = { formula: `-(${c(ROW.tuition, col)})*Assumptions!B20` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.netTuition:
          cell.value = { formula: `${c(ROW.grossTuition, col)}+${c(ROW.scholarshipDiscount, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.esa:
          cell.value = { formula: `${studentRef}*Assumptions!B24` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.publicFunding:
          cell.value = { formula: `${studentRef}*Assumptions!B25` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalPublic:
          cell.value = { formula: `${c(ROW.esa, col)}+${c(ROW.publicFunding, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.donations:
          cell.value = { formula: `Assumptions!B28` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.grants:
          cell.value = { formula: `Assumptions!B29` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.capitalGifts:
          cell.value = { formula: y === 0 ? `Assumptions!B30` : `0` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalPhilanthropy:
          cell.value = { formula: `${c(ROW.donations, col)}+${c(ROW.grants, col)}+${c(ROW.capitalGifts, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.netRevenue:
          cell.value = { formula: `${c(ROW.netTuition, col)}+${c(ROW.totalPublic, col)}+${c(ROW.totalPhilanthropy, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
      }
      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }

    if (item.section) styleSectionRow(ws, item.row, 6);
  }

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
          cell.value = { formula: `IF(Assumptions!B33=0,0,ROUNDUP(${studentRef}/Assumptions!B33,0))` };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case "Teacher Payroll":
          cell.value = { formula: `${c(3, col)}*Assumptions!B34` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Admin Payroll":
          cell.value = { formula: `Assumptions!B35*Assumptions!B36` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Founder / Leader Salary":
          cell.value = { formula: `Assumptions!B37` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Total Salaries":
          cell.value = { formula: `SUM(${c(4, col)}:${c(6, col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Benefits":
          cell.value = { formula: `${c(7, col)}*Assumptions!B38` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case "Total Staffing Cost":
          cell.value = { formula: `${c(7, col)}+${c(8, col)}` };
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

  const ROW = {
    students: 2,
    rent: 3,
    utilities: 4,
    insurance: 5,
    maintenance: 6,
    totalFacility: 7,
    curriculum: 8,
    technology: 9,
    totalInstruction: 10,
    foodService: 11,
    transportation: 12,
    studentServices: 13,
    totalStudentSvcs: 14,
    marketing: 15,
    profDev: 16,
    otherOverhead: 17,
    totalAdmin: 18,
    debtService: 19,
    totalOpex: 20,
  };

  const rowDefs: Array<{ label: string; row: number; bold: boolean; section?: boolean }> = [
    { label: "Students", row: ROW.students, bold: false },
    { label: "Rent", row: ROW.rent, bold: false },
    { label: "Utilities", row: ROW.utilities, bold: false },
    { label: "Insurance", row: ROW.insurance, bold: false },
    { label: "Maintenance & Repairs", row: ROW.maintenance, bold: false },
    { label: "Total Facility Costs", row: ROW.totalFacility, bold: true, section: true },
    { label: "Curriculum & Materials", row: ROW.curriculum, bold: false },
    { label: "Technology", row: ROW.technology, bold: false },
    { label: "Total Instructional Costs", row: ROW.totalInstruction, bold: true, section: true },
    { label: "Food / Meal Service", row: ROW.foodService, bold: false },
    { label: "Transportation", row: ROW.transportation, bold: false },
    { label: "Other Student Services", row: ROW.studentServices, bold: false },
    { label: "Total Student Services", row: ROW.totalStudentSvcs, bold: true, section: true },
    { label: "Marketing & Admissions", row: ROW.marketing, bold: false },
    { label: "Professional Development", row: ROW.profDev, bold: false },
    { label: "Other Overhead", row: ROW.otherOverhead, bold: false },
    { label: "Total Administrative", row: ROW.totalAdmin, bold: true, section: true },
    { label: "Annual Debt Service (P&I)", row: ROW.debtService, bold: false },
    { label: "Total Operating Expenses", row: ROW.totalOpex, bold: true, section: true },
  ];

  for (const item of rowDefs) {
    const r = item.row;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const studentRef = `Enrollment!${String.fromCharCode(66 + y)}2`;

      switch (r) {
        case ROW.students:
          cell.value = { formula: studentRef };
          cell.numFmt = NUMBER_FORMAT;
          break;
        case ROW.rent:
          cell.value = { formula: `Assumptions!B41*12*(1+Assumptions!B42)^${y}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.utilities:
          cell.value = { formula: `Assumptions!B43` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.insurance:
          cell.value = { formula: `Assumptions!B44` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.maintenance:
          cell.value = { formula: `Assumptions!B45` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalFacility:
          cell.value = { formula: `SUM(${c(ROW.rent, col)}:${c(ROW.maintenance, col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.curriculum:
          cell.value = { formula: `${studentRef}*Assumptions!B48` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.technology:
          cell.value = { formula: `${studentRef}*Assumptions!B49` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalInstruction:
          cell.value = { formula: `${c(ROW.curriculum, col)}+${c(ROW.technology, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.foodService:
          cell.value = { formula: `${studentRef}*Assumptions!B52` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.transportation:
          cell.value = { formula: `Assumptions!B53` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.studentServices:
          cell.value = { formula: `Assumptions!B54` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalStudentSvcs:
          cell.value = { formula: `SUM(${c(ROW.foodService, col)}:${c(ROW.studentServices, col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.marketing:
          cell.value = { formula: `Assumptions!B57` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.profDev:
          cell.value = { formula: `Assumptions!B58` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.otherOverhead:
          cell.value = { formula: `Assumptions!B59` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalAdmin:
          cell.value = { formula: `SUM(${c(ROW.marketing, col)}:${c(ROW.otherOverhead, col)})` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.debtService:
          cell.value = { formula: `Assumptions!B65` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
        case ROW.totalOpex:
          cell.value = { formula: `${c(ROW.totalFacility, col)}+${c(ROW.totalInstruction, col)}+${c(ROW.totalStudentSvcs, col)}+${c(ROW.totalAdmin, col)}+${c(ROW.debtService, col)}` };
          cell.numFmt = CURRENCY_WHOLE_FORMAT;
          break;
      }
      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }

    if (item.section) styleSectionRow(ws, r, 6);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildFiveYearTab(ws: ExcelJS.Worksheet) {
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const headers = ["Five-Year Financial Model", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, 6);

  const rowDefs = [
    { label: "Students", row: 2, src: "Enrollment", srcRow: 2, fmt: NUMBER_FORMAT, bold: false },
    { label: "Net Revenue", row: 3, src: "Revenue", srcRow: 15, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Staffing Costs", row: 4, src: "Staffing", srcRow: 9, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
    { label: "Operating Expenses", row: 5, src: "'Operating Expenses'", srcRow: 20, fmt: CURRENCY_WHOLE_FORMAT, bold: false },
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
        cell.value = { formula: `${c(4, col)}+${c(5, col)}` };
      } else if (item.label === "Net Income") {
        cell.value = { formula: `${c(3, col)}-${c(6, col)}` };
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
    { label: "Operating Cost as % of Revenue", row: 18 },
    { label: "Net Margin %", row: 19 },
    { label: "Debt Service Coverage Ratio", row: 20 },
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
        case "Operating Cost as % of Revenue":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}3=0,0,'Five-Year Model'!${colLetter}5/'Five-Year Model'!${colLetter}3)` };
          cell.numFmt = PERCENT_FORMAT;
          break;
        case "Net Margin %":
          cell.value = { formula: `IF('Five-Year Model'!${colLetter}3=0,0,'Five-Year Model'!${colLetter}7/'Five-Year Model'!${colLetter}3)` };
          cell.numFmt = PERCENT_FORMAT;
          break;
        case "Debt Service Coverage Ratio":
          cell.value = { formula: `IF(Assumptions!B65=0,"N/A",('Five-Year Model'!${colLetter}7+Assumptions!B65)/Assumptions!B65)` };
          cell.numFmt = '0.00x;[Red](0.00x);"-"';
          break;
      }
      styleDataCell(cell);
    }
  }

  ws.views = [{ state: "frozen", ySplit: 9, xSplit: 1 }];
}
