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
  locationSecured?: boolean;
  facilityStreet?: string;
  facilityCity?: string;
  facilityState?: string;
  facilityZip?: string;
  ownershipType?: string;
  propertyTaxAnnual?: number;
  hasMortgage?: boolean;
  mortgageMonthlyPayment?: number;
  leaseExpirationMonth?: number;
  leaseExpirationYear?: number;
  monthlyRent?: number;
  annualRentEscalation?: number;
  postLeaseRenewalBump?: number;
  isNNNLease?: boolean;
  nnnCamCharges?: number;
  nnnMaintenance?: number;
  nnnUtilities?: number;
  estimatedMonthlyFacilityBudget?: number;
}

interface TuitionTier {
  id: string;
  tierType: string;
  label: string;
  discountPercent: number;
  studentCounts: number[];
}

function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Income" : "Profit";
}

function cumulativeProfitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Cumulative Net Income" : "Cumulative Profit";
}

function profitMarginLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Margin %" : "Profit Margin %";
}

function entityTypeDisplay(entityType?: string): string {
  switch (entityType) {
    case "sole_practitioner": return "Sole Practitioner";
    case "llc_single": return "LLC — Single Member";
    case "llc_partnership": return "LLC — Partnership";
    case "c_corp": return "C Corporation";
    case "s_corp": return "S Corporation";
    case "nonprofit_501c3": return "501(c)(3) Nonprofit";
    default: return entityType || "";
  }
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
  note?: string;
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

interface PriorYearSnapshot {
  endingEnrollment?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  endingCash?: number;
}

interface ConsultantSummary {
  executiveSummary?: string;
  lenderReadiness?: string;
  lenderReadinessExplanation?: string;
  biggestStrength?: string;
  biggestRisk?: string;
  recommendations?: Array<{ title: string; description: string; priority: string }>;
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
const NORMAL_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BOLD_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const CURRENCY_FORMAT = '#,##0;[Red](#,##0);"-"';
const PERCENT_FORMAT = '0.0%;[Red](0.0%);"-"';
const NUMBER_FORMAT = '#,##0;[Red](#,##0);"-"';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

function styleDataCell(cell: ExcelJS.Cell) {
  cell.font = NORMAL_FONT;
  cell.border = THIN_BORDER;
}

function styleBoldDataCell(cell: ExcelJS.Cell) {
  cell.font = BOLD_FONT;
  cell.border = THIN_BORDER;
}

function computeRevenueMixForExport(
  rows: RevenueRow[],
  enrollment: number[],
  yearCount: number,
  tuitionTiers?: TuitionTier[],
): { tuitionPct: number[]; publicPct: number[]; philanthropyPct: number[] } {
  const tuitionPct: number[] = [];
  const publicPct: number[] = [];
  const philanthropyPct: number[] = [];

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const rowValues = new Map<string, number>();

    for (const row of rows) {
      if (!row.enabled || row.driverType === "percent_of_base") continue;
      if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
        const perStudentAmount = row.amounts?.[y] ?? 0;
        rowValues.set(row.id, computeTuitionWithTiersForMix(perStudentAmount, y, students, tuitionTiers));
      } else {
        rowValues.set(row.id, computeDriverValueExport(row.amounts, y, row.driverType, students));
      }
    }
    for (const row of rows) {
      if (!row.enabled || row.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(row.percentBase || "") || 0;
      const pctVal = (row.amounts?.[y] ?? 0) / 100;
      rowValues.set(row.id, baseVal * pctVal);
    }

    let tuition = 0, publicFund = 0, philanthropy = 0;
    for (const row of rows) {
      if (!row.enabled) continue;
      const val = rowValues.get(row.id) || 0;
      switch (row.category) {
        case "tuition_and_fees": case "other_revenue": tuition += val; break;
        case "tuition_offsets": tuition -= val; break;
        case "public_funding": case "school_choice": publicFund += val; break;
        case "grants_contributions": philanthropy += val; break;
      }
    }

    const total = tuition + publicFund + philanthropy;
    tuitionPct.push(total > 0 ? tuition / total : 0);
    publicPct.push(total > 0 ? publicFund / total : 0);
    philanthropyPct.push(total > 0 ? philanthropy / total : 0);
  }

  return { tuitionPct, publicPct, philanthropyPct };
}

function computeTuitionWithTiersForMix(
  grossPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers: TuitionTier[],
): number {
  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }
  if (rawTierTotal === 0) return grossPerStudent * totalStudents;

  const scaleFactor = rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;
  let total = 0;
  let allocated = 0;
  for (const tier of tuitionTiers) {
    const scaled = (tier.studentCounts?.[yearIdx] ?? 0) * scaleFactor;
    allocated += scaled;
    total += scaled * grossPerStudent * (1 - (tier.discountPercent || 0) / 100);
  }
  const remaining = totalStudents - allocated;
  if (remaining > 0) total += remaining * grossPerStudent;
  return total;
}

function computeDriverValueExport(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function schoolTypeDisplay(type?: string, otherLabel?: string): string {
  switch (type) {
    case "charter_school": return "Charter School";
    case "homeschool_coop": return "Homeschool Co-Op";
    case "learning_pod": return "Learning Pod";
    case "microschool": return "Microschool";
    case "private_school": return "Private School";
    case "tutoring_center": return "Tutoring Center";
    case "other": return otherLabel || "Other";
    default: return type || "";
  }
}

function c(row: number, col: number): string {
  return `${String.fromCharCode(64 + col)}${row}`;
}

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function computeAnnualDebtService(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / termYears;
  const monthlyRate = annualRate / 12;
  const months = termYears * 12;
  const mp = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return mp * 12;
}

function driverLabel(dt: string): string {
  switch (dt) {
    case "annual_fixed": return "Annual";
    case "monthly": return "Monthly";
    case "per_student": return "Per Student";
    case "percent_of_base": return "% of Base";
    case "percent_of_revenue": return "% of Revenue";
    default: return dt;
  }
}

function funcCategoryLabel(fc: string): string {
  switch (fc) {
    case "instructional": return "Instructional";
    case "school_leadership": return "School Leadership";
    case "student_support": return "Student Support";
    case "operations": return "Operations";
    case "administrative": return "Administrative";
    case "other": return "Other";
    default: return fc;
  }
}

function empTypeLabel(et: string): string {
  switch (et) {
    case "full_time": return "Full-Time";
    case "part_time": return "Part-Time";
    case "contract": return "Contract";
    default: return et;
  }
}

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  tuition_and_fees: "TUITION & STUDENT FEES",
  tuition_offsets: "TUITION OFFSETS",
  public_funding: "PUBLIC FUNDING",
  school_choice: "SCHOOL CHOICE / CHOICE FUNDING",
  grants_contributions: "GRANTS, CONTRIBUTIONS & OTHER SUPPORT",
  other_revenue: "OTHER REVENUE",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  instructional_program: "INSTRUCTIONAL / PROGRAM",
  technology: "TECHNOLOGY",
  occupancy_facility: "OCCUPANCY / FACILITY",
  administrative_general: "ADMINISTRATIVE / GENERAL",
};

