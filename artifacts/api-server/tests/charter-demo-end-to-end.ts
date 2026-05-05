// Task #545 — End-to-end smoke test for the charter demo model.
//
// Task #541 added a third seeded model (Liberty STEM Charter School,
// `fundingProfile: charter_public_funded`, ADM grade-band per-pupil
// funding) to the preview-data auto-seed, but the existing unit test
// (`seed-preview-data.ts`) only asserts that the row is inserted with
// the right `fundingProfile`. A regression in the ADM grade-band path,
// the consultant narrative for `charter_public_funded`, the workbook
// export, or the lender packet would still pass that test today.
//
// This test loads the exact `CHARTER_SCHOOL_MODEL` payload that gets
// seeded into preview environments and runs it through the three
// downstream surfaces a reviewer would actually exercise:
//
//   1. `runConsultantEngine`  — the engine that powers every narrative
//      and metric. Must complete without throwing and must produce
//      non-zero year-1 public-funding revenue (the whole point of the
//      charter / ADM path) plus a narrative that mentions charter or
//      per-pupil / ADM (so the consultant actually engaged the charter
//      branch instead of the generic tuition-school path).
//   2. `generateWorkbook`     — the underwriting workbook export.
//      Must complete without throwing and produce a non-trivial buffer.
//   3. `buildLenderPacket`    — the lender PDF packet builder.
//      Must complete without throwing and produce a populated packet.
//   4. `buildBoardPacket` + `generateBoardPacketPDF` — the board packet
//      builder plus the PDF renderer it feeds. Task #545's original smoke
//      test skipped these even though the board packet has its own
//      narrative enrichment, recruiting projections, and cap insight
//      logic that could regress for charter / public-funded models
//      without anyone noticing (Task #548). Both must complete without
//      throwing, the packet must carry a populated `sections` list, and
//      the rendered PDF buffer must look like a real PDF (`%PDF-` magic
//      bytes, non-trivial size).
//
// Hermetic: no DB, no network, no env vars required.

