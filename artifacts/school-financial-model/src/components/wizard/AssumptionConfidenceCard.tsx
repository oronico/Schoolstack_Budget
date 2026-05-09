import { useFormContext } from "react-hook-form";
import { useRef, useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp, Paperclip, X, FileText, FileSpreadsheet, FileImage } from "lucide-react";
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
  type AssumptionEvidenceFile,
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
    setEntry(key, {
      confidence: level,
      evidenceNote: cur?.evidenceNote,
      // Preserve any uploaded evidence files when toggling the
      // confidence chip — switching from "estimate" to "signed_agreement"
      // shouldn't drop the lease the founder already attached.
      evidenceFiles: cur?.evidenceFiles,
    });
  };

  const setNote = (key: AssumptionKey, note: string) => {
    const cur = map[key];
    if (!cur) {
      setEntry(key, { confidence: "estimate", evidenceNote: note });
      return;
    }
    setEntry(key, { ...cur, confidence: cur.confidence, evidenceNote: note });
  };

  const setFiles = (key: AssumptionKey, files: AssumptionEvidenceFile[]) => {
    const cur = map[key];
    const base: AssumptionConfidenceEntry = cur
      ? { ...cur }
      : { confidence: "estimate" };
    const next: AssumptionConfidenceEntry = {
      ...base,
      evidenceFiles: files.length > 0 ? files : undefined,
    };
    setEntry(key, next);
  };

  // Task #659 / #707 — "with evidence" = a non-estimate confidence level
  // (actuals / signed agreement / quote / research), OR an "estimate"
  // backed by either a one-line note OR at least one uploaded evidence
  // file. Bare "estimate" with no note and no attachments doesn't count.
  const withEvidence = keys.filter((k) => {
    const e = map[k];
    if (!e) return false;
    if (e.confidence !== "estimate") return true;
    const hasNote = !!(e.evidenceNote && e.evidenceNote.trim().length > 0);
    const hasFiles = !!(e.evidenceFiles && e.evidenceFiles.length > 0);
    return hasNote || hasFiles;
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
            onSetFiles={(files) => setFiles(key, files)}
          />
        ))}
      </div>
    </div>
  );
}

// Task #714 — uploads now stream directly to App Storage via a
// presigned URL, so the model JSON only carries an objectPath
// reference (not the bytes). That lets us raise the per-file cap from
// 4 MB to 25 MB and the per-row cap from 5 to 25 without bloating
// share links / model documents.
const MAX_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EVIDENCE_FILES_PER_ROW = 25;
const ACCEPTED_EVIDENCE_MIME =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.heic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Task #730 — turn an evidence file into a URL the browser can hit.
// New uploads (Task #714+) live in App Storage as `objectPath` like
// `/objects/<id>`, served via `/api/storage/objects/<id>`. Legacy
// uploads (Task #707) carry inline `dataBase64` instead — we render
// those as `data:` URLs so the founder can still preview/download
// them. Returns null when neither field is present.
function evidenceFileUrl(file: AssumptionEvidenceFile): string | null {
  if (file.objectPath) {
    if (file.objectPath.startsWith("/objects/")) {
      return `/api/storage${file.objectPath}`;
    }
    return file.objectPath;
  }
  if (file.dataBase64) {
    const mime = file.mimeType || "application/octet-stream";
    return `data:${mime};base64,${file.dataBase64}`;
  }
  return null;
}

function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

function isSpreadsheetMime(mime: string, name: string): boolean {
  const m = mime.toLowerCase();
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv"
  ) {
    return true;
  }
  const lower = name.toLowerCase();
  return lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");
}

