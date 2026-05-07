import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import {
  ASSUMPTION_REGISTRY,
  ASSUMPTION_CONFIDENCE_LEVELS,
  ASSUMPTION_CONFIDENCE_LABELS,
  ASSUMPTION_CONFIDENCE_DESCRIPTIONS,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  listAssumptionKeysByStep,
  type AssumptionKey,
  type AssumptionConfidenceLevel,
  type AssumptionConfidenceEntry,
} from "@workspace/finance";
import { cn } from "@/lib/utils";
import { useOptionalAuth } from "@/lib/auth-context";
import { isYetToLaunch } from "@/lib/coaching/founder-persona";

// Task #659 — per-step Assumptions Confidence card. Lists every registry
// key whose `stepTitle` matches the current wizard step and renders a
// 5-level confidence picker + collapsible evidence-note textarea for each.
// Per-step tally ("3 of 4 sourced") sits in the header so the founder can
// see at a glance how grounded the step's numbers are.
//
// Reads / writes `assumptionConfidence.<key>` on the form. The map is
// optional in the schema; older models without confidence data still load.

type ConfidenceMap = Record<string, AssumptionConfidenceEntry | undefined>;

const COLOR_BY_LEVEL: Record<AssumptionConfidenceLevel, string> = {
  actuals: "bg-emerald-100 text-emerald-800 border-emerald-300",
  signed_agreement: "bg-emerald-50 text-emerald-700 border-emerald-200",
  quote: "bg-sky-50 text-sky-700 border-sky-200",
  research: "bg-amber-50 text-amber-700 border-amber-200",
  estimate: "bg-slate-50 text-slate-600 border-slate-200",
};

export function AssumptionConfidenceCard({ stepTitle }: { stepTitle: string }) {
  const { watch, setValue } = useFormContext();
  // useOptionalAuth (vs. useAuth) so that leaf wizard steps rendered in
  // unit tests without the full AuthProvider stack don't crash. Falls back
  // to a default (non yet_to_launch) persona when no auth context exists.
  const auth = useOptionalAuth();
  // Task #302 / #659 — yet_to_launch founders must not see "actuals" or
  // "QuickBooks" copy anywhere in the wizard. Drop the actuals level (they
  // have no actuals to cite) and swap the placeholder so the persona sweep
  // tests stay green while still letting them tag evidence sources.
  const yetToLaunch = isYetToLaunch(auth?.user);
  const levels = yetToLaunch
    ? ASSUMPTION_CONFIDENCE_LEVELS.filter((l) => l !== "actuals")
    : ASSUMPTION_CONFIDENCE_LEVELS;
  const notePlaceholder = yetToLaunch
    ? "e.g. Architect's written quote dated Mar 2025; or peer-school benchmark from NAIS 2023 report."
    : "e.g. Pulled from QuickBooks 2024 P&L; or peer-school benchmark from NAIS 2023 report.";
  const keys = listAssumptionKeysByStep(stepTitle);
  if (keys.length === 0) return null;

  const map = (watch("assumptionConfidence") as ConfidenceMap | undefined) || {};
  const setEntry = (key: AssumptionKey, next: AssumptionConfidenceEntry | undefined) => {
    const cur = (watch("assumptionConfidence") as ConfidenceMap | undefined) || {};
    const out = { ...cur };
    if (!next) {
      delete out[key];
    } else {
      out[key] = next;
    }
    setValue("assumptionConfidence", out, { shouldDirty: true });
  };

  const setLevel = (key: AssumptionKey, level: AssumptionConfidenceLevel) => {
    const cur = map[key];
    setEntry(key, { confidence: level, evidenceNote: cur?.evidenceNote });
  };

  const setNote = (key: AssumptionKey, note: string) => {
    const cur = map[key];
    if (!cur) {
      setEntry(key, { confidence: "estimate", evidenceNote: note });
      return;
    }
    setEntry(key, { confidence: cur.confidence, evidenceNote: note });
  };

  // Task #659 — "with evidence" = either a non-estimate confidence level
  // (which itself implies evidence: actuals, signed agreement, quote,
  // research) OR an "estimate" tagged with an evidence note. Bare
  // "estimate" with no note doesn't count, matching the requirement that
  // the tally reflects evidence attachment, not just any selection.
  const withEvidence = keys.filter((k) => {
    const e = map[k];
    if (!e) return false;
    if (e.confidence !== "estimate") return true;
    return !!(e.evidenceNote && e.evidenceNote.trim().length > 0);
  }).length;
  const total = keys.length;

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4"
      data-testid="assumption-confidence-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <h4 className="font-display font-bold text-sm text-foreground">
              Where do these numbers come from?
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tag each assumption with its source so a reviewer can see the
              reasoning, not just the number. Showing your evidence is the
              fastest way to build trust with a lender or board.
            </p>
          </div>
        </div>
        <div
          className="text-xs font-semibold text-muted-foreground whitespace-nowrap"
          data-testid="assumption-confidence-tally"
        >
          {withEvidence} of {total} with evidence
        </div>
      </div>

      <div className="space-y-3">
        {keys.map((key) => (
          <ConfidenceRow
            key={key}
            assumptionKey={key}
            entry={map[key]}
            levels={levels}
            notePlaceholder={notePlaceholder}
            onSetLevel={(lvl) => setLevel(key, lvl)}
            onSetNote={(note) => setNote(key, note)}
          />
        ))}
      </div>
    </div>
  );
}

