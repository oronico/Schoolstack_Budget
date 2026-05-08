import { useState } from "react";
import { GraduationCap, Briefcase, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";
import { trackCoachingEvent } from "@/lib/coaching/track";

// Two top-level modes (Guided Builder / CFO Mode) layered over the
// existing three-value `guidanceLevel` data model so every consumer
// (`useShowCoach`, micro-lessons, explainers) keeps working unchanged.
//
// - Guided Builder      → "extra"   (default depth: full explanations)
// - Guided · standard   → "basics"  (lighter explanations, kept for backward
//                                    compat and surfaced as a sub-density)
// - CFO Mode (Compact)  → "advanced" (no explanations, max density)
const MODES = [
  {
    id: "guided" as const,
    label: "Guided Builder",
    description: "Plain-English explanations, examples, and bookkeeping tie-ins on every step.",
    icon: GraduationCap,
    accent: "text-amber-600",
    levels: ["extra", "basics"] as const,
    defaultLevel: "extra" as const,
  },
  {
    id: "cfo" as const,
    label: "CFO Mode",
    description: "Compact layout. Advanced assumptions, source notes, and scenario controls visible by default.",
    icon: Briefcase,
    accent: "text-teal-600",
    levels: ["advanced"] as const,
    defaultLevel: "advanced" as const,
  },
];

const DEPTH_LABELS: Record<string, string> = {
  extra: "Extra help",
  basics: "Guided",
  advanced: "Compact",
};

const DEPTH_DESCRIPTIONS: Record<string, string> = {
  extra: "Worked examples, financing insights, common-mistake notes.",
  basics: "Key concepts and benchmarks at each step.",
  advanced: "Minimal guidance — for experienced operators.",
};

interface GuidanceModeSelectorProps {
  compact?: boolean;
}

export function GuidanceModeSelector({ compact }: GuidanceModeSelectorProps = {}) {
  const { user, refetchUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const current = user?.guidanceLevel || "basics";
  const currentMode =
    current === "advanced" ? "cfo" : "guided";

  const handleChange = async (level: string) => {
    if (level === current || saving) return;
    const oldLevel = current;
    setSaving(true);
    try {
      await customFetch("/api/auth/guidance-level", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidanceLevel: level }),
      });
      trackCoachingEvent("guidance_mode_changed", {
        previousGuidanceLevel: oldLevel,
        guidanceLevel: level,
      });
      await refetchUser();
    } catch (err) {
      console.warn("Failed to update guidance level:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-2 py-1.5" data-testid="guidance-mode-selector">
      {!compact && (
        <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Mode
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5 px-1">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleChange(mode.defaultLevel)}
              disabled={saving}
              data-testid={`guidance-mode-${mode.id}`}
              data-active={isActive}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-muted",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? mode.accent : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className={cn("text-sm font-semibold", isActive ? "text-foreground" : "text-foreground/80")}>
                  {mode.label}
                </span>
                {isActive && <Check className="h-3 w-3 text-primary shrink-0" aria-hidden="true" />}
              </div>
              {!compact && (
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {mode.description}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Depth sub-selector. Visible inside Guided Builder so founders can
          dial "Extra help" up or down without leaving the mode. CFO Mode
          locks to Compact, so we surface the row but disable the toggle. */}
      <div className="mt-2 px-1">
        <div
          role="radiogroup"
          aria-label="Guidance depth"
          className="flex flex-wrap gap-1"
        >
          {(currentMode === "guided" ? (["extra", "basics"] as const) : (["advanced"] as const)).map(
            (level) => {
              const isActive = current === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => handleChange(level)}
                  disabled={saving}
                  data-testid={`guidance-depth-${level}`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    isActive
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  title={DEPTH_DESCRIPTIONS[level]}
                >
                  {DEPTH_LABELS[level]}
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
