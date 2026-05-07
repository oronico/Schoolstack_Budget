import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONCEPT_EXPLANATIONS,
  type ConceptId,
} from "@/lib/coaching/concept-explanations";

interface ConceptExplainerProps {
  concept: ConceptId;
  className?: string;
  defaultOpen?: boolean;
}

export function ConceptExplainer({
  concept,
  className,
  defaultOpen = false,
}: ConceptExplainerProps) {
  const entry = CONCEPT_EXPLANATIONS[concept];
  const [open, setOpen] = useState(defaultOpen);

  if (!entry) return null;

  return (
    <div
      data-testid={`concept-explainer-${concept}`}
      className={cn(
        "rounded-lg border border-sky-200/70 bg-sky-50/40 overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`concept-explainer-toggle-${concept}`}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-sky-900 hover:bg-sky-100/40 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-sky-700/80" aria-hidden="true" />
        <span className="flex-1">{entry.title}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-sky-700/60" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sky-700/60" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          data-testid={`concept-explainer-body-${concept}`}
          className="border-t border-sky-200/60 px-3 py-2.5 text-[13px] leading-relaxed text-sky-950/85"
        >
          {entry.body}
        </div>
      )}
    </div>
  );
}
