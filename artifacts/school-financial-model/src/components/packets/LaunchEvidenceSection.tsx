import { ClipboardList, CheckCircle2, Circle } from "lucide-react";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { isNewSchool, summarizeLaunchReadiness } from "@/lib/launch-readiness";

// Task #718 — Launch evidence in the lender packet / consultant analysis.
//
// Mirrors the dashboard's `LaunchReadinessCard` (Task #711) so reviewers
// reading the lender narrative or the consultant analysis can see at a
// glance how grounded a brand-new school's plan is in real evidence
// (committed students, signed agreements, deposits, opening cadence)
// before scrutinizing the projections.
//
// Operating-school packets render nothing — they have actuals instead.

interface Props {
  data: FullModelData | undefined | null;
  /** Optional context line — e.g. "in the lender narrative" — appended
   *  to the helper sentence so reviewers know which surface they're on. */
  contextLabel?: string;
  testId?: string;
}

export function LaunchEvidenceSection({
  data,
  contextLabel,
  testId = "launch-evidence-section",
}: Props) {
  if (!data || !isNewSchool(data)) return null;

  const summary = summarizeLaunchReadiness(data);
  const filled = summary.filled.length;
  const total = summary.total;
  const complete = filled === total;

  return (
    <div
      data-testid={testId}
      className="border border-sky-200/70 bg-sky-50/40 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-sky-700" />
            Launch evidence
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            How grounded this brand-new school's plan is in real evidence{contextLabel ? ` ${contextLabel}` : ""}.
          </p>
        </div>
        <p
          data-testid={`${testId}-count`}
          className="text-xs font-medium text-foreground whitespace-nowrap"
        >
          <span className="font-display font-bold text-lg text-sky-700 tabular-nums">
            {filled}
          </span>{" "}
          <span className="text-muted-foreground">of {total} filled</span>
        </p>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {summary.filled.map((field) => (
          <li
            key={field.key}
            data-testid={`${testId}-filled-${field.key}`}
            className="flex items-start gap-2 text-xs text-emerald-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-600" />
            <span>{field.label}</span>
          </li>
        ))}
        {summary.missing.map((field) => (
          <li
            key={field.key}
            data-testid={`${testId}-missing-${field.key}`}
            className="flex items-start gap-2 text-xs text-muted-foreground"
          >
            <Circle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
            <span>{field.label}</span>
          </li>
        ))}
      </ul>

      {complete ? (
        <p
          data-testid={`${testId}-complete`}
          className="text-xs text-emerald-700 font-medium"
        >
          Every launch-checklist item is filled — the plan is grounded in evidence.
        </p>
      ) : null}
    </div>
  );
}
