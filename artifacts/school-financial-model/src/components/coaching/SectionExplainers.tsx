import { useAuth } from "@/lib/auth-context";
import {
  getExplainersForSection,
  type Explainer,
  type GuidanceLevel,
} from "@/lib/coaching/explainers";
import { isYetToLaunch } from "@/lib/coaching/founder-persona";
import { InlineHelpCard } from "./InlineHelpCard";

interface SectionExplainersProps {
  section: string;
  className?: string;
  schoolType?: string;
}

// Words/phrases that yet-to-launch founders should never see anywhere in
// the wizard. Mirrors the list enforced by `persona-yet-to-launch.test.tsx`
// (Task #302) and the e2e sweep (Task #304). We compute the full text of
// every explainer once per render and drop any whose copy contains a
// forbidden term — this is broader than gating by id, so a future
// explainer that quietly mentions "actuals" or "QuickBooks" gets hidden
// from yet_to_launch automatically rather than slipping through.
const YET_TO_LAUNCH_FORBIDDEN = [
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
  return YET_TO_LAUNCH_FORBIDDEN.some((re) => re.test(haystack));
}

export function SectionExplainers({ section, className, schoolType }: SectionExplainersProps) {
  const { user } = useAuth();
  const level = (user?.guidanceLevel as GuidanceLevel) || "basics";
  const yetToLaunch = isYetToLaunch(user);
  const explainers = getExplainersForSection(section, level).filter(
    (e) => !yetToLaunch || !explainerHasForbiddenCopy(e),
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
