import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import {
  ASSUMPTION_REGISTRY,
  computeAssumptionConfidenceRollup,
  type AssumptionConfidenceStatus,
} from "@workspace/finance";

// Task #703 — Assumptions Confidence rollup card on the Review step.
//
// Reads the same `assumptionConfidence` map the per-step
// AssumptionConfidenceCard writes to and rolls it up to a single
// Strong / Moderate / Needs Support badge with the verbatim founder-facing
// copy from the brief. Also lists any high-impact keys that are still
// bare estimates so the founder knows which one to firm up first.

const STATUS_THEME: Record<
  AssumptionConfidenceStatus,
  { tone: string; pill: string; Icon: typeof Shield }
> = {
  Strong: {
    tone: "border-emerald-200 bg-emerald-50/60",
    pill: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Icon: ShieldCheck,
  },
  Moderate: {
    tone: "border-amber-200 bg-amber-50/60",
    pill: "bg-amber-100 text-amber-900 border-amber-200",
    Icon: Shield,
  },
  "Needs Support": {
    tone: "border-rose-200 bg-rose-50/60",
    pill: "bg-rose-100 text-rose-800 border-rose-200",
    Icon: ShieldAlert,
  },
};

export function AssumptionConfidenceRollupCard({
  data,
}: {
  data: { assumptionConfidence?: Record<string, { confidence: string; evidenceNote?: string }> | undefined };
}) {
  const rollup = computeAssumptionConfidenceRollup(data);
  const theme = STATUS_THEME[rollup.status];
  const { Icon } = theme;
  const pct = Math.round(rollup.evidenceRatio * 100);

  return (
    <div
      data-testid="assumption-confidence-rollup"
      data-status={rollup.status}
      className={`rounded-2xl border p-6 shadow-sm ${theme.tone}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 text-foreground/80 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assumptions Confidence
            </p>
            <h3 className="font-display font-bold text-lg text-foreground mt-0.5">
              <span
                data-testid="assumption-confidence-rollup-status"
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm ${theme.pill}`}
              >
                {rollup.status}
              </span>
            </h3>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{rollup.taggedKeys}</span> of{" "}
            {rollup.totalKeys} assumptions tagged with evidence
          </p>
          <p className="mt-0.5">Weighted evidence score: {pct}%</p>
        </div>
      </div>
      <p
        data-testid="assumption-confidence-rollup-message"
        className="text-sm text-foreground mt-3 leading-relaxed"
      >
        {rollup.message}
      </p>
      {rollup.weakHighImpactKeys.length > 0 && (
        <div className="mt-4 rounded-xl bg-white/70 border border-border/60 p-3">
          <p className="text-xs font-semibold text-foreground">
            High-impact assumptions still without evidence
          </p>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {rollup.weakHighImpactKeys.map((k) => (
              <li
                key={k}
                data-testid={`assumption-confidence-rollup-weak-${k}`}
                className="text-xs text-foreground flex items-start gap-1.5"
              >
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{ASSUMPTION_REGISTRY[k]?.label ?? k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