import {
  runConsultantEngine,
  computeYearFinancialsFromData,
} from "../src/lib/consultant-engine.js";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { CHARTER_SCHOOL_MODEL } from "../src/lib/seed-preview-data.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function run(): Promise<void> {
  const data = CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown>;

  // Sanity: the seeded model still self-identifies as charter_public_funded
  // and still carries the gradeBandPerPupil field. If either of these
  // disappears in a refactor, the rest of this smoke test is meaningless.
  check(
    "seed payload still uses fundingProfile=charter_public_funded",
    CHARTER_SCHOOL_MODEL.fundingProfile === "charter_public_funded",
    `got=${CHARTER_SCHOOL_MODEL.fundingProfile}`,
  );
  const sp = (data.schoolProfile as Record<string, unknown>) || {};
  check(
    "seed payload still sets enrollmentRevenueMethod=adm",
    sp.enrollmentRevenueMethod === "adm",
    `got=${sp.enrollmentRevenueMethod}`,
  );
  check(
    "seed payload still carries gradeBandPerPupil",
    typeof sp.gradeBandPerPupil === "object" && sp.gradeBandPerPupil !== null,
  );

  // ---- 1. Consultant engine -------------------------------------------------
  let consultant: Awaited<ReturnType<typeof runConsultantEngine>> | undefined;
  try {
    consultant = await runConsultantEngine(data);
    check("runConsultantEngine completes without throwing", true);
  } catch (err) {
    check(
      "runConsultantEngine completes without throwing",
      false,
      err instanceof Error ? err.message : String(err),
    );
    // No point continuing — every later assertion needs `consultant`.
    finishAndExit();
    return;
  }

  // Year-1 public-funding revenue must be > 0. The whole reason for the
  // charter demo model is to exercise the per-pupil / ADM revenue path,
  // so a zero value means a regression in `computeAllYearsFromRows` or
  // the public_funding row category, not just a different forecast.
  const yearly = computeYearFinancialsFromData(data);
  const y1 = yearly[0];
  check(
    "year-1 public-funding revenue is non-zero",
    !!y1 && y1.publicRevenue > 0,
    `publicRevenue=${y1?.publicRevenue ?? "(missing)"}`,
  );
  check(
    "consultant.revenueComposition[0].publicPct > 0",
    consultant.revenueComposition[0]?.publicPct > 0,
    `publicPct=${consultant.revenueComposition[0]?.publicPct}`,
  );

  // The consultant narrative must show charter-branch-specific copy —
  // proving the engine actually engaged the `charter_public_funded`
  // path rather than silently defaulting to the tuition-school
  // recommendations for this model.
  //
  // We deliberately exclude `executiveSummary` from this scan because
  // the engine echoes the school name into it (`${schoolName} projects
  // ...`) and the seeded school name is "Liberty STEM Charter School"
  // — matching "charter" there would pass even if every charter branch
  // in the engine had been deleted. The recommendations, key metrics,
  // health signals, and enrollment guidance are all generated from
  // the charter / public-funding code paths, so they're the right
  // surfaces to check.
  //
  // Likewise we look for `per-pupil` (or "per pupil") and `\badm\b` /
  // "public funding" — phrases that come from the charter-specific
  // branches in `consultant-engine.ts`, not from the school name or
  // the generic tuition-school copy.
  const branchOnlyNarrative = [
    consultant.biggestStrength,
    consultant.biggestRisk,
    consultant.lenderReadinessExplanation,
    ...consultant.recommendations.map((r) => `${r.title}\n${r.description}`),
    ...consultant.healthSignals.map((s) => `${s.dimension}\n${s.explanation}`),
    ...consultant.enrollmentGuidance,
    ...consultant.keyMetrics.map((m) => `${m.name}\n${m.interpretation}`),
  ]
    .join("\n")
    .toLowerCase();
  check(
    "consultant narrative uses charter-branch-specific language " +
      "(per-pupil / ADM / public funding) outside the executive summary",
    /per[- ]?pupil|\badm\b|public funding/.test(branchOnlyNarrative),
    `narrative excerpt: ${branchOnlyNarrative.slice(0, 240).replace(/\s+/g, " ")}`,
  );

  // Stronger signal: at least one recommendation title must reflect the
  // charter / public-funding branch (`isCharter` block in
  // `consultant-engine.ts:generateRecommendations`). With ~95% of
  // year-1 revenue coming from public per-pupil funding in this seed,
  // the "Charter Funding Timing & Cash Flow Risk" recommendation must
  // fire — if it doesn't, either the seeded revenue rows stopped
  // hitting the `public_funding` category or the charter branch in the
  // engine regressed.
  const recommendationTitles = consultant.recommendations
    .map((r) => r.title.toLowerCase());
  check(
    "consultant emits at least one charter-branch recommendation",
    recommendationTitles.some((t) => t.includes("charter")),
    `recommendation titles: ${recommendationTitles.join(" | ") || "(none)"}`,
  );

  // ---- 2. Workbook export ---------------------------------------------------
  let workbookBuffer: Buffer | undefined;
  try {
    workbookBuffer = await generateWorkbook(data);
    check("generateWorkbook completes without throwing", true);
  } catch (err) {
    check(
      "generateWorkbook completes without throwing",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  check(
    "workbook buffer is a non-trivial xlsx blob",
    !!workbookBuffer && workbookBuffer.length > 1000,
    `length=${workbookBuffer?.length ?? "(missing)"}`,
  );
  // xlsx files are zip-formatted and always start with the "PK\x03\x04"
  // local file header — a quick magic-bytes check that catches the
  // "we returned an empty/HTML buffer" class of regressions cheaply.
  check(
    "workbook buffer has xlsx (PK) magic bytes",
    !!workbookBuffer &&
      workbookBuffer[0] === 0x50 &&
      workbookBuffer[1] === 0x4b,
    `bytes=${workbookBuffer?.slice(0, 4).toString("hex")}`,
  );

  // ---- 3. Lender packet -----------------------------------------------------
  let lender: ReturnType<typeof buildLenderPacket> | undefined;
  try {
    lender = buildLenderPacket(
      data as unknown as ModelData,
      consultant,
      /* modelId */ 1,
      "comfortable",
    );
    check("buildLenderPacket completes without throwing", true);
  } catch (err) {
    check(
      "buildLenderPacket completes without throwing",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  check(
    "lender packet has at least one populated section",
    !!lender && Array.isArray(lender.sections) && lender.sections.length > 0,
    `sections=${lender?.sections?.length ?? "(missing)"}`,
  );
  check(
    "lender packet carries a lenderReadiness verdict",
    !!lender &&
      typeof lender.lenderReadiness?.status === "string" &&
      lender.lenderReadiness.status.length > 0,
    `status=${lender?.lenderReadiness?.status ?? "(missing)"}`,
  );

  // ---- 4. Board packet + PDF ------------------------------------------------
  // Task #548 — the board packet has its own narrative enrichment,
  // recruiting projections, and cap insight logic that the original
  // Task #545 smoke test never exercised for the charter demo. Run the
  // builder *and* the PDF renderer it feeds so both surfaces fail loudly
  // if the charter / public-funded path regresses.
  let board: ReturnType<typeof buildBoardPacket> | undefined;
  try {
    board = buildBoardPacket(
      data as unknown as ModelData,
      consultant,
      /* modelId */ 1,
      "comfortable",
    );
    check("buildBoardPacket completes without throwing", true);
  } catch (err) {
    check(
      "buildBoardPacket completes without throwing",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  check(
    "board packet has at least one populated section",
    !!board && Array.isArray(board.sections) && board.sections.length > 0,
    `sections=${board?.sections?.length ?? "(missing)"}`,
  );

  let boardPdf: Buffer | undefined;
  if (board) {
    try {
      boardPdf = await generateBoardPacketPDF(board);
      check("generateBoardPacketPDF completes without throwing", true);
    } catch (err) {
      check(
        "generateBoardPacketPDF completes without throwing",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  check(
    "board PDF buffer is non-trivial in size (> 1KB)",
    !!boardPdf && boardPdf.length > 1024,
    `length=${boardPdf?.length ?? "(missing)"}`,
  );
  // Quick magic-bytes check — every real PDF starts with "%PDF-"; this
  // catches the "we returned an empty/HTML buffer" class of regressions
  // without parsing the document.
  check(
    "board PDF buffer has %PDF- magic bytes",
    !!boardPdf && boardPdf.subarray(0, 5).toString() === "%PDF-",
    `bytes=${boardPdf?.subarray(0, 5).toString("hex")}`,
  );

  finishAndExit();
}

function finishAndExit(): void {
  console.log(`\ncharter-demo-end-to-end: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
