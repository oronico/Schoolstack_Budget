import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCreateModel } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { Loader2, Calendar, TrendingUp, ArrowRight } from "lucide-react";
import type { ModelDuration } from "@/pages/model-wizard/schema";

function parseSpaceParams(): Record<string, string | number> | null {
  const search = window.location.search;
  if (!search) return null;

  const params = new URLSearchParams(search);
  const result: Record<string, string | number> = {};
  let hasAny = false;

  const numericKeys = ["sqft", "students", "monthlyRent", "nnnAnnual"];
  for (const key of numericKeys) {
    const val = params.get(key);
    if (val != null && val !== "") {
      const num = parseFloat(val);
      if (!isNaN(num) && num >= 0) {
        result[key] = num;
        hasAny = true;
      }
    }
  }

  const schoolName = params.get("schoolName");
  if (schoolName) {
    result.schoolName = schoolName;
    hasAny = true;
  }

  return hasAny ? result : null;
}

function buildPrefillData(p: Record<string, string | number>, duration: ModelDuration): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  const sqft = typeof p.sqft === "number" ? p.sqft : 0;
  const students = typeof p.students === "number" ? p.students : 0;
  const monthlyRent = typeof p.monthlyRent === "number" ? p.monthlyRent : 0;
  const nnnAnnual = typeof p.nnnAnnual === "number" ? p.nnnAnnual : 0;
  const schoolName = typeof p.schoolName === "string" ? p.schoolName : "";

  const schoolProfile: Record<string, unknown> = {
    fiscalYearStartMonth: 7,
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
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
    modelDuration: duration,
  };

  if (schoolName) {
    schoolProfile.schoolName = schoolName;
  }

  if (monthlyRent > 0) {
    schoolProfile.locationSecured = true;
    schoolProfile.ownershipType = "rent";
    schoolProfile.monthlyRent = monthlyRent;
  }

  if (nnnAnnual > 0) {
    schoolProfile.isNNNLease = true;
    const monthlyNNN = Math.round(nnnAnnual / 12);
    schoolProfile.nnnCamCharges = monthlyNNN;
  }

  data.schoolProfile = schoolProfile;

  const facilities: Record<string, unknown> = {
    annualRentIncrease: 3,
    annualInterestRate: 0,
    loanTermYears: 0,
    loanAmount: 0,
    annualSalaryIncrease: 3,
    generalCostInflation: 3,
  };

  if (monthlyRent > 0) {
    facilities.monthlyRent = monthlyRent;
  }

  if (sqft > 0) {
    facilities.annualUtilities = Math.round(sqft * 2.5);
    facilities.annualInsurance = Math.round(sqft * 1.5);
  }

  data.facilities = facilities;

  if (students > 0) {
    const programs = [
      {
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
      },
    ];
    data.programs = programs;
    data.enrollment = {
      year1: students,
      year2: Math.round(students * 1.15),
      year3: Math.round(students * 1.30),
      year4: Math.round(students * 1.40),
      year5: Math.round(students * 1.50),
    };
  }

  if (sqft > 0 && students > 0) {
    schoolProfile.maxCapacity = Math.max(students, Math.round(sqft / 50));
  }

  return data;
}

export function NewModelPage() {
  const [, setLocation] = useLocation();
  const createMutation = useCreateModel();
  const hasTriggered = useRef(false);
  const [pickedDuration, setPickedDuration] = useState<ModelDuration | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [spaceParams, setSpaceParams] = useState<Record<string, string | number> | null | undefined>(undefined);

  useEffect(() => {
    setSpaceParams(parseSpaceParams());
  }, []);

  const handlePick = (duration: ModelDuration) => {
    if (hasTriggered.current || submitting) return;
    hasTriggered.current = true;
    setPickedDuration(duration);
    setSubmitting(true);

    (async () => {
      try {
        const isSpaceImport = spaceParams !== null && spaceParams !== undefined;
        const prefillData = isSpaceImport
          ? buildPrefillData(spaceParams as Record<string, string | number>, duration)
          : { schoolProfile: { modelDuration: duration } };
        const modelName =
          isSpaceImport && typeof (spaceParams as Record<string, string | number>).schoolName === "string"
            && (spaceParams as Record<string, string | number>).schoolName
            ? String((spaceParams as Record<string, string | number>).schoolName)
            : "Untitled Model";

        const newModel = await createMutation.mutateAsync({
          data: { name: modelName, currentStep: 1, data: prefillData },
        });
        try {
          window.localStorage.setItem(`wizard:storyMigration:${newModel.id}`, "1");
          window.localStorage.setItem(`wizard:reorderV2:${newModel.id}`, "1");
        } catch {
          /* noop */
        }
        if (isSpaceImport) {
          sessionStorage.setItem(`space_import_${newModel.id}`, "true");
        }
        setLocation(`/model/${newModel.id}`);
      } catch {
        setLocation("/dashboard");
      }
    })();
  };

  // While we're parsing search params (single-tick effect) show a spinner
  // rather than flashing the picker. Same loader state covers the brief
  // window between pick → API round-trip.
  if (spaceParams === undefined || submitting) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">
            {submitting ? `Creating your ${pickedDuration === "single_year" ? "Year 1 budget" : "5-year model"}...` : "Loading..."}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
              How far out do you want to plan?
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              Pick what fits where you are right now. You can extend a Year 1 budget into a full
              5-year projection at any time.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              type="button"
              data-testid="pick-single-year"
              onClick={() => handlePick("single_year")}
              className="group bg-card rounded-2xl border-2 border-border/60 hover:border-primary hover:shadow-xl hover:-translate-y-1 p-6 sm:p-7 text-left transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6" />
              </div>
              <h2 className="font-display font-bold text-xl text-foreground mb-2">
                Single-Year Budget
              </h2>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Build a Year 1 income statement in under an hour. Walk through enrollment,
                revenue, staffing, and expenses for the coming school year only.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
                Start Year 1 budget <ArrowRight className="h-4 w-4" />
              </span>
            </button>
            <button
              type="button"
              data-testid="pick-five-year"
              onClick={() => handlePick("five_year")}
              className="group bg-card rounded-2xl border-2 border-primary/30 ring-1 ring-primary/20 hover:border-primary hover:shadow-xl hover:-translate-y-1 p-6 sm:p-7 text-left transition-all relative"
            >
              <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-semibold">
                Recommended
              </span>
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h2 className="font-display font-bold text-xl text-foreground mb-2">
                5-Year Projection
              </h2>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                The full pro-forma. Required for lender packets, board summaries, and any
                multi-year scenario planning.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
                Start 5-year model <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Not sure? Start with Single-Year - we'll extend it for you when you're ready.
          </p>
        </div>
      </div>
    </Layout>
  );
}
