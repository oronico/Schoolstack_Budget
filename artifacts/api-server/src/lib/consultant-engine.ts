interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  entityType?: string;
  ein?: string;
  fundingProfile?: string;
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

interface TuitionTier {
  id: string;
  tierType: string;
  label: string;
  discountPercent: number;
  studentCounts: number[];
}

function isNonprofitEntity(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

function profitTerm(entityType?: string): string {
  return isNonprofitEntity(entityType) ? "net income" : "profit";
}

function profitMarginTerm(entityType?: string): string {
  return isNonprofitEntity(entityType) ? "net margin" : "profit margin";
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface LegacyRevenue {
  tuitionPerStudent?: number;
  annualTuitionIncrease?: number;
  esaRevenuePerStudent?: number;
  publicFundingPerStudent?: number;
  otherRevenuePerStudent?: number;
  scholarshipRate?: number;
  annualDonations?: number;
  foundationGrants?: number;
  capitalGifts?: number;
  annualFundraising?: number;
}

interface LegacyStaffing {
  studentsPerTeacher?: number;
  teacherSalary?: number;
  adminStaffCount?: number;
  adminSalary?: number;
  founderSalary?: number;
  benefitsRate?: number;
}

interface LegacyFacilities {
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
  annualSalaryIncrease?: number;
  generalCostInflation?: number;
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
  collectionMethod?: string;
  collectionRate?: number;
  collectionDelayDays?: number;
  paymentFrequency?: string;
  paymentTiming?: string;
  disbursementType?: string;
  reimbursementLagMonths?: number;
  grantStatus?: string;
  receiptQuarter?: number;
  escalationRate?: number;
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
  escalationRate?: number;
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

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  revenue?: LegacyRevenue;
  revenueRows?: RevenueRow[];
  staffing?: LegacyStaffing;
  staffingRows?: StaffingRow[];
  facilities?: LegacyFacilities;
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
}

export interface KeyMetric {
  name: string;
  value: string;
  status: "good" | "warning" | "danger";
  interpretation: string;
  benchmark?: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface RevenueComposition {
  tuitionPct: number;
  publicPct: number;
  philanthropyPct: number;
}

export interface CostComposition {
  staffingPctOfRevenue: number;
  facilityPctOfRevenue: number;
  totalOpexPctOfRevenue: number;
}

export interface CumulativeYear {
  year: number;
  cumulativeNetIncome: number;
  reserveMonths: number;
}

export interface StressScenario {
  scenario: string;
  y1NetIncome: number;
  y5NetIncome: number;
  breakEvenYear: number | null;
}

export interface SensitivityCell {
  enrollmentPct: number;
  tuitionPct: number;
  netIncome: number;
}

export interface ConsultantOutput {
  executiveSummary: string;
  biggestStrength: string;
  biggestRisk: string;
  recommendations: Recommendation[];
  lenderReadiness: "Strong" | "Needs Work" | "Not Yet Ready";
  lenderReadinessExplanation: string;
  keyMetrics: KeyMetric[];
  revenueComposition: RevenueComposition[];
  costComposition: CostComposition[];
  cumulativeFinancials: CumulativeYear[];
  stressTests: StressScenario[];
  sensitivityMatrix: SensitivityCell[];
  cashRunwayMonths: number;
  enrollmentGuidance: string[];
  generatedAt: string;
}

interface YearFinancials {
  year: number;
  students: number;
  totalRevenue: number;
  tuitionRevenue: number;
  publicRevenue: number;
  philanthropyRevenue: number;
  totalStaffingCost: number;
  facilityCost: number;
  totalOpex: number;
  debtService: number;
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function computeAnnualDebtService(loanAmount: number, annualRate: number, termYears: number): number {
  if (loanAmount <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return loanAmount / termYears;
  const monthlyRate = annualRate / 12;
  const months = termYears * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return monthlyPayment * 12;
}

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number, escalationRate?: number, fallbackInflation?: number): number {
  let base: number;
  const esc = (escalationRate !== undefined && escalationRate !== 0) ? escalationRate : (fallbackInflation ?? 0);
  if (esc !== 0 && yearIdx > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + esc / 100, yearIdx);
  } else {
    base = amounts?.[yearIdx] ?? 0;
  }
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

interface RevenueBreakdown {
  total: number;
  tuition: number;
  publicFunding: number;
  philanthropy: number;
}

function computeTuitionWithTiers(
  grossTuitionPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers?: TuitionTier[],
): number {
  if (!tuitionTiers || tuitionTiers.length === 0) {
    return grossTuitionPerStudent * totalStudents;
  }

  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }

  if (rawTierTotal === 0) {
    return grossTuitionPerStudent * totalStudents;
  }

  const scaleFactor = rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;

  let totalTuition = 0;
  let allocatedStudents = 0;
  for (const tier of tuitionTiers) {
    const rawCount = tier.studentCounts?.[yearIdx] ?? 0;
    const scaledCount = rawCount * scaleFactor;
    allocatedStudents += scaledCount;
    const discount = (tier.discountPercent || 0) / 100;
    totalTuition += scaledCount * grossTuitionPerStudent * (1 - discount);
  }

  const remainingStudents = totalStudents - allocatedStudents;
  if (remainingStudents > 0) {
    totalTuition += remainingStudents * grossTuitionPerStudent;
  }

  return totalTuition;
}

function computeRevenueForYear(rows: RevenueRow[], yearIdx: number, students: number, tuitionTiers?: TuitionTier[]): RevenueBreakdown {
  const rowValues = new Map<string, number>();

  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;

    if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
      let perStudentAmount: number;
      if (row.escalationRate !== undefined && row.escalationRate !== 0 && yearIdx > 0) {
        perStudentAmount = (row.amounts?.[0] ?? 0) * Math.pow(1 + row.escalationRate / 100, yearIdx);
      } else {
        perStudentAmount = row.amounts?.[yearIdx] ?? 0;
      }
      rowValues.set(row.id, computeTuitionWithTiers(perStudentAmount, yearIdx, students, tuitionTiers));
    } else {
      rowValues.set(row.id, computeDriverValue(row.amounts, yearIdx, row.driverType, students, row.escalationRate));
    }
  }

  for (const row of rows) {
    if (!row.enabled || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase || "") || 0;
    let pctVal: number;
    if (row.escalationRate !== undefined && row.escalationRate !== 0 && yearIdx > 0) {
      pctVal = (row.amounts?.[0] ?? 0) * Math.pow(1 + row.escalationRate / 100, yearIdx);
    } else {
      pctVal = row.amounts?.[yearIdx] ?? 0;
    }
    const percentage = pctVal / 100;
    rowValues.set(row.id, baseVal * percentage);
  }

  let tuition = 0, publicFunding = 0, philanthropy = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    const val = rowValues.get(row.id) || 0;
    switch (row.category) {
      case "tuition_and_fees": case "other_revenue": tuition += val; break;
      case "tuition_offsets": tuition -= val; break;
      case "public_funding": case "school_choice": publicFunding += val; break;
      case "grants_contributions": philanthropy += val; break;
    }
  }

  return { total: tuition + publicFunding + philanthropy, tuition, publicFunding, philanthropy };
}

function computeStaffingBaseCost(rows: StaffingRow[]): number {
  let total = 0;
  for (const row of rows) {
    const annualCost = row.fte * row.annualizedRate;
    const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
    if (isContractNotPayrollLike) {
      total += annualCost;
    } else {
      total += annualCost;
      if (row.benefitsEligible) total += annualCost * (row.benefitsRate / 100);
      total += annualCost * (row.payrollTaxRate / 100);
    }
  }
  return total;
}

function computeExpensesForYear(rows: ExpenseRow[], yearIdx: number, students: number, totalRevenue: number, costInflationPct?: number): { total: number; facilityCost: number } {
  let total = 0, facilityCost = 0;
  const fallback = costInflationPct ?? 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    let val: number;
    if (row.driverType === "percent_of_revenue") {
      const esc = (row.escalationRate !== undefined && row.escalationRate !== 0) ? row.escalationRate : fallback;
      let pct: number;
      if (esc !== 0 && yearIdx > 0) {
        pct = (row.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, yearIdx);
      } else {
        pct = row.amounts?.[yearIdx] ?? 0;
      }
      val = (pct / 100) * totalRevenue;
    } else {
      val = computeDriverValue(row.amounts, yearIdx, row.driverType, students, row.escalationRate, fallback);
    }
    total += val;
    if (row.category === "occupancy_facility") facilityCost += val;
  }
  return { total, facilityCost };
}

