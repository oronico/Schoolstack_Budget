import {
  ASSUMPTION_REGISTRY,
  type AssumptionKey,
  type AssumptionConfidenceEntry,
  type AssumptionEvidenceFile,
} from "@workspace/finance";

// Task #822 — preflight preview of which evidence files will ship inside
// the lender / board packet. Mirrors the dispositions computed
// server-side in `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`
// (`evidenceAttachmentDisposition`) so the founder sees the same
// outcome the reviewer will see, without a server round-trip. Caps are
// duplicated here as constants and must stay in sync with the server.

/** Per-PDF / oversized cap. PDFs and "other" files exceeding this fall
 *  back to "Available on request — exceeds 10 MB". Mirrors
 *  `EVIDENCE_ATTACHMENT_MAX_BYTES` in lender-packet-pdf.ts. */
export const PACKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

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

function isPdf(file: { mimeType?: string; name?: string }): boolean {
  if ((file.mimeType || "").toLowerCase() === "application/pdf") return true;
  return (file.name || "").toLowerCase().endsWith(".pdf");
}

function isInlineableImage(mime: string | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  // Mirrors api-server isImageMime — PDFKit's image() accepts JPEG/PNG only.
  return m === "image/png" || m === "image/jpeg" || m === "image/jpg";
}

export function classifyPacketAttachment(
  file: AssumptionEvidenceFile,
): { disposition: PacketEvidenceDisposition; label: string } {
  const oversized =
    typeof file.size === "number" && file.size > PACKET_ATTACHMENT_MAX_BYTES;
  if (isPdf(file)) {
    if (oversized) {
      return {
        disposition: "oversized",
        label: "Available on request — exceeds 10 MB",
      };
    }
    return { disposition: "embedded-pdf", label: "Embedded" };
  }
  if (isInlineableImage(file.mimeType)) {
    // Server's `evidenceAttachmentDisposition` returns "image" for any
    // PNG/JPEG regardless of declared size — the 5 MB thumbnail cap is
    // a render-time fallback, not a metadata-predictable disposition.
    return { disposition: "embedded-image", label: "Embedded" };
  }
  if (oversized) {
    return {
      disposition: "oversized",
      label: "Available on request — exceeds 10 MB",
    };
  }
  return {
    disposition: "unsupported",
    label: "Available on request — unsupported type",
  };
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
