import {
  createDoc, drawHeader, sectionTitle, bodyText, labelValue,
  drawTable, drawFooter, docToBuffer, fmtCurrency, fmtPct, fmtNumber,
  profitLabel, profitMarginLabel, entityTypeDisplay, schoolTypeDisplay,
  ensureSpace, type PDFDoc, type TableColumn,
} from "./pdf-utils.js";
import {
  computeAnnualDebt,
  defaultCollectionRateForMethod,
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";
import { computeMonthlyCashInflow } from "./workbook-helpers.js";

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
  accountingBasis?: string;
  hasManagementFee?: boolean;
  managementFeePercent?: number;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
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
  billingMonths?: number;
  collectionRate?: number;
  collectionMethod?: string;
  collectionDelayDays?: number;
  paymentFrequency?: string;
  paymentTiming?: string;
  disbursementType?: string;
  reimbursementLagMonths?: number;
  receiptQuarter?: number;
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
  tuitionRevenue?: number;
  publicFundingRevenue?: number;
  philanthropyRevenue?: number;
  otherRevenue?: number;
  personnelExpenses?: number;
  facilityExpenses?: number;
  instructionalExpenses?: number;
  adminExpenses?: number;
}

interface OpeningBalances {
  cash?: number;
  accountsReceivable?: number;
  fixedAssets?: number;
  otherAssets?: number;
  accountsPayable?: number;
  currentDebtPortion?: number;
  longTermDebt?: number;
}

interface FacilityPhase {
  squareFootage?: number;
  hasRenewalOption?: boolean;
  facilityArrangementEndDate?: string;
  [key: string]: unknown;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  revenueRows?: RevenueRow[];
  staffingRows?: StaffingRow[];
  expenseRows?: ExpenseRow[];
  customCategoryLabels?: Record<string, string>;
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
  openingBalances?: OpeningBalances;
  facilityPhases?: FacilityPhase[];
  facilities?: Record<string, unknown>;
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  grants_contributions: "Philanthropy",
  philanthropy: "Philanthropy",
  other_revenue: "Other Revenue",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  instructional_program: "Instructional / Program",
  technology: "Technology",
  occupancy_facility: "Occupancy / Facility",
  administrative_general: "Administrative / General",
};

const FUNC_CATEGORY_LABELS: Record<string, string> = {
  instructional: "Instructional",
  school_leadership: "School Leadership",
  student_support: "Student Support",
  operations: "Operations",
  administrative: "Administrative",
  other: "Other",
};

function localNewStudentsPDF(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

function localReturningStudentsPDF(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number, newStudents?: number, returningStudents?: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "per_new_student": return base * (newStudents ?? students);
    case "per_returning_student": return base * (returningStudents ?? 0);
    case "annual_fixed": return base;
    default: return base;
  }
}

function computeTuitionWithTiers(gross: number, yearIdx: number, total: number, tiers?: TuitionTier[]): number {
  if (!tiers || tiers.length === 0) return gross * total;
  let rawTierTotal = 0;
  for (const t of tiers) rawTierTotal += t.studentCounts?.[yearIdx] ?? 0;
  if (rawTierTotal === 0) return gross * total;
  const sf = rawTierTotal > total ? total / rawTierTotal : 1;
  let result = 0, allocated = 0;
  for (const t of tiers) {
    const sc = (t.studentCounts?.[yearIdx] ?? 0) * sf;
    allocated += sc;
    result += sc * gross * (1 - (t.discountPercent || 0) / 100);
  }
  const rem = total - allocated;
  if (rem > 0) result += rem * gross;
  return result;
}

function computeGradeBandRevenuePDF(sp: SchoolProfile, y: number): number {
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  if (!gbe || !gbp) return 0;
  const k5e = gbe.k5?.[y] ?? 0;
  const m68e = gbe.m68?.[y] ?? 0;
  const h912e = gbe.h912?.[y] ?? 0;
  if (k5e + m68e + h912e === 0) return 0;
  let total = k5e * (gbp.k5 || 0) + m68e * (gbp.m68 || 0) + h912e * (gbp.h912 || 0);
  if (sp.enrollmentRevenueMethod === "ada") {
    const adm = sp.priorYearADM || 0;
    const ada = sp.priorYearADA || 0;
    total *= adm > 0 ? Math.min(ada / adm, 1) : 0.95;
  }
  return total;
}

