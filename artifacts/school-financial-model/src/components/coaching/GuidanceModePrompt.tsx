import { useState } from "react";
import { BookOpen, Zap, GraduationCap, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";

const OPTIONS = [
  {
    value: "advanced" as const,
    icon: Zap,
    title: "I know school finance",
    description: "Keep the interface compact. Show help only when I ask for it.",
    color: "text-teal-600",
    bgColor: "bg-teal-50 border-teal-200 hover:border-teal-400",
    selectedBg: "bg-teal-100 border-teal-500 ring-2 ring-teal-200",
  },
  {
    value: "basics" as const,
    icon: BookOpen,
    title: "I know some basics",
    description: "Show guidance on key sections so I can make confident decisions.",
    color: "text-primary",
    bgColor: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    selectedBg: "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-200",
  },
  {
    value: "extra" as const,
    icon: GraduationCap,
    title: "I want extra guidance",
    description: "Explain concepts as I go so I can learn while I build my budget.",
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200 hover:border-amber-400",
    selectedBg: "bg-amber-100 border-amber-500 ring-2 ring-amber-200",
  },
];

interface GuidanceModePromptProps {
  onComplete: () => void;
}

export function GuidanceModePrompt({ onComplete }: GuidanceModePromptProps) {
  const { refetchUser } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await customFetch("/api/auth/guidance-level", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidanceLevel: selected }),
      });
      await refetchUser();
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Choose your guidance level">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-background rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={() => { setDismissed(true); onComplete(); }}
          className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Dismiss for now"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="px-6 pt-8 pb-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">How much guidance would you like?</h2>
          <p className="text-sm text-muted-foreground mt-2">
            We'll tailor the experience to your comfort level. You can always change this later.
          </p>
        </div>

        <div className="px-6 pb-4 space-y-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={cn(
                  "w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all duration-150",
                  isSelected ? opt.selectedBg : opt.bgColor
                )}
              >
                <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", opt.color)} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={() => { setDismissed(true); onComplete(); }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selected || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
