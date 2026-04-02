import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Loader2, AlertTriangle } from "lucide-react";
import { getPublicConsultantAnalysisUrl, type ConsultantOutput } from "@workspace/api-client-react";
import { profitLabel, cumulativeProfitLabel } from "@/pages/model-wizard/schema";
import { ConsultantAnalysisView } from "@/components/consultant/ConsultantAnalysisView";

export function PublicConsultantStep({ jumpToStep, modelId }: { jumpToStep?: (s: number) => void; modelId: number | null }) {
  const { getValues, watch } = useFormContext();
  const entityType = watch("schoolProfile.entityType");
  const niLabel = profitLabel(entityType);
  const cumNiLabel = cumulativeProfitLabel(entityType);

  const [data, setData] = useState<ConsultantOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = getValues();
      const res = await fetch(getPublicConsultantAnalysisUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || "Analysis failed");
      }

      const result: ConsultantOutput = await res.json();
      setData(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      console.error("Public consultant analysis error:", e);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, []);

  if (isLoading) {
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
          onClick={fetchAnalysis}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <ConsultantAnalysisView
      data={data}
      niLabel={niLabel}
      cumNiLabel={cumNiLabel}
      jumpToStep={jumpToStep}
      exportStepNumber={8}
    />
  );
}
