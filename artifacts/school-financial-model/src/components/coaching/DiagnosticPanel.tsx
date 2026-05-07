import { useMemo, useEffect, useRef } from "react";
import { AlertTriangle, AlertCircle, Info, ArrowRight, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { runDiagnostics, computeWhatIfSuggestions, type DiagnosticFinding, type DiagnosticSeverity, type WhatIfSuggestion } from "@/lib/coaching/diagnostics-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface DiagnosticPanelProps {
  data: FullModelData;
  onNavigateToStep?: (step: number) => void;
  className?: string;
  maxResults?: number;
  /** When provided, only diagnostic findings whose id is in this list are
   * shown — used by decision-flow shells to surface coaching that's
   * relevant to the active decision (e.g. "add a program" pulls staffing
   * + breakeven, not facility cost). The full diagnostic engine still
   * runs so analytics on the global model stay accurate. */
  relevantIds?: readonly string[];
}

const SEVERITY_CONFIG: Record<DiagnosticSeverity, { icon: typeof AlertTriangle; color: string; bg: string; border: string; label: string }> = {
  critical: {
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    label: "Needs attention",
  },
  warning: {
    icon: AlertCircle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "Watch this",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    label: "Good to know",
  },
};

const STEP_NAMES: Record<number, string> = {
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

function DiagnosticCard({ finding, onNavigate, whatIf }: { finding: DiagnosticFinding; onNavigate?: (step: number) => void; whatIf?: WhatIfSuggestion }) {
  const config = SEVERITY_CONFIG[finding.severity];
  const Icon = config.icon;
  const stepName = STEP_NAMES[finding.targetStep] || `Step ${finding.targetStep}`;

  return (
    <div className={cn("rounded-xl border p-4 transition-all duration-200", config.border, config.bg)}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 shrink-0 rounded-lg p-1.5", config.bg)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs font-semibold uppercase tracking-wide", config.color)}>
              {config.label}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1.5">
            {finding.headline}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {finding.explanation}
          </p>
          {whatIf && (
            <div className="mb-3 rounded-lg bg-white/60 border border-border/40 p-2.5 flex items-start gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">What if: {whatIf.lever}</p>
                <p className="text-xs text-foreground/80 leading-relaxed">{whatIf.impact}</p>
              </div>
            </div>
          )}
          {/* Task #686 — `nextStep` is a required field on every finding. */}
          <div className="mb-3 rounded-lg bg-white/70 border border-emerald-200 p-2.5">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">
              Next step
            </p>
            <p className="text-xs text-foreground/90 leading-relaxed">
              {finding.nextStep}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground/80 italic flex-1">
              {finding.action}
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => {
                  trackCoachingEvent("diagnostic_action_clicked", {
                    diagnosticId: finding.id,
                    targetStep: finding.targetStep,
                  });
                  onNavigate(finding.targetStep);
                }}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  "bg-white/80 hover:bg-white border shadow-sm",
                  config.border, config.color
                )}
              >
                Go to {stepName}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticPanel({ data, onNavigateToStep, className, maxResults = 3, relevantIds }: DiagnosticPanelProps) {
  const { guidanceLevel: level } = useShowCoach();

  const findings = useMemo(() => {
    // When a decision-flow shell scopes us via `relevantIds`, fetch a wider
    // pool from the engine first and then filter so we still surface up to
    // `maxResults` *relevant* findings rather than getting unlucky with the
    // global top-N.
    if (relevantIds && relevantIds.length > 0) {
      const pool = runDiagnostics(data, 50);
      const allowed = new Set(relevantIds);
      return pool.filter((f) => allowed.has(f.id)).slice(0, maxResults);
    }
    return runDiagnostics(data, maxResults);
  }, [data, maxResults, relevantIds]);
  const whatIfSuggestions = useMemo(() => computeWhatIfSuggestions(data), [data]);
  const whatIfMap = useMemo(() => {
    const map = new Map<string, WhatIfSuggestion>();
    for (const s of whatIfSuggestions) {
      if (!map.has(s.findingId)) map.set(s.findingId, s);
    }
    return map;
  }, [whatIfSuggestions]);

  const trackedRef = useRef<string>("");
  useEffect(() => {
    if (findings.length === 0) return;
    const key = findings.map(f => f.id).join(",");
    if (key === trackedRef.current) return;
    trackedRef.current = key;
    trackCoachingEvent("diagnostic_panel_shown", {
      findingCount: findings.length,
      findingIds: findings.map(f => f.id),
      guidanceLevel: level,
    });
  }, [findings, level]);

  if (findings.length === 0) {
    return (
      <div className={cn("rounded-xl border border-emerald-200 bg-emerald-50/50 p-4", className)}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-1.5">
            <Info className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-800">Looking good so far</h4>
            <p className="text-xs text-emerald-600 mt-0.5">No major issues detected in your model. Keep going!</p>
          </div>
        </div>
      </div>
    );
  }

  const hasCritical = findings.some(f => f.severity === "critical");

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-foreground">
          {hasCritical ? "Items that need your attention" : "A few things to consider"}
        </h3>
        <span className="text-xs text-muted-foreground">
          ({findings.length} {findings.length === 1 ? "item" : "items"})
        </span>
      </div>
      {findings.map((finding) => (
        <DiagnosticCard
          key={finding.id}
          finding={finding}
          onNavigate={onNavigateToStep}
          whatIf={whatIfMap.get(finding.id)}
        />
      ))}
    </div>
  );
}
