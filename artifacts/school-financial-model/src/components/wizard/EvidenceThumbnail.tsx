import { useEffect, useState } from "react";
import {
  classifyEvidenceFileEmbed,
  type AssumptionEvidenceFile,
} from "@workspace/finance";

// Task #839 — shared inline thumbnail for an evidence file. Mirrors
// the per-file preview the lender / board PDF appendix renders so the
// founder sees the same WYSIWYG image inside the wizard.
//
// Strategy: ask the API for a thumbnail PNG/JPEG. The server passes
// images through unchanged and rasterizes the first page of PDFs via
// mupdf-wasm so the browser doesn't have to ship the wasm module. Any
// other file type (or oversize file) falls back to a per-file-type
// indicator badge — same disposition rule the appendix uses.

const THUMBNAIL_ENDPOINT = "/api/storage/evidence-thumbnail";

function fileTypeBadgeLabel(file: AssumptionEvidenceFile): string {
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const mime = (file.mimeType || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "PDF";
  if (ext === "docx" || ext === "doc") return "DOC";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "XLS";
  if (ext === "pptx" || ext === "ppt") return "PPT";
  if (ext === "gif") return "GIF";
  if (ext === "webp") return "IMG";
  if (ext === "heic" || ext === "heif") return "IMG";
  if (ext === "txt") return "TXT";
  if (ext) return ext.slice(0, 4).toUpperCase();
  return "FILE";
}

function isThumbnailEligible(file: AssumptionEvidenceFile): boolean {
  const mime = (file.mimeType || "").toLowerCase();
  const isImage = mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg";
  const isPdf = mime === "application/pdf" || (file.name || "").toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) return false;
  // Same per-file size cap the lender appendix enforces — files that
  // would be demoted to "available on request" in the PDF should look
  // demoted in-app too, so the founder isn't surprised.
  const klass = classifyEvidenceFileEmbed(file);
  return klass.disposition !== "too_large";
}

export function EvidenceThumbnail({
  file,
  testIdPrefix,
  size = 56,
}: {
  file: AssumptionEvidenceFile;
  /** prefix for stable data-testid hooks (e.g. "review-rollup-thumb") */
  testIdPrefix: string;
  /** square render size in px (matches the 56pt PDF appendix box by default) */
  size?: number;
}) {
  const eligible = isThumbnailEligible(file);
  const objectPath = file.objectPath;
  const [state, setState] = useState<{
    href: string | null;
    error: boolean;
  }>({ href: null, error: false });

  useEffect(() => {
    if (!eligible || !objectPath || !objectPath.startsWith("/objects/")) {
      setState({ href: null, error: !eligible });
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    setState({ href: null, error: false });
    // Authenticated fetch — `setupFetchInterceptor` injects the
    // Bearer token, the server enforces the same ACL as the
    // download route, and 415 / 413 / 404 fall back to the badge.
    fetch(`${THUMBNAIL_ENDPOINT}${objectPath}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`thumbnail unavailable (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setState({ href: blobUrl, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ href: null, error: true });
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [eligible, objectPath]);

  const dimension = { width: size, height: size };
  const badgeLabel = fileTypeBadgeLabel(file);

  if (state.href) {
    return (
      <img
        src={state.href}
        alt=""
        loading="lazy"
        style={dimension}
        className="object-cover rounded border border-border bg-white shrink-0"
        data-testid={`${testIdPrefix}-image-${file.id}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={dimension}
      className="shrink-0 rounded border border-border bg-slate-100 text-[10px] font-bold tracking-wide text-primary flex items-center justify-center"
      data-testid={`${testIdPrefix}-badge-${file.id}`}
    >
      {badgeLabel}
    </span>
  );
}
