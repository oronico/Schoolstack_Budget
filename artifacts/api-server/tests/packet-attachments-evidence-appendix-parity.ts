// Task #878 — Guard test: the lender packet's Evidence Files appendix
// prints a one-line disposition note for every uploaded attachment
// ("Full PDF embedded at end of packet.", "Available on request —
// exceeds 5 MB embed cap.", etc.). Task #841 already pinned the
// disposition *enum* to the wizard preview's classifier, but the
// rendered manifest wording lived as inline string literals deep
// inside `renderAssumptionsEvidenceAppendix`. A drive-by tweak (e.g.
// "5 MB embed cap" → "5 MB cap") could silently desync the founder
// preview from the rendered PDF even though the dispositions still
// matched.
//
// The renderer was refactored to delegate the wording to the exported
// `evidenceAttachmentManifestNote` helper. This test:
//   1. Pins the rendered manifest text + tone for each disposition,
//      including the image-preview-failed branch.
//   2. Asserts the manifest wording stays consistent with the
//      founder-facing wizard preview's badge label
//      (`classifyPacketAttachment`) — they are different strings (the
//      preview is a short badge; the manifest is a full sentence) but
//      they must agree on the same cap number and on whether the file
//      embeds vs. is "available on request".

import {
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_ATTACHMENT_MAX_BYTES,
} from "@workspace/finance";
import {
  evidenceAttachmentDisposition,
  evidenceAttachmentManifestNote,
} from "../src/lib/packets/lender-packet-pdf.js";
import { classifyPacketAttachment } from "../../school-financial-model/src/lib/packet-attachments-preview.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

const SMALL = 1 * 1024 * 1024; // 1 MB
const HUGE_PDF = EVIDENCE_ATTACHMENT_MAX_BYTES + 1;
const HUGE_IMAGE = EVIDENCE_INLINE_PREVIEW_MAX_BYTES + 1;

interface Fixture {
  name: string;
  file: { name?: string; mimeType?: string; size?: number };
  imagePreviewLoaded?: boolean;
  expectedNote: string;
  expectedTone: "info" | "warn";
}

const fixtures: Fixture[] = [
  {
    name: "small PDF (embedded)",
    file: { name: "lease.pdf", mimeType: "application/pdf", size: SMALL },
    expectedNote: "Full PDF embedded at end of packet.",
    expectedTone: "info",
  },
  {
    name: "small PNG with preview loaded",
    file: { name: "site.png", mimeType: "image/png", size: SMALL },
    imagePreviewLoaded: true,
    expectedNote: "Preview embedded above.",
    expectedTone: "info",
  },
  {
    name: "small JPEG with preview loaded",
    file: { name: "photo.jpg", mimeType: "image/jpeg", size: SMALL },
    imagePreviewLoaded: true,
    expectedNote: "Preview embedded above.",
    expectedTone: "info",
  },
  {
    name: "small PNG but preview bytes failed to load",
    file: { name: "site.png", mimeType: "image/png", size: SMALL },
    imagePreviewLoaded: false,
    expectedNote: "Available on request — preview could not be loaded.",
    expectedTone: "warn",
  },
  {
    name: "oversized PDF (over 10 MB attachment cap)",
    file: { name: "huge.pdf", mimeType: "application/pdf", size: HUGE_PDF },
    expectedNote: "Available on request — exceeds 10 MB embed cap.",
    expectedTone: "warn",
  },
  {
    name: "oversized PNG (over 5 MB inline-preview cap)",
    file: { name: "huge.png", mimeType: "image/png", size: HUGE_IMAGE },
    expectedNote: "Available on request — exceeds 5 MB embed cap.",
    expectedTone: "warn",
  },
  {
    name: "oversized non-image, non-pdf attachment (uses 10 MB cap)",
    file: {
      name: "rates.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: HUGE_PDF,
    },
    expectedNote: "Available on request — exceeds 10 MB embed cap.",
    expectedTone: "warn",
  },
  {
    name: "WebP image (PDFKit cannot inline)",
    file: { name: "hero.webp", mimeType: "image/webp", size: SMALL },
    expectedNote: "Available on request — file type cannot be inlined.",
    expectedTone: "warn",
  },
  {
    name: "HEIC image (PDFKit cannot inline)",
    file: { name: "iphone.heic", mimeType: "image/heic", size: SMALL },
    expectedNote: "Available on request — file type cannot be inlined.",
    expectedTone: "warn",
  },
  {
    name: "PPTX deck (other office file type)",
    file: {
      name: "board-deck.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: SMALL,
    },
    expectedNote: "Available on request — file type cannot be inlined.",
    expectedTone: "warn",
  },
];

console.log("\n== Lender packet Evidence Files appendix manifest parity ==");

for (const fx of fixtures) {
  const note = evidenceAttachmentManifestNote(fx.file, {
    imagePreviewLoaded: fx.imagePreviewLoaded ?? true,
  });
  check(
    `${fx.name}: manifest note exists`,
    note !== null,
    `expected "${fx.expectedNote}", got null`,
  );
  if (!note) continue;
  check(
    `${fx.name}: manifest text`,
    note.text === fx.expectedNote,
    `expected "${fx.expectedNote}", got "${note.text}"`,
  );
  check(
    `${fx.name}: manifest tone`,
    note.tone === fx.expectedTone,
    `expected ${fx.expectedTone}, got ${note.tone}`,
  );

  // Cross-surface check: the wizard preview's short badge label must
  // agree with the manifest about the cap number / disposition. We
  // don't compare strings verbatim (preview is a badge, manifest is a
  // full sentence), but the preview label is built from the same
  // underlying classifier, and oversized rows must reference the same
  // cap MB number on both surfaces.
  const preview = classifyPacketAttachment(fx.file);
  const serverDisposition = evidenceAttachmentDisposition(fx.file);
  if (serverDisposition === "oversized") {
    const capMatch = fx.expectedNote.match(/exceeds (\d+) MB/);
    const expectedCap = capMatch ? capMatch[1] : "";
    check(
      `${fx.name}: wizard preview cap matches manifest cap (${expectedCap} MB)`,
      preview.label.includes(`exceeds ${expectedCap} MB`),
      `manifest says "exceeds ${expectedCap} MB", wizard preview says "${preview.label}"`,
    );
  }
  if (serverDisposition === "unsupported") {
    check(
      `${fx.name}: wizard preview agrees the file is unsupported`,
      preview.disposition === "unsupported" &&
        preview.label.startsWith("Available on request"),
      `wizard preview returned disposition=${preview.disposition} label="${preview.label}"`,
    );
  }
  if (
    serverDisposition === "embedded-pdf" ||
    (serverDisposition === "image" && fx.imagePreviewLoaded !== false)
  ) {
    check(
      `${fx.name}: wizard preview agrees the file embeds`,
      preview.disposition === "embedded-pdf" ||
        preview.disposition === "embedded-image",
      `wizard preview returned disposition=${preview.disposition}`,
    );
  }
}

// Bare null branch: the helper should return null only when nothing
// matches (defensive — every disposition currently produces a note).
// We exercise this by feeding a non-existent disposition path: there
// isn't one today, so we instead pin that an embedded image with a
// preview always returns a non-null note (already covered above) and
// that the helper handles the image+failed-preview branch via the
// `imagePreviewLoaded: false` option (also covered above).

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
process.exit(0);