function computeCapDebtForYear(rows: CapitalDebtRow[], yearIdx: number, students: number): number {
  let total = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
      total += computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
    } else {
      total += computeDriverValue(row.amounts, yearIdx, row.driverType, students);
    }
  }
  return total;
}

function computeAllYearsFromRows(
  enrollmentByYear: number[],
  revenueRows: RevenueRow[],
  staffingRows: StaffingRow[],
  expenseRows: ExpenseRow[],
  capDebtRows: CapitalDebtRow[],
  salaryEscRate: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
  costInflationPct?: number,
): YearFinancials[] {
  const baseCost = computeStaffingBaseCost(staffingRows);

  return enrollmentByYear.map((students, yearIdx) => {
    const pf = yearIdx === 0 ? prorationFactor : 1;
    const salaryEsc = Math.pow(1 + salaryEscRate, yearIdx);
    const totalStaffingCost = baseCost * salaryEsc * pf;

    const rev = computeRevenueForYear(revenueRows, yearIdx, students, tuitionTiers);
    const exp = computeExpensesForYear(expenseRows, yearIdx, students, rev.total, costInflationPct);
    const capDebt = computeCapDebtForYear(capDebtRows, yearIdx, students);

    const totalOpex = exp.total + capDebt;
    const totalExpenses = totalStaffingCost + totalOpex;
    const netIncome = rev.total - totalExpenses;

    return {
      year: yearIdx + 1,
      students,
      totalRevenue: rev.total,
      tuitionRevenue: rev.tuition,
      publicRevenue: rev.publicFunding,
      philanthropyRevenue: rev.philanthropy,
      totalStaffingCost,
      facilityCost: exp.facilityCost,
      totalOpex,
      debtService: capDebt,
      totalExpenses,
      netIncome,
      netMargin: rev.total > 0 ? netIncome / rev.total : 0,
    };
  });
}

function computeYearFinancialsLegacy(
  yearIndex: number,
  students: number,
  rev: LegacyRevenue,
  st: LegacyStaffing,
  fac: LegacyFacilities,
  prorationFactor: number,
): YearFinancials {
  const tuitionIncrease = (rev.annualTuitionIncrease || 0) / 100;
  const salaryIncrease = (fac.annualSalaryIncrease || 0) / 100;
  const costInflation = (fac.generalCostInflation || 0) / 100;
  const pf = yearIndex === 0 ? prorationFactor : 1;

  const tuitionPerStudent = (rev.tuitionPerStudent || 0) * Math.pow(1 + tuitionIncrease, yearIndex);
  const esaPerStudent = (rev.esaRevenuePerStudent || 0) * Math.pow(1 + costInflation, yearIndex);
  const publicFundingPerStudent = (rev.publicFundingPerStudent || 0) * Math.pow(1 + costInflation, yearIndex);
  const otherPerStudent = (rev.otherRevenuePerStudent || 0) * Math.pow(1 + tuitionIncrease, yearIndex);
  const scholarshipRate = (rev.scholarshipRate || 0) / 100;
  const donations = (rev.annualDonations ?? rev.annualFundraising ?? 0) * Math.pow(1 + costInflation, yearIndex);
  const grants = (rev.foundationGrants || 0) * Math.pow(1 + costInflation, yearIndex);
  const capitalGifts = yearIndex === 0 ? (rev.capitalGifts || 0) : 0;

  const grossTuition = students * tuitionPerStudent * pf;
  const otherFees = students * otherPerStudent * pf;
  const scholarshipDiscount = grossTuition * scholarshipRate;
  const netTuition = grossTuition + otherFees - scholarshipDiscount;

  const esaRevenue = students * esaPerStudent * pf;
  const publicFunding = students * publicFundingPerStudent * pf;
  const publicRevenue = esaRevenue + publicFunding;

  const philanthropyRevenue = (donations + grants) * pf + capitalGifts;
  const totalRevenue = netTuition + publicRevenue + philanthropyRevenue;

  const salaryEsc = Math.pow(1 + salaryIncrease, yearIndex);
  const studentsPerTeacher = st.studentsPerTeacher || 1;
  const teacherCount = studentsPerTeacher > 0 ? Math.ceil(students / studentsPerTeacher) : 0;
  const teacherPayroll = teacherCount * (st.teacherSalary || 0) * salaryEsc * pf;
  const adminPayroll = (st.adminStaffCount || 0) * (st.adminSalary || 0) * salaryEsc * pf;
  const founderSalary = (st.founderSalary || 0) * salaryEsc * pf;
  const totalSalaries = teacherPayroll + adminPayroll + founderSalary;
  const benefits = totalSalaries * ((st.benefitsRate || 0) / 100);
  const totalStaffingCost = totalSalaries + benefits;

  const infEsc = Math.pow(1 + costInflation, yearIndex);
  const rentIncrease = (fac.annualRentIncrease || 0) / 100;
  const annualRent = (fac.monthlyRent || 0) * 12 * Math.pow(1 + rentIncrease, yearIndex) * pf;
  const utilities = (fac.annualUtilities || 0) * infEsc * pf;
  const insurance = (fac.annualInsurance || 0) * infEsc * pf;
  const maintenance = (fac.facilityMaintenance || 0) * infEsc * pf;
  const facilityCost = annualRent + utilities + insurance + maintenance;

  const curriculum = (fac.curriculumCostPerStudent || 0) * students * infEsc * pf;
  const tech = (fac.techCostPerStudent || 0) * students * infEsc * pf;
  const foodService = (fac.foodServicePerStudent || 0) * students * infEsc * pf;
  const transportation = (fac.transportationAnnual || 0) * infEsc * pf;
  const studentServices = (fac.studentServicesAnnual || 0) * infEsc * pf;
  const marketing = (fac.annualMarketing || 0) * infEsc * pf;
  const profDev = (fac.professionalDevelopment || 0) * infEsc * pf;
  const otherExpenses = (fac.otherAnnualExpenses || 0) * infEsc * pf;

  const debtService = computeAnnualDebtService(
    fac.loanAmount || 0,
    (fac.annualInterestRate || 0) / 100,
    fac.loanTermYears || 0,
  ) * pf;

  const totalOpex = facilityCost + curriculum + tech + foodService + transportation +
    studentServices + marketing + profDev + otherExpenses + debtService;

  const totalExpenses = totalStaffingCost + totalOpex;
  const netIncome = totalRevenue - totalExpenses;

  return {
    year: yearIndex + 1,
    students,
    totalRevenue,
    tuitionRevenue: netTuition,
    publicRevenue,
    philanthropyRevenue,
    totalStaffingCost,
    facilityCost,
    totalOpex,
    debtService,
    totalExpenses,
    netIncome,
    netMargin: totalRevenue > 0 ? netIncome / totalRevenue : 0,
  };
}

function runStressScenarioFromRows(
  label: string,
  enrollmentByYear: number[],
  revenueRows: RevenueRow[],
  staffingRows: StaffingRow[],
  expenseRows: ExpenseRow[],
  capDebtRows: CapitalDebtRow[],
  salaryEscRate: number,
  prorationFactor: number,
  mods: {
    modifyEnrollment?: (e: number[]) => number[];
    modifyRevenueRows?: (r: RevenueRow[]) => RevenueRow[];
    modifyExpenseRows?: (e: ExpenseRow[]) => ExpenseRow[];
    modifyStaffingRows?: (s: StaffingRow[]) => StaffingRow[];
    tuitionTiers?: TuitionTier[];
  },
  costInflationPct?: number,
): StressScenario {
  const adjEnrollment = mods.modifyEnrollment ? mods.modifyEnrollment([...enrollmentByYear]) : enrollmentByYear;
  const adjRevRows = mods.modifyRevenueRows
    ? mods.modifyRevenueRows(revenueRows.map(r => ({ ...r, amounts: [...r.amounts] })))
    : revenueRows;
  const adjExpRows = mods.modifyExpenseRows
    ? mods.modifyExpenseRows(expenseRows.map(r => ({ ...r, amounts: [...r.amounts] })))
    : expenseRows;
  const adjStaffRows = mods.modifyStaffingRows
    ? mods.modifyStaffingRows(staffingRows.map(r => ({ ...r })))
    : staffingRows;

  const financials = computeAllYearsFromRows(adjEnrollment, adjRevRows, adjStaffRows, adjExpRows, capDebtRows, salaryEscRate, prorationFactor, mods.tuitionTiers, costInflationPct);
  const beIdx = financials.findIndex(yf => yf.netIncome >= 0);

  return {
    scenario: label,
    y1NetIncome: financials[0]?.netIncome || 0,
    y5NetIncome: financials[financials.length - 1]?.netIncome || 0,
    breakEvenYear: beIdx >= 0 ? beIdx + 1 : null,
  };
}