function hasGradeBandPDF(sp?: SchoolProfile): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  return hasEnrollment && ((gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0);
}

function computeRevenueForYear(rows: RevenueRow[], yearIdx: number, students: number, tiers?: TuitionTier[], sp?: SchoolProfile): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "state_local_perpupil" && sp && hasGradeBandPDF(sp)) {
      vals.set(r.id, computeGradeBandRevenuePDF(sp, yearIdx));
    } else if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers?.length) {
      vals.set(r.id, computeTuitionWithTiers(r.amounts?.[yearIdx] ?? 0, yearIdx, students, tiers));
    } else {
      vals.set(r.id, computeDriverValue(r.amounts, yearIdx, r.driverType, students));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const base = vals.get(r.percentBase || "") || 0;
    vals.set(r.id, base * ((r.amounts?.[yearIdx] ?? 0) / 100));
  }
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    const v = vals.get(r.id) || 0;
    total += r.category === "tuition_offsets" ? -v : v;
  }
  return total;
}

function computeRevenueByCat(rows: RevenueRow[], yearIdx: number, students: number, tiers?: TuitionTier[], sp?: SchoolProfile): Map<string, number> {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "state_local_perpupil" && sp && hasGradeBandPDF(sp)) {
      vals.set(r.id, computeGradeBandRevenuePDF(sp, yearIdx));
    } else if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers?.length) {
      vals.set(r.id, computeTuitionWithTiers(r.amounts?.[yearIdx] ?? 0, yearIdx, students, tiers));
    } else {
      vals.set(r.id, computeDriverValue(r.amounts, yearIdx, r.driverType, students));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const base = vals.get(r.percentBase || "") || 0;
    vals.set(r.id, base * ((r.amounts?.[yearIdx] ?? 0) / 100));
  }
  const cats = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled) continue;
    const v = vals.get(r.id) || 0;
    const cat = r.category;
    const sign = cat === "tuition_offsets" ? -1 : 1;
    cats.set(cat, (cats.get(cat) || 0) + v * sign);
  }
  return cats;
}

function computeStaffingCost(rows: StaffingRow[], salaryEsc: number, pf: number): number {
  let total = 0;
  for (const r of rows) {
    const base = r.fte * r.annualizedRate;
    const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
    if (isContractNoPL) {
      total += base;
    } else {
      total += base;
      if (r.benefitsEligible) total += base * (r.benefitsRate / 100);
      total += base * (r.payrollTaxRate / 100);
    }
  }
  return total * salaryEsc * pf;
}

function computeExpensesCost(rows: ExpenseRow[], yearIdx: number, students: number, totalRev: number, newStudents?: number, returningStudents?: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_revenue") {
      total += ((r.amounts?.[yearIdx] ?? 0) / 100) * totalRev;
    } else {
      total += computeDriverValue(r.amounts, yearIdx, r.driverType, students, newStudents, returningStudents);
    }
  }
  return total;
}

function computeCapDebt(rows: CapitalDebtRow[], yearIdx: number, students: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.isLoan && r.loanPrincipal && r.loanPrincipal > 0) {
      total += computeAnnualDebt(r.loanPrincipal, (r.loanRate || 0) / 100, r.loanTermYears || 0);
    } else {
      total += computeDriverValue(r.amounts, yearIdx, r.driverType, students);
    }
  }
  return total;
}

