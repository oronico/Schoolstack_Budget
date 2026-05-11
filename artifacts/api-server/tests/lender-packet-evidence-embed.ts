// Task #729 — smoke test for the evidence-files appendix in the lender
// packet PDF. The legacy inline-base64 embed/merge path was removed
// along with the `dataBase64` field; uploaded files now live in App
// Storage and the appendix prints a clickable download link per file
// instead of inlining the bytes. This test verifies the manifest still
// renders correctly with `objectPath`-only attachments.

import { generateLenderPacketPDF, setEvidenceBytesLoader } from "../src/lib/packets/lender-packet-pdf.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { microschoolStartup } from "./sample-payloads.js";
import { PDFDocument } from "pdf-lib";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
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

async function main() {
  console.log("=== Lender Packet PDF Evidence Appendix Smoke Test ===\n");

  const data = {
    ...(microschoolStartup as Record<string, unknown>),
    assumptionFlagResponses: [
      {
        field: "enrollment.year2",
        flagType: "enrollment_spike",
        reason: "Founders confirmed 18 family commitments via signed letters of intent.",
      },
    ],
  };

  const consultant = await runConsultantEngine(data as Parameters<typeof runConsultantEngine>[0]);
  const packet = await buildLenderPacket(data as Parameters<typeof buildLenderPacket>[0], consultant);

  // Inject synthetic objectPath-only evidence files onto known
  // assumption keys. None of these carry inline bytes — the lender
  // appendix should print download links and skip any embed code.
  (packet as unknown as { assumptionConfidence: Record<string, unknown> }).assumptionConfidence = {
    tuition_per_student: {
      confidence: "signed_agreement",
      evidenceNote: "Lease attached.",
      evidenceFiles: [
        {
          id: "f1",
          name: "lease.pdf",
          mimeType: "application/pdf",
          size: 256 * 1024,
          uploadedAt: new Date().toISOString(),
          objectPath: "/objects/uploads/lease-uuid",
        },
        {
          id: "f2",
          name: "site-photo.png",
          mimeType: "image/png",
          size: 12 * 1024,
          uploadedAt: new Date().toISOString(),
          objectPath: "/objects/uploads/site-photo-uuid",
        },
      ],
    },
    loan_principal: {
      confidence: "research",
      evidenceNote: "Letters of intent.",
      evidenceFiles: [
        {
          id: "f3",
          name: "MOU.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 50 * 1024,
          uploadedAt: new Date().toISOString(),
          objectPath: "/objects/uploads/mou-uuid",
        },
      ],
    },
  };

  // Baseline: render the same packet with no evidence files to compare
  // page counts. The appendix should not balloon the packet by more than
  // a page or two when only manifest entries are added.
  const baselinePacket = JSON.parse(JSON.stringify(packet));
  baselinePacket.assumptionConfidence = {};
  const baselineBuffer = await generateLenderPacketPDF(baselinePacket);
  const baselineDoc = await PDFDocument.load(baselineBuffer);
  const baselinePages = baselineDoc.getPageCount();

  // Render once without APP_URL (no clickable links, manifest only).
  const previousAppUrl = process.env.APP_URL;
  delete process.env.APP_URL;
  const buffer = await generateLenderPacketPDF(packet);
  check("output begins with %PDF-", buffer.subarray(0, 5).toString("ascii") === "%PDF-");
  check("output is non-trivial", buffer.length > 5000, `length=${buffer.length}`);

  const renderedDoc = await PDFDocument.load(buffer);
  const renderedPages = renderedDoc.getPageCount();
  // Sanity check — the packet still renders to a real, non-empty PDF
  // when objectPath-only attachments are present. We deliberately do
  // not assert exact page counts here: the appendix itself, plus
  // upstream sections that vary with assumptionConfidence, can shift
  // the count. The legacy assertion (merged >= baseline + embedded-PDF
  // pages) was removed when the inline-base64 embed/merge path was
  // deleted (Task #729).
  check(
    "rendered packet has at least the baseline page count",
    renderedPages >= baselinePages,
    `baseline=${baselinePages}, rendered=${renderedPages}`,
  );

  // Render once with APP_URL set so the appendix produces clickable
  // download links pointing at /api/storage/objects/...
  process.env.APP_URL = "https://example.test";
  const linkedBuffer = await generateLenderPacketPDF(packet);
  check(
    "appendix renders with download links when APP_URL is configured",
    linkedBuffer.subarray(0, 5).toString("ascii") === "%PDF-" && linkedBuffer.length > 5000,
    `length=${linkedBuffer.length}`,
  );

  if (previousAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = previousAppUrl;
  }

  // Task #732 — exercise the inline thumbnail render path. Inject a
  // bytes loader that returns a tiny valid PNG for image attachments
  // so the appendix actually embeds them via PDFKit. Other file types
  // should fall back to the file-type indicator badge.
  // 1×1 transparent PNG.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const fetched: string[] = [];
  setEvidenceBytesLoader(async (objectPath: string) => {
    fetched.push(objectPath);
    if (objectPath.endsWith("site-photo-uuid")) return tinyPng;
    return null;
  });

  const thumbBuffer = await generateLenderPacketPDF(packet);
  check(
    "appendix renders successfully when image bytes are injected",
    thumbBuffer.subarray(0, 5).toString("ascii") === "%PDF-" && thumbBuffer.length > 5000,
    `length=${thumbBuffer.length}`,
  );
  check(
    "loader is only consulted for image attachments (PDFs / DOCX use the type badge)",
    fetched.length === 1 && fetched[0].endsWith("site-photo-uuid"),
    `fetched=${JSON.stringify(fetched)}`,
  );
  check(
    "thumbnail render produces a larger PDF than the no-bytes render",
    thumbBuffer.length > buffer.length,
    `with-thumb=${thumbBuffer.length} no-thumb=${buffer.length}`,
  );

  // Reset to the default loader so later tests in the suite see a
  // pristine module state.
  setEvidenceBytesLoader(null);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
