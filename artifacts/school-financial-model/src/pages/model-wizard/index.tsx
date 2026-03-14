import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "use-debounce";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { cn } from "@/lib/utils";

import { fullModelSchema, type FullModelData } from "./schema";
import { SchoolProfileStep } from "./steps/SchoolProfileStep";
import { EnrollmentStep } from "./steps/EnrollmentStep";
import { RevenueStep } from "./steps/RevenueStep";
import { StaffingStep } from "./steps/StaffingStep";
import { FacilitiesStep } from "./steps/FacilitiesStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ConsultantStep } from "./steps/ConsultantStep";
import { ExportStep } from "./steps/ExportStep";

const STEPS = [
  { id: 1, title: "Profile", component: SchoolProfileStep },
  { id: 2, title: "Enrollment", component: EnrollmentStep },
  { id: 3, title: "Revenue", component: RevenueStep },
  { id: 4, title: "Staffing", component: StaffingStep },
  { id: 5, title: "Facilities", component: FacilitiesStep },
  { id: 6, title: "Review", component: ReviewStep },
  { id: 7, title: "Consultant", component: ConsultantStep },
  { id: 8, title: "Export", component: ExportStep },
];

export function ModelWizardPage() {
  const [match, params] = useRoute("/model/:id");
  const modelId = params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const { data: initialData, isLoading: isLoadingModel } = useGetModel(modelId || 0, {
    query: { enabled: !!modelId }
  });

  const updateMutation = useUpdateModel();

  const methods = useForm({
    resolver: zodResolver(fullModelSchema),
    defaultValues: {
      schoolProfile: {},
      enrollment: {},
      revenue: {},
      staffing: { studentsPerTeacher: 12, benefitsRate: 20 },
      facilities: { annualRentIncrease: 3 },
    },
    mode: "onChange"
  });

  // Initialize form with backend data
  useEffect(() => {
    if (initialData?.data) {
      methods.reset(initialData.data);
      if (initialData.currentStep) {
        setCurrentStep(initialData.currentStep);
      }
    }
  }, [initialData, methods]);

  // Auto-save logic
  const formValues = methods.watch();
  const [debouncedValues] = useDebounce(formValues, 1000);

  useEffect(() => {
    if (!modelId || !initialData) return;
    
    const save = async () => {
      setIsSaving(true);
      try {
        await updateMutation.mutateAsync({
          id: modelId,
          data: {
            name: debouncedValues.schoolProfile?.schoolName || initialData.name,
            currentStep,
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
    
    // Check if form is dirty before saving
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
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const ActiveStepComponent = STEPS[currentStep - 1].component;
  const isLastStep = currentStep === STEPS.length;
  const isExportStep = currentStep === 8;

  const handleNext = async () => {
    // Validate current step fields before proceeding
    const stepFieldMap: Record<number, Array<keyof FullModelData>> = {
      1: ['schoolProfile'],
      2: ['enrollment'],
      3: ['revenue'],
      4: ['staffing'],
      5: ['facilities'],
    };
    const fieldsToValidate = stepFieldMap[currentStep] ?? [];

    const isValid = await methods.trigger(fieldsToValidate);
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      {/* Progress Header */}
      <div className="bg-card border-b border-border sticky top-20 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-foreground">
              {initialData?.name || "Untitled Model"}
            </h2>
            <div className="flex items-center text-xs font-medium text-muted-foreground">
              {isSaving ? (
                <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>
              ) : lastSaved ? (
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary" /> Saved</span>
              ) : null}
            </div>
          </div>
          
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((step, idx) => (
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

      <main className="flex-1 py-8 md:py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full">
        <FormProvider {...methods}>
          <div className="bg-card rounded-3xl p-6 sm:p-10 shadow-xl shadow-black/5 border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ActiveStepComponent jumpToStep={setCurrentStep} modelId={modelId} />
          </div>

          {/* Navigation */}
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
      </main>
    </div>
  );
}
