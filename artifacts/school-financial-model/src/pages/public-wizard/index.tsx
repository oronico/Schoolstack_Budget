import { useState, useEffect, useCallback, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import { ArrowLeft, ArrowRight, CheckCircle2, Save, RotateCcw, Shield, X, School, DollarSign, Users, Building2 } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { fullModelSchema, type FullModelData } from "@/pages/model-wizard/schema";
import { migrateGrantsToPhilanthropy } from "@/lib/revenue-defaults";
import { SchoolProfileStep } from "@/pages/model-wizard/steps/SchoolProfileStep";
import { EnrollmentStep } from "@/pages/model-wizard/steps/EnrollmentStep";
import { RevenueStep } from "@/pages/model-wizard/steps/RevenueStep";
import { StaffingStep } from "@/pages/model-wizard/steps/StaffingStep";
import { ExpenseStep } from "@/pages/model-wizard/steps/ExpenseStep";
import { ReviewStep } from "@/pages/model-wizard/steps/ReviewStep";
import { PublicConsultantStep } from "./PublicConsultantStep";
import { PublicExportStep } from "./PublicExportStep";

const STORAGE_KEY = "schoolstack_public_model";

const STEPS = [
  { id: 1, title: "Profile", component: SchoolProfileStep },
  { id: 2, title: "Enrollment", component: EnrollmentStep },
  { id: 3, title: "Revenue", component: RevenueStep },
  { id: 4, title: "Staffing", component: StaffingStep },
  { id: 5, title: "Expenses", component: ExpenseStep },
  { id: 6, title: "Review", component: ReviewStep },
  { id: 7, title: "Analysis", component: PublicConsultantStep },
  { id: 8, title: "Export", component: PublicExportStep },
];

function loadFromStorage(): Partial<FullModelData> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(data: Record<string, unknown>, step: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY + "_step", String(step));
  } catch {
    // Storage full or unavailable - silently skip
  }
}

const SESSION_ID = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function sendStepTiming(step: number, stepName: string, durationSeconds: number) {
  if (durationSeconds < 2) return;
  fetch("/api/public/timing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, stepName, durationSeconds, sessionId: SESSION_ID, wizard: "public" }),
  }).catch(() => {});
}