export async function generateProFormaPDF(rawData: Record<string, unknown>): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const doc = createDoc();

  const schoolName = sp.schoolName || "School";
  const abMap2: Record<string, string> = { cash: "cash", accrual: "accrual", not_sure: "undetermined" };
  const currentBasis = sp.accountingBasis ? (abMap2[sp.accountingBasis] || sp.accountingBasis) : "undetermined";
  const basisSubtitle = `Multi-Year Financial Projections — Accrual basis (school currently on ${currentBasis} basis)`;
  drawHeader(doc, `${schoolName} - Pro Forma Financial Model`, basisSubtitle);

  sectionTitle(doc, "School Profile");
  labelValue(doc, "School Name", schoolName);
  if (sp.schoolType) labelValue(doc, "School Type", schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther));
  if (sp.entityType) labelValue(doc, "Entity Type", entityTypeDisplay(sp.entityType));
  if (sp.ein) labelValue(doc, "EIN", sp.ein);
  if (sp.state) labelValue(doc, "State", sp.state);
  if (sp.openingYear) labelValue(doc, "Opening Year", String(sp.openingYear));
  if (sp.maxCapacity) labelValue(doc, "Max Capacity", fmtNumber(sp.maxCapacity));
  if (sp.fiscalYearStartMonth) labelValue(doc, "Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth] || "");
  if (sp.isAccredited) labelValue(doc, "Accreditation", sp.accreditingBody || "Yes");
  if (sp.isPartialFirstYear) labelValue(doc, "Year 1 Operating Months", String(sp.year1OperatingMonths || 10));
  if (sp.accountingBasis) {
    const abMap: Record<string, string> = { cash: "Cash Basis", accrual: "Accrual Basis", not_sure: "Not Yet Determined" };
    labelValue(doc, "Accounting Basis", abMap[sp.accountingBasis] || sp.accountingBasis);
  }

  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const yearCount = revenueRows[0]?.amounts?.length || expenseRows[0]?.amounts?.length || 3;
  const enrollment = [
    en.year1 || 0, en.year2 || 0, en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];

  const salaryEscRate = ((rawData.facilities as Record<string, unknown>)?.annualSalaryIncrease as number || 0) / 100;
  const pdfRR = en.retentionRate ?? 85;
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonths / 12;

  const yearHeaders = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`);

  sectionTitle(doc, "Enrollment Projections");
  const enrollCols: TableColumn[] = [{ header: "", width: 150 }, ...yearHeaders.map(h => ({ header: h, width: 80, align: "right" as const }))];
  drawTable(doc, enrollCols, [
    ["Students", ...enrollment.map(e => fmtNumber(e))],
    ["Max Capacity", ...enrollment.map(() => fmtNumber(sp.maxCapacity))],
    ["Utilization", ...enrollment.map(e => fmtPct(sp.maxCapacity ? e / sp.maxCapacity : 0))],
  ], { zebra: true });

  if (revenueRows.length > 0) {
    // Surface the cash-collection lever for tuition rows so lender / board
    // PDF readers see method + rate next to the revenue schedule
    // (Task #456). Only tuition rows carry this assumption; we read the
    // shared default from `defaultCollectionRateForMethod` so this stays in
    // lock-step with the engine and wizard.
    const tuitionCollectionRows = revenueRows.filter(
      (r) => r.enabled && (r.category === "tuition_and_fees" || r.category === "tuition_offsets"),
    );
    if (tuitionCollectionRows.length > 0) {
      for (const r of tuitionCollectionRows) {
        const method = (r.collectionMethod ?? "autopay") as "autopay" | "invoiced" | "mixed";
        const methodLabel = method === "autopay" ? "Autopay / ACH"
          : method === "invoiced" ? "Invoiced"
          : "Mixed";
        const rate = r.collectionRate ?? defaultCollectionRateForMethod(method);
        labelValue(doc, `${r.lineItem} — Collection`, `${methodLabel} @ ${rate.toFixed(0)}%`);
      }
      doc.moveDown(0.2);
    }

    sectionTitle(doc, "Revenue Schedule");
    const revCols: TableColumn[] = [{ header: "Category", width: 150 }, ...yearHeaders.map(h => ({ header: h, width: 80, align: "right" as const }))];
    const catOrder = ["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "philanthropy", "other_revenue"];
    const revTableRows: string[][] = [];
    const yearTotals = new Array(yearCount).fill(0);

    for (const cat of catOrder) {
      const catRows = revenueRows.filter(r => (r.category === cat || (cat === "philanthropy" && r.category === "grants_contributions")) && r.enabled);
      if (catRows.length === 0) continue;
      const catAmounts = new Array(yearCount).fill(0);
      for (let y = 0; y < yearCount; y++) {
        const byCat = computeRevenueByCat(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
        catAmounts[y] = (byCat.get(cat) || 0) + (cat === "philanthropy" ? (byCat.get("grants_contributions") || 0) : 0);
        yearTotals[y] += catAmounts[y];
      }
      revTableRows.push([REVENUE_CATEGORY_LABELS[cat] || cat, ...catAmounts.map(a => fmtCurrency(a))]);
    }
    revTableRows.push(["TOTAL REVENUE", ...yearTotals.map(t => fmtCurrency(t))]);
    drawTable(doc, revCols, revTableRows, { highlightLastRow: true });
  }

  if (staffingRows.length > 0) {
    sectionTitle(doc, "Staffing & Personnel");
    const staffCols: TableColumn[] = [
      { header: "Function", width: 130 },
      { header: "Positions", width: 70, align: "right" },
      { header: "FTE", width: 60, align: "right" },
      { header: "Year 1 Cost", width: 100, align: "right" },
    ];
    const byFunc = new Map<string, { count: number; fte: number; cost: number }>();
    for (const r of staffingRows) {
      const existing = byFunc.get(r.functionCategory) || { count: 0, fte: 0, cost: 0 };
      existing.count++;
      existing.fte += r.fte;
      const base = r.fte * r.annualizedRate;
      let cost = base;
      if (!(r.employmentType === "contract" && !r.payrollLike)) {
        if (r.benefitsEligible) cost += base * (r.benefitsRate / 100);
        cost += base * (r.payrollTaxRate / 100);
      }
      existing.cost += cost * prorationFactor;
      byFunc.set(r.functionCategory, existing);
    }
    const staffTableRows: string[][] = [];
    let totalCount = 0, totalFTE = 0, totalCost = 0;
    for (const [func, info] of byFunc) {
      staffTableRows.push([FUNC_CATEGORY_LABELS[func] || func, String(info.count), info.fte.toFixed(1), fmtCurrency(info.cost)]);
      totalCount += info.count;
      totalFTE += info.fte;
      totalCost += info.cost;
    }
    staffTableRows.push(["TOTAL", String(totalCount), totalFTE.toFixed(1), fmtCurrency(totalCost)]);
    drawTable(doc, staffCols, staffTableRows, { highlightLastRow: true, zebra: true });
  }

  if (expenseRows.length > 0) {
    sectionTitle(doc, "Operating Expenses");
    const expCols: TableColumn[] = [{ header: "Category", width: 150 }, ...yearHeaders.map(h => ({ header: h, width: 80, align: "right" as const }))];
    const baseCatOrder = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
    const customCats = [...new Set(expenseRows.map(r => r.category).filter(c => !baseCatOrder.includes(c) && c !== "personnel" && c !== "capital_financing"))];
    const catOrder = [...baseCatOrder, ...customCats];
    const customLabels = data.customCategoryLabels || {};
    const expTableRows: string[][] = [];
    const yearTotals = new Array(yearCount).fill(0);

    for (const cat of catOrder) {
      const catRows = expenseRows.filter(r => r.category === cat && r.enabled);
      if (catRows.length === 0) continue;
      const catAmounts = new Array(yearCount).fill(0);
      for (let y = 0; y < yearCount; y++) {
        const totalRev = computeRevenueForYear(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
        for (const r of catRows) {
          if (r.driverType === "percent_of_revenue") {
            catAmounts[y] += ((r.amounts?.[y] ?? 0) / 100) * totalRev;
          } else {
            catAmounts[y] += computeDriverValue(r.amounts, y, r.driverType, enrollment[y], localNewStudentsPDF(enrollment, pdfRR, y), localReturningStudentsPDF(enrollment, pdfRR, y));
          }
        }
        yearTotals[y] += catAmounts[y];
      }
      expTableRows.push([customLabels[cat] || EXPENSE_CATEGORY_LABELS[cat] || cat, ...catAmounts.map(a => fmtCurrency(a))]);
    }
    expTableRows.push(["TOTAL OPERATING EXPENSES", ...yearTotals.map(t => fmtCurrency(t))]);
    drawTable(doc, expCols, expTableRows, { highlightLastRow: true });
  }

  sectionTitle(doc, `${yearCount}-Year ${profitLabel(sp.entityType)} & Loss Statement`);
  const pnlCols: TableColumn[] = [{ header: "", width: 150 }, ...yearHeaders.map(h => ({ header: h, width: 80, align: "right" as const }))];
  const pnlRows: string[][] = [];
  const revTotals: number[] = [];
  const staffTotals: number[] = [];
  const opexTotals: number[] = [];
  const capDebtTotals: number[] = [];
  const niTotals: number[] = [];
  let cumNI = 0;
  const cumNIs: number[] = [];

  for (let y = 0; y < yearCount; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const salaryEsc = Math.pow(1 + salaryEscRate, y);
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
    const staff = computeStaffingCost(staffingRows, salaryEsc, pf);
    const opex = computeExpensesCost(expenseRows, y, enrollment[y], rev, localNewStudentsPDF(enrollment, pdfRR, y), localReturningStudentsPDF(enrollment, pdfRR, y));
    const capDebt = computeCapDebt(capDebtRows, y, enrollment[y]);
    const ni = rev - staff - opex - capDebt;
    cumNI += ni;
    revTotals.push(rev);
    staffTotals.push(staff);
    opexTotals.push(opex);
    capDebtTotals.push(capDebt);
    niTotals.push(ni);
    cumNIs.push(cumNI);
  }

  let mgmtFeeTotals: number[] | null = null;
  if (sp.hasManagementFee) {
    const feeRow = expenseRows.find(ex => ex.id === "authorizer_fee" && ex.enabled);
    if (feeRow) {
      mgmtFeeTotals = [];
      for (let y = 0; y < yearCount; y++) {
        const rev = computeRevenueForYear(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
        if (feeRow.driverType === "percent_of_revenue") {
          mgmtFeeTotals.push(((feeRow.amounts?.[y] ?? 0) / 100) * rev);
        } else {
          mgmtFeeTotals.push(computeDriverValue(feeRow.amounts, y, feeRow.driverType, enrollment[y]));
        }
      }
    }
  }

  pnlRows.push(["Total Revenue", ...revTotals.map(v => fmtCurrency(v))]);
  pnlRows.push(["Total Staffing", ...staffTotals.map(v => `(${fmtCurrency(v)})`)]);
  if (mgmtFeeTotals) {
    const opsMinusFee = opexTotals.map((v, i) => v - (mgmtFeeTotals![i] || 0));
    pnlRows.push(["Total Operating Expenses", ...opsMinusFee.map(v => `(${fmtCurrency(v)})`)]);
    pnlRows.push(["Authorizer / Management Fee", ...mgmtFeeTotals.map(v => `(${fmtCurrency(v)})`)]);
  } else {
    pnlRows.push(["Total Operating Expenses", ...opexTotals.map(v => `(${fmtCurrency(v)})`)]);
  }
  if (capDebtRows.length > 0) {
    pnlRows.push(["Capital & Debt Service", ...capDebtTotals.map(v => `(${fmtCurrency(v)})`)]);
  }
  pnlRows.push([profitLabel(sp.entityType), ...niTotals.map(v => fmtCurrency(v))]);
  pnlRows.push([`${profitMarginLabel(sp.entityType)} %`, ...niTotals.map((v, i) => fmtPct(revTotals[i] > 0 ? v / revTotals[i] : 0))]);
  pnlRows.push([`Cumulative ${profitLabel(sp.entityType)}`, ...cumNIs.map(v => fmtCurrency(v))]);

  drawTable(doc, pnlCols, pnlRows, { highlightLastRow: false, zebra: true });

  const priorYear = data.priorYearSnapshot;
  if (priorYear && (priorYear.totalRevenue || priorYear.totalExpenses)) {
    ensureSpace(doc, 200);
    sectionTitle(doc, "Prior-Year Actuals vs. Year 1 Projections");
    const priorCols: TableColumn[] = [
      { header: "", width: 180 },
      { header: "Prior Year", width: 100, align: "right" },
      { header: "Year 1 Projected", width: 100, align: "right" },
      { header: "Variance", width: 80, align: "right" },
    ];
    const priorRows: string[][] = [];
    if (priorYear.totalRevenue) {
      const variance = revTotals[0] > 0 && priorYear.totalRevenue > 0
        ? ((revTotals[0] - priorYear.totalRevenue) / priorYear.totalRevenue * 100).toFixed(1) + "%"
        : "—";
      priorRows.push(["Total Revenue", fmtCurrency(priorYear.totalRevenue), fmtCurrency(revTotals[0]), variance]);
    }
    const y1ByCat = computeRevenueByCat(revenueRows, 0, enrollment[0], data.tuitionTiers, sp);
    const revCatMap: Array<{ label: string; pyKey: keyof typeof priorYear; projCats: string[] }> = [
      { label: "  Tuition & Fees", pyKey: "tuitionRevenue", projCats: ["tuition_and_fees", "tuition_offsets"] },
      { label: "  Public Funding", pyKey: "publicFundingRevenue", projCats: ["public_funding", "school_choice"] },
      { label: "  Philanthropy", pyKey: "philanthropyRevenue", projCats: ["philanthropy", "grants_contributions"] },
      { label: "  Other Revenue", pyKey: "otherRevenue", projCats: ["other_revenue"] },
    ];
    for (const { label, pyKey, projCats } of revCatMap) {
      const pyVal = priorYear[pyKey] as number | undefined;
      if (!pyVal) continue;
      const proj = projCats.reduce((s, c) => s + (y1ByCat.get(c) || 0), 0);
      const varStr = pyVal > 0 ? `${((proj - pyVal) / pyVal * 100).toFixed(1)}%` : "—";
      priorRows.push([label, fmtCurrency(pyVal), fmtCurrency(proj), varStr]);
    }
    if (priorYear.totalExpenses) {
      const y1Exp = staffTotals[0] + opexTotals[0] + capDebtTotals[0];
      const expVariance = priorYear.totalExpenses > 0
        ? ((y1Exp - priorYear.totalExpenses) / priorYear.totalExpenses * 100).toFixed(1) + "%"
        : "—";
      priorRows.push(["Total Expenses", fmtCurrency(priorYear.totalExpenses), fmtCurrency(y1Exp), expVariance]);
    }
    if (priorYear.personnelExpenses) {
      const varStr = priorYear.personnelExpenses > 0
        ? `${((staffTotals[0] - priorYear.personnelExpenses) / priorYear.personnelExpenses * 100).toFixed(1)}%`
        : "—";
      priorRows.push(["  Personnel", fmtCurrency(priorYear.personnelExpenses), fmtCurrency(staffTotals[0]), varStr]);
    }
    const y1ExpByCat = new Map<string, number>();
    for (const e of expenseRows) {
      if (!e.enabled) continue;
      let val: number;
      if (e.driverType === "percent_of_revenue") {
        val = ((e.amounts?.[0] ?? 0) / 100) * revTotals[0];
      } else {
        val = computeDriverValue(e.amounts, 0, e.driverType, enrollment[0]);
      }
      y1ExpByCat.set(e.category, (y1ExpByCat.get(e.category) || 0) + val);
    }
    const expCatMap: Array<{ label: string; pyKey: keyof typeof priorYear; projCats: string[] }> = [
      { label: "  Facility", pyKey: "facilityExpenses", projCats: ["occupancy_facility"] },
      { label: "  Instructional", pyKey: "instructionalExpenses", projCats: ["instructional_program"] },
      { label: "  Admin", pyKey: "adminExpenses", projCats: ["administrative_general", "technology"] },
    ];
    for (const { label, pyKey, projCats } of expCatMap) {
      const pyVal = priorYear[pyKey] as number | undefined;
      if (!pyVal) continue;
      const proj = projCats.reduce((s, c) => s + (y1ExpByCat.get(c) || 0), 0);
      const varStr = pyVal > 0 ? `${((proj - pyVal) / pyVal * 100).toFixed(1)}%` : "—";
      priorRows.push([label, fmtCurrency(pyVal), fmtCurrency(proj), varStr]);
    }
    if (priorYear.endingEnrollment) priorRows.push(["Ending Enrollment", fmtNumber(priorYear.endingEnrollment), fmtNumber(enrollment[0]), "—"]);
    if (priorYear.endingCash) priorRows.push(["Ending Cash", fmtCurrency(priorYear.endingCash), "—", "—"]);
    drawTable(doc, priorCols, priorRows, { zebra: true });
  }

  const ob = data.openingBalances;
  if (ob && ((ob.cash || 0) + (ob.accountsReceivable || 0) + (ob.fixedAssets || 0) + (ob.otherAssets || 0) + (ob.accountsPayable || 0) + (ob.currentDebtPortion || 0) + (ob.longTermDebt || 0) > 0)) {
    ensureSpace(doc, 200);
    sectionTitle(doc, "Opening Balance Sheet");
    const bsCols: TableColumn[] = [{ header: "", width: 200 }, { header: "Amount", width: 120, align: "right" }];
    const bsRows: string[][] = [];
    const totalAssets = (ob.cash || 0) + (ob.accountsReceivable || 0) + (ob.fixedAssets || 0) + (ob.otherAssets || 0);
    const totalLiabilities = (ob.accountsPayable || 0) + (ob.currentDebtPortion || 0) + (ob.longTermDebt || 0);
    bsRows.push(["ASSETS", ""]);
    if (ob.cash) bsRows.push(["  Cash & Cash Equivalents", fmtCurrency(ob.cash)]);
    if (ob.accountsReceivable) bsRows.push(["  Accounts Receivable", fmtCurrency(ob.accountsReceivable)]);
    if (ob.fixedAssets) bsRows.push(["  Fixed Assets (Net)", fmtCurrency(ob.fixedAssets)]);
    if (ob.otherAssets) bsRows.push(["  Other Assets", fmtCurrency(ob.otherAssets)]);
    bsRows.push(["Total Assets", fmtCurrency(totalAssets)]);
    bsRows.push(["", ""]);
    bsRows.push(["LIABILITIES", ""]);
    if (ob.accountsPayable) bsRows.push(["  Accounts Payable", fmtCurrency(ob.accountsPayable)]);
    if (ob.currentDebtPortion) bsRows.push(["  Current Portion of Debt", fmtCurrency(ob.currentDebtPortion)]);
    if (ob.longTermDebt) bsRows.push(["  Long-Term Debt", fmtCurrency(ob.longTermDebt)]);
    bsRows.push(["Total Liabilities", fmtCurrency(totalLiabilities)]);
    bsRows.push(["Net Position", fmtCurrency(totalAssets - totalLiabilities)]);
    drawTable(doc, bsCols, bsRows, { zebra: true });
  }

  const y1Rev = revTotals[0] || 0;
  const y1Exp = staffTotals[0] + opexTotals[0] + capDebtTotals[0];
  if (enrollment[0] > 0 && y1Rev > 0) {
    ensureSpace(doc, 160);
    sectionTitle(doc, "Key Financial Indicators");
    const revenuePerStudent = y1Rev / enrollment[0];

    let y1VariableCostPerStudent = 0;
    let y1FixedCosts = staffTotals[0];
    for (const e of (data.expenseRows || [])) {
      if (!e.enabled) continue;
      const dt = e.driverType as string;
      if (dt === "per_student" || dt === "per_new_student" || dt === "per_returning_student") {
        y1VariableCostPerStudent += e.amounts?.[0] ?? 0;
      } else if (dt !== "percent_of_revenue") {
        y1FixedCosts += computeDriverValue(e.amounts, 0, e.driverType, enrollment[0]);
      }
    }
    y1FixedCosts += capDebtTotals[0];
    const contributionMargin = revenuePerStudent - y1VariableCostPerStudent;
    const breakeven = contributionMargin > 0 ? Math.ceil(y1FixedCosts / contributionMargin) : Infinity;

    labelValue(doc, "Revenue per Student", fmtCurrency(revenuePerStudent));
    labelValue(doc, "Variable Cost per Student", fmtCurrency(y1VariableCostPerStudent));
    labelValue(doc, "Fixed Costs", fmtCurrency(y1FixedCosts));
    if (breakeven !== Infinity) {
      labelValue(doc, "Breakeven Enrollment", `${fmtNumber(breakeven)} students`);
      const cushion = enrollment[0] > breakeven
        ? `${((enrollment[0] - breakeven) / breakeven * 100).toFixed(0)}% above breakeven`
        : `${((breakeven - enrollment[0]) / breakeven * 100).toFixed(0)}% below breakeven`;
      labelValue(doc, "Enrollment Cushion", cushion);
    }

    let totalSqft = 0;
    const facilityPhases = (sp as Record<string, unknown>).facilityPhases as FacilityPhase[] | undefined || data.facilityPhases || [];
    let hasRenewalOpt = false;
    let earliestExpiry: string | undefined;
    for (const p of facilityPhases) {
      if (p.squareFootage) totalSqft += p.squareFootage;
      if (p.hasRenewalOption) hasRenewalOpt = true;
      if (p.facilityArrangementEndDate) {
        if (!earliestExpiry || p.facilityArrangementEndDate < earliestExpiry) earliestExpiry = p.facilityArrangementEndDate;
      }
    }
    let facilityCost = 0;
    for (const e of (data.expenseRows || [])) {
      if (!e.enabled || e.category !== "occupancy_facility") continue;
      if (e.driverType === "percent_of_revenue") {
        facilityCost += ((e.amounts?.[0] ?? 0) / 100) * y1Rev;
      } else {
        facilityCost += computeDriverValue(e.amounts, 0, e.driverType, enrollment[0]);
      }
    }
    if (enrollment[0] > 0 && facilityCost > 0) {
      labelValue(doc, "Facility Cost / Student", fmtCurrency(facilityCost / enrollment[0]));
    }
    if (totalSqft > 0) {
      labelValue(doc, "Total Square Footage", fmtNumber(totalSqft));
      if (facilityCost > 0) {
        labelValue(doc, "Facility Cost / Sq Ft", fmtCurrency(facilityCost / totalSqft));
      }
    }
    if (earliestExpiry) {
      const endDt = new Date(earliestExpiry);
      const now = new Date();
      const remainingMonths = Math.max(0, Math.round((endDt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
      labelValue(doc, "Lease Term Remaining", `${remainingMonths} months`);
    }
    labelValue(doc, "Renewal Option", hasRenewalOpt ? "Yes" : "No");
  }

  if (revenueRows.length > 0 && enrollment[0] > 0) {
    ensureSpace(doc, 300);
    sectionTitle(doc, "Year 1 Monthly Cash Flow");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fyStart = (sp.fiscalYearStartMonth || 7) - 1;
    const startingCash = (data.openingBalances?.cash ?? 0);
    // Task #609 — full per-stream timing for both inflows AND outflows so
    // the lender sees the real cash trough (staff paid 12 mo / tuition
    // billed 10 mo). Personnel & opex spread over operating months only;
    // debt service is monthly.
    const opMonths = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) : 12;
    const series = computeYear1MonthlyCashFlow({
      revenueRows: (data.revenueRows || []) as unknown as MonthlyRevenueRowLike[],
      yearIndex: 0,
      students: enrollment[0],
      annualPersonnel: staffTotals[0] || 0,
      annualOpex: opexTotals[0] || 0,
      annualDebt: capDebtTotals[0] || 0,
      openingCash: startingCash,
      opMonths,
    });

    const cfCols: TableColumn[] = [
      { header: "Month", width: 55 },
      { header: "Beginning", width: 72, align: "right" },
      { header: "Inflows", width: 72, align: "right" },
      { header: "Outflows", width: 72, align: "right" },
      { header: "Net Cash Flow", width: 72, align: "right" },
      { header: "Ending", width: 72, align: "right" },
    ];
    const cfRows: string[][] = [];
    let anyNegativeMonth = false;
    let running = startingCash;
    for (let i = 0; i < 12; i++) {
      const mIdx = (fyStart + i) % 12;
      const label = monthNames[mIdx];
      const inflow = series.inflow[i];
      const outflow = series.outflow[i];
      const begin = running;
      const netCash = series.net[i];
      const end = begin + netCash;
      if (end < 0) anyNegativeMonth = true;
      cfRows.push([label, fmtCurrency(begin), fmtCurrency(inflow), `(${fmtCurrency(outflow)})`, fmtCurrency(netCash), fmtCurrency(end)]);
      running = end;
    }
    drawTable(doc, cfCols, cfRows, { zebra: true });

    const trough = findLowestCashMonth(series.cumulative, sp.fiscalYearStartMonth || 7);
    if (trough) {
      bodyText(doc, `Lowest cash month: ${trough.monthLabel} at ${fmtCurrency(trough.amount)}.`);
    }
    if (anyNegativeMonth) {
      bodyText(doc, "⚠ Cash position turns negative during Year 1. Consider adjusting revenue timing or securing a line of credit.");
    }
  }

  drawFooter(doc);
  return docToBuffer(doc);
}
