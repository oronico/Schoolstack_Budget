import { CheckCircle2, Sparkles } from "lucide-react";

// Task #703 — small chip used inline next to numbers on the Review step
// (and embedded in the Prior-Year vs Projected table headers) so a
// reader can immediately tell whether a column is "what really happened"
// vs "what we are forecasting." Same component is reused as a compact
// inline badge and as a column-header pill.

export type ActualVsProjectedKind = "actual" | "projected";
// Backwards-compat alias for HEAD callers that imported `FigureKind`.
export type FigureKind = ActualVsProjectedKind;

const COPY: Record<ActualVsProjectedKind, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  actual: {
    label: "Actual",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Icon: CheckCircle2,
  },
  projected: {
    label: "Projected",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    Icon: Sparkles,
  },
};

export function ActualVsProjectedBadge({
  kind,
  className = "",
  sourceLabel,
}: {
  kind: ActualVsProjectedKind;
  className?: string;
  /** Optional tooltip text — e.g. "From last year's books" or
   *  "Year 1 projection". Falls back to the kind label. Preserved from
   *  the HEAD implementation so existing callers that pass it keep
   *  working after the rebase. */
  sourceLabel?: string;
}) {
  const { label, tone, Icon } = COPY[kind];
  return (
    <span
      data-testid={`actual-vs-projected-badge-${kind}`}
      title={sourceLabel || label}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone} ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
