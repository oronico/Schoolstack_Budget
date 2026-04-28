import { AlertTriangle, ArrowRight, ShieldAlert, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionIssue } from "@workspace/api-client-react";

const STEP_LABELS: Record<number, string> = {
  1: "Story",
  2: "School Details",
  3: "Assumptions",
  4: "Enrollment",
  5: "Revenue",
  6: "Staffing",
  7: "Expenses",
  8: "Review",
  9: "Consultant",
  10: "Lender Narrative",
  11: "Export",
};

const SEVERITY_CONFIG = {
  critical: {
    badge: "Critical",
    badgeClass: "bg-rose-100 text-rose-700 border-rose-200",
    borderClass: "border-l-rose-500",
    icon: ShieldAlert,
    iconClass: "text-rose-500",
  },
  high: {
    badge: "High",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    borderClass: "border-l-amber-500",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  medium: {
    badge: "Medium",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    borderClass: "border-l-blue-400",
    icon: AlertCircle,
    iconClass: "text-blue-500",
  },
};

interface TopIssuesPanelProps {
  issues: DecisionIssue[];
  jumpToStep?: (step: number) => void;
}

export function TopIssuesPanel({ issues, jumpToStep }: TopIssuesPanelProps) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">
            What should I fix first?
          </h2>
          <p className="text-sm text-muted-foreground">
            The top issues in your model, ranked by impact
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {issues.map((issue, idx) => {
          const config = SEVERITY_CONFIG[issue.severity];
          const Icon = config.icon;
          const stepLabel = STEP_LABELS[issue.relatedStep] || `Step ${issue.relatedStep}`;

          return (
            <div
              key={issue.id}
              className={cn(
                "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden",
                "border-l-4",
                config.borderClass,
              )}
            >
              <div className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="mt-0.5">
                    <Icon className={cn("h-5 w-5", config.iconClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                        config.badgeClass,
                      )}>
                        {config.badge}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        Issue {idx + 1} of {issues.length}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {issue.title}
                    </h3>
                  </div>
                </div>

                <p className="text-sm text-foreground/80 leading-relaxed mb-3 ml-8">
                  {issue.summary}
                </p>

                <div className="ml-8 space-y-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Why this matters
                    </p>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {issue.whyItMatters}
                    </p>
                  </div>

                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1">
                      What to do
                    </p>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {issue.recommendedAction}
                    </p>
                  </div>

                  {issue.supportingMetrics.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {issue.supportingMetrics.map((m) => (
                        <div key={m.label} className="text-xs">
                          <span className="text-muted-foreground">{m.label}:</span>{" "}
                          <span className="font-semibold text-foreground">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {jumpToStep && (
                    <button
                      onClick={() => jumpToStep(issue.relatedStep)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-1"
                    >
                      Go to {stepLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