interface PrecomputedFinancials {
  revenueByRow: Map<string, number[]>;
  revenueCategoryTotals: Map<string, number[]>;
  totalRevenue: number[];
  totalPersonnel: number[];
  totalExpenses: number[];
  totalCapDebt: number[];
  totalAllExpenses: number[];
  netIncome: number[];
  cumulativeNI: number[];
}

function precomputeFinancials(
  revenueRows: RevenueRow[],
  staffingRows: StaffingRow[],
  expenseRows: ExpenseRow[],
  capDebtRows: CapitalDebtRow[],
  enrollment: number[],
  yearCount: number,
  salaryEscRate: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
): PrecomputedFinancials {
  const revenueByRow = new Map<string, number[]>();
  const revenueCategoryTotals = new Map<string, number[]>();
  const totalRevenue: number[] = [];
  const totalPersonnel: number[] = [];
  const totalExpenses: number[] = [];
  const totalCapDebt: number[] = [];
  const totalAllExpenses: number[] = [];
  const netIncome: number[] = [];
  const cumulativeNI: number[] = [];

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const pf = y === 0 ? prorationFactor : 1;

    const rowValues = new Map<string, number>();
    for (const row of revenueRows) {
      if (!row.enabled || row.driverType === "percent_of_base") continue;
      if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
        rowValues.set(row.id, computeTuitionWithTiersExport(row.amounts?.[y] ?? 0, y, students, tuitionTiers));
      } else {
        rowValues.set(row.id, computeDriverValue(row.amounts, y, row.driverType, students));
      }
    }
    for (const row of revenueRows) {
      if (!row.enabled || row.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(row.percentBase || "") || 0;
      rowValues.set(row.id, baseVal * ((row.amounts?.[y] ?? 0) / 100));
    }

    let yearTotalRev = 0;
    for (const row of revenueRows) {
      if (!row.enabled) continue;
      let val = rowValues.get(row.id) || 0;
      if (row.category === "tuition_offsets") val = -Math.abs(val);
      if (!revenueByRow.has(row.id)) revenueByRow.set(row.id, []);
      revenueByRow.get(row.id)!.push(val);
      yearTotalRev += val;

      const catKey = row.category;
      if (!revenueCategoryTotals.has(catKey)) revenueCategoryTotals.set(catKey, new Array(yearCount).fill(0));
      revenueCategoryTotals.get(catKey)![y] += val;
    }

    let grandTotalBase = 0;
    for (const row of staffingRows) {
      const annual = row.fte * row.annualizedRate;
      const isContractNoPL = row.employmentType === "contract" && !row.payrollLike;
      let benefits = 0, tax = 0;
      if (!isContractNoPL) {
        if (row.benefitsEligible) benefits = annual * (row.benefitsRate / 100);
        tax = annual * (row.payrollTaxRate / 100);
      }
      grandTotalBase += annual + benefits + tax;
    }
    const personnelEsc = Math.pow(1 + salaryEscRate, y);
    const yearPersonnel = Math.round(grandTotalBase * personnelEsc * pf);

    let yearExpenses = 0;
    for (const row of expenseRows) {
      if (!row.enabled) continue;
      if (row.driverType === "percent_of_revenue") {
        yearExpenses += ((row.amounts?.[y] ?? 0) / 100) * yearTotalRev;
      } else {
        yearExpenses += computeDriverValue(row.amounts, y, row.driverType, students);
      }
    }
    yearExpenses = Math.round(yearExpenses);

    let yearCapDebt = 0;
    for (const row of capDebtRows) {
      if (!row.enabled) continue;
      if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
        yearCapDebt += computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
      } else {
        yearCapDebt += computeDriverValue(row.amounts, y, row.driverType, students);
      }
    }
    yearCapDebt = Math.round(yearCapDebt);

    const yearRevRounded = Math.round(yearTotalRev);
    const yearAllExp = yearPersonnel + yearExpenses + yearCapDebt;
    const yearNI = yearRevRounded - yearAllExp;

    totalRevenue.push(yearRevRounded);
    totalPersonnel.push(yearPersonnel);
    totalExpenses.push(yearExpenses);
    totalCapDebt.push(yearCapDebt);
    totalAllExpenses.push(yearAllExp);
    netIncome.push(yearNI);
    cumulativeNI.push((cumulativeNI[y - 1] || 0) + yearNI);
  }

  return { revenueByRow, revenueCategoryTotals, totalRevenue, totalPersonnel, totalExpenses, totalCapDebt, totalAllExpenses, netIncome, cumulativeNI };
}

