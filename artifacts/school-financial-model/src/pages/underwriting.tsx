import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useDebounce } from "use-debounce";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";

const STORAGE_KEY = "guest_underwriting_model_v1";
const STORAGE_VERSION = 1;

type SchoolType =
  | "charter_school"
  | "private_school"
  | "microschool"
  | "homeschool_coop"
  | "learning_pod"
  | "tutoring_center"
  | "catholic_school"
  | "chesterton_academy"
  | "other";

type SchoolStage = "new_school" | "operating_school";
type ModelDuration = "single_year" | "five_year";
type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

type EnrollmentValidationStatus =
  | "projected"
  | "waitlist"
  | "verbal_commitments"
  | "deposits_collected"
  | "signed_agreements";

type FacilityType =
  | "commercial"
  | "church_shared"
  | "dedicated_school"
  | "community_center"
  | "residential"
  | "virtual"
  | "other";

type ReadinessStatus = "obtained" | "in_process" | "not_started" | "unknown";
type InsuranceStatus = "active" | "quoted" | "not_started" | "unknown";
type PublicFundingApprovalStatus = "approved" | "pending" | "not_applicable";

interface GuestModel {
  version: number;
  schoolName: string;
  schoolType: SchoolType;
  schoolStage: SchoolStage;
  modelDuration: ModelDuration;
  fundingProfile: FundingProfile;
  state: string;

  year1Students: number;
  annualGrowthPct: number;

  perStudentTuition: number;
  perPupilPublicFunding: number;
  philanthropyAnnual: number;

  studentsPerTeacher: number;
  avgTeacherSalary: number;
  numAdminStaff: number;
  avgAdminSalary: number;

  monthlyRent: number;
  annualUtilities: number;
  annualInsurance: number;
  annualCurriculum: number;
  annualOtherOpex: number;

  founderIsPaidYear1: boolean;
  founderAnnualCompensation: number;
  founderCompensationBeginsYear: number;
  unpaidOrVolunteerLaborDescription: string;

  enrollmentValidationStatus: EnrollmentValidationStatus;
  signedAgreementCount: number;
  depositCount: number;
  averageDepositAmount: number;
  tuitionCollectionRate: number;
  retentionRate: number;

  facilityType: FacilityType;
  leaseSigned: boolean;
  leaseInEntityName: boolean;
  occupancyDocumentationStatus: ReadinessStatus;
  fireInspectionStatus: ReadinessStatus;
  insuranceStatus: InsuranceStatus;

  hasExistingDebt: boolean;
  existingDebtBalance: number;
  existingAnnualDebtService: number;
  requestedLoanAmount: number;
  requestedLoanAnnualDebtService: number;

  beginningCash: number;
  expectedSummerRevenueGap: boolean;
  publicFundingApprovalStatus: PublicFundingApprovalStatus;
  canWithstand90DayDelay: boolean;
}

const EMPTY_MODEL: GuestModel = {
  version: STORAGE_VERSION,
  schoolName: "",
  schoolType: "microschool",
  schoolStage: "new_school",
  modelDuration: "five_year",
  fundingProfile: "tuition_based",
  state: "",

  year1Students: 30,
  annualGrowthPct: 15,

  perStudentTuition: 12000,
  perPupilPublicFunding: 0,
  philanthropyAnnual: 0,

  studentsPerTeacher: 12,
  avgTeacherSalary: 55000,
  numAdminStaff: 1,
  avgAdminSalary: 65000,

  monthlyRent: 4000,
  annualUtilities: 12000,
  annualInsurance: 8000,
  annualCurriculum: 8000,
  annualOtherOpex: 12000,

  founderIsPaidYear1: false,
  founderAnnualCompensation: 0,
  founderCompensationBeginsYear: 2,
  unpaidOrVolunteerLaborDescription: "",

  enrollmentValidationStatus: "projected",
  signedAgreementCount: 0,
  depositCount: 0,
  averageDepositAmount: 0,
  tuitionCollectionRate: 95,
  retentionRate: 85,

  facilityType: "commercial",
  leaseSigned: false,
  leaseInEntityName: false,
  occupancyDocumentationStatus: "unknown",
  fireInspectionStatus: "unknown",
  insuranceStatus: "unknown",

  hasExistingDebt: false,
  existingDebtBalance: 0,
  existingAnnualDebtService: 0,
  requestedLoanAmount: 0,
  requestedLoanAnnualDebtService: 0,

  beginningCash: 0,
  expectedSummerRevenueGap: false,
  publicFundingApprovalStatus: "not_applicable",
  canWithstand90DayDelay: false,
};

function loadGuestModel(): GuestModel {
  if (typeof window === "undefined") return EMPTY_MODEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MODEL;
    const parsed = JSON.parse(raw) as Partial<GuestModel> & { version?: number };
    if (parsed.version !== STORAGE_VERSION) return EMPTY_MODEL;
    return { ...EMPTY_MODEL, ...parsed, version: STORAGE_VERSION };
  } catch {
    return EMPTY_MODEL;
  }
}

function saveGuestModel(model: GuestModel) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    /* localStorage unavailable / quota — silently degrade */
  }
}

function clearGuestModel() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function projectEnrollment(year1: number, growthPct: number): number[] {
  const g = 1 + growthPct / 100;
  return [
    Math.round(year1),
    Math.round(year1 * g),
    Math.round(year1 * g * g),
    Math.round(year1 * g * g * g),
    Math.round(year1 * g * g * g * g),
  ];
}

