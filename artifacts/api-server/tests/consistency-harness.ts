/**
 * Task #930 — Verification & regression harness.
 *
 * Gates the 22 remediation tasks (#908–#929) catalogued in
 * `.local/tasks/remediation/`. Renders the three seeded demo personas
 * (microschool = Oakwood, private_school = Riverside, charter_school
 * = Liberty) end-to-end through the production codepath and runs a
 * battery of "probes" against the rendered Lender Packet PDF + the
 * underwriting workbook bytes.
 *
 * What it checks (every catalogued bug pattern from the Verification
 * Protocol):
 *   B1 — multiple revenue totals per packet                 (#912 #914)
 *   B2 — three DSCR figures per packet                      (#910)
 *   B3 — multiple runway figures per packet                 (#908)
 *   B4 — loan-rate narrative ↔ Capital Stack parity         (#916)
 *   B5 — Revenue Quality column-header off-by-one           (#919)
 *   B6 — "Tuition covers N%" disagrees with engine truth    (#911)
 *   B7 — `[ ]` ASCII placeholder bullets in PDF             (#923)
 *   B8 — "Strong" Lender Readiness with zero evidence       (#929)
 *   C1 — cross-section Y1 Total Revenue consistency
 *   M*  — per-canonical-metric × per-PDF-location map for all 12
 *         metrics in the canonical registry, with every PDF
 *         appearance asserted against the canonical Excel cell.
 *
 * Output:
 *   `tests/__snapshots__/consistency-report-<persona>.txt` — one per
 *   persona, listing every canonical metric, every location it
 *   appears in the rendered PDF, and pass/fail. Committed snapshots
 *   pin the CURRENT (failing) production state; every probe in FAIL
 *   is a bug one of #908–#929 will close.
 *
 * Standing-rule compliance (Verification Protocol §1–5):
 *   • Rule 1 — operates on freshly re-rendered packets.
 *   • Rule 3 — every truth value is sourced from a named Excel cell
 *     in the canonical registry below.
 *   • Rule 4 — the per-metric map asserts that N PDF copies of a
 *     metric all equal the canonical cell.
 *   • Rule 5 — this harness ONLY observes and reports. It MUST NOT
 *     attempt to fix any bug it detects.
 *
 * Hermetic: no DB, no network, no env vars beyond UPDATE_SNAPSHOTS
 * and STRICT_HARNESS.
 *
 * ── Exit policy ───────────────────────────────────────────────────
 *
 * Default (script `test:consistency-harness`, wired into the
 * api-server `test` chain):
 *   STRICT — exits non-zero whenever any probe is FAIL. This is the
 *   protocol's hard "fails loudly on any inconsistency" requirement
 *   (Verification Protocol step 5). The api-server `test` chain will
 *   therefore stay red until the remediation tasks #908–#929 land.
 *   This is intentional per the task spec: "The harness must be
 *   green before each task is claimed complete."
 *
 * Baseline mode (script `test:consistency-harness:baseline`,
 * NOT in the `test` chain):
 *   Writes a fresh report and snapshot-compares it to the committed
 *   `tests/__snapshots__/consistency-report-<persona>.txt`. Used
 *   during a remediation task to see whether a fix flipped a probe
 *   from FAIL → PASS (snapshot drift = intentional progress).
 *
 * Snapshot refresh (after an intentional fix lands):
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:consistency-harness:baseline
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { extractPdfFragments, diffLines } from "./_pdf-text-snapshot-util.js";

// CLI flags (also via env vars for back-compat).
const ARGS = new Set(process.argv.slice(2));
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1" || ARGS.has("--update-snapshots");
// `--baseline`: snapshot-compare mode used by `test:consistency-harness:baseline`.
// Without this flag the script runs in STRICT mode (exits non-zero on
// any probe FAIL, per Verification Protocol step 5).
const BASELINE_MODE = ARGS.has("--baseline");
const SNAP_DIR = path.join(import.meta.dirname ?? __dirname, "__snapshots__");

interface PersonaCase {
  label: string;
  model: typeof MICROSCHOOL_MODEL;
}

const CASES: PersonaCase[] = [
  { label: "microschool",    model: MICROSCHOOL_MODEL },
  { label: "private_school", model: PRIVATE_SCHOOL_MODEL },
  { label: "charter_school", model: CHARTER_SCHOOL_MODEL },
];

// ── Cell helpers (mirror tests/demo-math-smoke.ts) ─────────────────
function cellNumber(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function cellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "object" && "result" in (v as object)) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v);
}

function findRowByLabel(ws: ExcelJS.Worksheet, label: string, labelCol = 1): number {
  let found = -1;
  ws.eachRow((_row, n) => {
    if (found > 0) return;
    if (cellString(ws, n, labelCol) === label) found = n;
  });
  return found;
}

function findRowStarting(ws: ExcelJS.Worksheet, prefix: string, labelCol = 1): number {
  let found = -1;
  ws.eachRow((_row, n) => {
    if (found > 0) return;
    if (cellString(ws, n, labelCol).startsWith(prefix)) found = n;
  });
  return found;
}

type AnyBuffer = Parameters<ExcelJS.Xlsx["load"]>[0];

async function loadWorkbook(data: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  const generator = await generateUnderwritingWorkbook(data);
  const buf = (await generator.xlsx.writeBuffer()) as ArrayBuffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buf) as unknown as AnyBuffer);
  return wb;
}

async function renderLenderPdf(data: Record<string, unknown>): Promise<Buffer> {
  const consultant = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  // Pin generatedAt so report rendering is date-stable.
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date(
    "2026-01-01T00:00:00Z",
  );
  return await generateLenderPacketPDF(packet);
}

// ── Canonical metric registry — every truth value the harness
//    compares against the rendered PDF traces to a specific
//    sheet!cell address (Rule 3). The METRIC_SPECS table is the
//    single source of truth; every spec carries the exact (sheet,
//    row, firstCol, count) the extractor reads. No label search.
//    Mirrors the registry in task-930.md exactly.
interface MetricTruth {
  totalRevenue: number[];
  changeInNetAssets: number[];
  dscrNormalized: number[];
  endingCash: number[];
  daysCashOnHand: number[];
  runwayMonths: number[];
  capacityUtilization: number[];
  breakEvenEnrollment: number[];
  personnel: number[];
  operatingExpenses: number[];
  enrollment: number[];
  loans: Array<{ name: string; principal: number; ratePct: number; termYears: number }>;
}

type MetricKey = keyof Omit<MetricTruth, "loans">;

interface MetricSpec {
  key: MetricKey;
  label: string;
  source: string;        // human-readable "Sheet!A1:E1" address
  sheet: string;         // exact sheet name to read
  row: number;           // 1-based row number
  firstCol: number;      // 1-based column number (B = 2)
  count: number;         // number of cells to read across the row
  kind: "usd" | "ratio" | "days" | "months" | "pct" | "count";
}

// Hardcoded cell addresses per the canonical registry in
// `.local/tasks/task-930.md`. Each row pins (sheet, row, firstCol,
// count) so a sheet/row rearrangement in `underwriting-workbook.ts`
// MUST update this table — it cannot drift silently the way a label
// search would.
const METRIC_SPECS: MetricSpec[] = [
  { key: "totalRevenue",        label: "Total Revenue",         source: "5-Year Operating Stmt!B5:F5",    sheet: "5-Year Operating Stmt", row: 5,  firstCol: 2, count: 5, kind: "usd"    },
  { key: "changeInNetAssets",   label: "Change in Net Assets",  source: "5-Year Operating Stmt!B16:F16",  sheet: "5-Year Operating Stmt", row: 16, firstCol: 2, count: 5, kind: "usd"    },
  { key: "personnel",           label: "Personnel Cost",        source: "5-Year Operating Stmt!B8:F8",    sheet: "5-Year Operating Stmt", row: 8,  firstCol: 2, count: 5, kind: "usd"    },
  { key: "operatingExpenses",   label: "Operating Expenses",    source: "5-Year Operating Stmt!B9:F9",    sheet: "5-Year Operating Stmt", row: 9,  firstCol: 2, count: 5, kind: "usd"    },
  { key: "dscrNormalized",      label: "DSCR (Normalized)",     source: "DSCR & Covenants!B12:F12",       sheet: "DSCR & Covenants",      row: 12, firstCol: 2, count: 5, kind: "ratio"  },
  { key: "endingCash",          label: "Ending Cash",           source: "DSCR & Covenants!B15:F15",       sheet: "DSCR & Covenants",      row: 15, firstCol: 2, count: 5, kind: "usd"    },
  { key: "daysCashOnHand",      label: "Days Cash on Hand",     source: "DSCR & Covenants!B17:F17",       sheet: "DSCR & Covenants",      row: 17, firstCol: 2, count: 5, kind: "days"   },
  { key: "runwayMonths",        label: "Months of Runway",      source: "DSCR & Covenants!B18:F18",       sheet: "DSCR & Covenants",      row: 18, firstCol: 2, count: 5, kind: "months" },
  { key: "capacityUtilization", label: "Capacity Utilization",  source: "DSCR & Covenants!B19:F19",       sheet: "DSCR & Covenants",      row: 19, firstCol: 2, count: 5, kind: "pct"    },
  { key: "breakEvenEnrollment", label: "Break-Even Enrollment", source: "DSCR & Covenants!B25:F25",       sheet: "DSCR & Covenants",      row: 25, firstCol: 2, count: 5, kind: "count"  },
  { key: "enrollment",          label: "Enrollment",            source: "Enrollment Tuition Fcst!B4:F4",  sheet: "Enrollment Tuition Fcst", row: 4, firstCol: 2, count: 5, kind: "count"  },
];

function extractRowRange(ws: ExcelJS.Worksheet, row: number, firstCol: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(cellNumber(ws, row, firstCol + i));
  return out;
}

function extractTruth(wb: ExcelJS.Workbook): MetricTruth {
  const t: Partial<MetricTruth> = { loans: [] };
  for (const spec of METRIC_SPECS) {
    const ws = wb.getWorksheet(spec.sheet);
    if (!ws) {
      console.warn(`consistency-harness: missing sheet ${spec.sheet} for metric ${spec.key} (${spec.source}); reading zeroes.`);
      (t as Record<MetricKey, number[]>)[spec.key] = new Array(spec.count).fill(0);
      continue;
    }
    (t as Record<MetricKey, number[]>)[spec.key] = extractRowRange(ws, spec.row, spec.firstCol, spec.count);
  }
  // Loans: Capital Stack rows where col 2 = "Loan"; columns C/D/E
  // are principal / rate / term per the canonical registry.
  const cap = wb.getWorksheet("Capital Stack");
  if (cap) {
    cap.eachRow((_row, n) => {
      if (cellString(cap, n, 2) !== "Loan") return;
      const name = cellString(cap, n, 1);
      const principal = cellNumber(cap, n, 3);
      const rate = cellNumber(cap, n, 4);
      const term = cellNumber(cap, n, 5);
      if (!name || principal === 0) return;
      t.loans!.push({ name, principal, ratePct: rate > 1 ? rate : rate * 100, termYears: term });
    });
  }
  return t as MetricTruth;
}

// label-helpers retained (unused by main extractor) — kept for
// future ad-hoc probes; not used in canonical truth extraction.
void findRowByLabel; void findRowStarting;

// ── PDF text helpers ──────────────────────────────────────────────
function joinPages(fragments: string[]): string[] {
  const pages: string[] = [];
  let cur: string[] = [];
  for (const f of fragments) {
    if (f.startsWith("--- PAGE ")) {
      if (cur.length > 0) pages.push(cur.join(""));
      cur = [];
    } else {
      cur.push(f);
    }
  }
  if (cur.length > 0) pages.push(cur.join(""));
  return pages;
}

function joinAll(fragments: string[]): string {
  return joinPages(fragments).join(" ");
}

// ── Probe machinery ───────────────────────────────────────────────
type Status = "PASS" | "FAIL" | "INFO";
interface ProbeResult {
  id: string;
  title: string;
  status: Status;
  detail: string;
}

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(Math.round(n));
}

// Parse all "$1,234,567" or "$1.2M" / "$150K" dollar tokens. Returns
// numeric value in dollars. Dedup-preserving order.
function dollarTokens(s: string): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  // Exact integer/decimal form with commas: $1,234,567 or $123 or $1234.56
  for (const m of s.matchAll(/\$([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(?!\d)/g)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push(Number(m[1].replace(/,/g, "")));
  }
  // Compact form: $1.2M / $150K / $2.5B
  for (const m of s.matchAll(/\$([0-9]+(?:\.[0-9]+)?)([KMB])/g)) {
    const tag = m[0];
    if (seen.has(tag)) continue;
    seen.add(tag);
    const mult = m[2] === "K" ? 1_000 : m[2] === "M" ? 1_000_000 : 1_000_000_000;
    out.push(Number(m[1]) * mult);
  }
  return out;
}

function nearlyEqual(a: number, b: number, absTol = 1, relTol = 0.005): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && diff / scale <= relTol;
}

// Which Y1..Y5 canonical truth does a given PDF value match, if any?
function matchYear(value: number, truth: number[], tol: { abs: number; rel: number }): number {
  for (let i = 0; i < truth.length; i++) {
    if (nearlyEqual(value, truth[i], tol.abs, tol.rel)) return i + 1; // Y1..Y5
  }
  return 0;
}

// ── Probes ────────────────────────────────────────────────────────
function probeRevenueTotals(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.totalRevenue[0] ?? 0;
  const projectsMatches: number[] = [];
  for (const m of pdfAll.matchAll(/projects? \$([0-9,]+(?:\.[0-9]+)?)/g)) {
    projectsMatches.push(Number(m[1].replace(/,/g, "")));
  }
  const distinctProjects = Array.from(new Set(projectsMatches));
  const matchesTruth = distinctProjects.filter(v => nearlyEqual(v, y1Truth));
  const offTruth = distinctProjects.filter(v => !nearlyEqual(v, y1Truth));
  const status: Status = distinctProjects.length === 0
    ? "INFO"
    : (distinctProjects.length === 1 && offTruth.length === 0) ? "PASS" : "FAIL";
  const detail = [
    `canonical Y1 Total Revenue (5-Year Operating Stmt!B5) = ${fmtUSD(y1Truth)}`,
    `"projects $N" narrative occurrences: ${projectsMatches.length} (distinct values: ${distinctProjects.length})`,
    `  distinct values: ${distinctProjects.map(fmtUSD).join(", ") || "(none)"}`,
    `  matching truth:  ${matchesTruth.map(fmtUSD).join(", ") || "(none)"}`,
    `  diverging:       ${offTruth.map(fmtUSD).join(", ") || "(none)"}`,
  ].join("\n     ");
  return { id: "B1.revenue-totals", title: "Multiple revenue totals per packet (#912 #914)", status, detail };
}

function probeDscrFigures(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.dscrNormalized[0] ?? 0;
  const vals: number[] = [];
  for (const m of pdfAll.matchAll(/DSCR\s+(?:holds at|is|would read|moves from|moves to)\s+(-?[0-9]+(?:\.[0-9]+)?)x/gi)) {
    vals.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/Year[- ]?1[^.]{0,30}DSCR[^.]{0,30}?(-?[0-9]+(?:\.[0-9]+)?)x/gi)) {
    vals.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/DSCR of (-?[0-9]+(?:\.[0-9]+)?)x/g)) vals.push(Number(m[1]));

  const hasReportedCol = /DSCR \(Repor/.test(pdfAll);
  const hasNormalizedCol = /DSCR \(Normaliz/.test(pdfAll);
  const distinct = Array.from(new Set(vals.map(v => Math.round(v * 100) / 100)));
  const offTruth = distinct.filter(v => !nearlyEqual(v, y1Truth, 0.05, 0.02));

  const status: Status =
    distinct.length === 0 ? "INFO"
    : distinct.length === 1 && !hasReportedCol && offTruth.length === 0 ? "PASS"
    : "FAIL";
  const detail = [
    `canonical Y1 DSCR (DSCR & Covenants!B12) = ${fmtNum(y1Truth)}x`,
    `narrative DSCR mentions (distinct rounded): ${distinct.length}`,
    `  values:  ${distinct.map(v => fmtNum(v) + "x").join(", ") || "(none)"}`,
    `  off-truth: ${offTruth.map(v => fmtNum(v) + "x").join(", ") || "(none)"}`,
    `DSCR (Reported) column present: ${hasReportedCol}`,
    `DSCR (Normalized) column present: ${hasNormalizedCol}`,
  ].join("\n     ");
  return { id: "B2.dscr-figures", title: "Multiple DSCR figures per packet (#910)", status, detail };
}

function probeRunwayFigures(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.runwayMonths[0] ?? 0;
  const vals: number[] = [];
  const literals: string[] = [];
  for (const m of pdfAll.matchAll(/Cash Runway:\s+([0-9]+(?:\.[0-9]+)?|60\+)\s*months?/gi)) {
    literals.push(m[0]);
    vals.push(m[1] === "60+" ? 60 : Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/runway extends ([0-9]+(?:\.[0-9]+)?)\s*months?/gi)) {
    literals.push(m[0]);
    vals.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/extends ([0-9]+(?:\.[0-9]+)?)\s*months? of/gi)) {
    literals.push(m[0]);
    vals.push(Number(m[1]));
  }
  const distinct = Array.from(new Set(vals.map(v => Math.round(v * 10) / 10)));
  const offTruth = distinct.filter(v =>
    !nearlyEqual(v, y1Truth, 0.5, 0.05) && !(v === 60 && y1Truth >= 60));

  const status: Status =
    distinct.length === 0 ? "INFO"
    : distinct.length === 1 && offTruth.length === 0 ? "PASS"
    : "FAIL";
  const detail = [
    `canonical Y1 Runway (DSCR & Covenants!B18) = ${fmtNum(y1Truth)} months`,
    `runway narrative occurrences: ${literals.length} (distinct: ${distinct.length})`,
    `  distinct values: ${distinct.map(v => fmtNum(v) + " months").join(", ") || "(none)"}`,
    `  diverging:       ${offTruth.map(v => fmtNum(v) + " months").join(", ") || "(none)"}`,
    `  literal hits:    ${literals.slice(0, 6).map(s => JSON.stringify(s)).join(", ")}${literals.length > 6 ? `, ... +${literals.length - 6} more` : ""}`,
  ].join("\n     ");
  return { id: "B3.runway-figures", title: "Multiple runway figures per packet (#908)", status, detail };
}

function probeLoanRate(truth: MetricTruth, pdfAll: string): ProbeResult {
  if (truth.loans.length === 0) {
    return { id: "B4.loan-rate", title: "Loan-rate narrative ↔ Capital Stack parity (#916)", status: "INFO", detail: "no loans in Capital Stack" };
  }
  // Every rate that appears anywhere in the rendered PDF in the form
  // "N.N%" within ~30 chars of loan/rate keywords. (Looser than B1
  // because rates have very few false positives at this precision.)
  const narrativeRates = new Set<number>();
  for (const m of pdfAll.matchAll(/Loan interest rate:\s+([0-9]+(?:\.[0-9]+)?)\s*%/gi)) {
    narrativeRates.add(Math.round(Number(m[1]) * 100) / 100);
  }
  // Also catch "N.N% rate" or "at N.N%" near loan/mortgage keywords.
  for (const m of pdfAll.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)) {
    const idx = m.index ?? 0;
    const window = pdfAll.slice(Math.max(0, idx - 40), idx + 10);
    if (/loan|Loan|mortgage|Mortgage|interest|Interest/i.test(window)) {
      const v = Math.round(Number(m[1]) * 100) / 100;
      if (v >= 0.5 && v <= 25) narrativeRates.add(v);
    }
  }
  const truthRates = truth.loans.map(l => Math.round(l.ratePct * 100) / 100);
  // Bug pattern #916: a loan exists in the Capital Stack whose rate is
  // NOT mentioned in the narrative anywhere.
  const undisclosedLoans = truth.loans.filter(l => {
    const r = Math.round(l.ratePct * 100) / 100;
    return !Array.from(narrativeRates).some(n => nearlyEqual(n, r, 0.05, 0.01));
  });
  const narrativeRatesArr = Array.from(narrativeRates).sort((a, b) => a - b);
  // Also flag narrative rates that don't match any loan (over-disclosure /
  // narrative inventing a rate).
  const ghostRates = narrativeRatesArr.filter(r =>
    !truthRates.some(t => nearlyEqual(r, t, 0.05, 0.01)));

  const status: Status = undisclosedLoans.length === 0 && ghostRates.length === 0 ? "PASS" : "FAIL";
  const detail = [
    `Capital Stack loans:`,
    ...truth.loans.map(l => `  - ${l.name}: principal=${fmtUSD(l.principal)} rate=${fmtNum(l.ratePct)}% term=${fmtNum(l.termYears, 0)}y`),
    `narrative rates mentioned (near loan/mortgage/interest keywords): ${narrativeRatesArr.map(v => fmtNum(v) + "%").join(", ") || "(none)"}`,
    `Capital Stack loans whose rate NEVER appears in narrative (#916): ${undisclosedLoans.length}`,
    ...undisclosedLoans.map(l => `  - ${l.name} (${fmtNum(l.ratePct)}%) — under-disclosed`),
    `narrative rates with NO matching loan in Capital Stack: ${ghostRates.length}`,
    ...ghostRates.map(r => `  - ${fmtNum(r)}% — ghost rate`),
  ].join("\n     ");
  return { id: "B4.loan-rate", title: "Loan-rate narrative ↔ Capital Stack parity (#916)", status, detail };
}

function probeRevenueQualityHeaders(pdfAll: string): ProbeResult {
  // Off-by-one bug #919: Revenue Quality column headers print
  // Year 2..Year 6 instead of Year 1..Year 5. In the rendered PDF
  // these column headers are concatenated with NO separator
  // ("BucketYear 2Year 3Year 4Year 5Year 6"), so we must not require
  // whitespace between them.
  const rqIdx = pdfAll.search(/Revenue Quality/i);
  const found = rqIdx >= 0;
  const offByOne = /Year ?2\s*Year ?3\s*Year ?4\s*Year ?5\s*Year ?6/.test(pdfAll);
  let nearbyHeaders = "";
  if (found) {
    const window = pdfAll.slice(rqIdx, rqIdx + 400);
    const m = window.match(/Year ?\d+(?:\s*Year ?\d+){2,}/);
    if (m) nearbyHeaders = m[0];
  }
  const status: Status = !found ? "INFO" : offByOne ? "FAIL" : "PASS";
  const detail = [
    `Revenue Quality section found: ${found}`,
    `nearby header sequence: ${JSON.stringify(nearbyHeaders) || "(none)"}`,
    `off-by-one (Year 2..Year 6) detected: ${offByOne}`,
  ].join("\n     ");
  return { id: "B5.rev-quality-headers", title: "Revenue Quality column-header off-by-one (#919)", status, detail };
}

function probeTuitionCoverage(label: string, truth: MetricTruth, pdfAll: string): ProbeResult {
  // Bug #911: narrative says "Tuition covers 39%" while a more
  // honest derivation from canonical cells gives a much larger
  // ratio (Riverside-specific 39% vs 137% per spec). Compare narrative
  // claim against an envelope derived from canonical Excel cells:
  //   coverage_envelope_pct = TotalRevenue / (TotalRevenue - ChangeInNetAssets) × 100
  // i.e. revenue ÷ implied total costs. If narrative diverges from
  // this envelope by > 50% (relative), flag.
  const matches: number[] = [];
  for (const m of pdfAll.matchAll(/Tuition covers\s+(-?[0-9]+(?:\.[0-9]+)?)\s*%/gi)) {
    matches.push(Number(m[1]));
  }
  const y1Rev = truth.totalRevenue[0] ?? 0;
  const y1NI = truth.changeInNetAssets[0] ?? 0;
  const y1Costs = y1Rev - y1NI;
  const envelopePct = y1Costs > 0 ? (y1Rev / y1Costs) * 100 : 0;
  const distinct = Array.from(new Set(matches.map(v => Math.round(v * 10) / 10)));
  const diverges = distinct.filter(v =>
    envelopePct > 0 && Math.abs(v - envelopePct) / envelopePct > 0.5);

  const status: Status =
    matches.length === 0 ? "INFO"
    : (distinct.length === 1 && diverges.length === 0) ? "PASS"
    : "FAIL";
  const detail = [
    `narrative "Tuition covers N%" occurrences: ${matches.length} (distinct: ${distinct.length})`,
    `  distinct: ${distinct.map(v => fmtNum(v) + "%").join(", ") || "(none)"}`,
    `engine-truth envelope (TotalRev / (TotalRev − ChangeInNA) × 100):`,
    `  Y1 Total Revenue        = ${fmtUSD(y1Rev)}  [5-Year Operating Stmt!B5]`,
    `  Y1 Change in Net Assets = ${fmtUSD(y1NI)}  [5-Year Operating Stmt!B16]`,
    `  implied total Y1 costs  = ${fmtUSD(y1Costs)}`,
    `  envelope ratio          = ${fmtNum(envelopePct, 0)}%`,
    `narrative claims diverging from envelope by > 50%: ${diverges.length}`,
    ...diverges.map(v => `  - ${fmtNum(v)}% vs envelope ${fmtNum(envelopePct, 0)}% — narrative disagrees with engine truth`),
    `persona: ${label} — spec calls out 39% vs 137% on private (Riverside)`,
  ].join("\n     ");
  return { id: "B6.tuition-coverage", title: "Tuition coverage narrative vs engine truth (#911)", status, detail };
}

function probeEmptyBullets(fragments: string[]): ProbeResult {
  let emptyCount = 0;
  let plusCount = 0;
  let tildeCount = 0;
  let bangCount = 0;
  for (const f of fragments) {
    const t = f.trim();
    if (t === "[ ]") emptyCount++;
    else if (t === "[+]") plusCount++;
    else if (t === "[~]") tildeCount++;
    else if (t === "[!]") bangCount++;
  }
  const totalAscii = emptyCount + plusCount + tildeCount + bangCount;
  const status: Status = totalAscii > 0 ? "FAIL" : "PASS";
  const detail = [
    `ASCII "[ ]" placeholder bullets:  ${emptyCount}`,
    `ASCII "[+]" passing bullets:      ${plusCount}`,
    `ASCII "[~]" caution bullets:      ${tildeCount}`,
    `ASCII "[!]" warning bullets:      ${bangCount}`,
    totalAscii > 0
      ? `  → ASCII bullet placeholders leak into rendered packet — replace via renderStatusIcon() in pdf-utils.ts (Task #923).`
      : `  → all bullets render as Unicode status glyphs (✓ ⚠ ✕ •).`,
  ].join("\n     ");
  return { id: "B7.empty-bullets", title: "ASCII `[+]/[~]/[!]/[ ]` bullets in PDF (#923)", status, detail };
}

function probeLenderReadinessEvidence(pdfAll: string): ProbeResult {
  const readinessMatches = Array.from(pdfAll.matchAll(/Lender Readiness:\s+(Strong|Almost There|Needs Work|Adequate|Not Ready)/gi));
  const verdicts = Array.from(new Set(readinessMatches.map(m => m[1])));
  let evidencePct: number | null = null;
  const evidMatches = pdfAll.match(/([0-9]+)\s*%\s+of (?:assumptions|inputs)/i);
  if (evidMatches) evidencePct = Number(evidMatches[1]);
  const hasZeroEvidence = /(\b0\s*%|\bzero|no assumptions)\s+(?:of\s+)?(?:assumptions|inputs)?[^.]{0,30}(?:tagged|evidence)/i.test(pdfAll);
  const strong = verdicts.includes("Strong");
  const status: Status =
    readinessMatches.length === 0 ? "INFO"
    : strong && (hasZeroEvidence || (evidencePct !== null && evidencePct < 25)) ? "FAIL"
    : "PASS";
  const detail = [
    `Lender Readiness verdict occurrences: ${readinessMatches.length} (distinct: ${verdicts.join(", ") || "(none)"})`,
    `evidence-tagged % mentioned: ${evidencePct === null ? "(not found)" : evidencePct + "%"}`,
    `zero-evidence wording present: ${hasZeroEvidence}`,
    `verdict says Strong: ${strong}`,
    `  → bug pattern (#929): verdict=Strong with 0% / no-evidence claim leaks confidence the data doesn't support`,
  ].join("\n     ");
  return { id: "B8.readiness-evidence", title: "\"Strong\" Lender Readiness with 0% evidence (#929)", status, detail };
}

function probeCrossSectionRevenue(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.totalRevenue[0] ?? 0;
  const seen: number[] = [];
  for (const m of pdfAll.matchAll(/(?:projects?|projected|projecting)\s+\$([0-9,]+(?:\.[0-9]+)?)/gi)) {
    seen.push(Number(m[1].replace(/,/g, "")));
  }
  for (const m of pdfAll.matchAll(/Total Revenue[^$]{0,30}\$([0-9,]+(?:\.[0-9]+)?)/g)) {
    seen.push(Number(m[1].replace(/,/g, "")));
  }
  const distinct = Array.from(new Set(seen.map(n => Math.round(n))));
  const offTruth = distinct.filter(v => !nearlyEqual(v, y1Truth, 1, 0.01));
  const status: Status = seen.length === 0 ? "INFO" : offTruth.length === 0 ? "PASS" : "FAIL";
  const detail = [
    `canonical Y1 Total Revenue (5-Year Operating Stmt!B5) = ${fmtUSD(y1Truth)}`,
    `cross-section occurrences: ${seen.length} (distinct: ${distinct.length})`,
    `  values:    ${distinct.map(fmtUSD).join(", ") || "(none)"}`,
    `  off-truth: ${offTruth.map(fmtUSD).join(", ") || "(none)"}`,
  ].join("\n     ");
  return { id: "C1.cross-section-revenue", title: "Cross-section Y1 Total Revenue consistency", status, detail };
}

// ── Per-metric × per-PDF-location map (Rule 4 enforcement) ────────
//
// For every metric in the canonical registry, find every PDF
// appearance whose numeric value matches one of the canonical
// Y1..Y5 cells, AND every appearance that does NOT match any
// canonical year. The probe FAILs whenever a non-matching appearance
// is found (i.e. the rendered PDF carries a value for this metric
// that disagrees with the engine).
function formatTruth(spec: MetricSpec, vals: number[]): string {
  return vals.map((v, i) => {
    let s: string;
    switch (spec.kind) {
      case "usd":    s = fmtUSD(v); break;
      case "ratio":  s = fmtNum(v) + "x"; break;
      case "days":   s = fmtNum(v, 0) + "d"; break;
      case "months": s = fmtNum(v, 1) + "m"; break;
      case "pct":    s = fmtNum(v * 100, 0) + "%"; break;
      case "count":  s = fmtNum(v, 0); break;
    }
    return `Y${i + 1}=${s}`;
  }).join("  ");
}

// Per-metric keyword anchors. Each metric's narrative locations
// in the rendered PDF appear within ±KEYWORD_WINDOW chars of one
// of these keyword regexes. The strict metric-map probe scans
// these windows for kind-appropriate numeric tokens; every token
// found must match a canonical Y1..Y5 cell or the probe FAILs
// (Rule 4 enforcement at the per-metric level).
const KEYWORD_WINDOW = 80;
const METRIC_KEYWORDS: Record<MetricKey, RegExp[]> = {
  totalRevenue:        [/Total Revenue/g, /\bprojects? \$/gi, /revenue projected/gi, /projected revenue/gi],
  changeInNetAssets:   [/Change in Net Assets/g, /Net Income/g, /net surplus/gi, /operating surplus/gi],
  personnel:           [/Personnel/g, /staffing cost/gi, /salaries/gi],
  operatingExpenses:   [/Operating Expenses/g, /\bOpEx\b/g, /Total Operating/g],
  dscrNormalized:      [/DSCR/g, /Debt Service Coverage/gi],
  endingCash:          [/Ending Cash/g, /cash balance/gi, /year[- ]end cash/gi],
  daysCashOnHand:      [/Days? Cash/gi, /days of cash/gi, /DCOH/g],
  runwayMonths:        [/Cash Runway/gi, /runway extends/gi, /months? of runway/gi, /runway/gi],
  capacityUtilization: [/Capacity Utilization/gi, /of (?:stated )?capacity/gi, /capacity utilization/gi],
  breakEvenEnrollment: [/Break[- ]?Even/gi, /breakeven enrollment/gi],
  enrollment:          [/\benrollment\b/gi, /\bstudents?\b/gi, /Year \d enrollment/gi],
};

function probeMetricMap(spec: MetricSpec, truth: MetricTruth, pdfAll: string): ProbeResult {
  const vals = truth[spec.key];
  const tol = spec.kind === "usd" ? { abs: 1, rel: 0.01 }
            : spec.kind === "ratio" ? { abs: 0.05, rel: 0.02 }
            : spec.kind === "months" ? { abs: 0.5, rel: 0.05 }
            : spec.kind === "days" ? { abs: 1, rel: 0.02 }
            : spec.kind === "pct" ? { abs: 0.01, rel: 0.02 }
            : { abs: 1, rel: 0.01 };

  // Step 1: build the set of keyword-anchored windows for this metric.
  const windows: Array<{ text: string; keyword: string; offset: number }> = [];
  for (const re of METRIC_KEYWORDS[spec.key]) {
    for (const m of pdfAll.matchAll(re)) {
      const idx = m.index ?? 0;
      const start = Math.max(0, idx - KEYWORD_WINDOW);
      const end = Math.min(pdfAll.length, idx + m[0].length + KEYWORD_WINDOW);
      windows.push({ text: pdfAll.slice(start, end), keyword: m[0], offset: idx });
    }
  }

  // Step 2: extract kind-appropriate numeric tokens from each window.
  type Tok = { value: number; literal: string; matchedYear: number };
  const parseToks = (s: string): Tok[] => {
    const out: Tok[] = [];
    if (spec.kind === "usd") {
      for (const m of s.matchAll(/\$([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)([KMB]?)(?!\d)/g)) {
        let v = Number(m[1].replace(/,/g, ""));
        if (m[2] === "K") v *= 1_000;
        else if (m[2] === "M") v *= 1_000_000;
        else if (m[2] === "B") v *= 1_000_000_000;
        out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
      }
    } else if (spec.kind === "ratio") {
      for (const m of s.matchAll(/(-?[0-9]+(?:\.[0-9]+)?)x/g)) {
        const v = Number(m[1]);
        out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
      }
    } else if (spec.kind === "months") {
      for (const m of s.matchAll(/([0-9]+(?:\.[0-9]+)?|60\+)\s*months?/gi)) {
        const v = m[1] === "60+" ? 60 : Number(m[1]);
        out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
      }
    } else if (spec.kind === "days") {
      for (const m of s.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*days?/gi)) {
        const v = Number(m[1]);
        out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
      }
    } else if (spec.kind === "pct") {
      for (const m of s.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)) {
        const v = Number(m[1]) / 100;
        out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
      }
    } else if (spec.kind === "count") {
      const lo = Math.min(...vals.filter(v => v > 0));
      const hi = Math.max(...vals);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        const lowB = Math.max(1, Math.floor(lo * 0.5));
        const highB = Math.ceil(hi * 2);
        for (const m of s.matchAll(/\b([0-9]{1,5})\b/g)) {
          const v = Number(m[1]);
          if (v < lowB || v > highB) continue;
          out.push({ value: v, literal: m[0], matchedYear: matchYear(v, vals, tol) });
        }
      }
    }
    return out;
  };

  // Step 3: dedupe by literal token (regardless of which window
  // surfaced it) and split into matched/mismatched.
  const seen = new Set<string>();
  const matched: Tok[] = [];
  const mismatched: Tok[] = [];
  for (const w of windows) {
    for (const t of parseToks(w.text)) {
      const key = `${t.literal}@${t.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (t.matchedYear > 0) matched.push(t);
      else mismatched.push(t);
    }
  }

  // Step 4: any keyword-adjacent numeric token that doesn't match a
  // canonical Y1..Y5 is an inconsistency (Rule 4). If the metric
  // isn't quoted anywhere in narrative, the probe is INFO.
  const status: Status =
    windows.length === 0 ? "INFO"
    : mismatched.length > 0 ? "FAIL"
    : matched.length === 0 ? "INFO"
    : "PASS";

  const yearsCovered = Array.from(new Set(matched.map(m => m.matchedYear))).sort((a, b) => a - b);
  const detail = [
    `canonical truth (${spec.source}): ${formatTruth(spec, vals)}`,
    `keyword-anchored windows scanned: ${windows.length}`,
    `matched (literal → canonical year):`,
    ...(matched.length === 0
      ? [`  (none)`]
      : matched.slice(0, 16).map(o => `  - ${o.literal} → Y${o.matchedYear}`)),
    matched.length > 16 ? `  ... +${matched.length - 16} more` : "",
    `mismatched (keyword-adjacent but doesn't match any canonical Y1..Y5):`,
    ...(mismatched.length === 0
      ? [`  (none)`]
      : mismatched.slice(0, 16).map(o => `  - ${o.literal} (=${o.value}) — disagrees with canonical ${spec.source}`)),
    mismatched.length > 16 ? `  ... +${mismatched.length - 16} more` : "",
    `years with ≥1 matched occurrence: ${yearsCovered.length === 0 ? "(none)" : yearsCovered.map(y => "Y" + y).join(", ")}`,
  ].filter(Boolean).join("\n     ");
  return { id: `M.${spec.key}`, title: `Metric-location map — ${spec.label}`, status, detail };
}

// ── Report builder ────────────────────────────────────────────────
function buildReport(label: string, truth: MetricTruth, probes: ProbeResult[]): string {
  const lines: string[] = [];
  lines.push(`# Consistency report — ${label}`);
  lines.push(`# Harness: tests/consistency-harness.ts (Task #930)`);
  lines.push(``);
  lines.push(`## Canonical truth values (from underwriting workbook)`);
  lines.push(``);
  const fmtArr = (arr: number[], formatter: (n: number) => string) =>
    arr.map((v, i) => `Y${i + 1}=${formatter(v)}`).join("  ");
  lines.push(`  Total Revenue        (5-Year Operating Stmt!B5:F5)  ${fmtArr(truth.totalRevenue, fmtUSD)}`);
  lines.push(`  Change in Net Assets (5-Year Operating Stmt!B16:F16) ${fmtArr(truth.changeInNetAssets, fmtUSD)}`);
  lines.push(`  Personnel            (5-Year Operating Stmt!B8:F8)  ${fmtArr(truth.personnel, fmtUSD)}`);
  lines.push(`  Operating Expenses   (5-Year Operating Stmt!B9:F9)  ${fmtArr(truth.operatingExpenses, fmtUSD)}`);
  lines.push(`  DSCR (Normalized)    (DSCR & Covenants!B12:F12)     ${fmtArr(truth.dscrNormalized, v => fmtNum(v) + "x")}`);
  lines.push(`  Ending Cash          (DSCR & Covenants!B15:F15)     ${fmtArr(truth.endingCash, fmtUSD)}`);
  lines.push(`  Days Cash on Hand    (DSCR & Covenants!B17:F17)     ${fmtArr(truth.daysCashOnHand, v => fmtNum(v, 0) + "d")}`);
  lines.push(`  Months of Runway     (DSCR & Covenants!B18:F18)     ${fmtArr(truth.runwayMonths, v => fmtNum(v, 1) + "m")}`);
  lines.push(`  Capacity Utilization (DSCR & Covenants!B19:F19)     ${fmtArr(truth.capacityUtilization, v => fmtNum(v * 100, 0) + "%")}`);
  lines.push(`  Break-Even Enroll    (DSCR & Covenants!B25:F25)     ${fmtArr(truth.breakEvenEnrollment, v => fmtNum(v, 0))}`);
  lines.push(`  Enrollment           (Enrollment Tuition Fcst!B4:F4) ${fmtArr(truth.enrollment, v => fmtNum(v, 0))}`);
  lines.push(`  Loans                (Capital Stack!C:E)`);
  for (const l of truth.loans) {
    lines.push(`    - ${l.name}: principal=${fmtUSD(l.principal)} rate=${fmtNum(l.ratePct)}% term=${fmtNum(l.termYears, 0)}y`);
  }
  if (truth.loans.length === 0) lines.push(`    (none)`);
  lines.push(``);
  lines.push(`## Probes`);
  lines.push(``);
  const summary = { PASS: 0, FAIL: 0, INFO: 0 };
  for (const p of probes) {
    summary[p.status]++;
    lines.push(`[${p.status}] ${p.id} — ${p.title}`);
    for (const dl of p.detail.split("\n")) lines.push(`     ${dl.replace(/^ {5}/, "")}`);
    lines.push(``);
  }
  lines.push(`## Summary`);
  lines.push(`  PASS: ${summary.PASS}   FAIL: ${summary.FAIL}   INFO: ${summary.INFO}`);
  lines.push(``);
  lines.push(`# End of report.`);
  return lines.join("\n") + "\n";
}

// ── Main ──────────────────────────────────────────────────────────
let snapshotChecks = 0;
let snapshotFails = 0;
const snapshotFailures: string[] = [];
let totalProbeFails = 0;
const probeFailsByPersona: Array<{ label: string; fails: number; probes: ProbeResult[] }> = [];

async function runOne(c: PersonaCase): Promise<void> {
  const tag = `[${c.label}]`;
  const data = c.model.data as unknown as Record<string, unknown>;

  const wb = await loadWorkbook(data);
  const truth = extractTruth(wb);
  const pdf = await renderLenderPdf(data);
  const fragments = extractPdfFragments(pdf);
  const pdfAll = joinAll(fragments);

  const focused: ProbeResult[] = [
    probeRevenueTotals(truth, pdfAll),
    probeDscrFigures(truth, pdfAll),
    probeRunwayFigures(truth, pdfAll),
    probeLoanRate(truth, pdfAll),
    probeRevenueQualityHeaders(pdfAll),
    probeTuitionCoverage(c.label, truth, pdfAll),
    probeEmptyBullets(fragments),
    probeLenderReadinessEvidence(pdfAll),
    probeCrossSectionRevenue(truth, pdfAll),
  ];
  const metricMap: ProbeResult[] = METRIC_SPECS.map(spec => probeMetricMap(spec, truth, pdfAll));
  const probes = [...focused, ...metricMap];
  const personaFails = probes.filter(p => p.status === "FAIL").length;
  totalProbeFails += personaFails;
  probeFailsByPersona.push({ label: c.label, fails: personaFails, probes });

  const report = buildReport(c.label, truth, probes);
  const snapPath = path.join(SNAP_DIR, `consistency-report-${c.label}.txt`);

  if (UPDATE) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(snapPath, report);
    console.log(`${tag} wrote ${path.relative(process.cwd(), snapPath)} (${probes.length} probes, ${personaFails} FAIL)`);
    return;
  }

  if (BASELINE_MODE) {
    // Diff-against-committed-snapshot mode. Used during dev to see
    // whether a remediation fix flipped probes (snapshot drift =
    // intentional progress; refresh with --update-snapshots).
    snapshotChecks++;
    if (!fs.existsSync(snapPath)) {
      snapshotFails++;
      snapshotFailures.push(`  ${tag} snapshot missing at ${path.relative(process.cwd(), snapPath)}\n    Generate with: pnpm --filter @workspace/api-server run test:consistency-harness:baseline -- --update-snapshots`);
      return;
    }
    const expected = fs.readFileSync(snapPath, "utf8");
    if (report === expected) {
      console.log(`${tag} consistency report matches committed baseline (${probes.length} probes, ${personaFails} known-bug FAIL)`);
      return;
    }
    snapshotFails++;
    const expectedLines = expected.replace(/\n$/, "").split("\n");
    const actualLines = report.replace(/\n$/, "").split("\n");
    snapshotFailures.push(`  ${tag} snapshot drift at ${path.relative(process.cwd(), snapPath)} — if intentional, refresh with --update-snapshots:\n${diffLines(actualLines, expectedLines)}`);
    return;
  }

  // STRICT mode (default): report each persona's FAIL count;
  // exit non-zero at the end if any probe across any persona FAILs.
  console.log(`${tag} ${probes.length} probes, ${personaFails} FAIL` + (personaFails > 0 ? ` — see ${path.relative(process.cwd(), snapPath)} for the committed baseline report` : ""));
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  const mode = UPDATE ? " (UPDATE_SNAPSHOTS)" : BASELINE_MODE ? " (BASELINE — snapshot compare)" : " (STRICT)";
  console.log(`consistency-harness: ${totalProbeFails} probe FAIL across all personas${mode}`);

  if (UPDATE) return;

  if (BASELINE_MODE) {
    if (snapshotFails > 0) {
      console.error(`baseline mode: ${snapshotFails}/${snapshotChecks} personas drifted from committed snapshot`);
      console.error(snapshotFailures.join("\n"));
      process.exit(1);
    }
    return;
  }

  // STRICT default mode: fail loudly on any inconsistency, per
  // Verification Protocol step 5. The api-server `test` chain
  // will stay red until each of #908–#929 lands and flips a probe.
  if (totalProbeFails > 0) {
    console.error(`STRICT mode: ${totalProbeFails} probe(s) FAILed — exiting non-zero.`);
    for (const p of probeFailsByPersona) {
      if (p.fails === 0) continue;
      console.error(`  [${p.label}] ${p.fails} FAIL:`);
      for (const probe of p.probes) {
        if (probe.status === "FAIL") console.error(`    - ${probe.id}: ${probe.title}`);
      }
    }
    console.error(`Run \`pnpm --filter @workspace/api-server run test:consistency-harness:baseline\` to compare against the committed snapshot baseline instead.`);
    process.exit(1);
  }
  console.log(`consistency-harness: all probes PASS across all personas — remediation #908–#929 complete.`);
}

main().catch((err) => {
  console.error("consistency-harness: unexpected error", err);
  process.exit(1);
});
