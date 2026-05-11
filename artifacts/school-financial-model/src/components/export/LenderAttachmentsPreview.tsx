import { useFormContext } from "react-hook-form";
import { Paperclip, X, FileImage, FileText, FileSpreadsheet, AlertTriangle, CheckCircle2, Link2, FileWarning } from "lucide-react";
import {
  ASSUMPTION_REGISTRY,
  classifyEvidenceFileEmbed,
  type AssumptionConfidenceEntry,
  type AssumptionEvidenceFile,
  type AssumptionKey,
  type EvidenceFileEmbedDisposition,
} from "@workspace/finance";

// Task #723 — pre-export preview of every evidence file the founder
// has uploaded across the wizard, classified the same way the lender
// packet's PDF appendix renderer will treat it. Lets the founder see
// which scans will preview inline vs. which got demoted to a download
// link (over the per-file size cap, or an unsupported image format)
// before they hit Download.

type ConfidenceMap = Record<string, AssumptionConfidenceEntry | undefined>;

interface FileRow {
  assumptionKey: AssumptionKey;
  assumptionLabel: string;
  file: AssumptionEvidenceFile;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const BADGE_STYLES: Record<EvidenceFileEmbedDisposition, string> = {
  embed_inline: "bg-emerald-50 text-emerald-800 border-emerald-200",
  append_link: "bg-sky-50 text-sky-800 border-sky-200",
  too_large: "bg-amber-50 text-amber-800 border-amber-200",
  unsupported: "bg-slate-100 text-slate-700 border-slate-300",
};

const BADGE_ICONS: Record<EvidenceFileEmbedDisposition, typeof CheckCircle2> = {
  embed_inline: CheckCircle2,
  append_link: Link2,
  too_large: AlertTriangle,
  unsupported: FileWarning,
};

function fileIcon(mime: string, name: string): typeof FileText {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return FileImage;
  const n = name.toLowerCase();
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" ||
      n.endsWith(".xls") || n.endsWith(".xlsx") || n.endsWith(".csv")) {
    return FileSpreadsheet;
  }
  return FileText;
}

export function LenderAttachmentsPreview() {
  const { watch, setValue } = useFormContext();
  const map = (watch("assumptionConfidence") as ConfidenceMap | undefined) || {};

  const rows: FileRow[] = [];
  for (const [key, entry] of Object.entries(map)) {
    if (!entry) continue;
    if (!Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, key)) continue;
    const files = entry.evidenceFiles;
    if (!Array.isArray(files) || files.length === 0) continue;
    const meta = ASSUMPTION_REGISTRY[key as AssumptionKey];
    for (const f of files) {
      if (!f?.id || !f?.name) continue;
      rows.push({ assumptionKey: key as AssumptionKey, assumptionLabel: meta.label, file: f });
    }
  }

  if (rows.length === 0) return null;

  const removeFile = (assumptionKey: AssumptionKey, fileId: string) => {
    const cur = (watch("assumptionConfidence") as ConfidenceMap | undefined) || {};
    const entry = cur[assumptionKey];
    if (!entry) return;
    const remaining = (entry.evidenceFiles ?? []).filter((f) => f.id !== fileId);
    const nextEntry: AssumptionConfidenceEntry = {
      ...entry,
      evidenceFiles: remaining.length > 0 ? remaining : undefined,
    };
    setValue(
      "assumptionConfidence",
      { ...cur, [assumptionKey]: nextEntry },
      { shouldDirty: true },
    );
  };

  const counts: Record<EvidenceFileEmbedDisposition, number> = {
    embed_inline: 0,
    append_link: 0,
    too_large: 0,
    unsupported: 0,
  };
  for (const r of rows) {
    counts[classifyEvidenceFileEmbed(r.file).disposition]++;
  }

  // Group by assumption so the founder sees what's attached to each row.
  const byAssumption = new Map<AssumptionKey, FileRow[]>();
  for (const r of rows) {
    if (!byAssumption.has(r.assumptionKey)) byAssumption.set(r.assumptionKey, []);
    byAssumption.get(r.assumptionKey)!.push(r);
  }

  return (
    <div
      className="max-w-4xl mx-auto mb-8 bg-white border border-border/60 rounded-2xl p-5 sm:p-6 shadow-sm text-left"
      data-testid="lender-attachments-preview"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Paperclip className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-base text-foreground">
            Attachments in your Lender Conversation Snapshot
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rows.length} file{rows.length === 1 ? "" : "s"} will ship with your Lender Conversation Snapshot. Swap any oversized or unsupported file before you download.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-semibold">
        {(["embed_inline", "append_link", "too_large", "unsupported"] as const).map((d) => {
          if (counts[d] === 0) return null;
          const Icon = BADGE_ICONS[d];
          const labels: Record<EvidenceFileEmbedDisposition, string> = {
            embed_inline: `${counts[d]} preview inline`,
            append_link: `${counts[d]} append at end`,
            too_large: `${counts[d]} too large`,
            unsupported: `${counts[d]} format not supported`,
          };
          return (
            <span
              key={d}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${BADGE_STYLES[d]}`}
              data-testid={`attachments-rollup-${d}`}
            >
              <Icon className="h-3 w-3" />
              {labels[d]}
            </span>
          );
        })}
      </div>

      <ul className="space-y-3">
        {[...byAssumption.entries()].map(([assumptionKey, files]) => (
          <li key={assumptionKey} className="border border-border/60 rounded-xl p-3 bg-muted/20">
            <div className="text-xs font-semibold text-foreground mb-2">
              {files[0].assumptionLabel}
            </div>
            <ul className="space-y-2">
              {files.map(({ file }) => {
                const klass = classifyEvidenceFileEmbed(file);
                const BadgeIcon = BADGE_ICONS[klass.disposition];
                const FileTypeIcon = fileIcon(file.mimeType, file.name);
                return (
                  <li
                    key={file.id}
                    className="flex items-start gap-3 bg-white border border-border/60 rounded-lg px-3 py-2"
                    data-testid={`attachment-row-${file.id}`}
                  >
                    <FileTypeIcon className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          · {formatBytes(file.size)}
                        </span>
                      </div>
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${BADGE_STYLES[klass.disposition]}`}
                        title={klass.description}
                        data-testid={`attachment-badge-${file.id}`}
                      >
                        <BadgeIcon className="h-3 w-3" />
                        {klass.label}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        {klass.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(assumptionKey, file.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-600 transition-colors p-1 rounded-md hover:bg-red-50"
                      title={`Remove ${file.name}`}
                      aria-label={`Remove ${file.name}`}
                      data-testid={`attachment-remove-${file.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        To swap a file, remove it here and re-upload a slimmer version on the assumption's row in the wizard's confidence card.
      </p>
    </div>
  );
}
