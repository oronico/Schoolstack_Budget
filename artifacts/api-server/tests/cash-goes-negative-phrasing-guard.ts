/**
 * Task #938 — Regression guard against the legacy "Cash goes negative
 * in month X" phrasing.
 *
 * Task #909 removed the misleading copy that conflated `cashRunwayMonths`
 * (a duration) with a month index, producing nonsense like "Cash goes
 * negative in month 1.9". The correct phrasing names a specific
 * fiscal month + year (e.g. "Cash first goes negative in Year 1 (Sep)")
 * and is driven off `min(cumulative_cash_by_month) < 0` rather than
 * monthly net cash flow.
 *
 * This test renders the five major founder-facing packet outputs for
 * each of the three seeded demo archetypes and asserts that none of
 * the rendered text contains the legacy substring (or close variants).
 * It complements `cash-goes-negative-flag.ts`, which exercises the
 * health-signal generator in isolation; this one closes the loop at
 * the rendered-output level so a future copy change anywhere in the
 * pipeline (consultant engine, packet builder, PDF renderer, narrative
 * commentary, decision-comparison renderer) cannot reintroduce the
 * banned phrasing without tripping CI.
 *
 * Hermetic: no DB, no network, no env vars.
 */
import { runConsultantEngine, computeYearFinancialsFromData, type YearFinancials } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { generateProFormaPDF } from "../src/lib/pdf-proforma.js";
import { generateLoanReadinessPDF } from "../src/lib/pdf-loan-readiness.js";
import {
  generateDecisionComparisonPDF,
  type DecisionComparisonRequest,
  type SerializedDecisionImpact,
  type SerializedScenarioMetrics,
} from "../src/lib/decision-comparison-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { extractPdfFragments } from "./_pdf-text-snapshot-util.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

// Banned substrings (case-insensitive). The PDF extractor returns one
// entry per PDFKit string literal, and PDFKit frequently splits a
// single visible word across multiple literals for kerning. We
// therefore concatenate all fragments per archetype and run the regex
// on the joined text, mirroring how a human reader would scan the
// rendered output.
//
//  - `goes negative in month`  catches the canonical regression copy
//    as well as the dynamic "...in month N" variant. The current,
//    correct phrasing uses "in Year N (MonthLabel)", which does not
//    contain "in month", so this is safe against the valid wording.
//  - `cash goes negative in`   catches any variant that drops "month"
//    but keeps the misleading "Cash goes negative in <something>"
//    framing tied to a runway number.
const BANNED: { label: string; re: RegExp }[] = [
  { label: "'goes negative in month' (Task #909)", re: /goes negative in month/i },
  { label: "'Cash goes negative in <N>' duration-as-index", re: /cash goes negative in \d/i },
];

interface Archetype {
  label: string;
  model: typeof MICROSCHOOL_MODEL;
}

const ARCHETYPES: Archetype[] = [
  { label: "microschool",    model: MICROSCHOOL_MODEL },
  { label: "private_school", model: PRIVATE_SCHOOL_MODEL },
  { label: "charter_school", model: CHARTER_SCHOOL_MODEL },
];

function check(label: string, joined: string): void {
  for (const ban of BANNED) {
    if (ban.re.test(joined)) {
      failed++;
      // Show a 60-char window around the match so the failure points
      // at the offending sentence rather than dumping the whole PDF.
      const m = joined.match(ban.re);
      const idx = m?.index ?? 0;
      const ctx = joined.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, " ");
      failures.push(`  FAIL: ${label} contains banned ${ban.label}\n         …${ctx}…`);
      return;
    }
  }
  passed++;
  console.log(`  ✓ ${label}`);
}

// ── Decision-comparison: deterministic impact, mirrored from
// `decision-comparison-text-snapshot.ts`. The semantics don't matter
// here; we just need a populated request so the renderer emits real
// callout text for the guard to scan.
function metricsFromFinancials(years: YearFinancials[]): SerializedScenarioMetrics {
  const padded: YearFinancials[] = years.slice(0, 5);
  while (padded.length < 5) {
    padded.push({
      year: padded.length + 1, students: 0, totalRevenue: 0, tuitionRevenue: 0,
      publicRevenue: 0, philanthropyRevenue: 0, totalStaffingCost: 0,
      facilityCost: 0, totalOpex: 0, debtService: 0, totalExpenses: 0,
      netIncome: 0, netMargin: 0, depreciation: 0, projectedAR: 0,
    });
  }
  const revenue = padded.map((y) => y.totalRevenue);
  const netIncome = padded.map((y) => y.netIncome);
  const netMargin = padded.map((y) => (y.totalRevenue > 0 ? y.netIncome / y.totalRevenue : 0));
  const dscr = padded.map((y) => (y.debtService > 0 ? (y.netIncome + y.debtService) / y.debtService : 0));
  let cum = 0;
  let breakEvenYear: number | null = null;
  for (let i = 0; i < padded.length; i++) {
    cum += padded[i].netIncome;
    if (breakEvenYear === null && cum > 0) breakEvenYear = i + 1;
  }
  const y1Net = padded[0].netIncome;
  const monthlyBurn = y1Net < 0 ? -y1Net / 12 : 0;
  const runway = monthlyBurn > 0 ? Math.min(60, 250_000 / monthlyBurn) : 60;
  return { revenue, netIncome, netMargin, dscr, breakEvenYear, cashRunwayMonths: runway };
}

