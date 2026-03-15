import ExcelJS from "exceljs";

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  entityType?: string;
  ein?: string;
  schoolStage?: string;
  openingYear?: number;
  currentStudents?: number;
  maxCapacity?: number;
  fiscalYearStartMonth?: number;
  isPartialFirstYear?: boolean;
  year1OperatingMonths?: number;
  isAccredited?: boolean;
  accreditingBody?: string;
  hasManagementFee?: boolean;
  managementFeePercent?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface RevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  percentBase?: string;
  escalationRate?: number;
  note?: string;
  billingMonths?: number;
}

interface StaffingRow {
  id: string;
  roleName: string;
  functionCategory: string;
  employmentType: string;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
  notes: string;
}

interface ExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  escalationRate?: number;
  note?: string;
}

interface CapitalDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  note?: string;
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

interface TuitionTier {
  id: string;
  tierType: string;
  label: string;
  discountPercent: number;
  studentCounts: number[];
}

interface PriorYearSnapshot {
  endingEnrollment?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  endingCash?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  revenue?: Record<string, unknown>;
  revenueRows?: RevenueRow[];
  staffing?: Record<string, unknown>;
  staffingRows?: StaffingRow[];
  facilities?: Record<string, unknown>;
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
}

const NAVY = "FF1E293B";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY = "FFE8EDF2";
const GREEN_BG = "FFE8F5E9";
const RED_BG = "FFFCE4EC";
const AMBER_BG = "FFFFF8E1";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };
const NF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const CUR = '#,##0;[Red](#,##0);"-"';
const PCT = '0.0%;[Red](0.0%);"-"';
const NUM = '#,##0;[Red](#,##0);"-"';
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function hdr(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  }
  ws.getRow(row).height = 28;
}

function sec(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL; cell.font = SECTION_FONT; cell.border = BORDER;
  }
  ws.getRow(row).height = 24;
}

function dc(cell: ExcelJS.Cell) { cell.font = NF; cell.border = BORDER; }
function bc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = BORDER; }

function cn(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return `${s}${row}`;
}

function schoolTypeLabel(t?: string, o?: string): string {
  const map: Record<string, string> = {
    charter_school: "Charter School", homeschool_coop: "Homeschool Co-Op",
    learning_pod: "Learning Pod", microschool: "Microschool",
    private_school: "Private School", tutoring_center: "Tutoring Center", other: o || "Other"
  };
  return map[t || ""] || t || "";
}

function entityLabel(e?: string): string {
  const map: Record<string, string> = {
    sole_practitioner: "Sole Practitioner", llc_single: "LLC (Single Member)",
    llc_partnership: "LLC (Partnership)", c_corp: "C Corporation",
    s_corp: "S Corporation", nonprofit_501c3: "501(c)(3) Nonprofit"
  };
  return map[e || ""] || e || "";
}

function funcLabel(fc: string): string {
  const map: Record<string, string> = {
    instructional: "Instructional", school_leadership: "School Leadership",
    student_support: "Student Support", operations: "Operations",
    administrative: "Administrative", other: "Other"
  };
  return map[fc] || fc;
}

function driverVal(amounts: number[] | undefined, y: number, dt: string, students: number, escalationRate?: number): number {
  let base = amounts?.[y] ?? 0;
  if (escalationRate !== undefined && escalationRate !== 0 && y > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + escalationRate / 100, y);
  }
  switch (dt) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function tuitionWithTiers(gross: number, y: number, students: number, tiers?: TuitionTier[]): number {
  if (!tiers || tiers.length === 0) return gross * students;
  let rawTotal = 0;
  for (const t of tiers) rawTotal += t.studentCounts?.[y] ?? 0;
  if (rawTotal === 0) return gross * students;
  const sf = rawTotal > students ? students / rawTotal : 1;
  let total = 0, alloc = 0;
  for (const t of tiers) {
    const sc = (t.studentCounts?.[y] ?? 0) * sf;
    alloc += sc;
    total += sc * gross * (1 - (t.discountPercent || 0) / 100);
  }
  const rem = students - alloc;
  if (rem > 0) total += rem * gross;
  return total;
}

function computeAnnualDebt(principal: number, rate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (rate <= 0) return principal / termYears;
  const mr = rate / 12;
  const m = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1)) * 12;
}

function computeRevenueForYear(
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[]
): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
      let perStudentAmount = r.amounts?.[y] ?? 0;
      if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
        perStudentAmount = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      vals.set(r.id, tuitionWithTiers(perStudentAmount, y, students, tiers));
    } else {
      vals.set(r.id, driverVal(r.amounts, y, r.driverType, students, r.escalationRate));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = vals.get(r.percentBase || "") || 0;
    let pctVal = r.amounts?.[y] ?? 0;
    if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
      pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
    }
    vals.set(r.id, baseVal * (pctVal / 100));
  }
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    const v = vals.get(r.id) || 0;
    if (r.category === "tuition_offsets") total -= Math.abs(v);
    else total += v;
  }
  return total;
}

function computeExpenseForYear(
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number
): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_revenue") {
      let pct = r.amounts?.[y] ?? 0;
      if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
        pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      total += (pct / 100) * totalRevenue;
    } else {
      total += driverVal(r.amounts, y, r.driverType, students, r.escalationRate);
    }
  }
  return total;
}

function computePersonnelForYear(
  rows: StaffingRow[], salaryEsc: number, prorationFactor: number, y: number
): number {
  let total = 0;
  for (const r of rows) {
    const annual = r.fte * r.annualizedRate;
    const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
    let benefits = 0, tax = 0;
    if (!isContractNoPL) {
      if (r.benefitsEligible) benefits = annual * (r.benefitsRate / 100);
      tax = annual * (r.payrollTaxRate / 100);
    }
    total += annual + benefits + tax;
  }
  const esc = Math.pow(1 + salaryEsc, y);
  const pf = y === 0 ? prorationFactor : 1;
  return total * esc * pf;
}

function computeCapDebtForYear(rows: CapitalDebtRow[], y: number, students: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.isLoan) {
      total += computeAnnualDebt(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0);
    } else {
      total += driverVal(r.amounts, y, r.driverType, students);
    }
  }
  return total;
}

function totalDebtService(capDebtRows: CapitalDebtRow[]): number {
  let ds = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    ds += computeAnnualDebt(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0);
  }
  return ds;
}

function totalLoanPrincipal(capDebtRows: CapitalDebtRow[]): number {
  let p = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    p += r.loanPrincipal || 0;
  }
  return p;
}

const REV_CAT_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice Funding",
  grants_contributions: "Grants & Contributions",
  other_revenue: "Other Revenue",
};

const EXP_CAT_LABELS: Record<string, string> = {
  instructional_program: "Instructional / Program",
  technology: "Technology",
  occupancy_facility: "Occupancy / Facility",
  administrative_general: "Administrative / General",
};