function ConfidenceRow({
  assumptionKey,
  entry,
  levels,
  notePlaceholder,
  onSetLevel,
  onSetNote,
}: {
  assumptionKey: AssumptionKey;
  entry: AssumptionConfidenceEntry | undefined;
  levels: readonly AssumptionConfidenceLevel[];
  notePlaceholder: string;
  onSetLevel: (level: AssumptionConfidenceLevel) => void;
  onSetNote: (note: string) => void;
}) {
  const meta = ASSUMPTION_REGISTRY[assumptionKey];
  const [expanded, setExpanded] = useState(!!entry?.evidenceNote);
  const level = entry?.confidence;
  const isHighImpact = HIGH_IMPACT_CONFIDENCE_KEYS.includes(assumptionKey);
  const needsEvidence =
    isHighImpact && level === "estimate" && !(entry?.evidenceNote || "").trim();

  return (
    <div className="rounded-xl border border-border/60 p-3 bg-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
            {meta.label}
            {isHighImpact && (
              <span className="text-[10px] uppercase tracking-wide font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                High impact
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{meta.description}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5" role="radiogroup" aria-label={`Confidence for ${meta.label}`}>
        {levels.map((lvl) => {
          const active = level === lvl;
          return (
            <button
              key={lvl}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSetLevel(lvl)}
              title={ASSUMPTION_CONFIDENCE_DESCRIPTIONS[lvl]}
              className={cn(
                "text-xs font-medium rounded-lg border px-2.5 py-1 transition-colors",
                active
                  ? COLOR_BY_LEVEL[lvl]
                  : "bg-white text-muted-foreground border-border hover:border-primary/40",
              )}
              data-testid={`confidence-option-${assumptionKey}-${lvl}`}
            >
              {ASSUMPTION_CONFIDENCE_LABELS[lvl]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {entry?.evidenceNote?.trim() ? "Edit evidence note" : "Add evidence note (optional)"}
      </button>

      {expanded && (
        <textarea
          value={entry?.evidenceNote || ""}
          onChange={(e) => onSetNote(e.target.value)}
          rows={2}
          placeholder={notePlaceholder}
          className="mt-2 w-full text-sm border-2 border-border rounded-xl px-3 py-2 bg-white outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          data-testid={`confidence-note-${assumptionKey}`}
        />
      )}

      {needsEvidence && (
        <p className="text-xs text-amber-700 mt-2">
          This is a swing-factor assumption — adding a one-line source here
          is the single fastest way to harden the model for a reviewer.
        </p>
      )}
    </div>
  );
}
