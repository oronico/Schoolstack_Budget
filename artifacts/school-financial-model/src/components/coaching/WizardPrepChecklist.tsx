import { useState } from "react";
import { ClipboardList, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackCoachingEvent } from "@/lib/coaching/track";

const PREP_ITEMS = [
  {
    label: "Your expected tuition or enrollment fee",
    hint: "A rough number is fine - you can adjust later.",
  },
  {
    label: "A rough student count for Year 1",
    hint: "Even a ballpark like \"20–30 students\" works.",
  },
  {
    label: "What you plan to pay yourself (and any staff)",
    hint: "Don't forget to include yourself - your time has value.",
  },
  {
    label: "Your rent or expected facility cost",
    hint: "If you're using a donated space or your home, that's fine too.",
  },
  {
    label: "Any other staff you plan to hire",
    hint: "Teachers, aides, an admin - whoever you know you'll need.",
  },
];

interface WizardPrepChecklistProps {
  onReady: () => void;
}

export function WizardPrepChecklist({ onReady }: WizardPrepChecklistProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleReady = () => {
    trackCoachingEvent("wizard_prep_completed", {
      checkedCount: checked.size,
      totalItems: PREP_ITEMS.length,
      skipped: false,
    });
    onReady();
  };

  const handleSkip = () => {
    trackCoachingEvent("wizard_prep_completed", {
      checkedCount: checked.size,
      totalItems: PREP_ITEMS.length,
      skipped: true,
    });
    onReady();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="What to have ready">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-background rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
            <ClipboardList className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">Before you dive in</h2>
          <p className="text-sm text-muted-foreground mt-2">
            It helps to have a few things handy. Don't worry if you're not sure about everything - you can always come back and update.
          </p>
        </div>

        <div className="px-6 pb-4 space-y-2">
          {PREP_ITEMS.map((item, idx) => {
            const isChecked = checked.has(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggle(idx)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150",
                  isChecked
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-secondary/30 border-border/60 hover:border-border"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                    isChecked ? "bg-primary text-primary-foreground" : "border-2 border-muted-foreground/30"
                  )}
                >
                  {isChecked && <CheckCircle2 className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", isChecked ? "text-foreground" : "text-foreground/80")}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 pb-6 space-y-2">
          <button
            type="button"
            onClick={handleReady}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            <Sparkles className="h-4 w-4" />
            I have what I need - let's go
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
          >
            I'll figure it out as I go
          </button>
        </div>
      </div>
    </div>
  );
}