export async function generateUnderwritingWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const yearCount = revenueRows[0]?.amounts?.length || expenseRows[0]?.amounts?.length || (sp.schoolStage === "operating_school" ? 5 : 3);
  const yc = Math.min(yearCount, 5);

  const enrollment = [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0].slice(0, yc);
  const salaryEsc = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100 : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100 : 0;
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonths / 12;

  const annualRevenue: number[] = [];
  const annualPersonnel: number[] = [];
  const annualExpenses: number[] = [];
  const annualCapDebt: number[] = [];
  const annualNetIncome: number[] = [];
  const annualCumNI: number[] = [];

  for (let y = 0; y < yc; y++) {
    const students = enrollment[y];
    const rev = computeRevenueForYear(revenueRows, y, students, data.tuitionTiers);
    const pf = y === 0 ? prorationFactor : 1;
    const personnel = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y);
    const ops = computeExpenseForYear(expenseRows, y, students, rev) * (y === 0 ? prorationFactor : 1);
    const capDebt = computeCapDebtForYear(capDebtRows, y, students);
    const totalExp = personnel + ops + capDebt;
    const ni = (rev * pf) - totalExp;

    annualRevenue.push(Math.round(rev * pf));
    annualPersonnel.push(Math.round(personnel));
    annualExpenses.push(Math.round(ops));
    annualCapDebt.push(Math.round(capDebt));
    annualNetIncome.push(Math.round(ni));
    annualCumNI.push((annualCumNI[y - 1] || 0) + Math.round(ni));
  }

  const startingCash = data.priorYearSnapshot?.endingCash || 0;
  const annualDebtSvc = totalDebtService(capDebtRows);
  const totalPrincipal = totalLoanPrincipal(capDebtRows);
  const maxCapacity = sp.maxCapacity || enrollment[yc - 1] || 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget — Underwriting Export";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const yearHeaders = ["", ...Array.from({ length: yc }, (_, i) => `Year ${i + 1}`)];
  const cols = yc + 1;

  buildAssumptions(wb, sp, enrollment, yc, salaryEsc, costInflation, prorationFactor, data.tuitionTiers);
  buildEnrollmentRevDrivers(wb, enrollment, revenueRows, yc, cols, yearHeaders, maxCapacity, data.tuitionTiers);
  buildTuitionFundingDetail(wb, revenueRows, enrollment, yc, cols, yearHeaders, data.tuitionTiers);
  buildStaffingPlan(wb, staffingRows, salaryEsc, prorationFactor, yc, cols, yearHeaders);
  buildOperatingExpenses(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  buildFacilitiesOccupancy(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  buildSourcesUses(wb, capDebtRows, startingCash, annualRevenue, yc);
  buildDebtSchedule(wb, capDebtRows, yc);
  buildMonthlyCashFlowY1(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, startingCash, opMonths, revenueRows, enrollment, data.tuitionTiers, sp.fiscalYearStartMonth);
  buildFiveYearPL(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, yc, cols, yearHeaders, sp.entityType);
  buildFiveYearBS(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, startingCash, totalPrincipal, capDebtRows, yc, cols, yearHeaders);
  buildDSCRCovenant(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualDebtSvc, startingCash, enrollment, maxCapacity, yc, cols, yearHeaders);
  buildUnderwritingSnapshot(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, startingCash, enrollment, maxCapacity, totalPrincipal, yc);
  buildSummary(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, startingCash, enrollment, yc, cols, yearHeaders);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildAssumptions(
  wb: ExcelJS.Workbook, sp: SchoolProfile, enrollment: number[], yc: number,
  salaryEsc: number, costInflation: number, proration: number, tiers?: TuitionTier[]
) {
  const ws = wb.addWorksheet("Assumptions");
  ws.columns = [{ width: 38 }, { width: 25 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack — Underwriting Assumptions";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3; sec(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const items: [string, string | number][] = [
    ["School Name", sp.schoolName || ""],
    ["State", sp.state || ""],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    ["Opening Year", sp.openingYear || 0],
    ["Max Student Capacity", sp.maxCapacity || 0],
    ["Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July"],
  ];
  if (sp.ein) items.push(["EIN", sp.ein]);
  if (sp.isPartialFirstYear) items.push(["Year 1 Operating Months", sp.year1OperatingMonths || 12]);

  for (const [l, v] of items) { r++; ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = v; ws.getCell(r, 2).font = BF; }

  r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "ENROLLMENT BY YEAR";
  for (let y = 0; y < yc; y++) {
    r++; ws.getCell(r, 1).value = `Year ${y + 1} Students`; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = enrollment[y]; ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = NUM;
  }

  r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "GROWTH & ESCALATION";
  r++; ws.getCell(r, 1).value = "Salary Escalation"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = salaryEsc; ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = PCT;
  r++; ws.getCell(r, 1).value = "Cost Inflation"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = PCT;
  r++; ws.getCell(r, 1).value = "Year 1 Proration"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = proration; ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = "0.00";
  r++; ws.getCell(r, 1).value = "Projection Period"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = `${yc} Years`; ws.getCell(r, 2).font = BF;

  if (tiers && tiers.length > 0) {
    r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "TUITION DISCOUNT TIERS";
    for (const t of tiers) {
      r++; ws.getCell(r, 1).value = `${t.label} (${t.discountPercent}% discount)`; ws.getCell(r, 1).font = NF;
      ws.getCell(r, 2).value = `${t.studentCounts.reduce((a, b) => a + b, 0)} total students`; ws.getCell(r, 2).font = BF;
    }
  }
}

function buildEnrollmentRevDrivers(
  wb: ExcelJS.Workbook, enrollment: number[], rows: RevenueRow[], yc: number,
  cols: number, yearHeaders: string[], maxCapacity: number, tiers?: TuitionTier[]
) {
  const ws = wb.addWorksheet("Enrollment & Rev Drivers");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = enrollment[y]; cell.numFmt = NUM; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Enrollment Growth %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === 0) { cell.value = "—"; dc(cell); }
    else {
      const prev = enrollment[y - 1];
      const cur = enrollment[y];
      cell.value = { formula: `IF(${cn(r - 1, y + 1)}=0,"—",(${cn(r - 1, y + 2)}-${cn(r - 1, y + 1)})/${cn(r - 1, y + 1)})`, result: prev === 0 ? "—" : (cur - prev) / prev };
      cell.numFmt = PCT; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Capacity Utilization %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = maxCapacity > 0 ? enrollment[y] / maxCapacity : 0;
    cell.numFmt = PCT; dc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "REVENUE PER STUDENT";

  const perStudentRevRows = rows.filter(ro => ro.enabled && ro.driverType === "per_student");
  for (const ro of perStudentRevRows) {
    r++; ws.getCell(r, 1).value = `${ro.lineItem} (per student)`; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = ro.amounts?.[y] ?? 0; cell.numFmt = CUR; dc(cell);
    }
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "REVENUE MIX SUMMARY";

  const categories = ["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "grants_contributions", "other_revenue"];
  for (const cat of categories) {
    const catRows = rows.filter(ro => ro.enabled && ro.category === cat);
    if (catRows.length === 0) continue;
    r++; ws.getCell(r, 1).value = REV_CAT_LABELS[cat] || cat; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      let catTotal = 0;
      for (const ro of catRows) {
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) {
            const baseVal = driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]);
            catTotal += baseVal * ((ro.amounts?.[y] ?? 0) / 100);
          }
        } else if (ro.id === "gross_tuition" && ro.driverType === "per_student" && tiers && tiers.length > 0) {
          catTotal += tuitionWithTiers(ro.amounts?.[y] ?? 0, y, enrollment[y], tiers);
        } else {
          catTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y]);
        }
      }
      if (cat === "tuition_offsets") catTotal = -Math.abs(catTotal);
      const cell = ws.getCell(r, y + 2); cell.value = Math.round(catTotal); cell.numFmt = CUR; dc(cell);
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildTuitionFundingDetail(
  wb: ExcelJS.Workbook, rows: RevenueRow[], enrollment: number[], yc: number,
  cols: number, yearHeaders: string[], tiers?: TuitionTier[]
) {
  const ws = wb.addWorksheet("Tuition & Funding Detail");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = enrollment[y]; cell.numFmt = NUM; bc(cell);
  }

  const categories = ["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "grants_contributions", "other_revenue"];
  const catTotalRows: number[] = [];
  const catTotalValues: number[][] = [];

  for (const cat of categories) {
    const catRows = rows.filter(ro => ro.enabled && ro.category === cat);
    if (catRows.length === 0) continue;

    r++; sec(ws, r, cols); ws.getCell(r, 1).value = (REV_CAT_LABELS[cat] || cat).toUpperCase();
    const firstData = r + 1;

    for (const ro of catRows) {
      r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
      for (let y = 0; y < yc; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = ro.amounts?.[y] ?? 0;
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) {
            const baseVal = driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]);
            cell.value = Math.round(baseVal * (amt / 100));
          } else cell.value = 0;
        } else if (ro.driverType === "per_student") {
          if (ro.id === "gross_tuition" && tiers && tiers.length > 0) {
            cell.value = Math.round(tuitionWithTiers(amt, y, enrollment[y], tiers));
          } else {
            cell.value = Math.round(amt * enrollment[y]);
          }
        } else if (ro.driverType === "monthly") {
          cell.value = Math.round(amt * 12);
        } else {
          cell.value = Math.round(amt);
        }
        if (cat === "tuition_offsets") cell.value = -Math.abs(cell.value as number);
        cell.numFmt = CUR; dc(cell);
      }
    }

    r++; ws.getCell(r, 1).value = `Total ${REV_CAT_LABELS[cat] || cat}`; ws.getCell(r, 1).font = BF;
    const catTotals: number[] = [];
    for (let y = 0; y < yc; y++) {
      let catSum = 0;
      for (const ro of catRows) {
        const amt = ro.amounts?.[y] ?? 0;
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) catSum += Math.round(driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]) * (amt / 100));
        } else if (ro.driverType === "per_student") {
          if (ro.id === "gross_tuition" && tiers && tiers.length > 0) catSum += Math.round(tuitionWithTiers(amt, y, enrollment[y], tiers));
          else catSum += Math.round(amt * enrollment[y]);
        } else if (ro.driverType === "monthly") {
          catSum += Math.round(amt * 12);
        } else {
          catSum += Math.round(amt);
        }
      }
      if (cat === "tuition_offsets") catSum = -Math.abs(catSum);
      catTotals.push(catSum);
      const cell = ws.getCell(r, y + 2);
      cell.value = { formula: `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, result: catSum };
      cell.numFmt = CUR; bc(cell);
    }
    sec(ws, r, cols);
    catTotalRows.push(r);
    catTotalValues.push(catTotals);
  }

  r += 2; ws.getCell(r, 1).value = "TOTAL NET REVENUE"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (catTotalRows.length > 0) {
      const netRev = catTotalValues.reduce((sum, ct) => sum + (ct[y] || 0), 0);
      cell.value = { formula: catTotalRows.map(tr => cn(tr, y + 2)).join("+"), result: netRev };
    } else cell.value = 0;
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildStaffingPlan(
  wb: ExcelJS.Workbook, rows: StaffingRow[], salaryEsc: number,
  proration: number, yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("Staffing Plan");

  const rosterCols = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 }];
  ws.columns = rosterCols;

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack — Staffing Plan";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 8); ws.getRow(r).height = 32;

  r = 3;
  ws.getRow(r).values = ["Role", "Function", "Type", "FTE", "Annual Rate", "Benefits %", "Payroll Tax %", "Total Cost"];
  hdr(ws, r, 8);

  const funcOrder = ["school_leadership", "instructional", "student_support", "operations", "administrative", "other"];
  const sorted = [...rows].sort((a, b) => {
    const ai = funcOrder.indexOf(a.functionCategory);
    const bi = funcOrder.indexOf(b.functionCategory);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let totalSalaries = 0, totalBenefits = 0, totalTax = 0, totalContract = 0, totalFTE = 0;

  for (const row of sorted) {
    r++;
    const annual = row.fte * row.annualizedRate;
    const isCNPL = row.employmentType === "contract" && !row.payrollLike;
    let ben = 0, tax = 0;
    if (isCNPL) { totalContract += annual; }
    else {
      totalSalaries += annual;
      if (row.benefitsEligible) { ben = annual * (row.benefitsRate / 100); totalBenefits += ben; }
      tax = annual * (row.payrollTaxRate / 100); totalTax += tax;
    }
    totalFTE += row.fte;
    const tc = annual + ben + tax;

    ws.getCell(r, 1).value = row.roleName; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = funcLabel(row.functionCategory); ws.getCell(r, 2).font = NF;
    ws.getCell(r, 3).value = row.employmentType === "full_time" ? "FT" : row.employmentType === "part_time" ? "PT" : "Contract";
    ws.getCell(r, 3).font = NF;
    ws.getCell(r, 4).value = row.fte; ws.getCell(r, 4).font = NF; ws.getCell(r, 4).numFmt = "0.00";
    ws.getCell(r, 5).value = row.annualizedRate; ws.getCell(r, 5).font = NF; ws.getCell(r, 5).numFmt = CUR;
    ws.getCell(r, 6).value = row.benefitsEligible ? row.benefitsRate / 100 : 0; ws.getCell(r, 6).font = NF; ws.getCell(r, 6).numFmt = PCT;
    ws.getCell(r, 7).value = row.payrollTaxRate / 100; ws.getCell(r, 7).font = NF; ws.getCell(r, 7).numFmt = PCT;
    ws.getCell(r, 8).value = Math.round(tc); ws.getCell(r, 8).font = BF; ws.getCell(r, 8).numFmt = CUR;
  }

  const grandTotal = totalSalaries + totalBenefits + totalTax + totalContract;

  r += 2; sec(ws, r, 8); ws.getCell(r, 1).value = "PERSONNEL COST SUMMARY";
  r++; ws.getCell(r, 1).value = "Total Headcount"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = rows.length; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Total FTE"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalFTE * 10) / 10; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Salaries & Wages"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalSalaries); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Benefits"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalBenefits); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Payroll Taxes"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalTax); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Contracted Personnel"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalContract); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Total Base Personnel Cost"; ws.getCell(r, 1).font = BF;
  ws.getCell(r, 2).value = Math.round(grandTotal); ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = CUR;

  r += 2;
  ws.columns = [{ width: 30 }, ...Array(yc).fill({ width: 18 })];
  sec(ws, r, cols); ws.getCell(r, 1).value = "MULTI-YEAR PERSONNEL PROJECTION";
  r++; ws.getRow(r).values = yearHeaders; hdr(ws, r, cols);

  for (let y = 0; y < yc; y++) {
    const esc = Math.pow(1 + salaryEsc, y);
    const pf = y === 0 ? proration : 1;
    const val = Math.round(grandTotal * esc * pf);

    r = ws.rowCount;
    ws.getCell(r + 1, 1).value = y === 0 ? "Year 1 Personnel" : `Year ${y + 1} Personnel`;
  }

  r = ws.rowCount + 1;
  const projLabels = ["Base Cost", "Escalation Factor", "Proration", "Total Personnel"];
  for (const label of projLabels) {
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = label === "Total Personnel" ? BF : NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      const esc = Math.pow(1 + salaryEsc, y);
      const pf = y === 0 ? proration : 1;
      switch (label) {
        case "Base Cost": cell.value = Math.round(grandTotal); cell.numFmt = CUR; break;
        case "Escalation Factor": cell.value = esc; cell.numFmt = "0.0000"; break;
        case "Proration": cell.value = pf; cell.numFmt = "0.000"; break;
        case "Total Personnel": cell.value = Math.round(grandTotal * esc * pf); cell.numFmt = CUR; bc(cell); break;
      }
      dc(cell);
    }
    r++;
  }

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];
}

function buildOperatingExpenses(
  wb: ExcelJS.Workbook, rows: ExpenseRow[], enrollment: number[],
  annualRev: number[], yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("Operating Expenses");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const nonFacility = rows.filter(ro => ro.category !== "occupancy_facility");

  const categories = ["instructional_program", "technology", "administrative_general"];
  const catTotalRows: number[] = [];
  const catTotalVals: number[][] = [];

  for (const cat of categories) {
    const catRows = nonFacility.filter(ro => ro.enabled && ro.category === cat);
    if (catRows.length === 0) continue;

    r++; sec(ws, r, cols); ws.getCell(r, 1).value = (EXP_CAT_LABELS[cat] || cat).toUpperCase();
    const firstData = r + 1;

    for (const ro of catRows) {
      r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
      for (let y = 0; y < yc; y++) {
        const cell = ws.getCell(r, y + 2);
        if (ro.driverType === "percent_of_revenue") {
          cell.value = Math.round(((ro.amounts?.[y] ?? 0) / 100) * annualRev[y]);
        } else {
          cell.value = Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y]));
        }
        cell.numFmt = CUR; dc(cell);
      }
    }

    r++; ws.getCell(r, 1).value = `Total ${EXP_CAT_LABELS[cat] || cat}`; ws.getCell(r, 1).font = BF;
    const totals: number[] = [];
    for (let y = 0; y < yc; y++) {
      let catSum = 0;
      for (const ro of catRows) {
        if (ro.driverType === "percent_of_revenue") catSum += Math.round(((ro.amounts?.[y] ?? 0) / 100) * annualRev[y]);
        else catSum += Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y]));
      }
      totals.push(catSum);
      const cell = ws.getCell(r, y + 2);
      cell.value = { formula: `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, result: catSum };
      cell.numFmt = CUR; bc(cell);
    }
    sec(ws, r, cols);
    catTotalRows.push(r);
    catTotalVals.push(totals);
  }

  r += 2; ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (catTotalRows.length > 0) {
      const total = catTotalVals.reduce((sum, ct) => sum + (ct[y] || 0), 0);
      cell.value = { formula: catTotalRows.map(tr => cn(tr, y + 2)).join("+"), result: total };
    } else cell.value = 0;
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildFacilitiesOccupancy(
  wb: ExcelJS.Workbook, rows: ExpenseRow[], enrollment: number[],
  annualRev: number[], yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("Facilities & Occupancy");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const facRows = rows.filter(ro => ro.enabled && ro.category === "occupancy_facility");

  if (facRows.length === 0) {
    r++; ws.getCell(r, 1).value = "No facility expenses entered"; ws.getCell(r, 1).font = NF;
    return;
  }

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "OCCUPANCY / FACILITY COSTS";
  const firstData = r + 1;

  for (const ro of facRows) {
    r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      if (ro.driverType === "percent_of_revenue") {
        cell.value = Math.round(((ro.amounts?.[y] ?? 0) / 100) * annualRev[y]);
      } else {
        cell.value = Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y]));
      }
      cell.numFmt = CUR; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Total Facility Costs"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    let facSum = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facSum += Math.round(((ro.amounts?.[y] ?? 0) / 100) * annualRev[y]);
      else facSum += Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y]));
    }
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, result: facSum };
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; ws.getCell(r, 1).value = "Cost per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    let facTotal = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facTotal += ((ro.amounts?.[y] ?? 0) / 100) * annualRev[y];
      else facTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y]);
    }
    cell.value = enrollment[y] > 0 ? Math.round(facTotal / enrollment[y]) : 0;
    cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "% of Revenue"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    let facTotal = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facTotal += ((ro.amounts?.[y] ?? 0) / 100) * annualRev[y];
      else facTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y]);
    }
    cell.value = annualRev[y] > 0 ? facTotal / annualRev[y] : 0;
    cell.numFmt = PCT; dc(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildSourcesUses(
  wb: ExcelJS.Workbook, capDebtRows: CapitalDebtRow[], startingCash: number,
  annualRev: number[], yc: number
) {
  const ws = wb.addWorksheet("Sources & Uses");
  ws.columns = [{ width: 40 }, { width: 22 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack — Sources & Uses";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2); ws.getRow(r).height = 32;

  r = 3; sec(ws, r, 2); ws.getCell(r, 1).value = "SOURCES OF FUNDS";
  const sourcesStart = r + 1;

  r++; ws.getCell(r, 1).value = "Starting Cash / Equity"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  for (const row of capDebtRows) {
    if (!row.enabled || !row.isLoan) continue;
    r++; ws.getCell(r, 1).value = `Loan: ${row.lineItem}`; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = row.loanPrincipal || 0; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;
  }

  r++; ws.getCell(r, 1).value = "Year 1 Revenue (Projected)"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = annualRev[0] || 0; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;

  r++; sec(ws, r, 2); ws.getCell(r, 1).value = "TOTAL SOURCES";
  const srcTotal = r;
  let totalSources = startingCash + (annualRev[0] || 0);
  for (const row of capDebtRows) { if (row.enabled && row.isLoan) totalSources += row.loanPrincipal || 0; }
  ws.getCell(r, 2).value = { formula: `SUM(${cn(sourcesStart, 2)}:${cn(r - 1, 2)})`, result: totalSources };
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "USES OF FUNDS";
  const usesStart = r + 1;

  for (const row of capDebtRows) {
    if (!row.enabled || row.isLoan) continue;
    r++; ws.getCell(r, 1).value = row.lineItem; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = row.amounts?.[0] ?? 0; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;
  }

  if (r < usesStart) {
    r++; ws.getCell(r, 1).value = "No capital expenditures entered"; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = 0; ws.getCell(r, 2).numFmt = CUR;
  }

  r++; sec(ws, r, 2); ws.getCell(r, 1).value = "TOTAL USES";
  const useTotal = r;
  let totalUses = 0;
  for (const row of capDebtRows) { if (row.enabled && !row.isLoan) totalUses += row.amounts?.[0] ?? 0; }
  ws.getCell(r, 2).value = { formula: `SUM(${cn(usesStart, 2)}:${cn(r - 1, 2)})`, result: totalUses };
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r += 2;
  ws.getCell(r, 1).value = "SOURCES − USES (SURPLUS / GAP)"; ws.getCell(r, 1).font = BF;
  ws.getCell(r, 2).value = { formula: `${cn(srcTotal, 2)}-${cn(useTotal, 2)}`, result: totalSources - totalUses };
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;
}

function buildDebtSchedule(wb: ExcelJS.Workbook, capDebtRows: CapitalDebtRow[], yc: number) {
  const ws = wb.addWorksheet("Debt Schedule");
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack — Debt Schedule";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 7); ws.getRow(r).height = 32;

  r = 3;
  ws.getRow(r).values = ["Loan / Facility", "Principal", "Rate", "Term (yrs)", "Annual Payment", "Monthly Payment", "Total Interest"];
  hdr(ws, r, 7);

  const loans = capDebtRows.filter(ro => ro.enabled && ro.isLoan);
  let totalAnnual = 0;

  if (loans.length === 0) {
    r++; ws.getCell(r, 1).value = "No loans entered"; ws.getCell(r, 1).font = NF;
  } else {
    for (const loan of loans) {
      r++;
      const p = loan.loanPrincipal || 0;
      const rate = (loan.loanRate || 0) / 100;
      const term = loan.loanTermYears || 0;
      const annualPmt = computeAnnualDebt(p, rate, term);
      totalAnnual += annualPmt;

      ws.getCell(r, 1).value = loan.lineItem; ws.getCell(r, 1).font = NF;
      ws.getCell(r, 2).value = p; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
      ws.getCell(r, 3).value = rate; ws.getCell(r, 3).numFmt = PCT; dc(ws.getCell(r, 3));
      ws.getCell(r, 4).value = term; ws.getCell(r, 4).numFmt = "0"; dc(ws.getCell(r, 4));
      ws.getCell(r, 5).value = Math.round(annualPmt); ws.getCell(r, 5).numFmt = CUR; dc(ws.getCell(r, 5));
      ws.getCell(r, 6).value = Math.round(annualPmt / 12); ws.getCell(r, 6).numFmt = CUR; dc(ws.getCell(r, 6));
      ws.getCell(r, 7).value = Math.round(annualPmt * term - p); ws.getCell(r, 7).numFmt = CUR; dc(ws.getCell(r, 7));
    }
  }

  r += 2; sec(ws, r, 7); ws.getCell(r, 1).value = "TOTAL DEBT SERVICE";
  r++; ws.getCell(r, 1).value = "Annual Debt Service"; ws.getCell(r, 1).font = BF;
  ws.getCell(r, 2).value = Math.round(totalAnnual); ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Monthly Debt Service"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = Math.round(totalAnnual / 12); ws.getCell(r, 2).numFmt = CUR;

  r += 2; sec(ws, r, 7); ws.getCell(r, 1).value = "AMORTIZATION SCHEDULE (ANNUAL)";
  r++;
  const amortHeaders = ["Year", ...loans.map(l => `${l.lineItem} Balance`)];
  if (amortHeaders.length > 1) {
    ws.getRow(r).values = amortHeaders;
    hdr(ws, r, amortHeaders.length);

    for (let y = 0; y < yc; y++) {
      r++;
      ws.getCell(r, 1).value = `Year ${y + 1}`; ws.getCell(r, 1).font = NF;
      for (let li = 0; li < loans.length; li++) {
        const loan = loans[li];
        const p = loan.loanPrincipal || 0;
        const rate = (loan.loanRate || 0) / 100;
        const term = loan.loanTermYears || 0;
        const annualPmt = computeAnnualDebt(p, rate, term);
        const interestY = p > 0 ? p * rate : 0;
        const principalPaidY = annualPmt - interestY;
        const remainingBal = Math.max(0, p - principalPaidY * (y + 1));
        const cell = ws.getCell(r, li + 2);
        cell.value = Math.round(remainingBal); cell.numFmt = CUR; dc(cell);
      }
    }
  }
}

function computeExportMonthlyRevenue(
  rows: RevenueRow[], students: number, opMonths: number, tiers?: TuitionTier[]
): number[] {
  const monthly = new Array(12).fill(0);
  const rowValues = new Map<string, number>();

  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
      rowValues.set(r.id, tuitionWithTiers(r.amounts?.[0] ?? 0, 0, students, tiers));
    } else {
      rowValues.set(r.id, driverVal(r.amounts, 0, r.driverType, students));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(r.percentBase || "") || 0;
    rowValues.set(r.id, baseVal * ((r.amounts?.[0] ?? 0) / 100));
  }

  for (const r of rows) {
    if (!r.enabled) continue;
    const annualAmount = rowValues.get(r.id) || 0;
    if (annualAmount === 0) continue;

    const isTuition = r.id === "gross_tuition" || r.category === "tuition_offsets";

    if (r.category === "tuition_and_fees" || r.category === "tuition_offsets") {
      if (isTuition) {
        const bm = r.billingMonths ?? 10;
        const effectiveAmount = r.category === "tuition_offsets" ? -Math.abs(annualAmount) : annualAmount;
        const perMonth = effectiveAmount / bm;
        const startMonth = bm >= 12 ? 0 : 1;
        for (let i = startMonth; i < startMonth + bm && i < 12; i++) {
          monthly[i] += perMonth;
        }
      } else {
        monthly[0] += annualAmount;
      }
    } else {
      const perMonth = annualAmount / opMonths;
      for (let m = 0; m < opMonths; m++) {
        monthly[m] += perMonth;
      }
    }
  }
  return monthly;
}

function buildMonthlyCashFlowY1(
  wb: ExcelJS.Workbook, annualRev: number[], annualPersonnel: number[],
  annualExpenses: number[], annualCapDebt: number[], startingCash: number, opMonths: number,
  revenueRows?: RevenueRow[], enrollment?: number[], tiers?: TuitionTier[],
  fiscalYearStartMonth?: number
) {
  const ws = wb.addWorksheet("Cash Flow Monthly Y1");
  const fyStart = fiscalYearStartMonth || 7;
  const monthLabels = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthLabels.push(MONTH_NAMES[mIdx]);
  }
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = [...monthLabels, "Year 1 Total"];
  hdr(ws, r, 14);

  const students = enrollment?.[0] ?? 0;
  const monthlyRevArray = revenueRows && revenueRows.length > 0
    ? computeExportMonthlyRevenue(revenueRows, students, opMonths, tiers)
    : Array.from({ length: 12 }, (_, m) => m < opMonths ? (annualRev[0] || 0) / (opMonths || 12) : 0);
  const monthlyPersonnel = (annualPersonnel[0] || 0) / (opMonths || 12);
  const monthlyOps = (annualExpenses[0] || 0) / (opMonths || 12);
  const monthlyDebt = (annualCapDebt[0] || 0) / 12;

  const revRow = r + 1;
  r++; ws.getCell(r, 1).value = "Revenue"; ws.getCell(r, 1).font = BF;
  let revTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = Math.round(monthlyRevArray[m] || 0);
    revTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: revTotal };
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Personnel"; ws.getCell(r, 1).font = NF;
  let persTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = m < opMonths ? Math.round(monthlyPersonnel) : 0;
    persTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: persTotal };
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NF;
  let opsTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = m < opMonths ? Math.round(monthlyOps) : 0;
    opsTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: opsTotal };
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Debt Service"; ws.getCell(r, 1).font = NF;
  let debtTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = Math.round(monthlyDebt);
    debtTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: debtTotal };
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  const totalExpRow = r + 1;
  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "Total Expenses";
  const monthlyExpTotals: number[] = [];
  let expGrandTotal = 0;
  for (let m = 0; m < 12; m++) {
    const pv = m < opMonths ? Math.round(monthlyPersonnel) : 0;
    const ov = m < opMonths ? Math.round(monthlyOps) : 0;
    const dv = Math.round(monthlyDebt);
    const total = pv + ov + dv;
    monthlyExpTotals.push(total);
    expGrandTotal += total;
    const cell = ws.getCell(r, m + 2);
    cell.value = { formula: `SUM(${cn(revRow + 1, m + 2)}:${cn(r - 1, m + 2)})`, result: total };
    cell.numFmt = CUR; bc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: expGrandTotal };
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Net Cash Flow"; ws.getCell(r, 1).font = BF;
  const monthlyNet: number[] = [];
  let netTotal = 0;
  for (let m = 0; m < 12; m++) {
    const rev = Math.round(monthlyRevArray[m] || 0);
    const net = rev - monthlyExpTotals[m];
    monthlyNet.push(net);
    netTotal += net;
    const cell = ws.getCell(r, m + 2);
    cell.value = { formula: `${cn(revRow, m + 2)}-${cn(totalExpRow, m + 2)}`, result: net };
    cell.numFmt = CUR; bc(cell);
  }
  ws.getCell(r, 14).value = { formula: `SUM(${cn(r, 2)}:${cn(r, 13)})`, result: netTotal };
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  const netCashRow = r;
  r++; ws.getCell(r, 1).value = "Cumulative Cash"; ws.getCell(r, 1).font = BF;
  let cumCash = startingCash;
  const cumValues: number[] = [];
  for (let m = 0; m < 12; m++) {
    cumCash += monthlyNet[m];
    cumValues.push(cumCash);
    const cell = ws.getCell(r, m + 2);
    if (m === 0) {
      cell.value = { formula: `${startingCash}+${cn(netCashRow, m + 2)}`, result: cumCash };
    } else {
      cell.value = { formula: `${cn(r, m + 1)}+${cn(netCashRow, m + 2)}`, result: cumCash };
    }
    cell.numFmt = CUR; bc(cell);
  }
  const endingCash = cumValues[11] || 0;
  ws.getCell(r, 14).value = { formula: cn(r, 13), result: endingCash };
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r += 2; sec(ws, r, 14); ws.getCell(r, 1).value = "CASH FLOW METRICS";
  r++; ws.getCell(r, 1).value = "Starting Cash"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Ending Cash (Month 12)"; ws.getCell(r, 1).font = NF;
  const cumRow = netCashRow + 1;
  ws.getCell(r, 2).value = { formula: cn(cumRow, 13), result: endingCash };
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r++; ws.getCell(r, 1).value = "Minimum Cash Month"; ws.getCell(r, 1).font = NF;
  const minCash = Math.min(...cumValues);
  ws.getCell(r, 2).value = { formula: `MIN(${cn(cumRow, 2)}:${cn(cumRow, 13)})`, result: minCash };
  ws.getCell(r, 2).numFmt = CUR;

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildFiveYearPL(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], yc: number, cols: number, yearHeaders: string[],
  entityType?: string
) {
  const ws = wb.addWorksheet("5-Year P&L");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const lineItems: [string, number[], boolean][] = [
    ["Total Revenue", rev, true],
    ["Personnel", personnel, false],
    ["Operating Expenses", ops, false],
    ["Capital & Debt Service", capDebt, false],
  ];

  for (const [label, arr, bold] of lineItems) {
    r++; ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = bold ? BF : NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = arr[y] || 0; cell.numFmt = CUR;
      if (bold) bc(cell); else dc(cell);
    }
  }

  const revRowPL = 2;
  const totalExpRow = r + 1;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "Total Expenses";
  for (let y = 0; y < yc; y++) {
    const totalExp = (personnel[y] || 0) + (ops[y] || 0) + (capDebt[y] || 0);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `SUM(${cn(3, y + 2)}:${cn(r - 1, y + 2)})`, result: totalExp };
    cell.numFmt = CUR; bc(cell);
  }

  const niLabel = entityType === "nonprofit_501c3" ? "Net Income" : "Profit / (Loss)";
  r++; ws.getCell(r, 1).value = niLabel; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${cn(revRowPL, y + 2)}-${cn(totalExpRow, y + 2)}`, result: ni[y] || 0 };
    cell.numFmt = CUR; bc(cell);
  }

  const niRow = r;
  r++; ws.getCell(r, 1).value = "Net Margin %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const margin = (rev[y] || 0) === 0 ? 0 : (ni[y] || 0) / (rev[y] || 1);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `IF(${cn(revRowPL, y + 2)}=0,0,${cn(niRow, y + 2)}/${cn(revRowPL, y + 2)})`, result: margin };
    cell.numFmt = PCT; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cumulative Net Income"; ws.getCell(r, 1).font = BF;
  let cumNI = 0;
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y] || 0;
    const cell = ws.getCell(r, y + 2);
    if (y === 0) cell.value = { formula: cn(niRow, 2), result: cumNI };
    else cell.value = { formula: `${cn(r, y + 1)}+${cn(niRow, y + 2)}`, result: cumNI };
    cell.numFmt = CUR; bc(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function computeRemainingDebtForYear(capDebtRows: CapitalDebtRow[], year: number): number {
  let remaining = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    const p = r.loanPrincipal || 0;
    const rate = (r.loanRate || 0) / 100;
    const term = r.loanTermYears || 0;
    if (p <= 0 || term <= 0) continue;
    const annualPmt = computeAnnualDebt(p, rate, term);
    let balance = p;
    for (let y = 0; y < year; y++) {
      const interest = balance * rate;
      const principalPaid = annualPmt - interest;
      balance = Math.max(0, balance - principalPaid);
    }
    remaining += balance;
  }
  return remaining;
}

function buildFiveYearBS(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], cumNI: number[], startingCash: number,
  totalPrincipal: number, capDebtRows: CapitalDebtRow[], yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("5-Year Balance Sheet");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "ASSETS";

  r++; ws.getCell(r, 1).value = "Cash & Equivalents"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = startingCash + cumNI[y]; cell.numFmt = CUR; dc(cell);
  }
  const cashRow = r;

  r++; ws.getCell(r, 1).value = "Other Assets"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Assets"; ws.getCell(r, 1).font = BF;
  const totalAssetsRow = r;
  const totalAssetsVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const cashVal = startingCash + cumNI[y];
    const totalAssets = cashVal + 0;
    totalAssetsVals.push(totalAssets);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `SUM(${cn(cashRow, y + 2)}:${cn(r - 1, y + 2)})`, result: totalAssets };
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "LIABILITIES";

  r++; ws.getCell(r, 1).value = "Debt Outstanding"; ws.getCell(r, 1).font = NF;
  const debtVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const dv = Math.round(computeRemainingDebtForYear(capDebtRows, y + 1));
    debtVals.push(dv);
    const cell = ws.getCell(r, y + 2);
    cell.value = dv; cell.numFmt = CUR; dc(cell);
  }
  const debtRow = r;

  r++; ws.getCell(r, 1).value = "Other Liabilities"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Liabilities"; ws.getCell(r, 1).font = BF;
  const totalLiabRow = r;
  const totalLiabVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const totalLiab = debtVals[y] + 0;
    totalLiabVals.push(totalLiab);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `SUM(${cn(debtRow, y + 2)}:${cn(r - 1, y + 2)})`, result: totalLiab };
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "EQUITY / NET ASSETS";

  r++; ws.getCell(r, 1).value = "Beginning Equity"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = y === 0 ? startingCash : startingCash + cumNI[y - 1];
    cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Net Income / (Loss)"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = ni[y]; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Equity"; ws.getCell(r, 1).font = BF;
  const totalEquityRow = r;
  const totalEquityVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const begEquity = y === 0 ? startingCash : startingCash + cumNI[y - 1];
    const totalEquity = begEquity + ni[y];
    totalEquityVals.push(totalEquity);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `SUM(${cn(r - 2, y + 2)}:${cn(r - 1, y + 2)})`, result: totalEquity };
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; ws.getCell(r, 1).value = "BALANCE CHECK (Assets − Liab − Equity)"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const balCheck = totalAssetsVals[y] - totalLiabVals[y] - totalEquityVals[y];
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${cn(totalAssetsRow, y + 2)}-${cn(totalLiabRow, y + 2)}-${cn(totalEquityRow, y + 2)}`, result: balCheck };
    cell.numFmt = CUR; bc(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildDSCRCovenant(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], annualDebtSvc: number, startingCash: number,
  enrollment: number[], maxCapacity: number, yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("DSCR & Covenants");
  ws.columns = [{ width: 38 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "DEBT SERVICE COVERAGE RATIO (DSCR)";

  r++; ws.getCell(r, 1).value = "Net Operating Income (NOI)"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const noi = rev[y] - personnel[y] - ops[y];
    const cell = ws.getCell(r, y + 2); cell.value = Math.round(noi); cell.numFmt = CUR; dc(cell);
  }
  const noiRow = r;

  r++; ws.getCell(r, 1).value = "Annual Debt Service"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = Math.round(annualDebtSvc); cell.numFmt = CUR; dc(cell);
  }
  const dsRow = r;

  r++; ws.getCell(r, 1).value = "DSCR"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const roundedDS = Math.round(annualDebtSvc);
    if (annualDebtSvc > 0) {
      const noi = Math.round(rev[y] - personnel[y] - ops[y]);
      const dscrVal = roundedDS === 0 ? "N/A" : noi / roundedDS;
      cell.value = { formula: `IF(${cn(dsRow, y + 2)}=0,"N/A",${cn(noiRow, y + 2)}/${cn(dsRow, y + 2)})`, result: dscrVal };
    } else {
      cell.value = "N/A";
    }
    cell.numFmt = "0.00x"; bc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "LIQUIDITY METRICS";

  r++; ws.getCell(r, 1).value = "Ending Cash Balance"; ws.getCell(r, 1).font = NF;
  let cumNI = 0;
  const cashBalances: number[] = [];
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y];
    const cashBal = Math.round(startingCash + cumNI);
    cashBalances.push(cashBal);
    const cell = ws.getCell(r, y + 2); cell.value = cashBal; cell.numFmt = CUR; dc(cell);
  }
  const cashBalRow = r;

  r++; ws.getCell(r, 1).value = "Monthly Operating Cost"; ws.getCell(r, 1).font = NF;
  const monthlyOpsCosts: number[] = [];
  for (let y = 0; y < yc; y++) {
    const totalOps = personnel[y] + ops[y];
    const moc = Math.round(totalOps / 12);
    monthlyOpsCosts.push(moc);
    const cell = ws.getCell(r, y + 2); cell.value = moc; cell.numFmt = CUR; dc(cell);
  }
  const monthlyOpsRow = r;

  r++; ws.getCell(r, 1).value = "Cash Reserve (Months)"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const reserveMonths = monthlyOpsCosts[y] === 0 ? 0 : cashBalances[y] / monthlyOpsCosts[y];
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `IF(${cn(monthlyOpsRow, y + 2)}=0,0,${cn(cashBalRow, y + 2)}/${cn(monthlyOpsRow, y + 2)})`, result: reserveMonths };
    cell.numFmt = "0.0"; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Days Cash on Hand"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const totalOps = personnel[y] + ops[y];
    const dailyOps = totalOps / 365;
    cumNI = 0;
    for (let yy = 0; yy <= y; yy++) cumNI += ni[yy];
    const cash = startingCash + cumNI;
    const cell = ws.getCell(r, y + 2);
    cell.value = dailyOps > 0 ? Math.round(cash / dailyOps) : 0;
    cell.numFmt = NUM; dc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "COVENANT CHECKS";

  r++; ws.getCell(r, 1).value = "DSCR ≥ 1.20x"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (annualDebtSvc > 0) {
      const noi = rev[y] - personnel[y] - ops[y];
      const dscr = noi / annualDebtSvc;
      cell.value = dscr >= 1.2 ? "PASS" : "FAIL";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dscr >= 1.2 ? GREEN_BG.slice(2) : RED_BG.slice(2) } };
    } else {
      cell.value = "N/A";
    }
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Cash Reserve ≥ 2.0 Months"; ws.getCell(r, 1).font = NF;
  cumNI = 0;
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y];
    const cash = startingCash + cumNI;
    const monthlyOps = (personnel[y] + ops[y]) / 12;
    const reserve = monthlyOps > 0 ? cash / monthlyOps : 0;
    const cell = ws.getCell(r, y + 2);
    cell.value = reserve >= 2.0 ? "PASS" : "FAIL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: reserve >= 2.0 ? GREEN_BG.slice(2) : RED_BG.slice(2) } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Positive Net Income"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = ni[y] >= 0 ? "PASS" : "FAIL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ni[y] >= 0 ? GREEN_BG.slice(2) : RED_BG.slice(2) } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Enrollment ≥ 70% Capacity"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const util = maxCapacity > 0 ? enrollment[y] / maxCapacity : 0;
    const cell = ws.getCell(r, y + 2);
    cell.value = util >= 0.7 ? "PASS" : "FAIL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: util >= 0.7 ? GREEN_BG.slice(2) : RED_BG.slice(2) } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildUnderwritingSnapshot(
  wb: ExcelJS.Workbook, sp: SchoolProfile, rev: number[], personnel: number[],
  ops: number[], capDebt: number[], ni: number[], cumNI: number[],
  annualDebtSvc: number, startingCash: number, enrollment: number[],
  maxCapacity: number, totalPrincipalFromLoans: number, yc: number
) {
  const ws = wb.addWorksheet("Underwriting Snapshot");
  ws.columns = [{ width: 42 }, { width: 25 }, { width: 16 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack — Underwriting Snapshot";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 3); ws.getRow(r).height = 36;

  r++; ws.getCell(r, 1).value = `${sp.schoolName || "School"} | ${schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)} | ${sp.state || ""}`;
  ws.getCell(r, 1).font = { size: 12, color: { argb: "FF64748B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 3);

  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "POLICY FLAGS";

  const flags: [string, boolean, string][] = [];

  const y1NOI = rev[0] - personnel[0] - ops[0];
  const y1DSCR = annualDebtSvc > 0 ? y1NOI / annualDebtSvc : 0;
  if (annualDebtSvc > 0) {
    flags.push(["DSCR ≥ 1.20x (Year 1)", y1DSCR >= 1.2, `${y1DSCR.toFixed(2)}x`]);
  }

  const y1Cash = startingCash + ni[0];
  const y1MonthlyOps = (personnel[0] + ops[0]) / 12;
  const y1Reserve = y1MonthlyOps > 0 ? y1Cash / y1MonthlyOps : 0;
  flags.push(["Min 2 Months Cash Reserve (Year 1)", y1Reserve >= 2.0, `${y1Reserve.toFixed(1)} months`]);

  flags.push(["Positive Net Income (Year 1)", ni[0] >= 0, ni[0] >= 0 ? "Yes" : "No"]);

  let breakEvenYear = -1;
  for (let y = 0; y < yc; y++) {
    if (ni[y] >= 0) { breakEvenYear = y + 1; break; }
  }
  flags.push(["Break-Even Within Projection Period", breakEvenYear > 0, breakEvenYear > 0 ? `Year ${breakEvenYear}` : "Not Reached"]);

  const y1Util = maxCapacity > 0 ? enrollment[0] / maxCapacity : 0;
  flags.push(["Enrollment ≥ 70% Capacity (Year 1)", y1Util >= 0.7, `${(y1Util * 100).toFixed(0)}%`]);

  const endingCash = startingCash + cumNI[yc - 1];
  flags.push(["Positive Ending Cash (Final Year)", endingCash > 0, endingCash > 0 ? "Yes" : "No"]);

  for (const [label, pass, detail] of flags) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = pass ? "PASS" : "FAIL";
    ws.getCell(r, 2).font = BF;
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pass ? GREEN_BG.slice(2) : RED_BG.slice(2) } };
    ws.getCell(r, 3).value = detail; ws.getCell(r, 3).font = NF;
  }

  const passCount = flags.filter(f => f[1]).length;
  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "UNDERWRITING ASSESSMENT";
  r++; ws.getCell(r, 1).value = "Flags Passed"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = `${passCount} / ${flags.length}`; ws.getCell(r, 2).font = BF;

  const assessment = passCount === flags.length ? "Strong" : passCount >= flags.length - 1 ? "Conditional" : passCount >= flags.length / 2 ? "Weak" : "Not Ready";
  r++; ws.getCell(r, 1).value = "Overall Assessment"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = assessment; ws.getCell(r, 2).font = BF;
  const assessFill = assessment === "Strong" ? GREEN_BG : assessment === "Conditional" ? AMBER_BG : RED_BG;
  ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: assessFill.slice(2) } };

  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "KEY METRICS SUMMARY";

  const metrics: [string, string | number, string][] = [
    ["Year 1 Revenue", rev[0], CUR],
    ["Year 1 Total Expenses", personnel[0] + ops[0] + capDebt[0], CUR],
    ["Year 1 Net Income", ni[0], CUR],
    ["Year 1 Net Margin", rev[0] > 0 ? ni[0] / rev[0] : 0, PCT],
    ["Starting Cash", startingCash, CUR],
    ["Year 1 Ending Cash", startingCash + ni[0], CUR],
    ["Total Debt", totalPrincipalFromLoans, CUR],
    ["Year 1 DSCR", annualDebtSvc > 0 ? `${y1DSCR.toFixed(2)}x` : "N/A", ""],
    ["Year 1 Cash Reserve (Months)", `${y1Reserve.toFixed(1)}`, ""],
    ["Break-Even Year", breakEvenYear > 0 ? `Year ${breakEvenYear}` : "Not Reached", ""],
    ["Revenue per Student (Year 1)", enrollment[0] > 0 ? Math.round(rev[0] / enrollment[0]) : 0, CUR],
    ["Cost per Student (Year 1)", enrollment[0] > 0 ? Math.round((personnel[0] + ops[0] + capDebt[0]) / enrollment[0]) : 0, CUR],
  ];

  for (const [label, val, fmt] of metrics) {
    r++; ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = val;
    ws.getCell(r, 2).font = BF;
    if (fmt) ws.getCell(r, 2).numFmt = fmt;
  }
}


