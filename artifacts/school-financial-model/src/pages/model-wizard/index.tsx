import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo, type ComponentType } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, X, Building2, AlertCircle, Sparkles } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE } from "@workspace/finance";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { MicroLessonContainer } from "@/components/coaching/MicroLessonCard";
import { WhatThisMeansInYourBooks } from "@/components/coaching/WhatThisMeansInYourBooks";
import { WizardPrepChecklist } from "@/components/coaching/WizardPrepChecklist";
import { useAuth } from "@/lib/auth-context";
import { FounderPersonaPrompt } from "@/components/coaching/FounderPersonaPrompt";
import { hasCompletePersona, isYetToLaunch } from "@/lib/coaching/founder-persona";

import { fullModelSchema, type FullModelData } from "./schema";
import { migrateGrantsToPhilanthropy, type RevenueRowData } from "@/lib/revenue-defaults";
import { WhatIfTrigger } from "@/components/whatif/WhatIfTrigger";
import { UndoLastAppliedDecisionBanner } from "@/components/decision-flow/UndoLastAppliedDecisionBanner";
import type { WhatIfOverrides } from "@/lib/whatif-engine";
import type { CustomScenario } from "./schema";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { SchoolProfileStep } from "./steps/SchoolProfileStep";
import { EnrollmentStep } from "./steps/EnrollmentStep";
import { StoryStep } from "./steps/StoryStep";

const AssumptionsStep = lazy(() => import("./steps/AssumptionsStep").then(m => ({ default: m.AssumptionsStep })));
const RevenueStep = lazy(() => import("./steps/RevenueStep").then(m => ({ default: m.RevenueStep })));
const StaffingStep = lazy(() => import("./steps/StaffingStep").then(m => ({ default: m.StaffingStep })));
const ExpenseStep = lazy(() => import("./steps/ExpenseStep").then(m => ({ default: m.ExpenseStep })));
const CapitalFinancingStep = lazy(() => import("./steps/CapitalFinancingStep").then(m => ({ default: m.CapitalFinancingStep })));
const ReviewStep = lazy(() => import("./steps/ReviewStep").then(m => ({ default: m.ReviewStep })));
const ConsultantStep = lazy(() => import("./steps/ConsultantStep").then(m => ({ default: m.ConsultantStep })));
const NarrativeStep = lazy(() => import("./steps/NarrativeStep").then(m => ({ default: m.NarrativeStep })));
const ExportStep = lazy(() => import("./steps/ExportStep").then(m => ({ default: m.ExportStep })));

// Chesterton-only steps (lazy-loaded — only needed when the founder picks the
// Chesterton Academy school type). When not chesterton, these chunks never
// download.
const ChestertonEnrollmentStep = lazy(() =>
  import("./steps/chesterton/ChestertonEnrollmentStep").then(m => ({ default: m.ChestertonEnrollmentStep })),
);
const ChestertonStaffingStep = lazy(() =>
  import("./steps/chesterton/ChestertonStaffingStep").then(m => ({ default: m.ChestertonStaffingStep })),
);
const ChestertonFundraisingStep = lazy(() =>
  import("./steps/chesterton/ChestertonFundraisingStep").then(m => ({ default: m.ChestertonFundraisingStep })),
);
const ChestertonGiftChartStep = lazy(() =>
  import("./steps/chesterton/ChestertonGiftChartStep").then(m => ({ default: m.ChestertonGiftChartStep })),
);
const ChestertonRecruitingStep = lazy(() =>
  import("./steps/chesterton/ChestertonRecruitingStep").then(m => ({ default: m.ChestertonRecruitingStep })),
);

function stripEmptyValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "string") return obj === "" ? undefined : obj;
  if (Array.isArray(obj)) return obj.map(stripEmptyValues);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = stripEmptyValues(value);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  return obj;
}

function cleanFacilityFieldsForSave(obj: Record<string, unknown>, ot: string | undefined): Record<string, unknown> {
  if (!ot) return obj;
  const cleaned = { ...obj };
  if (ot !== "rent") {
    delete cleaned.monthlyRent;
    delete cleaned.isNNNLease;
    delete cleaned.nnnCamCharges;
    delete cleaned.nnnMaintenance;
    delete cleaned.nnnUtilities;
  }
  if (ot !== "own") {
    delete cleaned.propertyTaxAnnual;
    delete cleaned.hasMortgage;
    delete cleaned.mortgageMonthlyPayment;
  }
  if (ot !== "donated") {
    delete cleaned.comparableMarketRent;
    delete cleaned.facilityArrangementEndDate;
  }
  if (ot !== "home_based") {
    delete cleaned.monthlyFacilityAllocation;
  }
  if (ot !== "donated" && ot !== "home_based") {
    delete cleaned.hasWrittenAgreement;
  }
  return cleaned;
}

function normalizeEscalationOverrideRows(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (Array.isArray(normalized.revenueRows)) {
    normalized.revenueRows = (normalized.revenueRows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      escalationRateOverridden: (row.escalationRateOverridden as boolean | undefined) ?? true,
    }));
  }
  if (Array.isArray(normalized.expenseRows)) {
    normalized.expenseRows = (normalized.expenseRows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      escalationRateOverridden: (row.escalationRateOverridden as boolean | undefined) ?? true,
    }));
  }
  return normalized;
}

// `focus` is an opaque hint forwarded from a `?focus=...` query param so steps
// can scroll/highlight a specific section on mount (e.g. the saved-scenario
// "Replace export" link sets `focus=accounting-export` on the School Profile
// step). Steps that don't recognise the value simply ignore it.
type StepProps = { jumpToStep?: (s: number) => void; modelId: number | null; focus?: string };

type StepDef = { id: number; title: string; component: ComponentType<StepProps> };

