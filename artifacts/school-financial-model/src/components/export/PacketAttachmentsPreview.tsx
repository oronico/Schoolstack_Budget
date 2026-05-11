import { useFormContext } from "react-hook-form";
import { useMemo } from "react";
import { Paperclip, FileText, Image as ImageIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AssumptionConfidenceEntry } from "@workspace/finance";
import {
  buildPacketAttachmentsPreview,
  formatPacketAttachmentSize,
  type PacketEvidenceDisposition,
} from "@/lib/packet-attachments-preview";

// Task #822 — preflight preview of which evidence files will ship inside
// the lender / board packet. Renders on the Export step so the founder
// can confirm the right lease / MOU / quote will land in the bundle
// before they hit Send. Reads `assumptionConfidence` straight from the
// form so it stays live as files are added, replaced, or deleted on the
// per-step Assumption Confidence cards.

const EMAIL_ATTACHMENT_SOFT_LIMIT_BYTES = 20 * 1024 * 1024;

function dispositionStyles(d: PacketEvidenceDisposition): string {
  if (d === "embedded-pdf" || d === "embedded-image") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function fileIcon(mime: string, name: string) {
  const m = mime.toLowerCase();
  const lower = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(lower)) {
    return <ImageIcon className="h-4 w-4 text-slate-500" />;
  }
  return <FileText className="h-4 w-4 text-slate-500" />;
}

export function PacketAttachmentsPreview() {
  const { watch } = useFormContext();
  const confidence = watch("assumptionConfidence") as
    | Record<string, AssumptionConfidenceEntry | undefined>
    | undefined;

  const preview = useMemo(
    () => buildPacketAttachmentsPreview(confidence),
    [confidence],
  );

  if (preview.items.length === 0) return null;

  const nearLimit =
    preview.totalEmbeddedBytes >= EMAIL_ATTACHMENT_SOFT_LIMIT_BYTES;

  return (
    <div
      className="max-w-4xl mx-auto mb-10 bg-white border border-border/60 rounded-2xl p-5 sm:p-6 text-left shadow-sm"
      data-testid="packet-attachments-preview"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2">
          <Paperclip className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">
              Packet attachments
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Preview the evidence files that will ship inside the
              Lender Conversation Snapshot and Board and Funder Summary
              PDFs. Replace or remove a file from the Assumption
              Confidence card to update this list.
            </p>
          </div>
        </div>
        <div
          className="text-xs font-semibold text-muted-foreground whitespace-nowrap text-right"
          data-testid="packet-attachments-summary"
        >
          <div>
            {preview.embeddedCount} embedded ·{" "}
            {preview.availableOnRequestCount} on request
          </div>
          <div
            className={
              nearLimit ? "text-amber-700" : "text-muted-foreground"
            }
            data-testid="packet-attachments-total-size"
          >
            {formatPacketAttachmentSize(preview.totalEmbeddedBytes)} embedded
          </div>
        </div>
      </div>

      {nearLimit && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Embedded payload is near the typical 20 MB email-attachment
            limit. Consider sharing the packet via the secure share link
            instead of email.
          </span>
        </div>
      )}

      <ul className="divide-y divide-border/60">
        {preview.items.map((item) => (
          <li
            key={`${item.assumptionLabel}:${item.id}`}
            className="py-2.5 flex items-center gap-3"
            data-testid="packet-attachment-row"
          >
            <span className="shrink-0">{fileIcon(item.mimeType, item.name)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {item.name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {item.assumptionLabel}
                {item.size > 0 ? ` · ${formatPacketAttachmentSize(item.size)}` : ""}
              </div>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-semibold ${dispositionStyles(item.disposition)}`}
              data-testid={`packet-attachment-disposition-${item.disposition}`}
            >
              {item.disposition === "embedded-pdf" ||
              item.disposition === "embedded-image" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {item.dispositionLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
