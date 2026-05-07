/**
 * Task #660 - Guard test for the plain-English founder summary builder.
 *
 * Mirrors the contract enforced by build-narrative-commentary.test.ts:
 *
 *   1. Builds the summary off a real consultant-engine run (no mocks).
 *   2. Tokenises every figure that appears in the prose and asserts it
 *      lives on `summary.allowedFigures`. Any hallucinated number fails
 *      the test loud-and-clear.
 *   3. Asserts coach voice rules: no em-dashes, no banned verdict words.
 *   4. Asserts the six canonical section IDs are present in order.
 */
import { runConsultantEngine } from "../../consultant-engine.js";
import { buildFounderSummary } from "../build-founder-summary.js";
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

function extractFigures(text: string): string[] {
  const out: string[] = [];
  const currencyRe = /\(?\$\d[\d,]*(?:\.\d+)?\)?/g;
  const percentRe = /\d+(?:\.\d+)?%/g;
  const ratioRe = /-?\d+(?:\.\d+)?x\b/gi;
  const yearRe = /Year\s+\d+/g;
  const monthsRe = /\d+\s+months\b/g;

  for (const re of [currencyRe, percentRe, ratioRe, yearRe, monthsRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(m[0]);
  }

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

const BANNED_WORDS = [
  "approved",
  "declined",
  "failed",
  "rejected",
  "rejection",
  "ineligible",
];

/** Low-cash fixture: short runway + small starting cash + thin margin. */
function buildLowCashModel(): Record<string, unknown> {
  const m = buildModel();
  (m as { openingBalances: { cash: number } }).openingBalances.cash = 5_000;
  // Halve the enrollment so revenue is too thin to cover staff + rent.
  (m as { enrollment: Record<string, number> }).enrollment.year1 = 4;
  return m;
}

/** Missing-founder-comp fixture: no founder/leadership salary line. */
function buildNoFounderCompModel(): Record<string, unknown> {
  const m = buildModel();
  (m as { staffingRows: unknown[] }).staffingRows = [];
  return m;
}

async function run(): Promise<void> {
  const model = buildModel();
  const consultantOutput = await runConsultantEngine(model);
  const summary = buildFounderSummary(model as ModelData, consultantOutput);

  // ── Shape ─────────────────────────────────────────────────────────────
  check("summary.schoolName matches", summary.schoolName === "Acme Microschool");
  check("summary.generatedAt parses as a date", !Number.isNaN(Date.parse(summary.generatedAt)));
  check("summary has six sections", summary.sections.length === 6, `got ${summary.sections.length}`);

  const expectedIds = [
    "what_your_model_says",
    "what_looks_strong",
    "what_needs_clarity",
    "what_could_create_cash_pressure",
    "what_to_fix_first",
    "what_reviewers_may_ask",
  ];
  for (let i = 0; i < expectedIds.length; i++) {
    check(
      `section[${i}] id is ${expectedIds[i]}`,
      summary.sections[i]?.id === expectedIds[i],
      `got ${summary.sections[i]?.id}`,
    );
  }

  // Each section has at least one paragraph.
  for (const s of summary.sections) {
    check(
      `section ${s.id} has at least one paragraph`,
      s.paragraphs.length >= 1 && s.paragraphs.every((p) => typeof p === "string" && p.length > 0),
    );
  }

  // ── Coach-voice rules ─────────────────────────────────────────────────
  const fullText = summary.sections
    .flatMap((s) => [...s.paragraphs, ...(s.bullets || [])])
    .join("\n");
  check(
    "no em-dashes (banned style)",
    !fullText.includes("\u2014") && !fullText.includes("\u2013"),
    `text contained em-dash: ${JSON.stringify(fullText.slice(0, 200))}`,
  );

  const lower = fullText.toLowerCase();
  for (const w of BANNED_WORDS) {
    check(
      `banned word "${w}" not present`,
      !new RegExp(`\\b${w}\\b`).test(lower),
      `found "${w}" in summary text`,
    );
  }

  // ── Figure-authorization guard ────────────────────────────────────────
  const allowed = new Set(summary.allowedFigures);
  const figures = extractFigures(fullText);
  const unauthorized = figures.filter((f) => !allowed.has(f));
  check(
    "every numeric figure is on the allowed list",
    unauthorized.length === 0,
    unauthorized.length === 0
      ? ""
      : `unauthorized figures: ${JSON.stringify(unauthorized)}; allowed: ${JSON.stringify([...allowed])}`,
  );
  check("allowedFigures is non-empty", summary.allowedFigures.length > 0);
  check(
    "summary.bundle is the same canonical bundle shape used by lender/board commentary",
    summary.bundle.schoolName === "Acme Microschool" &&
      summary.bundle.cashRunwayMonths === consultantOutput.cashRunwayMonths,
  );

  // ── Reviewer-question count is in the required 5-8 range ─────────────
  const reviewer = summary.sections.find((s) => s.id === "what_reviewers_may_ask");
  const qCount = reviewer?.bullets?.length ?? 0;
  check(
    "reviewer questions count is in the required 5..8 range (default fixture)",
    qCount >= 5 && qCount <= 8,
    `got ${qCount}`,
  );

  // ── Fix-first comes from canonical flags, ordered by impact ──────────
  const fixFirst = summary.sections.find((s) => s.id === "what_to_fix_first");
  const fixBullets = fixFirst?.bullets || [];
  check(
    "fix-first has at most 6 bullets (cap)",
    fixBullets.length <= 6,
    `got ${fixBullets.length}`,
  );
  // If the engine produced any flags, every cash-impact flag must come
  // before any sustainability / polish flag in the rendered list.
  const flags = consultantOutput.assumptionFlags || [];
  if (flags.length > 0 && fixBullets.length > 0) {
    const cashImpactTypes = new Set([
      "litigated_funding", "pending_funding", "low_retention",
      "negative_cash_runway", "dscr_below_covenant",
      "negative_operating_cash", "operating_loss_year_one",
    ]);
    const isCashImpact = (fl: { severity: string; flagType: string }) =>
      fl.severity === "critical" || cashImpactTypes.has(fl.flagType);
    const cashFlags = flags.filter(isCashImpact);
    if (cashFlags.length > 0 && flags.length > cashFlags.length) {
      // First bullet must originate from a cash-impact flag (look for
      // any cash-impact field name in the bullet text).
      const firstBullet = fixBullets[0]?.toLowerCase() || "";
      const matched = cashFlags.some((fl) =>
        firstBullet.includes(fl.field.toLowerCase().replace(/_/g, " ")) ||
        firstBullet.includes(fl.flagType.replace(/_/g, " ")),
      );
      check(
        "fix-first first bullet is a cash-impact flag",
        matched,
        `firstBullet=${firstBullet.slice(0, 120)}; cash flags=${cashFlags.map((f) => f.flagType).join(",")}`,
      );
    }
  }

  // ── Fixture: low-cash model still yields a valid summary ─────────────
  const lowCashModel = buildLowCashModel();
  const lowCashCO = await runConsultantEngine(lowCashModel);
  const lowCashSummary = buildFounderSummary(lowCashModel as ModelData, lowCashCO);
  const lowText = lowCashSummary.sections
    .flatMap((s) => [...s.paragraphs, ...(s.bullets || [])])
    .join("\n");
  check(
    "low-cash fixture: summary has six sections",
    lowCashSummary.sections.length === 6,
  );
  check(
    "low-cash fixture: no em-dashes",
    !lowText.includes("\u2014") && !lowText.includes("\u2013"),
  );
  for (const w of BANNED_WORDS) {
    check(
      `low-cash fixture: banned word "${w}" not present`,
      !new RegExp(`\\b${w}\\b`).test(lowText.toLowerCase()),
    );
  }
  const lowAllowed = new Set(lowCashSummary.allowedFigures);
  const lowUnauthorized = extractFigures(lowText).filter((f) => !lowAllowed.has(f));
  check(
    "low-cash fixture: every numeric figure is on the allowed list",
    lowUnauthorized.length === 0,
    `unauthorized: ${JSON.stringify(lowUnauthorized)}`,
  );
  const lowReviewer = lowCashSummary.sections.find(
    (s) => s.id === "what_reviewers_may_ask",
  );
  const lowQCount = lowReviewer?.bullets?.length ?? 0;
  check(
    "low-cash fixture: reviewer questions count is in 5..8",
    lowQCount >= 5 && lowQCount <= 8,
    `got ${lowQCount}`,
  );

  // ── Fixture: missing-founder-comp model still yields a valid summary ─
  const noCompModel = buildNoFounderCompModel();
  const noCompCO = await runConsultantEngine(noCompModel);
  const noCompSummary = buildFounderSummary(noCompModel as ModelData, noCompCO);
  const noCompText = noCompSummary.sections
    .flatMap((s) => [...s.paragraphs, ...(s.bullets || [])])
    .join("\n");
  check(
    "no-founder-comp fixture: summary has six sections",
    noCompSummary.sections.length === 6,
  );
  check(
    "no-founder-comp fixture: no em-dashes",
    !noCompText.includes("\u2014") && !noCompText.includes("\u2013"),
  );
  const noCompAllowed = new Set(noCompSummary.allowedFigures);
  const noCompUnauthorized = extractFigures(noCompText).filter(
    (f) => !noCompAllowed.has(f),
  );
  check(
    "no-founder-comp fixture: every numeric figure is on the allowed list",
    noCompUnauthorized.length === 0,
    `unauthorized: ${JSON.stringify(noCompUnauthorized)}`,
  );
  const noCompReviewer = noCompSummary.sections.find(
    (s) => s.id === "what_reviewers_may_ask",
  );
  const noCompQCount = noCompReviewer?.bullets?.length ?? 0;
  check(
    "no-founder-comp fixture: reviewer questions count is in 5..8",
    noCompQCount >= 5 && noCompQCount <= 8,
    `got ${noCompQCount}`,
  );

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
