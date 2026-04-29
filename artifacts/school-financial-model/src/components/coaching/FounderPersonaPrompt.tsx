import { useState, useEffect } from "react";
import { Sparkles, Compass, Building2, BookOpen, GraduationCap, Check, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { cn } from "@/lib/utils";
import type { FounderStage, FounderComfort } from "@/lib/coaching/founder-persona";
import { getFounderPersona } from "@/lib/coaching/founder-persona";

// Task #302 asks for an explicit four-bucket picker so the founder makes
// a single combined choice instead of two stacked questions. The picker
// surfaces all 2x2 combinations as plain-English cards on one screen.
type PersonaBucket = {
  stage: FounderStage;
  comfort: FounderComfort;
  icon: typeof Compass;
  title: string;
  description: string;
  bgColor: string;
  selectedBg: string;
  iconColor: string;
};

// Picker copy is intentionally jargon-free. Strict product rule: words like
// "actuals", "variance", "QuickBooks", "Xero", "prior year" must NOT appear
// on the picker so a yet-to-launch founder doesn't see them even pre-pick.
// `persona-yet-to-launch.test.tsx` enforces this in tests.
const PERSONA_BUCKETS: PersonaBucket[] = [
  {
    stage: "yet_to_launch",
    comfort: "new_to_budgeting",
    icon: Compass,
    title: "I'm planning a school and budgeting is new to me",
    description:
      "We'll guide you in plain English, skip jargon, and stay focused on pre-opening planning.",
    bgColor: "bg-amber-50 border-amber-200 hover:border-amber-400",
    selectedBg: "bg-amber-100 border-amber-500 ring-2 ring-amber-200",
    iconColor: "text-amber-600",
  },
  {
    stage: "yet_to_launch",
    comfort: "comfortable",
    icon: BookOpen,
    title: "I'm planning a school and I'm comfortable with budgets",
    description:
      "Compact tone, focused on pre-opening planning. We'll cut explainers and skip surfaces meant for operating schools.",
    bgColor: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    selectedBg: "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-200",
    iconColor: "text-emerald-600",
  },
  {
    stage: "existing",
    comfort: "new_to_budgeting",
    icon: GraduationCap,
    title: "I run a school and budgeting is new to me",
    description:
      "We'll explain things as we go and unlock the operating-school tools when you're ready.",
    bgColor: "bg-teal-50 border-teal-200 hover:border-teal-400",
    selectedBg: "bg-teal-100 border-teal-500 ring-2 ring-teal-200",
    iconColor: "text-teal-600",
  },
  {
    stage: "existing",
    comfort: "comfortable",
    icon: Building2,
    title: "I run a school and I'm comfortable with budgets",
    description:
      "Compact tone with the full operating-school toolkit turned on.",
    bgColor: "bg-slate-50 border-slate-200 hover:border-slate-400",
    selectedBg: "bg-slate-100 border-slate-500 ring-2 ring-slate-200",
    iconColor: "text-slate-700",
  },
];

interface FounderPersonaPromptProps {
  onComplete?: () => void;
  // When `mode === "edit"`, the user has already onboarded and is re-picking
  // their persona from the Navbar settings menu. The modal then renders a
  // close (X) button and pre-selects their current persona; in `first-time`
  // mode (the default) it cannot be dismissed without making a choice.
  mode?: "first-time" | "edit";
  onClose?: () => void;
}

// Replaces the older GuidanceModePrompt for first-time sign-in. Forces a
// stage + comfort selection via four explicit bucket cards; the API call
// seeds guidanceLevel from comfort so the user only has to make one choice
// before reaching the dashboard.
export function FounderPersonaPrompt({ onComplete, mode = "first-time", onClose }: FounderPersonaPromptProps) {
  const { user, refetchUser } = useAuth();
  const initialPersona = getFounderPersona(user);
  const [stage, setStage] = useState<FounderStage | null>(initialPersona.stage);
  const [comfort, setComfort] = useState<FounderComfort | null>(initialPersona.comfort);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = mode === "edit";

  useEffect(() => {
    trackCoachingEvent("founder_persona_prompt_shown", { mode });
  }, [mode]);

  const canSubmit = !!stage && !!comfort && !saving;

  const handlePick = (bucket: PersonaBucket) => {
    setStage(bucket.stage);
    setComfort(bucket.comfort);
  };

  const handleSave = async () => {
    if (!stage || !comfort) return;
    setSaving(true);
    setError(null);
    try {
      await customFetch("/api/auth/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, comfort }),
      });
      await refetchUser();
      onComplete?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tell us about you"
      data-testid="founder-persona-prompt"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={isEdit ? onClose : undefined}
      />
      <div className="relative w-full max-w-3xl bg-background rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-300 max-h-[92vh] overflow-y-auto">
        {isEdit && (
          <button
            type="button"
            onClick={onClose}
            data-testid="persona-prompt-close"
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {isEdit ? "Update your founder profile" : "Welcome — let's tailor this to you"}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {isEdit
              ? "Pick the option that matches where you are now. We'll re-tune the tone and surfaces accordingly."
              : "Pick the card that fits you best. We'll set the right tone and turn on only the tools that apply to your situation. You can change this later."}
          </p>
        </div>

        <div className="px-6 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PERSONA_BUCKETS.map((bucket) => {
              const Icon = bucket.icon;
              const isSelected = stage === bucket.stage && comfort === bucket.comfort;
              return (
                <button
                  key={`${bucket.stage}-${bucket.comfort}`}
                  type="button"
                  onClick={() => handlePick(bucket)}
                  data-testid={`persona-bucket-${bucket.stage}-${bucket.comfort}`}
                  data-stage={bucket.stage}
                  data-comfort={bucket.comfort}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-150",
                    isSelected ? bucket.selectedBg : bucket.bgColor,
                  )}
                >
                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", bucket.iconColor)} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      {bucket.title}
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{bucket.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pt-3 pb-6">
          {error && (
            <p className="text-sm text-red-600 text-center mb-3" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSubmit}
            data-testid="persona-prompt-submit"
            className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
