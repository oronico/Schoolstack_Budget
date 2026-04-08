import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useGetConsultantAnalysis, type SchoolProfileLendingLabIntent } from "@workspace/api-client-react";
import { profitLabel, cumulativeProfitLabel } from "../schema";
import { Loader2, AlertTriangle } from "lucide-react";
import { ConsultantAnalysisView } from "@/components/consultant/ConsultantAnalysisView";
import { SectionExplainers } from "@/components/coaching/SectionExplainers";

interface ConsultantStepProps {
  jumpToStep?: (step: number) => void;
  modelId: number | null;
}

export function ConsultantStep({ jumpToStep, modelId }: ConsultantStepProps) {
  const { watch } = useFormContext();
  const entityType = watch("schoolProfile.entityType");
  const schoolType = watch("schoolProfile.schoolType");
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent") as SchoolProfileLendingLabIntent | undefined;
  const loanAmount = watch("schoolProfile.loanAmount") as number | undefined;
  const hasLoan = loanAmount !== undefined && loanAmount !== null && loanAmount > 0;
  const niLabel = profitLabel(entityType);
  const cumNiLabel = cumulativeProfitLabel(entityType);
  const [hasRequested, setHasRequested] = useState(false);

  const { data, isLoading, error, refetch } = useGetConsultantAnalysis(modelId || 0, {
    query: {
      queryKey: [`/api/models/${modelId || 0}/consultant`],
      enabled: false,
    },
  });

  useEffect(() => {
    if (modelId && !hasRequested) {
      setHasRequested(true);
      refetch();
    }
  }, [modelId, hasRequested, refetch]);

  if (isLoading || !hasRequested) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Running Your Financial Analysis
        </h2>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Our consultant is reviewing your model and preparing recommendations...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-6">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Analysis Unavailable
        </h2>
        <p className="text-muted-foreground text-lg mb-6">
          We couldn't complete the analysis. Please try again.
        </p>
        <button
          onClick={() => refetch()}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <>
      <SectionExplainers section="consultant" schoolType={schoolType} />
      <ConsultantAnalysisView
        data={data}
        niLabel={niLabel}
        cumNiLabel={cumNiLabel}
        modelId={modelId ?? undefined}
        jumpToStep={jumpToStep}
        lendingLabIntent={lendingLabIntent}
        hasLoan={hasLoan}
      />
    </>
  );
}
