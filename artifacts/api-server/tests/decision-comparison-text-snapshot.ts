/**
 * Task #901 — Decision-comparison PDF text-rendering snapshot tests.
 *
 * Sibling of `lender-pdf-text-snapshot.ts` (Task #893 / #895) and
 * `board-packet-text-snapshot.ts` (Task #899). The decision-comparison
 * PDF previously had only `decision-comparison-pdf-route.ts` covering
 * its route/auth surface, with a fixed inline payload. A formatter
 * regression on a multi-loan cap table, a restricted-gift-heavy
 * revenue mix, a mid-cycle capital campaign, or a stacked voucher +
 * scholarship cohort in the comparison renderer would still slip past
 * CI.
 *
 * This test reuses the founder-shaped fixtures from
 * `tests/fixtures/lender-pdf-fixtures.ts` (multi_debt_stack,
 * restricted_gifts_heavy, capital_campaign_mid_cycle,
 * voucher_scholarship_combo) plus the three seeded demo personas
 * (microschool / private / charter). For each fixture we derive a
 * deterministic `SerializedDecisionImpact` pair (A = +5% revenue
 * scenario, B = -8% opex scenario) from the fixture's own
 * `computeYearFinancialsFromData` output, so each fixture's
 * per-literal snapshot covers a different set of $K / $M fragments,
 * different DSCR cells, different break-even shifts, and different
 * cash-runway deltas. A formatter change (e.g. "$166K" → "$0.2M",
 * "+5.0%" → "+5%", "Same" → "0y") surfaces as a per-line diff.
 *
 * Snapshots are intentionally text-only (extracted PDF string
 * literals, not bytes), so font/object/xref churn does not cause
 * spurious failures.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:decision-comparison-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  computeYearFinancialsFromData,
  type YearFinancials,
} from "../src/lib/consultant-engine.js";
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
import { LENDER_PDF_FIXTURES } from "./fixtures/lender-pdf-fixtures.js";

const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";
const SNAP_DIR = path.join(import.meta.dirname ?? __dirname, "__snapshots__");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? `\n${detail}` : ""}`);
  }
}

// ── PDF text extractor ─────────────────────────────────────────────────
// Identical per-literal extractor + across-fragment date redaction as
// the lender / board snapshot suites. See lender-pdf-text-snapshot.ts
// for the design rationale. Keeping the three implementations in lock-
// step makes it easy to update one when PDFKit changes its emission
// shape.
function extractStringLiterals(content: string, out: string[]): void {
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++;
      let depth = 1;
      let str = "";
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const n = content[i + 1];
          if (n === undefined) { i++; break; }
          if (n === "n") { str += "\n"; i += 2; continue; }
          if (n === "r") { str += "\r"; i += 2; continue; }
          if (n === "t") { str += "\t"; i += 2; continue; }
          if (n === "b" || n === "f") { i += 2; continue; }
          if (n === "(" || n === ")" || n === "\\") { str += n; i += 2; continue; }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (oct.length < 3 && i < content.length && content[i] >= "0" && content[i] <= "7") {
              oct += content[i];
              i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n;
          i += 2;
          continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") {
          depth--;
          if (depth === 0) { i++; break; }
          str += c; i++; continue;
        }
        str += c;
        i++;
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
          hex += c;
        }
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) {
        str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    i++;
  }
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`, "g");

function redactDatesAcrossFragments(fragments: string[]): string[] {
  if (fragments.length === 0) return fragments;
  const offsets: number[] = new Array(fragments.length);
  let joined = "";
  for (let i = 0; i < fragments.length; i++) {
    offsets[i] = joined.length;
    joined += fragments[i];
  }
  const owner = new Int32Array(joined.length);
  for (let i = 0; i < fragments.length; i++) {
    const start = offsets[i];
    const end = i + 1 < fragments.length ? offsets[i + 1] : joined.length;
    for (let k = start; k < end; k++) owner[k] = i;
  }
  const out = fragments.slice();
  const matches = Array.from(joined.matchAll(DATE_RE));
  for (let m = matches.length - 1; m >= 0; m--) {
    const match = matches[m];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const firstFrag = owner[start];
    const lastFrag = owner[end - 1];
    for (let f = firstFrag; f <= lastFrag; f++) {
      const fStart = offsets[f];
      const fEnd = f + 1 < fragments.length ? offsets[f + 1] : joined.length;
      const localStart = Math.max(0, start - fStart);
      const localEnd = Math.min(fEnd - fStart, end - fStart);
      const cur = out[f];
      const replacement = f === firstFrag ? "<DATE>" : "";
      out[f] = cur.slice(0, localStart) + replacement + cur.slice(localEnd);
    }
  }
  return out.filter((s) => s.length > 0);
}

function extractPdfFragments(pdf: Buffer): string[] {
  const out: string[] = [];
  let cursor = 0;
  let page = 0;
  while (cursor < pdf.length) {
    const sIdx = pdf.indexOf("stream", cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + "stream".length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const eIdx = pdf.indexOf("endstream", dataStart);
    if (eIdx === -1) break;
    let dataEnd = eIdx;
    if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
    if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
    const raw = pdf.subarray(dataStart, dataEnd);
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    const pageFragments: string[] = [];
    extractStringLiterals(body, pageFragments);
    if (pageFragments.length > 0) {
      page++;
      const redacted = redactDatesAcrossFragments(pageFragments);
      out.push(`--- PAGE ${page} ---`, ...redacted);
    }
    cursor = eIdx + "endstream".length;
  }
  return out;
}

// ── Deterministic impact builder ──────────────────────────────────────
// The comparison PDF takes a `SerializedDecisionImpact` already
// computed client-side (the decision-flow math lives in the React
// app). To exercise the renderer per-fixture without pulling client
// code into the api-server, we synthesize a deterministic impact from
// each fixture's YearFinancials. The exact "what-if" semantics are
// irrelevant — what matters is that the inputs are derived from the
// fixture data so a multi-loan cap table, a restricted-gift-heavy
// revenue mix, etc. each produce a different set of printed
// fragments. A formatter regression in any of them surfaces in the
// diff for that fixture.
function metricsFromFinancials(years: YearFinancials[]): SerializedScenarioMetrics {
  const padded: YearFinancials[] = years.slice(0, 5);
  while (padded.length < 5) {
    padded.push({
      year: padded.length + 1,
      students: 0,
      totalRevenue: 0,
      tuitionRevenue: 0,
      publicRevenue: 0,
      philanthropyRevenue: 0,
      totalStaffingCost: 0,
      facilityCost: 0,
      totalOpex: 0,
      debtService: 0,
      totalExpenses: 0,
      netIncome: 0,
      netMargin: 0,
      depreciation: 0,
      projectedAR: 0,
    });
  }
  const revenue = padded.map((y) => y.totalRevenue);
  const netIncome = padded.map((y) => y.netIncome);
  const netMargin = padded.map((y) =>
    y.totalRevenue > 0 ? y.netIncome / y.totalRevenue : 0,
  );
  const dscr = padded.map((y) =>
    y.debtService > 0 ? (y.netIncome + y.debtService) / y.debtService : 0,
  );
  // First year with positive cumulative net income (1-indexed); null
  // if cumulative never crosses zero in the 5-year horizon. Mirrors
  // the spirit of `breakEvenYearFromAnnual` without importing it.
  let cum = 0;
  let breakEvenYear: number | null = null;
  for (let i = 0; i < padded.length; i++) {
    cum += padded[i].netIncome;
    if (breakEvenYear === null && cum > 0) breakEvenYear = i + 1;
  }
  // Coarse runway proxy: months a $250k starting reserve covers at
  // the average monthly Y1 burn (capped at 60 to mirror the on-screen
  // "60+ mo" treatment). Deterministic and varies per fixture.
  const y1Net = padded[0].netIncome;
  const monthlyBurn = y1Net < 0 ? -y1Net / 12 : 0;
  const runway = monthlyBurn > 0 ? Math.min(60, 250_000 / monthlyBurn) : 60;
  return {
    revenue,
    netIncome,
    netMargin,
    dscr,
    breakEvenYear,
    cashRunwayMonths: runway,
  };
}

function adjustMetrics(
  base: SerializedScenarioMetrics,
  revenueMultiplier: number,
  expenseDelta: number, // dollars added to netIncome (negative = saves cost)
  runwayDeltaMonths: number,
): SerializedScenarioMetrics {
  const revenue = base.revenue.map((r) => r * revenueMultiplier);
  // Adjusted net income absorbs the revenue change at the model's
  // base margin plus the explicit expense delta.
  const netIncome = base.netIncome.map((n, i) => {
    const revDelta = base.revenue[i] * (revenueMultiplier - 1);
    return n + revDelta - expenseDelta;
  });
  const netMargin = revenue.map((r, i) =>
    r > 0 ? netIncome[i] / r : 0,
  );
  // DSCR shifts only via the netIncome change; debtService is baked
  // into the original ratio, so we approximate by scaling around
  // base.dscr proportionally to netIncome change vs base.netIncome.
  const dscr = base.dscr.map((d, i) => {
    const baseN = base.netIncome[i];
    if (!isFinite(d) || d === 0) return d;
    if (baseN === 0) return d;
    return d * (netIncome[i] / baseN);
  });
  let cum = 0;
  let breakEvenYear: number | null = null;
  for (let i = 0; i < netIncome.length; i++) {
    cum += netIncome[i];
    if (breakEvenYear === null && cum > 0) breakEvenYear = i + 1;
  }
  const cashRunwayMonths = Math.max(
    0,
    Math.min(60, base.cashRunwayMonths + runwayDeltaMonths),
  );
  return { revenue, netIncome, netMargin, dscr, breakEvenYear, cashRunwayMonths };
}

function buildImpact(
  base: SerializedScenarioMetrics,
  adjusted: SerializedScenarioMetrics,
  nudges: SerializedDecisionImpact["nudges"],
): SerializedDecisionImpact {
  const revDelta = adjusted.revenue.map((r, i) => r - base.revenue[i]);
  const niDelta = adjusted.netIncome.map((n, i) => n - base.netIncome[i]);
  const beShift =
    adjusted.breakEvenYear !== null && base.breakEvenYear !== null
      ? adjusted.breakEvenYear - base.breakEvenYear
      : adjusted.breakEvenYear === base.breakEvenYear
        ? 0
        : null;
  return {
    base,
    adjusted,
    deltas: {
      revenue: revDelta,
      netIncome: niDelta,
      breakEvenYearShift: beShift,
      cashRunwayDeltaMonths: adjusted.cashRunwayMonths - base.cashRunwayMonths,
    },
    nudges,
  };
}

function buildComparisonRequest(
  schoolName: string,
  data: Record<string, unknown>,
): DecisionComparisonRequest {
  const years = computeYearFinancialsFromData(data);
  const base = metricsFromFinancials(years);
  // Side A — "Lease the annex on Birch St." — adds revenue at the
  // cost of a modest opex bump.
  const primaryAdjusted = adjustMetrics(base, 1.05, 25_000, -2);
  // Side B — "Defer expansion, trim opex." — shaves opex with a
  // small enrollment dip.
  const compareAdjusted = adjustMetrics(base, 0.98, -40_000, 4);
  return {
    schoolName,
    primary: {
      label: "Lease the annex on Birch St.",
      decisionLabel: "Evaluate a site",
      narrative:
        "Adds the annex classroom block in Y1; assumes 5% enrollment lift offset by $25k/yr in rent + utilities.",
      impact: buildImpact(base, primaryAdjusted, [
        { signal: "amber", label: "Lease covenant",
          message: "Confirm landlord allows mid-year occupancy before signing." },
      ]),
    },
    compare: {
      label: "Defer expansion, trim opex.",
      decisionLabel: "Adjust budget",
      narrative:
        "Holds enrollment flat (-2%) and removes one classified position; saves ~$40k/yr in payroll & benefits.",
      impact: buildImpact(base, compareAdjusted, [
        { signal: "green", label: "Healthy runway",
          message: "Cuts extend reserve coverage past 24 months in Y1." },
        { signal: "red", label: "Capacity risk",
          message: "Without the annex, waitlist conversions drop below target by Y3." },
      ]),
    },
  };
}

interface SnapshotCase {
  label: string;
  schoolName: string;
  data: Record<string, unknown>;
}

const CASES: SnapshotCase[] = [
  { label: "microschool",    schoolName: "Microschool Demo",   data: MICROSCHOOL_MODEL.data    as unknown as Record<string, unknown> },
  { label: "private_school", schoolName: "Private School Demo", data: PRIVATE_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  { label: "charter_school", schoolName: "Charter School Demo", data: CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  ...LENDER_PDF_FIXTURES.map((f) => ({
    label: f.label,
    schoolName: f.label,
    data: f.data as unknown as Record<string, unknown>,
  })),
];

function diffLines(actual: string[], expected: string[], maxShown = 25): string {
  const lines: string[] = [];
  const max = Math.max(actual.length, expected.length);
  let shown = 0;
  let differingCount = 0;
  for (let i = 0; i < max; i++) {
    const a = actual[i];
    const e = expected[i];
    if (a !== e) {
      differingCount++;
      if (shown < maxShown) {
        lines.push(`    line ${i + 1}:`);
        lines.push(`      expected: ${e === undefined ? "<eof>" : JSON.stringify(e)}`);
        lines.push(`      actual:   ${a === undefined ? "<eof>" : JSON.stringify(a)}`);
        shown++;
      }
    }
  }
  if (differingCount > shown) {
    lines.push(`    ... and ${differingCount - shown} more differing lines`);
  }
  if (actual.length !== expected.length) {
    lines.push(`    length mismatch: expected ${expected.length} lines, got ${actual.length}`);
  }
  return lines.join("\n");
}

async function runOne(c: SnapshotCase): Promise<void> {
  const tag = `[${c.label}]`;
  const request = buildComparisonRequest(c.schoolName, c.data);
  const pdf = await generateDecisionComparisonPDF(request);
  const fragments = extractPdfFragments(pdf);

  const snapPath = path.join(SNAP_DIR, `decision-comparison-pdf-${c.label}.txt`);
  const actual = fragments.join("\n") + "\n";

  if (UPDATE) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(snapPath, actual);
    console.log(`${tag} wrote snapshot ${path.relative(process.cwd(), snapPath)} (${fragments.length} fragments)`);
    passed++;
    return;
  }

  if (!fs.existsSync(snapPath)) {
    check(`${tag} snapshot exists at ${path.relative(process.cwd(), snapPath)}`,
      false,
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:decision-comparison-text-snapshot`);
    return;
  }

  const expected = fs.readFileSync(snapPath, "utf8");
  if (actual === expected) {
    passed++;
    console.log(`${tag} snapshot OK (${fragments.length} fragments)`);
    return;
  }

  const expectedLines = expected.replace(/\n$/, "").split("\n");
  const actualLines = actual.replace(/\n$/, "").split("\n");
  const detail = [
    `    Snapshot mismatch for ${path.relative(process.cwd(), snapPath)}.`,
    `    If this change is intentional, refresh with:`,
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:decision-comparison-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} decision-comparison PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`decision-comparison-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("decision-comparison-text-snapshot: unexpected error", err);
  process.exit(1);
});