function buildModelDataPayload(m: GuestModel): Record<string, unknown> {
  const enroll = projectEnrollment(m.year1Students, m.annualGrowthPct);
  const teachersPerYear = enroll.map((s) =>
    Math.max(1, Math.ceil(s / Math.max(1, m.studentsPerTeacher))),
  );

  const revenueRows: Array<Record<string, unknown>> = [];
  if (m.perStudentTuition > 0) {
    const effectiveTuition = m.perStudentTuition * (m.tuitionCollectionRate / 100);
    revenueRows.push({
      id: "rev_tuition",
      category: "tuition_and_fees",
      lineItem: "Tuition revenue",
      enabled: true,
      driverType: "per_student",
      amounts: [effectiveTuition, effectiveTuition, effectiveTuition, effectiveTuition, effectiveTuition],
      escalationRate: 3,
    });
  }
  if (m.perPupilPublicFunding > 0) {
    revenueRows.push({
      id: "rev_ppf",
      category: "public_funding",
      lineItem: "Per-pupil public funding",
      enabled: true,
      driverType: "per_student",
      amounts: [m.perPupilPublicFunding, m.perPupilPublicFunding, m.perPupilPublicFunding, m.perPupilPublicFunding, m.perPupilPublicFunding],
      escalationRate: 2,
    });
  }
  if (m.philanthropyAnnual > 0) {
    revenueRows.push({
      id: "rev_phil",
      category: "philanthropy",
      lineItem: "Philanthropy & grants",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual],
    });
  }

  const staffingRows: Array<Record<string, unknown>> = [];
  staffingRows.push({
    id: "staff_teachers",
    roleName: "Lead teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: teachersPerYear[0],
    annualizedRate: m.avgTeacherSalary,
    benefitsEligible: true,
    benefitsRate: 18,
    payrollTaxRate: 7.65,
    payrollLike: true,
    notes: `Scales with enrollment at 1 teacher per ${m.studentsPerTeacher} students`,
  });
  if (m.numAdminStaff > 0 && m.avgAdminSalary > 0) {
    staffingRows.push({
      id: "staff_admin",
      roleName: "Head of school / admin",
      functionCategory: "administrative",
      employmentType: "full_time",
      fte: m.numAdminStaff,
      annualizedRate: m.avgAdminSalary,
      benefitsEligible: true,
      benefitsRate: 18,
      payrollTaxRate: 7.65,
      payrollLike: true,
      notes: "",
    });
  }
  if (m.founderAnnualCompensation > 0) {
    staffingRows.push({
      id: "staff_founder",
      roleName: "Founder / executive director",
      functionCategory: "school_leadership",
      employmentType: "full_time",
      fte: 1,
      annualizedRate: m.founderAnnualCompensation,
      benefitsEligible: true,
      benefitsRate: 18,
      payrollTaxRate: 7.65,
      payrollLike: true,
      startYear: m.founderIsPaidYear1 ? 1 : Math.max(1, Math.min(5, m.founderCompensationBeginsYear)),
      notes: m.founderIsPaidYear1 ? "" : `Deferred to Year ${m.founderCompensationBeginsYear}`,
    });
  }

  const expenseRows: Array<Record<string, unknown>> = [];
  if (m.annualUtilities > 0) {
    expenseRows.push({
      id: "exp_utilities",
      category: "occupancy_facility",
      lineItem: "Utilities",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.annualUtilities, m.annualUtilities * 1.03, m.annualUtilities * 1.06, m.annualUtilities * 1.09, m.annualUtilities * 1.12].map(Math.round),
    });
  }
  if (m.annualInsurance > 0) {
    expenseRows.push({
      id: "exp_insurance",
      category: "occupancy_facility",
      lineItem: "Insurance",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.annualInsurance, m.annualInsurance * 1.05, m.annualInsurance * 1.10, m.annualInsurance * 1.16, m.annualInsurance * 1.22].map(Math.round),
    });
  }
  if (m.annualCurriculum > 0) {
    expenseRows.push({
      id: "exp_curriculum",
      category: "instructional_program",
      lineItem: "Curriculum & materials",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.annualCurriculum, m.annualCurriculum * 1.03, m.annualCurriculum * 1.06, m.annualCurriculum * 1.09, m.annualCurriculum * 1.12].map(Math.round),
    });
  }
  if (m.annualOtherOpex > 0) {
    expenseRows.push({
      id: "exp_other",
      category: "administrative_general",
      lineItem: "Other operating expenses",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.annualOtherOpex, m.annualOtherOpex * 1.03, m.annualOtherOpex * 1.06, m.annualOtherOpex * 1.09, m.annualOtherOpex * 1.12].map(Math.round),
    });
  }

  const capitalAndDebtRows: Array<Record<string, unknown>> = [];
  if (m.hasExistingDebt && m.existingAnnualDebtService > 0) {
    capitalAndDebtRows.push({
      id: "debt_existing",
      lineItem: "Existing debt service",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.existingAnnualDebtService, m.existingAnnualDebtService, m.existingAnnualDebtService, m.existingAnnualDebtService, m.existingAnnualDebtService],
      isLoan: false,
      loanPrincipal: 0,
      loanRate: 0,
      loanTermYears: 0,
      note: "Pre-existing debt entered by guest wizard",
    });
  }
  if (m.requestedLoanAmount > 0 && m.requestedLoanAnnualDebtService > 0) {
    capitalAndDebtRows.push({
      id: "debt_requested",
      lineItem: "Requested loan debt service",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [m.requestedLoanAnnualDebtService, m.requestedLoanAnnualDebtService, m.requestedLoanAnnualDebtService, m.requestedLoanAnnualDebtService, m.requestedLoanAnnualDebtService],
      isLoan: false,
      loanPrincipal: 0,
      loanRate: 0,
      loanTermYears: 0,
      note: "Requested financing entered by guest wizard",
    });
  }

  return {
    schoolProfile: {
      schoolName: m.schoolName || "Untitled School",
      schoolType: m.schoolType,
      schoolStage: m.schoolStage,
      fundingProfile: m.fundingProfile,
      modelDuration: m.modelDuration,
      state: m.state,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      locationSecured: m.leaseSigned,
      ownershipType: m.monthlyRent > 0 ? "rent" : undefined,
      monthlyRent: m.monthlyRent,
      annualRentEscalation: 3,
      postLeaseRenewalBump: 15,
      isNNNLease: false,
      hasMortgage: false,
      mortgageMonthlyPayment: 0,
    },
    enrollment: {
      year1: enroll[0],
      year2: enroll[1],
      year3: enroll[2],
      year4: enroll[3],
      year5: enroll[4],
      retentionRate: m.retentionRate,
    },
    programs: [],
    tuitionEscalation: { rate: 3 },
    revenueSources: {
      tuition: m.perStudentTuition > 0,
      publicFunding: m.perPupilPublicFunding > 0,
      schoolChoice: false,
      philanthropy: m.philanthropyAnnual > 0,
    },
    revenue: { annualTuitionIncrease: 3 },
    revenueRows,
    staffing: { studentsPerTeacher: m.studentsPerTeacher, offersBenefits: true, benefitsRate: 18, payrollTaxRate: 7.65 },
    staffingRows,
    facilities: {
      annualRentIncrease: 3,
      annualInterestRate: 0,
      loanTermYears: 0,
      loanAmount: 0,
      annualSalaryIncrease: 3,
      generalCostInflation: 3,
      monthlyRent: m.monthlyRent,
      annualUtilities: m.annualUtilities,
      annualInsurance: m.annualInsurance,
    },
    expenseRows,
    capitalAndDebtRows,
    openingBalances: {
      cash: m.beginningCash,
    },
    priorYearSnapshot: {},
    budgetNarrative: {
      missionAndVision: "",
      enrollmentStrategy: "",
      retentionPlan: "",
      riskMitigation: "",
      revenueAssumptions: "",
      staffingPhilosophy: "",
      expenseAssumptions: "",
      growthStrategy: "",
      additionalContext: "",
      inlineRationales: {},
    },
    assumptionFlagResponses: [],
  };
}

