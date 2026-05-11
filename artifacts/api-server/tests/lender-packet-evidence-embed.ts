// Task #729 — smoke test for the evidence-files appendix in the lender
// packet PDF. The legacy inline-base64 embed/merge path was removed
// along with the `dataBase64` field; uploaded files now live in App
// Storage and the appendix prints a clickable download link per file
// instead of inlining the bytes. This test verifies the manifest still
// renders correctly with `objectPath`-only attachments.
//
// Task #722 — PDF attachments (lease, MOU, signed quotes) are now
// merged onto the end of the packet via pdf-lib so the export ships
// as a single self-contained underwriting bundle. The manifest still
// lists every uploaded file with a disposition note ("Full PDF
// embedded at end of packet" / "Available on request"). The same
// merge step is wired into the board packet generator so trustees see
// identical behavior — exercised in tests/board-packet-evidence-embed.ts.

import { generateLenderPacketPDF, setEvidenceBytesLoader } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
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
  // deleted (Task #729). We previously also asserted
  // `renderedPages >= baselinePages` as a sanity floor, but that held
  // only by coincidence — the empty-state Assumption Confidence section
  // (rendered when no keys are tagged) leaves more whitespace per page
  // than the populated appendix, so adding upstream content (Task #665
  // per-year founder-comp benchmark table) can flip the comparison
  // even though both packets render the same upstream sections. The
  // fixed-floor assertion below covers the original intent: the
  // rendered packet is a non-trivial multi-page document.
  check(
    "rendered packet is a non-trivial multi-page PDF",
    renderedPages >= 10,
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
  // Task #722 — the loader is now also consulted for PDF attachments
  // (lease, MOU, signed quotes) so the bytes can be merged onto the
  // end of the packet via pdf-lib. The DOCX manifest entry stays a
  // type-badge-only row because DOCX cannot be embedded.
  // 1×1 transparent PNG.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  // Build a tiny valid 2-page PDF via pdf-lib so the merge step can
  // append real pages onto the packet and we can assert the page
  // count grew by exactly the embedded PDF's page count.
  const tinyPdfDoc = await PDFDocument.create();
  tinyPdfDoc.addPage([300, 400]);
  tinyPdfDoc.addPage([300, 400]);
  const tinyPdfBytes = Buffer.from(await tinyPdfDoc.save());

  const fetched: string[] = [];
  setEvidenceBytesLoader(async (objectPath: string) => {
    fetched.push(objectPath);
    if (objectPath.endsWith("site-photo-uuid")) return tinyPng;
    if (objectPath.endsWith("lease-uuid")) return tinyPdfBytes;
    return null;
  });

  const thumbBuffer = await generateLenderPacketPDF(packet);
  check(
    "appendix renders successfully when image bytes are injected",
    thumbBuffer.subarray(0, 5).toString("ascii") === "%PDF-" && thumbBuffer.length > 5000,
    `length=${thumbBuffer.length}`,
  );
  // The loader is now consulted for both image attachments (thumbnail
  // render) and PDF attachments (merge at end of packet). DOCX is not
  // a recognized embed type so the loader is never asked for it.
  const fetchedSet = new Set(fetched);
  check(
    "loader is consulted for image and PDF attachments (DOCX still uses the type badge)",
    fetchedSet.size === 2 &&
      [...fetchedSet].every((p) => p.endsWith("site-photo-uuid") || p.endsWith("lease-uuid")),
    `fetched=${JSON.stringify(fetched)}`,
  );
  // Task #722 — note: byte-size comparison vs. the no-loader render
  // is no longer a reliable signal because pdf-lib re-saves the merged
  // PDF with different compression than pdfkit, which can shrink the
  // overall payload even when extra pages are added. We assert the
  // page-count delta instead (below).

  // Task #722 — the rendered packet should pick up the 2 pages from
  // the merged lease.pdf attachment. Comparing against the same packet
  // rendered with no loader (no merge happens) gives a stable
  // page-delta assertion regardless of upstream layout drift.
  setEvidenceBytesLoader(null);
  const noMergeBuffer = await generateLenderPacketPDF(packet);
  const noMergePages = (await PDFDocument.load(noMergeBuffer)).getPageCount();
  const mergedPages = (await PDFDocument.load(thumbBuffer)).getPageCount();
  check(
    "page count grows by the embedded PDF's page count",
    mergedPages === noMergePages + 2,
    `noMerge=${noMergePages} merged=${mergedPages}`,
  );

  // Reset to the default loader so later tests in the suite see a
  // pristine module state.
  setEvidenceBytesLoader(null);

  // Task #722 — board packet must mirror the lender behavior end to
  // end: PDF attachments get merged onto the end of the packet, image
  // attachments still inline as thumbnails in the shared appendix.
  setEvidenceBytesLoader(async (objectPath: string) => {
    if (objectPath.endsWith("site-photo-uuid")) return tinyPng;
    if (objectPath.endsWith("lease-uuid")) return tinyPdfBytes;
    return null;
  });
  const boardPacket = await buildBoardPacket(
    data as Parameters<typeof buildBoardPacket>[0],
    consultant,
  );
  (boardPacket as unknown as { assumptionConfidence: Record<string, unknown> }).assumptionConfidence = (
    packet as unknown as { assumptionConfidence: Record<string, unknown> }
  ).assumptionConfidence;
  const boardWithMerge = await generateBoardPacketPDF(boardPacket);
  check(
    "board packet renders with embedded PDF attachments",
    boardWithMerge.subarray(0, 5).toString("ascii") === "%PDF-" &&
      boardWithMerge.length > 5000,
    `length=${boardWithMerge.length}`,
  );
  setEvidenceBytesLoader(null);
  const boardNoMerge = await generateBoardPacketPDF(boardPacket);
  const boardNoMergePages = (await PDFDocument.load(boardNoMerge)).getPageCount();
  const boardMergedPages = (await PDFDocument.load(boardWithMerge)).getPageCount();
  check(
    "board packet page count grows by the embedded PDF's page count",
    boardMergedPages === boardNoMergePages + 2,
    `noMerge=${boardNoMergePages} merged=${boardMergedPages}`,
  );

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