export async function generateWorkbook(rawData: Record<string, unknown>, consultantData?: ConsultantSummary): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};

  const hasRowData = !!(
    (data.revenueRows && data.revenueRows.length > 0) ||
    (data.staffingRows && data.staffingRows.length > 0) ||
    (data.expenseRows && data.expenseRows.length > 0)
  );

  const yearCount = hasRowData
    ? (data.revenueRows?.[0]?.amounts?.length || data.expenseRows?.[0]?.amounts?.length || (sp.schoolStage === "operating_school" ? 5 : 3))
    : 5;

  const enrollmentByYear = [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];

  const salaryEscRate = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100
    : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100
    : 0;
  const isPartial = sp.isPartialFirstYear || false;
  const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = operatingMonths / 12;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const cols = yearCount + 1;
  const yearHeaders = ["", ...Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`)];

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];

    const precomputed = precomputeFinancials(revenueRows, staffingRows, expenseRows, capDebtRows, enrollmentByYear, yearCount, salaryEscRate, prorationFactor, data.tuitionTiers);

    const assumptionsWs = wb.addWorksheet("Assumptions");
    const aRefs = buildAssumptionsTab(assumptionsWs, sp, enrollmentByYear, yearCount, salaryEscRate, costInflation, prorationFactor, data.tuitionTiers);

    const revenueWs = wb.addWorksheet("Revenue Schedule");
    const staffingWs = wb.addWorksheet("Staffing & Personnel");
    const expensesWs = wb.addWorksheet("Operating Expenses");
    const capitalWs = wb.addWorksheet("Capital & Debt");
    const pnlWs = wb.addWorksheet("Financial Model");
    const summaryWs = wb.addWorksheet("Summary");

    const revTotalRow = buildRevenueScheduleTab(revenueWs, revenueRows, enrollmentByYear, yearCount, cols, yearHeaders, aRefs, data.tuitionTiers, precomputed);
    const staffTotalRow = buildStaffingTab(staffingWs, staffingRows, salaryEscRate, prorationFactor, yearCount, cols, yearHeaders, aRefs);
    const expTotalRow = buildExpensesTab(expensesWs, expenseRows, enrollmentByYear, revTotalRow, yearCount, cols, yearHeaders, aRefs, precomputed);
    const capTotalRow = buildCapitalDebtTab(capitalWs, capDebtRows, enrollmentByYear, yearCount, cols, yearHeaders, aRefs);

    buildPnLTab(pnlWs, yearCount, cols, yearHeaders, revTotalRow, staffTotalRow, expTotalRow, capTotalRow, sp.entityType, precomputed);

    const revenueMix = computeRevenueMixForExport(revenueRows, enrollmentByYear, yearCount, data.tuitionTiers);
    buildSummaryTabNew(summaryWs, sp, yearCount, cols, yearHeaders, {
      fmRevenueRow: 2, fmStaffRow: 3, fmExpenseRow: 4, fmCapDebtRow: 5,
      fmTotalExpRow: 6, fmNIRow: 7, fmCumNIRow: 8, fmReserveRow: 9,
      studentsRef: (cl) => `'Revenue Schedule'!${cl}2`,
      revenueMix,
    }, consultantData);

    if (consultantData) {
      const notesWs = wb.addWorksheet("Consultant Notes");
      buildConsultantNotesTab(notesWs, consultantData);
    }

    if (data.priorYearSnapshot && sp.schoolStage === "operating_school") {
      const priorWs = wb.addWorksheet("Prior-Year Snapshot");
      buildPriorYearTab(priorWs, data.priorYearSnapshot, sp.entityType);
    }
  } else {
    const assumptionsWs = wb.addWorksheet("Assumptions");
    buildAssumptionsTab(assumptionsWs, sp, enrollmentByYear, yearCount, salaryEscRate, costInflation, prorationFactor, data.tuitionTiers);

    const pnlWs = wb.addWorksheet("Financial Model");
    buildLegacyPnLTab(pnlWs, data, enrollmentByYear, yearCount, cols, yearHeaders, prorationFactor);

    const summaryWs = wb.addWorksheet("Summary");
    buildSummaryTabNew(summaryWs, sp, yearCount, cols, yearHeaders, {
      fmRevenueRow: 3, fmStaffRow: 4, fmExpenseRow: 5, fmCapDebtRow: 0,
      fmTotalExpRow: 6, fmNIRow: 7, fmCumNIRow: 8, fmReserveRow: 9,
      studentsRef: (cl) => `'Financial Model'!${cl}2`,
    }, consultantData);

    if (consultantData) {
      const notesWs = wb.addWorksheet("Consultant Notes");
      buildConsultantNotesTab(notesWs, consultantData);
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

interface AssumptionRefs {
  enrollmentRows: number[];
  salaryEscRow: number;
  costInflationRow: number;
  prorationRow: number;
}

function buildAssumptionsTab(
  ws: ExcelJS.Worksheet,
  sp: SchoolProfile,
  enrollment: number[],
  yearCount: number,
  salaryEscRate: number,
  costInflation: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
): AssumptionRefs {
  ws.columns = [{ width: 35 }, { width: 25 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget — Assumptions";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const profileItems: [string, string | number][] = [
    ["School Name", sp.schoolName || ""],
    ["State", sp.state || ""],
    ["School Type", schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityTypeDisplay(sp.entityType)],
    ...(sp.ein ? [["EIN", sp.ein] as [string, string]] : []),
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    ["Opening Year", sp.openingYear || 0],
    ["Current Students", sp.currentStudents || 0],
    ["Max Student Capacity", sp.maxCapacity || 0],
    ["Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July"],
  ];

  if (sp.isPartialFirstYear) {
    profileItems.push(["Year 1 Operating Months", sp.year1OperatingMonths || 12]);
  }

  if (sp.schoolType === "private_school") {
    profileItems.push(["Accredited", sp.isAccredited ? "Yes" : "No"]);
    if (sp.isAccredited && sp.accreditingBody) {
      profileItems.push(["Accrediting Body", sp.accreditingBody]);
    }
  }

  if (sp.hasManagementFee) {
    profileItems.push(["Management Fee", `${sp.managementFeePercent || 0}% of Revenue`]);
  }

  if (sp.locationSecured !== undefined) {
    profileItems.push(["Location Secured", sp.locationSecured ? "Yes" : "No (Estimated)"]);
  }
  if (sp.locationSecured && sp.facilityStreet) {
    const addr = [sp.facilityStreet, sp.facilityCity, sp.facilityState, sp.facilityZip].filter(Boolean).join(", ");
    profileItems.push(["Facility Address", addr]);
  }
  if (sp.ownershipType) {
    profileItems.push(["Facility Ownership", sp.ownershipType === "own" ? "Owned" : "Rented / Leased"]);
  }
  if (sp.ownershipType === "rent") {
    if (sp.monthlyRent) profileItems.push(["Monthly Rent", `$${(sp.monthlyRent).toLocaleString()}`]);
    if (sp.annualRentEscalation) profileItems.push(["Annual Rent Escalation", `${sp.annualRentEscalation}%`]);
    if (sp.leaseExpirationMonth && sp.leaseExpirationYear) {
      const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      profileItems.push(["Lease Expiration", `${monthNames[sp.leaseExpirationMonth] || ""} ${sp.leaseExpirationYear}`]);
    }
    if (sp.postLeaseRenewalBump) profileItems.push(["Post-Lease Renewal Bump", `${sp.postLeaseRenewalBump}%`]);
    if (sp.isNNNLease) {
      profileItems.push(["Lease Type", "Triple Net (NNN)"]);
      const nnnTotal = (sp.nnnCamCharges || 0) + (sp.nnnMaintenance || 0) + (sp.nnnUtilities || 0);
      if (nnnTotal > 0) profileItems.push(["Monthly NNN Charges", `$${nnnTotal.toLocaleString()}`]);
    }
  }
  if (sp.ownershipType === "own") {
    if (sp.entityType && sp.entityType !== "nonprofit_501c3" && sp.propertyTaxAnnual) {
      profileItems.push(["Annual Property Tax", `$${sp.propertyTaxAnnual.toLocaleString()}`]);
    }
    if (sp.hasMortgage && sp.mortgageMonthlyPayment) {
      profileItems.push(["Monthly Mortgage Payment", `$${sp.mortgageMonthlyPayment.toLocaleString()}`]);
    }
  }
  if (!sp.locationSecured && sp.estimatedMonthlyFacilityBudget) {
    profileItems.push(["Estimated Monthly Facility Budget", `$${sp.estimatedMonthlyFacilityBudget.toLocaleString()}`]);
  }

  for (const [label, value] of profileItems) {
    r++;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value;
    ws.getCell(r, 2).font = BOLD_FONT;
  }

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "ENROLLMENT BY YEAR";

  const enrollmentRows: number[] = [];
  for (let y = 0; y < yearCount; y++) {
    r++;
    enrollmentRows.push(r);
    ws.getCell(r, 1).value = `Year ${y + 1} Students`;
    ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = enrollment[y];
    ws.getCell(r, 2).font = BOLD_FONT;
    ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  }

  if (tuitionTiers && tuitionTiers.length > 0 && sp.schoolType !== "charter_school") {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "TUITION DISCOUNT TIERS";

    for (const tier of tuitionTiers) {
      r++;
      ws.getCell(r, 1).value = `${tier.label} (${tier.discountPercent}% discount)`;
      ws.getCell(r, 1).font = NORMAL_FONT;
      const totalStudents = tier.studentCounts.reduce((s, n) => s + n, 0);
      ws.getCell(r, 2).value = `${totalStudents} total students across years`;
      ws.getCell(r, 2).font = BOLD_FONT;
    }
  }

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "GROWTH & ESCALATION ASSUMPTIONS";

  r++;
  const salaryEscRow = r;
  ws.getCell(r, 1).value = "Annual Salary Escalation"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = salaryEscRate; ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r++;
  const costInflationRow = r;
  ws.getCell(r, 1).value = "General Cost Inflation"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r++;
  const prorationRow = r;
  ws.getCell(r, 1).value = "Year 1 Proration Factor"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = prorationFactor; ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = "0.00";
  r++;
  ws.getCell(r, 1).value = "Projection Period"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = `${yearCount} Years`; ws.getCell(r, 2).font = BOLD_FONT;

  const riskFlags: string[] = [];
  if (sp.locationSecured === false) {
    riskFlags.push("No facility location secured — costs are estimated");
  }
  if (sp.locationSecured && sp.ownershipType === "rent" && sp.leaseExpirationYear) {
    const openingYear = sp.openingYear || new Date().getFullYear();
    const yearsUntilExpiry = sp.leaseExpirationYear - openingYear;
    if (yearsUntilExpiry >= 0 && yearsUntilExpiry < yearCount) {
      riskFlags.push(`Lease expires in Year ${yearsUntilExpiry + 1} (${sp.leaseExpirationYear}) — renewal bump of ${sp.postLeaseRenewalBump || 15}% modeled`);
    }
    if (yearsUntilExpiry < 2 && yearsUntilExpiry >= 0) {
      riskFlags.push("Short remaining lease term — less than 2 years until expiration");
    }
  }
  if (sp.locationSecured && sp.ownershipType === "rent" && sp.isNNNLease) {
    const nnnTotal = (sp.nnnCamCharges || 0) + (sp.nnnMaintenance || 0) + (sp.nnnUtilities || 0);
    if (nnnTotal > 0) {
      riskFlags.push(`NNN lease: $${(nnnTotal * 12).toLocaleString()}/year in additional charges (CAM, maintenance, utilities)`);
    }
  }
  if (sp.locationSecured && sp.ownershipType === "own" && sp.entityType && sp.entityType !== "nonprofit_501c3" && (sp.propertyTaxAnnual || 0) > 0) {
    riskFlags.push(`For-profit property tax: $${(sp.propertyTaxAnnual || 0).toLocaleString()}/year`);
  }

  if (riskFlags.length > 0) {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "FACILITY RISK FLAGS";
    for (const flag of riskFlags) {
      r++;
      ws.getCell(r, 1).value = `⚠ ${flag}`;
      ws.getCell(r, 1).font = { ...NORMAL_FONT, color: { argb: "FFD97706" } };
      ws.mergeCells(r, 1, r, 2);
      ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
    }
  }

  return { enrollmentRows, salaryEscRow, costInflationRow, prorationRow };
}

function buildConsultantNotesTab(ws: ExcelJS.Worksheet, consultant: ConsultantSummary) {
  ws.columns = [{ width: 25 }, { width: 80 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget — Consultant Notes";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "EXECUTIVE SUMMARY";

  r++;
  ws.getCell(r, 1).value = consultant.executiveSummary || "";
  ws.getCell(r, 1).font = NORMAL_FONT;
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 40;
  ws.getRow(r).alignment = { wrapText: true, vertical: "top" };

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "LENDER READINESS";

  r++;
  ws.getCell(r, 1).value = "Status"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.lenderReadiness || ""; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Assessment"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.lenderReadinessExplanation || ""; ws.getCell(r, 2).font = NORMAL_FONT;
  ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 30;

  r += 2;
  ws.getCell(r, 1).value = "Biggest Strength"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.biggestStrength || ""; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Biggest Risk"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.biggestRisk || ""; ws.getCell(r, 2).font = BOLD_FONT;

  if (consultant.recommendations && consultant.recommendations.length > 0) {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "RECOMMENDATIONS";

    for (const rec of consultant.recommendations) {
      r++;
      ws.getCell(r, 1).value = `[${rec.priority.toUpperCase()}] ${rec.title}`;
      ws.getCell(r, 1).font = BOLD_FONT;
      r++;
      ws.getCell(r, 1).value = rec.description;
      ws.getCell(r, 1).font = NORMAL_FONT;
      ws.mergeCells(r, 1, r, 2);
      ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
    }
  }
}

function buildPriorYearTab(ws: ExcelJS.Worksheet, snapshot: PriorYearSnapshot, entityType?: string) {
  ws.columns = [{ width: 35 }, { width: 25 }];

  let r = 1;
  ws.getCell(r, 1).value = "Prior-Year Snapshot";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "PRIOR YEAR ACTUALS";

  const items: [string, number | undefined, string][] = [
    ["Ending Enrollment", snapshot.endingEnrollment, NUMBER_FORMAT],
    ["Total Revenue", snapshot.totalRevenue, CURRENCY_FORMAT],
    ["Total Expenses", snapshot.totalExpenses, CURRENCY_FORMAT],
    ["Ending Cash Balance", snapshot.endingCash, CURRENCY_FORMAT],
  ];

  for (const [label, value, fmt] of items) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value ?? 0; ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = fmt;
  }

  if (snapshot.totalRevenue && snapshot.totalExpenses) {
    r++;
    ws.getCell(r, 1).value = `${profitLabel(entityType)} (Prior Year)`; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = snapshot.totalRevenue - snapshot.totalExpenses;
    ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  }
  if (snapshot.endingCash !== undefined && snapshot.totalExpenses && snapshot.totalExpenses > 0) {
    r++;
    ws.getCell(r, 1).value = "Cash Reserve (Months)"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = Math.round(snapshot.endingCash / (snapshot.totalExpenses / 12) * 10) / 10;
    ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = "0.0";
  }
}

function computeTuitionWithTiersExport(
  grossPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers?: TuitionTier[],
): number {
  if (!tuitionTiers || tuitionTiers.length === 0) {
    return grossPerStudent * totalStudents;
  }
  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }
  if (rawTierTotal === 0) {
    return grossPerStudent * totalStudents;
  }
  const scaleFactor = rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;
  let total = 0;
  let allocated = 0;
  for (const tier of tuitionTiers) {
    const scaled = (tier.studentCounts?.[yearIdx] ?? 0) * scaleFactor;
    allocated += scaled;
    total += scaled * grossPerStudent * (1 - (tier.discountPercent || 0) / 100);
  }
  const remaining = totalStudents - allocated;
  if (remaining > 0) {
    total += remaining * grossPerStudent;
  }
  return total;
}

function buildRevenueScheduleTab(
  ws: ExcelJS.Worksheet,
  rows: RevenueRow[],
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
  tuitionTiers?: TuitionTier[],
  precomputed?: PrecomputedFinancials,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  ws.getCell(r, 1).value = "Students";
  ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (aRefs) {
      cell.value = { formula: `Assumptions!B${aRefs.enrollmentRows[y]}`, result: enrollment[y] };
    } else {
      cell.value = enrollment[y];
    }
    cell.numFmt = NUMBER_FORMAT;
    styleDataCell(cell);
  }

  const rowExcelRows = new Map<string, number>();

  const categories = [
    "tuition_and_fees", "tuition_offsets", "public_funding",
    "school_choice", "grants_contributions", "other_revenue",
  ];
  const categoryTotalRows: number[] = [];

  const nonPobRows = rows.filter(row => row.enabled && row.driverType !== "percent_of_base");
  const pobRows = rows.filter(row => row.enabled && row.driverType === "percent_of_base");
  const orderedRows = [...nonPobRows, ...pobRows];

  for (const cat of categories) {
    const catRows = orderedRows.filter(row => row.category === cat);
    if (catRows.length === 0) continue;

    r++;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = REVENUE_CATEGORY_LABELS[cat] || cat;

    const firstDataRow = r + 1;

    for (const row of catRows) {
      r++;
      rowExcelRows.set(row.id, r);
      ws.getCell(r, 1).value = row.lineItem;
      ws.getCell(r, 1).font = NORMAL_FONT;

      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = aRefs ? `Assumptions!B${aRefs.enrollmentRows[y]}` : `$B$2`;
        const cachedVal = precomputed?.revenueByRow.get(row.id)?.[y] ?? 0;

        if (row.driverType === "percent_of_base") {
          const baseExcelRow = rowExcelRows.get(row.percentBase || "");
          if (baseExcelRow) {
            const sign = cat === "tuition_offsets" ? "-" : "";
            cell.value = { formula: `${sign}${c(baseExcelRow, y + 2)}*${amt / 100}`, result: cachedVal };
          } else {
            cell.value = cachedVal;
          }
        } else if (row.driverType === "per_student") {
          const sign = cat === "tuition_offsets" ? "-" : "";
          if (row.id === "gross_tuition" && tuitionTiers && tuitionTiers.length > 0) {
            const tierValue = computeTuitionWithTiersExport(amt, y, enrollment[y] || 0, tuitionTiers);
            cell.value = cat === "tuition_offsets" ? -Math.abs(tierValue) : tierValue;
          } else {
            cell.value = { formula: `${sign}${amt}*${studentsCell}`, result: cachedVal };
          }
        } else if (row.driverType === "monthly") {
          const sign = cat === "tuition_offsets" ? "-" : "";
          cell.value = { formula: `${sign}${amt}*12`, result: cachedVal };
        } else {
          cell.value = cat === "tuition_offsets" ? -Math.abs(amt) : amt;
        }
        cell.numFmt = CURRENCY_FORMAT;
        styleDataCell(cell);
      }
    }

    r++;
    ws.getCell(r, 1).value = `Total ${(REVENUE_CATEGORY_LABELS[cat] || cat).split("(")[0].trim()}`;
    ws.getCell(r, 1).font = BOLD_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const catTotal = precomputed?.revenueCategoryTotals.get(cat)?.[y] ?? 0;
      cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: Math.round(catTotal) };
      cell.numFmt = CURRENCY_FORMAT;
      styleBoldDataCell(cell);
    }
    styleSectionRow(ws, r, cols);
    categoryTotalRows.push(r);
  }

  r += 2;
  ws.getCell(r, 1).value = "TOTAL NET REVENUE";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    const sumParts = categoryTotalRows.map(tr => c(tr, y + 2)).join("+");
    cell.value = { formula: sumParts || "0", result: precomputed?.totalRevenue[y] ?? 0 };
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildStaffingTab(
  ws: ExcelJS.Worksheet,
  rows: StaffingRow[],
  salaryEscRate: number,
  prorationFactor: number,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
): number {
  ws.columns = [
    { width: 30 }, { width: 18 }, { width: 14 }, { width: 10 },
    { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 },
  ];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget — Staffing & Personnel";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 8);
  ws.getRow(r).height = 32;

  r = 3;
  const rosterHeaders = ["Role", "Function", "Type", "FTE", "Annual Rate", "Benefits %", "Payroll Tax %", "Total Annual Cost"];
  ws.getRow(r).values = rosterHeaders;
  styleHeaderRow(ws, r, 8);

  const funcOrder = ["school_leadership", "instructional", "student_support", "operations", "administrative", "other"];
  const sorted = [...rows].sort((a, b) => {
    const ai = funcOrder.indexOf(a.functionCategory);
    const bi = funcOrder.indexOf(b.functionCategory);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let totalSalaries = 0, totalBenefits = 0, totalPayrollTax = 0, totalContracted = 0;
  let totalFTE = 0;

  for (const row of sorted) {
    r++;
    const annualCost = row.fte * row.annualizedRate;
    const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
    let benefitsAmt = 0, taxAmt = 0;

    if (isContractNotPayrollLike) {
      totalContracted += annualCost;
    } else {
      totalSalaries += annualCost;
      if (row.benefitsEligible) {
        benefitsAmt = annualCost * (row.benefitsRate / 100);
        totalBenefits += benefitsAmt;
      }
      taxAmt = annualCost * (row.payrollTaxRate / 100);
      totalPayrollTax += taxAmt;
    }
    totalFTE += row.fte;

    const totalCost = annualCost + benefitsAmt + taxAmt;

    ws.getCell(r, 1).value = row.roleName; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = funcCategoryLabel(row.functionCategory); ws.getCell(r, 2).font = NORMAL_FONT;
    ws.getCell(r, 3).value = empTypeLabel(row.employmentType); ws.getCell(r, 3).font = NORMAL_FONT;
    ws.getCell(r, 4).value = row.fte; ws.getCell(r, 4).font = NORMAL_FONT; ws.getCell(r, 4).numFmt = "0.00";
    ws.getCell(r, 5).value = row.annualizedRate; ws.getCell(r, 5).font = NORMAL_FONT; ws.getCell(r, 5).numFmt = CURRENCY_FORMAT;
    ws.getCell(r, 6).value = row.benefitsEligible ? row.benefitsRate / 100 : 0; ws.getCell(r, 6).font = NORMAL_FONT; ws.getCell(r, 6).numFmt = PERCENT_FORMAT;
    ws.getCell(r, 7).value = row.payrollTaxRate / 100; ws.getCell(r, 7).font = NORMAL_FONT; ws.getCell(r, 7).numFmt = PERCENT_FORMAT;
    ws.getCell(r, 8).value = totalCost; ws.getCell(r, 8).font = BOLD_FONT; ws.getCell(r, 8).numFmt = CURRENCY_FORMAT;
  }

  const grandTotal = totalSalaries + totalBenefits + totalPayrollTax + totalContracted;

  r += 2;
  styleSectionRow(ws, r, 8);
  ws.getCell(r, 1).value = "PERSONNEL COST SUMMARY";

  r++;
  ws.getCell(r, 1).value = "Total Headcount"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rows.length; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Total FTE"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalFTE * 10) / 10; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Salaries & Wages"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalSalaries); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Benefits"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalBenefits); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Payroll Taxes"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalPayrollTax); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Contracted Personnel"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalContracted); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Total Annual Personnel Cost"; ws.getCell(r, 1).font = BOLD_FONT;
  ws.getCell(r, 2).value = Math.round(grandTotal); ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "PERSONNEL COST PROJECTION";

  ws.columns = [{ width: 30 }, ...Array(yearCount).fill({ width: 18 })];
  r++;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);

  const projItems: [string, boolean][] = [
    ["Base Personnel Cost", false],
    ["Salary Escalation Factor", false],
    ["Proration Factor", false],
    ["Total Personnel Cost", true],
  ];

  const projStartRow = r + 1;

  for (const [label, bold] of projItems) {
    r++;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const pf = y === 0 ? prorationFactor : 1;
      const esc = Math.pow(1 + salaryEscRate, y);
      const salaryEscRef = aRefs ? `Assumptions!B${aRefs.salaryEscRow}` : null;
      const prorationRef = aRefs ? `Assumptions!B${aRefs.prorationRow}` : null;

      switch (label) {
        case "Base Personnel Cost":
          cell.value = Math.round(grandTotal);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        case "Salary Escalation Factor":
          if (salaryEscRef) {
            cell.value = { formula: `(1+${salaryEscRef})^${y}`, result: esc };
          } else {
            cell.value = esc;
          }
          cell.numFmt = "0.0000";
          break;
        case "Proration Factor":
          if (prorationRef && y === 0) {
            cell.value = { formula: prorationRef, result: pf };
          } else {
            cell.value = pf;
          }
          cell.numFmt = "0.000";
          break;
        case "Total Personnel Cost": {
          const baseRef = c(projStartRow, y + 2);
          const escRef = c(projStartRow + 1, y + 2);
          const pfRef = c(projStartRow + 2, y + 2);
          const totalVal = Math.round(grandTotal * esc * pf);
          cell.value = { formula: `${baseRef}*${escRef}*${pfRef}`, result: totalVal };
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
      }
      if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  const totalRow = r;
  styleSectionRow(ws, totalRow, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return totalRow;
}

function buildExpensesTab(
  ws: ExcelJS.Worksheet,
  expenseRows: ExpenseRow[],
  enrollment: number[],
  revTotalRow: number,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
  precomputed?: PrecomputedFinancials,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  ws.getCell(r, 1).value = "Students";
  ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (aRefs) {
      cell.value = { formula: `Assumptions!B${aRefs.enrollmentRows[y]}`, result: enrollment[y] };
    } else {
      cell.value = enrollment[y];
    }
    cell.numFmt = NUMBER_FORMAT;
    styleDataCell(cell);
  }

  const categories = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const categoryTotalRows: number[] = [];

  for (const cat of categories) {
    const catRows = expenseRows.filter(row => row.category === cat && row.enabled);
    if (catRows.length === 0) continue;

    r++;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = EXPENSE_CATEGORY_LABELS[cat] || cat;

    const firstDataRow = r + 1;

    for (const row of catRows) {
      r++;
      ws.getCell(r, 1).value = row.lineItem;
      ws.getCell(r, 1).font = NORMAL_FONT;

      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = aRefs ? `Assumptions!B${aRefs.enrollmentRows[y]}` : `$B$2`;
        const revTotalRef = revTotalRow > 0 ? `'Revenue Schedule'!${String.fromCharCode(66 + y)}${revTotalRow}` : null;

        let cachedExpVal: number;
        if (row.driverType === "percent_of_revenue") {
          cachedExpVal = ((amt) / 100) * (precomputed?.totalRevenue[y] ?? 0);
        } else {
          cachedExpVal = computeDriverValue(row.amounts, y, row.driverType, enrollment[y] || 0);
        }

        if (row.driverType === "percent_of_revenue" && revTotalRef) {
          cell.value = { formula: `${amt / 100}*${revTotalRef}`, result: cachedExpVal };
        } else if (row.driverType === "per_student") {
          cell.value = { formula: `${amt}*${studentsCell}`, result: cachedExpVal };
        } else if (row.driverType === "monthly") {
          cell.value = { formula: `${amt}*12`, result: cachedExpVal };
        } else {
          cell.value = amt;
        }
        cell.numFmt = CURRENCY_FORMAT;
        styleDataCell(cell);
      }
    }

    r++;
    ws.getCell(r, 1).value = `Total ${(EXPENSE_CATEGORY_LABELS[cat] || cat).split("/")[0].trim()}`;
    ws.getCell(r, 1).font = BOLD_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      let catSubtotal = 0;
      for (const cr of catRows) {
        if (cr.driverType === "percent_of_revenue") {
          catSubtotal += ((cr.amounts?.[y] ?? 0) / 100) * (precomputed?.totalRevenue[y] ?? 0);
        } else {
          catSubtotal += computeDriverValue(cr.amounts, y, cr.driverType, enrollment[y] || 0);
        }
      }
      cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: Math.round(catSubtotal) };
      cell.numFmt = CURRENCY_FORMAT;
      styleBoldDataCell(cell);
    }
    styleSectionRow(ws, r, cols);
    categoryTotalRows.push(r);
  }

  r += 2;
  ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    const sumParts = categoryTotalRows.map(tr => c(tr, y + 2)).join("+");
    cell.value = { formula: sumParts || "0", result: precomputed?.totalExpenses[y] ?? 0 };
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildCapitalDebtTab(
  ws: ExcelJS.Worksheet,
  rows: CapitalDebtRow[],
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  _aRefs?: AssumptionRefs,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "CAPITAL EXPENDITURES & DEBT SERVICE";

  const enabledRows = rows.filter(row => row.enabled);
  const firstDataRow = r + 1;

  for (const row of enabledRows) {
    r++;
    ws.getCell(r, 1).value = row.lineItem;
    ws.getCell(r, 1).font = NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
        cell.value = computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
      } else {
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = _aRefs ? `Assumptions!B${_aRefs.enrollmentRows[y]}` : null;
        const cachedCapVal = computeDriverValue(row.amounts, y, row.driverType, enrollment[y] || 0);
        if (row.driverType === "per_student" && studentsCell) {
          cell.value = { formula: `${amt}*${studentsCell}`, result: cachedCapVal };
        } else if (row.driverType === "monthly") {
          cell.value = { formula: `${amt}*12`, result: cachedCapVal };
        } else {
          cell.value = amt;
        }
      }
      cell.numFmt = CURRENCY_FORMAT;
      styleDataCell(cell);
    }
  }

  if (enabledRows.length === 0) {
    r++;
    ws.getCell(r, 1).value = "(No capital or debt items)";
    ws.getCell(r, 1).font = NORMAL_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = 0;
      cell.numFmt = CURRENCY_FORMAT;
      styleDataCell(cell);
    }
  }

  r++;
  ws.getCell(r, 1).value = "TOTAL CAPITAL & DEBT";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (enabledRows.length > 0) {
      let capSum = 0;
      for (const erow of enabledRows) {
        if (erow.isLoan && erow.loanPrincipal && erow.loanPrincipal > 0) {
          capSum += computeAnnualDebtService(erow.loanPrincipal, (erow.loanRate || 0) / 100, erow.loanTermYears || 0);
        } else {
          capSum += computeDriverValue(erow.amounts, y, erow.driverType, enrollment[y] || 0);
        }
      }
      cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: Math.round(capSum) };
    } else {
      cell.value = 0;
    }
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildPnLTab(
  ws: ExcelJS.Worksheet,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  revTotalRow: number,
  staffTotalRow: number,
  expTotalRow: number,
  capTotalRow: number,
  entityType?: string,
  precomputed?: PrecomputedFinancials,
) {
  const niLabel = profitLabel(entityType);
  const cumNiLabel = cumulativeProfitLabel(entityType);

  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];
  const headers = [`${yearCount === 3 ? "3" : "5"}-Year Financial Model`, ...yearHeaders.slice(1)];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, cols);

  const ROW_TOTAL_REV = "Total Revenue";
  const ROW_PERSONNEL = "Personnel Costs";
  const ROW_OPEX = "Operating Expenses";
  const ROW_CAPDEBT = "Capital & Debt";
  const ROW_TOTAL_EXP = "Total Expenses";
  const ROW_RESERVE = "Operating Reserve (Months)";

  const pnlRows: Array<{ label: string; bold: boolean; section?: boolean; key: string }> = [
    { label: ROW_TOTAL_REV, bold: false, key: "totalrev" },
    { label: ROW_PERSONNEL, bold: false, key: "personnel" },
    { label: ROW_OPEX, bold: false, key: "opex" },
    { label: ROW_CAPDEBT, bold: false, key: "capdebt" },
    { label: ROW_TOTAL_EXP, bold: true, section: true, key: "totalexp" },
    { label: niLabel, bold: true, section: true, key: "ni" },
    { label: cumNiLabel, bold: false, key: "cumni" },
    { label: ROW_RESERVE, bold: false, key: "reserve" },
  ];

  for (let idx = 0; idx < pnlRows.length; idx++) {
    const item = pnlRows[idx];
    const r = idx + 2;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const colLetter = String.fromCharCode(66 + y);

      switch (item.key) {
        case "totalrev":
          cell.value = { formula: `'Revenue Schedule'!${colLetter}${revTotalRow}`, result: precomputed?.totalRevenue[y] ?? 0 };
          break;
        case "personnel":
          cell.value = { formula: `'Staffing & Personnel'!${colLetter}${staffTotalRow}`, result: precomputed?.totalPersonnel[y] ?? 0 };
          break;
        case "opex":
          cell.value = { formula: `'Operating Expenses'!${colLetter}${expTotalRow}`, result: precomputed?.totalExpenses[y] ?? 0 };
          break;
        case "capdebt":
          cell.value = { formula: `'Capital & Debt'!${colLetter}${capTotalRow}`, result: precomputed?.totalCapDebt[y] ?? 0 };
          break;
        case "totalexp":
          cell.value = { formula: `${c(3, y + 2)}+${c(4, y + 2)}+${c(5, y + 2)}`, result: precomputed?.totalAllExpenses[y] ?? 0 };
          break;
        case "ni":
          cell.value = { formula: `${c(2, y + 2)}-${c(6, y + 2)}`, result: precomputed?.netIncome[y] ?? 0 };
          break;
        case "cumni": {
          const cumVal = precomputed?.cumulativeNI[y] ?? 0;
          if (y === 0) {
            cell.value = { formula: `${c(7, y + 2)}`, result: cumVal };
          } else {
            cell.value = { formula: `${c(8, y + 1)}+${c(7, y + 2)}`, result: cumVal };
          }
          break;
        }
        case "reserve": {
          const totalExp = precomputed?.totalAllExpenses[y] ?? 0;
          const cumNI = precomputed?.cumulativeNI[y] ?? 0;
          const reserveVal = totalExp === 0 ? 0 : (cumNI > 0 ? cumNI / (totalExp / 12) : 0);
          cell.value = { formula: `IF(${c(6, y + 2)}=0,0,IF(${c(8, y + 2)}>0,${c(8, y + 2)}/(${c(6, y + 2)}/12),0))`, result: reserveVal };
          break;
        }
      }

      if (item.label === "Operating Reserve (Months)") {
        cell.numFmt = "0.0";
      } else {
        cell.numFmt = CURRENCY_FORMAT;
      }

      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }

    if (item.section) styleSectionRow(ws, r, cols);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

interface SummaryLayout {
  fmRevenueRow: number;
  fmStaffRow: number;
  fmExpenseRow: number;
  fmCapDebtRow: number;
  fmTotalExpRow: number;
  fmNIRow: number;
  fmCumNIRow: number;
  fmReserveRow: number;
  studentsRef: (colLetter: string) => string;
  revenueMix?: { tuitionPct: number[]; publicPct: number[]; philanthropyPct: number[] };
}

function buildSummaryTabNew(ws: ExcelJS.Worksheet, sp: SchoolProfile, yearCount: number, cols: number, yearHeaders: string[], layout: SummaryLayout, consultant?: ConsultantSummary) {
  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];

  let r = 1;
  ws.getCell(r, 1).value = "Financial Model Summary";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols);
  ws.getRow(r).height = 36;

  r = 2;
  ws.getCell(r, 1).value = "Prepared by SchoolStack Budget";
  ws.getCell(r, 1).font = { italic: true, size: 10, color: { argb: "FF888888" }, name: "Calibri" };

  r = 4;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const infoItems: [string, string][] = [
    ["School Name", sp.schoolName || ""],
    ["School Type", schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityTypeDisplay(sp.entityType)],
    ...(sp.ein ? [["EIN", sp.ein] as [string, string]] : []),
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    ["State", sp.state || ""],
    ["Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July"],
    ["Max Student Capacity", String(sp.maxCapacity || "N/A")],
  ];
  for (const [label, value] of infoItems) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value; ws.getCell(r, 2).font = BOLD_FONT;
  }

  const fmTab = "'Financial Model'";

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "ENROLLMENT TREND";

  r++;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);

  r++;
  ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const studRef = layout.studentsRef(cl);
    cell.value = { formula: studRef };
    cell.numFmt = NUMBER_FORMAT; styleDataCell(cell);
  }
  const enrollRow = r;

  r++;
  ws.getCell(r, 1).value = "Enrollment Growth %"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === 0) {
      cell.value = "—"; cell.font = NORMAL_FONT;
    } else {
      cell.value = { formula: `IF(${c(enrollRow, y + 1)}=0,0,(${c(enrollRow, y + 2)}-${c(enrollRow, y + 1)})/${c(enrollRow, y + 1)})` };
      cell.numFmt = PERCENT_FORMAT;
    }
    styleDataCell(cell);
  }

  r += 2;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);
  const financialHeaderRow = r;

  r++;
  ws.getCell(r, 1).value = "Total Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  const revSumRow = r;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmRevenueRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel Costs"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmStaffRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmExpenseRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Total Expenses"; ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmTotalExpRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  r++;
  ws.getCell(r, 1).value = profitLabel(sp.entityType); ws.getCell(r, 1).font = BOLD_FONT;
  const niSumRow = r;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmNIRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  r++;
  ws.getCell(r, 1).value = cumulativeProfitLabel(sp.entityType); ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmCumNIRow}` };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Reserve (Months)"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmReserveRow}` };
    cell.numFmt = "0.0"; styleDataCell(cell);
  }

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "KEY RATIOS";

  r++;
  ws.getCell(r, 1).value = "Revenue per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const studRef = layout.studentsRef(cl);
    cell.value = { formula: `IF(${studRef}=0,0,${c(revSumRow, y + 2)}/${studRef})` };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel Cost as % of Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${fmTab}!${cl}${layout.fmStaffRow}/${c(revSumRow, y + 2)})` };
    cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Cost as % of Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${fmTab}!${cl}${layout.fmExpenseRow}/${c(revSumRow, y + 2)})` };
    cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = profitMarginLabel(sp.entityType); ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${c(niSumRow, y + 2)}/${c(revSumRow, y + 2)})` };
    cell.numFmt = PERCENT_FORMAT; styleBoldDataCell(cell);
  }

  if (layout.revenueMix) {
    r += 2;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = "REVENUE MIX TREND";

    const mixMetrics = [
      { label: "Tuition & Fees %", data: layout.revenueMix.tuitionPct },
      { label: "Public Funding %", data: layout.revenueMix.publicPct },
      { label: "Philanthropy %", data: layout.revenueMix.philanthropyPct },
    ];

    for (const metric of mixMetrics) {
      r++;
      ws.getCell(r, 1).value = metric.label; ws.getCell(r, 1).font = NORMAL_FONT;
      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = metric.data[y] ?? 0;
        cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
      }
    }
  }

  if (consultant) {
    r += 2;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = "LENDER READINESS ASSESSMENT";

    r++;
    ws.getCell(r, 1).value = "Readiness Status"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.lenderReadiness || "";
    ws.getCell(r, 2).font = {
      bold: true,
      size: 11,
      name: "Calibri",
      color: { argb: consultant.lenderReadiness === "Strong" ? "FF16A34A" : consultant.lenderReadiness === "Needs Work" ? "FFD97706" : "FFDC2626" },
    };

    r++;
    ws.getCell(r, 1).value = "Assessment"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.lenderReadinessExplanation || ""; ws.getCell(r, 2).font = NORMAL_FONT;
    ws.mergeCells(r, 2, r, cols);
    ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 30;

    r++;
    ws.getCell(r, 1).value = "Biggest Strength"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.biggestStrength || ""; ws.getCell(r, 2).font = BOLD_FONT;
    ws.mergeCells(r, 2, r, cols);

    r++;
    ws.getCell(r, 1).value = "Biggest Risk"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.biggestRisk || ""; ws.getCell(r, 2).font = BOLD_FONT;
    ws.mergeCells(r, 2, r, cols);
  }

  ws.views = [{ state: "frozen", ySplit: financialHeaderRow, xSplit: 1 }];
}

function buildLegacyPnLTab(
  ws: ExcelJS.Worksheet,
  data: ModelData,
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  prorationFactor: number,
) {
  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];
  const headers = [`${yearCount}-Year Financial Model`, ...yearHeaders.slice(1)];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, cols);

  const rev = (data.revenue || {}) as Record<string, number>;
  const st = (data.staffing || {}) as Record<string, number>;
  const fac = (data.facilities || {}) as Record<string, number>;

  const tuitionIncrease = (rev.annualTuitionIncrease || 0) / 100;
  const salaryIncrease = (fac.annualSalaryIncrease || 0) / 100;
  const costInflation = (fac.generalCostInflation || 0) / 100;

  const entityType = (data.schoolProfile as SchoolProfile | undefined)?.entityType;
  const niLbl = profitLabel(entityType);
  const cumNiLbl = cumulativeProfitLabel(entityType);

  const rows = [
    "Students", "Net Revenue", "Staffing Costs", "Operating Expenses",
    "Total Expenses", niLbl, cumNiLbl, "Operating Reserve (Months)",
  ];

  let cumNI = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const r = idx + 2;
    const label = rows[idx];
    const bold = label === "Total Expenses" || label === niLbl;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const students = enrollment[y];
      const pf = y === 0 ? prorationFactor : 1;
      const salEsc = Math.pow(1 + salaryIncrease, y);
      const infEsc = Math.pow(1 + costInflation, y);

      let val = 0;
      switch (idx) {
        case 0:
          val = students;
          cell.numFmt = NUMBER_FORMAT;
          break;
        case 1: {
          const tuition = students * (rev.tuitionPerStudent || 0) * Math.pow(1 + tuitionIncrease, y) * pf;
          const otherFees = students * (rev.otherRevenuePerStudent || 0) * Math.pow(1 + tuitionIncrease, y) * pf;
          const discount = tuition * ((rev.scholarshipRate || 0) / 100);
          const esa = students * (rev.esaRevenuePerStudent || 0) * infEsc * pf;
          const pubFund = students * (rev.publicFundingPerStudent || 0) * infEsc * pf;
          const donations = ((rev.annualDonations || 0)) * infEsc * pf;
          const grants = (rev.foundationGrants || 0) * infEsc * pf;
          const capGifts = y === 0 ? (rev.capitalGifts || 0) : 0;
          val = tuition + otherFees - discount + esa + pubFund + donations + grants + capGifts;
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 2: {
          const spt = st.studentsPerTeacher || 1;
          const tc = spt > 0 ? Math.ceil(students / spt) : 0;
          const tp = tc * (st.teacherSalary || 0) * salEsc * pf;
          const ap = (st.adminStaffCount || 0) * (st.adminSalary || 0) * salEsc * pf;
          const fs = (st.founderSalary || 0) * salEsc * pf;
          const totalSal = tp + ap + fs;
          val = totalSal + totalSal * ((st.benefitsRate || 0) / 100);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 3: {
          const rentInc = (fac.annualRentIncrease || 0) / 100;
          const rent = (fac.monthlyRent || 0) * 12 * Math.pow(1 + rentInc, y) * pf;
          const utils = (fac.annualUtilities || 0) * infEsc * pf;
          const ins = (fac.annualInsurance || 0) * infEsc * pf;
          const maint = (fac.facilityMaintenance || 0) * infEsc * pf;
          const curr = (fac.curriculumCostPerStudent || 0) * students * infEsc * pf;
          const tech = (fac.techCostPerStudent || 0) * students * infEsc * pf;
          const food = (fac.foodServicePerStudent || 0) * students * infEsc * pf;
          const trans = (fac.transportationAnnual || 0) * infEsc * pf;
          const stSvc = (fac.studentServicesAnnual || 0) * infEsc * pf;
          const mktg = (fac.annualMarketing || 0) * infEsc * pf;
          const pd = (fac.professionalDevelopment || 0) * infEsc * pf;
          const other = (fac.otherAnnualExpenses || 0) * infEsc * pf;
          const ds = computeAnnualDebtService(fac.loanAmount || 0, (fac.annualInterestRate || 0) / 100, fac.loanTermYears || 0) * pf;
          val = rent + utils + ins + maint + curr + tech + food + trans + stSvc + mktg + pd + other + ds;
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 4: {
          cell.value = { formula: `${c(4, y + 2)}+${c(5, y + 2)}` };
          cell.numFmt = CURRENCY_FORMAT;
          if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
          continue;
        }
        case 5: {
          cell.value = { formula: `${c(3, y + 2)}-${c(6, y + 2)}` };
          cell.numFmt = CURRENCY_FORMAT;
          if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
          continue;
        }
        case 6: {
          if (y === 0) {
            cell.value = { formula: `${c(7, y + 2)}` };
          } else {
            cell.value = { formula: `${c(8, y + 1)}+${c(7, y + 2)}` };
          }
          cell.numFmt = CURRENCY_FORMAT;
          styleDataCell(cell);
          continue;
        }
        case 7: {
          cell.value = { formula: `IF(${c(6, y + 2)}=0,0,IF(${c(8, y + 2)}>0,${c(8, y + 2)}/(${c(6, y + 2)}/12),0))` };
          cell.numFmt = "0.0";
          styleDataCell(cell);
          continue;
        }
      }

      cell.value = val;
      if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 6, cols);
  styleSectionRow(ws, 7, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}
