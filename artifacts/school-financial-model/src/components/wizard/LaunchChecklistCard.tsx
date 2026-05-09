import { Compass, Circle } from "lucide-react";
import { LAUNCH_CHECKLIST_ITEMS, PATHWAY_FRAMING_COPY } from "@workspace/finance";

// Task #703 — Assumptions-first launch checklist.
//
// Rendered on the Story step whenever the founder picked the "We're
// launching" pathway. Replaces the older free-text framing block with a
// short, scannable list of the inputs reviewers will look at first so
// the founder can anchor each one to a piece of evidence as they walk
// the rest of the wizard.
//
// The PATHWAY_FRAMING_COPY.assumptions string is the verbatim brief copy
// — tests pin the substring "Since you do not have actuals yet" so the
// framing is never paraphrased away by accident.

export function LaunchChecklistCard() {
  return (
    <div
      data-testid="launch-checklist-card"
      className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-4"
    >
      <div className="flex items-start gap-3">
        <Compass className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-sky-900">Launch checklist</p>
          <p
            data-testid="launch-checklist-framing"
            className="text-sky-800/90 mt-1 leading-relaxed"
          >
            {PATHWAY_FRAMING_COPY.assumptions}
          </p>
        </div>
      </div>
      <ul className="space-y-2 pl-1" data-testid="launch-checklist-items">
        {LAUNCH_CHECKLIST_ITEMS.map((item) => (
          <li
            key={item.id}
            data-testid={`launch-checklist-item-${item.id}`}
            className="flex items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2 border border-sky-100"
          >
            <Circle className="h-3.5 w-3.5 text-sky-500 mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground leading-snug">{item.detail}</p>
              <p className="text-[11px] text-sky-700 mt-0.5">Firmed up on: {item.stepTitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
