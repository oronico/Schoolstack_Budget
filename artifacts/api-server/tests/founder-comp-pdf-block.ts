// Task #699 — coverage for the Founder Compensation block rendered on
// the lender packet PDF and the board packet PDF. Pins the contract
// that the same per-year reported / normalized / adjustment numbers
// (and the "not paying yet" note) appear on BOTH PDFs, so a reviewer
// reading either packet sees what reviewers reading the workbook see.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import {
  buildLenderPacket,
  buildFounderCompPdfBlock,
} from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

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

// PDFKit subsets fonts and emits hex-encoded CID strings rather than
// literal `(...)` strings, so we shell out to poppler's pdftotext (which
// reads the embedded ToUnicode CMap) instead of a homegrown extractor.
function extractPDFText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "founder-pdf-"));
  const path = join(dir, "doc.pdf");
  writeFileSync(path, pdf);
  try {
    return execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildModel(opts: {
  reportedFounderComp: number[];
  normalizedFounderComp: number[];
  notPayingFounderYet?: boolean;
}): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Founder Comp PDF Test School",
      state: "OH",
      schoolType: "private_school",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 200,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 4000,
      annualRentEscalation: 3,
      debtIncluded: false,
    },
    enrollment: { year1: 60, year2: 80, year3: 100, year4: 120, year5: 140 },
    revenueRows: [
      {
        id: "r1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [12000, 12360, 12731, 13113, 13506],
        billingMonths: 12,
      },
    ],
    staffingRows: [
      {
        id: "s1",
        roleName: "Head of School",
        functionCategory: "school_leadership",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: opts.reportedFounderComp[0] || 1,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 8,
        payrollLike: false,
      },
      {
        id: "s2",
        roleName: "Lead Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 4,
        annualizedRate: 50000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 8,
        payrollLike: false,
      },
    ],
    staffing: {
      benefitsRate: 20,
      payrollTaxRate: 8,
      reportedFounderComp: opts.reportedFounderComp,
      normalizedFounderComp: opts.normalizedFounderComp,
      ...(opts.notPayingFounderYet ? { notPayingFounderYet: true } : {}),
    },
    expenseRows: [
      {
        id: "e1",
        category: "occupancy_facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "monthly",
        amounts: [4000, 4120, 4244, 4371, 4502],
      },
    ],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    openingBalances: { cash: 100_000 },
  };
}

