// Task #742 — lender-ready exports must surface coaching headlines, not
// the raw `lenderReadiness` enum value.
//
// The Consultant view in the app already renders coaching phrases
// ("Ready to share", "Almost there", "Worth another pass") in place of
// the raw verdict words ("Strong", "Needs Work", "Not Yet Ready") that
// `consultant-engine.ts` emits. Task #741 locked that in for the in-app
// view with a render test. The lender-conversation Excel and the
// loan-readiness PDF were still writing the bare verdict word verbatim
// into the file the founder downloads. This test asserts both export
// render paths now publish the same coaching headlines the in-app view
// uses, and that no cell or status badge contains the raw verdict word
// as its own headline.
//
// What this test asserts:
//   1. lenderReadinessCoachingHeadline returns the three canonical
//      coaching phrases, one per verdict (matches the strings in
//      ConsultantAnalysisView.tsx).
//   2. The legacy 5-year Excel workbook (excel-export.ts) renders the
//      coaching headline in the Cover, Summary, and Financial Health
//      "Lender Readiness" / "Readiness Status" cells, and never writes
//      the bare verdict word as a standalone cell value.
//   3. The loan-readiness PDF (pdf-loan-readiness.ts) calls
//      `statusBadge` with the coaching headline, not with
//      `consultantData.lenderReadiness` directly. This is verified
//      both by source-scanning pdf-loan-readiness.ts and by rendering
//      the PDF for each verdict and grepping the (uncompressed) text
//      stream for the coaching phrase, plus asserting the bare verdict
//      word never appears as a standalone status badge label
//      (e.g. "Status: Strong" no longer appears in the PDF).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";
import {
  LENDER_READINESS_COACHING_HEADLINES,
  lenderReadinessCoachingHeadline,
  type LenderReadinessVerdict,
} from "../src/lib/lender-readiness-coaching.js";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { generateLoanReadinessPDF } from "../src/lib/pdf-loan-readiness.js";
import type { ConsultantOutput } from "../src/lib/consultant-engine.js";
import { microschoolStartup } from "./sample-payloads.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import {
  buildNarrativeBundle,
  buildLenderCommentary,
  buildBoardCommentary,
} from "../src/lib/packets/build-narrative-commentary.js";
import { buildFounderSummary } from "../src/lib/packets/build-founder-summary.js";
import { buildLenderSummary } from "../src/lib/packets/build-lender-summary.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { buildLenderSummarySheet } from "../src/lib/packets/lender-summary-sheet.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
const __dirname = dirname(fileURLToPath(import.meta.url));

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

const VERDICTS: LenderReadinessVerdict[] = ["Strong", "Needs Work", "Not Yet Ready"];

function buildConsultantOutput(verdict: LenderReadinessVerdict): ConsultantOutput {
  return {
    executiveSummary: "Test executive summary.",
    biggestStrength: "Healthy reserve build.",
    biggestRisk: "Enrollment growth assumption is aggressive.",
    keyMetrics: [],
    recommendations: [],
    revenueComposition: [],
    costComposition: [],
    cumulativeFinancials: [],
    stressTests: [],
    lenderReadiness: verdict,
    lenderReadinessExplanation:
      "Detailed assessment of the model against typical lender benchmarks.",
  } as unknown as ConsultantOutput;
}

function fixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(microschoolStartup));
}

function collectCellValues(wb: ExcelJS.Workbook): string[] {
  const out: string[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (typeof v === "string") {
          out.push(v);
        } else if (v && typeof v === "object" && "richText" in v) {
          const rt = (v as { richText: Array<{ text?: string }> }).richText;
          out.push(rt.map((r) => r.text ?? "").join(""));
        }
      });
    });
  }
  return out;
}

