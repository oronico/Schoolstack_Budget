import { generateTopIssues } from "./decision-rules";
import { generateHealthSignals, type HealthSignal } from "./financial-health";
import { computeDaysCashOnHand, BENCHMARK_DCOH_GREEN, BENCHMARK_DCOH_AMBER } from "./workbook-helpers.js";
import { computeAnnualDebt } from "@workspace/finance";
import { detectUnusualAssumptions } from "./assumption-flags";

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
  facilityArrangementEndDate?: string;
  comparableMarketRent?: number;
  hasWrittenAgreement?: boolean;
  monthlyFacilityAllocation?: number;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
  debtIncluded?: boolean;
  facilityPhases?: FacilityPhase[];
}

interface FacilityPhase {
  id: string;
  ownershipType: string;
  startYear: number;
  endYear: number;
  monthlyRent?: number;
  annualRentEscalation?: number;
  postLeaseRenewalBump?: number;
  leaseExpirationMonth?: number;
  leaseExpirationYear?: number;
  isNNNLease?: boolean;
  nnnCamCharges?: number;
  nnnMaintenance?: number;
  nnnUtilities?: number;
  propertyTaxAnnual?: number;
  hasMortgage?: boolean;
  mortgageMonthlyPayment?: number;
  facilityArrangementEndDate?: string;
  comparableMarketRent?: number;
  hasWrittenAgreement?: boolean;
  monthlyFacilityAllocation?: number;
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
  retentionRate?: number;
  applicationsReceived?: number;
  waitlistCount?: number;
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
  staffingMode?: "fixed" | "ratio";
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
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
  jumpToStep?: number | null;
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

export interface LendingLabCriterion {
  name: string;
  status: "pass" | "warn" | "fail" | "na";
  threshold: string;
  actual: string;
  detail: string;
  jumpToStep?: number;
}

export interface PhilanthropyYearData {
  year: number;
  dependency: number;
  withinLimit: boolean;
}

export interface LendingLabAssessment {
  ready: boolean;
  score: number;
  criteriaCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  criteria: LendingLabCriterion[];
  summary: string;
  philanthropyByYear?: PhilanthropyYearData[];
  expenseAllocation?: {
    personnelPct: number;
    facilityPct: number;
    otherPct: number;
  };
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
  topIssues: import("./decision-rules").DecisionIssue[];
  healthSignals: HealthSignal[];
  lendingLabAssessment: LendingLabAssessment;
  assumptionFlags: import("./assumption-flags").AssumptionFlag[];
  generatedAt: string;
}

export interface YearFinancials {
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
  loanDebtService?: number;
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

const computeAnnualDebtService = computeAnnualDebt;

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number, escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number): number {
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
    case "per_new_student": return base * (newStudents ?? students);
    case "per_returning_student": return base * (returningStudents ?? 0);
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

function computeGradeBandRevenueConsultant(sp: SchoolProfile, y: number): number {
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

function hasGradeBandConsultant(sp?: SchoolProfile): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  return hasEnrollment && ((gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0);
}

function computeRevenueForYear(rows: RevenueRow[], yearIdx: number, students: number, tuitionTiers?: TuitionTier[], sp?: SchoolProfile): RevenueBreakdown {
  const rowValues = new Map<string, number>();

  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;

    if (row.id === "state_local_perpupil" && sp && hasGradeBandConsultant(sp)) {
      rowValues.set(row.id, computeGradeBandRevenueConsultant(sp, yearIdx));
    } else if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
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
      case "grants_contributions": case "philanthropy": philanthropy += val; break;
    }
  }

  return { total: tuition + publicFunding + philanthropy, tuition, publicFunding, philanthropy };
}

function computeEffectiveFte(r: StaffingRow, y: number, enrollment: number): number {
  if (r.startYear && (y + 1) < r.startYear) return 0;
  if (r.endYear && (y + 1) > r.endYear) return 0;
  if (r.staffingMode === "ratio" && r.studentRatio && r.studentRatio > 0) {
    let computed = enrollment / r.studentRatio;
    if (r.minFte !== undefined) computed = Math.max(computed, r.minFte);
    if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte);
    return Math.ceil(computed * 2) / 2;
  }
  return r.fte;
}

function computeStaffingBaseCost(rows: StaffingRow[], y?: number, enrollment?: number): number {
  let total = 0;
  for (const row of rows) {
    const effectiveFte = (y !== undefined && enrollment !== undefined)
      ? computeEffectiveFte(row, y, enrollment)
      : row.fte;
    const annualCost = effectiveFte * row.annualizedRate;
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

function computeExpensesForYear(rows: ExpenseRow[], yearIdx: number, students: number, totalRevenue: number, costInflationPct?: number, newStudents?: number, returningStudents?: number): { total: number; facilityCost: number } {
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
      val = computeDriverValue(row.amounts, yearIdx, row.driverType, students, row.escalationRate, fallback, newStudents, returningStudents);
    }
    total += val;
    if (row.category === "occupancy_facility") facilityCost += val;
  }
  return { total, facilityCost };
}

function computeCapDebtForYear(rows: CapitalDebtRow[], yearIdx: number, students: number): { total: number; loanOnly: number } {
  let total = 0;
  let loanOnly = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
      const term = row.loanTermYears || 0;
      if (term > 0 && yearIdx < term) {
        const ds = computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, term);
        total += ds;
        loanOnly += ds;
      }
    } else {
      total += computeDriverValue(row.amounts, yearIdx, row.driverType, students);
    }
  }
  return { total, loanOnly };
}

export interface FacilityOverlayResult {
  rent: number;
  nnnCam: number;
  nnnMaintenance: number;
  nnnUtilities: number;
  propertyTax: number;
  mortgage: number;
  estimatedBudget: number;
  total: number;
}

function computeSinglePhaseOverlay(
  phase: { ownershipType?: string; monthlyRent?: number; annualRentEscalation?: number; postLeaseRenewalBump?: number; leaseExpirationYear?: number; isNNNLease?: boolean; nnnCamCharges?: number; nnnMaintenance?: number; nnnUtilities?: number; propertyTaxAnnual?: number; hasMortgage?: boolean; mortgageMonthlyPayment?: number; facilityArrangementEndDate?: string; comparableMarketRent?: number; monthlyFacilityAllocation?: number; estimatedMonthlyFacilityBudget?: number; },
  entityType: string | undefined,
  openingYear: number | undefined,
  absoluteYearIndex: number,
  phaseRelativeYearIndex: number,
  pf: number,
): FacilityOverlayResult {
  const result: FacilityOverlayResult = { rent: 0, nnnCam: 0, nnnMaintenance: 0, nnnUtilities: 0, propertyTax: 0, mortgage: 0, estimatedBudget: 0, total: 0 };

  if (phase.ownershipType === "rent") {
    const baseRent = phase.monthlyRent || 0;
    const escalation = (phase.annualRentEscalation || 0) / 100;
    const renewalBump = (phase.postLeaseRenewalBump || 15) / 100;
    const currentYear = new Date().getFullYear();
    const projectionStartYear = Math.max(openingYear || currentYear, currentYear);
    const leaseEndYear = phase.leaseExpirationYear || (projectionStartYear + 99);
    const yearsUntilExpiration = leaseEndYear - projectionStartYear;

    let annualRent: number;
    if (absoluteYearIndex <= yearsUntilExpiration) {
      annualRent = baseRent * 12 * Math.pow(1 + escalation, phaseRelativeYearIndex);
    } else {
      const preRenewalRent = baseRent * Math.pow(1 + escalation, Math.max(0, yearsUntilExpiration - (absoluteYearIndex - phaseRelativeYearIndex)));
      const bumpedBase = preRenewalRent * (1 + renewalBump);
      const postRenewalYears = phaseRelativeYearIndex - Math.max(0, yearsUntilExpiration - (absoluteYearIndex - phaseRelativeYearIndex)) - 1;
      annualRent = bumpedBase * 12 * Math.pow(1 + escalation, Math.max(0, postRenewalYears));
    }
    result.rent = annualRent * pf;

    if (phase.isNNNLease) {
      const inflFactor = Math.pow(1.03, phaseRelativeYearIndex) * pf;
      result.nnnCam = (phase.nnnCamCharges || 0) * 12 * inflFactor;
      result.nnnMaintenance = (phase.nnnMaintenance || 0) * 12 * inflFactor;
      result.nnnUtilities = (phase.nnnUtilities || 0) * 12 * inflFactor;
    }
  }

  if (phase.ownershipType === "own") {
    if (entityType && entityType !== "nonprofit_501c3" && (phase.propertyTaxAnnual || 0) > 0) {
      result.propertyTax = (phase.propertyTaxAnnual || 0) * Math.pow(1.02, phaseRelativeYearIndex) * pf;
    }
    if (phase.hasMortgage && (phase.mortgageMonthlyPayment || 0) > 0) {
      result.mortgage = (phase.mortgageMonthlyPayment || 0) * 12 * pf;
    }
  }

  if (phase.ownershipType === "donated") {
    const marketRent = phase.comparableMarketRent || 0;
    if (marketRent > 0 && phase.facilityArrangementEndDate) {
      const endDate = new Date(phase.facilityArrangementEndDate);
      const currentYear = new Date().getFullYear();
      const projectionStartYear = Math.max(openingYear || currentYear, currentYear);
      const endYear = endDate.getFullYear();
      const yearsUntilEnd = endYear - projectionStartYear;
      if (yearsUntilEnd < 0) {
        result.rent = marketRent * 12 * pf;
      } else if (absoluteYearIndex >= yearsUntilEnd) {
        result.rent = marketRent * 12 * pf;
      }
    }
  }

  if (phase.ownershipType === "home_based") {
    const allocation = phase.monthlyFacilityAllocation || 0;
    if (allocation > 0) {
      result.estimatedBudget = allocation * 12 * pf;
    }
  }

  result.total = result.rent + result.nnnCam + result.nnnMaintenance + result.nnnUtilities + result.propertyTax + result.mortgage + result.estimatedBudget;
  return result;
}