function adjustMetrics(base: SerializedScenarioMetrics, revMul: number, expDelta: number, runwayDelta: number): SerializedScenarioMetrics {
  const revenue = base.revenue.map((r) => r * revMul);
  const netIncome = base.netIncome.map((n, i) => n + base.revenue[i] * (revMul - 1) - expDelta);
  const netMargin = revenue.map((r, i) => (r > 0 ? netIncome[i] / r : 0));
  const dscr = base.dscr.map((d, i) => {
    const baseN = base.netIncome[i];
    if (!isFinite(d) || d === 0 || baseN === 0) return d;
    return d * (netIncome[i] / baseN);
  });
  let cum = 0;
  let breakEvenYear: number | null = null;
  for (let i = 0; i < netIncome.length; i++) {
    cum += netIncome[i];
    if (breakEvenYear === null && cum > 0) breakEvenYear = i + 1;
  }
  return {
    revenue, netIncome, netMargin, dscr, breakEvenYear,
    cashRunwayMonths: Math.max(0, Math.min(60, base.cashRunwayMonths + runwayDelta)),
  };
}

function buildImpact(base: SerializedScenarioMetrics, adjusted: SerializedScenarioMetrics, nudges: SerializedDecisionImpact["nudges"]): SerializedDecisionImpact {
  const beShift =
    adjusted.breakEvenYear !== null && base.breakEvenYear !== null
      ? adjusted.breakEvenYear - base.breakEvenYear
      : adjusted.breakEvenYear === base.breakEvenYear ? 0 : null;
  return {
    base, adjusted,
    deltas: {
      revenue: adjusted.revenue.map((r, i) => r - base.revenue[i]),
      netIncome: adjusted.netIncome.map((n, i) => n - base.netIncome[i]),
      breakEvenYearShift: beShift,
      cashRunwayDeltaMonths: adjusted.cashRunwayMonths - base.cashRunwayMonths,
    },
    nudges,
  };
}

function buildComparisonRequest(schoolName: string, data: Record<string, unknown>): DecisionComparisonRequest {
  const base = metricsFromFinancials(computeYearFinancialsFromData(data));
  const primary = adjustMetrics(base, 1.05, 25_000, -2);
  const compare = adjustMetrics(base, 0.98, -40_000, 4);
  return {
    schoolName,
    primary: {
      label: "Lease the annex on Birch St.",
      decisionLabel: "Evaluate a site",
      narrative: "Adds the annex classroom block in Y1; assumes 5% enrollment lift offset by $25k/yr in rent + utilities.",
      impact: buildImpact(base, primary, [
        { signal: "amber", label: "Lease covenant", message: "Confirm landlord allows mid-year occupancy before signing." },
      ]),
    },
    compare: {
      label: "Defer expansion, trim opex.",
      decisionLabel: "Adjust budget",
      narrative: "Holds enrollment flat (-2%) and removes one classified position; saves ~$40k/yr in payroll & benefits.",
      impact: buildImpact(base, compare, [
        { signal: "green", label: "Healthy runway", message: "Cuts extend reserve coverage past 24 months in Y1." },
      ]),
    },
  };
}

function joinedTextFromPdf(pdf: Buffer): string {
  // Strip the PAGE markers added by extractPdfFragments — they would
  // never trigger the regex but are noise when we dump context on
  // failure.
  return extractPdfFragments(pdf)
    .filter((s) => !s.startsWith("--- PAGE "))
    .join(" ");
}

async function runArchetype(a: Archetype): Promise<void> {
  const data = a.model.data as unknown as Record<string, unknown>;
  const schoolName =
    (data as { schoolProfile?: { schoolName?: string } }).schoolProfile?.schoolName
    ?? a.label;
  const entityType = (data as { schoolProfile?: { entityType?: string } }).schoolProfile?.entityType;

  const consultant = await runConsultantEngine(data);

  // Lender packet PDF
  {
    const packet = buildLenderPacket(data as Parameters<typeof buildLenderPacket>[0], consultant, 0);
    (packet as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
    const pdf = await generateLenderPacketPDF(packet);
    check(`[${a.label}] lender packet PDF clean of banned phrasing`, joinedTextFromPdf(pdf));
  }

  // Board packet PDF
  {
    const packet = buildBoardPacket(data as Parameters<typeof buildBoardPacket>[0], consultant, 0);
    (packet as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
    const pdf = await generateBoardPacketPDF(packet);
    check(`[${a.label}] board packet PDF clean of banned phrasing`, joinedTextFromPdf(pdf));
  }

  // Pro-forma PDF
  {
    const pdf = await generateProFormaPDF(data);
    check(`[${a.label}] pro-forma PDF clean of banned phrasing`, joinedTextFromPdf(pdf));
  }

  // Loan-readiness PDF
  {
    const pdf = await generateLoanReadinessPDF(consultant, schoolName, entityType);
    check(`[${a.label}] loan-readiness PDF clean of banned phrasing`, joinedTextFromPdf(pdf));
  }

  // Decision-comparison PDF
  {
    const request = buildComparisonRequest(schoolName, data);
    const pdf = await generateDecisionComparisonPDF(request);
    check(`[${a.label}] decision-comparison PDF clean of banned phrasing`, joinedTextFromPdf(pdf));
  }
}

async function main(): Promise<void> {
  for (const a of ARCHETYPES) {
    await runArchetype(a);
  }
  console.log(`cash-goes-negative-phrasing-guard: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("cash-goes-negative-phrasing-guard: unexpected error", err);
  process.exit(1);
});
