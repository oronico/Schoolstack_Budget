/**
 * Task #362 regression test — 5-Year Financial Projection callouts.
 *
 * Verifies that:
 *   1. The breakeven enrollment + cushion sentence in `buildFiveYearProjection`
 *      is exposed as a structured `PacketInsight` (label "Breakeven
 *      enrollment", tone "info") instead of being appended to the section
 *      narrative.
 *   2. The prior-year revenue variance sentence is its own
 *      `PacketInsight` (label "Prior-year comparison"), with tone flipping to
 *      "warning" when the variance is large (>=20% in either direction) and
 *      "info" otherwise.
 *   3. The five-year-projection narrative no longer carries either sentence
 *      (so the PDF doesn't double-render them).
 *   4. (Task #437) The accounting-basis disclosure is now its own
 *      `PacketInsight` (label "Accounting basis"), with tone "info" when
 *      the school's books are accrual / undetermined and "warning" when
 *      they differ from accrual. The narrative no longer carries the
 *      sentence.
 *   5. All three insights flow through `generateLenderPacketPDF` and reach
 *      the rendered PDF text via the existing `drawInsightCallout` helper.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { privateSchoolWithESA } from "./sample-payloads.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// PDF text extractor mirrors the one in board-packet-cap-insight.ts.
// PDFKit emits text via both literal `(...)` strings AND `<...>` hex strings
// (the latter when TJ is used with standard fonts), so we need to handle
// both forms to reliably find the insight bodies in the rendered PDF.
function withPriorYearRevenue(totalRevenue: number) {
  // Clone privateSchoolWithESA (operating school with priorYearSnapshot already
  // wired in) and override totalRevenue so the variance lands in the
  // tone-bucket we want to assert on. Keeps every other field identical so
  // breakeven math + narrative shape stay deterministic.
  const base = JSON.parse(JSON.stringify(privateSchoolWithESA)) as Record<string, unknown>;
  const py = base.priorYearSnapshot as Record<string, unknown>;
  base.priorYearSnapshot = { ...py, totalRevenue };
  return base;
}

async function buildFiveYearSection(model: Record<string, unknown>) {
  const consultant = await runConsultantEngine(model);
  const packet = buildLenderPacket(model as unknown as ModelData, consultant, 1, "comfortable");
  return {
    packet,
    section: packet.sections.find((s) => s.id === "five_year_projection"),
  };
}

async function run() {
  // ---- 1. small variance: both insights present, prior-year tone = "info" ---
  // Year 1 projected revenue for privateSchoolWithESA lands well over $1.2M
  // already, so set prior-year revenue close to it (within 20%) for the
  // baseline "info"-tone assertion.
  const smallVarianceModel = withPriorYearRevenue(2_000_000);
  const { packet: smallPacket, section: smallSection } =
    await buildFiveYearSection(smallVarianceModel);

  check(
    "five_year_projection section is present",
    !!smallSection,
    "the section disappeared — buildFiveYearProjection wiring may be broken",
  );

  if (smallSection) {
    const insights = smallSection.insights ?? [];
    const breakeven = insights.find((i) => i.label === "Breakeven enrollment");
    const priorYear = insights.find((i) => i.label === "Prior-year comparison");

    check(
      "exposes a 'Breakeven enrollment' insight callout",
      !!breakeven,
      `insights were: ${JSON.stringify(insights)}`,
    );
    check(
      "breakeven insight uses tone='info'",
      !!breakeven && (breakeven.tone ?? "info") === "info",
      `tone was: ${breakeven?.tone ?? "(none)"}`,
    );
    check(
      "breakeven insight body names a student count and Year 1 cushion",
      !!breakeven &&
        /Breakeven enrollment is \d+ students/.test(breakeven.body) &&
        /\d+% (above|below) Year 1 enrollment/.test(breakeven.body),
      `body was: ${breakeven?.body ?? "(missing)"}`,
    );

    check(
      "exposes a 'Prior-year comparison' insight callout",
      !!priorYear,
      `insights were: ${JSON.stringify(insights)}`,
    );
    check(
      "prior-year insight body references prior-year revenue and the % change",
      !!priorYear &&
        /Prior-year revenue was \$[\d.]+[KM]?/.test(priorYear.body) &&
        /-?\d+\.\d% change/.test(priorYear.body),
      `body was: ${priorYear?.body ?? "(missing)"}`,
    );
    check(
      "small variance keeps the prior-year insight tone='info'",
      !!priorYear && (priorYear.tone ?? "info") === "info",
      `tone was: ${priorYear?.tone ?? "(none)"}`,
    );

    // Task #362 acceptance: narrative should no longer carry these
    // sentences (they would otherwise render twice — once inline, once in
    // the callout).
    check(
      "narrative no longer contains the breakeven sentence",
      !smallSection.narrative.includes("Breakeven enrollment is"),
      `narrative was: ${smallSection.narrative}`,
    );
    check(
      "narrative no longer contains the prior-year sentence",
      !smallSection.narrative.includes("Prior-year revenue was"),
      `narrative was: ${smallSection.narrative}`,
    );
    // Task #437: the accounting-basis disclosure has graduated to its own
    // callout, so it must NOT appear in the narrative anymore (otherwise
    // the PDF would render it twice — once inline, once in the callout).
    check(
      "narrative no longer contains the accounting-basis disclosure",
      !smallSection.narrative.includes("All projections are prepared on an accrual basis"),
      `narrative was: ${smallSection.narrative}`,
    );

    // Task #437: the accounting-basis insight is present, with the right
    // body text. privateSchoolWithESA does not set `accountingBasis`, so
    // currentBasis = "undetermined" and tone stays "info".
    const accountingBasis = insights.find((i) => i.label === "Accounting basis");
    check(
      "exposes an 'Accounting basis' insight callout",
      !!accountingBasis,
      `insights were: ${JSON.stringify(insights)}`,
    );
    check(
      "accounting-basis insight body names the current basis vs. accrual",
      !!accountingBasis &&
        /All projections are prepared on an accrual basis; the school currently keeps books on a .+ basis\./.test(
          accountingBasis.body,
        ),
      `body was: ${accountingBasis?.body ?? "(missing)"}`,
    );
    check(
      "accounting-basis insight tone is 'info' when basis is accrual or undetermined",
      !!accountingBasis && (accountingBasis.tone ?? "info") === "info",
      `tone was: ${accountingBasis?.tone ?? "(none)"}`,
    );
    // The break-even-year line is the original opening sentence and should
    // remain in narrative.
    check(
      "narrative still contains the break-even-year sentence",
      /reaches break-even in Year \d|does not reach break-even/.test(smallSection.narrative),
      `narrative was: ${smallSection.narrative}`,
    );
  }

  // ---- 2. large variance: prior-year tone flips to 'warning' ---------------
  // Set prior-year revenue very low so Y1 projects well over +20% growth.
  const largeUpsideModel = withPriorYearRevenue(500_000);
  const { section: largeSection } = await buildFiveYearSection(largeUpsideModel);
  const largePriorYear = largeSection?.insights?.find(
    (i) => i.label === "Prior-year comparison",
  );
  check(
    "large positive variance flips prior-year tone to 'warning'",
    !!largePriorYear && largePriorYear.tone === "warning",
    `tone was: ${largePriorYear?.tone ?? "(missing)"} body: ${largePriorYear?.body ?? ""}`,
  );

  // Set prior-year revenue very high so Y1 projects a sharp drop (<= -20%).
  const largeDropModel = withPriorYearRevenue(20_000_000);
  const { section: dropSection } = await buildFiveYearSection(largeDropModel);
  const dropPriorYear = dropSection?.insights?.find(
    (i) => i.label === "Prior-year comparison",
  );
  check(
    "large negative variance flips prior-year tone to 'warning'",
    !!dropPriorYear && dropPriorYear.tone === "warning",
    `tone was: ${dropPriorYear?.tone ?? "(missing)"} body: ${dropPriorYear?.body ?? ""}`,
  );

  // ---- 2b. Task #437: cash-basis school flips accounting-basis tone -------
  const cashBasisModel = withPriorYearRevenue(2_000_000) as Record<string, unknown>;
  const sp = (cashBasisModel.schoolProfile as Record<string, unknown> | undefined) ?? {};
  cashBasisModel.schoolProfile = { ...sp, accountingBasis: "cash" };
  const { section: cashSection } = await buildFiveYearSection(cashBasisModel);
  const cashBasisInsight = cashSection?.insights?.find(
    (i) => i.label === "Accounting basis",
  );
  check(
    "cash-basis school flips accounting-basis tone to 'warning'",
    !!cashBasisInsight && cashBasisInsight.tone === "warning",
    `tone was: ${cashBasisInsight?.tone ?? "(missing)"} body: ${cashBasisInsight?.body ?? ""}`,
  );
  check(
    "cash-basis accounting-basis body names 'cash basis'",
    !!cashBasisInsight && /keeps books on a cash basis/.test(cashBasisInsight.body),
    `body was: ${cashBasisInsight?.body ?? "(missing)"}`,
  );

  // Accrual-basis school keeps tone = "info".
  const accrualModel = withPriorYearRevenue(2_000_000) as Record<string, unknown>;
  const aSp = (accrualModel.schoolProfile as Record<string, unknown> | undefined) ?? {};
  accrualModel.schoolProfile = { ...aSp, accountingBasis: "accrual" };
  const { section: accrualSection } = await buildFiveYearSection(accrualModel);
  const accrualInsight = accrualSection?.insights?.find(
    (i) => i.label === "Accounting basis",
  );
  check(
    "accrual-basis school keeps accounting-basis tone='info'",
    !!accrualInsight && (accrualInsight.tone ?? "info") === "info",
    `tone was: ${accrualInsight?.tone ?? "(missing)"} body: ${accrualInsight?.body ?? ""}`,
  );

  // ---- 3. PDF round-trip: both labels reach the rendered lender PDF --------
  const pdfBuffer = await generateLenderPacketPDF(smallPacket);
  check("lender PDF builds without error", pdfBuffer.length > 0);
  const pdfText = extractPdfText(pdfBuffer);
  check(
    "rendered lender PDF contains the 'Breakeven enrollment' callout label",
    pdfText.includes("Breakeven enrollment"),
    "label missing from PDF — five_year_projection insights aren't being rendered by lender-packet-pdf",
  );
  check(
    "rendered lender PDF contains the 'Prior-year comparison' callout label",
    pdfText.includes("Prior-year comparison"),
    "label missing from PDF — five_year_projection insights aren't being rendered by lender-packet-pdf",
  );
  check(
    "rendered lender PDF contains the 'Accounting basis' callout label",
    pdfText.includes("Accounting basis"),
    "label missing from PDF — five_year_projection insights aren't being rendered by lender-packet-pdf",
  );

  // ---- summary -------------------------------------------------------------
  console.log(`\nlender-five-year-callouts: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
