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
import { assertEveryNextStep } from "@workspace/finance";

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

export interface GuestModel {
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
  existingDebtInterestRate: number;
  requestedLoanAmount: number;
  requestedLoanAnnualDebtService: number;
  requestedLoanInterestRate: number;

  beginningCash: number;
  expectedSummerRevenueGap: boolean;
  publicFundingApprovalStatus: PublicFundingApprovalStatus;
  canWithstand90DayDelay: boolean;
}

export const EMPTY_MODEL: GuestModel = {
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
  existingDebtInterestRate: 0,
  requestedLoanAmount: 0,
  requestedLoanAnnualDebtService: 0,
  requestedLoanInterestRate: 0,

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

export function projectEnrollment(year1: number, growthPct: number): number[] {
  const g = 1 + growthPct / 100;
  return [
    Math.round(year1),
    Math.round(year1 * g),
    Math.round(year1 * g * g),
    Math.round(year1 * g * g * g),
    Math.round(year1 * g * g * g * g),
  ];
}

export function buildModelDataPayload(m: GuestModel): Record<string, unknown> {
  const enroll = projectEnrollment(m.year1Students, m.annualGrowthPct);
  const teachersPerYear = enroll.map((s) =>
    Math.max(1, Math.ceil(s / Math.max(1, m.studentsPerTeacher))),
  );

  const revenueRows: Array<Record<string, unknown>> = [];
  if (m.perStudentTuition > 0) {
    // Pass raw sticker tuition + collectionRate; the scenario engine applies
    // collection slippage (Task #599) so every entry point — wizard, full
    // model builder, API — handles it the same way.
    const tuition = m.perStudentTuition;
    revenueRows.push({
      id: "rev_tuition",
      category: "tuition_and_fees",
      lineItem: "Tuition revenue",
      enabled: true,
      driverType: "per_student",
      amounts: [tuition, tuition, tuition, tuition, tuition],
      escalationRate: 3,
      collectionRate: m.tuitionCollectionRate,
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
      flatAnnualDebtService: m.existingAnnualDebtService,
      flatInterestRate: m.existingDebtInterestRate > 0 ? m.existingDebtInterestRate : undefined,
      flatStartingBalance: m.existingDebtBalance > 0 ? m.existingDebtBalance : undefined,
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
      flatAnnualDebtService: m.requestedLoanAnnualDebtService,
      flatInterestRate: m.requestedLoanInterestRate > 0 ? m.requestedLoanInterestRate : undefined,
      flatStartingBalance: m.requestedLoanAmount > 0 ? m.requestedLoanAmount : undefined,
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
  // Task #658 — required coach-voice next step shown beneath each flag.
  // For "strong" flags this is a brief encouragement-and-keep-going line;
  // for caution/high/critical it's the concrete fix the founder can make
  // right now in this same wizard.
  nextStep: string;
}

export function computeLenderFlags(m: GuestModel, enrollProjection: number[]): LenderFlag[] {
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

  // Task #658 — every flag carries a coach-voice label and a concrete
  // `nextStep` the founder can act on inside this wizard. Tone target:
  // describe the current state plainly, then point at the next move.
  // No verdict words ("approved", "declined", "ineligible", "rejected").
  if (!m.founderIsPaidYear1 && m.founderAnnualCompensation > 0) {
    flags.push({
      severity: "caution",
      label: `Your model defers founder compensation to Year ${m.founderCompensationBeginsYear} — let's make sure that's intentional.`,
      nextStep: `Open Step 2 (You) and either bring founder compensation into Year 1 at a market rate, or add a note explaining why deferring to Year ${m.founderCompensationBeginsYear} fits your runway.`,
    });
  } else if (!m.founderIsPaidYear1 && m.founderAnnualCompensation === 0) {
    flags.push({
      severity: "high",
      label: "Your model shows no founder compensation — lenders look for a sustainable plan here.",
      nextStep: "Open Step 2 (You) and add a market-rate founder salary (typical range $70K-$120K), even if you intend to discount it personally — note the discount separately.",
    });
  }

  if (m.schoolStage === "new_school" && m.enrollmentValidationStatus !== "signed_agreements" && m.enrollmentValidationStatus !== "deposits_collected") {
    if (m.depositCount < 10 && m.signedAgreementCount < 10) {
      flags.push({
        severity: "high",
        label: "Year 1 currently has fewer than 10 deposits or signed agreements — let's strengthen the demand evidence.",
        nextStep: "Open Step 4 (Enrollment) and either log your current signed agreements / deposits, or note the recruiting milestones you'll hit before opening day.",
      });
    }
  }

  if (m.tuitionCollectionRate >= 100) {
    flags.push({
      severity: "caution",
      label: "Your model assumes 100% tuition collection — most schools see some shortfall.",
      nextStep: "Open Step 5 (Revenue) and set your tuition collection rate to a realistic 92-97% so the model carries a small cushion.",
    });
  }

  if (m.schoolStage === "operating_school" && m.retentionRate < 80) {
    flags.push({
      severity: "high",
      label: `Your retention rate of ${m.retentionRate}% is below the 80% benchmark for operating schools — let's see what's driving it.`,
      nextStep: "Open Step 4 (Enrollment) and either revise the retention rate upward with a recovery plan, or paste in the historical retention numbers and the actions you're taking to lift them.",
    });
  }

  if (m.facilityType === "residential") {
    flags.push({
      severity: "high",
      label: "You've selected a residential facility — some lending programs limit eligibility on residential conversions.",
      nextStep: "Open Step 7 (Facility) and confirm zoning + occupancy classification for the residential site, and document the lending programs you've already pre-screened for the property type.",
    });
  }

  if (!m.leaseSigned && m.monthlyRent > 0) {
    flags.push({
      severity: "high",
      label: "Your model assumes lease costs but the lease isn't signed yet — let's lock that down.",
      nextStep: "Open Step 7 (Facility) and either upload the signed lease, or add the target signing date and the LOI status you're working from.",
    });
  }

  if (m.occupancyDocumentationStatus === "not_started" || m.occupancyDocumentationStatus === "unknown") {
    flags.push({
      severity: "high",
      label: "Your occupancy documentation isn't in place yet — it's the kind of question reviewers ask up front.",
      nextStep: "Open Step 7 (Facility) and outline the path to occupancy (CO inspection, fire marshal, ADA), with target dates next to each.",
    });
  }

  if (m.insuranceStatus === "not_started" || m.insuranceStatus === "unknown") {
    flags.push({
      severity: "high",
      label: "Insurance isn't set up yet — let's at least sketch the path.",
      nextStep: "Open Step 7 (Facility) and add either a placeholder broker / quote or the carrier you'll work with, plus the target binding date.",
    });
  }

  if (facilityRatio > 22) {
    flags.push({
      severity: "high",
      label: `Facility cost is ${fmtPct(facilityRatio)} of revenue, above the 22% benchmark — let's right-size the footprint.`,
      nextStep: "Open Step 7 (Facility) and trim a fixed-cost line (smaller square footage, shared space, or phased build-out) until facility lands under 20% of Year 1 revenue.",
    });
  } else if (facilityRatio > 15 && facilityRatio <= 22) {
    flags.push({
      severity: "caution",
      label: `Facility cost is ${fmtPct(facilityRatio)} of revenue — workable, and close to the 15% benchmark.`,
      nextStep: "Open Step 7 (Facility) and look for one small reduction (renegotiate utilities, reduce one shared space) to bring facility under 15% of Year 1 revenue.",
    });
  } else if (facilityRatio <= 15 && facilityRatio > 0) {
    flags.push({
      severity: "strong",
      label: `Facility cost is ${fmtPct(facilityRatio)} of revenue — comfortably under the 15% benchmark.`,
      nextStep: "Keep an eye on facility costs as enrollment grows; revisit Step 7 (Facility) before any expansion or lease renewal.",
    });
  }

  if (staffingRatio > 65) {
    flags.push({
      severity: "high",
      label: `Staffing is ${fmtPct(staffingRatio)} of revenue, above the 65% benchmark — let's tighten the staffing plan.`,
      nextStep: "Open Step 6 (Staffing) and either move one Year 1 role to a Year 2 start date, or convert a full-time role to part-time, until staffing lands under 65% of revenue.",
    });
  } else if (staffingRatio > 55 && staffingRatio <= 65) {
    flags.push({
      severity: "caution",
      label: `Staffing is ${fmtPct(staffingRatio)} of revenue — within range, just shy of the 55% benchmark.`,
      nextStep: "Open Step 6 (Staffing) and look for one role you can defer to Year 2, or one to convert to part-time, to bring staffing closer to 55% of revenue.",
    });
  } else if (staffingRatio <= 55 && staffingRatio > 0) {
    flags.push({
      severity: "strong",
      label: `Staffing is ${fmtPct(staffingRatio)} of revenue — comfortably under the 55% benchmark.`,
      nextStep: "Keep an eye on staffing as you grow; revisit Step 6 (Staffing) every time you add or change a role.",
    });
  }

  if (daysCashOnHand < 30) {
    flags.push({
      severity: "critical",
      label: `You have ${Math.round(daysCashOnHand)} days cash on hand — let's build a cushion before opening day.`,
      nextStep: "Open Step 2 (You) and either raise opening cash via startup fundraising / line of credit, or trim Step 8 (Operating Expenses) until cash on hand clears 45 days.",
    });
  } else if (daysCashOnHand < 45) {
    flags.push({
      severity: "high",
      label: `You have ${Math.round(daysCashOnHand)} days cash on hand — under the 45-day cushion most lenders look for.`,
      nextStep: "Open Step 2 (You) and raise opening cash, or trim Step 8 (Operating Expenses), to push cash on hand past 45 days.",
    });
  } else if (daysCashOnHand < 90) {
    flags.push({
      severity: "caution",
      label: `You have ${Math.round(daysCashOnHand)} days cash on hand — workable, and approaching the 90-day benchmark.`,
      nextStep: "Open Step 2 (You) and look for a small bump in opening cash so you clear the 90-day cushion comfortably.",
    });
  } else if (daysCashOnHand >= 90 && daysCashOnHand < 999) {
    flags.push({
      severity: "strong",
      label: `You have ${Math.round(daysCashOnHand)} days cash on hand — comfortably above the 90-day benchmark.`,
      nextStep: "Keep this cushion as enrollment grows; re-check Step 2 (You) before any major capex or hiring decision.",
    });
  }

  if (totalDebtService > 0) {
    if (dscr < 1.0) {
      flags.push({
        severity: "critical",
        label: `Estimated DSCR is ${dscr.toFixed(2)}x — operating income doesn't yet cover debt service.`,
        nextStep: "Open Step 9 (Debt) and lower the loan principal, extend the term, or phase the capex into smaller tranches until DSCR clears 1.15x.",
      });
    } else if (dscr < 1.15) {
      flags.push({
        severity: "high",
        label: `Estimated DSCR is ${dscr.toFixed(2)}x — under the 1.15x cushion most lenders look for.`,
        nextStep: "Open Step 9 (Debt) and lower the loan principal or extend the term, or revisit Step 5 (Revenue) to lift operating income, until DSCR clears 1.15x.",
      });
    } else if (dscr < 1.25) {
      flags.push({
        severity: "caution",
        label: `Estimated DSCR is ${dscr.toFixed(2)}x — workable, just shy of the 1.25x benchmark.`,
        nextStep: "Open Step 5 (Revenue) and lift operating income by 5-10%, or revisit Step 9 (Debt) for a slightly better term, until DSCR clears 1.25x.",
      });
    } else {
      flags.push({
        severity: "strong",
        label: `Estimated DSCR is ${dscr.toFixed(2)}x — comfortably above the 1.25x benchmark.`,
        nextStep: "Keep an eye on DSCR as you finalize loan terms; re-check Step 9 (Debt) before signing.",
      });
    }
  }

  if (netIncome > 0 && y1Rev > 0) {
    const margin = (netIncome / y1Rev) * 100;
    if (margin > 5) {
      flags.push({
        severity: "strong",
        label: `Projected Year 1 margin is ${fmtPct(margin)} — a healthy starting point.`,
        nextStep: "Keep this margin protected as you grow; revisit Steps 5-8 every time enrollment or staffing changes meaningfully.",
      });
    }
  } else if (netIncome < 0) {
    flags.push({
      severity: "high",
      label: `Year 1 currently shows a deficit of ${fmtMoney(netIncome)} — let's close it together.`,
      nextStep: "Open Step 8 (Operating Expenses) and trim a fixed-cost line, or revisit Step 5 (Revenue) to add a tuition or per-pupil source, until Year 1 net income clears zero.",
    });
  }

  if (m.leaseSigned && m.leaseInEntityName) {
    flags.push({
      severity: "strong",
      label: "Lease is signed and held in the school entity's name — exactly what reviewers want to see.",
      nextStep: "Keep the signed lease handy in your readiness materials; revisit Step 7 (Facility) on renewal.",
    });
  }

  if (m.enrollmentValidationStatus === "signed_agreements" && m.signedAgreementCount >= 10) {
    flags.push({
      severity: "strong",
      label: `${m.signedAgreementCount} signed enrollment agreements — strong demand evidence.`,
      nextStep: "Keep adding signed agreements through opening day; revisit Step 4 (Enrollment) as new commitments come in.",
    });
  } else if (m.enrollmentValidationStatus === "deposits_collected" && m.depositCount >= 10) {
    flags.push({
      severity: "strong",
      label: `${m.depositCount} enrollment deposits collected (avg ${fmtMoney(m.averageDepositAmount)}) — strong demand evidence.`,
      nextStep: "Keep collecting deposits through opening day; revisit Step 4 (Enrollment) as deposit count grows.",
    });
  }

  if (!m.canWithstand90DayDelay && (m.fundingProfile === "charter_public_funded" || m.fundingProfile === "hybrid_mixed")) {
    flags.push({
      severity: "high",
      label: "Your model can't currently absorb a 90-day public funding delay — common when the state pays in arrears.",
      nextStep: "Open Step 2 (You) and raise opening cash, or arrange a short-term line of credit in Step 9 (Debt), so you can carry payroll through the first state disbursement.",
    });
  }

  // Task #686 — guardrail: every emitted LenderFlag must carry a
  // concrete coach-voice nextStep.
  return assertEveryNextStep(flags, "LenderFlag") as LenderFlag[];
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
        throw new Error(body.error || `Analysis didn't complete (HTTP ${res.status})`);
      }
      const result = (await res.json()) as ConsultantResult;
      setAnalysis(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis didn't complete.";
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
        throw new Error(body.error || `Export didn't complete (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const safeName = (model.schoolName || "guest-model").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || "guest-model";
      const filename = match?.[1] || `${safeName}-Budget.xlsx`;
      downloadBlob(blob, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export didn't complete.";
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
                Founder Quick-Start Wizard
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
                <p className="text-sm text-[#1E293B]/60" data-testid="help-enrollment">Use the number of students you reasonably expect, not your dream number. If you have deposits, signed agreements, or returning students, use those as your anchor.</p>
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
                    <FieldText label="Tuition collection rate (%)" type="number" min={0} max={100} step={1} value={String(model.tuitionCollectionRate)} onChange={(v) => updateNum("tuitionCollectionRate", v)} testId="input-collection-rate" hint="Applied to annual revenue: effective tuition = sticker × collection rate" />
                    <FieldText label="Retention rate (%)" type="number" min={0} max={100} step={1} value={String(model.retentionRate)} onChange={(v) => updateNum("retentionRate", v)} testId="input-retention-rate" hint="Year-over-year student retention" />
                  </div>
                  <p className="text-xs text-[#1E293B]/50 mt-2" data-testid="collection-rate-note">This simplified guest model applies collection rate to projected tuition revenue. The full model may handle timing and receivables in more detail.</p>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Revenue</h2>
                <p className="text-sm text-[#1E293B]/60" data-testid="help-revenue">Enter the annual amount per student or annual fixed amount. The model will do the multiplication.</p>
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
                <p className="text-sm text-[#1E293B]/60" data-testid="help-staffing">Include the people actually doing the work. If the founder is unpaid at first, show when founder pay begins so the model reflects long-term sustainability.</p>
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
                    onChange={(v) => {
                      update("founderIsPaidYear1", v);
                      if (v) {
                        update("founderCompensationBeginsYear", 1);
                      } else if (model.founderCompensationBeginsYear <= 1) {
                        update("founderCompensationBeginsYear", 2);
                      }
                    }}
                    testId="toggle-founder-paid"
                    hint="Is the founder drawing a salary from the school?"
                  />
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <FieldText
                      label={model.founderIsPaidYear1 ? "Founder annual compensation ($)" : "Founder annual compensation ($, when it begins)"}
                      type="number"
                      min={0}
                      step={1000}
                      value={String(model.founderAnnualCompensation)}
                      onChange={(v) => updateNum("founderAnnualCompensation", v)}
                      testId="input-founder-comp"
                      hint={model.founderIsPaidYear1 ? undefined : "What the founder will be paid once compensation kicks in. Leave at $0 if no founder pay is planned."}
                    />
                    <FieldSelect
                      label="Compensation begins"
                      value={String(model.founderCompensationBeginsYear) as string}
                      testId="select-founder-comp-year"
                      onChange={(v) => updateNum("founderCompensationBeginsYear", v)}
                      options={
                        model.founderIsPaidYear1
                          ? [
                              { value: "1", label: "Year 1" },
                              { value: "2", label: "Year 2" },
                              { value: "3", label: "Year 3" },
                              { value: "4", label: "Year 4" },
                              { value: "5", label: "Year 5" },
                            ]
                          : [
                              { value: "2", label: "Year 2" },
                              { value: "3", label: "Year 3" },
                              { value: "4", label: "Year 4" },
                              { value: "5", label: "Year 5" },
                            ]
                      }
                    />
                  </div>
                  {!model.founderIsPaidYear1 ? (
                    <div className="mt-3">
                      <FieldText
                        label="Unpaid / volunteer labor description (optional)"
                        value={model.unpaidOrVolunteerLaborDescription}
                        onChange={(v) => update("unpaidOrVolunteerLaborDescription", v)}
                        testId="input-volunteer-description"
                        hint="Briefly describe who is doing unpaid work and their roles"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Expenses & facility</h2>
                <p className="text-sm text-[#1E293B]/60" data-testid="help-expenses">Include costs you must pay even if enrollment is lower than expected, especially rent, insurance, software, payroll, and professional services.</p>
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
                <p className="text-sm text-[#1E293B]/60" data-testid="help-cash">Annual profit does not always mean you have enough cash each month. Watch for months when expenses arrive before revenue.</p>
                <p className="text-sm text-[#1E293B]/60">
                  Tell us about any existing debt and your cash position. These drive estimated DSCR and cash runway calculations.
                </p>

                <FieldText label="Beginning cash on hand ($)" type="number" min={0} step={1000} value={String(model.beginningCash)} onChange={(v) => updateNum("beginningCash", v)} testId="input-beginning-cash" hint="Cash available before Year 1 operations begin" />

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Existing debt</h3>
                  <FieldToggle label="School has existing debt" checked={model.hasExistingDebt} onChange={(v) => update("hasExistingDebt", v)} testId="toggle-existing-debt" />
                  {model.hasExistingDebt ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <FieldText label="Outstanding balance ($)" type="number" min={0} value={String(model.existingDebtBalance)} onChange={(v) => updateNum("existingDebtBalance", v)} testId="input-existing-debt-balance" />
                      <FieldText label="Annual debt service ($)" type="number" min={0} value={String(model.existingAnnualDebtService)} onChange={(v) => updateNum("existingAnnualDebtService", v)} testId="input-existing-debt-service" hint="Total annual P+I payments" />
                      <FieldText label="Interest rate (%) — optional" type="number" min={0} step={0.1} value={String(model.existingDebtInterestRate)} onChange={(v) => updateNum("existingDebtInterestRate", v)} testId="input-existing-debt-rate" hint="Lets us split the payment into Interest vs. Principal on the Debt Schedule" />
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-[#1E293B]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#1E293B] mb-3">Requested financing</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <FieldText label="Requested loan amount ($)" type="number" min={0} value={String(model.requestedLoanAmount)} onChange={(v) => updateNum("requestedLoanAmount", v)} testId="input-requested-loan" hint="Leave $0 if not seeking a loan" />
                    <FieldText label="Estimated annual debt service ($)" type="number" min={0} value={String(model.requestedLoanAnnualDebtService)} onChange={(v) => updateNum("requestedLoanAnnualDebtService", v)} testId="input-requested-debt-service" hint="Estimated annual P+I on the requested loan" />
                    <FieldText label="Interest rate (%) — optional" type="number" min={0} step={0.1} value={String(model.requestedLoanInterestRate)} onChange={(v) => updateNum("requestedLoanInterestRate", v)} testId="input-requested-loan-rate" hint="Lets us split the payment into Interest vs. Principal on the Debt Schedule" />
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
                <p className="text-sm text-[#1E293B]/60" data-testid="help-export">This workbook is a planning tool. It can support conversations with lenders, funders, boards, and advisors, but it is not a loan application or funding decision.</p>

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
                    Loan Readiness Snapshot
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
                      <ul className="space-y-2">
                        {strengths.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]/80">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#328555] shrink-0" />
                            <div>
                              <div>{f.label}</div>
                              {/* Task #658 — every flag carries a coach-voice next step */}
                              <div className="text-xs text-[#328555] mt-0.5">
                                <span className="font-semibold">Next step:</span> {f.nextStep}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {concerns.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-[#D97706] uppercase tracking-wide mb-2">Things to address before talking to a lender</p>
                      <ul className="space-y-2">
                        {concerns.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]/80">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: f.severity === "critical" ? "#DC2626" : f.severity === "high" ? "#D97706" : "#CA8A04" }} />
                            <div>
                              <div>{f.label}</div>
                              <div className="text-xs text-[#92400E] mt-0.5">
                                <span className="font-semibold">Next step:</span> {f.nextStep}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {topConcern ? (
                    <div className="bg-[#FEF3C7] border border-[#D97706]/20 rounded-lg p-3">
                      <p className="text-xs font-bold text-[#92400E] uppercase tracking-wide mb-1">Suggested next fix</p>
                      <p className="text-sm text-[#92400E]">{topConcern.label}</p>
                      <p className="text-xs text-[#92400E] mt-1">
                        <span className="font-semibold">Next step:</span> {topConcern.nextStep}
                      </p>
                    </div>
                  ) : null}

                  <p className="text-xs text-[#1E293B]/40 mt-3" data-testid="dscr-disclaimer">Estimated DSCR based on the annual debt service you entered. The full Founder Planning Workbook computes DSCR from modeled loan terms.</p>
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
                    your board, and unlock the full multi-step wizard with scenario planning, the Lender Conversation Snapshot,
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