const STEPS: StepDef[] = [
  { id: 1, title: "Story", component: StoryStep as ComponentType<StepProps> },
  { id: 2, title: "School Details", component: SchoolProfileStep },
  { id: 3, title: "Enrollment", component: EnrollmentStep },
  { id: 4, title: "Revenue", component: RevenueStep as ComponentType<StepProps> },
  { id: 5, title: "Staffing", component: StaffingStep as ComponentType<StepProps> },
  { id: 6, title: "Expenses", component: ExpenseStep as ComponentType<StepProps> },
  { id: 7, title: "Capital & Financing", component: CapitalFinancingStep as ComponentType<StepProps> },
  { id: 8, title: "Assumptions & Sensitivity", component: AssumptionsStep as ComponentType<StepProps> },
  { id: 9, title: "Review", component: ReviewStep as ComponentType<StepProps> },
  { id: 10, title: "Consultant", component: ConsultantStep as ComponentType<StepProps> },
  { id: 11, title: "Lender Narrative", component: NarrativeStep as ComponentType<StepProps> },
  { id: 12, title: "Export", component: ExportStep as ComponentType<StepProps> },
];

// Wizard layout when the founder picks Chesterton Academy: replace the generic
// Enrollment + Staffing steps with periods-based variants, and insert
// Fundraising / Gift Chart / Recruiting between Staffing and Expenses. We
// renumber the IDs so they remain a contiguous 1..N — `currentStep` is always
// an index into the visible step list, never a stable "step kind" identifier.
function buildChestertonSteps(): StepDef[] {
  const base = STEPS.map(s => ({ ...s }));
  base[2] = { ...base[2], title: "Enrollment", component: ChestertonEnrollmentStep as ComponentType<StepProps> };
  base[4] = { ...base[4], title: "Staffing", component: ChestertonStaffingStep as ComponentType<StepProps> };
  const inserted: StepDef[] = [
    { id: 0, title: "Fundraising Goals", component: ChestertonFundraisingStep as ComponentType<StepProps> },
    { id: 0, title: "Gift Chart", component: ChestertonGiftChartStep as ComponentType<StepProps> },
    { id: 0, title: "Recruiting", component: ChestertonRecruitingStep as ComponentType<StepProps> },
  ];
  const merged = [...base.slice(0, 5), ...inserted, ...base.slice(5)];
  return merged.map((s, i) => ({ ...s, id: i + 1 }));
}
const CHESTERTON_STEPS: StepDef[] = buildChestertonSteps();

// Maps a saved `currentStep` written under the pre-task-#329 11-step layout
// (Assumptions at 3 with Capital/DSCR baked in) to the new 12-step layout
// (Capital & Financing at 7, Assumptions & Sensitivity at 8). Applied
// exactly once per model on first wizard load via the
// `wizard:reorderV2:<id>` localStorage flag.
const REORDER_V2_STEP_MAP: Record<number, number> = {
  1: 1,   // Story → Story
  2: 2,   // School Details → School Details
  3: 8,   // Assumptions → Assumptions & Sensitivity
  4: 3,   // Enrollment → Enrollment
  5: 4,   // Revenue → Revenue
  6: 5,   // Staffing → Staffing
  7: 6,   // Expenses → Expenses
  8: 9,   // Review → Review
  9: 10,  // Consultant → Consultant
  10: 11, // Lender Narrative → Lender Narrative
  11: 12, // Export → Export
};

function sendModelTiming(step: number, stepName: string, durationSeconds: number, modelId: number) {
  if (durationSeconds < 2) return;
  const token = localStorage.getItem("auth_token");
  fetch("/api/public/timing", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ step, stepName, durationSeconds, sessionId: `model_${modelId}`, wizard: "authenticated" }),
  }).catch(() => {});
}

