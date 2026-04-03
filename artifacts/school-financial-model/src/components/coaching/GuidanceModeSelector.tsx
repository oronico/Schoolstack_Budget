import { useState } from "react";
import { BookOpen, Zap, GraduationCap, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";
import { trackCoachingEvent } from "@/lib/coaching/track";

const LEVELS = [
  { value: "advanced", icon: Zap, label: "Compact", description: "Minimal guidance — for experienced operators", color: "text-teal-600" },
  { value: "basics", icon: BookOpen, label: "Guided", description: "Key concepts and benchmarks at each step", color: "text-primary" },
  { value: "extra", icon: GraduationCap, label: "Extra help", description: "Deep dives with worked examples and financing insights", color: "text-amber-600" },
] as const;

export function GuidanceModeSelector({ compact }: { compact?: boolean } = {}) {
  const { user, refetchUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const current = user?.guidanceLevel || "basics";

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
    <div className="px-2 py-1.5">
      {!compact && <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Guidance level</p>}
      {LEVELS.map((lvl) => {
        const Icon = lvl.icon;
        const isActive = current === lvl.value;
        return (
          <button
            key={lvl.value}
            type="button"
            onClick={() => handleChange(lvl.value)}
            disabled={saving}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left",
              isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", isActive ? lvl.color : "")} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <span>{lvl.label}</span>
              <p className="text-[11px] text-muted-foreground font-normal leading-tight mt-0.5">{lvl.description}</p>
            </div>
            {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