export function computeSchoolProfileFacilityOverlay(
  sp: SchoolProfile,
  yearIndex: number,
  prorationFactor: number,
): FacilityOverlayResult {
  const zero: FacilityOverlayResult = { rent: 0, nnnCam: 0, nnnMaintenance: 0, nnnUtilities: 0, propertyTax: 0, mortgage: 0, estimatedBudget: 0, total: 0 };

  if (!sp.locationSecured) {
    const pf = yearIndex === 0 ? prorationFactor : 1;
    const est = (sp.estimatedMonthlyFacilityBudget || 0) * 12 * pf;
    return { ...zero, estimatedBudget: est, total: est };
  }

  const pf = yearIndex === 0 ? prorationFactor : 1;

  if (sp.facilityPhases && sp.facilityPhases.length > 0) {
    const modelYear = yearIndex + 1;
    const activePhase = sp.facilityPhases.find(p => modelYear >= p.startYear && modelYear <= p.endYear);
    if (!activePhase) return zero;
    const phaseRelativeYearIndex = yearIndex - (activePhase.startYear - 1);
    return computeSinglePhaseOverlay(activePhase, sp.entityType, sp.openingYear, yearIndex, phaseRelativeYearIndex, pf);
  }

  return computeSinglePhaseOverlay(sp, sp.entityType, sp.openingYear, yearIndex, yearIndex, pf);
}

export function hasSchoolProfileFacilityData(sp?: SchoolProfile): boolean {
  if (!sp) return false;
  if (sp.locationSecured === false && (sp.estimatedMonthlyFacilityBudget || 0) > 0) return true;
  if (sp.facilityPhases && sp.facilityPhases.length > 0 && sp.locationSecured === true) return true;
  if (sp.locationSecured === true && sp.ownershipType === "rent" && (sp.monthlyRent || 0) > 0) return true;
  if (sp.locationSecured === true && sp.ownershipType === "own") {
    const hasPropertyTax = (sp.propertyTaxAnnual || 0) > 0;
    const hasMortgage = sp.hasMortgage && (sp.mortgageMonthlyPayment || 0) > 0;
    if (hasPropertyTax || hasMortgage) return true;
  }
  if (sp.locationSecured === true && sp.ownershipType === "donated") {
    return true;
  }
  if (sp.locationSecured === true && sp.ownershipType === "home_based") {
    return (sp.monthlyFacilityAllocation || 0) > 0;
  }
  return false;
}

function localNewStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

function localReturningStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