export function ModelWizardPage() {
  const [match, params] = useRoute("/model/:id");
  const modelId = params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  // Captured once on mount so refresh / navigation back doesn't re-trigger
  // the deep-link scroll. We treat the URL params as a one-shot intent rather
  // than reactive state — the wizard owns step persistence after that.
  const searchString = useSearch();
  const initialDeepLinkRef = useRef<{ step: number | null; focus: string | null }>({
    step: null,
    focus: null,
  });
  const deepLinkParsedRef = useRef(false);
  if (!deepLinkParsedRef.current) {
    deepLinkParsedRef.current = true;
    try {
      const sp = new URLSearchParams(searchString || "");
      const rawStep = sp.get("step");
      const stepNum = rawStep !== null ? Number(rawStep) : NaN;
      initialDeepLinkRef.current = {
        step: Number.isFinite(stepNum) && stepNum >= 1 ? Math.floor(stepNum) : null,
        focus: sp.get("focus"),
      };
    } catch {
      initialDeepLinkRef.current = { step: null, focus: null };
    }
  }

  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<false | "network" | "auth" | "validation" | "unknown">(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stepInitialized, setStepInitialized] = useState(false);
  const [showImportBanner, setShowImportBanner] = useState(false);
  const [showPrepChecklist, setShowPrepChecklist] = useState(false);
  const [encouragementDismissed, setEncouragementDismissed] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const stepStartTime = useRef(Date.now());
  const completedSteps = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!modelId) return;
    try {
      const stored = localStorage.getItem(`wizard_completed_${modelId}`);
      completedSteps.current = stored
        ? new Set(JSON.parse(stored) as number[])
        : new Set();
    } catch {
      completedSteps.current = new Set();
    }
    const importKey = `space_import_${modelId}`;
    const dismissedKey = `space_import_dismissed_${modelId}`;
    if (sessionStorage.getItem(importKey) && !sessionStorage.getItem(dismissedKey)) {
      setShowImportBanner(true);
    }
    const prepDismissedKey = `wizard_prep_seen_${modelId}`;
    if (!localStorage.getItem(prepDismissedKey)) {
      setShowPrepChecklist(true);
    }
    const encourageKey = `wizard_encouragement_seen_${modelId}`;
    if (localStorage.getItem(encourageKey)) {
      setEncouragementDismissed(true);
    }
  }, [modelId]);
  const { user } = useAuth();

  const { data: initialData, isLoading: isLoadingModel, refetch: refetchModel } = useGetModel(modelId || 0, {
    query: { queryKey: [`/api/models/${modelId || 0}`], enabled: !!modelId }
  });

  const updateMutation = useUpdateModel();

  // Step list is derived from the school type so picking "Chesterton Academy"
  // swaps in the periods-based salary schedule + fundraising flow. We watch
  // `schoolProfile.schoolType` rather than reading it once because the founder
  // can change school type mid-wizard and we want the sidebar to update live.
  // Note: defined ahead of useForm by reading from RHF's value via getValues
  // is impossible here (form not constructed yet), so we wrap the visibleSteps
  // computation in a useMemo that tracks `schoolType` from `methods.watch`
  // declared right after.

  const methods = useForm({
    resolver: zodResolver(fullModelSchema),
    defaultValues: {
      schoolProfile: {
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        schoolStage: undefined as string | undefined,
        fundingProfile: undefined as string | undefined,
        entityType: undefined as string | undefined,
        schoolTypeOther: "",
        ein: "",
        locationSecured: false,
        ownershipType: undefined as string | undefined,
        monthlyRent: 0,
        annualRentEscalation: 3,
        postLeaseRenewalBump: 15,
        isNNNLease: false,
        nnnCamCharges: 0,
        nnnMaintenance: 0,
        nnnUtilities: 0,
        propertyTaxAnnual: 0,
        hasMortgage: false,
        mortgageMonthlyPayment: 0,
        estimatedMonthlyFacilityBudget: 0,
      },
      enrollment: {},
      programs: [] as Array<{
        id: string;
        name: string;
        annualTuition: number;
        priorYear?: number;
        currentYear?: number;
        year1: number;
        year2: number;
        year3: number;
        year4: number;
        year5: number;
      }>,
      tuitionEscalation: { rate: 3 },
      revenueSources: { tuition: false, publicFunding: false, schoolChoice: false, philanthropy: false },
      revenue: { annualTuitionIncrease: 3 },
      revenueRows: [] as Array<{
        id: string;
        category: string;
        lineItem: string;
        enabled: boolean;
        driverType: string;
        amounts: number[];
        percentBase?: string;
        escalationRate?: number;
        escalationRateOverridden?: boolean;
        note?: string;
      }>,
      staffing: { studentsPerTeacher: 12, offersBenefits: true, benefitsRate: DEFAULT_BENEFITS_RATE, payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE },
      staffingRows: [] as Array<{
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
      }>,
      facilities: { annualRentIncrease: 3, annualInterestRate: 0, loanTermYears: 0, loanAmount: 0, annualSalaryIncrease: 3, generalCostInflation: 3 },
      expenseRows: [] as Array<{
        id: string;
        category: string;
        lineItem: string;
        enabled: boolean;
        driverType: string;
        amounts: number[];
        escalationRate?: number;
        escalationRateOverridden?: boolean;
        note?: string;
      }>,
      capitalAndDebtRows: [] as Array<{
        id: string;
        lineItem: string;
        enabled: boolean;
        driverType: string;
        amounts: number[];
        note?: string;
      }>,
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
      assumptionFlagResponses: [] as Array<{ field: string; flagType: string; reason: string }>,
    },
    mode: "onChange"
  });


  useEffect(() => {
    if (initialData?.data) {
      const d = { ...initialData.data } as Record<string, unknown>;
      const enrollment = d.enrollment as Record<string, number> | undefined;
      if (enrollment) {
        if (enrollment.year4 == null) enrollment.year4 = enrollment.year3 || 0;
        if (enrollment.year5 == null) enrollment.year5 = enrollment.year4 || 0;
      }
      const normalizeAmounts = (rows: Array<{ amounts?: number[] }>) => {
        for (const row of rows) {
          if (row.amounts && row.amounts.length < 5) {
            const last = row.amounts[row.amounts.length - 1] || 0;
            while (row.amounts.length < 5) row.amounts.push(last);
          }
        }
      };
      if (Array.isArray(d.revenueRows)) {
        normalizeAmounts(d.revenueRows as Array<{ amounts?: number[] }>);
        d.revenueRows = migrateGrantsToPhilanthropy(d.revenueRows as RevenueRowData[]);
      }
      if (Array.isArray(d.expenseRows)) normalizeAmounts(d.expenseRows as Array<{ amounts?: number[] }>);
      if (Array.isArray(d.capitalAndDebtRows)) normalizeAmounts(d.capitalAndDebtRows as Array<{ amounts?: number[] }>);
      const rs = d.revenueSources as Record<string, boolean> | undefined;
      if (rs && "grantsContributions" in rs) {
        if (rs.grantsContributions) rs.philanthropy = true;
        delete rs.grantsContributions;
      }
      const sp = d.schoolProfile as Record<string, unknown> | undefined;
      if (sp && sp.ownershipType && (!sp.facilityPhases || !(sp.facilityPhases as unknown[]).length)) {
        sp.facilityPhases = [{
          id: "phase-legacy-1",
          ownershipType: sp.ownershipType as string,
          startYear: 1,
          endYear: 5,
          monthlyRent: (sp.monthlyRent as number) ?? 0,
          annualRentEscalation: (sp.annualRentEscalation as number) ?? 3,
          postLeaseRenewalBump: (sp.postLeaseRenewalBump as number) ?? 15,
          leaseExpirationYear: sp.leaseExpirationYear as number | undefined,
          leaseExpirationMonth: sp.leaseExpirationMonth as number | undefined,
          isNNNLease: (sp.isNNNLease as boolean) ?? false,
          nnnCamCharges: (sp.nnnCamCharges as number) ?? 0,
          nnnMaintenance: (sp.nnnMaintenance as number) ?? 0,
          nnnUtilities: (sp.nnnUtilities as number) ?? 0,
          propertyTaxAnnual: (sp.propertyTaxAnnual as number) ?? 0,
          hasMortgage: (sp.hasMortgage as boolean) ?? false,
          mortgageMonthlyPayment: (sp.mortgageMonthlyPayment as number) ?? 0,
          facilityArrangementEndDate: sp.facilityArrangementEndDate as string | undefined,
          comparableMarketRent: (sp.comparableMarketRent as number) ?? 0,
          hasWrittenAgreement: (sp.hasWrittenAgreement as boolean) ?? false,
          monthlyFacilityAllocation: (sp.monthlyFacilityAllocation as number) ?? 0,
        }];
      }
      methods.reset(d);
      // Deep-link `?step=N` overrides the persisted progress so links from
      // the saved-scenarios "Replace export" affordance land directly on the
      // School Profile step instead of wherever the founder left off.
      const deepLinkStep = initialDeepLinkRef.current.step;
      if (deepLinkStep && deepLinkStep >= 1 && deepLinkStep <= visibleSteps.length) {
        setCurrentStep(Math.min(deepLinkStep, visibleSteps.length));
      } else if (initialData.currentStep) {
        // Migration A (storyMigration): an earlier wizard had 10 steps with
        // Profile at step 1. We inserted a new "Story" step at position 1,
        // so any model that has already advanced past the old Profile step
        // needs to shift forward by one. Use a per-model localStorage marker
        // so the bump is applied exactly once — `openingStory` is optional
        // and may legitimately stay empty after migration, so we cannot rely
        // on its presence as a flag.
        const storyMigrationKey = initialData.id != null ? `wizard:storyMigration:${initialData.id}` : null;
        let storyAlreadyMigrated = false;
        try {
          storyAlreadyMigrated = storyMigrationKey ? window.localStorage.getItem(storyMigrationKey) === "1" : false;
        } catch {
          storyAlreadyMigrated = false;
        }
        const needsStoryMigration = !storyAlreadyMigrated && initialData.currentStep >= 2;
        let target = needsStoryMigration
          ? initialData.currentStep + 1
          : initialData.currentStep;
        if (needsStoryMigration && storyMigrationKey) {
          try { window.localStorage.setItem(storyMigrationKey, "1"); } catch { /* noop */ }
        }

        // Migration B (reorderV2 — task #329): we reshuffled the wizard so
        // the natural budget flow drives the order (Enrollment → Revenue →
        // Staffing → Expenses → Capital & Financing → Assumptions &
        // Sensitivity → Review …) and split Capital & Financing out of the
        // catch-all Assumptions step. Models saved under the old layout
        // need their step number remapped exactly once so a founder who
        // left mid-wizard lands on the equivalent screen.
        const reorderMigrationKey = initialData.id != null ? `wizard:reorderV2:${initialData.id}` : null;
        let reorderAlreadyMigrated = false;
        try {
          reorderAlreadyMigrated = reorderMigrationKey
            ? window.localStorage.getItem(reorderMigrationKey) === "1"
            : false;
        } catch {
          reorderAlreadyMigrated = false;
        }
        if (!reorderAlreadyMigrated) {
          const mapped = REORDER_V2_STEP_MAP[target];
          if (mapped !== undefined) target = mapped;
          if (reorderMigrationKey) {
            try { window.localStorage.setItem(reorderMigrationKey, "1"); } catch { /* noop */ }
          }
        }

        setCurrentStep(Math.min(target, visibleSteps.length));
      }
      setStepInitialized(true);
    }
  }, [initialData, methods]);

  useEffect(() => {
    if (!stepInitialized) return;
    stepStartTime.current = Date.now();
    return () => {
      if (modelId) {
        const elapsed = (Date.now() - stepStartTime.current) / 1000;
        const stepName = visibleSteps[currentStep - 1]?.title || "";
        sendModelTiming(currentStep, stepName, elapsed, modelId);
      }
    };
  }, [currentStep, modelId, stepInitialized]);

  const formValues = methods.watch();
  const [debouncedValues] = useDebounce(formValues, 1000);
  const latestValuesRef = useRef(formValues);
  const lastSavedRef = useRef<string>("");
  latestValuesRef.current = formValues;

  // Visible step list — switches to the Chesterton variant whenever the
  // school type is set to chesterton_academy. We re-derive on every change
  // so the sidebar updates live.
  const watchedSchoolType = (formValues?.schoolProfile as Record<string, unknown> | undefined)?.schoolType as string | undefined;
  const visibleSteps = useMemo(
    () => (watchedSchoolType === "chesterton_academy" ? CHESTERTON_STEPS : STEPS),
    [watchedSchoolType],
  );
  const stepIdByTitle = useCallback(
    (title: string) => {
      const idx = visibleSteps.findIndex(s => s.title === title);
      return idx === -1 ? -1 : idx + 1;
    },
    [visibleSteps],
  );
  const CAPITAL_FINANCING_STEP_ID = stepIdByTitle("Capital & Financing");
  const ASSUMPTIONS_STEP_ID = stepIdByTitle("Assumptions & Sensitivity");
  const REVIEW_STEP_ID = stepIdByTitle("Review");
  const NARRATIVE_STEP_ID = stepIdByTitle("Lender Narrative");
  const EXPORT_STEP_ID = stepIdByTitle("Export");

  // Keep currentStep within bounds when the visible list shrinks (founder
  // switches off Chesterton after advancing past step 12).
  useEffect(() => {
    if (currentStep > visibleSteps.length) {
      setCurrentStep(visibleSteps.length);
    }
  }, [visibleSteps.length, currentStep]);

  const performSave = useCallback(async (valuesToSave: Record<string, unknown>): Promise<boolean> => {
    if (!modelId || !initialData) return false;
    setIsSaving(true);
    try {
      const profile = valuesToSave.schoolProfile as Record<string, unknown> | undefined;
      const stageVal = profile?.schoolStage as "new_school" | "operating_school" | undefined;
      const fundingVal = profile?.fundingProfile as "tuition_based" | "charter_public_funded" | "hybrid_mixed" | undefined;
      const cleanedValues = stripEmptyValues(JSON.parse(JSON.stringify(valuesToSave))) as Record<string, unknown>;
      let sp = cleanedValues.schoolProfile as Record<string, unknown> | undefined;
      if (sp) {
        sp = cleanFacilityFieldsForSave(sp, sp.ownershipType as string | undefined);
        const phases = sp.facilityPhases as Array<Record<string, unknown>> | undefined;
        if (phases) {
          sp.facilityPhases = phases.map(phase =>
            cleanFacilityFieldsForSave(phase, phase.ownershipType as string | undefined)
          );
        }
        cleanedValues.schoolProfile = sp;
      }
      const normalizedValues = normalizeEscalationOverrideRows(cleanedValues);
      await updateMutation.mutateAsync({
        id: modelId,
        data: {
          name: (profile?.schoolName as string) || initialData.name,
          currentStep,
          ...(stageVal ? { schoolStage: stageVal } : {}),
          ...(fundingVal ? { fundingProfile: fundingVal } : {}),
          data: normalizedValues,
        }
      });
      setLastSaved(new Date());
      setSaveError(false);
      retryCountRef.current = 0;
      return true;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403) {
        setSaveError("auth");
      } else if (status === 400) {
        setSaveError("validation");
      } else if (!navigator.onLine || status === 0 || (err instanceof TypeError && /fetch|network/i.test((err as Error).message))) {
        setSaveError("network");
      } else {
        setSaveError("unknown");
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [modelId, initialData, currentStep, updateMutation]);

  useEffect(() => {
    if (!modelId || !initialData) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (Object.keys(methods.formState.dirtyFields).length === 0) return;

    const scheduleRetry = (attempt: number) => {
      if (attempt >= 3) return;
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
      retryCountRef.current = attempt + 1;
      retryTimerRef.current = setTimeout(() => {
        performSave(latestValuesRef.current as unknown as Record<string, unknown>).then((retryOk) => {
          if (retryOk) {
            lastSavedRef.current = JSON.stringify(latestValuesRef.current);
          } else {
            scheduleRetry(attempt + 1);
          }
        });
      }, delay);
    };

    performSave(debouncedValues as unknown as Record<string, unknown>).then((ok) => {
      if (ok) {
        lastSavedRef.current = JSON.stringify(debouncedValues);
      } else {
        scheduleRetry(retryCountRef.current);
      }
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [debouncedValues, currentStep, modelId]);

  useEffect(() => {
    if (!modelId || !initialData) return;

    const flushSave = () => {
      const current = JSON.stringify(latestValuesRef.current);
      if (current === lastSavedRef.current) return;
      const profile = latestValuesRef.current.schoolProfile as Record<string, unknown> | undefined;
      const stageVal = profile?.schoolStage as string | undefined;
      const fundingVal = profile?.fundingProfile as string | undefined;
      const cleanedValues = stripEmptyValues(JSON.parse(current)) as Record<string, unknown>;
      let sp = cleanedValues.schoolProfile as Record<string, unknown> | undefined;
      if (sp) {
        sp = cleanFacilityFieldsForSave(sp, sp.ownershipType as string | undefined);
        const phases = sp.facilityPhases as Array<Record<string, unknown>> | undefined;
        if (phases) {
          sp.facilityPhases = phases.map(phase =>
            cleanFacilityFieldsForSave(phase, phase.ownershipType as string | undefined)
          );
        }
        cleanedValues.schoolProfile = sp;
      }
      const normalizedValues = normalizeEscalationOverrideRows(cleanedValues);
      const body = JSON.stringify({
        name: (profile?.schoolName as string) || initialData.name,
        currentStep,
        ...(stageVal ? { schoolStage: stageVal } : {}),
        ...(fundingVal ? { fundingProfile: fundingVal } : {}),
        data: normalizedValues,
      });
      const token = localStorage.getItem("auth_token");
      fetch(`/api/models/${modelId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const handleBeforeUnload = () => { flushSave(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave();
    };
  }, [modelId, initialData, currentStep]);

  const { toast } = useToast();

  const handleApplyWhatIfToModel = useCallback(async (adjustedData: FullModelData) => {
    if (!modelId) return;
    // Snapshot the current model BEFORE applying so we can offer one-click undo
    // and so we can roll the form state back if the API write fails.
    const priorSnapshot = methods.getValues() as FullModelData;
    const cleaned = stripEmptyValues(JSON.parse(JSON.stringify(adjustedData))) as Record<string, unknown>;
    const normalized = normalizeEscalationOverrideRows(cleaned);
    try {
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: normalized },
      });
    } catch (err) {
      // Server write failed — keep the form on the prior snapshot so the UI
      // doesn't drift from server state. Surface the error to the caller.
      methods.reset(priorSnapshot);
      throw err;
    }
    // Only commit the form to the adjusted data after the server confirms.
    methods.reset(adjustedData);
    setLastSaved(new Date());
    toast({
      title: "Applied to model",
      description: "What-If overrides are now part of your saved model.",
      action: (
        <ToastAction
          altText="Undo apply"
          onClick={async () => {
            methods.reset(priorSnapshot);
            const undoCleaned = stripEmptyValues(JSON.parse(JSON.stringify(priorSnapshot))) as Record<string, unknown>;
            const undoNormalized = normalizeEscalationOverrideRows(undoCleaned);
            await updateMutation.mutateAsync({
              id: modelId,
              data: { data: undoNormalized },
            });
            setLastSaved(new Date());
            toast({ title: "Undone", description: "Your previous model values are restored." });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  }, [methods, modelId, updateMutation, toast]);

  const handleSaveAsScenarioFromWhatIf = useCallback(
    async (overrides: WhatIfOverrides, name: string) => {
      if (!modelId) return;
      const current = methods.getValues() as Record<string, unknown>;
      const existing: CustomScenario[] =
        (current.customScenarios as CustomScenario[] | undefined) ?? [];
      const updated: CustomScenario[] = [
        ...existing,
        { name, overrides, createdAt: new Date().toISOString() },
      ];
      // Sync the form state immediately so subsequent saves merge against the latest list
      // rather than a stale snapshot — react-query refetch may not have completed yet.
      methods.setValue(
        "customScenarios" as Parameters<typeof methods.setValue>[0],
        updated as never,
        { shouldDirty: false }
      );
      const next = { ...current, customScenarios: updated };
      const cleaned = stripEmptyValues(JSON.parse(JSON.stringify(next))) as Record<string, unknown>;
      const normalized = normalizeEscalationOverrideRows(cleaned);
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: normalized },
      });
    },
    [modelId, methods, updateMutation]
  );

  if (!modelId) {
    setLocation("/dashboard");
    return null;
  }

  if (isLoadingModel) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const ActiveStepComponent = visibleSteps[currentStep - 1].component;
  const isExportStep = currentStep === EXPORT_STEP_ID;

  const checkCoreFieldsForExport = (): { ok: boolean; missing: string[] } => {
    const vals = methods.getValues();
    const missing: string[] = [];
    const profile = vals.schoolProfile as Record<string, unknown> | undefined;
    if (!profile?.schoolName || !(profile.schoolName as string).trim()) missing.push("School Name (School Details)");
    if (!profile?.state) missing.push("State (School Details)");
    if (!profile?.schoolType) missing.push("School Type (School Details)");
    const enrollment = vals.enrollment as Record<string, number> | undefined;
    const programs = vals.programs as unknown[] | undefined;
    const hasEnrollment = enrollment && (enrollment.year1 > 0 || enrollment.year2 > 0);
    const hasPrograms = programs && programs.length > 0;
    if (!hasEnrollment && !hasPrograms) missing.push("Enrollment numbers");
    const revenueRows = vals.revenueRows as unknown[] | undefined;
    if (!revenueRows || revenueRows.length === 0) missing.push("At least one revenue source");
    const staffingRows = vals.staffingRows as unknown[] | undefined;
    if (!staffingRows || staffingRows.length === 0) missing.push("At least one staff role");
    return { ok: missing.length === 0, missing };
  };

  const handleNext = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setIsAdvancing(true);
    try {
    const validateStep = async (step: number): Promise<boolean> => {
      // The original switch was index-based (case 1..6). After Chesterton
      // branching the same numeric step now points to a different screen
      // depending on schoolType, so we dispatch by step title instead.
      // Falls through to the original ID-based cases (CAPITAL_FINANCING/
      // ASSUMPTIONS/NARRATIVE) which are derived from titles already.
      const stepTitle = visibleSteps[step - 1]?.title || "";
      switch (stepTitle) {
        case "Story": {
          const profile = methods.getValues("schoolProfile") as Record<string, unknown> | undefined;
          const missing: string[] = [];
          if (!profile?.schoolName || !(profile.schoolName as string).trim()) missing.push("School name");
          if (!profile?.schoolType) missing.push("School type");
          if (missing.length > 0) {
            alert(`Before we go further, please tell us:\n\n• ${missing.join("\n• ")}\n\nEverything else on this page is optional — you can come back any time.`);
            return false;
          }
          return true;
        }
        case "School Profile":
          return methods.trigger("schoolProfile");
        case "Enrollment": {
          const progs = methods.getValues("programs") as unknown[];
          if (progs && progs.length > 0) return methods.trigger("programs");
          return methods.trigger("enrollment");
        }
        case "Chesterton Enrollment":
          // Cast: chesterton.* paths come from chestertonSchema but aren't
          // surfaced through RHF's inferred FieldPath union (the union
          // bottoms out before nested optional namespaces).
          return methods.trigger("chesterton.phaseEnrollment" as never);
        case "Revenue": {
          const [a, b] = await Promise.all([
            methods.trigger("revenue"),
            methods.trigger("revenueRows"),
          ]);
          return a && b;
        }
        case "Staffing": {
          const [a, b] = await Promise.all([
            methods.trigger("staffing"),
            methods.trigger("staffingRows"),
          ]);
          return a && b;
        }
        case "Chesterton Staffing":
          return methods.trigger("chesterton.salarySchedule" as never);
        case "Fundraising":
          return methods.trigger("chesterton.fundraisingGoals" as never);
        case "Gift Chart":
          return methods.trigger("chesterton.giftChart" as never);
        case "Recruiting":
          return methods.trigger("chesterton.recruitingPipeline" as never);
        case "Expenses": {
          const [a, b, d] = await Promise.all([
            methods.trigger("facilities"),
            methods.trigger("expenseRows"),
            methods.trigger("capitalAndDebtRows"),
          ]);
          return a && b && d;
        }
      }
      // Fall through to ID-based dispatch for the back half of the
      // wizard (Capital & Financing, Assumptions, Lender Narrative).
      switch (step) {
        case CAPITAL_FINANCING_STEP_ID: {
          // Capital & Financing fields live under schoolProfile.* (loan
          // amount/rate/term) and covenantThresholds.dscrByYear.*. Both are
          // optional in the schema (a founder with no debt can step through
          // with no input). Trigger schoolProfile so any user-entered loan
          // values get validated; covenant thresholds are validated at
          // submit time via the resolver.
          return methods.trigger('schoolProfile');
        }
        case ASSUMPTIONS_STEP_ID: {
          // Assumptions & Sensitivity is the last step before Review — gate
          // the core-fields-for-export check here so missing inputs surface
          // before the founder lands on Consultant Analysis.
          const { ok, missing } = checkCoreFieldsForExport();
          if (!ok) {
            alert(`Before you can continue to Review, please complete these fields first:\n\n• ${missing.join("\n• ")}\n\nYou can fill these in any order - just make sure they're done before generating your outputs.`);
            return false;
          }
          return true;
        }
        case NARRATIVE_STEP_ID: {
          const flagResponses = methods.getValues("assumptionFlagResponses") as Array<{ field: string; flagType: string; reason: string }> | undefined;
          const responseMap = new Map<string, string>();
          if (flagResponses) {
            for (const r of flagResponses) {
              responseMap.set(`${r.flagType}:${r.field}`, r.reason || "");
            }
          }
          try {
            const consultantRes = await fetch(`/api/models/${modelId}/consultant`, {
              headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
            });
            if (consultantRes.ok) {
              const consultantData = await consultantRes.json();
              const flags = (consultantData?.assumptionFlags || []) as Array<{ field: string; flagType: string; severity: string }>;
              const unresolved = flags.filter(
                f => (f.severity === "critical" || f.severity === "warning") && !responseMap.get(`${f.flagType}:${f.field}`)?.trim()
              );
              if (unresolved.length > 0) {
                alert(`Please address all ${unresolved.length} flagged assumption(s) before proceeding to Export. Your model will be stronger with these explained.`);
                return false;
              }
            }
          } catch (err) {
            console.error("Failed to validate assumption flags:", err);
            alert("Could not verify assumption flags. Please try again or check your connection.");
            return false;
          }
          return true;
        }
        default: return true;
      }
    };
    const isValid = await validateStep(currentStep);
    if (isValid) {
      if (!completedSteps.current.has(currentStep)) {
        completedSteps.current.add(currentStep);
        try {
          localStorage.setItem(`wizard_completed_${modelId}`, JSON.stringify([...completedSteps.current]));
        } catch (err) {
          console.warn("Failed to persist wizard progress:", err);
        }
        trackCoachingEvent("wizard_section_completed", {
          section: visibleSteps[currentStep - 1].title.toLowerCase(),
          step: currentStep,
          modelId: modelId ?? null,
          guidanceLevel: user?.guidanceLevel ?? null,
        });
      }
      setCurrentStep(s => Math.min(s + 1, visibleSteps.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(() => {
        const firstError = document.querySelector('[data-error="true"], .text-destructive, .text-red-500, [aria-invalid="true"]');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    } finally {
      advancingRef.current = false;
      setIsAdvancing(false);
    }
  };

  const handleBack = () => {
    setCurrentStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartOver = async () => {
    if (!confirm("Start over? This will reset all data in this model back to a blank slate.")) return;
    if (!modelId) return;
    const emptyData = {
      schoolProfile: {
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
      },
      enrollment: {},
      programs: [],
      revenue: {},
      revenueRows: [],
      staffing: {},
      staffingRows: [],
      expenses: {},
      expenseRows: [],
    };
    methods.reset(emptyData as unknown as FullModelData);
    setCurrentStep(1);
    completedSteps.current = new Set();
    localStorage.removeItem(`wizard_completed_${modelId}`);
    try {
      await updateMutation.mutateAsync({
        id: modelId,
        data: { currentStep: 1, data: emptyData }
      });
    } catch (err) {
      console.warn("Failed to reset model:", err);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showEncouragement = (currentStep === 5 || currentStep === 6) && !encouragementDismissed;
  const handleDismissEncouragement = () => {
    setEncouragementDismissed(true);
    if (modelId) {
      localStorage.setItem(`wizard_encouragement_seen_${modelId}`, "1");
    }
  };

  return (
    <Layout>
      {/* Wizard-entry guard (Task #302): if a signed-in founder lands here
          without picking a persona, force the prompt before they can touch
          any wizard fields. Otherwise the persona-conditional copy in each
          step has nothing to key off and the experience defaults to the
          generic operator tone. */}
      {user && !hasCompletePersona(user) && (
        // Re-prompt on partial-data records too — both stage AND comfort
        // must be present before we let the founder touch the wizard.
        <FounderPersonaPrompt onComplete={() => {}} />
      )}
      {showPrepChecklist && currentStep === 1 && (
        <WizardPrepChecklist
          onReady={() => {
            setShowPrepChecklist(false);
            if (modelId) {
              localStorage.setItem(`wizard_prep_seen_${modelId}`, "1");
            }
          }}
        />
      )}
      {modelId && (
        // Surface a persistent "Undo last applied decision" control whenever
        // the model carries a fresh `appliedDecisionUndo` record (last 24h).
        // This makes Apply truly safe — founders can roll back even after
        // dismissing the post-apply confirmation modal or navigating away.
        // Reads from `formValues` (which is `methods.watch()`) so the banner
        // re-renders after a refetch repopulates the form.
        <UndoLastAppliedDecisionBanner
          modelId={modelId}
          data={formValues as unknown as Record<string, unknown>}
          onUndone={async () => {
            // Reload the model so the wizard's form state reflects the
            // restored snapshot (the mutation already wrote to the server,
            // but the in-memory form is still showing the post-apply data).
            const res = await refetchModel();
            const restored = (res?.data?.data ?? null) as FullModelData | null;
            if (restored) {
              methods.reset(restored);
            }
          }}
        />
      )}
      {showImportBanner && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-teal-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-teal-100 rounded-lg">
                <Building2 className="h-4 w-4 text-teal-700" />
              </div>
              <p className="text-sm font-medium text-teal-800">
                Facility data imported from SchoolStack Space
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowImportBanner(false);
                sessionStorage.setItem(`space_import_dismissed_${modelId}`, "1");
              }}
              className="p-1 rounded-lg text-teal-600 hover:bg-teal-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="bg-card border-b border-border sticky top-20 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">
                {initialData?.name || "Untitled Model"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 md:hidden">
                Step {currentStep} of {visibleSteps.length}: {visibleSteps[currentStep - 1]?.title}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-xs font-medium text-muted-foreground">
                {isSaving ? (
                  <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>
                ) : saveError === "auth" ? (
                  <button type="button" onClick={() => { localStorage.removeItem("auth_token"); setLocation("/login"); }} className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 underline underline-offset-2">
                    <AlertCircle className="h-3 w-3" /> Session expired - log in again
                  </button>
                ) : saveError === "network" ? (
                  <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="h-3 w-3" /> Offline - will retry</span>
                ) : saveError === "validation" ? (
                  <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="h-3 w-3" /> Could not save - check your entries</span>
                ) : saveError ? (
                  <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="h-3 w-3" /> Save issue - retrying</span>
                ) : lastSaved ? (
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary" /> Saved</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleStartOver}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Start Over</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / Math.max(visibleSteps.length - 1, 1)) * 100}%` }}
            />
            {visibleSteps.map((step) => {
              const isCompleted = completedSteps.current.has(step.id);
              const isCurrent = currentStep === step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (step.id >= REVIEW_STEP_ID) {
                        const { ok, missing } = checkCoreFieldsForExport();
                        if (!ok) {
                          alert(`Before you can access ${step.title}, please complete these fields first:\n\n• ${missing.join("\n• ")}\n\nYou can fill these in any order - just make sure they're done before generating your outputs.`);
                          return;
                        }
                      }
                      setCurrentStep(step.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 cursor-pointer",
                      isCurrent ? "bg-primary border-primary text-primary-foreground scale-110 shadow-md shadow-primary/30" : 
                      isCompleted ? "bg-primary border-primary text-primary-foreground hover:scale-110 hover:shadow-md hover:shadow-primary/30" : 
                      "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                    )}
                  >
                    {isCompleted && !isCurrent ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                  </button>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold absolute mt-10",
                    isCurrent ? "block" : "hidden md:block",
                    isCurrent || isCompleted ? "text-primary" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 py-8 md:py-12 px-4 sm:px-6 lg:px-8 mx-auto w-full max-w-6xl">
        <FormProvider {...methods}>
          <div className="bg-card rounded-3xl p-6 sm:p-10 shadow-xl shadow-black/5 border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <MicroLessonContainer data={methods.getValues() as FullModelData} currentStep={currentStep} className="mb-4" />
            {!isYetToLaunch(user) && (
              <WhatThisMeansInYourBooks
                step={currentStep}
                schoolType={(methods.getValues() as FullModelData).schoolProfile?.schoolType}
                entityType={(methods.getValues() as FullModelData).schoolProfile?.entityType}
                className="mb-4"
              />
            )}
            {showEncouragement && (
              <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">You're more than halfway there</p>
                  <p className="text-xs text-emerald-700 mt-1">Most of the hard thinking is done. The next steps are about reviewing what you've built and making it stronger.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDismissEncouragement}
                  className="shrink-0 p-1 rounded-lg text-emerald-500 hover:bg-emerald-100 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <ActiveStepComponent
                jumpToStep={setCurrentStep}
                modelId={modelId}
                focus={
                  // Only forward the deep-link focus hint while we're still
                  // on the originally-targeted step. Once the founder
                  // navigates away (Continue / Back / step rail) the hint
                  // would be stale, so we drop it.
                  initialDeepLinkRef.current.step === currentStep
                    ? initialDeepLinkRef.current.focus ?? undefined
                    : undefined
                }
              />
            </Suspense>
          </div>

          {!isExportStep && (
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-muted-foreground hover:bg-black/5 disabled:opacity-0 transition-all"
              >
                <ArrowLeft className="h-5 w-5" /> Back
              </button>
              
              <button
                onClick={handleNext}
                disabled={isAdvancing}
                aria-busy={isAdvancing}
                className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
              >
                {currentStep === REVIEW_STEP_ID
                  ? "View Consultant Analysis"
                  : currentStep === stepIdByTitle("Consultant")
                    ? "Continue to Lender Narrative"
                    : currentStep === NARRATIVE_STEP_ID
                      ? "Generate Excel Model"
                      : "Continue"}{" "}
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground italic">
            Your budget is a living document. Refine it whenever you learn something new.
          </p>
        </FormProvider>
      </div>
      {stepInitialized && (
        <WhatIfTrigger
          data={methods.getValues() as FullModelData}
          modelId={modelId}
          onApplyToModel={handleApplyWhatIfToModel}
          onSaveAsScenario={handleSaveAsScenarioFromWhatIf}
          customScenarios={
            ((methods.getValues() as FullModelData).customScenarios as
              | CustomScenario[]
              | undefined) || []
          }
        />
      )}
    </Layout>
  );
}
