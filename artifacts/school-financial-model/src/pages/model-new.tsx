import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateModel } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { Loader2 } from "lucide-react";

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

function buildPrefillData(p: Record<string, string | number>): Record<string, unknown> {
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

  useEffect(() => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;

    const spaceParams = parseSpaceParams();

    if (!spaceParams) {
      (async () => {
        try {
          const newModel = await createMutation.mutateAsync({
            data: { name: "Untitled Model", currentStep: 1, data: {} },
          });
          setLocation(`/model/${newModel.id}`);
        } catch {
          setLocation("/dashboard");
        }
      })();
      return;
    }

    (async () => {
      try {
        const prefillData = buildPrefillData(spaceParams);
        const modelName =
          typeof spaceParams.schoolName === "string" && spaceParams.schoolName
            ? spaceParams.schoolName
            : "Untitled Model";

        const newModel = await createMutation.mutateAsync({
          data: {
            name: modelName,
            currentStep: 1,
            data: prefillData,
          },
        });

        sessionStorage.setItem(`space_import_${newModel.id}`, "true");
        setLocation(`/model/${newModel.id}`);
      } catch {
        setLocation("/dashboard");
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Creating your model...</p>
      </div>
    </Layout>
  );
}
