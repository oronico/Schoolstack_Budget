import { useState } from "react";
import { X, ChevronLeft, ChevronRight, BookOpen, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIMER_CARDS, type PrimerCard } from "@/lib/coaching/primer-content";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface BudgetPrimerProps {
  onClose: () => void;
}

const PRIMER_COMPLETED_KEY = "schoolstack_primer_completed";

function isPrimerCompleted(): boolean {
  return localStorage.getItem(PRIMER_COMPLETED_KEY) === "true";
}

function markPrimerCompleted(): void {
  localStorage.setItem(PRIMER_COMPLETED_KEY, "true");
}

function PrimerCardView({ card, index, total }: { card: PrimerCard; index: number; total: number }) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-primary/60 uppercase tracking-wide">
          {index + 1} of {total}
        </span>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>
      <h3 className="text-lg font-bold text-foreground mb-3">{card.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{card.body}</p>
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
        <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs font-semibold text-primary">{card.takeaway}</p>
      </div>
    </div>
  );
}

export function BudgetPrimer({ onClose }: BudgetPrimerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const card = PRIMER_CARDS[currentIndex];

  const handleNext = () => {
    if (currentIndex < PRIMER_CARDS.length - 1) {
      setCurrentIndex(currentIndex + 1);
      trackCoachingEvent("primer_card_viewed", {
        cardId: PRIMER_CARDS[currentIndex + 1].id,
        cardIndex: currentIndex + 1,
      });
    } else {
      markPrimerCompleted();
      trackCoachingEvent("primer_completed", { cardsViewed: PRIMER_CARDS.length });
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleSkip = () => {
    trackCoachingEvent("primer_skipped", {
      cardIndex: currentIndex,
      cardsViewed: currentIndex + 1,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 to-teal-500/10 px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Budgeting Basics for School Founders</h2>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">5 minutes · Skip anytime · Come back from the Help menu</p>
        </div>

        <div className="px-6 py-5 min-h-[280px]">
          <PrimerCardView card={card} index={currentIndex} total={PRIMER_CARDS.length} />
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              currentIndex === 0
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-black/5"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              {currentIndex === PRIMER_CARDS.length - 1 ? "Done" : "Next"}
              {currentIndex < PRIMER_CARDS.length - 1 && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
