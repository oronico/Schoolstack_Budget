/**
 * Task #615 — Snapshot test for the Lender Summary data contract +
 * smoke render test for the one-page PDF.
 *
 * The data-contract assertions exist so a future refactor of the
 * canonical engine, ConsultantOutput, or the wizard's assumption
 * registry cannot silently break the lender packet's leading page
 * (which lenders see first). The render test catches PDF
 * regressions that would prevent the buffer from being produced at
 * all.
 */
import PDFDocument from "pdfkit";
import { runConsultantEngine } from "../../consultant-engine.js";
import {
  buildLenderSummary,
  type LenderSummaryData,
} from "../build-lender-summary.js";
import { drawLenderSummaryPage } from "../lender-summary-pdf.js";
import type { ModelData } from "../../workbook-helpers.js";
import { ASSUMPTION_REGISTRY } from "@workspace/finance";

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

async function run(): Promise<void> {
  const model = buildModel();
  const consultantOutput = await runConsultantEngine(model);
  const summary: LenderSummaryData = buildLenderSummary(
    model as ModelData,
    consultantOutput,
  );

  // ── 1. Top-level data contract ───────────────────────────────────────
  check("schoolName matches schoolProfile", summary.schoolName === "Acme Microschool");
  check(
    "verdict.status is one of the canonical readiness labels",
    summary.verdict.status === "Strong" ||
      summary.verdict.status === "Needs Work" ||
      summary.verdict.status === "Not Yet Ready",
    `got: ${summary.verdict.status}`,
  );
  check(
    "verdict.line is a non-empty single-line string",
    summary.verdict.line.length > 0 && !summary.verdict.line.includes("\n"),
    `verdict.line was: ${JSON.stringify(summary.verdict.line)}`,
  );

  // ── 2. DSCR by year — five entries from the canonical engine ─────────
  check(
    "dscrByYear has five entries (Y1-Y5)",
    summary.dscrByYear.length === 5,
    `got ${summary.dscrByYear.length}`,
  );
  check(
    "dscrByYear years are 1..5 in order",
    summary.dscrByYear.every((d, i) => d.year === i + 1),
  );
  check(
    "dscrByYear values are numeric or null (no NaN)",
    summary.dscrByYear.every(
      (d) => d.dscr === null || (typeof d.dscr === "number" && Number.isFinite(d.dscr)),
    ),
    `dscrByYear was ${JSON.stringify(summary.dscrByYear)}`,
  );
  // Task #615 — planned + normalized DSCR series (founder-comp normalization).
  check(
    "dscrByYear carries both planned and normalized series",
    summary.dscrByYear.every(
      (d) =>
        (d.planned === null || Number.isFinite(d.planned)) &&
        (d.normalized === null || Number.isFinite(d.normalized)),
    ),
    `dscrByYear was ${JSON.stringify(summary.dscrByYear)}`,
  );
  check(
    "planned DSCR matches consultant.normalizedView.reported.dscr",
    consultantOutput.normalizedView != null &&
      summary.dscrByYear.every(
        (d, i) =>
          d.planned ===
          (Number.isFinite(consultantOutput.normalizedView.reported.dscr[i])
            ? consultantOutput.normalizedView.reported.dscr[i]
            : null),
      ),
  );
  check(
    "normalized DSCR matches consultant.normalizedView.normalized.dscr",
    consultantOutput.normalizedView != null &&
      summary.dscrByYear.every(
        (d, i) =>
          d.normalized ===
          (Number.isFinite(consultantOutput.normalizedView.normalized.dscr[i])
            ? consultantOutput.normalizedView.normalized.dscr[i]
            : null),
      ),
  );
  check(
    "back-compat: dscrByYear[i].dscr equals planned",
    summary.dscrByYear.every((d) => d.dscr === d.planned),
  );

  // ── 3. Cash runway — pulled from ConsultantOutput.cashRunwayMonths ──
  check(
    "cashRunwayMonths equals the consultant engine value",
    summary.cashRunwayMonths === consultantOutput.cashRunwayMonths,
    `summary=${summary.cashRunwayMonths} consultant=${consultantOutput.cashRunwayMonths}`,
  );

  // ── 4. Break-even + utilization — five entries ──────────────────────
  check("breakEven has five entries", summary.breakEven.length === 5);
  check(
    "breakEven utilization is null or in [0, ~5] range (sane bounds)",
    summary.breakEven.every(
      (b) => b.utilization === null || (b.utilization >= 0 && b.utilization < 10),
    ),
    `breakEven was ${JSON.stringify(summary.breakEven)}`,
  );
  check(
    "maxCapacity reflects schoolProfile.maxCapacity",
    summary.maxCapacity === 30,
    `got ${summary.maxCapacity}`,
  );

  // ── 5. Revenue quality mix — sourced from ConsultantOutput Y1 rollup ─
  const totalPct =
    summary.revenueQualityY1.contractedPct +
    summary.revenueQualityY1.projectedPct +
    summary.revenueQualityY1.donorDependentPct +
    summary.revenueQualityY1.policyDependentPct;
  // pctByBucket is a fraction in [0, 1] from the canonical engine.
  check(
    "revenueQualityY1 buckets sum to ~1 (or 0 when no revenue)",
    totalPct === 0 || (totalPct > 0.995 && totalPct < 1.005),
    `total was ${totalPct}`,
  );

  // ── 6. Top risks — at most 3, paired with mitigants from engine ─────
  check("topRisks length is 0..3", summary.topRisks.length <= 3);
  check(
    "every topRisk has a non-empty risk + mitigant string",
    summary.topRisks.every(
      (r) =>
        r.risk.length > 0 &&
        r.mitigant.length > 0 &&
        (r.severity === "critical" || r.severity === "high" || r.severity === "medium"),
    ),
    `topRisks was ${JSON.stringify(summary.topRisks)}`,
  );

  // ── 7. Key assumptions — 6 to 8, every entry traceable to a step ────
  check(
    "keyAssumptions has 6-8 entries",
    summary.keyAssumptions.length >= 6 && summary.keyAssumptions.length <= 8,
    `got ${summary.keyAssumptions.length}`,
  );
  check(
    "every keyAssumption carries a label, value, stepNumber, stepTitle",
    summary.keyAssumptions.every(
      (a) =>
        a.label.length > 0 &&
        a.value.length > 0 &&
        typeof a.stepNumber === "number" &&
        a.stepTitle.length > 0,
    ),
  );
  check(
    "every keyAssumption.stepTitle matches ASSUMPTION_REGISTRY for that key",
    summary.keyAssumptions.every(
      (a) => ASSUMPTION_REGISTRY[a.key]?.stepTitle === a.stepTitle,
    ),
  );

  // ── 8. PDF render test — the one-pager must produce a non-empty buffer
  //     without throwing, on the very first page (letter portrait).
  const renderOk = await renderOnePagerSmoke(summary);
  check("drawLenderSummaryPage produces a non-empty PDF buffer", renderOk.success);
  check(
    "drawLenderSummaryPage stays on the first page (no auto-paginate)",
    renderOk.pageCount === 1,
    `pageCount was ${renderOk.pageCount}`,
  );

  // ── summary ─────────────────────────────────────────────────────────
  console.log(`\nbuild-lender-summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

async function renderOnePagerSmoke(
  data: LenderSummaryData,
): Promise<{ success: boolean; pageCount: number }> {
  return new Promise((resolve) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      let capturedPageCount = 0;
      doc.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ success: buf.length > 1000, pageCount: capturedPageCount });
      });
      drawLenderSummaryPage(doc, data);
      // bufferedPageRange() must be read before doc.end() flushes the buffer.
      capturedPageCount = doc.bufferedPageRange().count;
      doc.end();
    } catch (e) {
      console.error("render error:", e);
      resolve({ success: false, pageCount: 0 });
    }
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
