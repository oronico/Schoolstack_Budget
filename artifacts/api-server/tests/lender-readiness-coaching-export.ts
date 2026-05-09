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

async function main(): Promise<void> {
  console.log("=== Task #742 — lender-ready exports use coaching headlines ===");

  await testHelperPhrases();
  testPdfSourceUsesCoachingHelper();
  testExcelSourceUsesCoachingHelper();

  for (const v of VERDICTS) {
    await testExcelRenderForVerdict(v);
    await testPdfRenderForVerdict(v);
  }

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
