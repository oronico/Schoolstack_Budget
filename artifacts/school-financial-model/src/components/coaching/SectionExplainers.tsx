import {
  getExplainersForSection,
  type Explainer,
} from "@/lib/coaching/explainers";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { InlineHelpCard } from "./InlineHelpCard";

interface SectionExplainersProps {
  section: string;
  className?: string;
  schoolType?: string;
  /**
   * Task #597: structural gate now follows the *model's* schoolStage rather
   * than the founder's onboarding persona. Forbidden actuals / QuickBooks /
   * variance / forecast-accuracy copy is dropped only when the model itself
   * is `new_school` — the same content is appropriate for an
   * `operating_school` model regardless of whether the founder picked
   * `yet_to_launch` at sign-in. Mirrors the migration in
   * WhatThisMeansInYourBooks.tsx and the wizard-step audit (Task #595).
   */
  schoolStage?: string;
}

// Words/phrases that pre-opening (`new_school`) models should never surface
// anywhere in the wizard. Mirrors the list enforced by
// `persona-yet-to-launch.test.tsx` (Task #302) and the e2e sweep (Task
// #304). We compute the full text of every explainer once per render and
// drop any whose copy contains a forbidden term — this is broader than
// gating by id, so a future explainer that quietly mentions "actuals" or
// "QuickBooks" gets hidden automatically rather than slipping through.
const PRE_OPENING_FORBIDDEN = [
  /\bactuals\b/i,
  /prior[\s-]?year/i,
  /quickbooks/i,
  /\bxero\b/i,
  /\bvariance/i,
  /forecast accuracy/i,
];

function explainerHasForbiddenCopy(e: Explainer): boolean {
  const body = e.body ?? {};
  const extra = e.extraBody ?? {};
  const haystack = [
    e.title,
    body.whatThisMeans,
    body.whyItMatters,
    body.healthyVsRisky,
    body.whatToDoNext,
    extra.workedExample,
    extra.benchmarkDetail,
    extra.glossaryTerms,
  ]
    .filter((s): s is string => typeof s === "string")
    .join(" ");
  return PRE_OPENING_FORBIDDEN.some((re) => re.test(haystack));
}

export function SectionExplainers({ section, className, schoolType, schoolStage }: SectionExplainersProps) {
  const { guidanceLevel: level } = useShowCoach();
  const isPreOpening = schoolStage === "new_school";
  const explainers = getExplainersForSection(section, level).filter(
    (e) => !isPreOpening || !explainerHasForbiddenCopy(e),
  );

  if (explainers.length === 0) return null;

  return (
    <div className={className}>
      <div className="space-y-2">
        {explainers.map((e) => (
          <InlineHelpCard key={e.id} explainer={e} section={section} schoolType={schoolType} />
        ))}
      </div>
    </div>
  );
}