const STEP_TITLES = [
  "School profile",
  "Enrollment",
  "Revenue",
  "Staffing",
  "Expenses & facility",
  "Debt & cash",
  "Review & export",
];

function fmtMoney(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FieldText(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  hint?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-[#1E293B] mb-1.5">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        min={props.min}
        max={props.max}
        step={props.step}
        data-testid={props.testId}
        className="w-full px-3 py-2 border border-[#1E293B]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#328555]/30 focus:border-[#328555] text-[#1E293B] bg-white"
      />
      {props.hint ? <span className="block text-xs text-[#1E293B]/50 mt-1">{props.hint}</span> : null}
    </label>
  );
}

function FieldSelect<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testId: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-[#1E293B] mb-1.5">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        data-testid={props.testId}
        className="w-full px-3 py-2 border border-[#1E293B]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#328555]/30 focus:border-[#328555] text-[#1E293B] bg-white"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.hint ? <span className="block text-xs text-[#1E293B]/50 mt-1">{props.hint}</span> : null}
    </label>
  );
}

function FieldToggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        data-testid={props.testId}
        className="mt-0.5 w-4 h-4 text-[#328555] border-[#1E293B]/20 rounded focus:ring-[#328555]/30"
      />
      <div>
        <span className="block text-sm font-semibold text-[#1E293B]">{props.label}</span>
        {props.hint ? <span className="block text-xs text-[#1E293B]/50 mt-0.5">{props.hint}</span> : null}
      </div>
    </label>
  );
}

type FlagSeverity = "critical" | "high" | "caution" | "strong";

interface LenderFlag {
  severity: FlagSeverity;
  label: string;
}

