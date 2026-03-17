import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Explainer } from "@/lib/coaching/explainers";
import { useAuth } from "@/lib/auth-context";
import { shouldAutoExpand } from "@/lib/coaching/explainers";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface InlineHelpCardProps {
  explainer: Explainer;
  className?: string;
  defaultOpen?: boolean;
  section?: string;
}

export function InlineHelpCard({ explainer, className, defaultOpen, section }: InlineHelpCardProps) {
  const { user } = useAuth();
  const level = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const autoExpand = defaultOpen ?? shouldAutoExpand(level, explainer);
  const [isOpen, setIsOpen] = useState(autoExpand);

  const toggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    trackCoachingEvent(next ? "explainer_opened" : "explainer_collapsed", {
      explainerId: explainer.id,
      section: section || explainer.relatedSection,
      guidanceLevel: level,
    });
  }, [isOpen, explainer.id, explainer.relatedSection, section, level]);

  return (
    <div className={cn("rounded-xl border border-primary/15 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 overflow-hidden transition-all duration-200", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1"
        aria-expanded={isOpen}
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
        <span className="flex-1 text-[13px]">Explain: {explainer.title}</span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary/50" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary/50" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-primary/10 px-3 py-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <ExplainerSection label="What this means" text={explainer.body.whatThisMeans} />
          <ExplainerSection label="Why it matters" text={explainer.body.whyItMatters} />
          <ExplainerSection label="Healthy vs risky" text={explainer.body.healthyVsRisky} />
          <ExplainerSection label="What to do next" text={explainer.body.whatToDoNext} />
        </div>
      )}
    </div>
  );
}

function ExplainerSection({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 mb-0.5">{label}</p>
      <p className="text-[13px] text-foreground/80 leading-relaxed">{text}</p>
    </div>
  );
}

interface ExplainThisTriggerProps {
  explainer: Explainer;
  className?: string;
  section?: string;
}

export function ExplainThisTrigger({ explainer, className, section }: ExplainThisTriggerProps) {
  const [showCard, setShowCard] = useState(false);

  if (showCard) {
    return (
      <div className={className}>
        <InlineHelpCard explainer={explainer} defaultOpen section={section} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setShowCard(true);
        trackCoachingEvent("explainer_opened", {
          explainerId: explainer.id,
          section: section || explainer.relatedSection,
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded px-1 py-0.5",
        className
      )}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Explain this
    </button>
  );
}