export function PublicWizardPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [accountBannerDismissed, setAccountBannerDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY + "_account_banner_dismissed") === "true";
  });
  const [showPrepScreen, setShowPrepScreen] = useState(() => {
    return !loadFromStorage() && localStorage.getItem(STORAGE_KEY + "_prep_dismissed") !== "true";
  });
  const { user } = useAuth();
  const stepStartTime = useRef(Date.now());

  const savedData = loadFromStorage();
  const savedStep = parseInt(localStorage.getItem(STORAGE_KEY + "_step") || "1", 10);

  const defaults: FullModelData = {
    schoolProfile: {
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      schoolStage: undefined as string | undefined,
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
    } as any,
    enrollment: undefined,
    programs: [],
    tuitionEscalation: { rate: 3 },
    revenueSources: { tuition: false, publicFunding: false, schoolChoice: false, philanthropy: false },
    tuitionTiers: undefined,
    revenue: { annualTuitionIncrease: 3 },
    revenueRows: [],
    staffing: { studentsPerTeacher: 12, benefitsRate: 20 },
    staffingRows: [],
    facilities: { annualRentIncrease: 3, annualInterestRate: 0, loanTermYears: 0, loanAmount: 0, annualSalaryIncrease: 3, generalCostInflation: 3 },
    expenseRows: [],
    capitalAndDebtRows: [],
    priorYearSnapshot: undefined,
  };

  if (savedData) {
    Object.assign(defaults, savedData);
    if (Array.isArray(defaults.revenueRows)) {
      defaults.revenueRows = migrateGrantsToPhilanthropy(defaults.revenueRows as any) as any;
    }
    const rs = defaults.revenueSources as Record<string, boolean> | undefined;
    if (rs && "grantsContributions" in rs) {
      if (rs.grantsContributions) rs.philanthropy = true;
      delete rs.grantsContributions;
    }
  }

  const methods = useForm<FullModelData>({
    resolver: zodResolver(fullModelSchema),
    defaultValues: defaults,
    mode: "onChange"
  });

  useEffect(() => {
    const search = window.location.search;
    if (search) {
      const params = new URLSearchParams(search);
      const hasSpaceParams = params.has("sqft") || params.has("students") || params.has("monthlyRent") || params.has("schoolName");
      if (hasSpaceParams) {
        const updates: Record<string, unknown> = {};
        const sp: Record<string, unknown> = { ...methods.getValues("schoolProfile") };

        const schoolName = params.get("schoolName");
        if (schoolName) sp.schoolName = schoolName;

        const monthlyRent = parseFloat(params.get("monthlyRent") || "");
        if (monthlyRent > 0) {
          sp.locationSecured = true;
          sp.ownershipType = "rent";
          sp.monthlyRent = monthlyRent;
        }

        const nnnAnnual = parseFloat(params.get("nnnAnnual") || "");
        if (nnnAnnual > 0) {
          sp.isNNNLease = true;
          sp.nnnCamCharges = Math.round(nnnAnnual / 12);
        }

        updates.schoolProfile = sp;

        const sqft = parseFloat(params.get("sqft") || "");
        const students = parseFloat(params.get("students") || "");

        if (monthlyRent > 0) {
          updates.facilities = { ...methods.getValues("facilities"), monthlyRent };
        }
        if (sqft > 0) {
          const fac = (updates.facilities || methods.getValues("facilities")) as Record<string, unknown>;
          fac.annualUtilities = Math.round(sqft * 2.5);
          fac.annualInsurance = Math.round(sqft * 1.5);
          updates.facilities = fac;
        }

        if (students > 0) {
          updates.programs = [{
            id: `prog_${Date.now()}`,
            name: "General Enrollment",
            annualTuition: 0,
            priorYear: 0,
            currentYear: 0,
            year1: students,
            year2: Math.round(students * 1.15),
            year3: Math.round(students * 1.30),
            year4: Math.round(students * 1.40),
            year5: Math.round(students * 1.50),
          }];
          if (sqft > 0) {
            (sp as Record<string, unknown>).maxCapacity = Math.max(students, Math.round(sqft / 50));
          }
        }

        for (const [key, val] of Object.entries(updates)) {
          methods.setValue(key as any, val as any, { shouldDirty: true });
        }

        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }

    if (savedData && savedStep > 1) {
      setCurrentStep(savedStep);
    }
  }, []);

  useEffect(() => {
    const prevStart = stepStartTime.current;
    stepStartTime.current = Date.now();
    return () => {
      const elapsed = (Date.now() - prevStart) / 1000;
      const stepName = STEPS[currentStep - 1]?.title || "";
      sendStepTiming(currentStep, stepName, elapsed);
    };
  }, [currentStep]);

  const formValues = methods.watch();
  const [debouncedValues] = useDebounce(formValues, 1000);

  useEffect(() => {
    if (Object.keys(methods.formState.dirtyFields).length > 0) {
      saveToStorage(debouncedValues, currentStep);
      setLastSaved(new Date());
    }
  }, [debouncedValues, currentStep]);

  const handleSave = useCallback(() => {
    const currentValues = methods.getValues();
    saveToStorage(currentValues as Record<string, unknown>, currentStep);
    setLastSaved(new Date());
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2500);
  }, [methods, currentStep]);

  const [startOverOpen, setStartOverOpen] = useState(false);

  const confirmStartOver = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + "_step");
    methods.reset({
      schoolProfile: {
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        schoolStage: undefined as string | undefined,
        entityType: undefined as string | undefined,
        schoolTypeOther: "",
        ein: "",
      },
      enrollment: {},
      programs: [],
      revenue: {},
      revenueRows: [],
      staffing: {},
      staffingRows: [],
      expenses: {},
      expenseRows: [],
    } as unknown as FullModelData);
    setCurrentStep(1);
    setStartOverOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [methods]);

  const ActiveStepComponent = STEPS[currentStep - 1].component;
  const isExportStep = currentStep === STEPS.length;

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
          const [a, b] = await Promise.all([methods.trigger('revenue'), methods.trigger('revenueRows')]);
          return a && b;
        }
        case 4: {
          const [a, b] = await Promise.all([methods.trigger('staffing'), methods.trigger('staffingRows')]);
          return a && b;
        }
        case 5: {
          const [a, b, d] = await Promise.all([
            methods.trigger('facilities'), methods.trigger('expenseRows'), methods.trigger('capitalAndDebtRows'),
          ]);
          return a && b && d;
        }
        default: return true;
      }
    };
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setCurrentStep(s => Math.min(s + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      requestAnimationFrame(() => {
        const firstError = document.querySelector('[data-error="true"], .text-destructive, .text-red-500, [aria-invalid="true"]');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  };

  const handleBack = () => {
    setCurrentStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dismissPrepScreen = () => {
    setShowPrepScreen(false);
    localStorage.setItem(STORAGE_KEY + "_prep_dismissed", "true");
  };

  const PREP_GROUPS = [
    {
      icon: <School className="w-5 h-5 text-[#328555]" />,
      title: "The basics",
      items: [
        "Your school type (charter, private, micro, pod, etc.)",
        "What state you're in",
        "How many students you expect in Year 1",
        "Your building capacity",
      ],
    },
    {
      icon: <DollarSign className="w-5 h-5 text-[#D97706]" />,
      title: "Revenue & funding",
      items: [
        "Tuition rate (or an estimate)",
        "Per-pupil funding amount (charter schools)",
        "Any grants or donations you expect",
        "ESA or voucher amounts (if applicable)",
      ],
    },
    {
      icon: <Users className="w-5 h-5 text-[#0D9488]" />,
      title: "Your team",
      items: [
        "Roles you plan to hire (teachers, admin, etc.)",
        "Salary ranges for each role",
        "Full-time vs. part-time vs. contract",
      ],
    },
    {
      icon: <Building2 className="w-5 h-5 text-[#1E293B]" />,
      title: "Your space & costs",
      items: [
        "Monthly rent or mortgage payment",
        "Lease terms (if you have them)",
        "Estimates for insurance, utilities, curriculum",
        "Any loans or debt you're planning",
      ],
    },
  ];

  if (showPrepScreen) {
    return (
      <Layout>
        <div className="flex-1 py-12 md:py-20 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto w-full">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
              <School className="w-7 h-7 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
              Before you start.
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Gathering a few things first will make this go faster. You don't need exact numbers — estimates work fine.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {PREP_GROUPS.map((group, i) => (
              <div
                key={i}
                className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 bg-background rounded-lg border border-border/50 flex items-center justify-center shrink-0">
                    {group.icon}
                  </div>
                  <h3 className="font-display font-bold text-sm text-foreground">
                    {group.title}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {group.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-muted-foreground text-sm leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary/40 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mb-8">
            Don't have everything? No problem — you can save your progress and come back anytime.
          </p>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={dismissPrepScreen}
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              I'm ready, let's go
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={dismissPrepScreen}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Skip this
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-card border-b border-border sticky top-20 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">
                Build Your Financial Model
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 md:hidden">
                Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-all duration-300",
                saveFlash ? "text-primary scale-105" : "text-muted-foreground"
              )}>
                {lastSaved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Progress saved</span>
                    <span className="sm:hidden">Saved</span>
                  </>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setStartOverOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Start Over</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 border",
                  saveFlash
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background text-muted-foreground border-border hover:bg-black/5 hover:text-foreground"
                )}
              >
                <Save className="h-3.5 w-3.5" />
                Save
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
            {/* @ts-expect-error exportStepNumber only used by PublicConsultantStep */}
            <ActiveStepComponent jumpToStep={setCurrentStep} modelId={0} exportStepNumber={STEPS.findIndex(s => s.title === "Export") + 1 || STEPS.length} />
          </div>

          {!user && !accountBannerDismissed && currentStep >= 3 && !isExportStep && (
            <div className="mt-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-5 flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">Save your model to the cloud?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a free account to access your model from any device, compare scenarios, and never lose your work.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <Link
                    href="/register"
                    onClick={() => {
                      const currentValues = methods.getValues();
                      saveToStorage(currentValues as Record<string, unknown>, currentStep);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
                  >
                    Create Free Account
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setAccountBannerDismissed(true); localStorage.setItem(STORAGE_KEY + "_account_banner_dismissed", "true"); }}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAccountBannerDismissed(true); localStorage.setItem(STORAGE_KEY + "_account_banner_dismissed", "true"); }}
                className="flex-shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!isExportStep && (
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-muted-foreground hover:bg-black/5 disabled:opacity-0 transition-all"
              >
                <ArrowLeft className="h-5 w-5" /> Back
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 border",
                    saveFlash
                      ? "bg-primary/10 text-primary border-primary/30 shadow-md shadow-primary/10"
                      : "text-muted-foreground border-border hover:bg-black/5 hover:text-foreground"
                  )}
                >
                  {saveFlash ? <CheckCircle2 className="h-5 w-5" /> : <Save className="h-5 w-5" />}
                  <span className="hidden sm:inline">{saveFlash ? "Saved!" : "Save Progress"}</span>
                  <span className="sm:hidden">{saveFlash ? "Saved!" : "Save"}</span>
                </button>

                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  {currentStep === STEPS.length - 1 ? "Export Your Model" : "Continue"} <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </FormProvider>
      </div>
      <AlertDialog open={startOverOpen} onOpenChange={setStartOverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all your wizard data and reset to step 1. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStartOver}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Start Over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
