import { useState, useEffect } from "react";
import { useGetConsultantAnalysis } from "@workspace/api-client-react";
import {
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  BarChart3,
  Lightbulb,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsultantStepProps {
  jumpToStep?: (step: number) => void;
  modelId: number | null;
}

export function ConsultantStep({ modelId }: ConsultantStepProps) {
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
      <div className="text-center py-16">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-6" />
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Analyzing Your Financial Model
        </h2>
        <p className="text-muted-foreground text-lg">
          Our CFO consultant is reviewing your numbers...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-6" />
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Analysis Unavailable
        </h2>
        <p className="text-muted-foreground text-lg mb-6">
          We couldn't complete the analysis. Please try again.
        </p>
        <button
          onClick={() => refetch()}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  const lenderColor =
    data.lenderReadiness === "Strong"
      ? "text-green-700"
      : data.lenderReadiness === "Needs Work"
        ? "text-amber-700"
        : "text-rose-700";

  const lenderBg =
    data.lenderReadiness === "Strong"
      ? "bg-green-50 border-green-200"
      : data.lenderReadiness === "Needs Work"
        ? "bg-amber-50 border-amber-200"
        : "bg-rose-50 border-rose-200";

  const LenderIcon =
    data.lenderReadiness === "Strong"
      ? ShieldCheck
      : data.lenderReadiness === "Needs Work"
        ? Shield
        : ShieldAlert;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-display text-3xl font-bold text-foreground">
            CFO Consultant Review
          </h2>
        </div>
        <p className="text-muted-foreground text-lg">
          A structured analysis of your financial model with actionable guidance.
        </p>
      </div>

      <div className="bg-background rounded-2xl p-6 border border-border mb-6">
        <h3 className="font-display font-bold text-lg text-foreground mb-3">
          Executive Summary
        </h3>
        <p className="text-foreground/80 leading-relaxed">{data.executiveSummary}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-5 w-5 text-green-700" />
            <h4 className="font-bold text-green-800 text-sm uppercase tracking-wider">
              Biggest Strength
            </h4>
          </div>
          <p className="text-green-900 font-medium">{data.biggestStrength}</p>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h4 className="font-bold text-rose-800 text-sm uppercase tracking-wider">
              Biggest Risk
            </h4>
          </div>
          <p className="text-rose-900 font-medium">{data.biggestRisk}</p>
        </div>
      </div>

      <div className={cn("rounded-2xl p-6 border mb-6", lenderBg)}>
        <div className="flex items-center gap-3 mb-3">
          <LenderIcon className={cn("h-8 w-8", lenderColor)} />
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
              Lender Readiness
            </h4>
            <p className={cn("font-display font-bold text-2xl", lenderColor)}>
              {data.lenderReadiness}
            </p>
          </div>
        </div>
        <p className="text-foreground/70 leading-relaxed">
          {data.lenderReadinessExplanation}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">
            Recommended Actions
          </h3>
        </div>
        <div className="space-y-3">
          {data.recommendations.map(
            (
              rec: { title: string; description: string; priority: string },
              idx: number
            ) => {
              const priorityColor =
                rec.priority === "high"
                  ? "bg-rose-100 text-rose-700 border-rose-200"
                  : rec.priority === "medium"
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-teal-100 text-teal-700 border-teal-200";

              return (
                <div
                  key={idx}
                  className="bg-background rounded-2xl p-5 border border-border"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {idx + 1}
                      </span>
                      <h4 className="font-bold text-foreground">{rec.title}</h4>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-bold uppercase px-2.5 py-1 rounded-full border whitespace-nowrap",
                        priorityColor
                      )}
                    >
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-foreground/70 text-sm leading-relaxed ml-10">
                    {rec.description}
                  </p>
                </div>
              );
            }
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">Key Metrics</h3>
        </div>
        <div className="space-y-2">
          {data.keyMetrics.map(
            (
              metric: {
                name: string;
                value: string;
                status: string;
                interpretation: string;
              },
              idx: number
            ) => {
              const StatusIcon =
                metric.status === "good"
                  ? CheckCircle2
                  : metric.status === "warning"
                    ? AlertTriangle
                    : ShieldAlert;

              const statusColor =
                metric.status === "good"
                  ? "text-green-700"
                  : metric.status === "warning"
                    ? "text-amber-700"
                    : "text-rose-700";

              const statusBg =
                metric.status === "good"
                  ? "bg-green-50"
                  : metric.status === "warning"
                    ? "bg-amber-50"
                    : "bg-rose-50";

              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-xl p-4 border border-border/50",
                    statusBg
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-4 w-4", statusColor)} />
                      <span className="font-semibold text-foreground text-sm">
                        {metric.name}
                      </span>
                    </div>
                    <span className={cn("font-bold text-lg", statusColor)}>
                      {metric.value}
                    </span>
                  </div>
                  <p className="text-foreground/60 text-xs leading-relaxed ml-6">
                    {metric.interpretation}
                  </p>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
