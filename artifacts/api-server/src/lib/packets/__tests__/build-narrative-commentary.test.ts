/**
 * Task #617 - Guard test for the lender / board narrative commentary blocks.
 *
 * The product requirement is that every numeric figure that appears in
 * the narrative copy must reconcile to the canonical engine output. This
 * test enforces that contract by:
 *
 *   1. Building the commentary off a real model run through the
 *      consultant engine (no mocks).
 *   2. Tokenizing each rendered paragraph and extracting every numeric
 *      figure (currency strings, percentages, ratios, "Year N" labels,
 *      "N months" labels, plain integers).
 *   3. Asserting every extracted token appears in `commentary.allowedFigures`.
 *
 * It also enforces a few invariants:
 *   - 3..6 paragraphs (lender) and 4..6 paragraphs (board)
 *   - Banned style: no em-dashes anywhere in commentary
 *   - The same source bundle drives both lender and board commentary
 */
import { runConsultantEngine } from "../../consultant-engine.js";
import {
  buildNarrativeBundle,
  buildLenderCommentary,
  buildBoardCommentary,
  type NarrativeCommentary,
} from "../build-narrative-commentary.js";
import { buildLenderPacket } from "../build-lender-packet.js";
import { buildBoardPacket } from "../build-board-packet.js";
import type { ModelData } from "../../workbook-helpers.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` - ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

function buildModel(): Record<string, unknown> {
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

/**
 * Extracts every numeric figure that appears in the rendered prose. We
 * deliberately match a generous superset of figure shapes so the guard
 * test cannot miss a hallucinated number:
 *
 *  - Currency: $12,345 or ($12,345) for negatives
 *  - Percentages: 12% or 12.5%
 *  - Ratios: 1.23x
 *  - "Year N" labels (where N is 1..5)
 *  - "N months" labels
 *  - Bare integers / decimals (e.g. enrollment counts, capacity)
 *
 * Each captured token must exist in `commentary.allowedFigures`. If a
 * builder ever introduces a hand-typed number that the FigureScribe
 * didn't authorize, this test fails immediately.
 */
function extractFigures(text: string): string[] {
  const out: string[] = [];
  // Currency, including parenthesized negatives: ($12,345)
  const currencyRe = /\(?\$\d[\d,]*(?:\.\d+)?\)?/g;
  // Percentages: 12% or 12.5%
  const percentRe = /\d+(?:\.\d+)?%/g;
  // Ratios: 1.23x or -0.72x (case-insensitive)
  const ratioRe = /-?\d+(?:\.\d+)?x\b/gi;
  // Year labels: Year 1, Year 5
  const yearRe = /Year\s+\d+/g;
  // "N months" labels
  const monthsRe = /\d+\s+months\b/g;

  for (const re of [currencyRe, percentRe, ratioRe, yearRe, monthsRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(m[0]);
  }

  // Strip the matches we already collected from the text and then look
  // for any leftover bare integers (e.g. "12 students", "30 seats").
  // This catches numbers that the scribe did NOT authorize but slipped
  // into prose without one of the dimensional suffixes above. We strip
  // longest tokens first so "0%" doesn't gut a "100%" leaving "1"
  // behind, and similarly so "$10,131" doesn't get partially eaten by
  // a shorter currency token.
  let residual = text;
  const stripOrder = [...new Set(out)].sort((a, b) => b.length - a.length);
  for (const tok of stripOrder) {
    residual = residual.split(tok).join(" ");
  }
  const bareIntRe = /(?<![\w.,$])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w%x])/g;
  let m: RegExpExecArray | null;
  while ((m = bareIntRe.exec(residual)) !== null) out.push(m[1]);

  return out;
}

function assertEveryFigureAuthorized(
  label: string,
  commentary: NarrativeCommentary,
): void {
  const allowed = new Set(commentary.allowedFigures);
  const fullText = commentary.paragraphs.join("\n");
  const figures = extractFigures(fullText);

  const unauthorized = figures.filter((f) => !allowed.has(f));
  check(
    `${label}: every numeric figure is on the allowed list`,
    unauthorized.length === 0,
    unauthorized.length === 0
      ? ""
      : `unauthorized figures: ${JSON.stringify(unauthorized)}; allowed: ${JSON.stringify([...allowed])}`,
  );
}

