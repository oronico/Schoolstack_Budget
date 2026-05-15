import { ShieldCheck, ShieldAlert, Shield, Paperclip } from "lucide-react";
import {
  ASSUMPTION_REGISTRY,
  computeAssumptionConfidenceRollup,
  type AssumptionConfidenceStatus,
  type AssumptionConfidenceEntry,
  type AssumptionEvidenceFile,
  type AssumptionKey,
} from "@workspace/finance";
import { ActualVsProjectedBadge } from "./ActualVsProjectedBadge";
import { EvidenceThumbnail } from "./EvidenceThumbnail";

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
  provenance,
}: {
  data: { assumptionConfidence?: Record<string, AssumptionConfidenceEntry | { confidence: string; evidenceNote?: string }> | undefined };
  /**
   * Task #720 — when supplied, render the same Actual / Projected pill
   * the wizard Review screen and board PDF show next to the rollup
   * status, so the in-app preview stays visually consistent with the
   * downloaded packet. Optional so the existing Review-step caller keeps
   * its current chrome unchanged.
   */
  provenance?: "actuals" | "assumptions";
}) {
  const rollup = computeAssumptionConfidenceRollup(data);
  const theme = STATUS_THEME[rollup.status];
  const { Icon } = theme;
  const pct = Math.round(rollup.evidenceRatio * 100);

  // Task #839 — flatten the assumption-confidence map into a list of
  // attached evidence files grouped by assumption so the founder can
  // sanity-check the same image / PDF first-page previews a reviewer
  // will see in the lender or board packet PDF appendix. Pure read —
  // the rollup card is a summary surface, no edit affordances here.
  const evidenceGroups: Array<{
    assumptionKey: AssumptionKey;
    label: string;
    files: AssumptionEvidenceFile[];
  }> = [];
  for (const [k, entry] of Object.entries(data.assumptionConfidence || {})) {
    if (!Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k)) continue;
    const files = (entry as { evidenceFiles?: AssumptionEvidenceFile[] } | undefined)?.evidenceFiles;
    if (!Array.isArray(files) || files.length === 0) continue;
    const valid = files.filter((f) => f && typeof f.id === "string" && typeof f.name === "string");
    if (valid.length === 0) continue;
    evidenceGroups.push({
      assumptionKey: k as AssumptionKey,
      label: ASSUMPTION_REGISTRY[k as AssumptionKey].label,
      files: valid,
    });
  }
  const totalFiles = evidenceGroups.reduce((n, g) => n + g.files.length, 0);

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
              {provenance && (
                <ActualVsProjectedBadge
                  className="ml-2 align-middle"
                  kind={provenance === "actuals" ? "actual" : "projected"}
                />
              )}
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

      {/* Task #839 — inline previews of every uploaded evidence file
          (image or first-page-of-PDF) grouped by assumption. Mirrors
          what a reviewer will see in the lender / board packet PDF
          appendix so the founder can sanity-check before exporting.
          Files past the per-file size cap, or in formats the appendix
          can't inline, degrade to the same file-type indicator badge
          the appendix renders. */}
      {totalFiles > 0 && (
        <div
          className="mt-4 rounded-xl bg-white/70 border border-border/60 p-3"
          data-testid="assumption-confidence-rollup-evidence-files"
        >
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Paperclip className="h-3 w-3" />
            Evidence file previews
            <span className="font-normal text-muted-foreground">
              · {totalFiles} file{totalFiles === 1 ? "" : "s"} attached
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            This is what a reviewer will see in the packet appendix — image
            attachments and first-page PDF previews render inline; other
            file types show a type badge.
          </p>
          <ul className="mt-3 space-y-3">
            {evidenceGroups.map((group) => (
              <li
                key={group.assumptionKey}
                data-testid={`assumption-confidence-rollup-evidence-group-${group.assumptionKey}`}
              >
                <p className="text-[11px] font-semibold text-foreground">{group.label}</p>
                <ul className="mt-1.5 flex flex-wrap gap-3">
                  {group.files.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-col items-start gap-1 max-w-[140px]"
                      data-testid={`assumption-confidence-rollup-evidence-file-${group.assumptionKey}-${f.id}`}
                    >
                      <EvidenceThumbnail
                        file={f}
                        testIdPrefix={`assumption-confidence-rollup-evidence-thumb-${group.assumptionKey}`}
                      />
                      <span
                        className="text-[10px] text-foreground leading-tight w-[64px] truncate"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
