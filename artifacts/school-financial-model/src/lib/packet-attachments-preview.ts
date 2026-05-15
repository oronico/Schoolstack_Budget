import {
  ASSUMPTION_REGISTRY,
  classifyEvidenceFileEmbed,
  EVIDENCE_ATTACHMENT_MAX_BYTES,
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_INLINE_PREVIEW_MIMES,
  type AssumptionKey,
  type AssumptionConfidenceEntry,
  type AssumptionEvidenceFile,
} from "@workspace/finance";

// Task #822 — preflight preview of which evidence files will ship inside
// the lender / board packet. Task #841 — to keep the founder-facing
// preview and the server's manifest from drifting, the classifier here
// is a thin wrapper around the shared `classifyEvidenceFileEmbed`
// helper in `@workspace/finance`. The same helper drives
// `evidenceAttachmentDisposition` in
// `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`, so any
// change to mime support or size caps lands in both surfaces at once.
// A guard test (`tests/packet-attachments-preview-parity.ts` in
// api-server) feeds a shared fixture set through both helpers and
// fails if their dispositions or labels diverge.

/** Per-PDF / "other file" cap. PDFs and unsupported attachments
 *  exceeding this fall back to "Available on request — exceeds 10 MB".
 *  Re-exported from `@workspace/finance` so existing callers and tests
 *  keep their import path; the constant lives in the shared lib so the
 *  cap can never drift away from the server's renderer. */
export { EVIDENCE_ATTACHMENT_MAX_BYTES as PACKET_ATTACHMENT_MAX_BYTES };

export type PacketEvidenceDisposition =
  | "embedded-pdf"
  | "embedded-image"
  | "oversized"
  | "unsupported";

export interface PacketAttachmentPreviewItem {
  /** Stable id from the underlying evidence file, when present. */
  id: string;
  /** Founder-facing assumption label (e.g. "Year 1 facility cost"). */
  assumptionLabel: string;
  /** File name as uploaded. */
  name: string;
  /** Byte size as captured at upload (0 when unknown). */
  size: number;
  mimeType: string;
  disposition: PacketEvidenceDisposition;
  /** Short founder-facing badge label ("Embedded", "Available on
   *  request — exceeds 10 MB", etc.). */
  dispositionLabel: string;
}

export interface PacketAttachmentsPreview {
  items: PacketAttachmentPreviewItem[];
  /** Total bytes of items that will actually embed in the packet PDF. */
  totalEmbeddedBytes: number;
  embeddedCount: number;
  availableOnRequestCount: number;
}

function isInlineImageMime(mime: string | undefined): boolean {
  if (!mime) return false;
  return EVIDENCE_INLINE_PREVIEW_MIMES.includes(mime.toLowerCase());
}

const IMAGE_OVERSIZED_MB = Math.round(
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES / (1024 * 1024),
);
const ATTACHMENT_OVERSIZED_MB = Math.round(
  EVIDENCE_ATTACHMENT_MAX_BYTES / (1024 * 1024),
);

export function classifyPacketAttachment(
  file: AssumptionEvidenceFile,
): { disposition: PacketEvidenceDisposition; label: string } {
  // Task #841 — delegate to the shared classifier so the founder
  // preview can never disagree with the server's manifest about which
  // mime types embed or where the size caps fall.
  const klass = classifyEvidenceFileEmbed({
    mimeType: file.mimeType,
    name: file.name,
    size: file.size,
  });
  switch (klass.disposition) {
    case "embed_inline":
      return { disposition: "embedded-image", label: "Embedded" };
    case "append_link":
      return { disposition: "embedded-pdf", label: "Embedded" };
    case "too_large": {
      // Match the cap wording the server prints in the lender packet's
      // Evidence Files manifest so the founder reads the same number
      // here that the reviewer will see in the PDF.
      const cap = isInlineImageMime(file.mimeType)
        ? IMAGE_OVERSIZED_MB
        : ATTACHMENT_OVERSIZED_MB;
      return {
        disposition: "oversized",
        label: `Available on request — exceeds ${cap} MB`,
      };
    }
    case "unsupported":
      return {
        disposition: "unsupported",
        label: "Available on request — unsupported type",
      };
  }
}

export function buildPacketAttachmentsPreview(
  confidence:
    | Record<string, AssumptionConfidenceEntry | undefined>
    | undefined,
): PacketAttachmentsPreview {
  const items: PacketAttachmentPreviewItem[] = [];
  let totalEmbeddedBytes = 0;
  let embeddedCount = 0;
  let availableOnRequestCount = 0;

  for (const [k, entry] of Object.entries(confidence || {})) {
    if (!entry) continue;
    if (!Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k)) continue;
    const files = entry.evidenceFiles;
    if (!Array.isArray(files) || files.length === 0) continue;
    const label = ASSUMPTION_REGISTRY[k as AssumptionKey].label;
    for (const f of files) {
      if (!f) continue;
      const { disposition, label: dispositionLabel } =
        classifyPacketAttachment(f);
      const item: PacketAttachmentPreviewItem = {
        id: f.id || `${k}:${f.name || "file"}`,
        assumptionLabel: label,
        name: f.name || "attachment",
        size: typeof f.size === "number" ? f.size : 0,
        mimeType: f.mimeType || "",
        disposition,
        dispositionLabel,
      };
      items.push(item);
      if (disposition === "embedded-pdf" || disposition === "embedded-image") {
        embeddedCount += 1;
        totalEmbeddedBytes += item.size;
      } else {
        availableOnRequestCount += 1;
      }
    }
  }

  return {
    items,
    totalEmbeddedBytes,
    embeddedCount,
    availableOnRequestCount,
  };
}

export function formatPacketAttachmentSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
