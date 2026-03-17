import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { useAuth } from "@/lib/auth-context";

import { fullModelSchema, type FullModelData } from "./schema";
import { migrateGrantsToPhilanthropy, type RevenueRowData } from "@/lib/revenue-defaults";
import { SchoolProfileStep } from "./steps/SchoolProfileStep";
import { EnrollmentStep } from "./steps/EnrollmentStep";
import { RevenueStep } from "./steps/RevenueStep";
import { StaffingStep } from "./steps/StaffingStep";
import { ExpenseStep } from "./steps/ExpenseStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ConsultantStep } from "./steps/ConsultantStep";
import { ExportStep } from "./steps/ExportStep";

const STEPS = [
  { id: 1, title: "Profile", component: SchoolProfileStep },
  { id: 2, title: "Enrollment", component: EnrollmentStep },
  { id: 3, title: "Revenue", component: RevenueStep },
  { id: 4, title: "Staffing", component: StaffingStep },
  { id: 5, title: "Expenses", component: ExpenseStep },
  { id: 6, title: "Review", component: ReviewStep },
  { id: 7, title: "Consultant", component: ConsultantStep },
  { id: 8, title: "Export", component: ExportStep },
];

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
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [stepInitialized, setStepInitialized] = useState(false);
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
  }, [modelId]);
  const { user } = useAuth();

  const { data: initialData, isLoading: isLoadingModel } = useGetModel(modelId || 0, {
    query: { queryKey: [`/api/models/${modelId || 0}`], enabled: !!modelId }
  });

  const updateMutation = useUpdateModel();

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
        note?: string;
      }>,
      staffing: { studentsPerTeacher: 12, benefitsRate: 20 },
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
      methods.reset(d);
      if (initialData.currentStep) {
        setCurrentStep(initialData.currentStep);
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
        const stepName = STEPS[currentStep - 1]?.title || "";
        sendModelTiming(currentStep, stepName, elapsed, modelId);
      }
    };
  }, [currentStep, modelId, stepInitialized]);

  const formValues = methods.watch();
  const [debouncedValues] = useDebounce(formValues, 1000);

  useEffect(() => {
    if (!modelId || !initialData) return;
    
    const save = async () => {
      setIsSaving(true);
      try {
        const profile = debouncedValues.schoolProfile as Record<string, unknown> | undefined;
        const stageVal = profile?.schoolStage as "new_school" | "operating_school" | undefined;
        const fundingVal = profile?.fundingProfile as "tuition_based" | "charter_public_funded" | "hybrid_mixed" | undefined;
        await updateMutation.mutateAsync({
          id: modelId,
          data: {
            name: (profile?.schoolName as string) || initialData.name,
            currentStep,
            ...(stageVal ? { schoolStage: stageVal } : {}),
            ...(fundingVal ? { fundingProfile: fundingVal } : {}),
            data: debouncedValues as Record<string, unknown>,
          }
        });
        setLastSaved(new Date());
      } catch (e) {
        console.error("Auto-save failed", e);
      } finally {
        setIsSaving(false);
      }
    };
    
    if (Object.keys(methods.formState.dirtyFields).length > 0) {
       save();
    }
  }, [debouncedValues, currentStep, modelId]);

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

  const ActiveStepComponent = STEPS[currentStep - 1].component;
  const isLastStep = currentStep === STEPS.length;
  const isExportStep = currentStep === 8;

  const handleNext = async () => {
    const validateStep = async (step: number): Promise<boolean> => {
      switch (step) {
        case 1: return methods.trigger('schoolProfile');
        case 2: {
          const progs = methods.getValues('programs') as unknown[];
          if (progs && progs.length > 0) {
            return methods.trigger('programs');
          }
          return methods.trigger('enrollment');
        }
        case 3: {
          const [a, b] = await Promise.all([
            methods.trigger('revenue'),
            methods.trigger('revenueRows'),
          ]);
          return a && b;
        }
        case 4: {
          const [a, b] = await Promise.all([
            methods.trigger('staffing'),
            methods.trigger('staffingRows'),
          ]);
          return a && b;
        }
        case 5: {
          const [a, b, d] = await Promise.all([
            methods.trigger('facilities'),
            methods.trigger('expenseRows'),
            methods.trigger('capitalAndDebtRows'),
          ]);
          return a && b && d;
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
        } catch { /* ignore */ }
        trackCoachingEvent("wizard_section_completed", {
          section: STEPS[currentStep - 1].title.toLowerCase(),
          step: currentStep,
          modelId: modelId ?? null,
          guidanceLevel: user?.guidanceLevel ?? null,
        });
      }
      setCurrentStep(s => Math.min(s + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(() => {
        const firstError = document.querySelector('.text-destructive');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
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
    methods.reset(emptyData as FullModelData);
    setCurrentStep(1);
    completedSteps.current = new Set();
    localStorage.removeItem(`wizard_completed_${modelId}`);
    try {
      await updateMutation.mutateAsync({
        id: modelId,
        data: { currentStep: 1, data: emptyData }
      });
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Layout>
      <div className="bg-card border-b border-border sticky top-20 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">
                {initialData?.name || "Untitled Model"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 md:hidden">
                Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-xs font-medium text-muted-foreground">
                {isSaving ? (
                  <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>
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
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((step) => {
              const isClickable = step.id <= currentStep;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => {
                      if (isClickable) {
                        setCurrentStep(step.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300",
                      currentStep === step.id ? "bg-primary border-primary text-primary-foreground scale-110 shadow-md shadow-primary/30" : 
                      currentStep > step.id ? "bg-primary border-primary text-primary-foreground hover:scale-110 hover:shadow-md hover:shadow-primary/30" : 
                      "bg-card border-border text-muted-foreground",
                      isClickable ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                  </button>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold absolute mt-10",
                    currentStep === step.id ? "block" : "hidden md:block",
                    currentStep >= step.id ? "text-primary" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 py-8 md:py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full">
        <FormProvider {...methods}>
          <div className="bg-card rounded-3xl p-6 sm:p-10 shadow-xl shadow-black/5 border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ActiveStepComponent jumpToStep={setCurrentStep} modelId={modelId} />
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
                className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                {currentStep === 6 ? "View Consultant Analysis" : currentStep === 7 ? "Generate Excel Model" : "Continue"} <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </FormProvider>
      </div>
    </Layout>
  );
}