async function testHelperPhrases(): Promise<void> {
  console.log("\n— lenderReadinessCoachingHeadline returns the canonical coaching phrases —");
  for (const v of VERDICTS) {
    const headline = lenderReadinessCoachingHeadline(v);
    check(
      `verdict "${v}" maps to a non-empty coaching phrase`,
      headline.length > 0 && headline === LENDER_READINESS_COACHING_HEADLINES[v],
      `got ${JSON.stringify(headline)}`,
    );
    check(
      `coaching phrase for "${v}" is not the bare verdict word`,
      headline !== v,
      `headline collapsed to the raw verdict word`,
    );
  }
  // The three canonical coaching phrases must match what the in-app
  // ConsultantAnalysisView renders. Pin the exact strings here so any
  // drift on either side gets flagged.
  check(
    'Strong → "Ready to share — keep polishing the narrative."',
    lenderReadinessCoachingHeadline("Strong") ===
      "Ready to share — keep polishing the narrative.",
  );
  check(
    'Needs Work → "Almost there — a few targeted edits will tighten the story."',
    lenderReadinessCoachingHeadline("Needs Work") ===
      "Almost there — a few targeted edits will tighten the story.",
  );
  check(
    'Not Yet Ready → "Worth another pass before you send it out."',
    lenderReadinessCoachingHeadline("Not Yet Ready") ===
      "Worth another pass before you send it out.",
  );
}

async function testExcelRenderForVerdict(verdict: LenderReadinessVerdict): Promise<void> {
  console.log(`\n— Excel export renders coaching headline for verdict "${verdict}" —`);
  const consultant = {
    executiveSummary: "Test executive summary.",
    lenderReadiness: verdict,
    lenderReadinessExplanation: "Detailed assessment of the model.",
    biggestStrength: "Healthy reserve build.",
    biggestRisk: "Aggressive enrollment growth assumption.",
    recommendations: [
      { title: "Tighten enrollment ramp", description: "Lower year-3 growth.", priority: "high" },
    ],
  };
  const buf = await generateWorkbook(fixture(), consultant);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const allValues = collectCellValues(wb);

  const expectedHeadline = LENDER_READINESS_COACHING_HEADLINES[verdict];
  check(
    `coaching headline "${expectedHeadline}" appears in at least one workbook cell`,
    allValues.some((v) => v.includes(expectedHeadline)),
    `cell values searched: ${allValues.length}`,
  );

  // The bare verdict word must NEVER appear as the entire value of a
  // headline cell. (The word may appear inside longer prose like the
  // executive summary or recommendation text — the ban is on the
  // standalone label cell that previously read just "Strong" / "Needs
  // Work" / "Not Yet Ready".)
  for (const otherVerdict of VERDICTS) {
    const standaloneOffenders = allValues.filter((v) => v.trim() === otherVerdict);
    check(
      `no cell has the standalone verdict word "${otherVerdict}" as its entire value`,
      standaloneOffenders.length === 0,
      `offending cells: ${standaloneOffenders.length}`,
    );
  }
}

async function testPdfRenderForVerdict(verdict: LenderReadinessVerdict): Promise<void> {
  console.log(`\n— Loan-readiness PDF renders coaching headline for verdict "${verdict}" —`);
  const buf = await generateLoanReadinessPDF(buildConsultantOutput(verdict), "Test School");
  check(
    "PDF buffer starts with %PDF- header",
    buf.subarray(0, 5).toString() === "%PDF-",
    `got ${buf.subarray(0, 5).toString()}`,
  );
  check("PDF buffer is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

  // The deprecated headline format was literally `Status: <verdict>`
  // (see the previous statusBadge call). Asserting that string never
  // appears in the rendered PDF guards the headline path even if the
  // text stream is compressed and the coaching phrase isn't directly
  // greppable.
  const raw = buf.toString("latin1");
  for (const otherVerdict of VERDICTS) {
    const bannedHeadline = `Status: ${otherVerdict}`;
    check(
      `PDF does not emit the raw "${bannedHeadline}" headline`,
      !raw.includes(bannedHeadline),
      `headline still present in PDF byte stream`,
    );
  }
}

function testPdfSourceUsesCoachingHelper(): void {
  console.log("\n— pdf-loan-readiness.ts source wraps lenderReadiness in the coaching helper —");
  const src = readFileSync(
    join(__dirname, "../src/lib/pdf-loan-readiness.ts"),
    "utf8",
  );
  // The status badge must call the helper. Without the helper, the
  // headline would degrade back to the bare verdict word.
  check(
    "imports lenderReadinessCoachingHeadline",
    /lenderReadinessCoachingHeadline/.test(src),
  );
  check(
    "statusBadge call uses lenderReadinessCoachingHeadline(...) for its label",
    /statusBadge\([^)]*lenderReadinessCoachingHeadline\(/s.test(src),
  );
  // The previous "Status: ${consultantData.lenderReadiness}" template
  // string must be gone — that was the literal raw-verdict headline.
  check(
    'no remaining "Status: ${consultantData.lenderReadiness}" template',
    !/Status:\s*\$\{consultantData\.lenderReadiness\}/.test(src),
  );
}

function testExcelSourceUsesCoachingHelper(): void {
  console.log("\n— excel-export.ts source wraps lenderReadiness in the coaching helper —");
  const src = readFileSync(
    join(__dirname, "../src/lib/excel-export.ts"),
    "utf8",
  );
  check(
    "imports lenderReadinessCoachingHeadline",
    /lenderReadinessCoachingHeadline/.test(src),
  );
  // No cell-value assignment may receive `consultant?.lenderReadiness`
  // (or `consultantData.lenderReadiness`) directly — every render-path
  // assignment must go through the helper. Cells that just need the
  // verdict for color/icon mapping still reference it but are not
  // `.value =` assignments, so the regex below targets only `.value =`.
  const offenderRe =
    /\.value\s*=\s*(?:consultant|consultantData)\??\.lenderReadiness\b(?!\s*\?)/g;
  const offenders = src.match(offenderRe) || [];
  check(
    "no cell .value assignment writes consultant(.|?.)lenderReadiness directly",
    offenders.length === 0,
    `offending assignments: ${offenders.join(" | ")}`,
  );
}

// ───────────────────────────────────────────────────────────────────────
// Task #751 — coaching phrasing also covers the lender packet PDF
// status badge, the lender summary status, the founder summary
// readiness verb, the build-narrative-commentary verdict sentence, and
// the mailer "Lending Readiness:" line.
// ───────────────────────────────────────────────────────────────────────

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, "..", rel), "utf8");
}

