import { ReactNode, useEffect, useRef } from "react";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { cn } from "@/lib/utils";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { EXPLAINERS } from "@/lib/coaching/explainers";
import { trackCoachingEvent } from "@/lib/coaching/track";

// Last-resort fallback if a decision explainer is missing its
// `commonReasons` list. We never expect to hit this in production because
// every DecisionType has explainer-sourced chips, but the empty arrays
// keep WhyStep render-safe if a future decision type is added without
// updating explainers.ts at the same time.
const FALLBACK_REASON_CHIPS: Record<DecisionType, string[]> = {
  add_program: [],
  evaluate_site: [],
  change_enrollment: [],
};

interface WhyStepProps {
  decisionType: DecisionType;
  intro: ReactNode;
  prepareList: string[];
  narrative: string;
  setNarrative: (v: string) => void;
}

export function WhyStep({ decisionType, intro, prepareList, narrative, setNarrative }: WhyStepProps) {
  // Task #499: shared coach-gate hook keeps every coach-gated surface in sync.
  const { guidanceLevel, showCoach } = useShowCoach();
  const coachExplainer = EXPLAINERS[`decision_${decisionType}`];
  // Pull "common reasons" chips from the explainer so the coach copy and
  // the chip set stay in lockstep — explainers.ts is now the single source
  // of truth for both the WhyThisMatters callout and the tap-to-add chips.
  const chips = coachExplainer?.body.commonReasons ?? FALLBACK_REASON_CHIPS[decisionType];
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!showCoach || !coachExplainer || trackedRef.current) return;
    trackedRef.current = true;
    trackCoachingEvent("decision_why_explainer_shown", {
      decisionType,
      explainerId: coachExplainer.id,
      guidanceLevel,
    });
  }, [showCoach, coachExplainer, decisionType, guidanceLevel]);
  // Engagement signal: tapping any of the "common reasons" chips counts as
  // the founder acting on the WhyThisMatters callout (the chips are sourced
  // from the same explainer body). Fired once per mount.
  const engagedRef = useRef(false);
  const toggleChip = (chip: string) => {
    if (showCoach && coachExplainer && !engagedRef.current) {
      engagedRef.current = true;
      trackCoachingEvent("decision_why_explainer_engaged", {
        decisionType,
        explainerId: coachExplainer.id,
        guidanceLevel,
        chip,
      });
    }
    const lines = narrative.split("\n").map((l) => l.trim()).filter(Boolean);
    const tag = `• ${chip}`;
    if (lines.includes(tag)) {
      setNarrative(lines.filter((l) => l !== tag).join("\n"));
    } else {
      setNarrative([tag, ...lines].join("\n"));
    }
  };
  const isChipActive = (chip: string) => narrative.split("\n").some((l) => l.trim() === `• ${chip}`);

  return (
    <section className="max-w-2xl space-y-5" data-testid={`why-step-${decisionType}`}>
      {intro}

      {showCoach && coachExplainer && (
        <div data-testid={`why-step-coach-${decisionType}`}>
          <WhyThisMatters
            title={coachExplainer.title}
            why={coachExplainer.body.whyItMatters}
            revisit={coachExplainer.body.whatToDoNext}
          />
        </div>
      )}

      <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
        <label htmlFor="decision-why-text" className="block text-sm font-semibold text-foreground mb-1">
          Why are you exploring this decision?
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          A sentence or two is plenty. We'll save it alongside the numbers so future-you (and your board) remember the reasoning.
        </p>
        <textarea
          id="decision-why-text"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="What's driving this? What outcome would make this worth it?"
          rows={4}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
          data-testid="decision-why-narrative"
        />

        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
          Common reasons (tap to add)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const active = isChipActive(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                className={cn(
                  "text-xs rounded-full px-3 py-1.5 border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary/50",
                )}
                data-testid={`decision-why-chip-${chip.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {prepareList.length > 0 && (
        <div className="bg-muted/30 border border-border/60 rounded-xl p-4 text-sm">
          <p className="font-semibold mb-1 text-foreground">What you'll need handy</p>
          <ul className="list-disc pl-5 space-y-1 text-foreground/80 text-xs">
            {prepareList.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