// Task #714 — two-step presigned-URL upload:
//   1. POST /api/storage/uploads/request-url  → { uploadURL, objectPath }
//   2. PUT  uploadURL (file bytes)            → file lives in App Storage
// Returns the objectPath the model should reference.
async function uploadEvidenceToStorage(file: File): Promise<string> {
  const reqRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!reqRes.ok) {
    throw new Error(`Couldn't get upload URL (${reqRes.status})`);
  }
  const { uploadURL, objectPath } = (await reqRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload did not complete (${putRes.status})`);
  }
  return objectPath;
}

function ConfidenceRow({
  assumptionKey,
  entry,
  levels,
  notePlaceholder,
  onSetLevel,
  onSetNote,
  onSetFiles,
}: {
  assumptionKey: AssumptionKey;
  entry: AssumptionConfidenceEntry | undefined;
  levels: readonly AssumptionConfidenceLevel[];
  notePlaceholder: string;
  onSetLevel: (level: AssumptionConfidenceLevel) => void;
  onSetNote: (note: string) => void;
  onSetFiles: (files: AssumptionEvidenceFile[]) => void;
}) {
  const meta = ASSUMPTION_REGISTRY[assumptionKey];
  const [expanded, setExpanded] = useState(!!entry?.evidenceNote);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const level = entry?.confidence;
  const files = entry?.evidenceFiles ?? [];
  const isHighImpact = HIGH_IMPACT_CONFIDENCE_KEYS.includes(assumptionKey);
  const hasFiles = files.length > 0;
  const needsEvidence =
    isHighImpact &&
    level === "estimate" &&
    !(entry?.evidenceNote || "").trim() &&
    !hasFiles;

  const handleFilesPicked = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setUploadError(null);
    const next: AssumptionEvidenceFile[] = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_EVIDENCE_FILES_PER_ROW) {
        setUploadError(
          `You can attach up to ${MAX_EVIDENCE_FILES_PER_ROW} files per assumption — remove one to add another.`,
        );
        break;
      }
      if (f.size > MAX_EVIDENCE_FILE_BYTES) {
        setUploadError(
          `"${f.name}" is ${formatBytes(f.size)}. Each file must be ${formatBytes(MAX_EVIDENCE_FILE_BYTES)} or smaller.`,
        );
        continue;
      }
      try {
        // Task #714 — upload directly to App Storage and store only
        // the returned objectPath on the model. The bytes never enter
        // the model JSON, so share links / saved scenarios stay small.
        const objectPath = await uploadEvidenceToStorage(f);
        next.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          size: f.size,
          uploadedAt: new Date().toISOString(),
          objectPath,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "upload did not complete";
        setUploadError(`Couldn't upload "${f.name}" — ${reason}.`);
      }
    }
    onSetFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    onSetFiles(files.filter((f) => f.id !== id));
  };

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

      {/* Task #707 — evidence file uploads. Each row gets its own
          attach-file control + filename list so a founder can drop the
          actual lease / MOU / quote behind the assumption. Uploaded
          files surface in the lender PDF appendix and Excel notes. */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EVIDENCE_MIME}
          className="hidden"
          onChange={(e) => {
            void handleFilesPicked(e.target.files);
          }}
          data-testid={`evidence-file-input-${assumptionKey}`}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-white hover:border-primary/40"
          data-testid={`evidence-attach-${assumptionKey}`}
          disabled={files.length >= MAX_EVIDENCE_FILES_PER_ROW}
          title={
            files.length >= MAX_EVIDENCE_FILES_PER_ROW
              ? `Maximum of ${MAX_EVIDENCE_FILES_PER_ROW} files per assumption`
              : "Attach a lease, MOU, quote, or other supporting document"
          }
        >
          <Paperclip className="h-3 w-3" />
          {hasFiles ? "Attach another file" : "Attach evidence file"}
        </button>
        {hasFiles && (
          <span className="text-[11px] text-muted-foreground">
            {files.length} of {MAX_EVIDENCE_FILES_PER_ROW} attached
          </span>
        )}
      </div>

      {hasFiles && (
        <ul
          className="mt-2 space-y-1"
          data-testid={`evidence-file-list-${assumptionKey}`}
        >
          {files.map((f) => {
            const url = evidenceFileUrl(f);
            const isImage = isImageMime(f.mimeType);
            const isSheet = isSpreadsheetMime(f.mimeType, f.name);
            const Icon = isImage ? FileImage : isSheet ? FileSpreadsheet : FileText;
            const meta = (
              <>
                {isImage && url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-6 w-6 object-cover rounded border border-border shrink-0 bg-white"
                    loading="lazy"
                  />
                ) : (
                  <Icon className="h-3 w-3 text-slate-500 shrink-0" />
                )}
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground shrink-0">
                  · {formatBytes(f.size)}
                </span>
              </>
            );
            return (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 text-xs bg-slate-50 border border-border rounded-lg px-2 py-1"
              >
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={f.name}
                    className="inline-flex items-center gap-1.5 min-w-0 text-foreground hover:text-primary hover:underline"
                    title={`Open or download ${f.name}`}
                    data-testid={`evidence-file-link-${assumptionKey}-${f.id}`}
                  >
                    {meta}
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground"
                    title="This file is no longer available for download"
                    data-testid={`evidence-file-unavailable-${assumptionKey}-${f.id}`}
                  >
                    {meta}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                  aria-label={`Remove ${f.name}`}
                  data-testid={`evidence-file-remove-${assumptionKey}-${f.id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {uploadError && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {uploadError}
        </p>
      )}

      {needsEvidence && (
        <p className="text-xs text-amber-700 mt-2">
          This is a swing-factor assumption — adding a one-line source or
          attaching the supporting document here is the single fastest way
          to harden the model for a reviewer.
        </p>
      )}
    </div>
  );
}
