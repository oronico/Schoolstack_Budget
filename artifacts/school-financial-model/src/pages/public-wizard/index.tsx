import { useState, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";

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
    // Storage full or unavailable — silently skip
  }
}

export function PublicWizardPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const savedData = loadFromStorage();
  const savedStep = parseInt(localStorage.getItem(STORAGE_KEY + "_step") || "1", 10);

  const defaults: FullModelData = {
    schoolProfile: undefined,
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
    if (savedData && savedStep > 1) {
      setCurrentStep(savedStep);
    }
  }, []);

  const formValues = methods.watch();
  const [debouncedValues] = useDebounce(formValues, 1000);

  useEffect(() => {
    if (Object.keys(methods.formState.dirtyFields).length > 0) {
      saveToStorage(debouncedValues, currentStep);
      setLastSaved(new Date());
    }
  }, [debouncedValues, currentStep]);

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
    }
  };

  const handleBack = () => {
    setCurrentStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Layout>
      <div className="bg-card border-b border-border sticky top-20 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-foreground">
              Build Your Financial Model
            </h2>
            <div className="flex items-center text-xs font-medium text-muted-foreground">
              {lastSaved ? (
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary" /> Saved locally</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((step) => (
              <div key={step.id} className="flex flex-col items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300",
                  currentStep === step.id ? "bg-primary border-primary text-primary-foreground scale-110 shadow-md shadow-primary/30" :
                  currentStep > step.id ? "bg-primary border-primary text-primary-foreground" :
                  "bg-card border-border text-muted-foreground"
                )}>
                  {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                </div>
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold hidden md:block absolute mt-10",
                  currentStep >= step.id ? "text-primary" : "text-muted-foreground"
                )}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 py-8 md:py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full">
        <FormProvider {...methods}>
          <div className="bg-card rounded-3xl p-6 sm:p-10 shadow-xl shadow-black/5 border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ActiveStepComponent jumpToStep={setCurrentStep} modelId={0} />
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
                {currentStep === STEPS.length - 1 ? "Export Your Model" : "Continue"} <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </FormProvider>
      </div>
    </Layout>
  );
}