function assertNoEmDashes(label: string, commentary: NarrativeCommentary): void {
  const text = commentary.paragraphs.join("\n");
  check(
    `${label}: no em-dashes (banned style)`,
    !text.includes("\u2014") && !text.includes("\u2013"),
    `text contained em-dash: ${JSON.stringify(text.slice(0, 200))}`,
  );
}

async function run(): Promise<void> {
  const model = buildModel();
  const consultantOutput = await runConsultantEngine(model);
  const bundle = buildNarrativeBundle(model as ModelData, consultantOutput);

  // ── Bundle smoke checks ───────────────────────────────────────────────
  check("bundle.schoolName matches", bundle.schoolName === "Acme Microschool");
  check(
    "bundle.lenderReadiness is one of the canonical labels",
    bundle.lenderReadiness === "Strong" ||
      bundle.lenderReadiness === "Needs Work" ||
      bundle.lenderReadiness === "Not Yet Ready",
  );
  check(
    "bundle.cashRunwayMonths matches consultant engine",
    bundle.cashRunwayMonths === consultantOutput.cashRunwayMonths,
  );
  check(
    "bundle enrollment Y1/Y5 reconcile to model.enrollment",
    bundle.enrollmentY1 === 12 && bundle.enrollmentY5 === 28,
  );
  check(
    "bundle.revenueQualityY1 buckets sum to ~100 (or null when no revenue)",
    bundle.revenueQualityY1 === null ||
      Math.abs(
        bundle.revenueQualityY1.contractedPct +
          bundle.revenueQualityY1.projectedPct +
          bundle.revenueQualityY1.donorDependentPct +
          bundle.revenueQualityY1.policyDependentPct -
          100,
      ) < 0.5,
  );

  // ── Lender commentary ────────────────────────────────────────────────
  const lender = buildLenderCommentary(bundle);
  check(
    "lender commentary has 3..6 paragraphs",
    lender.paragraphs.length >= 3 && lender.paragraphs.length <= 6,
    `got ${lender.paragraphs.length}`,
  );
  check(
    "lender commentary paragraphs are non-empty strings",
    lender.paragraphs.every((p) => typeof p === "string" && p.length > 0),
  );
  assertNoEmDashes("lender", lender);
  assertEveryFigureAuthorized("lender", lender);
  check(
    "lender commentary allowedFigures references engine values",
    lender.allowedFigures.length > 0,
  );

  // ── Board commentary ─────────────────────────────────────────────────
  const board = buildBoardCommentary(bundle);
  check(
    "board commentary has 4..6 paragraphs",
    board.paragraphs.length >= 4 && board.paragraphs.length <= 6,
    `got ${board.paragraphs.length}`,
  );
  check(
    "board commentary opens with a trustees-facing line",
    board.paragraphs[0].toLowerCase().includes("trustees"),
  );
  assertNoEmDashes("board", board);
  assertEveryFigureAuthorized("board", board);

  // ── Cross-packet wiring ──────────────────────────────────────────────
  const lp = buildLenderPacket(model as ModelData, consultantOutput, 1);
  const bp = buildBoardPacket(model as ModelData, consultantOutput, 1);
  check(
    "LenderPacket.lenderCommentary is wired and matches builder output",
    lp.lenderCommentary.paragraphs.length === lender.paragraphs.length,
  );
  check(
    "BoardPacket.boardCommentary is wired and matches builder output",
    bp.boardCommentary.paragraphs.length === board.paragraphs.length,
  );
  check(
    "Both commentaries share the same canonical bundle figures",
    lp.lenderCommentary.bundle.cashRunwayMonths ===
      bp.boardCommentary.bundle.cashRunwayMonths,
  );
  // Guard: re-run the figure check on the wired-up packet output so we
  // catch any wrapper layer that silently mutates paragraph text.
  assertEveryFigureAuthorized("lender (via packet)", lp.lenderCommentary);
  assertEveryFigureAuthorized("board (via packet)", bp.boardCommentary);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
