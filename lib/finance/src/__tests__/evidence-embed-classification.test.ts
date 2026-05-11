/**
 * Task #723 — pin the eligibility rules used by both the wizard's
 * pre-export attachments preview and the lender packet PDF's evidence
 * appendix renderer. If these classifications drift, the founder's
 * pre-download preview will silently disagree with what actually
 * embeds in the downloaded PDF.
 *
 * Mirrors `evidenceAttachmentDisposition` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`:
 *   - PDF ≤ 10 MB           → embedded-pdf  → "append_link"
 *   - PDF > 10 MB            → oversized     → "too_large"
 *   - PNG/JPEG ≤ 5 MB        → image         → "embed_inline"
 *   - PNG/JPEG > 5 MB        → image (no thumb) → "too_large"
 *   - Other ≤ 10 MB          → unsupported   → "unsupported"
 *   - Other > 10 MB          → oversized     → "too_large"
 */
import {
  classifyEvidenceFileEmbed,
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_ATTACHMENT_MAX_BYTES,
} from "../assumption-registry.js";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

const SMALL = 1024 * 100;
const HUGE_IMAGE = EVIDENCE_INLINE_PREVIEW_MAX_BYTES + 1;
const HUGE_PDF = EVIDENCE_ATTACHMENT_MAX_BYTES + 1;

function main() {
  // PNG / JPEG within 5 MB cap → embed inline
  for (const mime of ["image/png", "image/jpeg", "image/jpg"]) {
    const r = classifyEvidenceFileEmbed({ mimeType: mime, name: `x.${mime.split("/")[1]}`, size: SMALL });
    check(`${mime} small → embed_inline`, r.disposition === "embed_inline", `got ${r.disposition}`);
  }
  // Image MIME but oversized for thumbnail → too_large
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "image/png", name: "big.png", size: HUGE_IMAGE });
    check("oversize png → too_large", r.disposition === "too_large", `got ${r.disposition}`);
  }
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "image/jpeg", name: "big.jpg", size: HUGE_IMAGE });
    check("oversize jpeg → too_large", r.disposition === "too_large", `got ${r.disposition}`);
  }
  // PDF ≤ 10 MB → append_link (merged at end of packet)
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "application/pdf", name: "lease.pdf", size: SMALL });
    check("small pdf → append_link", r.disposition === "append_link", `got ${r.disposition}`);
  }
  // PDF > 10 MB → too_large
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "application/pdf", name: "huge.pdf", size: HUGE_PDF });
    check("huge pdf → too_large", r.disposition === "too_large", `got ${r.disposition}`);
  }
  // Boundary: PDF exactly at 10 MB cap is still append_link
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "application/pdf", name: "edge.pdf", size: EVIDENCE_ATTACHMENT_MAX_BYTES });
    check("pdf at cap → append_link", r.disposition === "append_link", `got ${r.disposition}`);
  }
  // DOCX / XLSX / CSV / TXT (small) → unsupported (renderer can't inline these)
  for (const [mime, name] of [
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "mou.docx"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "payroll.xlsx"],
    ["text/csv", "fees.csv"],
    ["text/plain", "notes.txt"],
  ] as const) {
    const r = classifyEvidenceFileEmbed({ mimeType: mime, name, size: SMALL });
    check(`${name} → unsupported`, r.disposition === "unsupported", `got ${r.disposition}`);
  }
  // DOCX / XLSX over the attachment cap → too_large takes precedence
  {
    const r = classifyEvidenceFileEmbed({
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "huge.xlsx",
      size: HUGE_PDF,
    });
    check("huge xlsx → too_large", r.disposition === "too_large", `got ${r.disposition}`);
  }
  // Non-previewable image formats (HEIC/WEBP/GIF) → unsupported
  for (const [mime, name] of [
    ["image/heic", "scan.heic"],
    ["image/webp", "logo.webp"],
    ["image/gif", "anim.gif"],
    ["", "scan.heic"],
    ["", "scan.webp"],
  ] as const) {
    const r = classifyEvidenceFileEmbed({ mimeType: mime, name, size: SMALL });
    check(`${name} (mime="${mime}") → unsupported`, r.disposition === "unsupported", `got ${r.disposition}`);
  }
  // Missing mime + .pdf extension → still detected as PDF → append_link
  {
    const r = classifyEvidenceFileEmbed({ name: "lease.pdf", size: SMALL });
    check("missing mime + .pdf → append_link", r.disposition === "append_link", `got ${r.disposition}`);
  }
  // Boundary: image exactly at cap is still embed_inline
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "image/png", name: "edge.png", size: EVIDENCE_INLINE_PREVIEW_MAX_BYTES });
    check("png at cap → embed_inline", r.disposition === "embed_inline", `got ${r.disposition}`);
  }
  // Founder-facing labels match the four task badges
  {
    const png = classifyEvidenceFileEmbed({ mimeType: "image/png", name: "x.png", size: SMALL });
    check("embed_inline label", png.label === "Will preview inline", `got "${png.label}"`);
    const pdf = classifyEvidenceFileEmbed({ mimeType: "application/pdf", name: "x.pdf", size: SMALL });
    check("append_link label", pdf.label === "Will append at end", `got "${pdf.label}"`);
    const big = classifyEvidenceFileEmbed({ mimeType: "application/pdf", name: "big.pdf", size: HUGE_PDF });
    check("too_large label", big.label === "Too large — listed only", `got "${big.label}"`);
    const docx = classifyEvidenceFileEmbed({
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "x.docx",
      size: SMALL,
    });
    check("unsupported label", docx.label === "Format not supported", `got "${docx.label}"`);
  }
  // All classifications carry a non-empty description.
  {
    const r = classifyEvidenceFileEmbed({ mimeType: "image/png", name: "x.png", size: SMALL });
    check("classification has description", r.description.length > 0);
  }

  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(`\nclassifyEvidenceFileEmbed: ${failures.length} of ${total} checks failed`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\nclassifyEvidenceFileEmbed: ${passed}/${total} checks passed`);
}

main();
