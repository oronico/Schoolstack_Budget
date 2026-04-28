import { ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { DECISION_LABELS, DECISION_THEME } from "@/lib/decision-flows";

export const STEP_LABELS = ["Why", "Inputs", "Impact", "Save"] as const;

interface DecisionFlowShellProps {
  decisionType: DecisionType;
  modelId: number;
  modelName: string;
  step: 1 | 2 | 3 | 4;
  setStep: (n: 1 | 2 | 3 | 4) => void;
  canAdvance: boolean;
  onSave: () => void;
  isSaving: boolean;
  saveLabel?: string;
  done?: boolean;
  doneCta?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

export function DecisionFlowShell({
  decisionType,
  modelId,
  modelName,
  step,
  setStep,
  canAdvance,
  onSave,
  isSaving,
  saveLabel = "Save this decision",
  done = false,
  doneCta,
  sidebar,
  children,
}: DecisionFlowShellProps) {
  const [, setLocation] = useLocation();
  const theme = DECISION_THEME[decisionType];
  const title = DECISION_LABELS[decisionType];

  const handleBack = () => {
    if (step === 1) {
      setLocation("/dashboard");
    } else {
      setStep((step - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep((step + 1) as 1 | 2 | 3 | 4);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid={`decision-flow-${decisionType}`}>
      {/* Header */}
      <header className="bg-card border-b border-border/60 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocation(`/model/${modelId}`)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            data-testid="decision-flow-cancel"
          >
            <X className="h-3.5 w-3.5" /> Exit
          </button>
          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
            <span>Dashboard</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate max-w-[12rem]">
              {modelName || "Untitled Model"}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={cn("font-semibold", theme.text)}>{title}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (n <= step || (n === step + 1 && canAdvance)) setStep(n);
                }}
                disabled={n > step && !(n === step + 1 && canAdvance)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 transition-colors",
                  n === step
                    ? cn(theme.bg, theme.text, "border", theme.border)
                    : n < step
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-muted text-muted-foreground border border-transparent",
                  n > step && !(n === step + 1 && canAdvance) && "opacity-60 cursor-not-allowed",
                )}
                data-testid={`decision-flow-step-${n}`}
              >
                {n < step ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="font-mono">{n}</span>
                )}
                <span className="hidden sm:inline">{STEP_LABELS[n - 1]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content + sidebar */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-8">
          <div className="min-w-0">{children}</div>
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Your model so far
              </p>
              <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                {sidebar}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Your model is a living document — changes here are saved as a scenario, not a rewrite.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border/60 sticky bottom-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
            data-testid="decision-flow-back"
          >
            <ChevronLeft className="h-4 w-4" /> {step === 1 ? "Back to dashboard" : "Back"}
          </button>
          <p className="hidden md:block text-xs text-muted-foreground italic ml-2">
            Your model is a living document — refine it as the answers change.
          </p>
          {done && doneCta ? (
            <div className="ml-auto">{doneCta}</div>
          ) : step < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                theme.accent,
              )}
              data-testid="decision-flow-next"
            >
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !canAdvance}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                theme.accent,
              )}
              data-testid="decision-flow-save"
            >
              {isSaving ? "Saving…" : saveLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
