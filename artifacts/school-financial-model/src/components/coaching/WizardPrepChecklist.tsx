import { Sparkles, BookOpen } from "lucide-react";
import { trackCoachingEvent } from "@/lib/coaching/track";

const PREP_ITEMS = [
  {
    label: "Tell us your story (about 5 minutes)",
    hint: "What kind of school you're building and who it's for. No numbers required.",
  },
  {
    label: "Set up the basics",
    hint: "State, opening year, entity type. We'll fill in defaults you can tweak later.",
  },
  {
    label: "Project enrollment & revenue",
    hint: "Even rough ballparks work — you can refine when you have real numbers.",
  },
  {
    label: "Plan staffing & expenses",
    hint: "We'll suggest typical staffing for your school type so you're not starting from scratch.",
  },
  {
    label: "Review, refine, and export",
    hint: "Your budget is a living document. Come back anytime as your plans evolve.",
  },
];

interface WizardPrepChecklistProps {
  onReady: () => void;
}

export function WizardPrepChecklist({ onReady }: WizardPrepChecklistProps) {
  const handleReady = () => {
    trackCoachingEvent("wizard_prep_completed", {
      checkedCount: 0,
      totalItems: PREP_ITEMS.length,
      skipped: false,
    });
    onReady();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="What to have ready">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-background rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
            <BookOpen className="h-6 w-6 text-amber-700" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">Here's what to expect</h2>
          <p className="text-sm text-muted-foreground mt-2">
            We start with your school's story, then walk through the numbers together. You don't need every answer ready — smart defaults and "I don't know yet" options are everywhere.
          </p>
        </div>

        <div className="px-6 pb-4 space-y-2">
          {PREP_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-secondary/20"
            >
              <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 space-y-2">
          <button
            type="button"
            onClick={handleReady}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            <Sparkles className="h-4 w-4" />
            Let's get started
          </button>
          <p className="text-center text-xs text-muted-foreground italic">
            Your budget is a living document. You can refine it any time.
          </p>
        </div>
      </div>
    </div>
  );
}