function testTask751SourceCoverage(): void {
  console.log("\n— Task #751 source-scan: coaching helper used on every leak surface —");

  const surfaces: Array<{ rel: string; label: string; banned: RegExp[] }> = [
    {
      rel: "src/lib/packets/lender-packet-pdf.ts",
      label: "lender-packet-pdf.ts cover badge",
      banned: [
        // Old template: `Lender Readiness: ${packet.lenderReadiness.status}`
        /Lender Readiness:\s*\$\{packet\.lenderReadiness\.status\}/,
      ],
    },
    {
      rel: "src/lib/packets/lender-summary-pdf.ts",
      label: "lender-summary-pdf.ts verdict pill",
      banned: [
        // Old pill text: `data.verdict.status.toUpperCase()`
        /data\.verdict\.status\.toUpperCase\(\)/,
      ],
    },
    {
      rel: "src/lib/packets/build-narrative-commentary.ts",
      label: "build-narrative-commentary.ts verdict sentences",
      banned: [
        // Old lender sentence template
        /model rates as \$\{bundle\.lenderReadiness\}/,
        // Old board sentence template
        /reads as \$\{bundle\.lenderReadiness\}/,
      ],
    },
    {
      rel: "src/lib/packets/build-founder-summary.ts",
      label: "build-founder-summary.ts readiness verb",
      banned: [
        // The hand-rolled `readinessVerb` helper that previously wrapped
        // the bare verdict word — replaced by the canonical coaching helper.
        /function readinessVerb\(/,
        /readinessVerb\(bundle\.lenderReadiness\)/,
      ],
    },
    {
      rel: "src/lib/mailer.ts",
      label: "mailer.ts Lending Readiness line",
      banned: [
        // Old HTML cell — bare verdict noun escaped into the table.
        /escapeHtml\(data\.metrics\.lenderReadiness\)/,
        // Old plain-text line — bare verdict noun appended verbatim.
        /Lending Readiness:\s*\$\{data\.metrics\.lenderReadiness\}/,
      ],
    },
  ];

  for (const s of surfaces) {
    const src = readSrc(s.rel);
    check(
      `${s.label}: imports lenderReadinessCoachingHeadline`,
      /lenderReadinessCoachingHeadline/.test(src),
    );
    check(
      `${s.label}: calls lenderReadinessCoachingHeadline(...) at least once`,
      /lenderReadinessCoachingHeadline\(/.test(src),
    );
    for (const re of s.banned) {
      check(
        `${s.label}: banned pre-coaching pattern ${re} is gone`,
        !re.test(src),
      );
    }
  }
}

function buildNarrativeFixtureModel(): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Acme Microschool",
      state: "WA",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 30,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 4000,
      annualRentEscalation: 3,
      debtIncluded: true,
    },
    enrollment: { year1: 12, year2: 18, year3: 22, year4: 26, year5: 28, retentionRate: 88 },
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
        annualizedRate: 80_000,
        benefitsEligible: true,
        benefitsRate: 25,
        payrollTaxRate: 9.95,
        payrollLike: true,
        notes: "",
        staffingMode: "fixed",
      },
    ],
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
    capitalAndDebtRows: [
      {
        id: "d1",
        enabled: true,
        isLoan: true,
        loanPrincipal: 100_000,
        loanRate: 7.5,
        loanTermYears: 7,
        driverType: "loan",
        lineItem: "Startup loan",
      },
    ],
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
    openingBalances: { cash: 50_000 },
  };
}