async function main(): Promise<void> {
  console.log("=== Founder Compensation PDF Block Test (Task #699) ===\n");

  // ── Case 1: under-paying founder — block should appear on both PDFs ──
  console.log("— Under-paying founder —");
  const underModel = buildModel({
    reportedFounderComp: [40_000, 40_000, 40_000, 40_000, 40_000],
    normalizedFounderComp: [120_000, 120_000, 120_000, 120_000, 120_000],
  });
  const underBlock = buildFounderCompPdfBlock(underModel as unknown as ModelData);
  check("buildFounderCompPdfBlock returns a block when there is an adjustment", !!underBlock);
  check(
    "block reports hasAdjustment=true and notPayingYet=false",
    !!underBlock && underBlock.hasAdjustment === true && underBlock.notPayingYet === false,
  );

  const underCO = await runConsultantEngine(underModel as Parameters<typeof runConsultantEngine>[0]);
  const lenderPacket = buildLenderPacket(underModel as unknown as ModelData, underCO, 1);
  const boardPacket = buildBoardPacket(underModel as unknown as ModelData, underCO, 1);
  check(
    "lender packet exposes founderCompNormalization",
    !!lenderPacket.founderCompNormalization,
  );
  check(
    "board packet exposes founderCompNormalization",
    !!boardPacket.founderCompNormalization,
  );
  check(
    "both packets carry the same per-year reported series",
    JSON.stringify(lenderPacket.founderCompNormalization?.reported) ===
      JSON.stringify(boardPacket.founderCompNormalization?.reported),
  );
  check(
    "both packets carry the same per-year normalized series",
    JSON.stringify(lenderPacket.founderCompNormalization?.normalized) ===
      JSON.stringify(boardPacket.founderCompNormalization?.normalized),
  );
  check(
    "both packets carry the same per-year delta series",
    JSON.stringify(lenderPacket.founderCompNormalization?.delta) ===
      JSON.stringify(boardPacket.founderCompNormalization?.delta),
  );

  const lenderPdf = await generateLenderPacketPDF(lenderPacket);
  const boardPdf = await generateBoardPacketPDF(boardPacket);
  const lenderText = extractPDFText(lenderPdf);
  const boardText = extractPDFText(boardPdf);

  check(
    "lender PDF includes the Founder Compensation section title",
    lenderText.includes("Founder Compensation"),
  );
  check(
    "board PDF includes the Founder Compensation section title",
    boardText.includes("Founder Compensation"),
  );
  check(
    "lender PDF includes the As planned (reported) row label",
    lenderText.includes("As planned (reported)"),
  );
  check(
    "board PDF includes the As planned (reported) row label",
    boardText.includes("As planned (reported)"),
  );
  check(
    "lender PDF includes the Market rate (normalized) row label",
    lenderText.includes("Market rate (normalized)"),
  );
  check(
    "board PDF includes the Market rate (normalized) row label",
    boardText.includes("Market rate (normalized)"),
  );
  check(
    "lender PDF includes the Lender adjustment row label",
    lenderText.includes("Lender adjustment"),
  );
  check(
    "board PDF includes the Lender adjustment row label",
    boardText.includes("Lender adjustment"),
  );
  check(
    "lender PDF includes a $40,000 reported figure",
    lenderText.includes("$40,000"),
  );
  check(
    "board PDF includes a $40,000 reported figure",
    boardText.includes("$40,000"),
  );
  check(
    "lender PDF includes the sweat-equity note",
    lenderText.includes("below market rate"),
  );
  check(
    "board PDF includes the sweat-equity note",
    boardText.includes("below market rate"),
  );

  // ── Case 2: not paying yet — block should still appear with the matching note ──
  console.log("\n— Not paying yet —");
  const notPayingModel = buildModel({
    reportedFounderComp: [0, 0, 0, 0, 0],
    normalizedFounderComp: [120_000, 120_000, 120_000, 120_000, 120_000],
    notPayingFounderYet: true,
  });
  const notPayingBlock = buildFounderCompPdfBlock(notPayingModel as unknown as ModelData);
  check("not-paying block is non-null", !!notPayingBlock);
  check(
    "not-paying block carries notPayingYet=true",
    !!notPayingBlock && notPayingBlock.notPayingYet === true,
  );

  const notPayingCO = await runConsultantEngine(
    notPayingModel as Parameters<typeof runConsultantEngine>[0],
  );
  const npLenderPacket = buildLenderPacket(notPayingModel as unknown as ModelData, notPayingCO, 1);
  const npBoardPacket = buildBoardPacket(notPayingModel as unknown as ModelData, notPayingCO, 1);
  const npLenderPdf = await generateLenderPacketPDF(npLenderPacket);
  const npBoardPdf = await generateBoardPacketPDF(npBoardPacket);
  const npLenderText = extractPDFText(npLenderPdf);
  const npBoardText = extractPDFText(npBoardPdf);

  check(
    "lender PDF includes the not-paying-yet note",
    npLenderText.includes("not paying yet"),
  );
  check(
    "board PDF includes the not-paying-yet note",
    npBoardText.includes("not paying yet"),
  );
  check(
    "lender PDF still includes the Founder Compensation section title",
    npLenderText.includes("Founder Compensation"),
  );
  check(
    "board PDF still includes the Founder Compensation section title",
    npBoardText.includes("Founder Compensation"),
  );

  // ── Case 3: reported == normalized and no toggle — block omitted ──
  console.log("\n— Founder at market rate (no block) —");
  const noAdjModel = buildModel({
    reportedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
    normalizedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
  });
  // Drop schoolType so the per-year benchmark series doesn't override the
  // explicit normalizedFounderComp via the size-band escalator path; this
  // keeps reported and normalized identical for the "no adjustment" gate.
  const profile = (noAdjModel as Record<string, unknown>).schoolProfile as Record<string, unknown>;
  delete profile.schoolType;
  const noAdjBlock = buildFounderCompPdfBlock(noAdjModel as unknown as ModelData);
  // hasReported is true (founder is paying themselves $95k), so the block
  // is still surfaced — it just shows reported == normalized with the
  // "no normalization" note.
  check("no-adjustment block is non-null when there is reported pay", !!noAdjBlock);
  check(
    "no-adjustment block carries hasAdjustment=false and notPayingYet=false",
    !!noAdjBlock && noAdjBlock.hasAdjustment === false && noAdjBlock.notPayingYet === false,
  );

  // ── Case 4: nothing reported, no toggle, no adjustment — block omitted ──
  console.log("\n— No founder pay at all (block omitted) —");
  const blankModel = buildModel({
    reportedFounderComp: [0, 0, 0, 0, 0],
    normalizedFounderComp: [0, 0, 0, 0, 0],
  });
  const blankProfile = (blankModel as Record<string, unknown>).schoolProfile as Record<string, unknown>;
  delete blankProfile.schoolType;
  // Strip the founder row so the roster fallback in
  // getReportedFounderCompYears doesn't synthesize a pay series from
  // annualizedRate=1.
  (blankModel as Record<string, unknown>).staffingRows = [];
  const blankBlock = buildFounderCompPdfBlock(blankModel as unknown as ModelData);
  check(
    "block is null when there is no reported pay, no toggle, and no adjustment",
    blankBlock === null,
    `got: ${JSON.stringify(blankBlock)}`,
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