function computeLenderFlags(m: GuestModel, enrollProjection: number[]): LenderFlag[] {
  const flags: LenderFlag[] = [];
  const enroll = enrollProjection;
  const y1Rev =
    m.perStudentTuition * enroll[0] * (m.tuitionCollectionRate / 100) +
    m.perPupilPublicFunding * enroll[0] +
    m.philanthropyAnnual;

  const annualRent = m.monthlyRent * 12;
  const facilityTotal = annualRent + m.annualUtilities + m.annualInsurance;
  const facilityRatio = y1Rev > 0 ? (facilityTotal / y1Rev) * 100 : 0;

  const teacherCount = Math.max(1, Math.ceil(enroll[0] / Math.max(1, m.studentsPerTeacher)));
  let staffingTotal = teacherCount * m.avgTeacherSalary * 1.2565 + m.numAdminStaff * m.avgAdminSalary * 1.2565;
  if (m.founderIsPaidYear1 && m.founderAnnualCompensation > 0 && m.founderCompensationBeginsYear <= 1) {
    staffingTotal += m.founderAnnualCompensation * 1.2565;
  }
  const staffingRatio = y1Rev > 0 ? (staffingTotal / y1Rev) * 100 : 0;

  const totalExpenses = staffingTotal + facilityTotal + m.annualCurriculum + m.annualOtherOpex;
  const netIncome = y1Rev - totalExpenses;

  const totalDebtService = m.existingAnnualDebtService + m.requestedLoanAnnualDebtService;
  const dscr = totalDebtService > 0 ? netIncome / totalDebtService : 0;

  const monthlyCashBurn = totalExpenses / 12;
  const daysCashOnHand = monthlyCashBurn > 0 ? (m.beginningCash / (monthlyCashBurn / 30)) : 999;

  if (!m.founderIsPaidYear1 && m.founderAnnualCompensation > 0) {
    flags.push({ severity: "caution", label: `Founder compensation deferred to Year ${m.founderCompensationBeginsYear}` });
  } else if (!m.founderIsPaidYear1 && m.founderAnnualCompensation === 0) {
    flags.push({ severity: "high", label: "No founder compensation planned — lenders may question sustainability" });
  }

  if (m.schoolStage === "new_school" && m.enrollmentValidationStatus !== "signed_agreements" && m.enrollmentValidationStatus !== "deposits_collected") {
    if (m.depositCount < 10 && m.signedAgreementCount < 10) {
      flags.push({ severity: "high", label: "Fewer than 10 deposits or signed agreements for Year 1" });
    }
  }

  if (m.tuitionCollectionRate >= 100) {
    flags.push({ severity: "caution", label: "Tuition collection modeled at 100%" });
  }

  if (m.schoolStage === "operating_school" && m.retentionRate < 80) {
    flags.push({ severity: "high", label: `Retention rate ${m.retentionRate}% is below 80% for an operating school` });
  }

  if (m.facilityType === "residential") {
    flags.push({ severity: "high", label: "Residential facility — may be ineligible for some lending programs" });
  }

  if (!m.leaseSigned && m.monthlyRent > 0) {
    flags.push({ severity: "high", label: "No signed lease" });
  }

  if (m.occupancyDocumentationStatus === "not_started" || m.occupancyDocumentationStatus === "unknown") {
    flags.push({ severity: "high", label: "No occupancy documentation path" });
  }

  if (m.insuranceStatus === "not_started" || m.insuranceStatus === "unknown") {
    flags.push({ severity: "high", label: "No insurance path" });
  }

  if (facilityRatio > 22) {
    flags.push({ severity: "high", label: `Facility cost is ${fmtPct(facilityRatio)} of revenue (above 22% threshold)` });
  } else if (facilityRatio > 15 && facilityRatio <= 22) {
    flags.push({ severity: "caution", label: `Facility cost is ${fmtPct(facilityRatio)} of revenue (above 15% benchmark)` });
  } else if (facilityRatio <= 15 && facilityRatio > 0) {
    flags.push({ severity: "strong", label: `Facility cost is ${fmtPct(facilityRatio)} of revenue (below 15% benchmark)` });
  }

  if (staffingRatio > 65) {
    flags.push({ severity: "high", label: `Staffing is ${fmtPct(staffingRatio)} of revenue (above 65% threshold)` });
  } else if (staffingRatio > 55 && staffingRatio <= 65) {
    flags.push({ severity: "caution", label: `Staffing is ${fmtPct(staffingRatio)} of revenue (above 55% benchmark)` });
  } else if (staffingRatio <= 55 && staffingRatio > 0) {
    flags.push({ severity: "strong", label: `Staffing is ${fmtPct(staffingRatio)} of revenue (below 55% benchmark)` });
  }

  if (daysCashOnHand < 30) {
    flags.push({ severity: "critical", label: `Days cash on hand: ${Math.round(daysCashOnHand)} (critical — below 30 days)` });
  } else if (daysCashOnHand < 45) {
    flags.push({ severity: "high", label: `Days cash on hand: ${Math.round(daysCashOnHand)} (below 45-day threshold)` });
  } else if (daysCashOnHand < 90) {
    flags.push({ severity: "caution", label: `Days cash on hand: ${Math.round(daysCashOnHand)} (below 90-day benchmark)` });
  } else if (daysCashOnHand >= 90 && daysCashOnHand < 999) {
    flags.push({ severity: "strong", label: `Days cash on hand: ${Math.round(daysCashOnHand)} (above 90-day benchmark)` });
  }

  if (totalDebtService > 0) {
    if (dscr < 1.0) {
      flags.push({ severity: "critical", label: `DSCR is ${dscr.toFixed(2)}x (below 1.0x — cannot cover debt)` });
    } else if (dscr < 1.15) {
      flags.push({ severity: "high", label: `DSCR is ${dscr.toFixed(2)}x (below 1.15x threshold)` });
    } else if (dscr < 1.25) {
      flags.push({ severity: "caution", label: `DSCR is ${dscr.toFixed(2)}x (below 1.25x benchmark)` });
    } else {
      flags.push({ severity: "strong", label: `DSCR is ${dscr.toFixed(2)}x (above 1.25x benchmark)` });
    }
  }

  if (netIncome > 0 && y1Rev > 0) {
    const margin = (netIncome / y1Rev) * 100;
    if (margin > 5) {
      flags.push({ severity: "strong", label: `Projected Year 1 margin: ${fmtPct(margin)}` });
    }
  } else if (netIncome < 0) {
    flags.push({ severity: "high", label: `Year 1 projected deficit: ${fmtMoney(netIncome)}` });
  }

  if (m.leaseSigned && m.leaseInEntityName) {
    flags.push({ severity: "strong", label: "Lease signed and in the school entity's name" });
  }

  if (m.enrollmentValidationStatus === "signed_agreements" && m.signedAgreementCount >= 10) {
    flags.push({ severity: "strong", label: `${m.signedAgreementCount} signed enrollment agreements` });
  } else if (m.enrollmentValidationStatus === "deposits_collected" && m.depositCount >= 10) {
    flags.push({ severity: "strong", label: `${m.depositCount} enrollment deposits collected (avg ${fmtMoney(m.averageDepositAmount)})` });
  }

  if (!m.canWithstand90DayDelay && (m.fundingProfile === "charter_public_funded" || m.fundingProfile === "hybrid_mixed")) {
    flags.push({ severity: "high", label: "Cannot withstand a 90-day public funding delay" });
  }

  return flags;
}

function overallReadiness(flags: LenderFlag[]): { status: string; color: string; Icon: typeof ShieldCheck } {
  const hasCritical = flags.some((f) => f.severity === "critical");
  const highCount = flags.filter((f) => f.severity === "high").length;
  if (hasCritical || highCount >= 4) return { status: "Not Yet Ready", color: "#DC2626", Icon: ShieldX };
  if (highCount >= 2) return { status: "Developing", color: "#D97706", Icon: ShieldAlert };
  return { status: "Strong", color: "#328555", Icon: ShieldCheck };
}

interface ConsultantResult {
  executiveSummary?: string;
  metrics?: Record<string, { value?: number; label?: string; status?: string }>;
  [k: string]: unknown;
}