function buildSummary(
  wb: ExcelJS.Workbook, sp: SchoolProfile, rev: number[], personnel: number[],
  ops: number[], capDebt: number[], ni: number[], cumNI: number[],
  annualDebtSvc: number, startingCash: number, enrollment: number[],
  yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Financial Summary`;
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols); ws.getRow(r).height = 32;

  r = 3;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const rows: [string, number[], boolean, string][] = [
    ["Students", enrollment, false, NUM],
    ["Total Revenue", rev, true, CUR],
    ["Personnel", personnel, false, CUR],
    ["Operating Expenses", ops, false, CUR],
    ["Capital & Debt", capDebt, false, CUR],
  ];

  for (const [label, arr, bold, fmt] of rows) {
    r++; ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = bold ? BF : NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2); cell.value = arr[y] || 0; cell.numFmt = fmt;
      if (bold) bc(cell); else dc(cell);
    }
  }

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "Total Expenses";
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = personnel[y] + ops[y] + capDebt[y]; cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = sp.entityType === "nonprofit_501c3" ? "Net Income" : "Profit / (Loss)";
  ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = ni[y]; cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Net Margin %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = rev[y] > 0 ? ni[y] / rev[y] : 0; cell.numFmt = PCT; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cumulative Net Income"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = cumNI[y]; cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cash Balance"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = startingCash + cumNI[y]; cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Revenue per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = enrollment[y] > 0 ? Math.round(rev[y] / enrollment[y]) : 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cost per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const totalCost = personnel[y] + ops[y] + capDebt[y];
    cell.value = enrollment[y] > 0 ? Math.round(totalCost / enrollment[y]) : 0; cell.numFmt = CUR; dc(cell);
  }

  if (annualDebtSvc > 0) {
    r++; ws.getCell(r, 1).value = "DSCR"; ws.getCell(r, 1).font = BF;
    for (let y = 0; y < yc; y++) {
      const noi = rev[y] - personnel[y] - ops[y];
      const cell = ws.getCell(r, y + 2);
      cell.value = annualDebtSvc > 0 ? Math.round(noi / annualDebtSvc * 100) / 100 : 0;
      cell.numFmt = "0.00x"; bc(cell);
    }
  }

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];
}
