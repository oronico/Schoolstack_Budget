// Task #841 — Guard test: the founder-facing "Packet attachments"
// preview on the wizard's Export step must agree with the server's
// lender-packet renderer about which evidence files embed and which
// fall back to "available on request".
//
// The two helpers live in different artifacts:
//   - client: artifacts/school-financial-model/src/lib/packet-attachments-preview.ts
//             (`classifyPacketAttachment`)
//   - server: artifacts/api-server/src/lib/packets/lender-packet-pdf.ts
//             (`evidenceAttachmentDisposition`)
//
// Both delegate to `classifyEvidenceFileEmbed` in `@workspace/finance`,
// so structural drift is impossible — but a refactor could swap one
// side off the shared helper, raise the 10 MB cap on one side, or
// quietly add a new mime type. This test feeds a shared fixture set
// (small/large PDFs, PNG, JPEG, WebP, HEIC, PPTX, oversized image)
// through both helpers and asserts the dispositions and labels match
// a pinned mapping. If either side drifts in mime support, size cap,
// or disposition label, this test fails immediately.

import {
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_ATTACHMENT_MAX_BYTES,
} from "@workspace/finance";
import { evidenceAttachmentDisposition } from "../src/lib/packets/lender-packet-pdf.js";
import {
  classifyPacketAttachment,
  type PacketEvidenceDisposition,
} from "../../school-financial-model/src/lib/packet-attachments-preview.js";

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

type ServerDisposition = ReturnType<typeof evidenceAttachmentDisposition>;

// Pinned mapping between the server enum and the client enum. Every
// server disposition must map to exactly one client disposition; if a
// new value lands on either side, the test fails because the lookup
// returns undefined.
const SERVER_TO_CLIENT: Record<ServerDisposition, PacketEvidenceDisposition> = {
  image: "embedded-image",
  "embedded-pdf": "embedded-pdf",
  oversized: "oversized",
  unsupported: "unsupported",
};

interface Fixture {
  name: string;
  file: { name?: string; mimeType?: string; size?: number };
  expectedServer: ServerDisposition;
  expectedClient: PacketEvidenceDisposition;
  expectedLabel: string;
}

const SMALL = 1 * 1024 * 1024; // 1 MB
const HUGE_PDF = EVIDENCE_ATTACHMENT_MAX_BYTES + 1;
const HUGE_IMAGE = EVIDENCE_INLINE_PREVIEW_MAX_BYTES + 1;

const fixtures: Fixture[] = [
  {
    name: "small PDF",
    file: { name: "lease.pdf", mimeType: "application/pdf", size: SMALL },
    expectedServer: "embedded-pdf",
    expectedClient: "embedded-pdf",
    expectedLabel: "Embedded",
  },
  {
    name: "large PDF (over 10 MB cap)",
    file: { name: "huge.pdf", mimeType: "application/pdf", size: HUGE_PDF },
    expectedServer: "oversized",
    expectedClient: "oversized",
    expectedLabel: "Available on request — exceeds 10 MB",
  },
  {
    name: "PDF detected by extension when mime is missing",
    file: { name: "MOU.PDF", mimeType: "", size: SMALL },
    expectedServer: "embedded-pdf",
    expectedClient: "embedded-pdf",
    expectedLabel: "Embedded",
  },
  {
    name: "small PNG",
    file: { name: "site.png", mimeType: "image/png", size: SMALL },
    expectedServer: "image",
    expectedClient: "embedded-image",
    expectedLabel: "Embedded",
  },
  {
    name: "small JPEG",
    file: { name: "photo.jpg", mimeType: "image/jpeg", size: SMALL },
    expectedServer: "image",
    expectedClient: "embedded-image",
    expectedLabel: "Embedded",
  },
  {
    name: "oversized PNG (over 5 MB inline-preview cap)",
    file: { name: "huge.png", mimeType: "image/png", size: HUGE_IMAGE },
    expectedServer: "oversized",
    expectedClient: "oversized",
    expectedLabel: "Available on request — exceeds 5 MB",
  },
  {
    name: "WebP image (PDFKit cannot inline)",
    file: { name: "hero.webp", mimeType: "image/webp", size: SMALL },
    expectedServer: "unsupported",
    expectedClient: "unsupported",
    expectedLabel: "Available on request — unsupported type",
  },
  {
    name: "HEIC image (PDFKit cannot inline)",
    file: { name: "iphone.heic", mimeType: "image/heic", size: SMALL },
    expectedServer: "unsupported",
    expectedClient: "unsupported",
    expectedLabel: "Available on request — unsupported type",
  },
  {
    name: "PPTX deck (other office file type)",
    file: {
      name: "board-deck.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: SMALL,
    },
    expectedServer: "unsupported",
    expectedClient: "unsupported",
    expectedLabel: "Available on request — unsupported type",
  },
  {
    name: "oversized non-image, non-pdf attachment",
    file: {
      name: "rates.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: HUGE_PDF,
    },
    expectedServer: "oversized",
    expectedClient: "oversized",
    expectedLabel: "Available on request — exceeds 10 MB",
  },
];

console.log("\n== Packet attachments preview parity vs server renderer ==");

for (const fx of fixtures) {
  const server = evidenceAttachmentDisposition(fx.file);
  const client = classifyPacketAttachment(fx.file);

  check(
    `${fx.name}: server disposition`,
    server === fx.expectedServer,
    `expected ${fx.expectedServer}, got ${server}`,
  );
  check(
    `${fx.name}: client disposition`,
    client.disposition === fx.expectedClient,
    `expected ${fx.expectedClient}, got ${client.disposition}`,
  );
  check(
    `${fx.name}: client label`,
    client.label === fx.expectedLabel,
    `expected "${fx.expectedLabel}", got "${client.label}"`,
  );
  check(
    `${fx.name}: server→client mapping holds`,
    SERVER_TO_CLIENT[server] === client.disposition,
    `server "${server}" maps to "${SERVER_TO_CLIENT[server]}" but client returned "${client.disposition}"`,
  );
}

// Cap parity: the constants the two helpers reason about must come
// from the same source. If the server renderer ever shadowed the
// shared constant with a local value, this catches it.
check(
  "image inline-preview cap is 5 MB",
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES === 5 * 1024 * 1024,
  `got ${EVIDENCE_INLINE_PREVIEW_MAX_BYTES}`,
);
check(
  "attachment embed cap is 10 MB",
  EVIDENCE_ATTACHMENT_MAX_BYTES === 10 * 1024 * 1024,
  `got ${EVIDENCE_ATTACHMENT_MAX_BYTES}`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
process.exit(0);
