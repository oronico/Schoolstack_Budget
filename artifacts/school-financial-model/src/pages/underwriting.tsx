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

/**
 * Assemble the guest model into the canonical wizard data shape that the
 * /api/public/* endpoints already accept. The PublicExportUnderwritingBody
 * Zod schema treats the body as `{ [key: string]: unknown }` and the
 * underlying engines fill in defaults for anything we omit, so partial
 * payloads still produce valid Excel + consultant analysis output.
 */
function buildModelDataPayload(m: GuestModel): Record<string, unknown> {
  const enroll = projectEnrollment(m.year1Students, m.annualGrowthPct);
  const teachersPerYear = enroll.map((s) =>
    Math.max(1, Math.ceil(s / Math.max(1, m.studentsPerTeacher))),
  );

  const revenueRows: Array<Record<string, unknown>> = [];
  if (m.perStudentTuition > 0) {
    revenueRows.push({
      id: "rev_tuition",
      category: "tuition",
      lineItem: "Tuition revenue",
      enabled: true,
      driverType: "per_student",
      amounts: enroll.map((s) => Math.round(s * m.perStudentTuition)),
      escalationRate: 3,
    });
  }
  if (m.perPupilPublicFunding > 0) {
    revenueRows.push({
      id: "rev_ppf",
      category: "publicFunding",
      lineItem: "Per-pupil public funding",
      enabled: true,
      driverType: "per_student",
      amounts: enroll.map((s) => Math.round(s * m.perPupilPublicFunding)),
      escalationRate: 2,
    });
  }
  if (m.philanthropyAnnual > 0) {
    revenueRows.push({
      id: "rev_phil",
      category: "philanthropy",
      lineItem: "Philanthropy & grants",
      enabled: true,
      driverType: "fixed",
      amounts: [m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual, m.philanthropyAnnual],
    });
  }

  const staffingRows: Array<Record<string, unknown>> = [];
  staffingRows.push({
    id: "staff_teachers",
    roleName: "Lead teacher",
    functionCategory: "instruction",
    employmentType: "full_time",
    fte: teachersPerYear[0],
    annualizedRate: m.avgTeacherSalary,
    benefitsEligible: true,
    benefitsRate: 0.18,
    payrollTaxRate: 0.0765,
    payrollLike: false,
    notes: `Scales with enrollment at 1 teacher per ${m.studentsPerTeacher} students`,
  });
  if (m.numAdminStaff > 0 && m.avgAdminSalary > 0) {
    staffingRows.push({
      id: "staff_admin",
      roleName: "Head of school / admin",
      functionCategory: "administration",
      employmentType: "full_time",
      fte: m.numAdminStaff,
      annualizedRate: m.avgAdminSalary,
      benefitsEligible: true,
      benefitsRate: 0.18,
      payrollTaxRate: 0.0765,
      payrollLike: false,
      notes: "",
    });
  }

  const expenseRows: Array<Record<string, unknown>> = [];
  if (m.annualUtilities > 0) {
    expenseRows.push({
      id: "exp_utilities",
      category: "facilities",
      lineItem: "Utilities",
      enabled: true,
      driverType: "fixed",
      amounts: [m.annualUtilities, m.annualUtilities * 1.03, m.annualUtilities * 1.06, m.annualUtilities * 1.09, m.annualUtilities * 1.12].map(Math.round),
    });
  }
  if (m.annualInsurance > 0) {
    expenseRows.push({
      id: "exp_insurance",
      category: "facilities",
      lineItem: "Insurance",
      enabled: true,
      driverType: "fixed",
      amounts: [m.annualInsurance, m.annualInsurance * 1.05, m.annualInsurance * 1.10, m.annualInsurance * 1.16, m.annualInsurance * 1.22].map(Math.round),
    });
  }
  if (m.annualCurriculum > 0) {
    expenseRows.push({
      id: "exp_curriculum",
      category: "instruction",
      lineItem: "Curriculum & materials",
      enabled: true,
      driverType: "per_student",
      amounts: enroll.map((s) => Math.round(s * (m.annualCurriculum / Math.max(1, m.year1Students)))),
    });
  }
  if (m.annualOtherOpex > 0) {
    expenseRows.push({
      id: "exp_other",
      category: "general",
      lineItem: "Other operating expenses",
      enabled: true,
      driverType: "fixed",
      amounts: [m.annualOtherOpex, m.annualOtherOpex * 1.03, m.annualOtherOpex * 1.06, m.annualOtherOpex * 1.09, m.annualOtherOpex * 1.12].map(Math.round),
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
      locationSecured: m.monthlyRent > 0,
      ownershipType: m.monthlyRent > 0 ? "rent" : undefined,
      monthlyRent: m.monthlyRent,
      annualRentEscalation: 3,
      postLeaseRenewalBump: 15,
      isNNNLease: false,
      hasMortgage: false,
      mortgageMonthlyPayment: 0,
    },
    enrollment: { year1: enroll[0], year2: enroll[1], year3: enroll[2], year4: enroll[3], year5: enroll[4] },
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
    staffing: { studentsPerTeacher: m.studentsPerTeacher, offersBenefits: true, benefitsRate: 0.18, payrollTaxRate: 0.0765 },
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
    capitalAndDebtRows: [],
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
  "Expenses",
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
                <li key={n} className="flex-1 min-w-[120px]">
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
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-5">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Expenses</h2>
                <p className="text-sm text-[#1E293B]/60">
                  Capture your big-rock annual costs. Curriculum scales per student; the others stay flat.
                </p>
                <FieldText label="Monthly rent ($)" type="number" min={0} step={100} value={String(model.monthlyRent)} onChange={(v) => updateNum("monthlyRent", v)} testId="input-monthly-rent" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Annual utilities ($)" type="number" min={0} step={500} value={String(model.annualUtilities)} onChange={(v) => updateNum("annualUtilities", v)} testId="input-utilities" />
                  <FieldText label="Annual insurance ($)" type="number" min={0} step={500} value={String(model.annualInsurance)} onChange={(v) => updateNum("annualInsurance", v)} testId="input-insurance" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldText label="Annual curriculum & materials ($)" type="number" min={0} step={500} value={String(model.annualCurriculum)} onChange={(v) => updateNum("annualCurriculum", v)} testId="input-curriculum" hint="Scales with enrollment" />
                  <FieldText label="Other annual operating ($)" type="number" min={0} step={500} value={String(model.annualOtherOpex)} onChange={(v) => updateNum("annualOtherOpex", v)} testId="input-other-opex" />
                </div>
              </div>
            ) : null}

            {step === 6 ? (
              <div className="space-y-6">
                <h2 className="font-display text-lg md:text-xl font-bold text-[#1E293B]">Review & export</h2>

                <div className="bg-[#FAF9F7] rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">School</span><span className="font-semibold text-[#1E293B]" data-testid="review-school-name">{model.schoolName || "Untitled School"}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Year-1 students</span><span className="font-semibold text-[#1E293B]" data-testid="review-y1-students">{model.year1Students.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Year-5 students (projected)</span><span className="font-semibold text-[#1E293B]" data-testid="review-y5-students">{enrollProjection[4].toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Per-student tuition</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.perStudentTuition)}/yr</span></div>
                  <div className="flex justify-between"><span className="text-[#1E293B]/60">Annual rent</span><span className="font-semibold text-[#1E293B]">{fmtMoney(model.monthlyRent * 12)}</span></div>
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