function runStressScenarioLegacy(
  label: string,
  enrollmentByYear: number[],
  rev: LegacyRevenue,
  st: LegacyStaffing,
  fac: LegacyFacilities,
  prorationFactor: number,
  modifyEnrollment?: (e: number[]) => number[],
  modifyRev?: (r: LegacyRevenue) => LegacyRevenue,
  modifyFac?: (f: LegacyFacilities) => LegacyFacilities,
): StressScenario {
  const adjEnrollment = modifyEnrollment ? modifyEnrollment([...enrollmentByYear]) : enrollmentByYear;
  const adjRev = modifyRev ? modifyRev({ ...rev }) : rev;
  const adjFac = modifyFac ? modifyFac({ ...fac }) : fac;

  const financials = adjEnrollment.map((s, idx) =>
    computeYearFinancialsLegacy(idx, s, adjRev, st, adjFac, prorationFactor),
  );
  const beIdx = financials.findIndex(yf => yf.netIncome >= 0);

  return {
    scenario: label,
    y1NetIncome: financials[0].netIncome,
    y5NetIncome: financials[financials.length - 1].netIncome,
    breakEvenYear: beIdx >= 0 ? beIdx + 1 : null,
  };
}

export function runConsultantEngine(rawData: Record<string, unknown>): ConsultantOutput {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};

  const isPartial = sp.isPartialFirstYear || false;
  const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = operatingMonths / 12;

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

  let yearFinancials: YearFinancials[];

  const tuitionTiers = data.tuitionTiers;

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
    const costInflationPct = data.facilities?.generalCostInflation || 0;

    yearFinancials = computeAllYearsFromRows(
      enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows,
      salaryEscRate, prorationFactor, tuitionTiers, costInflationPct,
    );
  } else {
    const rev = data.revenue || {};
    const st = data.staffing || {};
    const fac = data.facilities || {};
    yearFinancials = enrollmentByYear.map((students, idx) =>
      computeYearFinancialsLegacy(idx, students, rev, st, fac, prorationFactor),
    );
  }

  const y1 = yearFinancials[0];
  const yLast = yearFinancials[yearFinancials.length - 1];
  const lastYearNum = yearCount;

  const revenuePerStudent = y1.students > 0 ? y1.totalRevenue / y1.students : 0;
  const staffingCostPct = y1.totalRevenue > 0 ? y1.totalStaffingCost / y1.totalRevenue : 0;
  const opexCostPct = y1.totalRevenue > 0 ? y1.totalOpex / y1.totalRevenue : 0;
  const y1NetMargin = y1.netMargin;
  const lastYearNetMargin = yLast.netMargin;

  const enrollmentGrowthRate = y1.students > 0 ? (yLast.students - y1.students) / y1.students : 0;
  const revenueGrowth = y1.totalRevenue > 0 ? (yLast.totalRevenue - y1.totalRevenue) / y1.totalRevenue : 0;

  const breakEvenYear = yearFinancials.findIndex(yf => yf.netIncome >= 0);
  const capacityUtilLastYear = sp.maxCapacity && sp.maxCapacity > 0 ? yLast.students / sp.maxCapacity : 0;

  const philanthropyPct = y1.totalRevenue > 0 ? y1.philanthropyRevenue / y1.totalRevenue : 0;
  const publicRevenuePct = y1.totalRevenue > 0 ? y1.publicRevenue / y1.totalRevenue : 0;
  const hasDebt = y1.debtService > 0;
  const dscr = hasDebt && y1.netIncome !== undefined
    ? (y1.netIncome + y1.debtService) / y1.debtService
    : 0;

  const revenueComposition: RevenueComposition[] = yearFinancials.map(yf => ({
    tuitionPct: yf.totalRevenue > 0 ? yf.tuitionRevenue / yf.totalRevenue : 0,
    publicPct: yf.totalRevenue > 0 ? yf.publicRevenue / yf.totalRevenue : 0,
    philanthropyPct: yf.totalRevenue > 0 ? yf.philanthropyRevenue / yf.totalRevenue : 0,
  }));

  const costComposition: CostComposition[] = yearFinancials.map(yf => ({
    staffingPctOfRevenue: yf.totalRevenue > 0 ? yf.totalStaffingCost / yf.totalRevenue : 0,
    facilityPctOfRevenue: yf.totalRevenue > 0 ? yf.facilityCost / yf.totalRevenue : 0,
    totalOpexPctOfRevenue: yf.totalRevenue > 0 ? yf.totalOpex / yf.totalRevenue : 0,
  }));

  let cumNetIncome = 0;
  const cumulativeFinancials: CumulativeYear[] = yearFinancials.map(yf => {
    cumNetIncome += yf.netIncome;
    const monthlyExpenses = yf.totalExpenses / 12;
    const reserveMonths = monthlyExpenses > 0 && cumNetIncome > 0 ? cumNetIncome / monthlyExpenses : 0;
    return {
      year: yf.year,
      cumulativeNetIncome: cumNetIncome,
      reserveMonths: Math.round(reserveMonths * 10) / 10,
    };
  });

  const enrollmentGuidance: string[] = [];
  const maxCap = sp.maxCapacity || 0;
  for (let i = 1; i < yearCount; i++) {
    if (enrollmentByYear[i - 1] > 0 && enrollmentByYear[i] > 0) {
      const growth = (enrollmentByYear[i] - enrollmentByYear[i - 1]) / enrollmentByYear[i - 1];
      if (growth > 0.25) {
        enrollmentGuidance.push(
          `Year ${i} to Year ${i + 1} projects ${Math.round(growth * 100)}% enrollment growth. Growth over 25% in a single year is uncommon and may require aggressive marketing or facility expansion.`,
        );
      }
    }
  }
  if (maxCap > 0) {
    for (let i = 0; i < yearCount; i++) {
      if (enrollmentByYear[i] > maxCap) {
        enrollmentGuidance.push(
          `Year ${i + 1} enrollment of ${enrollmentByYear[i]} exceeds facility capacity of ${maxCap}. You'll need a larger facility or phased admissions.`,
        );
      }
    }
  }

  let stressTests: StressScenario[];

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
    const stressCostInflation = data.facilities?.generalCostInflation || 0;

    stressTests = [
      runStressScenarioFromRows("Enrollment 20% Below Plan", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyEnrollment: e => e.map(s => Math.round(s * 0.8)),
        tuitionTiers,
      }, stressCostInflation),
      runStressScenarioFromRows("Loss of Philanthropy", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyRevenueRows: rows => rows.map(r => r.category === "grants_contributions" ? { ...r, enabled: false } : r),
        tuitionTiers,
      }, stressCostInflation),
      runStressScenarioFromRows("Occupancy +15%, Personnel +5%", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyExpenseRows: rows => rows.map(r =>
          r.category === "occupancy_facility"
            ? { ...r, amounts: r.amounts.map(a => a * 1.15) }
            : { ...r, amounts: r.amounts.map(a => a * 1.05) }
        ),
        modifyStaffingRows: rows => rows.map(r => ({ ...r, annualizedRate: r.annualizedRate * 1.05 })),
        tuitionTiers,
      }, stressCostInflation),
      runStressScenarioFromRows("Revenue Delayed 3 Months", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyRevenueRows: rows => rows.map(r => ({
          ...r,
          amounts: r.amounts.map((a, i) => i === 0 ? a * 0.75 : a),
        })),
        tuitionTiers,
      }, stressCostInflation),
      runStressScenarioFromRows("Interest Rate +2%", enrollmentByYear, revenueRows, staffingRows, expenseRows,
        capDebtRows.map(r => r.isLoan ? { ...r, loanRate: (r.loanRate || 0) + 2 } : r),
        salaryEscRate, prorationFactor, { tuitionTiers }, stressCostInflation),
    ];
  } else {
    const rev = data.revenue || {};
    const st = data.staffing || {};
    const fac = data.facilities || {};
    stressTests = [
      runStressScenarioLegacy("Enrollment 20% Below Plan", enrollmentByYear, rev, st, fac, prorationFactor,
        e => e.map(s => Math.round(s * 0.8)),
      ),
      runStressScenarioLegacy("Loss of Philanthropy", enrollmentByYear, rev, st, fac, prorationFactor,
        undefined,
        r => ({ ...r, annualDonations: 0, foundationGrants: 0, capitalGifts: 0, annualFundraising: 0 }),
      ),
      runStressScenarioLegacy("Costs 10% Higher", enrollmentByYear, rev, st, fac, prorationFactor,
        undefined, undefined,
        f => ({
          ...f,
          monthlyRent: (f.monthlyRent || 0) * 1.1,
          annualUtilities: (f.annualUtilities || 0) * 1.1,
          annualInsurance: (f.annualInsurance || 0) * 1.1,
          facilityMaintenance: (f.facilityMaintenance || 0) * 1.1,
          curriculumCostPerStudent: (f.curriculumCostPerStudent || 0) * 1.1,
          techCostPerStudent: (f.techCostPerStudent || 0) * 1.1,
          foodServicePerStudent: (f.foodServicePerStudent || 0) * 1.1,
          transportationAnnual: (f.transportationAnnual || 0) * 1.1,
          studentServicesAnnual: (f.studentServicesAnnual || 0) * 1.1,
          annualMarketing: (f.annualMarketing || 0) * 1.1,
          professionalDevelopment: (f.professionalDevelopment || 0) * 1.1,
          otherAnnualExpenses: (f.otherAnnualExpenses || 0) * 1.1,
        }),
      ),
      runStressScenarioLegacy("Revenue Delayed 3 Months", enrollmentByYear, rev, st, fac, Math.max(0, prorationFactor - 0.25)),
      runStressScenarioLegacy("Interest Rate +2%", enrollmentByYear, rev, st,
        { ...fac, annualInterestRate: (fac.annualInterestRate || 0) + 2 }, prorationFactor),
    ];
  }

  const keyMetrics: KeyMetric[] = [];

  const isCharterBenchmark = sp.schoolType === "charter_school" || sp.fundingProfile === "charter_public_funded";

  keyMetrics.push({
    name: "Revenue per Student (Year 1)",
    value: fmt(revenuePerStudent),
    status: revenuePerStudent >= 10000 ? "good" : revenuePerStudent >= 7000 ? "warning" : "danger",
    interpretation:
      revenuePerStudent >= 10000
        ? "Healthy per-student revenue provides a solid foundation for sustainability."
        : revenuePerStudent >= 7000
          ? "Per-student revenue is moderate — consider whether tuition or supplemental funding can increase."
          : "Per-student revenue is low — this may make it difficult to cover costs as you scale.",
    benchmark: isCharterBenchmark ? "Charter avg: $10,000–$15,000" : "Private avg: $12,000–$25,000",
  });

  keyMetrics.push({
    name: "Staffing Cost (% of Revenue)",
    value: pct(staffingCostPct),
    status: staffingCostPct <= 0.55 ? "good" : staffingCostPct <= 0.65 ? "warning" : "danger",
    interpretation:
      staffingCostPct <= 0.55
        ? "Staffing costs are well-controlled — you have room for other priorities."
        : staffingCostPct <= 0.65
          ? `Payroll is ${pct(staffingCostPct)} of revenue — most sustainable schools keep this under 65%.`
          : `Payroll is ${pct(staffingCostPct)} of revenue — this is high and could threaten financial stability.`,
    benchmark: "Industry avg: 50–65% of revenue",
  });

  keyMetrics.push({
    name: "Operating Cost (% of Revenue)",
    value: pct(opexCostPct),
    status: opexCostPct <= 0.30 ? "good" : opexCostPct <= 0.40 ? "warning" : "danger",
    interpretation:
      opexCostPct <= 0.30
        ? "Operating costs are lean relative to revenue."
        : opexCostPct <= 0.40
          ? `Operating costs are moderate — watch rent escalation and service costs over the ${yearCount}-year period.`
          : "Operating costs are consuming a large share of revenue — review each cost center for savings.",
    benchmark: "Target: under 30% of revenue",
  });

  const marginLabel = profitMarginTerm(sp.entityType);
  const profitWord = profitTerm(sp.entityType);

  keyMetrics.push({
    name: `${marginLabel.charAt(0).toUpperCase() + marginLabel.slice(1)} (Year 1)`,
    value: pct(y1NetMargin),
    status: y1NetMargin >= 0.1 ? "good" : y1NetMargin >= 0 ? "warning" : "danger",
    interpretation:
      y1NetMargin >= 0.1
        ? "Year 1 shows a healthy surplus — a strong start for a new school."
        : y1NetMargin >= 0
          ? "Year 1 is near break-even — typical for startup schools, but leaves little room for surprises."
          : `Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit — plan for how this will be funded.`,
    benchmark: "Startup target: 0–5%; mature: 10%+",
  });

  keyMetrics.push({
    name: `${marginLabel.charAt(0).toUpperCase() + marginLabel.slice(1)} (Year ${lastYearNum})`,
    value: pct(lastYearNetMargin),
    status: lastYearNetMargin >= 0.15 ? "good" : lastYearNetMargin >= 0.05 ? "warning" : "danger",
    interpretation:
      lastYearNetMargin >= 0.15
        ? `By Year ${lastYearNum} the model shows strong ${profitWord} — attractive to lenders.`
        : lastYearNetMargin >= 0.05
          ? `Year ${lastYearNum} margin is thin — a small revenue shortfall could push you into the red.`
          : `Year ${lastYearNum} margin is concerning — lenders will want to see a clearer path to ${profitWord}.`,
    benchmark: "Lender target: 10–15%+",
  });

  keyMetrics.push({
    name: `${yearCount}-Year Revenue Growth`,
    value: pct(revenueGrowth),
    status: revenueGrowth >= 0.5 ? "good" : revenueGrowth >= 0.2 ? "warning" : "danger",
    interpretation:
      revenueGrowth >= 0.5
        ? `Strong projected revenue growth over the ${yearCount}-year period.`
        : revenueGrowth >= 0.2
          ? "Moderate growth — consider whether enrollment targets are ambitious enough."
          : "Low projected growth — this could signal difficulty scaling the school.",
    benchmark: "Healthy schools: 30–80% over 5 years",
  });

  if (sp.maxCapacity && sp.maxCapacity > 0) {
    keyMetrics.push({
      name: `Capacity Utilization (Year ${lastYearNum})`,
      value: pct(capacityUtilLastYear),
      status: capacityUtilLastYear >= 0.8 ? "good" : capacityUtilLastYear >= 0.6 ? "warning" : "danger",
      interpretation:
        capacityUtilLastYear >= 0.8
          ? `Year ${lastYearNum} enrollment approaches facility capacity — efficient use of space.`
          : capacityUtilLastYear >= 0.6
            ? "You have room to grow into your facility — plan marketing to fill seats."
            : `Facility will be underutilized by Year ${lastYearNum} — consider a smaller space or higher enrollment targets.`,
      benchmark: "Optimal: 80–95% utilization",
    });
  }

  if (hasDebt) {
    keyMetrics.push({
      name: "Debt Service Coverage Ratio (Year 1)",
      value: dscr > 0 ? `${dscr.toFixed(2)}x` : "N/A",
      status: dscr >= 1.25 ? "good" : dscr >= 1.0 ? "warning" : "danger",
      interpretation:
        dscr >= 1.25
          ? "DSCR is above 1.25x — lenders typically want to see at least this level."
          : dscr >= 1.0
            ? "DSCR is above 1.0x but tight — lenders may require additional collateral or guarantees."
            : "DSCR is below 1.0x — the school cannot cover debt payments from operating income alone.",
      benchmark: "Lender minimum: 1.25x",
    });
  }

  if (philanthropyPct > 0.05) {
    keyMetrics.push({
      name: "Philanthropy (% of Revenue)",
      value: pct(philanthropyPct),
      status: philanthropyPct <= 0.15 ? "good" : philanthropyPct <= 0.30 ? "warning" : "danger",
      interpretation:
        philanthropyPct <= 0.15
          ? "Philanthropy supplements but doesn't dominate revenue — a sustainable mix."
          : philanthropyPct <= 0.30
            ? "Donations and grants make up a significant share of revenue — plan for donor diversification."
            : "Heavy reliance on philanthropy — lenders view this as unpredictable revenue. Build toward earned revenue sustainability.",
      benchmark: "Sustainable: under 15%",
    });
  }

  if (publicRevenuePct > 0.05) {
    keyMetrics.push({
      name: "Public Funding (% of Revenue)",
      value: pct(publicRevenuePct),
      status: publicRevenuePct <= 0.50 ? "good" : publicRevenuePct <= 0.70 ? "warning" : "danger",
      interpretation:
        publicRevenuePct <= 0.50
          ? "Public funding is a meaningful revenue stream without creating over-dependency."
          : publicRevenuePct <= 0.70
            ? "Significant reliance on public funding — changes in state policy could materially impact revenue."
            : "The model is heavily dependent on public funding — develop contingency plans for policy changes.",
      benchmark: "Charter avg: 60–80% public",
    });
  }

  const lastReserve = cumulativeFinancials[cumulativeFinancials.length - 1];
  if (lastReserve) {
    keyMetrics.push({
      name: `Operating Reserve (Year ${lastYearNum})`,
      value: `${lastReserve.reserveMonths.toFixed(1)} months`,
      status: lastReserve.reserveMonths >= 3 ? "good" : lastReserve.reserveMonths >= 1 ? "warning" : "danger",
      interpretation:
        lastReserve.reserveMonths >= 3
          ? `By Year ${lastYearNum}, the school has built a healthy operating reserve of 3+ months — a strong signal to lenders.`
          : lastReserve.reserveMonths >= 1
            ? "The reserve buffer is thin — target building at least 3 months of expenses as a cushion."
            : `No meaningful reserve has been built by Year ${lastYearNum}. This is a significant vulnerability.`,
      benchmark: "Best practice: 3–6 months reserves",
    });
  }

  const strengths: string[] = [];
  const risks: string[] = [];

  if (lastYearNetMargin >= 0.15) strengths.push(`Strong Year ${lastYearNum} ${profitWord}`);
  if (staffingCostPct <= 0.55) strengths.push("Well-controlled staffing costs");
  if (revenuePerStudent >= 10000) strengths.push("Healthy per-student revenue");
  if (revenueGrowth >= 0.5) strengths.push(`Strong ${yearCount}-year revenue growth trajectory`);
  if (breakEvenYear === 0) strengths.push(`${profitWord.charAt(0).toUpperCase() + profitWord.slice(1)} from Year 1`);
  if (capacityUtilLastYear >= 0.8) strengths.push(`Efficient facility utilization by Year ${lastYearNum}`);
  if (enrollmentGrowthRate >= 0.5) strengths.push("Significant enrollment growth planned");
  if (hasDebt && dscr >= 1.25) strengths.push("Strong debt service coverage ratio");
  if (publicRevenuePct > 0.1 && publicRevenuePct <= 0.5) strengths.push("Diversified revenue with public funding");
  if (philanthropyPct > 0 && philanthropyPct <= 0.15) strengths.push("Supplemental philanthropy without over-reliance");
  if (lastReserve && lastReserve.reserveMonths >= 3) strengths.push(`Healthy operating reserve by Year ${lastYearNum}`);

  if (y1NetMargin < 0) risks.push(`Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit`);
  if (staffingCostPct > 0.65) risks.push(`Staffing consumes ${pct(staffingCostPct)} of revenue`);
  if (revenuePerStudent < 7000) risks.push("Per-student revenue is below sustainable levels");
  if (opexCostPct > 0.40) risks.push("Operating costs are high relative to revenue");
  if (lastYearNetMargin < 0.05) risks.push(`Year ${lastYearNum} margin is dangerously thin`);
  if (breakEvenYear < 0) risks.push(`Model does not reach break-even within ${yearCount} years`);
  if (capacityUtilLastYear < 0.6 && sp.maxCapacity && sp.maxCapacity > 0)
    risks.push("Facility will be significantly underutilized");
  if (hasDebt && dscr < 1.0)
    risks.push("Debt service exceeds operating income — loan payments are not sustainable");
  if (philanthropyPct > 0.30)
    risks.push(`Philanthropy represents ${pct(philanthropyPct)} of revenue — unpredictable and hard to sustain`);
  if (publicRevenuePct > 0.70)
    risks.push("Over-reliance on public funding exposes the school to policy risk");
  if (lastReserve && lastReserve.reserveMonths < 1)
    risks.push(`No operating reserve built by Year ${lastYearNum}`);

  const biggestStrength =
    strengths.length > 0
      ? strengths[0]
      : "The model captures a complete financial picture — a great starting point.";

  const biggestRisk =
    risks.length > 0
      ? risks[0]
      : "No major red flags detected — continue refining assumptions as you gather real data.";

  const recommendations: Recommendation[] = [];

  if (y1NetMargin < 0) {
    recommendations.push({
      title: "Plan Year 1 Funding Gap",
      description: `Your model projects a ${fmt(Math.abs(y1.netIncome))} deficit in Year 1. Identify specific sources — startup grants, personal investment, or a line of credit — to cover this gap before launch.`,
      priority: "high",
    });
  }

  if (staffingCostPct > 0.65) {
    recommendations.push({
      title: "Reduce Staffing Cost Ratio",
      description: `At ${pct(staffingCostPct)} of revenue, payroll is above the 65% threshold most sustainable schools target. Consider adjusting student-teacher ratios, phasing in admin hires, or increasing class sizes slightly.`,
      priority: "high",
    });
  }

  if (revenuePerStudent < 7000) {
    recommendations.push({
      title: "Increase Per-Student Revenue",
      description: `At ${fmt(revenuePerStudent)} per student, revenue is below the sustainable threshold. Explore tuition increases, ESA/voucher programs in your state, or fee-based enrichment programs.`,
      priority: "high",
    });
  }

  if (hasDebt && dscr < 1.25) {
    recommendations.push({
      title: "Improve Debt Service Coverage",
      description: `Your DSCR of ${dscr.toFixed(2)}x is ${dscr < 1.0 ? "below 1.0x — you cannot cover debt payments from operations" : "below the 1.25x lenders typically require"}. Consider reducing the loan amount, extending the term, or increasing revenue before taking on this debt.`,
      priority: "high",
    });
  }

  if (philanthropyPct > 0.30) {
    recommendations.push({
      title: "Reduce Philanthropy Dependency",
      description: `Donations and grants represent ${pct(philanthropyPct)} of Year 1 revenue. Lenders prefer models where earned revenue drives sustainability. Build a path to reduce philanthropy dependency below 20% by Year 3.`,
      priority: "high",
    });
  }

  if (opexCostPct > 0.40) {
    recommendations.push({
      title: "Review Operating Cost Structure",
      description: `Operating costs represent ${pct(opexCostPct)} of revenue. Review each cost center — facility, student services, and administration — for potential savings. Shared space, volunteer programs, or phased services can help.`,
      priority: "medium",
    });
  }

  if (lastReserve && lastReserve.reserveMonths < 3) {
    recommendations.push({
      title: "Build a Cash Reserve",
      description: `By Year ${lastYearNum}, your projected reserve covers only ${lastReserve.reserveMonths.toFixed(1)} months of expenses. Lenders and accreditors look for 3-6 months. Focus on building surplus in early ${profitWord} years.`,
      priority: "medium",
    });
  }

  if (breakEvenYear > 1) {
    recommendations.push({
      title: "Accelerate Path to Break-Even",
      description: `Your model doesn't break even until Year ${breakEvenYear + 1}. Consider front-loading enrollment growth or phasing expenses to reach ${profitWord} sooner.`,
      priority: "medium",
    });
  }

  if (publicRevenuePct > 0.50) {
    recommendations.push({
      title: "Diversify Away from Public Funding",
      description: `Public funding represents ${pct(publicRevenuePct)} of revenue. While beneficial, changes in state legislation or charter authorization could materially impact your school. Develop supplementary revenue streams.`,
      priority: "medium",
    });
  }

  if (capacityUtilLastYear < 0.6 && sp.maxCapacity && sp.maxCapacity > 0) {
    recommendations.push({
      title: "Right-Size Your Facility",
      description: `By Year ${lastYearNum}, you'll only use ${pct(capacityUtilLastYear)} of your ${sp.maxCapacity}-student capacity. A smaller, less expensive facility could improve your cost structure.`,
      priority: "low",
    });
  }

  const schoolType = sp.schoolType || "";
  const fundingProfile = sp.fundingProfile || "";

  const isCharter = schoolType === "charter_school" || fundingProfile === "charter_public_funded";
  const isPrivate = schoolType === "private_school" || fundingProfile === "tuition_based";
  const isMicroschool = schoolType === "microschool";
  const isLearningPod = schoolType === "learning_pod";
  const isHomeschoolCoop = schoolType === "homeschool_coop";
  const isTutoringCenter = schoolType === "tutoring_center";
  const isSmallFormat = isMicroschool || isLearningPod || isHomeschoolCoop || isTutoringCenter;
  const isHybridFunding = fundingProfile === "hybrid_mixed";

  if (isCharter) {
    if (publicRevenuePct < 0.5) {
      recommendations.push({
        title: "Verify Charter Funding Assumptions",
        description: "Charter schools typically receive 50–80% of revenue from per-pupil public funding. Your model shows less than 50% from public sources — confirm your per-pupil allocation matches your state's formula and that you're capturing all eligible funding streams.",
        priority: "medium",
      });
    }
    if (y1.students < 100) {
      recommendations.push({
        title: "Charter Minimum Enrollment Warning",
        description: "Many charter authorizers expect schools to demonstrate viability at 100+ students. Your Year 1 enrollment may be viewed as too small for a sustainable charter. Consider whether your authorizer has minimum enrollment requirements.",
        priority: "medium",
      });
    }
    if (publicRevenuePct > 0.7) {
      recommendations.push({
        title: "Charter Revenue Concentration & Timing Risk",
        description: `${pct(publicRevenuePct)} of revenue comes from public per-pupil funding. Charter funding is typically disbursed on a state-defined schedule — ensure you have cash reserves or a line of credit to cover timing gaps between enrollment counts and payment receipt. Also consider diversifying into supplemental revenue (fees, grants) to reduce concentration risk.`,
        priority: "medium",
      });
    }
  }

  if (isPrivate) {
    const tuitionPct = y1.totalRevenue > 0 ? y1.tuitionRevenue / y1.totalRevenue : 0;
    if (tuitionPct < 0.6) {
      recommendations.push({
        title: "Strengthen Tuition Revenue Base",
        description: `Private schools typically derive 60–85% of revenue from tuition. At ${pct(tuitionPct)}, your tuition revenue share is lower than typical — ensure your pricing reflects the full cost of education and is competitive for your market.`,
        priority: "medium",
      });
    }
    if (tuitionPct > 0.5) {
      recommendations.push({
        title: "Plan for Tuition Collection & Discount Risk",
        description: `Private schools face collection risk from late payments, withdrawals, and financial aid shortfalls. With ${pct(tuitionPct)} of revenue from tuition, build a 5–10% bad debt reserve into your budget. Factor in tuition discount rates for merit/need-based aid and maintain clear enrollment contracts with payment terms.`,
        priority: "low",
      });
    }
    if (sp.isAccredited === false) {
      recommendations.push({
        title: "Consider Accreditation",
        description: "Your school is not currently accredited. Accreditation can increase family confidence, improve student transfer pathways, and open doors to certain grants and funding programs. Research regional accrediting bodies to understand the timeline and requirements.",
        priority: "low",
      });
    }
  }

  if (sp.hasManagementFee && sp.managementFeePercent && sp.managementFeePercent > 0) {
    const mgmtFeePct = sp.managementFeePercent;
    if (mgmtFeePct > 10) {
      recommendations.push({
        title: "Review Management Fee Level",
        description: `Your management fee of ${mgmtFeePct}% of revenue is above the typical 5–10% range for charter management organizations and back-office providers. Ensure the services received justify this rate and consider negotiating or comparing with alternative providers.`,
        priority: "medium",
      });
    }
    keyMetrics.push({
      name: "Management Fee (% of Revenue)",
      value: `${mgmtFeePct.toFixed(1)}%`,
      status: mgmtFeePct <= 7 ? "good" : mgmtFeePct <= 12 ? "warning" : "danger",
      interpretation:
        mgmtFeePct <= 7
          ? "Management fee is within the typical range for network-managed schools."
          : mgmtFeePct <= 12
            ? "Management fee is on the higher end — ensure the services provided justify the cost."
            : "Management fee is significantly above typical levels and materially impacts margins.",
    });
  }

  if (isMicroschool) {
    if (y1.students > 0 && revenuePerStudent < 8000) {
      recommendations.push({
        title: "Microschool Per-Student Revenue Check",
        description: `Microschools often have higher per-student costs due to smaller cohorts and specialized instruction. At ${fmt(revenuePerStudent)} per student, consider whether your pricing covers the premium instructional model and overhead absorption.`,
        priority: "medium",
      });
    }
    if (y1.students < 30 && staffingCostPct > 0.7) {
      recommendations.push({
        title: "Microschool Staffing Efficiency",
        description: `With ${y1.students} students and staffing at ${pct(staffingCostPct)} of revenue, the small cohort size is making it difficult to achieve efficient staffing ratios. Consider multi-age groupings or shared instructors to improve cost structure.`,
        priority: "medium",
      });
    }
  }

  if (isLearningPod) {
    if (y1.students > 0 && y1.students > 15) {
      recommendations.push({
        title: "Learning Pod Size Consideration",
        description: `Learning pods typically serve 5–15 students for personalized instruction. At ${y1.students} students, consider whether your model is structured as a single pod or multiple pods — this affects staffing needs and space requirements.`,
        priority: "low",
      });
    }
    if (y1.students > 0 && revenuePerStudent < 6000) {
      recommendations.push({
        title: "Learning Pod Per-Student Revenue",
        description: `At ${fmt(revenuePerStudent)} per student, ensure your pricing reflects the premium, small-group instruction model. Learning pods with fewer students need higher per-student revenue to cover facilitator costs and materials.`,
        priority: "medium",
      });
    }
  }

  if (isHomeschoolCoop) {
    if (y1.students > 0 && staffingCostPct > 0.65) {
      recommendations.push({
        title: "Co-Op Staffing Cost Check",
        description: `Homeschool co-ops typically rely on a mix of paid instructors and parent volunteers. At ${pct(staffingCostPct)} of revenue going to staffing, consider whether your co-op model can leverage parent-taught sessions to reduce costs.`,
        priority: "medium",
      });
    }
  }

  if (isTutoringCenter) {
    if (y1.students > 0 && revenuePerStudent < 3000) {
      recommendations.push({
        title: "Tutoring Center Revenue per Student",
        description: `At ${fmt(revenuePerStudent)} per student, verify your pricing structure. Tutoring centers often charge hourly or by session — ensure your annual per-student revenue projection reflects realistic session frequency and pricing.`,
        priority: "medium",
      });
    }
    const tutoringExpenseRows = (data.expenseRows as Array<{ enabled: boolean; category: string; amounts: number[]; driverType: string }>) || [];
    const tutoringOccCost = tutoringExpenseRows
      .filter(r => r.enabled && r.category === "occupancy_facility")
      .reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
    const tutoringOccPct = y1.totalRevenue > 0 ? tutoringOccCost / y1.totalRevenue : 0;
    if (tutoringOccPct > 0.25) {
      recommendations.push({
        title: "Tutoring Center Occupancy Costs",
        description: `Occupancy costs are ${pct(tutoringOccPct)} of revenue. Tutoring centers can often operate from shared or flexible spaces — consider whether a smaller footprint or shared-use arrangement could reduce facility costs.`,
        priority: "low",
      });
    }
  }

  if (isHybridFunding) {
    const revenueSourceCount = [y1.tuitionRevenue, y1.publicRevenue, y1.philanthropyRevenue].filter(v => v > 0).length;
    if (revenueSourceCount < 2) {
      recommendations.push({
        title: "Diversify Revenue Sources for Hybrid Model",
        description: "A hybrid funding model benefits from balancing tuition, public funding, and grants. Currently only one revenue source is active — adding a second stream improves financial resilience against policy changes or enrollment fluctuations.",
        priority: "medium",
      });
    }
    const tuitionPct = y1.totalRevenue > 0 ? y1.tuitionRevenue / y1.totalRevenue : 0;
    if (tuitionPct > 0 && publicRevenuePct > 0) {
      recommendations.push({
        title: "Manage Hybrid Funding Complexity",
        description: `Your model blends tuition (${pct(tuitionPct)}) with public funding (${pct(publicRevenuePct)}). Hybrid models add compliance complexity — ensure you're tracking each funding stream's reporting requirements separately, especially if public funds have restricted-use provisions.`,
        priority: "low",
      });
    }
  }

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];

    const occupancyCost = expenseRows
      .filter(r => r.enabled && r.category === "occupancy_facility")
      .reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
    const occupancyPct = y1.totalRevenue > 0 ? occupancyCost / y1.totalRevenue : 0;
    if (occupancyPct > 0.25) {
      recommendations.push({
        title: "Occupancy Costs Are High",
        description: `Facility and occupancy expenses represent ${pct(occupancyPct)} of Year 1 revenue. Most sustainable schools keep occupancy below 20–25%. Consider co-locating, negotiating lease terms, or exploring facility grants.`,
        priority: "high",
      });
    }

    const contractedNonPayroll = staffingRows.filter(
      r => r.employmentType === "contract" && !r.payrollLike
    );
    if (contractedNonPayroll.length > 0) {
      const contractedTotal = contractedNonPayroll.reduce((sum, r) => sum + r.fte * r.annualizedRate, 0);
      const contractedPct = y1.totalRevenue > 0 ? contractedTotal / y1.totalRevenue : 0;
      if (contractedPct > 0.15) {
        recommendations.push({
          title: "High Contracted Personnel Costs",
          description: `Contracted (non-payroll) personnel represent ${pct(contractedPct)} of revenue (${fmt(contractedTotal)}). This is unusual for schools — verify these aren't roles that should be full-time hires with benefits, which may be more cost-effective long-term.`,
          priority: "medium",
        });
      }
    }

    const founderRoles = staffingRows.filter(r => {
      const name = (r.roleName || "").toLowerCase();
      return name.includes("founder") ||
        name.includes("head of school") ||
        name.includes("executive director");
    });
    if (founderRoles.length > 0) {
      const founderComp = founderRoles.reduce((sum, r) => sum + r.fte * r.annualizedRate, 0);
      if (founderComp < 50000 && founderComp > 0) {
        recommendations.push({
          title: "Founder Compensation May Be Unsustainably Low",
          description: `Founder/leader compensation of ${fmt(founderComp)} is below market. While common in startup years, plan for competitive compensation by Year 2–3 to retain leadership and satisfy lender expectations.`,
          priority: "low",
        });
      }
    }

    const techCost = expenseRows
      .filter(r => r.enabled && r.category === "technology")
      .reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
    const techPerStudent = y1.students > 0 ? techCost / y1.students : 0;
    if (techPerStudent > 2000) {
      recommendations.push({
        title: "Technology Costs Per Student Are High",
        description: `Technology costs average ${fmt(techPerStudent)} per student. While tech-forward models may justify this, most schools target $500–$1,500 per student. Verify your hardware refresh cycle and software licensing costs are optimized.`,
        priority: "medium",
      });
    }

    const techLineItems = expenseRows.filter(r => r.enabled && r.category === "technology");
    const softwareItems = techLineItems.filter(r =>
      r.lineItem.toLowerCase().includes("software") || r.lineItem.toLowerCase().includes("saas") || r.lineItem.toLowerCase().includes("license")
    );
    if (softwareItems.length >= 4) {
      const softwareTotal = softwareItems.reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
      recommendations.push({
        title: "Software Fragmentation Risk",
        description: `You have ${softwareItems.length} separate software/licensing line items totaling ${fmt(softwareTotal)}. Consider bundling or evaluating overlapping platforms to reduce costs and simplify vendor management.`,
        priority: "low",
      });
    }

    const instructionalCost = expenseRows
      .filter(r => r.enabled && r.category === "instructional_program")
      .reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
    const instructionalPerStudent = y1.students > 0 ? instructionalCost / y1.students : 0;
    if (instructionalPerStudent > 3000) {
      recommendations.push({
        title: "Curriculum & Instructional Costs Are High",
        description: `Instructional program costs average ${fmt(instructionalPerStudent)} per student. Most schools target $500–$2,000 per student for curriculum, supplies, and assessments. Review whether premium curriculum is justified by your educational model and outcomes.`,
        priority: "medium",
      });
    }

    const travelItems = expenseRows.filter(r =>
      r.enabled && (r.lineItem.toLowerCase().includes("travel") || r.lineItem.toLowerCase().includes("field trip") || r.lineItem.toLowerCase().includes("transportation"))
    );
    if (travelItems.length > 0) {
      const travelTotal = travelItems.reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
      const travelPct = y1.totalRevenue > 0 ? travelTotal / y1.totalRevenue : 0;
      if (travelPct > 0.05) {
        recommendations.push({
          title: "Travel & Transportation Costs Are Elevated",
          description: `Travel-related expenses of ${fmt(travelTotal)} represent ${pct(travelPct)} of revenue. Most schools keep travel costs under 3–5% of revenue. Consider virtual alternatives or shared transportation arrangements.`,
          priority: "low",
        });
      }
    }

    const adminCost = expenseRows
      .filter(r => r.enabled && r.category === "administrative_general")
      .reduce((sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0);
    const programCost = instructionalCost + techCost;
    if (programCost > 0 && adminCost > programCost * 0.8) {
      recommendations.push({
        title: "Administrative Overhead Exceeds Program Spending",
        description: `Administrative costs (${fmt(adminCost)}) are approaching or exceeding program-related spending (${fmt(programCost)}). Lenders and boards typically expect the ratio to favor program delivery. Review marketing, professional development, and other admin line items for efficiency.`,
        priority: "medium",
      });
    }

    const totalDebt = capDebtRows
      .filter(r => r.enabled && r.isLoan)
      .reduce((sum, r) => sum + (r.loanPrincipal || 0), 0);
    if (totalDebt > 0 && y1.totalRevenue > 0) {
      const debtToRevenue = totalDebt / y1.totalRevenue;
      if (debtToRevenue > 3) {
        recommendations.push({
          title: "Debt Load Is Heavy Relative to Revenue",
          description: `Total debt of ${fmt(totalDebt)} is ${debtToRevenue.toFixed(1)}x Year 1 revenue. Lenders typically prefer total debt below 2–3x annual revenue for startup schools. Consider phasing capital expenditures or seeking grant funding for initial build-out.`,
          priority: "high",
        });
      }
    }

    const revenueRowsWithTiming = revenueRows.filter(r => r.enabled);
    const reimbursementRows = revenueRowsWithTiming.filter(
      r => r.paymentTiming === "arrears" || r.disbursementType === "reimbursement"
    );
    if (reimbursementRows.length > 0) {
      const reimbursementRevenue = reimbursementRows.reduce(
        (sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0
      );
      const reimbursementPct = y1.totalRevenue > 0 ? reimbursementRevenue / y1.totalRevenue : 0;
      if (reimbursementPct > 0.4) {
        recommendations.push({
          title: "Cash Flow Risk: Heavy Reimbursement Revenue",
          description: `${pct(reimbursementPct)} of Year 1 revenue (${fmt(reimbursementRevenue)}) comes from reimbursement-based sources with payment delays. This creates cash flow gaps — ensure you have a line of credit or startup reserves to cover 2–3 months of operating expenses while awaiting reimbursements.`,
          priority: "high",
        });
        risks.push(`${pct(reimbursementPct)} of revenue is reimbursement-based with payment delays`);
      }
    }

    const invoicedRows = revenueRowsWithTiming.filter(
      r => r.collectionMethod === "invoiced" || r.collectionMethod === "mixed"
    );
    if (invoicedRows.length > 0) {
      const avgCollectionRate = invoicedRows.reduce(
        (sum, r) => sum + (r.collectionRate ?? 95), 0
      ) / invoicedRows.length;
      if (avgCollectionRate < 95) {
        const invoicedRevenue = invoicedRows.reduce(
          (sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0
        );
        const uncollected = invoicedRevenue * (1 - avgCollectionRate / 100);
        recommendations.push({
          title: "Collection Rate Risk on Invoiced Revenue",
          description: `Your invoiced revenue lines average a ${avgCollectionRate.toFixed(0)}% collection rate, representing approximately ${fmt(uncollected)} in uncollected revenue. Consider tightening payment terms, requiring autopay enrollment, or building a bad debt reserve.`,
          priority: "medium",
        });
      }
    }

    const projectedGrants = revenueRowsWithTiming.filter(
      r => r.category === "grants_contributions" && r.grantStatus === "projected"
    );
    if (projectedGrants.length > 0) {
      const projectedAmount = projectedGrants.reduce(
        (sum, r) => sum + computeDriverValue(r.amounts, 0, r.driverType, y1.students), 0
      );
      const projectedPct = y1.totalRevenue > 0 ? projectedAmount / y1.totalRevenue : 0;
      if (projectedPct > 0.15) {
        recommendations.push({
          title: "Projected (Unconfirmed) Grant Revenue Is Significant",
          description: `${pct(projectedPct)} of Year 1 revenue (${fmt(projectedAmount)}) comes from projected but unconfirmed grants. Develop contingency plans in case these grants don't materialize, and prioritize grant applications to convert projected funding to confirmed.`,
          priority: "medium",
        });
      }
    }
  }

  const priorYear = data.priorYearSnapshot;
  if (sp.schoolStage === "operating_school" && priorYear) {
    if (priorYear.totalRevenue && priorYear.totalRevenue > 0 && y1.totalRevenue > 0) {
      const revChange = (y1.totalRevenue - priorYear.totalRevenue) / priorYear.totalRevenue;
      if (revChange > 0.3) {
        recommendations.push({
          title: "Revenue Projection Jump from Prior Year",
          description: `Year 1 projects ${pct(revChange)} revenue growth over last year's actual ${fmt(priorYear.totalRevenue)}. Growth over 30% in a single year requires clear justification — enrollment surge, new funding stream, or tuition increase.`,
          priority: "medium",
        });
      }
    }
    if (priorYear.totalExpenses && priorYear.totalExpenses > 0 && y1.totalExpenses > 0) {
      const expChange = (y1.totalExpenses - priorYear.totalExpenses) / priorYear.totalExpenses;
      if (expChange > 0.25) {
        recommendations.push({
          title: "Expense Growth Exceeds Prior Year Trend",
          description: `Year 1 expenses are ${pct(expChange)} above last year's actual ${fmt(priorYear.totalExpenses)}. Verify that planned staff additions, facility costs, or program expansions justify this increase.`,
          priority: "medium",
        });
      }
    }
    if (priorYear.endingCash !== undefined && priorYear.endingCash >= 0) {
      const priorReserveMonths = priorYear.totalExpenses && priorYear.totalExpenses > 0
        ? priorYear.endingCash / (priorYear.totalExpenses / 12)
        : 0;
      if (priorReserveMonths < 1.5) {
        risks.push(`Prior year ended with only ${priorReserveMonths.toFixed(1)} months of cash reserves`);
        recommendations.push({
          title: "Address Cash Reserve Deficit from Prior Year",
          description: `Last year ended with ${fmt(priorYear.endingCash)} in cash — only ${priorReserveMonths.toFixed(1)} months of expenses. Building reserves to 3+ months should be a priority. Consider a bridge line of credit while growing into ${profitWord}.`,
          priority: "high",
        });
      }
    }
    if (priorYear.endingEnrollment && priorYear.endingEnrollment > 0 && enrollmentByYear[0] > 0) {
      const enrollDelta = enrollmentByYear[0] - priorYear.endingEnrollment;
      const enrollGrowthFromPrior = enrollDelta / priorYear.endingEnrollment;
      if (enrollGrowthFromPrior > 0.25) {
        enrollmentGuidance.push(
          `Year 1 projects ${enrollmentByYear[0]} students, up ${Math.round(enrollGrowthFromPrior * 100)}% from last year's ${priorYear.endingEnrollment}. Verify your recruitment pipeline supports this growth.`,
        );
      }
    }
  }

  while (recommendations.length < 3) {
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Build a Cash Reserve",
        description:
          "Even with healthy projections, aim to build 3–6 months of operating expenses as a reserve fund. This signals financial maturity to lenders.",
        priority: "medium",
      });
    } else if (recommendations.length === 1) {
      recommendations.push({
        title: "Stress-Test Your Enrollment Assumptions",
        description:
          "Model what happens if enrollment comes in 20% below plan. Understanding your downside scenario helps you prepare contingency plans.",
        priority: "medium",
      });
    } else {
      recommendations.push({
        title: "Document Your Growth Strategy",
        description:
          "Lenders want to see not just numbers, but the marketing and enrollment plan behind them. Prepare a narrative that explains how you'll hit these targets.",
        priority: "low",
      });
    }
  }

  let lenderReadiness: ConsultantOutput["lenderReadiness"];
  let lenderReadinessExplanation: string;

  const goodMetrics = keyMetrics.filter(m => m.status === "good").length;
  const dangerMetrics = keyMetrics.filter(m => m.status === "danger").length;

  if (dangerMetrics === 0 && lastYearNetMargin >= 0.1 && breakEvenYear <= 1 && (!hasDebt || dscr >= 1.25)) {
    lenderReadiness = "Strong";
    lenderReadinessExplanation =
      `This model shows the financial fundamentals lenders look for: a clear path to ${profitWord}, controlled costs, sustainable revenue mix, and adequate debt coverage.`;
  } else if (dangerMetrics <= 1 && lastYearNetMargin >= 0) {
    lenderReadiness = "Needs Work";
    lenderReadinessExplanation =
      "The model has promise but a few areas need attention before approaching lenders. Address the recommendations above to strengthen your position.";
  } else {
    lenderReadiness = "Not Yet Ready";
    lenderReadinessExplanation =
      "Several key metrics fall outside lender comfort zones. Focus on the high-priority recommendations to build a more compelling financial case.";
  }

  const schoolName = sp.schoolName || "Your school";
  let executiveSummary: string;

  if (lenderReadiness === "Strong") {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue with a ${pct(lastYearNetMargin)} ${marginLabel}. The model shows a financially sustainable path with ${goodMetrics} of ${keyMetrics.length} key metrics in healthy range.`;
  } else if (lenderReadiness === "Needs Work") {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue, but the ${pct(lastYearNetMargin)} ${marginLabel} and ${dangerMetrics > 0 ? `${dangerMetrics} metric${dangerMetrics > 1 ? "s" : ""} requiring attention` : "thin margins"} suggest the model needs refinement before it's lender-ready.`;
  } else {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue, but ${dangerMetrics} of ${keyMetrics.length} key metrics are in the danger zone. Significant adjustments to revenue, costs, or enrollment are needed.`;
  }

  const sensitivityMatrix: SensitivityCell[] = [];
  const sensEnrollPcts = [-20, -10, 0, 10, 20];
  const sensTuitionPcts = [-20, -10, 0, 10, 20];
  const lastIdx = yearCount - 1;

  for (const ePct of sensEnrollPcts) {
    for (const tPct of sensTuitionPcts) {
      const adjEnroll = enrollmentByYear.map(s => Math.round(s * (1 + ePct / 100)));
      if (hasRowData) {
        const revenueRows = data.revenueRows || [];
        const staffingRows = data.staffingRows || [];
        const expenseRows = data.expenseRows || [];
        const capDebtRows = data.capitalAndDebtRows || [];
        const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
        const sensCostInflation = data.facilities?.generalCostInflation || 0;
        const adjRevRows = revenueRows.map(r => {
          if ((r.category === "tuition_and_fees" || r.category === "tuition_offsets") && r.driverType !== "percent_of_base") {
            return { ...r, amounts: r.amounts.map(a => a * (1 + tPct / 100)) };
          }
          return r;
        });
        const fins = computeAllYearsFromRows(adjEnroll, adjRevRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, tuitionTiers, sensCostInflation);
        sensitivityMatrix.push({ enrollmentPct: ePct, tuitionPct: tPct, netIncome: fins[lastIdx]?.netIncome || 0 });
      } else {
        const rev = data.revenue || {};
        const st = data.staffing || {};
        const fac = data.facilities || {};
        const adjRev = { ...rev, tuitionPerStudent: (rev.tuitionPerStudent || 0) * (1 + tPct / 100) };
        const fins = adjEnroll.map((s, idx) => computeYearFinancialsLegacy(idx, s, adjRev, st, fac, prorationFactor));
        sensitivityMatrix.push({ enrollmentPct: ePct, tuitionPct: tPct, netIncome: fins[lastIdx]?.netIncome || 0 });
      }
    }
  }

  let cashRunwayMonths = 0;
  {
    const startingCash = (data as Record<string, unknown>).priorYearSnapshot
      ? ((data as Record<string, unknown>).priorYearSnapshot as Record<string, number>)?.endingCash || 0
      : 0;
    let runningCash = startingCash;
    const totalMonths = yearCount * 12;
    cashRunwayMonths = totalMonths;
    for (let m = 0; m < totalMonths; m++) {
      const yIdx = Math.floor(m / 12);
      const yFin = yearFinancials[Math.min(yIdx, yearFinancials.length - 1)];
      const monthlyRev = (yFin?.totalRevenue || 0) / 12;
      const monthlyExp = (yFin?.totalExpenses || 0) / 12;
      runningCash += monthlyRev - monthlyExp;
      if (runningCash <= 0) {
        cashRunwayMonths = m + 1;
        break;
      }
    }
  }

  return {
    executiveSummary,
    biggestStrength,
    biggestRisk,
    recommendations: recommendations.slice(0, 5),
    lenderReadiness,
    lenderReadinessExplanation,
    keyMetrics,
    revenueComposition,
    costComposition,
    cumulativeFinancials,
    stressTests,
    sensitivityMatrix,
    cashRunwayMonths,
    enrollmentGuidance,
    generatedAt: new Date().toISOString(),
  };
}
