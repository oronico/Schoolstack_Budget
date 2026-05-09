import { cn } from "@/lib/utils";

// Task #703 — small inline badge that distinguishes a figure pulled
// from last year's actuals from a forward-looking projection. Surfaced
// next to numeric values on Review, the consultant view, and the
// founder workbook export so the actual-vs-projected distinction stays
// visible after the founder leaves the Actuals Intake step.

export type FigureKind = "actual" | "projected";

const STYLES: Record<FigureKind, string> = {
  actual:
    "bg-emerald-50 text-emerald-800 border-emerald-200",
  projected:
    "bg-slate-50 text-slate-600 border-slate-200",
};

const LABELS: Record<FigureKind, string> = {
  actual: "Actual",
  projected: "Projected",
};

export function ActualVsProjectedBadge({
  kind,
  sourceLabel,
  className,
}: {
  kind: FigureKind;
  /** Optional tooltip text — e.g. "From last year's books" or
   *  "Year 1 projection". Falls back to the kind label. */
  sourceLabel?: string;
  className?: string;
}) {
  return (
    <span
      data-testid={`actual-vs-projected-badge-${kind}`}
      title={sourceLabel || LABELS[kind]}
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[kind],
        className,
      )}
    >
      {LABELS[kind]}
    </span>
  );
}