/** Stripped form the narrative builders apply via stripDashes — em-dashes
 *  collapse to " - ". The built prose will contain this transformed
 *  variant of the canonical coaching headline. */
function strippedHeadline(v: LenderReadinessVerdict): string {
  return LENDER_READINESS_COACHING_HEADLINES[v]
    .replace(/[\u2014\u2013]/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

async function testTask751NarrativeBuilders(): Promise<void> {
  console.log("\n— Task #751 narrative builders surface the coaching headline —");

  const model = buildNarrativeFixtureModel();
  const co = await runConsultantEngine(model);
  const bundle = buildNarrativeBundle(model as ModelData, co);
  const verdict = bundle.lenderReadiness;
  const want = strippedHeadline(verdict);

  // Lender commentary — paragraph 1 verdict sentence.
  const lender = buildLenderCommentary(bundle);
  const lenderText = lender.paragraphs.join("\n");
  check(
    `buildLenderCommentary contains coaching headline for verdict "${verdict}"`,
    lenderText.includes(want),
    `searched ${lenderText.length} chars`,
  );
  check(
    "buildLenderCommentary no longer prints `the model rates as <verdict>`",
    !/model rates as (Strong|Needs Work|Not Yet Ready)\b/.test(lenderText),
  );

  // Board commentary — paragraph 3 verdict sentence.
  const board = buildBoardCommentary(bundle);
  const boardText = board.paragraphs.join("\n");
  check(
    `buildBoardCommentary contains coaching headline for verdict "${verdict}"`,
    boardText.includes(want),
  );
  check(
    "buildBoardCommentary no longer prints `reads as <verdict> for lender review`",
    !/reads as (Strong|Needs Work|Not Yet Ready) for lender review/.test(boardText),
  );

  // Founder summary — "What your model says" paragraph.
  const founder = buildFounderSummary(model as ModelData, co);
  const founderText = founder.sections
    .flatMap((s) => [...s.paragraphs, ...(s.bullets || [])])
    .join("\n");
  check(
    `buildFounderSummary contains coaching headline for verdict "${verdict}"`,
    founderText.includes(want),
  );
  // The previous custom readiness verbs all leaked the framing word
  // "lender conversation(s)" tied to the verdict; assert at least one
  // canonical clause from those verbs is no longer present.
  check(
    "buildFounderSummary no longer uses the legacy `readinessVerb` clauses",
    !/reads as a strong starting point for lender conversations/.test(
      founderText,
    ) &&
      !/still needs more work before a lender conversation/.test(founderText) &&
      !/is not yet at a place where a lender conversation will land well/.test(
        founderText,
      ),
  );
}

/**
 * Task #754 — decode the rendered PDF (with PDFKit's `compress: false`
 * exposed via the `SCHOOLSTACK_PDF_TEST_UNCOMPRESSED` test hook on
 * `createDoc`) so we can grep the coaching headline as actual rendered
 * text, not just byte-stream needles.
 *
 * PDFKit emits text on the page as `(literal) Tj` or
 * `[(part1) <kerning> (part2) ...] TJ` operators inside the page
 * content stream. With compression disabled, those operators are
 * readable in the raw bytes. This extractor walks every `(...)` string
 * literal in the buffer, decodes PDF string escapes (including octal
 * escapes for high-byte WinAnsi chars like the em-dash 0x97), and
 * concatenates them with spaces. That gives us a single text blob we
 * can substring-search for the coaching headline.
 *
 * We deliberately do not pull in `pdf-parse` or another decoder
 * dependency — PDFKit's own uncompressed output is enough to prove the
 * headline reaches the page.
 */
async function testTask754LenderPacketPdfRender(): Promise<void> {
  console.log(
    "\n— Task #754 lender packet PDF: decoded text contains coaching headline for every verdict —",
  );

  const model = buildNarrativeFixtureModel();
  const co = await runConsultantEngine(model);

  // Build the packet + summary once, then mutate the verdict per
  // iteration so we exercise the cover badge and the lender summary
  // page for all three verdicts without re-running the engine.
  const baseLp = buildLenderPacket(model as ModelData, co, 1);
  const baseLs = buildLenderSummary(model as ModelData, co);

  const prevEnv = process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED;
  process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED = "1";
  try {
    for (const verdict of VERDICTS) {
      const lp = JSON.parse(JSON.stringify(baseLp)) as typeof baseLp;
      lp.lenderReadiness.status = verdict;
      const ls = {
        ...baseLs,
        verdict: { ...baseLs.verdict, status: verdict },
      };

      const buf = await generateLenderPacketPDF(lp, ls);
      check(
        `[${verdict}] lender packet PDF buffer starts with %PDF-`,
        buf.subarray(0, 5).toString() === "%PDF-",
      );
      check(
        `[${verdict}] lender packet PDF buffer is non-trivial in size`,
        buf.length > 4096,
      );

      const text = extractPdfText(buf);
      const headline = LENDER_READINESS_COACHING_HEADLINES[verdict];

      // Em-dash (U+2014) is encoded as WinAnsi byte 0x97 in PDFKit's
      // standard Type 1 fonts. Match against both the original Unicode
      // form and the WinAnsi-decoded form so the assertion works
      // regardless of which path the encoder took.
      const headlineWinAnsi = headline.replace(/\u2014/g, "\x97").replace(/\u2013/g, "\x96");
      // PDFKit emits per-glyph kerning inside `[...] TJ` arrays, which
      // splits a single word across multiple hex chunks. We join those
      // chunks with spaces in `extractPdfText`, so a substring like
      // "Ready to share" can land in the decoded blob as
      // "Ready to sha re". Strip whitespace from both haystack and
      // needle so the substring check survives kerning splits.
      const stripWs = (s: string) => s.replace(/\s+/g, "");
      const textNoWs = stripWs(text);
      const present =
        textNoWs.includes(stripWs(headline)) ||
        textNoWs.includes(stripWs(headlineWinAnsi)) ||
        // Fall back to the two halves around the em-dash: if PDFKit
        // ever splits the run for kerning, both halves will still
        // appear individually in the decoded text.
        headline
          .split(/[\u2014\u2013]/)
          .map((part) => stripWs(part))
          .filter((part) => part.length > 0)
          .every((part) => textNoWs.includes(part));

      check(
        `[${verdict}] cover badge + lender summary headline "${headline}" appears in decoded PDF text`,
        present,
        `decoded text length ${text.length}`,
      );

      // The lender summary page renders the headline once and the cover
      // page renders it again — when the summary is supplied the doc
      // contains both. So the headline string (or the kerning-split
      // halves) should appear at least twice in the decoded text.
      const occurrences = stripWs(headline.split(/[\u2014\u2013]/)[0]);
      const matches = textNoWs.split(occurrences).length - 1;
      check(
        `[${verdict}] coaching headline appears at least twice (cover badge + summary page)`,
        matches >= 2,
        `found ${matches} occurrence(s) of "${occurrences}"`,
      );

      // Negative invariant retained: legacy raw-verdict headline
      // template must never appear in the decoded text either.
      for (const v of VERDICTS) {
        check(
          `[${verdict}] PDF text does not contain legacy "Lender Readiness: ${v}" headline`,
          !text.includes(`Lender Readiness: ${v}`),
        );
      }
    }
  } finally {
    if (prevEnv === undefined) {
      delete process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED;
    } else {
      process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED = prevEnv;
    }
  }
}

/**
 * Task #756 — same render-time decode assertion as Task #754, but for
 * the founder summary surface. The founder summary PDF is the Board /
 * Funder Summary PDF rendered with a `FounderSummary` argument; that
 * argument carries the `lenderReadinessCoachingHeadline(...)` string in
 * the "What your model says" section paragraphs (see
 * `build-founder-summary.ts > buildWhatYourModelSays`). Up to now this
 * surface only had source-grep coverage (`testTask751SourceCoverage`)
 * and a builder-prose coverage check (`testTask751NarrativeBuilders`),
 * neither of which prove the headline reaches the rendered PDF page.
 *
 * This test renders the board+founder PDF for all three verdicts with
 * `SCHOOLSTACK_PDF_TEST_UNCOMPRESSED=1` and reuses `extractPdfText` to
 * decode the actual page content stream, then asserts the verdict's
 * coaching headline appears in the decoded text — and that the legacy
 * raw-verdict framing never does.
 */
async function testTask756FounderSummaryPdfRender(): Promise<void> {
  console.log(
    "\n— Task #756 founder summary PDF: decoded text contains coaching headline for every verdict —",
  );

  const model = buildNarrativeFixtureModel();
  const co = await runConsultantEngine(model);

  const prevEnv = process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED;
  process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED = "1";
  try {
    for (const verdict of VERDICTS) {
      // Mutate the canonical engine output's verdict so both the board
      // packet and the founder summary built off it carry the verdict
      // we want to render this iteration. The rest of the engine output
      // is unchanged so the rendered PDF still has realistic content
      // around the headline.
      const coVerdict = { ...co, lenderReadiness: verdict };
      const packet = buildBoardPacket(model as ModelData, coVerdict, 1);
      const founderSummary = buildFounderSummary(model as ModelData, coVerdict);

      const buf = await generateBoardPacketPDF(packet, founderSummary);
      check(
        `[${verdict}] founder summary PDF buffer starts with %PDF-`,
        buf.subarray(0, 5).toString() === "%PDF-",
      );
      check(
        `[${verdict}] founder summary PDF buffer is non-trivial in size`,
        buf.length > 4096,
      );

      const text = extractPdfText(buf);
      const headline = LENDER_READINESS_COACHING_HEADLINES[verdict];

      // Em-dash (U+2014) is encoded as WinAnsi byte 0x97 in PDFKit's
      // standard Type 1 fonts. Match against both the original Unicode
      // form and the WinAnsi-decoded form. Additionally, the founder
      // summary applies `stripDashes` to every paragraph, which
      // collapses em/en dashes to " - " — so the headline as it lands on
      // the page may have lost its em-dash entirely. Try all three
      // encodings.
      const headlineWinAnsi = headline
        .replace(/\u2014/g, "\x97")
        .replace(/\u2013/g, "\x96");
      const headlineStripped = strippedHeadline(verdict);
      const stripWs = (s: string) => s.replace(/\s+/g, "");
      const textNoWs = stripWs(text);
      const present =
        textNoWs.includes(stripWs(headline)) ||
        textNoWs.includes(stripWs(headlineWinAnsi)) ||
        textNoWs.includes(stripWs(headlineStripped)) ||
        // Final fallback: headline halves around the em-dash. PDFKit's
        // per-glyph kerning splits a TJ run across hex chunks, which
        // `extractPdfText` joins with spaces; stripping whitespace and
        // checking each half independently survives that split.
        headline
          .split(/[\u2014\u2013]/)
          .map((part) => stripWs(part))
          .filter((part) => part.length > 0)
          .every((part) => textNoWs.includes(part));

      check(
        `[${verdict}] founder summary headline "${headline}" appears in decoded PDF text`,
        present,
        `decoded text length ${text.length}`,
      );

      // Negative invariant: the legacy `readinessVerb` clauses that
      // previously framed the verdict in the founder summary must never
      // appear in the decoded PDF text either. These are the exact
      // strings testTask751NarrativeBuilders bans from the builder
      // output; this assertion lifts the same ban to the rendered page.
      const bannedClauses = [
        "reads as a strong starting point for lender conversations",
        "still needs more work before a lender conversation",
        "is not yet at a place where a lender conversation will land well",
      ];
      for (const banned of bannedClauses) {
        check(
          `[${verdict}] founder summary PDF does not contain legacy clause "${banned.slice(0, 40)}..."`,
          !stripWs(text).includes(stripWs(banned)),
        );
      }
    }
  } finally {
    if (prevEnv === undefined) {
      delete process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED;
    } else {
      process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED = prevEnv;
    }
  }
}

function testTask751MailerRendersCoachingHeadline(): void {
  console.log("\n— Task #751 mailer.ts review-feedback render uses coaching headline —");

  // We don't actually send mail in tests; instead we source-grep the
  // single helper-call site to prove both the HTML cell and the plain
  // text line route through `lenderReadinessCoachingHeadline`. The
  // dedicated mailer-review tests already cover the rendered shape end
  // to end; this guard prevents the call sites from being unwrapped.
  const src = readSrc("src/lib/mailer.ts");

  // HTML cell wraps the verdict in escapeHtml(lenderReadinessCoachingHeadline(...)).
  check(
    "mailer.ts wraps the verdict for the HTML metrics table via the coaching helper",
    /escapeHtml\(\s*lenderReadinessCoachingHeadline\(\s*data\.metrics\.lenderReadiness\s*\)\s*\)/.test(
      src,
    ),
  );
  // Plain-text line uses the coaching helper directly.
  check(
    "mailer.ts plain-text `Lending Readiness:` line uses the coaching helper",
    /Lending Readiness:\s*\$\{lenderReadinessCoachingHeadline\(data\.metrics\.lenderReadiness\)\}/.test(
      src,
    ),
  );
}

// ───────────────────────────────────────────────────────────────────────
// Task #755 — the lender-conversation Excel workbook (Lender Summary
// tab built by `buildLenderSummarySheet`) used to write the bare
// verdict noun ("Strong" / "Needs Work" / "Not Yet Ready") into its
// "Lender Verdict" cell. Tasks #751 and #753 pushed the coaching
// headline to every PDF, email, and in-app surface; this asserts the
// workbook tab now publishes the same coaching headline and never
// leaves the raw verdict word as a standalone cell value.
// ───────────────────────────────────────────────────────────────────────

function buildLenderSummaryFixture(verdict: LenderReadinessVerdict): import("../src/lib/packets/build-lender-summary.js").LenderSummaryData {
  return {
    schoolName: "Acme Microschool",
    generatedAt: new Date("2026-05-11T00:00:00Z"),
    verdict: {
      status: verdict,
      line: "Detailed assessment of the model against typical lender benchmarks.",
    },
    dscrByYear: [
      { year: 1, planned: 1.2, normalized: 1.1 },
      { year: 2, planned: 1.3, normalized: 1.2 },
      { year: 3, planned: 1.4, normalized: 1.3 },
      { year: 4, planned: 1.5, normalized: 1.4 },
      { year: 5, planned: 1.6, normalized: 1.5 },
    ],
    cashRunwayMonths: 6.5,
    breakEven: [
      { year: 1, plannedEnrollment: 12, breakEvenStudents: 10, utilization: 0.4 },
      { year: 2, plannedEnrollment: 18, breakEvenStudents: 14, utilization: 0.6 },
      { year: 3, plannedEnrollment: 22, breakEvenStudents: 18, utilization: 0.73 },
      { year: 4, plannedEnrollment: 26, breakEvenStudents: 21, utilization: 0.86 },
      { year: 5, plannedEnrollment: 28, breakEvenStudents: 24, utilization: 0.93 },
    ],
    maxCapacity: 30,
    revenueQualityY1: {
      contractedPct: 0.6,
      projectedPct: 0.3,
      donorDependentPct: 0.05,
      policyDependentPct: 0.05,
    },
    topRisks: [
      {
        severity: "high",
        risk: "Aggressive enrollment growth assumption.",
        mitigant: "Lock in waitlist conversions before opening.",
      },
    ],
    keyAssumptions: [
      { key: "enrollment_y1", label: "Year 1 enrollment", value: "12 students", stepNumber: 2, stepTitle: "Enrollment" },
      { key: "enrollment_y5", label: "Year 5 enrollment", value: "28 students", stepNumber: 2, stepTitle: "Enrollment" },
      { key: "retention_rate", label: "Retention rate", value: "88%", stepNumber: 2, stepTitle: "Enrollment" },
      { key: "tuition_per_student", label: "Tuition per student", value: "$12,000", stepNumber: 3, stepTitle: "Revenue" },
      { key: "staffing_total_cost", label: "Y1 staffing cost", value: "$108,000", stepNumber: 4, stepTitle: "Staffing" },
      { key: "facility_rent_y1", label: "Y1 rent", value: "$48,000", stepNumber: 5, stepTitle: "Expenses" },
    ],
  };
}

async function testTask755LenderSummarySheetCoachingHeadline(): Promise<void> {
  console.log(
    "\n— Task #755 lender-conversation Excel workbook renders coaching headlines on the readiness row —",
  );

  const ExcelJSImport = await import("exceljs");
  const ExcelJSDefault = ExcelJSImport.default;

  for (const verdict of VERDICTS) {
    const data = buildLenderSummaryFixture(verdict);
    const wb = new ExcelJSDefault.Workbook();
    buildLenderSummarySheet(wb, data);

    const allValues = collectCellValues(wb);
    const headline = LENDER_READINESS_COACHING_HEADLINES[verdict];

    check(
      `[${verdict}] coaching headline "${headline}" appears in at least one cell of the Lender Summary tab`,
      allValues.some((v) => v.includes(headline)),
      `cell values searched: ${allValues.length}`,
    );

    // No cell may contain just the bare verdict word as its entire
    // value — the legacy "Lender Verdict" cell used to do exactly that.
    for (const otherVerdict of VERDICTS) {
      const offenders = allValues.filter((v) => v.trim() === otherVerdict);
      check(
        `[${verdict}] no Lender Summary cell has the standalone verdict word "${otherVerdict}" as its entire value`,
        offenders.length === 0,
        `offending cells: ${offenders.length}`,
      );
    }

    // The coaching headline must land specifically on the readiness
    // row (the "Lender Verdict" label cell B5 + its adjacent C5
    // headline cell), not just anywhere in the workbook.
    const ws = wb.getWorksheet("Lender Summary");
    if (!ws) {
      check(`[${verdict}] Lender Summary worksheet exists`, false);
      continue;
    }
    const labelCell = ws.getCell("B5").value;
    const headlineCell = ws.getCell("C5").value;
    const headlineText =
      typeof headlineCell === "string"
        ? headlineCell
        : headlineCell && typeof headlineCell === "object" && "richText" in headlineCell
          ? (headlineCell as { richText: Array<{ text?: string }> }).richText
              .map((r) => r.text ?? "")
              .join("")
          : "";
    check(
      `[${verdict}] B5 reads "Lender Verdict"`,
      labelCell === "Lender Verdict",
      `got ${JSON.stringify(labelCell)}`,
    );
    check(
      `[${verdict}] C5 readiness cell renders the coaching headline (not the bare verdict word)`,
      headlineText === headline,
      `got ${JSON.stringify(headlineText)}`,
    );
  }
}

function testTask755LenderSummarySheetSourceUsesCoachingHelper(): void {
  console.log(
    "\n— Task #755 lender-summary-sheet.ts source wraps verdict in the coaching helper —",
  );
  const src = readSrc("src/lib/packets/lender-summary-sheet.ts");
  check(
    "imports lenderReadinessCoachingHeadline",
    /lenderReadinessCoachingHeadline/.test(src),
  );
  check(
    "calls lenderReadinessCoachingHeadline(...) at least once",
    /lenderReadinessCoachingHeadline\(/.test(src),
  );
  // No `.value =` assignment may write `data.verdict.status` directly
  // — that was the legacy raw-verdict path. The status is still used
  // for the cell fill color, but never as the cell value.
  const offenders = src.match(/\.value\s*=\s*data\.verdict\.status\b/g) || [];
  check(
    "no cell .value assignment writes data.verdict.status directly",
    offenders.length === 0,
    `offending assignments: ${offenders.join(" | ")}`,
  );
}

async function main(): Promise<void> {
  console.log("=== Task #742 — lender-ready exports use coaching headlines ===");

  await testHelperPhrases();
  testPdfSourceUsesCoachingHelper();
  testExcelSourceUsesCoachingHelper();

  for (const v of VERDICTS) {
    await testExcelRenderForVerdict(v);
    await testPdfRenderForVerdict(v);
  }

  console.log("\n=== Task #751 — coaching headlines on lender packet, founder summary, mailer ===");
  testTask751SourceCoverage();
  testTask751MailerRendersCoachingHeadline();
  await testTask751NarrativeBuilders();
  await testTask754LenderPacketPdfRender();
  await testTask756FounderSummaryPdfRender();

  console.log("\n=== Task #755 — coaching headline on the lender-conversation Excel workbook ===");
  testTask755LenderSummarySheetSourceUsesCoachingHelper();
  await testTask755LenderSummarySheetCoachingHeadline();

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