export function UnderwritingLandingPage() {
  const [model, setModel] = useState<GuestModel>(() => loadGuestModel());
  const [step, setStep] = useState<number>(1);
  const [analysis, setAnalysis] = useState<ConsultantResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [debouncedModel] = useDebounce(model, 600);
  useEffect(() => {
    saveGuestModel(debouncedModel);
  }, [debouncedModel]);

  const enrollProjection = useMemo(
    () => projectEnrollment(model.year1Students, model.annualGrowthPct),
    [model.year1Students, model.annualGrowthPct],
  );

  const lenderFlags = useMemo(
    () => computeLenderFlags(model, enrollProjection),
    [model, enrollProjection],
  );

  const readiness = useMemo(() => overallReadiness(lenderFlags), [lenderFlags]);

  function update<K extends keyof GuestModel>(k: K, v: GuestModel[K]) {
    setModel((m) => ({ ...m, [k]: v }));
  }

  function updateNum<K extends keyof GuestModel>(k: K, raw: string) {
    const n = parseFloat(raw);
    setModel((m) => ({ ...m, [k]: (isNaN(n) ? 0 : n) as GuestModel[K] }));
  }

  function reset() {
    if (window.confirm("Start over and discard your guest model?")) {
      clearGuestModel();
      setModel(EMPTY_MODEL);
      setStep(1);
      setAnalysis(null);
      setAnalysisError(null);
      setExportError(null);
    }
  }

  async function runAnalysis() {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const payload = buildModelDataPayload(model);
      const res = await fetch("/api/public/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Analysis failed (HTTP ${res.status})`);
      }
      const result = (await res.json()) as ConsultantResult;
      setAnalysis(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed.";
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function downloadExcel() {
    setIsExporting(true);
    setExportError(null);
    try {
      const payload = buildModelDataPayload(model);
      const res = await fetch("/api/public/export-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const safeName = (model.schoolName || "guest-model").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || "guest-model";
      const filename = match?.[1] || `${safeName}-Budget.xlsx`;
      downloadBlob(blob, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed.";
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }

  function next() {
    setStep((s) => Math.min(STEP_TITLES.length, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setStep((s) => Math.max(1, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const strengths = lenderFlags.filter((f) => f.severity === "strong").slice(0, 3);
  const concerns = lenderFlags.filter((f) => f.severity === "critical" || f.severity === "high" || f.severity === "caution").slice(0, 3);
  const topConcern = concerns[0];

  return (
    <Layout>
      <section className="bg-gradient-to-b from-[#FAF9F7] to-white py-10 md:py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold tracking-widest text-[#328555] uppercase mb-1">
                Public Underwriting Wizard
              </p>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-[#1E293B]">
                Build your school's financial model
              </h1>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-[#1E293B]/50 hover:text-[#1E293B] flex items-center gap-1"
              data-testid="button-reset-guest-model"
            >
              <RotateCcw className="w-3 h-3" />
              Start over
            </button>
          </div>

          <p className="text-sm text-[#1E293B]/60 mb-6">
            No account needed. Your answers are saved in this browser only. Create a free
            account any time to save your model online and unlock the full multi-step wizard.
          </p>

          <ol className="flex flex-wrap gap-2 mb-8" aria-label="wizard progress">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1;
              const isCurrent = n === step;
              const isDone = n < step;
              return (
                <li key={n} className="flex-1 min-w-[100px]">
                  <button
                    type="button"
                    onClick={() => setStep(n)}
                    data-testid={`step-${n}`}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition text-xs ${
                      isCurrent
                        ? "border-[#328555] bg-[#328555]/5 text-[#328555] font-semibold"
                        : isDone
                          ? "border-[#328555]/30 bg-white text-[#1E293B]/70"
                          : "border-[#1E293B]/10 bg-white text-[#1E293B]/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#328555]" />
                      ) : (
                        <span className="w-4 text-center font-bold">{n}</span>
                      )}
                      <span className="truncate">{title}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="bg-white rounded-2xl border border-[#1E293B]/10 shadow-sm p-5 md:p-8">
            {step === 1 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">School profile</h2>
                <FieldText label="School name" value={model.schoolName} onChange={(v) => update("schoolName", v)} testId="input-school-name" />
                <FieldSelect
                  label="School type"
                  value={model.schoolType}
                  testId="select-school-type"
                  onChange={(v) => update("schoolType", v)}
                  options={[
                    { value: "microschool", label: "Microschool" },
                    { value: "private_school", label: "Private school" },
                    { value: "charter_school", label: "Charter school" },
                    { value: "homeschool_coop", label: "Homeschool co-op" },
                    { value: "learning_pod", label: "Learning pod / lab" },
                    { value: "tutoring_center", label: "Tutoring center" },
                    { value: "catholic_school", label: "Catholic school" },
                    { value: "chesterton_academy", label: "Chesterton Academy" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldSelect
                    label="Stage"
                    value={model.schoolStage}
                    testId="select-school-stage"
                    onChange={(v) => update("schoolStage", v)}
                    options={[
                      { value: "new_school", label: "Planning a new school" },
                      { value: "operating_school", label: "Already operating" },
                    ]}
                  />
                  <FieldSelect
                    label="Model duration"
                    value={model.modelDuration}
                    testId="select-model-duration"
                    onChange={(v) => update("modelDuration", v)}
                    options={[
                      { value: "five_year", label: "5-year projection" },
                      { value: "single_year", label: "Single year (Year 1 only)" },
                    ]}
                  />
                </div>
                <FieldSelect
                  label="Funding profile"
                  value={model.fundingProfile}
                  testId="select-funding-profile"
                  onChange={(v) => update("fundingProfile", v)}
                  options={[
                    { value: "tuition_based", label: "Tuition-based" },
                    { value: "charter_public_funded", label: "Charter / public funding" },
                    { value: "hybrid_mixed", label: "Mixed (tuition + public)" },
                  ]}
                />
                <FieldText label="State" value={model.state} onChange={(v) => update("state", v)} testId="input-state" hint="2-letter code, e.g. WA, TX, FL" />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Enrollment</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Year-1 students" type="number" min={0} value={String(model.year1Students)} onChange={(v) => updateNum("year1Students", v)} testId="input-year1-students" />
                  <FieldText label="Annual growth (%)" type="number" min={-50} step={1} value={String(model.annualGrowthPct)} onChange={(v) => updateNum("annualGrowthPct", v)} testId="input-growth-pct" hint="Year-over-year enrollment growth" />
                </div>
                <div className="bg-[#FAF9F7] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#1E293B]/60 uppercase tracking-wide mb-2">Projected enrollment</p>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {enrollProjection.map((n, i) => (
                      <div key={i} className="bg-white rounded-lg p-2 border border-[#1E293B]/5">
                        <div className="text-xs text-[#1E293B]/50">Y{i + 1}</div>
                        <div className="font-bold text-[#1E293B]" data-testid={`enroll-y${i + 1}`}>{n.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Enrollment validation</h3>
                  <FieldSelect
                    label="Enrollment evidence"
                    value={model.enrollmentValidationStatus}
                    testId="select-enrollment-validation"
                    onChange={(v) => update("enrollmentValidationStatus", v)}
                    options={[
                      { value: "projected", label: "Projected (no commitments yet)" },
                      { value: "waitlist", label: "Waitlist interest" },
                      { value: "verbal_commitments", label: "Verbal commitments" },
                      { value: "deposits_collected", label: "Deposits collected" },
                      { value: "signed_agreements", label: "Signed enrollment agreements" },
                    ]}
                    hint="Lenders weigh enrollment evidence heavily"
                  />
                  {model.enrollmentValidationStatus === "signed_agreements" ? (
                    <div className="mt-3">
                      <FieldText label="Signed agreement count" type="number" min={0} value={String(model.signedAgreementCount)} onChange={(v) => updateNum("signedAgreementCount", v)} testId="input-signed-agreements" />
                    </div>
                  ) : null}
                  {model.enrollmentValidationStatus === "deposits_collected" ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <FieldText label="Number of deposits" type="number" min={0} value={String(model.depositCount)} onChange={(v) => updateNum("depositCount", v)} testId="input-deposit-count" />
                      <FieldText label="Average deposit amount ($)" type="number" min={0} value={String(model.averageDepositAmount)} onChange={(v) => updateNum("averageDepositAmount", v)} testId="input-avg-deposit" />
                    </div>
                  ) : null}

                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <FieldText label="Tuition collection rate (%)" type="number" min={0} max={100} step={1} value={String(model.tuitionCollectionRate)} onChange={(v) => updateNum("tuitionCollectionRate", v)} testId="input-collection-rate" hint="Percent of billed tuition you expect to collect" />
                    <FieldText label="Retention rate (%)" type="number" min={0} max={100} step={1} value={String(model.retentionRate)} onChange={(v) => updateNum("retentionRate", v)} testId="input-retention-rate" hint="Year-over-year student retention" />
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Revenue</h2>
                <p className="text-sm text-[#1E293B]/60">
                  Enter the per-student amounts you'll collect. Leave a row at $0 to skip it. Tuition + public funding stack
                  for hybrid-funded schools.
                </p>
                <FieldText label="Per-student tuition ($/year)" type="number" min={0} step={500} value={String(model.perStudentTuition)} onChange={(v) => updateNum("perStudentTuition", v)} testId="input-tuition" />
                <FieldText label="Per-pupil public funding ($/year)" type="number" min={0} step={500} value={String(model.perPupilPublicFunding)} onChange={(v) => updateNum("perPupilPublicFunding", v)} testId="input-public-funding" hint="ESA, voucher, charter PPF, etc." />
                <FieldText label="Annual philanthropy & grants ($)" type="number" min={0} step={1000} value={String(model.philanthropyAnnual)} onChange={(v) => updateNum("philanthropyAnnual", v)} testId="input-philanthropy" />
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Staffing</h2>
                <p className="text-sm text-[#1E293B]/60">
                  Teacher count is calculated from your students-per-teacher ratio. We assume 18% benefits and 7.65% payroll tax on every role.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Students per teacher" type="number" min={1} step={1} value={String(model.studentsPerTeacher)} onChange={(v) => updateNum("studentsPerTeacher", v)} testId="input-students-per-teacher" />
                  <FieldText label="Average teacher salary ($)" type="number" min={0} step={1000} value={String(model.avgTeacherSalary)} onChange={(v) => updateNum("avgTeacherSalary", v)} testId="input-teacher-salary" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Number of admin / leadership FTEs" type="number" min={0} step={0.5} value={String(model.numAdminStaff)} onChange={(v) => updateNum("numAdminStaff", v)} testId="input-num-admin" />
                  <FieldText label="Average admin salary ($)" type="number" min={0} step={1000} value={String(model.avgAdminSalary)} onChange={(v) => updateNum("avgAdminSalary", v)} testId="input-admin-salary" />
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Founder compensation</h3>
                  <FieldToggle
                    label="Founder is paid in Year 1"
                    checked={model.founderIsPaidYear1}
                    onChange={(v) => update("founderIsPaidYear1", v)}
                    testId="toggle-founder-paid"
                    hint="Is the founder drawing a salary from the school?"
                  />
                  {model.founderIsPaidYear1 ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <FieldText label="Founder annual compensation ($)" type="number" min={0} step={1000} value={String(model.founderAnnualCompensation)} onChange={(v) => updateNum("founderAnnualCompensation", v)} testId="input-founder-comp" />
                      <FieldSelect
                        label="Compensation begins"
                        value={String(model.founderCompensationBeginsYear) as string}
                        testId="select-founder-comp-year"
                        onChange={(v) => updateNum("founderCompensationBeginsYear", v)}
                        options={[
                          { value: "1", label: "Year 1" },
                          { value: "2", label: "Year 2" },
                          { value: "3", label: "Year 3" },
                          { value: "4", label: "Year 4" },
                          { value: "5", label: "Year 5" },
                        ]}
                      />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <FieldText
                        label="Unpaid / volunteer labor description (optional)"
                        value={model.unpaidOrVolunteerLaborDescription}
                        onChange={(v) => update("unpaidOrVolunteerLaborDescription", v)}
                        testId="input-volunteer-description"
                        hint="Briefly describe who is doing unpaid work and their roles"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Expenses & facility</h2>
                <p className="text-sm text-[#1E293B]/60">
                  Capture your big-rock annual costs and facility readiness.
                </p>
                <FieldText label="Monthly rent ($)" type="number" min={0} step={100} value={String(model.monthlyRent)} onChange={(v) => updateNum("monthlyRent", v)} testId="input-monthly-rent" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Annual utilities ($)" type="number" min={0} step={500} value={String(model.annualUtilities)} onChange={(v) => updateNum("annualUtilities", v)} testId="input-utilities" />
                  <FieldText label="Annual insurance ($)" type="number" min={0} step={500} value={String(model.annualInsurance)} onChange={(v) => updateNum("annualInsurance", v)} testId="input-insurance" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Annual curriculum & materials ($)" type="number" min={0} step={500} value={String(model.annualCurriculum)} onChange={(v) => updateNum("annualCurriculum", v)} testId="input-curriculum" />
                  <FieldText label="Other annual operating ($)" type="number" min={0} step={500} value={String(model.annualOtherOpex)} onChange={(v) => updateNum("annualOtherOpex", v)} testId="input-other-opex" />
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Facility readiness</h3>
                  <FieldSelect
                    label="Facility type"
                    value={model.facilityType}
                    testId="select-facility-type"
                    onChange={(v) => update("facilityType", v)}
                    options={[
                      { value: "commercial", label: "Commercial space" },
                      { value: "church_shared", label: "Church / shared space" },
                      { value: "dedicated_school", label: "Dedicated school building" },
                      { value: "community_center", label: "Community center" },
                      { value: "residential", label: "Residential property" },
                      { value: "virtual", label: "Virtual / online" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <FieldToggle label="Lease signed" checked={model.leaseSigned} onChange={(v) => update("leaseSigned", v)} testId="toggle-lease-signed" />
                    <FieldToggle label="Lease in school entity name" checked={model.leaseInEntityName} onChange={(v) => update("leaseInEntityName", v)} testId="toggle-lease-entity" />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-3">
                    <FieldSelect
                      label="Occupancy docs"
                      value={model.occupancyDocumentationStatus}
                      testId="select-occupancy-status"
                      onChange={(v) => update("occupancyDocumentationStatus", v)}
                      options={[
                        { value: "obtained", label: "Obtained" },
                        { value: "in_process", label: "In process" },
                        { value: "not_started", label: "Not started" },
                        { value: "unknown", label: "Unknown" },
                      ]}
                    />
                    <FieldSelect
                      label="Fire inspection"
                      value={model.fireInspectionStatus}
                      testId="select-fire-status"
                      onChange={(v) => update("fireInspectionStatus", v)}
                      options={[
                        { value: "obtained", label: "Passed" },
                        { value: "in_process", label: "Scheduled" },
                        { value: "not_started", label: "Not started" },
                        { value: "unknown", label: "Unknown" },
                      ]}
                    />
                    <FieldSelect
                      label="Insurance"
                      value={model.insuranceStatus}
                      testId="select-insurance-status"
                      onChange={(v) => update("insuranceStatus", v)}
                      options={[
                        { value: "active", label: "Active" },
                        { value: "quoted", label: "Quoted" },
                        { value: "not_started", label: "Not started" },
                        { value: "unknown", label: "Unknown" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {step === 6 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Debt & cash</h2>
                <p className="text-sm text-[#1E293B]/60">
                  Tell us about any existing debt and your cash position. These drive DSCR and cash runway calculations.
                </p>

                <FieldText label="Beginning cash on hand ($)" type="number" min={0} step={1000} value={String(model.beginningCash)} onChange={(v) => updateNum("beginningCash", v)} testId="input-beginning-cash" hint="Cash available before Year 1 operations begin" />

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Existing debt</h3>
                  <FieldToggle label="School has existing debt" checked={model.hasExistingDebt} onChange={(v) => update("hasExistingDebt", v)} testId="toggle-existing-debt" />
                  {model.hasExistingDebt ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <FieldText label="Outstanding balance ($)" type="number" min={0} value={String(model.existingDebtBalance)} onChange={(v) => updateNum("existingDebtBalance", v)} testId="input-existing-debt-balance" />
                      <FieldText label="Annual debt service ($)" type="number" min={0} value={String(model.existingAnnualDebtService)} onChange={(v) => updateNum("existingAnnualDebtService", v)} testId="input-existing-debt-service" hint="Total annual P+I payments" />
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Requested financing</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <FieldText label="Requested loan amount ($)" type="number" min={0} value={String(model.requestedLoanAmount)} onChange={(v) => updateNum("requestedLoanAmount", v)} testId="input-requested-loan" hint="Leave $0 if not seeking a loan" />
                    <FieldText label="Estimated annual debt service ($)" type="number" min={0} value={String(model.requestedLoanAnnualDebtService)} onChange={(v) => updateNum("requestedLoanAnnualDebtService", v)} testId="input-requested-debt-service" hint="Estimated annual P+I on the requested loan" />
                  </div>
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Cash flow considerations</h3>
                  {(model.fundingProfile === "charter_public_funded" || model.fundingProfile === "hybrid_mixed") ? (
                    <>
                      <FieldSelect
                        label="Public funding approval status"
                        value={model.publicFundingApprovalStatus}
                        testId="select-funding-approval"
                        onChange={(v) => update("publicFundingApprovalStatus", v)}
                        options={[
                          { value: "approved", label: "Approved" },
                          { value: "pending", label: "Pending" },
                          { value: "not_applicable", label: "Not applicable" },
                        ]}
                      />
                      <div className="mt-3">
                        <FieldToggle
                          label="Can withstand a 90-day public funding delay"
                          checked={model.canWithstand90DayDelay}
                          onChange={(v) => update("canWithstand90DayDelay", v)}
                          testId="toggle-90day-delay"
                          hint="Many charter payments arrive 60-90 days after the fiscal year starts"
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="mt-3">
                    <FieldToggle
                      label="Expecting a summer revenue gap"
                      checked={model.expectedSummerRevenueGap}
                      onChange={(v) => update("expectedSummerRevenueGap", v)}
                      testId="toggle-summer-gap"
                      hint="Many schools collect tuition only during the academic year"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {step === 7 ? (
              <div className="space-y-6">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Review & export</h2>

                <div className="bg-[#FAF9F7] rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">School</span><span className="font-semibold text-[#1E293B]" data-testid="review-school-name">{model.schoolName || "Untitled School"}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Year-1 students</span><span className="font-semibold text-[#1E293B]" data-testid="review-y1-students">{model.year1Students.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Year-5 students (projected)</span><span className="font-semibold text-[#1E293B]" data-testid="review-y5-students">{enrollProjection[4].toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Per-student tuition</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.perStudentTuition)}/yr</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Tuition collection rate</span><span className="font-semibold text-[#1E293B]">{model.tuitionCollectionRate}%</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Annual rent</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.monthlyRent * 12)}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Beginning cash</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.beginningCash)}</span></div>
                  {model.requestedLoanAmount > 0 ? (
                    <div className="flex justify-between"><span className="text-[#1E293B]/60">Requested loan</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.requestedLoanAmount)}</span></div>
                  ) : null}
                </div>

                <div className="border-2 rounded-xl p-5" style={{ borderColor: `${readiness.color}30` }} data-testid="lender-readiness-snapshot">
                  <h3 className="font-display text-base font-bold text-[#1E293B] mb-4 flex items-center gap-2">
                    <readiness.Icon className="w-5 h-5" style={{ color: readiness.color }} />
                    Lender Readiness Snapshot
                  </h3>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-semibold text-[#1E293B]/60">Overall:</span>
                    <span className="px-3 py-1 rounded-full text-sm font-bold text-white" style={{ backgroundColor: readiness.color }} data-testid="readiness-status">
                      {readiness.status}
                    </span>
                  </div>

                  {strengths.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-[#328555] uppercase tracking-wide mb-2">Strengths</p>
                      <ul className="space-y-1">
                        {strengths.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]/80">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#328555] shrink-0" />
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {concerns.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-[#D97706] uppercase tracking-wide mb-2">Lender concerns</p>
                      <ul className="space-y-1">
                        {concerns.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]/80">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: f.severity === "critical" ? "#DC2626" : f.severity === "high" ? "#D97706" : "#CA8A04" }} />
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {topConcern ? (
                    <div className="bg-[#FEF3C7] border border-[#D97706]/20 rounded-lg p-3">
                      <p className="text-xs font-bold text-[#92400E] uppercase tracking-wide mb-1">Suggested next fix</p>
                      <p className="text-sm text-[#92400E]">{topConcern.label}</p>
                    </div>
                  ) : null}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={isAnalyzing}
                    data-testid="button-run-analysis"
                    className="bg-[#1E293B] hover:bg-[#0f172a] disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? "Analyzing…" : "Run readiness analysis"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadExcel}
                    disabled={isExporting}
                    data-testid="button-download-excel"
                    className="bg-[#328555] hover:bg-[#266a44] disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isExporting ? "Generating…" : "Download Excel workbook"}
                  </button>
                </div>

                {analysisError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" data-testid="text-analysis-error">{analysisError}</p>
                ) : null}
                {exportError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" data-testid="text-export-error">{exportError}</p>
                ) : null}

                {analysis ? (
                  <div className="bg-white border-2 border-[#328555]/20 rounded-xl p-5" data-testid="card-analysis-result">
                    <h3 className="font-display text-base font-bold text-[#1E293B] mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#328555]" />
                      Readiness summary
                    </h3>
                    {analysis.executiveSummary ? (
                      <p className="text-sm text-[#1E293B]/80 leading-relaxed whitespace-pre-line">{analysis.executiveSummary}</p>
                    ) : (
                      <p className="text-sm text-[#1E293B]/60">Analysis complete. Download the Excel workbook for full detail.</p>
                    )}
                  </div>
                ) : null}

                <div className="bg-gradient-to-br from-[#328555]/5 to-[#0D9488]/5 border border-[#328555]/20 rounded-xl p-5">
                  <h3 className="font-display text-base font-bold text-[#1E293B] mb-2">Save your model online</h3>
                  <p className="text-sm text-[#1E293B]/70 mb-4">
                    Create a free account to save your model server-side, return on any device, share it with
                    your board, and unlock the full multi-step wizard with scenario planning, lender packets,
                    and PDF reports.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Link
                      href="/register"
                      className="bg-[#328555] hover:bg-[#266a44] text-white px-5 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition"
                      data-testid="link-register-from-underwriting"
                    >
                      Create free account
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href="/login"
                      className="bg-white border border-[#1E293B]/15 hover:border-[#328555] text-[#1E293B] px-5 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center transition"
                      data-testid="link-login-from-underwriting"
                    >
                      I already have an account
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#1E293B]/10">
              <button
                type="button"
                onClick={back}
                disabled={step === 1}
                data-testid="button-back"
                className="text-sm text-[#1E293B]/70 hover:text-[#1E293B] disabled:opacity-30 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="text-xs text-[#1E293B]/50">
                Step {step} of {STEP_TITLES.length}
              </div>
              {step < STEP_TITLES.length ? (
                <button
                  type="button"
                  onClick={next}
                  data-testid="button-next"
                  className="bg-[#328555] hover:bg-[#266a44] text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1.5 transition"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-xs text-[#1E293B]/40 italic">Final step</span>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-[#1E293B]/40 mt-6">
            Questions?{" "}
            <a href="mailto:hello@schoolstack.ai" className="text-[#328555] font-semibold hover:underline">
              hello@schoolstack.ai
            </a>
          </p>
        </div>
      </section>
    </Layout>
  );
}

export default UnderwritingLandingPage;