export function computeAllYearsFromRows(
  enrollmentByYear: number[],
  revenueRows: RevenueRow[],
  staffingRows: StaffingRow[],
  expenseRows: ExpenseRow[],
  capDebtRows: CapitalDebtRow[],
  salaryEscRate: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
  costInflationPct?: number,
  schoolProfile?: SchoolProfile,
  retentionRate?: number,
): YearFinancials[] {
  const spIsFacilityAuthority = hasSchoolProfileFacilityData(schoolProfile);
  const effectiveExpenseRows = spIsFacilityAuthority
    ? expenseRows.map(r => r.category === "occupancy_facility" ? { ...r, enabled: false } : r)
    : expenseRows;

  return enrollmentByYear.map((students, yearIdx) => {
    const pf = yearIdx === 0 ? prorationFactor : 1;
    const salaryEsc = Math.pow(1 + salaryEscRate, yearIdx);
    const baseCost = computeStaffingBaseCost(staffingRows, yearIdx, students);
    const totalStaffingCost = baseCost * salaryEsc * pf;

    const rev = computeRevenueForYear(revenueRows, yearIdx, students, tuitionTiers, schoolProfile);
    const rr = retentionRate ?? 85;
    const exp = computeExpensesForYear(effectiveExpenseRows, yearIdx, students, rev.total, costInflationPct, localNewStudents(enrollmentByYear, rr, yearIdx), localReturningStudents(enrollmentByYear, rr, yearIdx));
    const capDebt = computeCapDebtForYear(capDebtRows, yearIdx, students);

    let facilityOverlay = 0;
    if (schoolProfile && spIsFacilityAuthority) {
      const overlay = computeSchoolProfileFacilityOverlay(schoolProfile, yearIdx, prorationFactor);
      facilityOverlay = overlay.total;
    }

    const totalOpex = exp.total + capDebt.total + facilityOverlay;
    const facilityCost = exp.facilityCost + facilityOverlay;
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
      facilityCost,
      totalOpex,
      debtService: capDebt.total,
      loanDebtService: capDebt.loanOnly,
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
  schoolProfile?: SchoolProfile,
  retentionRate?: number,
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

  const financials = computeAllYearsFromRows(adjEnrollment, adjRevRows, adjStaffRows, adjExpRows, capDebtRows, salaryEscRate, prorationFactor, mods.tuitionTiers, costInflationPct, schoolProfile, retentionRate);
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

function assessLendingLabReadiness(
  data: ModelData,
  yearFinancials: YearFinancials[],
  enrollmentByYear: number[],
): LendingLabAssessment {
  const sp = data.schoolProfile || {};
  const staffingRows = (data.staffingRows || []) as StaffingRow[];
  const revenueRows = (data.revenueRows || []) as RevenueRow[];
  const expenseRows = (data.expenseRows || []) as ExpenseRow[];
  const capDebtRows = (data.capitalAndDebtRows || []) as CapitalDebtRow[];
  const hasRowData = staffingRows.length > 0 || revenueRows.length > 0 || expenseRows.length > 0;
  const y1 = yearFinancials[0];
  const criteria: LendingLabCriterion[] = [];

  // --- 1. Leader Compensation ---
  if (!hasRowData || staffingRows.length === 0) {
    criteria.push({
      name: "Leader Compensation",
      status: "na",
      threshold: "Leader must draw a salary",
      actual: "No staffing data entered",
      detail: "Not enough data — complete the Staffing step to evaluate this.",
      jumpToStep: 4,
    });
  } else {
    const leaderRow = staffingRows.find(
      r => r.functionCategory === "school_leadership" && r.annualizedRate > 0,
    );
    if (leaderRow) {
      criteria.push({
        name: "Leader Compensation",
        status: "pass",
        threshold: "Leader must draw a salary",
        actual: `${fmt(leaderRow.annualizedRate)}/year`,
        detail: "School leader draws a salary. This is a fundamental requirement for sustainable operations.",
      });
    } else {
      criteria.push({
        name: "Leader Compensation",
        status: "fail",
        threshold: "Leader must draw a salary",
        actual: "No leader salary found",
        detail: "Every school leader must draw a salary. Operating without compensation is not sustainable and signals financial distress to lenders.",
        jumpToStep: 4,
      });
    }
  }

  // --- 2. Philanthropy Dependency ---
  const philanthropyByYear: PhilanthropyYearData[] = [];
  if (yearFinancials.length === 0 || y1.totalRevenue === 0) {
    criteria.push({
      name: "Philanthropy Dependency",
      status: "na",
      threshold: "≤25% in every year, decreasing over time",
      actual: "No revenue data",
      detail: "Not enough data — complete the Revenue step to evaluate this.",
      jumpToStep: 3,
    });
  } else {
    let philStatus: "pass" | "warn" | "fail" = "pass";
    let philDetail = "";
    let anyExceeds25 = false;
    let isDecreasing = true;

    for (let i = 0; i < yearFinancials.length; i++) {
      const yf = yearFinancials[i];
      const dep = yf.totalRevenue > 0 ? (yf.philanthropyRevenue / yf.totalRevenue) * 100 : 0;
      const within = dep <= 25;
      philanthropyByYear.push({ year: i + 1, dependency: Math.round(dep * 10) / 10, withinLimit: within });
      if (!within) anyExceeds25 = true;
      if (i > 0) {
        const prevDep = yearFinancials[i - 1].totalRevenue > 0
          ? yearFinancials[i - 1].philanthropyRevenue / yearFinancials[i - 1].totalRevenue
          : 0;
        const curDep = yf.totalRevenue > 0 ? yf.philanthropyRevenue / yf.totalRevenue : 0;
        if (curDep >= prevDep && prevDep > 0) isDecreasing = false;
      }
    }

    if (anyExceeds25) {
      philStatus = "fail";
      const worstYear = philanthropyByYear.reduce((a, b) => a.dependency > b.dependency ? a : b);
      philDetail = `Philanthropy dependency reaches ${worstYear.dependency}% in Year ${worstYear.year}, exceeding the 25% maximum. `;
    }

    if (!isDecreasing && philanthropyByYear.some(p => p.dependency > 0)) {
      if (philStatus !== "fail") philStatus = "warn";
      philDetail += "Philanthropy dependency does not decrease over the projection period. ";
    }

    const maxCap = sp.maxCapacity || 0;
    const fullEnrollmentYearIdx = maxCap > 0
      ? enrollmentByYear.findIndex(e => e >= maxCap)
      : -1;
    const checkYearIdx = fullEnrollmentYearIdx >= 0 ? fullEnrollmentYearIdx : yearFinancials.length - 1;
    const checkYf = yearFinancials[checkYearIdx];

    if (checkYf && checkYf.totalRevenue > 0 && checkYf.philanthropyRevenue > 0) {
      const niWithoutPhil = checkYf.netIncome + checkYf.philanthropyRevenue - checkYf.philanthropyRevenue;
      const revenueWithoutPhil = checkYf.totalRevenue - checkYf.philanthropyRevenue;
      const netWithoutGrants = revenueWithoutPhil - checkYf.totalExpenses;
      if (netWithoutGrants < 0) {
        if (philStatus !== "fail") philStatus = "fail";
        const yearLabel = fullEnrollmentYearIdx >= 0
          ? `at full enrollment (Year ${checkYearIdx + 1})`
          : `in the final projected year (Year ${checkYearIdx + 1})`;
        philDetail += `Without philanthropy revenue, the school shows a ${fmt(Math.abs(netWithoutGrants))} shortfall ${yearLabel}. Your budget must balance on earned revenue alone at capacity. `;
        if (fullEnrollmentYearIdx < 0) {
          philDetail += "Your model does not reach full enrollment within the projection window. ";
        }
      }
    }

    philDetail += "Fundraising is healthy and encouraged. But your school must be able to keep the lights on without it. At full enrollment, your budget should balance on earned revenue alone. Grants should fund growth and mission extras, not basic operations.";

    const y1Dep = philanthropyByYear[0]?.dependency ?? 0;
    criteria.push({
      name: "Philanthropy Dependency",
      status: philStatus,
      threshold: "≤25% in every year, decreasing over time",
      actual: `${y1Dep}% in Year 1`,
      detail: philDetail.trim(),
      jumpToStep: 3,
    });
  }

  // --- 3. Personnel Cost Ratio ---
  if (y1.totalExpenses === 0) {
    criteria.push({
      name: "Personnel Cost Ratio",
      status: "na",
      threshold: "≤60% of total expenses",
      actual: "No expense data",
      detail: "Not enough data — complete the Staffing and Expenses steps to evaluate this.",
      jumpToStep: 4,
    });
  } else {
    let worstPersRatio = 0;
    let worstPersYear = 1;
    let anyExceeds60 = false;
    let anyAbove55 = false;
    for (let i = 0; i < yearFinancials.length; i++) {
      const yf = yearFinancials[i];
      if (yf.totalExpenses > 0) {
        const ratio = yf.totalStaffingCost / yf.totalExpenses;
        if (ratio > worstPersRatio) { worstPersRatio = ratio; worstPersYear = i + 1; }
        if (ratio > 0.60) anyExceeds60 = true;
        if (ratio > 0.55) anyAbove55 = true;
      }
    }
    const pctStr = `${(worstPersRatio * 100).toFixed(1)}%`;
    if (anyExceeds60) {
      criteria.push({
        name: "Personnel Cost Ratio",
        status: "fail",
        threshold: "≤60% of total expenses",
        actual: `${pctStr} in Year ${worstPersYear}`,
        detail: "Personnel costs exceed 60% of total expenses. This leaves too little room for facilities, curriculum, and contingency. A well-run school allocates no more than 60 cents of every dollar spent to people.",
        jumpToStep: 4,
      });
    } else if (anyAbove55) {
      criteria.push({
        name: "Personnel Cost Ratio",
        status: "warn",
        threshold: "≤60% of total expenses (ideal <55%)",
        actual: `${pctStr} in Year ${worstPersYear}`,
        detail: "Personnel costs are within range but approaching the 60% ceiling.",
        jumpToStep: 4,
      });
    } else {
      criteria.push({
        name: "Personnel Cost Ratio",
        status: "pass",
        threshold: "≤60% of total expenses (ideal <55%)",
        actual: `${pctStr} in Year ${worstPersYear}`,
        detail: "Personnel costs are well within the target range, leaving healthy room for facilities, curriculum, and operations.",
      });
    }
  }

  // --- 4. Facility Cost Ratio ---
  if (y1.totalExpenses === 0) {
    criteria.push({
      name: "Facility Cost Ratio",
      status: "na",
      threshold: "≤25% of total expenses",
      actual: "No expense data",
      detail: "Not enough data — complete the Expenses and Facilities steps to evaluate this.",
      jumpToStep: 5,
    });
  } else {
    let worstFacRatio = 0;
    let worstFacYear = 1;
    let anyExceeds25 = false;
    let anyAbove20 = false;
    for (let i = 0; i < yearFinancials.length; i++) {
      const yf = yearFinancials[i];
      if (yf.totalExpenses > 0) {
        const ratio = yf.facilityCost / yf.totalExpenses;
        if (ratio > worstFacRatio) { worstFacRatio = ratio; worstFacYear = i + 1; }
        if (ratio > 0.25) anyExceeds25 = true;
        if (ratio > 0.20) anyAbove20 = true;
      }
    }
    const pctStr = `${(worstFacRatio * 100).toFixed(1)}%`;
    if (anyExceeds25) {
      criteria.push({
        name: "Facility Cost Ratio",
        status: "fail",
        threshold: "≤25% of total expenses",
        actual: `${pctStr} in Year ${worstFacYear}`,
        detail: "Facility costs exceed 25% of total expenses. Your building is consuming too large a share of your budget. Use SchoolStack Space to model lower-cost alternatives.",
        jumpToStep: 5,
      });
    } else if (anyAbove20) {
      criteria.push({
        name: "Facility Cost Ratio",
        status: "warn",
        threshold: "≤25% of total expenses (ideal <20%)",
        actual: `${pctStr} in Year ${worstFacYear}`,
        detail: "Facility costs are within range but above the ideal 20% target. Consider using SchoolStack Space (space.schoolstack.ai) to evaluate alternative properties.",
        jumpToStep: 5,
      });
    } else {
      criteria.push({
        name: "Facility Cost Ratio",
        status: "pass",
        threshold: "≤25% of total expenses (ideal <20%)",
        actual: `${pctStr} in Year ${worstFacYear}`,
        detail: "Facility costs are well within the target range, leaving healthy budget room for personnel and programming.",
      });
    }
  }

  // --- 5. DSCR ---
  const readinessLoanDS = y1.loanDebtService ?? y1.debtService;
  const hasLoan = capDebtRows.some(r => r.enabled && r.isLoan);
  if (!hasLoan) {
    criteria.push({
      name: "Debt Service Coverage",
      status: "na",
      threshold: "≥1.15x DSCR",
      actual: "No loans in model",
      detail: "No debt in your model, so DSCR is not applicable. This criterion only applies when you include a loan.",
    });
  } else if (readinessLoanDS <= 0) {
    criteria.push({
      name: "Debt Service Coverage",
      status: "na",
      threshold: "≥1.15x DSCR",
      actual: "No debt service calculated",
      detail: "Loan exists but no debt service payments are calculated. Verify your loan terms.",
      jumpToStep: 6,
    });
  } else {
    const dscrVal = (y1.netIncome + readinessLoanDS) / readinessLoanDS;
    const dscrStr = `${dscrVal.toFixed(2)}x`;
    if (dscrVal < 1.15) {
      criteria.push({
        name: "Debt Service Coverage",
        status: "fail",
        threshold: "≥1.15x DSCR",
        actual: dscrStr,
        detail: `DSCR of ${dscrStr} is below the 1.15x minimum. The school's operating income does not sufficiently cover loan payments. Increase revenue, reduce expenses, or restructure debt terms.`,
        jumpToStep: 6,
      });
    } else if (dscrVal < 1.30) {
      criteria.push({
        name: "Debt Service Coverage",
        status: "warn",
        threshold: "≥1.15x DSCR (ideal ≥1.30x)",
        actual: dscrStr,
        detail: "DSCR meets minimum but has limited cushion. Consider strengthening operating margins for more financial breathing room.",
        jumpToStep: 6,
      });
    } else {
      criteria.push({
        name: "Debt Service Coverage",
        status: "pass",
        threshold: "≥1.15x DSCR (ideal ≥1.30x)",
        actual: dscrStr,
        detail: `DSCR of ${dscrStr} provides strong debt service coverage with healthy cushion.`,
      });
    }
  }

  // --- 6. Net Margin Trajectory ---
  if (yearFinancials.length < 3) {
    criteria.push({
      name: "Net Margin Trajectory",
      status: "na",
      threshold: "≥0% by Year 3, ≥5% by Year 5",
      actual: "Insufficient projection years",
      detail: "Not enough projection years to evaluate net margin trajectory.",
    });
  } else {
    const y3 = yearFinancials[2];
    const y3Margin = y3.totalRevenue > 0 ? y3.netIncome / y3.totalRevenue : 0;
    const maxCap = sp.maxCapacity || 0;
    const fullYearIdx = maxCap > 0
      ? enrollmentByYear.findIndex(e => e >= maxCap)
      : -1;
    const targetYearIdx = fullYearIdx >= 0 && fullYearIdx < yearFinancials.length
      ? fullYearIdx
      : yearFinancials.length - 1;
    const targetYf = yearFinancials[targetYearIdx];
    const targetMargin = targetYf.totalRevenue > 0 ? targetYf.netIncome / targetYf.totalRevenue : 0;

    if (y3Margin < 0) {
      criteria.push({
        name: "Net Margin Trajectory",
        status: "fail",
        threshold: "≥0% by Year 3, ≥5% by Year 5",
        actual: `${(y3Margin * 100).toFixed(1)}% in Year 3`,
        detail: `Year 3 net margin is ${(y3Margin * 100).toFixed(1)}%, still negative. The school must reach at least break-even by Year 3 to demonstrate a viable business model.`,
        jumpToStep: 7,
      });
    } else if (targetMargin < 0.05) {
      criteria.push({
        name: "Net Margin Trajectory",
        status: "warn",
        threshold: "≥0% by Year 3, ≥5% by Year 5",
        actual: `${(y3Margin * 100).toFixed(1)}% in Y3, ${(targetMargin * 100).toFixed(1)}% in Y${targetYearIdx + 1}`,
        detail: `Year 3 is break-even or better, but Year ${targetYearIdx + 1} margin of ${(targetMargin * 100).toFixed(1)}% is below the 5% target. Continue growing revenue relative to expenses.`,
      });
    } else {
      criteria.push({
        name: "Net Margin Trajectory",
        status: "pass",
        threshold: "≥0% by Year 3, ≥5% by Year 5",
        actual: `${(y3Margin * 100).toFixed(1)}% in Y3, ${(targetMargin * 100).toFixed(1)}% in Y${targetYearIdx + 1}`,
        detail: "Net margin trajectory is healthy, reaching break-even by Year 3 and growing to a sustainable level.",
      });
    }
  }

  // --- 7. Minimum Enrollment ---
  if (y1.students === 0) {
    criteria.push({
      name: "Minimum Enrollment",
      status: "na",
      threshold: "≥10 students in Year 1",
      actual: "No enrollment data",
      detail: "Not enough data — complete the Enrollment step to evaluate this.",
      jumpToStep: 2,
    });
  } else if (y1.students < 10) {
    criteria.push({
      name: "Minimum Enrollment",
      status: "fail",
      threshold: "≥10 students in Year 1",
      actual: `${y1.students} students`,
      detail: `Year 1 enrollment of ${y1.students} students is below the minimum viability threshold of 10. A school needs a baseline cohort to sustain basic operations.`,
      jumpToStep: 2,
    });
  } else {
    criteria.push({
      name: "Minimum Enrollment",
      status: "pass",
      threshold: "≥10 students in Year 1",
      actual: `${y1.students} students`,
      detail: `Year 1 enrollment of ${y1.students} students meets the minimum viability threshold.`,
    });
  }

  // --- 8. Revenue Per Pupil ---
  if (y1.students === 0 || y1.totalRevenue === 0) {
    criteria.push({
      name: "Revenue Per Pupil",
      status: "na",
      threshold: "≥$5,000 per pupil",
      actual: "No data",
      detail: "Not enough data — complete the Enrollment and Revenue steps to evaluate this.",
      jumpToStep: 3,
    });
  } else {
    let worstRpp = Infinity;
    let worstRppYear = 1;
    let anyBelow5k = false;
    for (let i = 0; i < yearFinancials.length; i++) {
      const yf = yearFinancials[i];
      if (yf.students > 0) {
        const rpp = yf.totalRevenue / yf.students;
        if (rpp < worstRpp) { worstRpp = rpp; worstRppYear = i + 1; }
        if (rpp < 5000) anyBelow5k = true;
      }
    }
    if (worstRpp === Infinity) worstRpp = 0;
    if (anyBelow5k) {
      criteria.push({
        name: "Revenue Per Pupil",
        status: "fail",
        threshold: "≥$5,000 per pupil",
        actual: `${fmt(worstRpp)} in Year ${worstRppYear}`,
        detail: `Revenue per pupil of ${fmt(worstRpp)} in Year ${worstRppYear} is below the $5,000 minimum. Below this threshold, the school cannot sustain basic operations.`,
        jumpToStep: 3,
      });
    } else {
      criteria.push({
        name: "Revenue Per Pupil",
        status: "pass",
        threshold: "≥$5,000 per pupil",
        actual: `${fmt(worstRpp)} in Year ${worstRppYear}`,
        detail: `Revenue per pupil of ${fmt(worstRpp)} meets the minimum threshold for sustainable operations.`,
      });
    }
  }

  // --- Compute totals ---
  const evaluated = criteria.filter(c => c.status !== "na");
  const passCount = evaluated.filter(c => c.status === "pass").length;
  const warnCount = evaluated.filter(c => c.status === "warn").length;
  const failCount = evaluated.filter(c => c.status === "fail").length;
  const criteriaCount = evaluated.length;
  const ready = failCount === 0 && criteriaCount > 0;
  const score = criteriaCount > 0 ? Math.round((passCount / criteriaCount) * 100) : 0;

  // Expense allocation
  let expenseAllocation: LendingLabAssessment["expenseAllocation"];
  if (y1.totalExpenses > 0) {
    const persPct = Math.round((y1.totalStaffingCost / y1.totalExpenses) * 1000) / 10;
    const facPct = Math.round((y1.facilityCost / y1.totalExpenses) * 1000) / 10;
    expenseAllocation = {
      personnelPct: persPct,
      facilityPct: facPct,
      otherPct: Math.round((100 - persPct - facPct) * 10) / 10,
    };
  }

  let summary: string;
  if (criteriaCount === 0) {
    summary = "Not enough data to assess Lending Lab readiness. Complete more wizard steps to get your assessment.";
  } else if (ready && score === 100) {
    summary = "Your model meets all Lending Lab criteria with no flags. You're in strong shape to apply.";
  } else if (ready) {
    summary = `Your model meets all Lending Lab criteria. ${warnCount} area${warnCount > 1 ? "s" : ""} could be strengthened but won't prevent an application.`;
  } else {
    summary = `${failCount} area${failCount > 1 ? "s" : ""} need${failCount === 1 ? "s" : ""} attention before applying. Most founders need 2–3 iterations to get here. Adjust your model and the assessment updates automatically.`;
  }

  return {
    ready,
    score,
    criteriaCount,
    passCount,
    warnCount,
    failCount,
    criteria,
    summary,
    philanthropyByYear: philanthropyByYear.length > 0 ? philanthropyByYear : undefined,
    expenseAllocation,
  };
}

export function computeYearFinancialsFromData(rawData: Record<string, unknown>): YearFinancials[] {
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
    en.year1 || 0, en.year2 || 0, en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];
  const ceRR = en.retentionRate ?? 85;
  const debtIncluded = sp.debtIncluded !== false;

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
    const costInflationPct = data.facilities?.generalCostInflation || 0;
    const effectiveCapDebtRows = debtIncluded ? capDebtRows : capDebtRows.filter(r => !r.isLoan);
    return computeAllYearsFromRows(
      enrollmentByYear, revenueRows, staffingRows, expenseRows, effectiveCapDebtRows,
      salaryEscRate, prorationFactor, data.tuitionTiers, costInflationPct, sp, ceRR,
    );
  } else {
    const rev = data.revenue || {};
    const st = data.staffing || {};
    const fac = data.facilities || {};
    const spIsAuth = hasSchoolProfileFacilityData(sp);
    const effectiveFac = spIsAuth ? { ...fac, monthlyRent: 0, annualRentIncrease: 0 } : fac;
    return enrollmentByYear.map((students, idx) => {
      const base = computeYearFinancialsLegacy(idx, students, rev, st, effectiveFac, prorationFactor);
      if (spIsAuth) {
        const overlay = computeSchoolProfileFacilityOverlay(sp, idx, prorationFactor);
        if (overlay.total > 0) {
          base.facilityCost += overlay.total;
          base.totalOpex += overlay.total;
          base.totalExpenses += overlay.total;
          base.netIncome -= overlay.total;
          base.netMargin = base.totalRevenue > 0 ? base.netIncome / base.totalRevenue : 0;
        }
      }
      return base;
    });
  }
}

export async function runConsultantEngine(rawData: Record<string, unknown>): Promise<ConsultantOutput> {
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
  const ceRR = en.retentionRate ?? 85;

  let yearFinancials: YearFinancials[];

  const tuitionTiers = data.tuitionTiers;

  const debtIncluded = sp.debtIncluded !== false;

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = (data.facilities?.annualSalaryIncrease || 0) / 100;
    const costInflationPct = data.facilities?.generalCostInflation || 0;

    // When debtIncluded is false, pass only non-loan capital rows
    const effectiveCapDebtRows = debtIncluded
      ? capDebtRows
      : capDebtRows.filter(r => !r.isLoan);

    yearFinancials = computeAllYearsFromRows(
      enrollmentByYear, revenueRows, staffingRows, expenseRows, effectiveCapDebtRows,
      salaryEscRate, prorationFactor, tuitionTiers, costInflationPct, sp, ceRR,
    );
  } else {
    const rev = data.revenue || {};
    const st = data.staffing || {};
    const fac = data.facilities || {};
    const spIsAuth = hasSchoolProfileFacilityData(sp);
    const effectiveFac = spIsAuth ? { ...fac, monthlyRent: 0, annualRentIncrease: 0 } : fac;
    yearFinancials = enrollmentByYear.map((students, idx) => {
      const base = computeYearFinancialsLegacy(idx, students, rev, st, effectiveFac, prorationFactor);
      if (spIsAuth) {
        const overlay = computeSchoolProfileFacilityOverlay(sp, idx, prorationFactor);
        if (overlay.total > 0) {
          base.facilityCost += overlay.total;
          base.totalOpex += overlay.total;
          base.totalExpenses += overlay.total;
          base.netIncome -= overlay.total;
          base.netMargin = base.totalRevenue > 0 ? base.netIncome / base.totalRevenue : 0;
        }
      }
      return base;
    });
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
  const y1LoanDS = y1.loanDebtService ?? y1.debtService;
  const hasDebt = y1LoanDS > 0;
  const dscr = hasDebt && y1.netIncome !== undefined
    ? (y1.netIncome + y1LoanDS) / y1LoanDS
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

  const retentionRate = en.retentionRate;
  const applicationsReceived = en.applicationsReceived || 0;
  const waitlistCount = en.waitlistCount || 0;

  if (retentionRate !== undefined && retentionRate < 80) {
    enrollmentGuidance.push(
      `Year-over-year retention of ${retentionRate}% is below 80%, which means you'll need to recruit more new families each year to hit your enrollment targets. Understanding what's driving attrition, and building a plan to improve it, will make your projections more achievable and your model more credible.`,
    );
  }

  const pipeline = applicationsReceived + waitlistCount;
  const y1Projected = enrollmentByYear[0] || 0;

  if (pipeline > 0 && y1Projected > 0 && pipeline >= y1Projected) {
    const coveragePct = Math.round((pipeline / y1Projected) * 100);
    enrollmentGuidance.push(
      `Strong demand signal: ${pipeline} applications + waitlist entries cover ${coveragePct}% of Year 1 projected enrollment (${y1Projected} seats). Your projections are backed by real demand, which is exactly the kind of evidence that makes a model credible.`,
    );
  }

  if (y1Projected > 0) {
    const isOperating = sp.schoolStage === "operating_school";
    const retainedStudents = (isOperating && retentionRate !== undefined && retentionRate > 0 && (sp.currentStudents || 0) > 0)
      ? Math.round((sp.currentStudents || 0) * retentionRate / 100)
      : 0;
    const evidencedStudents = retainedStudents + pipeline;
    if (evidencedStudents > 0 && y1Projected > evidencedStudents) {
      const gap = y1Projected - evidencedStudents;
      const parts: string[] = [];
      if (retainedStudents > 0) parts.push(`${retainedStudents} retained`);
      if (pipeline > 0) parts.push(`${pipeline} applications/waitlist`);
      enrollmentGuidance.push(
        `Projected Year 1 enrollment (${y1Projected}) exceeds your documented pipeline of ${evidencedStudents} students (${parts.join(" + ")}) by ${gap}. To make these projections achievable, build out your recruitment strategy for the remaining ${gap} seats: marketing plan, open house schedule, community partnerships, or referral programs.`,
      );
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
      }, stressCostInflation, sp, ceRR),
      runStressScenarioFromRows("Loss of Philanthropy", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyRevenueRows: rows => rows.map(r => (r.category === "grants_contributions" || r.category === "philanthropy") ? { ...r, enabled: false } : r),
        tuitionTiers,
      }, stressCostInflation, sp, ceRR),
      runStressScenarioFromRows("Occupancy +15%, Personnel +5%", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyExpenseRows: rows => rows.map(r =>
          r.category === "occupancy_facility"
            ? { ...r, amounts: r.amounts.map(a => a * 1.15) }
            : { ...r, amounts: r.amounts.map(a => a * 1.05) }
        ),
        modifyStaffingRows: rows => rows.map(r => ({ ...r, annualizedRate: r.annualizedRate * 1.05 })),
        tuitionTiers,
      }, stressCostInflation, sp, ceRR),
      runStressScenarioFromRows("Revenue Delayed 3 Months", enrollmentByYear, revenueRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, {
        modifyRevenueRows: rows => rows.map(r => ({
          ...r,
          amounts: r.amounts.map((a, i) => i === 0 ? a * 0.75 : a),
        })),
        tuitionTiers,
      }, stressCostInflation, sp, ceRR),
      runStressScenarioFromRows("Interest Rate +2%", enrollmentByYear, revenueRows, staffingRows, expenseRows,
        capDebtRows.map(r => r.isLoan ? { ...r, loanRate: (r.loanRate || 0) + 2 } : r),
        salaryEscRate, prorationFactor, { tuitionTiers }, stressCostInflation, sp, ceRR),
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
          ? "Per-student revenue is moderate, so consider whether tuition or supplemental funding can increase."
          : "Per-student revenue is low, which may make it difficult to cover costs as you scale.",
    benchmark: isCharterBenchmark ? "Charter avg: $10,000–$15,000" : "Private avg: $12,000–$25,000",
  });

  const costPerStudent = y1.students > 0 ? y1.totalExpenses / y1.students : 0;
  const costToRevRatio = revenuePerStudent > 0 ? costPerStudent / revenuePerStudent : 0;

  keyMetrics.push({
    name: "Cost per Student (Year 1)",
    value: fmt(costPerStudent),
    status: costToRevRatio <= 0.85 ? "good" : costToRevRatio <= 0.90 ? "warning" : "danger",
    interpretation:
      costToRevRatio <= 0.85
        ? `Total cost per student is ${fmt(costPerStudent)}, well within revenue per student of ${fmt(revenuePerStudent)}, leaving a healthy margin.`
        : costToRevRatio <= 0.90
          ? `Cost per student (${fmt(costPerStudent)}) is approaching revenue per student (${fmt(revenuePerStudent)}). Monitor expenses closely to maintain a sustainable margin.`
          : `Cost per student (${fmt(costPerStudent)}) exceeds 90% of revenue per student (${fmt(revenuePerStudent)}), leaving very little margin for unexpected expenses.`,
    benchmark: "Target: ≤ 85% of revenue per student",
  });

  keyMetrics.push({
    name: "Staffing Cost (% of Revenue)",
    value: pct(staffingCostPct),
    status: staffingCostPct <= 0.55 ? "good" : staffingCostPct <= 0.65 ? "warning" : "danger",
    interpretation:
      staffingCostPct <= 0.55
        ? "Staffing costs are well-controlled, giving you room for other priorities."
        : staffingCostPct <= 0.65
          ? `Payroll is ${pct(staffingCostPct)} of revenue, and most sustainable schools keep this under 65%.`
          : `Payroll is ${pct(staffingCostPct)} of revenue, which is high and could threaten financial stability.`,
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
          ? `Operating costs are moderate, so watch rent escalation and service costs over the ${yearCount}-year period.`
          : "Operating costs are consuming a large share of revenue, so review each cost center for savings.",
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
        ? "Year 1 shows a healthy surplus, a strong start for a new school."
        : y1NetMargin >= 0
          ? "Year 1 is near break-even, which is typical for startup schools but leaves little room for surprises."
          : `Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit, so plan for how this will be funded.`,
    benchmark: "Startup target: 0–5%; mature: 10%+",
  });

  keyMetrics.push({
    name: `${marginLabel.charAt(0).toUpperCase() + marginLabel.slice(1)} (Year ${lastYearNum})`,
    value: pct(lastYearNetMargin),
    status: lastYearNetMargin >= 0.15 ? "good" : lastYearNetMargin >= 0.05 ? "warning" : "danger",
    interpretation:
      lastYearNetMargin >= 0.15
        ? `By Year ${lastYearNum} the model shows strong ${profitWord}, and your school is on track for financial sustainability.`
        : lastYearNetMargin >= 0.05
          ? `Year ${lastYearNum} margin is thin, and a small revenue shortfall could push you into the red.`
          : `Year ${lastYearNum} margin is concerning, so building a clearer path to ${profitWord} will strengthen your model.`,
    benchmark: "Target: 10–15%+",
  });

  keyMetrics.push({
    name: `${yearCount}-Year Revenue Growth`,
    value: pct(revenueGrowth),
    status: revenueGrowth >= 0.5 ? "good" : revenueGrowth >= 0.2 ? "warning" : "danger",
    interpretation:
      revenueGrowth >= 0.5
        ? `Strong projected revenue growth over the ${yearCount}-year period.`
        : revenueGrowth >= 0.2
          ? "Moderate growth, so consider whether enrollment targets are ambitious enough."
          : "Low projected growth, which could signal difficulty scaling the school.",
    benchmark: "Healthy schools: 30–80% over 5 years",
  });

  if (sp.maxCapacity && sp.maxCapacity > 0) {
    keyMetrics.push({
      name: `Capacity Utilization (Year ${lastYearNum})`,
      value: pct(capacityUtilLastYear),
      status: capacityUtilLastYear >= 0.8 ? "good" : capacityUtilLastYear >= 0.6 ? "warning" : "danger",
      interpretation:
        capacityUtilLastYear >= 0.8
          ? `Year ${lastYearNum} enrollment approaches facility capacity, an efficient use of space.`
          : capacityUtilLastYear >= 0.6
            ? "You have room to grow into your facility, so plan marketing to fill seats."
            : `Facility will be underutilized by Year ${lastYearNum}, so consider a smaller space or higher enrollment targets.`,
      benchmark: "Optimal: 80–95% utilization",
    });
  }

  const priorSnapshot = (data as Record<string, unknown>).priorYearSnapshot as Record<string, number> | undefined;
  const y1StartingCash = priorSnapshot?.endingCash || 0;
  const y1EndingCash = y1StartingCash + y1.netIncome;
  const y1Dcoh = computeDaysCashOnHand(y1EndingCash, y1.totalExpenses);
  const y1DcohRounded = Math.round(y1Dcoh);

  keyMetrics.push({
    name: "Days Cash on Hand (Year 1)",
    value: `${y1DcohRounded} days`,
    status: y1DcohRounded >= BENCHMARK_DCOH_GREEN ? "good" : y1DcohRounded >= BENCHMARK_DCOH_AMBER ? "warning" : "danger",
    interpretation:
      y1DcohRounded >= BENCHMARK_DCOH_GREEN
        ? "Cash reserves cover 90+ days of expenses — a strong liquidity position."
        : y1DcohRounded >= BENCHMARK_DCOH_AMBER
          ? `${y1DcohRounded} days of cash on hand is above the minimum but below the 90-day target. Build reserves to create a larger buffer.`
          : `Only ${y1DcohRounded} days of cash on hand — well below the 45-day minimum. Secure bridge funding or reduce early costs.`,
    benchmark: `Healthy: ≥ ${BENCHMARK_DCOH_GREEN} days; minimum: ${BENCHMARK_DCOH_AMBER} days`,
  });

  if (hasDebt) {
    keyMetrics.push({
      name: "Debt Service Coverage Ratio (Year 1)",
      value: dscr > 0 ? `${dscr.toFixed(2)}x` : "N/A",
      status: dscr >= 1.25 ? "good" : dscr >= 1.0 ? "warning" : "danger",
      interpretation:
        dscr >= 1.25
          ? "DSCR is above 1.25x, and your operating income comfortably covers debt payments."
          : dscr >= 1.0
            ? "DSCR is above 1.0x but tight, with little margin if revenue dips. Look for ways to widen this buffer."
            : "DSCR is below 1.0x, meaning the school cannot cover debt payments from operating income alone. This needs to be addressed.",
      benchmark: "Healthy minimum: 1.25x",
    });
  }

  if (philanthropyPct > 0.05) {
    keyMetrics.push({
      name: "Philanthropy (% of Revenue)",
      value: pct(philanthropyPct),
      status: philanthropyPct <= 0.15 ? "good" : philanthropyPct <= 0.30 ? "warning" : "danger",
      interpretation:
        philanthropyPct <= 0.15
          ? "Philanthropy supplements earned revenue — a healthy mix."
          : philanthropyPct <= 0.30
            ? "Grants and donations are a meaningful share of revenue. Confirm renewal expectations and ensure the model isn't dependent on any single uncertain grant."
            : "Heavy reliance on philanthropy creates risk because donations can fluctuate year to year. Anchor the model to enrollment-driven earned revenue so philanthropy is supplemental, not foundational.",
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
            ? "Significant reliance on public funding, and changes in state policy could materially impact revenue."
            : "The model is heavily dependent on public funding, so develop contingency plans for policy changes.",
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
          ? `By Year ${lastYearNum}, the school has built a healthy operating reserve of 3+ months, a strong foundation for long-term stability.`
          : lastReserve.reserveMonths >= 1
            ? "The reserve buffer is thin, so target building at least 3 months of expenses as a cushion."
            : `No meaningful reserve has been built by Year ${lastYearNum} yet, and this is an important area to strengthen as you grow.`,
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

  if (y1NetMargin < 0) risks.push(`Year 1 projects a ${fmt(Math.abs(y1.netIncome))} shortfall, which is very common for early-stage schools and worth planning around`);
  if (staffingCostPct > 0.65) risks.push(`Staffing costs at ${pct(staffingCostPct)} of revenue are an area to work on bringing down over time`);
  if (revenuePerStudent < 7000) risks.push("Per-student revenue has room to grow toward sustainable levels");
  if (opexCostPct > 0.40) risks.push("Operating costs are on the higher side, presenting an opportunity to find efficiencies");
  if (lastYearNetMargin < 0.05) risks.push(`Year ${lastYearNum} margin is quite thin, and strengthening this will make the model more resilient`);
  if (breakEvenYear < 0) risks.push(`The model doesn't yet reach break-even within ${yearCount} years, but adjusting revenue or costs can help close the gap`);
  if (capacityUtilLastYear < 0.6 && sp.maxCapacity && sp.maxCapacity > 0)
    risks.push("Facility capacity is underutilized, and a smaller space could improve your cost structure");
  if (hasDebt && dscr < 1.0)
    risks.push("Debt service currently exceeds operating income, so consider adjusting loan terms or boosting revenue before taking on this debt");
  if (philanthropyPct > 0.30)
    risks.push(`Philanthropy at ${pct(philanthropyPct)} of revenue is a generous foundation, but building more earned revenue will add stability`);
  if (publicRevenuePct > 0.70)
    risks.push("Public funding is the primary revenue source — model disbursement timing carefully and maintain cash reserves for funding gaps");
  if (lastReserve && lastReserve.reserveMonths < 1)
    risks.push(`Building an operating reserve by Year ${lastYearNum} is an important next goal to work toward`);

  if (sp.locationSecured && sp.ownershipType === "own") {
    strengths.push("Facility is owned with no lease renewal risk");
  }

  const facilityRisks: string[] = [];
  if (!sp.locationSecured) {
    facilityRisks.push("No facility location secured yet, so facility costs are estimated");
  }
  if (sp.locationSecured && sp.ownershipType === "rent" && sp.leaseExpirationYear) {
    const curYear = new Date().getFullYear();
    const projStart = Math.max(sp.openingYear || curYear, curYear);
    const yearsUntilExpiration = sp.leaseExpirationYear - projStart;
    if (yearsUntilExpiration >= 0 && yearsUntilExpiration < yearCount) {
      const bump = sp.postLeaseRenewalBump || 15;
      facilityRisks.push(`Lease expires in Year ${yearsUntilExpiration + 1}, and rent may increase ${bump}% at renewal`);
    }
  }
  risks.unshift(...facilityRisks);

  const biggestStrength =
    strengths.length > 0
      ? strengths[0]
      : "The model captures a complete financial picture, a great starting point.";

  const biggestRisk =
    risks.length > 0
      ? risks[0]
      : "No major red flags detected, so continue refining assumptions as you gather real data.";

  const recommendations: Recommendation[] = [];

  if (y1NetMargin < 0) {
    recommendations.push({
      title: "Plan for Your Year 1 Startup Phase",
      description: `Your model projects a ${fmt(Math.abs(y1.netIncome))} shortfall in Year 1, which is completely normal for a new school. Start identifying sources to bridge this gap: startup grants, personal investment, or a small line of credit. Many successful schools began exactly this way.`,
      priority: "high",
    });
  }

  if (staffingCostPct > 0.65) {
    recommendations.push({
      title: "Explore Ways to Optimize Staffing Costs",
      description: `At ${pct(staffingCostPct)} of revenue, staffing is above the 65% target most schools aim for. Some options to explore: adjusting student-teacher ratios, phasing in admin hires as enrollment grows, or slightly increasing class sizes. Your team is your greatest asset, and this is about finding the right balance.`,
      priority: "high",
    });
  }

  if (revenuePerStudent < 7000) {
    recommendations.push({
      title: "Grow Your Per-Student Revenue",
      description: `At ${fmt(revenuePerStudent)} per student, there's an opportunity to strengthen this number. Consider modest tuition adjustments, ESA/voucher programs in your state, or fee-based enrichment programs that add value for families.`,
      priority: "high",
    });
  }

  if (hasDebt && dscr < 1.25) {
    recommendations.push({
      title: "Strengthen Your Debt Service Coverage",
      description: `Your DSCR of ${dscr.toFixed(2)}x is ${dscr < 1.0 ? "below 1.0x, meaning debt payments exceed operating income right now" : "below the 1.25x healthy target"}. Some paths forward: reducing the loan amount, extending the term, or growing revenue. Strengthening this ratio gives you more financial breathing room and makes your model more resilient.`,
      priority: "high",
    });
  }

  if (philanthropyPct > 0.30) {
    recommendations.push({
      title: "Anchor Revenue to Enrollment-Driven Income",
      description: `Grants and donations represent ${pct(philanthropyPct)} of Year 1 revenue. Philanthropy is inherently unpredictable — anchor your model to earned revenue (tuition, per-pupil funding) that scales with enrollment. Aim for philanthropy below 20% by Year 3 so fundraising supplements your model rather than sustaining it.`,
      priority: "high",
    });
  }

  if (opexCostPct > 0.40) {
    recommendations.push({
      title: "Look for Opportunities in Operating Costs",
      description: `Operating costs at ${pct(opexCostPct)} of revenue are on the higher side. Take a fresh look at each area (facility, student services, and administration) for creative savings. Shared space, volunteer programs, or phasing in services over time are all strategies founders use.`,
      priority: "medium",
    });
  }

  if (lastReserve && lastReserve.reserveMonths < 3) {
    recommendations.push({
      title: "Grow Your Cash Reserve Over Time",
      description: `By Year ${lastYearNum}, your projected reserve covers ${lastReserve.reserveMonths.toFixed(1)} months of expenses. The goal is 3–6 months, and you'll get there by building surplus in your early ${profitWord} years. Every month of reserve you add makes your school more resilient.`,
      priority: "medium",
    });
  }

  if (breakEvenYear > 1) {
    recommendations.push({
      title: "Explore Ways to Reach Break-Even Sooner",
      description: `Your model reaches break-even in Year ${breakEvenYear + 1}. You might be able to get there sooner by front-loading enrollment growth or phasing in expenses more gradually. Either way, having a clear path to ${profitWord} is what matters most.`,
      priority: "medium",
    });
  }

  const schoolType = sp.schoolType || "";
  const fundingProfile = sp.fundingProfile || "";
  const isCharterSchool = schoolType === "charter_school" || fundingProfile === "charter_public_funded";

  if (publicRevenuePct > 0.70 && !isCharterSchool) {
    recommendations.push({
      title: "Plan for Public Funding Timing Risk",
      description: `Public funding represents ${pct(publicRevenuePct)} of revenue — a strong enrollment-driven foundation. The key risk isn't concentration, it's disbursement timing and policy shifts. Maintain cash reserves or a line of credit to bridge gaps between enrollment counts and payment receipt, and track legislative changes that could affect per-pupil allocations.`,
      priority: "medium",
    });
  }

  if (capacityUtilLastYear < 0.6 && sp.maxCapacity && sp.maxCapacity > 0) {
    recommendations.push({
      title: "Consider a Right-Sized Facility",
      description: `By Year ${lastYearNum}, you'll use about ${pct(capacityUtilLastYear)} of your ${sp.maxCapacity}-student capacity. A cozier, less expensive space could free up budget for the things that matter most to your students and families.`,
      priority: "low",
    });
  }

  const isCharter = isCharterSchool;
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
        description: "Charter schools typically receive 50–80% of revenue from per-pupil public funding. Your model shows less than 50% from public sources, so confirm your per-pupil allocation matches your state's formula and that you're capturing all eligible funding streams.",
        priority: "medium",
      });
    }
    if (y1.students < 100) {
      recommendations.push({
        title: "Check Charter Minimum Enrollment Requirements",
        description: "Many charter authorizers look for 100+ students to demonstrate viability. Your Year 1 enrollment is on the smaller side, so it's worth checking whether your authorizer has minimum enrollment requirements so you can plan accordingly.",
        priority: "medium",
      });
    }
    if (publicRevenuePct > 0.7) {
      recommendations.push({
        title: "Charter Funding Timing & Cash Flow Risk",
        description: `${pct(publicRevenuePct)} of revenue comes from public per-pupil funding — this is enrollment-driven income and a strong foundation. The primary risk is disbursement timing: charter funding follows a state-defined schedule, so ensure you have cash reserves or a line of credit to cover gaps between enrollment counts and payment receipt.`,
        priority: "medium",
      });
    }
  }

  if (isPrivate) {
    const tuitionPct = y1.totalRevenue > 0 ? y1.tuitionRevenue / y1.totalRevenue : 0;
    if (tuitionPct < 0.6) {
      recommendations.push({
        title: "Strengthen Tuition Revenue Base",
        description: `Private schools typically derive 60–85% of revenue from tuition. At ${pct(tuitionPct)}, your tuition revenue share is lower than typical, so ensure your pricing reflects the full cost of education and is competitive for your market.`,
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
    if (mgmtFeePct > 15) {
      recommendations.push({
        title: "Review Management Fee Level",
        description: `Your management fee of ${mgmtFeePct}% of revenue exceeds the 15% threshold commonly used as an upper bound by authorizers and lenders. Ensure the services received justify this rate and consider negotiating or comparing with alternative providers.`,
        priority: "medium",
      });
    }
    const isCharter = sp.schoolType === "charter_school" || sp.fundingProfile === "charter_public_funded";
    if (!isCharter) {
      recommendations.push({
        title: "Management Fee on a Non-Charter School",
        description: `Your school has an authorizer/management fee of ${mgmtFeePct}% enabled. This fee is most common among charter schools paying an authorizer or CMO. For a non-charter school, this typically represents a back-office or management services contract. Verify the fee accurately reflects your arrangement and that the services provided justify the ongoing cost.`,
        priority: "low",
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
            ? "Management fee is on the higher end, so ensure the services provided justify the cost."
            : "Management fee is well above typical levels, and it's worth reviewing to ensure the services justify the cost.",
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
        description: `Learning pods typically serve 5–15 students for personalized instruction. At ${y1.students} students, consider whether your model is structured as a single pod or multiple pods, as this affects staffing needs and space requirements.`,
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
        description: `At ${fmt(revenuePerStudent)} per student, verify your pricing structure. Tutoring centers often charge hourly or by session, so ensure your annual per-student revenue projection reflects realistic session frequency and pricing.`,
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
        description: `Occupancy costs are ${pct(tutoringOccPct)} of revenue. Tutoring centers can often operate from shared or flexible spaces, so consider whether a smaller footprint or shared-use arrangement could reduce facility costs.`,
        priority: "low",
      });
    }
  }

  if (isHybridFunding) {
    const tuitionPct = y1.totalRevenue > 0 ? y1.tuitionRevenue / y1.totalRevenue : 0;
    if (tuitionPct > 0 && publicRevenuePct > 0) {
      recommendations.push({
        title: "Manage Hybrid Funding Complexity",
        description: `Your model blends tuition (${pct(tuitionPct)}) with public funding (${pct(publicRevenuePct)}). Both are enrollment-driven — a strong foundation. The complexity is operational: ensure you're tracking each funding stream's reporting requirements separately, especially if public funds have restricted-use provisions.`,
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
          description: `Contracted (non-payroll) personnel represent ${pct(contractedPct)} of revenue (${fmt(contractedTotal)}). This is unusual for schools, so verify these aren't roles that should be full-time hires with benefits, which may be more cost-effective long-term.`,
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
          description: `Founder/leader compensation of ${fmt(founderComp)} is below market. While common in startup years, plan for competitive compensation by Year 2–3 to retain leadership and build a sustainable operating model.`,
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
        description: `Administrative costs (${fmt(adminCost)}) are approaching or exceeding program-related spending (${fmt(programCost)}). A sustainable school directs more resources toward program delivery. Review marketing, professional development, and other admin line items for efficiency.`,
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
          description: `Total debt of ${fmt(totalDebt)} is ${debtToRevenue.toFixed(1)}x Year 1 revenue. Keeping total debt below 2–3x annual revenue gives you more flexibility as you grow. Consider phasing capital expenditures or seeking grant funding for initial build-out.`,
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
          description: `${pct(reimbursementPct)} of Year 1 revenue (${fmt(reimbursementRevenue)}) comes from reimbursement-based sources with payment delays. This creates cash flow gaps, so ensure you have a line of credit or startup reserves to cover 2–3 months of operating expenses while awaiting reimbursements.`,
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
      r => (r.category === "grants_contributions" || r.category === "philanthropy") && r.grantStatus === "projected"
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
          description: `Year 1 projects ${pct(revChange)} revenue growth over last year's actual ${fmt(priorYear.totalRevenue)}. Growth over 30% in a single year requires clear justification: enrollment surge, new funding stream, or tuition increase.`,
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
          description: `Last year ended with ${fmt(priorYear.endingCash)} in cash, only ${priorReserveMonths.toFixed(1)} months of expenses. Building reserves to 3+ months should be a priority. Consider a bridge line of credit while growing into ${profitWord}.`,
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

  if (!sp.locationSecured) {
    recommendations.push({
      title: "Secure Your Facility Location",
      description: "Your model is based on an estimated facility budget. Once you have a signed lease or purchase agreement, update your model with actual numbers because real lease terms make your projections far more reliable.",
      priority: "high",
    });
  }

  if (sp.locationSecured && sp.ownershipType === "rent" && sp.leaseExpirationYear) {
    const curYr = new Date().getFullYear();
    const projStartYr = Math.max(sp.openingYear || curYr, curYr);
    const leaseEndYear = sp.leaseExpirationYear;
    const yearsUntilExpiration = leaseEndYear - projStartYr;
    if (yearsUntilExpiration >= 0 && yearsUntilExpiration < yearCount) {
      const bump = sp.postLeaseRenewalBump || 15;
      recommendations.push({
        title: "Plan for Lease Renewal Risk",
        description: `Your lease expires in ${leaseEndYear}, which falls within your ${yearCount}-year projection. At renewal, rent could jump ${bump}% or more. Start renewal conversations early, explore extension options, or budget for the increase, as your model's accuracy depends on addressing this.`,
        priority: "high",
      });
    }
    if (yearsUntilExpiration < 2 && yearsUntilExpiration >= 0) {
      recommendations.push({
        title: "Short Remaining Lease Term",
        description: `Your lease expires in ${leaseEndYear}, less than 2 years away. Facility stability is critical to a credible long-term projection. If possible, negotiate an extension or option to renew so your model reflects a secure operating environment.`,
        priority: "high",
      });
    }
  }

  if (sp.locationSecured && sp.ownershipType === "rent" && sp.isNNNLease) {
    const nnnMonthly = (sp.nnnCamCharges || 0) + (sp.nnnMaintenance || 0) + (sp.nnnUtilities || 0);
    if (nnnMonthly > 0) {
      const nnnAnnual = nnnMonthly * 12;
      const nnnPct = y1.totalRevenue > 0 ? nnnAnnual / y1.totalRevenue : 0;
      if (nnnPct > 0.05) {
        recommendations.push({
          title: "NNN Lease Costs Add Up",
          description: `Your triple-net charges (CAM, maintenance, utilities) total ${fmt(nnnAnnual)}/year, ${pct(nnnPct)} of Year 1 revenue. These costs escalate with inflation. Make sure they're fully reflected in your expense projections and consider negotiating caps on CAM increases.`,
          priority: "medium",
        });
      }
    }
  }

  if (sp.locationSecured && sp.ownershipType === "own" && sp.entityType && sp.entityType !== "nonprofit_501c3" && (sp.propertyTaxAnnual || 0) > 0) {
    const ptPct = y1.totalRevenue > 0 ? (sp.propertyTaxAnnual || 0) / y1.totalRevenue : 0;
    if (ptPct > 0.03) {
      recommendations.push({
        title: "Property Tax Is a Significant Expense",
        description: `Annual property tax of ${fmt(sp.propertyTaxAnnual || 0)} represents ${pct(ptPct)} of Year 1 revenue. As a for-profit entity, this isn't tax-exempt. Factor in annual assessment increases and consider whether the property's carrying cost supports your mission.`,
        priority: "medium",
      });
    }
  }

  const spaceOccupancyThreshold = 0.25;
  for (let yi = 0; yi < yearFinancials.length; yi++) {
    const yf = yearFinancials[yi];
    if (yf.totalExpenses > 0) {
      const occPct = yf.facilityCost / yf.totalExpenses;
      if (occPct > spaceOccupancyThreshold) {
        recommendations.push({
          title: "Facility costs are above the 25% benchmark",
          description: `Your occupancy costs represent ${pct(occPct)} of total expenses in Year ${yi + 1}, which is above the recommended 25% threshold for small schools. Consider using SchoolStack Space (space.schoolstack.ai) to evaluate alternative properties and model different lease scenarios before committing.`,
          priority: "medium",
          jumpToStep: 5,
        });
        break;
      }
    }
  }

  const hasFacilityCostAnywhere = y1.facilityCost > 0 || (sp.monthlyRent && sp.monthlyRent > 0) || (sp.estimatedMonthlyFacilityBudget && sp.estimatedMonthlyFacilityBudget > 0) || (sp.ownershipType === "own" && ((sp.propertyTaxAnnual && sp.propertyTaxAnnual > 0) || (sp.hasMortgage && sp.mortgageMonthlyPayment && sp.mortgageMonthlyPayment > 0)));
  if (!hasFacilityCostAnywhere) {
    recommendations.push({
      title: "No facility costs in your model",
      description: "Your model doesn't include rent or facility expenses. Use SchoolStack Space (space.schoolstack.ai) to calculate how much space your school needs and estimate facility costs before finalizing your budget.",
      priority: "high",
      jumpToStep: 5,
    });
  }

  if (yearFinancials.length >= 3 && yearFinancials[0].netIncome < 0 && yearFinancials[2].netIncome > 0) {
    recommendations.push({
      title: "Your school reaches sustainability by Year 3",
      description: "This is a common pattern for early-stage schools. Make sure your facility lease terms give you flexibility during the startup period. SchoolStack Space can help you model lease escalations and TI amortization.",
      priority: "low",
      jumpToStep: 5,
    });
  }

  while (recommendations.length < 3) {
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Build a Cash Reserve",
        description:
          "Even with healthy projections, aim to build 3–6 months of operating expenses as a reserve fund. This gives you a safety net for unexpected expenses and keeps your school financially resilient.",
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
          "Great projections are backed by a clear plan. Document your marketing strategy, enrollment pipeline, and community outreach, as this is the roadmap that turns your numbers into reality.",
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
      `This model demonstrates strong financial fundamentals: a clear path to ${profitWord}, controlled costs, a sustainable revenue mix, and adequate debt coverage. Your projections are grounded and achievable.`;
  } else if (dangerMetrics <= 1 && lastYearNetMargin >= 0) {
    lenderReadiness = "Needs Work";
    lenderReadinessExplanation =
      "Your model has real promise, and there are just a few areas to strengthen. The recommendations above will help you build a more resilient financial plan, and every improvement makes your projections more achievable.";
  } else {
    lenderReadiness = "Not Yet Ready";
    lenderReadinessExplanation =
      "Your model is a solid starting point, and now it's time to refine it. Focus on the high-priority recommendations first, and you'll see real progress. Every great school's financial story started as a first draft.";
  }

  const schoolName = sp.schoolName || "Your school";
  let executiveSummary: string;

  if (lenderReadiness === "Strong") {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue with a ${pct(lastYearNetMargin)} ${marginLabel}. The model tells a strong financial story with ${goodMetrics} of ${keyMetrics.length} key metrics in healthy range, a great foundation for your mission.`;
  } else if (lenderReadiness === "Needs Work") {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue with a ${pct(lastYearNetMargin)} ${marginLabel}. ${dangerMetrics > 0 ? `There ${dangerMetrics === 1 ? "is" : "are"} ${dangerMetrics} area${dangerMetrics > 1 ? "s" : ""} to strengthen` : "Margins are on the thinner side"}, and the recommendations below will help you build a more compelling financial story.`;
  } else {
    executiveSummary = `${schoolName} projects ${fmt(yLast.totalRevenue)} in Year ${lastYearNum} revenue, with ${dangerMetrics} of ${keyMetrics.length} key metrics that need attention. This is a starting point, and working through the recommendations below will help you build the financial story your mission deserves.`;
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
        const fins = computeAllYearsFromRows(adjEnroll, adjRevRows, staffingRows, expenseRows, capDebtRows, salaryEscRate, prorationFactor, tuitionTiers, sensCostInflation, sp, ceRR);
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

  const facilityCostPct = y1.totalRevenue > 0 ? y1.facilityCost / y1.totalRevenue : 0;
  const tuitionPct = y1.totalRevenue > 0 ? y1.tuitionRevenue / y1.totalRevenue : 0;
  const lastReserveEntry = cumulativeFinancials[cumulativeFinancials.length - 1];

  const healthSignals = generateHealthSignals({
    y1NetMargin,
    lastYearNetMargin,
    breakEvenYear,
    yearCount,
    cashRunwayMonths,
    reserveMonths: lastReserveEntry?.reserveMonths ?? 0,
    staffingCostPct,
    facilityCostPct,
    dscr,
    hasDebt,
    philanthropyPct,
    publicRevenuePct,
    tuitionPct,
    entityType: sp.entityType || "",
    daysCashOnHand: y1Dcoh,
  });

  const topIssues = generateTopIssues({
    yearFinancials,
    cumulativeFinancials,
    enrollmentByYear,
    cashRunwayMonths,
    maxCapacity: sp.maxCapacity || 0,
    schoolType: sp.schoolType || "",
    fundingProfile: sp.fundingProfile || "",
    entityType: sp.entityType || "",
    hasDebt,
    dscr,
    retentionRate: en.retentionRate,
  });

  const lendingLabAssessment = assessLendingLabReadiness(data, yearFinancials, enrollmentByYear);

  const assumptionFlags = await detectUnusualAssumptions(rawData);

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
    topIssues,
    healthSignals,
    lendingLabAssessment,
    assumptionFlags,
    generatedAt: new Date().toISOString(),
  };
}
