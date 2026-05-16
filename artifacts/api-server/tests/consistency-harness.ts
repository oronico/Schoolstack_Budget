/**
 * Task #930 — Verification & regression harness.
 *
 * Gates the 22 remediation tasks (#908–#929) catalogued in
 * `.local/tasks/remediation/`. Renders the three seeded demo personas
 * (microschool = Oakwood, private_school = Riverside, charter_school =
 * Liberty) end-to-end through the production codepath and runs a
 * battery of "probes" against the rendered Lender Packet PDF + the
 * underwriting workbook bytes. Each probe asserts one of the bug
 * patterns from `SchoolStack_Budget_Verification_Protocol.md` — at
 * minimum:
 *
 *   1. Multiple revenue totals per packet
 *   2. Three DSCR figures per packet (Reported / Normalized / narrative)
 *   3. Multiple runway figures per packet
 *   4. Loan-rate mismatch between narrative and Capital Stack
 *   5. Off-by-one on Revenue Quality table column headers
 *   6. Tuition coverage 39% vs 137% (private persona)
 *   7. `[ ]` ASCII bullet placeholders in Executive Summary
 *   8. "Strong" Lender Readiness with 0% evidence-tagged assumptions
 *
 * Output: a deterministic, human-readable `consistency-report-<persona>.txt`
 * snapshot per persona under `tests/__snapshots__/`. The first commit
 * of this harness pins the CURRENT (failing) baseline — every probe
 * that currently reports `FAIL` is a bug the remediation tasks will
 * close. When a fix lands, the report changes, this snapshot test
 * fails, and the author refreshes the snapshot intentionally with
 * `UPDATE_SNAPSHOTS=1`.
 *
 * Standing-rule compliance (Verification Protocol §1–5):
 *   • Rule 1 — operates on freshly re-rendered packets.
 *   • Rule 3 — every truth value is sourced from a named Excel cell
 *     in the canonical registry.
 *   • Rule 4 — cross-section consistency probes assert N copies of a
 *     metric all equal the canonical cell.
 *   • Rule 5 — this harness ONLY observes and reports. It MUST NOT
 *     attempt to fix any bug it detects.
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 *
 * To refresh after an intentional fix in one of the #908–#929 tasks:
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:consistency-harness
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

const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";
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

// ── Canonical metric registry (Verification Protocol §"Canonical
//    metric registry for the harness"). Every numeric value the
//    harness compares against the rendered PDF traces to one of
//    these cells, satisfying Rule 3.
interface MetricTruth {
  totalRevenue: number[];          // 5-Year Operating Stmt!B5:F5
  changeInNetAssets: number[];     // 5-Year Operating Stmt!B16:F16  (or "Net Income" row)
  dscrNormalized: number[];        // DSCR & Covenants!B12:F12
  endingCash: number[];            // DSCR & Covenants!B15:F15
  daysCashOnHand: number[];        // DSCR & Covenants!B17:F17
  runwayMonths: number[];          // DSCR & Covenants!B18:F18
  capacityUtilization: number[];   // DSCR & Covenants!B19:F19
  breakEvenEnrollment: number[];   // DSCR & Covenants!B25:F25
  personnel: number[];             // 5-Year Operating Stmt!B8:F8
  operatingExpenses: number[];     // 5-Year Operating Stmt!B9:F9
  enrollment: number[];            // Enrollment Tuition Fcst!B4:F4
  loans: Array<{ name: string; principal: number; ratePct: number; termYears: number }>;
}

function extractRowRange(ws: ExcelJS.Worksheet, row: number, firstCol: number, count: number): number[] {
  if (row <= 0) return new Array(count).fill(0);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(cellNumber(ws, row, firstCol + i));
  return out;
}

function extractTruth(wb: ExcelJS.Workbook): MetricTruth {
  const op = wb.getWorksheet("5-Year Operating Stmt") || wb.getWorksheet("Year 1 Operating Stmt");
  const dscr = wb.getWorksheet("DSCR & Covenants");
  const enr = wb.getWorksheet("Enrollment Tuition Fcst");
  const cap = wb.getWorksheet("Capital Stack");

  const t: MetricTruth = {
    totalRevenue: [], changeInNetAssets: [], dscrNormalized: [], endingCash: [],
    daysCashOnHand: [], runwayMonths: [], capacityUtilization: [], breakEvenEnrollment: [],
    personnel: [], operatingExpenses: [], enrollment: [], loans: [],
  };

  if (op) {
    const revRow = findRowByLabel(op, "Total Revenue");
    t.totalRevenue = extractRowRange(op, revRow, 2, 5);
    let niRow = findRowByLabel(op, "Change in Net Assets");
    if (niRow <= 0) niRow = findRowByLabel(op, "Net Income");
    t.changeInNetAssets = extractRowRange(op, niRow, 2, 5);
    const personnelRow = findRowStarting(op, "Personnel");
    t.personnel = extractRowRange(op, personnelRow, 2, 5);
    let opexRow = findRowByLabel(op, "Operating Expenses");
    if (opexRow <= 0) opexRow = findRowStarting(op, "Total Operating Expenses");
    if (opexRow <= 0) opexRow = findRowStarting(op, "Operating Expenses");
    t.operatingExpenses = extractRowRange(op, opexRow, 2, 5);
  }

  if (dscr) {
    let dscrRow = findRowByLabel(dscr, "DSCR (Normalized)");
    if (dscrRow <= 0) dscrRow = findRowStarting(dscr, "DSCR (Normalized");
    if (dscrRow <= 0) dscrRow = findRowByLabel(dscr, "DSCR");
    t.dscrNormalized = extractRowRange(dscr, dscrRow, 2, 5);

    const cashRow = findRowStarting(dscr, "Ending Cash");
    t.endingCash = extractRowRange(dscr, cashRow, 2, 5);
    const dcohRow = findRowStarting(dscr, "Days Cash");
    t.daysCashOnHand = extractRowRange(dscr, dcohRow, 2, 5);
    const runwayRow = findRowStarting(dscr, "Months of Runway");
    t.runwayMonths = extractRowRange(dscr, runwayRow > 0 ? runwayRow : findRowStarting(dscr, "Runway"), 2, 5);
    const utilRow = findRowByLabel(dscr, "Capacity Utilization");
    t.capacityUtilization = extractRowRange(dscr, utilRow, 2, 5);
    const breakRow = findRowStarting(dscr, "Break-Even");
    t.breakEvenEnrollment = extractRowRange(dscr, breakRow, 2, 5);
  }

  if (enr) {
    let enrRow = findRowStarting(enr, "Total Students");
    if (enrRow <= 0) enrRow = findRowStarting(enr, "Enrollment");
    t.enrollment = extractRowRange(enr, enrRow, 2, 5);
  }

  if (cap) {
    // Capital Stack uses column 1 for instrument name; columns C/D/E (3/4/5)
    // for principal/rate/term per the registry. Walk every row whose
    // type column reads "Loan".
    cap.eachRow((_row, n) => {
      const type = cellString(cap, n, 2);
      if (type !== "Loan") return;
      const name = cellString(cap, n, 1);
      const principal = cellNumber(cap, n, 3);
      const rate = cellNumber(cap, n, 4);
      const term = cellNumber(cap, n, 5);
      if (!name || principal === 0) return;
      // Excel stores PCT-formatted cells as fractions in [0,1];
      // surface as percent for narrative comparison.
      t.loans.push({ name, principal, ratePct: rate > 1 ? rate : rate * 100, termYears: term });
    });
  }

  return t;
}

// ── PDF text helpers ──────────────────────────────────────────────
// extractPdfFragments returns one entry per `(...)` literal, with
// `--- PAGE N ---` markers between pages. For pattern matching we
// join each page's fragments back into a single string (PDFKit kerning
// splits "Cash Runway: 60+ months" across 6 fragments, so per-fragment
// regex misses it).
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

// Parse all "$1,234,567" dollar tokens out of a string, dedup-preserving order.
function dollarTokens(s: string): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  for (const m of s.matchAll(/\$([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?(?!\d)/g)) {
    const raw = m[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    const num = Number(m[1].replace(/,/g, "")) + (m[0].includes(".") ? Number("0." + (m[0].split(".")[1] || "0")) : 0);
    out.push(num);
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

// ── Probes ────────────────────────────────────────────────────────
function probeRevenueTotals(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.totalRevenue[0] ?? 0;
  // Find every $ figure that appears within ~25 chars of a "Revenue"
  // / "Total Revenue" / "revenue projected" keyword.
  const candidates: number[] = [];
  for (const m of pdfAll.matchAll(/(Total Revenue|projects? \$[\d,]+|in (?:Y1|Year 1)|revenue)/gi)) {
    const idx = m.index ?? 0;
    const window = pdfAll.slice(Math.max(0, idx - 80), idx + 120);
    for (const d of dollarTokens(window)) {
      if (d > 50_000 && d < 1_000_000_000) candidates.push(d);
    }
  }
  // Look at "projects $N" specifically — narrative copies the Y1
  // headline revenue in multiple places and should agree.
  const projectsMatches: number[] = [];
  for (const m of pdfAll.matchAll(/projects? \$([0-9,]+)/g)) {
    projectsMatches.push(Number(m[1].replace(/,/g, "")));
  }
  const distinctProjects = Array.from(new Set(projectsMatches));
  const matchesTruth = distinctProjects.filter(v => nearlyEqual(v, y1Truth));
  const offTruth = distinctProjects.filter(v => !nearlyEqual(v, y1Truth));

  const status: Status = distinctProjects.length === 0
    ? "INFO"
    : (distinctProjects.length === 1 && offTruth.length === 0)
      ? "PASS"
      : "FAIL";
  const detail = [
    `canonical Y1 Total Revenue (5-Year Operating Stmt!B5) = ${fmtUSD(y1Truth)}`,
    `"projects $N" narrative occurrences: ${projectsMatches.length} (distinct values: ${distinctProjects.length})`,
    `  distinct values: ${distinctProjects.map(fmtUSD).join(", ") || "(none)"}`,
    `  matching truth:  ${matchesTruth.map(fmtUSD).join(", ") || "(none)"}`,
    `  diverging:       ${offTruth.map(fmtUSD).join(", ") || "(none)"}`,
    `revenue-context $ tokens found (loose scan): ${Array.from(new Set(candidates)).length} distinct`,
  ].join("\n     ");
  return { id: "B1.revenue-totals", title: "Multiple revenue totals per packet", status, detail };
}

function probeDscrFigures(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.dscrNormalized[0] ?? 0;
  // Narrative DSCR mentions: "DSCR holds at Nx", "DSCR moves from N to N",
  // "DSCR is Nx", "DSCR would read Nx", "Year 1 DSCR ... Nx".
  const vals: number[] = [];
  for (const m of pdfAll.matchAll(/DSCR\s+(?:holds at|is|would read|moves from|moves to)\s+(-?[0-9]+(?:\.[0-9]+)?)x/gi)) {
    vals.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/Year[- ]?1[^.]{0,30}DSCR[^.]{0,30}?(-?[0-9]+(?:\.[0-9]+)?)x/gi)) {
    vals.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/DSCR of (-?[0-9]+(?:\.[0-9]+)?)x/g)) vals.push(Number(m[1]));

  // The "DSCR (Reported)" + "DSCR (Normalized)" twin-column table is
  // ITSELF a known-bug source (#917 / #918 — three DSCRs per packet).
  // Count its presence as evidence.
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
  return { id: "B2.dscr-figures", title: "Multiple DSCR figures per packet", status, detail };
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
  const offTruth = distinct.filter(v => !nearlyEqual(v, y1Truth, 0.5, 0.05) && !(v === 60 && y1Truth >= 60));

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
  return { id: "B3.runway-figures", title: "Multiple runway figures per packet", status, detail };
}

function probeLoanRate(truth: MetricTruth, pdfAll: string): ProbeResult {
  if (truth.loans.length === 0) {
    return { id: "B4.loan-rate", title: "Loan-rate narrative ↔ Capital Stack parity", status: "INFO", detail: "no loans in Capital Stack" };
  }
  const narrativeRates: number[] = [];
  for (const m of pdfAll.matchAll(/Loan interest rate:\s+([0-9]+(?:\.[0-9]+)?)\s*%/gi)) {
    narrativeRates.push(Number(m[1]));
  }
  for (const m of pdfAll.matchAll(/(?:at|of)\s+([0-9]+(?:\.[0-9]+)?)\s*%\s+(?:loan rate|interest)/gi)) {
    narrativeRates.push(Number(m[1]));
  }
  const truthRates = truth.loans.map(l => Math.round(l.ratePct * 100) / 100);
  const allMatch = narrativeRates.every(r => truthRates.some(t => nearlyEqual(r, t, 0.05, 0.01)));

  const status: Status =
    narrativeRates.length === 0 ? "INFO"
    : allMatch ? "PASS" : "FAIL";
  const detail = [
    `Capital Stack loans: ${truth.loans.map(l => `${l.name} (${fmtNum(l.ratePct)}%, ${fmtUSD(l.principal)}, ${fmtNum(l.termYears, 0)}y)`).join("; ") || "(none)"}`,
    `narrative "Loan interest rate: N%" occurrences: ${narrativeRates.length}`,
    `  values: ${narrativeRates.map(v => fmtNum(v) + "%").join(", ") || "(none)"}`,
    `  all match a Capital Stack loan: ${allMatch}`,
  ].join("\n     ");
  return { id: "B4.loan-rate", title: "Loan-rate narrative ↔ Capital Stack parity", status, detail };
}

function probeRevenueQualityHeaders(pdfAll: string): ProbeResult {
  // Off-by-one bug: Revenue Quality table column headers print
  // "Year 2 / Year 3 / Year 4 / Year 5 / Year 6" (or any starting > 1)
  // instead of Year 1..5.
  const offByOne = /Year ?2[^A-Za-z]{1,6}Year ?3[^A-Za-z]{1,6}Year ?4[^A-Za-z]{1,6}Year ?5[^A-Za-z]{1,6}Year ?6/.test(pdfAll);
  // Look for the Revenue Quality section vicinity.
  const rqIdx = pdfAll.search(/Revenue Quality/i);
  let nearbyHeaders = "";
  if (rqIdx >= 0) {
    const window = pdfAll.slice(rqIdx, rqIdx + 600);
    const m = window.match(/Year ?\d+(?:[^A-Za-z]{1,8}Year ?\d+){2,}/);
    if (m) nearbyHeaders = m[0];
  }
  const status: Status = offByOne ? "FAIL" : (rqIdx >= 0 ? "PASS" : "INFO");
  const detail = [
    `Revenue Quality section found: ${rqIdx >= 0}`,
    `nearby header sequence: ${JSON.stringify(nearbyHeaders) || "(none)"}`,
    `off-by-one (Year 2..Year 6) detected anywhere: ${offByOne}`,
  ].join("\n     ");
  return { id: "B5.rev-quality-headers", title: "Revenue Quality column-header off-by-one", status, detail };
}

function probeTuitionCoverage(label: string, truth: MetricTruth, pdfAll: string): ProbeResult {
  // Narrative says "Tuition covers N%" — verify against canonical
  // (Total Revenue − OpEx). Spec calls out 39% vs 137% mismatch on
  // the private (Riverside) persona specifically.
  const matches: number[] = [];
  for (const m of pdfAll.matchAll(/Tuition covers\s+(-?[0-9]+(?:\.[0-9]+)?)\s*%/gi)) {
    matches.push(Number(m[1]));
  }
  // Hand-calc a plausible "tuition covers opex" ratio for context.
  // We don't have tuition-only revenue here without re-running
  // computeYearFinancialsFromData; emit informational truth derived
  // from totalRev/opex so a reader can sanity-check whether the
  // narrative number is even in the right ballpark.
  const y1Rev = truth.totalRevenue[0] ?? 0;
  const y1Opex = truth.operatingExpenses[0] ?? 0;
  const totalCoverage = y1Opex > 0 ? (y1Rev / y1Opex) * 100 : 0;

  const distinct = Array.from(new Set(matches.map(v => Math.round(v))));
  const status: Status =
    matches.length === 0 ? "INFO"
    : distinct.length === 1 ? "PASS" : "FAIL";
  const detail = [
    `narrative "Tuition covers N%" occurrences: ${matches.length} (distinct: ${distinct.length})`,
    `  distinct: ${distinct.map(v => v + "%").join(", ") || "(none)"}`,
    `for-context: total Y1 Revenue ÷ Y1 OpEx = ${fmtNum(totalCoverage, 0)}% (not the same metric, but a sanity envelope)`,
    `persona: ${label} — spec calls out 39% vs 137% on private (Riverside)`,
  ].join("\n     ");
  return { id: "B6.tuition-coverage", title: "Tuition coverage % narrative vs source", status, detail };
}

function probeEmptyBullets(fragments: string[]): ProbeResult {
  // Joined-page detection: count fragments that are exactly "[ ] " or
  // "[ ]". These are the unrendered ASCII checkbox placeholders.
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
  const status: Status = emptyCount > 0 ? "FAIL" : "PASS";
  const detail = [
    `ASCII "[ ]" placeholder bullets:  ${emptyCount}`,
    `ASCII "[+]" passing bullets:      ${plusCount}`,
    `ASCII "[~]" caution bullets:      ${tildeCount}`,
    `ASCII "[!]" warning bullets:      ${bangCount}`,
    emptyCount > 0
      ? `  → empty checkboxes leak into rendered packet (Task #908 / #909 scope).`
      : `  → all bullets carry a status glyph.`,
  ].join("\n     ");
  return { id: "B7.empty-bullets", title: "Unrendered `[ ]` ASCII bullets in PDF", status, detail };
}

function probeLenderReadinessEvidence(pdfAll: string, fragments: string[]): ProbeResult {
  // "Lender Readiness: Strong" with 0% (or very low) evidence-tagged
  // assumptions is the #920 / #924 pattern. We look at:
  //   - the verdict string ("Lender Readiness: Strong/Almost There/Needs Work")
  //   - any "N% of assumptions ... evidence" / "evidence-tagged" mention nearby
  const readinessMatches = Array.from(pdfAll.matchAll(/Lender Readiness:\s+(Strong|Almost There|Needs Work|Adequate|Not Ready)/gi));
  const verdicts = Array.from(new Set(readinessMatches.map(m => m[1])));
  let evidencePct: number | null = null;
  const evidMatches = pdfAll.match(/([0-9]+)\s*%\s+of (?:assumptions|inputs)/i);
  if (evidMatches) evidencePct = Number(evidMatches[1]);
  // Also probe for "0 of N tagged" or "no assumptions tagged" wording.
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
    `  → bug pattern: verdict=Strong with 0% / no-evidence claim leaks confidence the data doesn't support`,
    `  (raw "Strong" fragments seen: ${fragments.filter(f => f.trim() === "Strong").length})`,
  ].join("\n     ");
  return { id: "B8.readiness-evidence", title: "\"Strong\" Lender Readiness with 0% evidence", status, detail };
}

// Cross-section consistency check for headline Y1 metrics. We list
// every appearance of a given metric in the PDF and assert they all
// equal the canonical cell — satisfies Rule 4.
function probeCrossSectionRevenue(truth: MetricTruth, pdfAll: string): ProbeResult {
  const y1Truth = truth.totalRevenue[0] ?? 0;
  // Catch "projects $N in Y1" / "projects $N for Y1" narrative.
  const seen: number[] = [];
  for (const m of pdfAll.matchAll(/(?:projects?|projected|projecting)\s+\$([0-9,]+)/gi)) {
    seen.push(Number(m[1].replace(/,/g, "")));
  }
  for (const m of pdfAll.matchAll(/Total Revenue[^$]{0,30}\$([0-9,]+)/g)) {
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

// ── Report builder ────────────────────────────────────────────────
function buildReport(label: string, truth: MetricTruth, probes: ProbeResult[]): string {
  const lines: string[] = [];
  lines.push(`# Consistency report — ${label}`);
  lines.push(`# Harness: tests/consistency-harness.ts (Task #930)`);
  lines.push(``);
  lines.push(`## Canonical truth values (extracted from underwriting workbook)`);
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

async function runOne(c: PersonaCase): Promise<void> {
  const tag = `[${c.label}]`;
  const data = c.model.data as unknown as Record<string, unknown>;

  const wb = await loadWorkbook(data);
  const truth = extractTruth(wb);
  const pdf = await renderLenderPdf(data);
  const fragments = extractPdfFragments(pdf);
  const pdfAll = joinAll(fragments);

  const probes: ProbeResult[] = [
    probeRevenueTotals(truth, pdfAll),
    probeDscrFigures(truth, pdfAll),
    probeRunwayFigures(truth, pdfAll),
    probeLoanRate(truth, pdfAll),
    probeRevenueQualityHeaders(pdfAll),
    probeTuitionCoverage(c.label, truth, pdfAll),
    probeEmptyBullets(fragments),
    probeLenderReadinessEvidence(pdfAll, fragments),
    probeCrossSectionRevenue(truth, pdfAll),
  ];

  const report = buildReport(c.label, truth, probes);
  const snapPath = path.join(SNAP_DIR, `consistency-report-${c.label}.txt`);

  if (UPDATE) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(snapPath, report);
    console.log(`${tag} wrote ${path.relative(process.cwd(), snapPath)} (${probes.length} probes, ${probes.filter(p => p.status === "FAIL").length} FAIL)`);
    passed++;
    return;
  }

  if (!fs.existsSync(snapPath)) {
    check(`${tag} snapshot exists at ${path.relative(process.cwd(), snapPath)}`, false,
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:consistency-harness`);
    return;
  }
  const expected = fs.readFileSync(snapPath, "utf8");
  if (report === expected) {
    passed++;
    const failCount = probes.filter(p => p.status === "FAIL").length;
    console.log(`${tag} consistency report matches snapshot (${probes.length} probes, ${failCount} known-bug FAILs pending remediation)`);
    return;
  }
  const expectedLines = expected.replace(/\n$/, "").split("\n");
  const actualLines = report.replace(/\n$/, "").split("\n");
  const detail = [
    `    Snapshot mismatch for ${path.relative(process.cwd(), snapPath)}.`,
    `    If this change is intentional (a remediation task #908–#929 fixed a probe),`,
    `    refresh with:`,
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:consistency-harness`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} consistency report matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`consistency-harness: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("consistency-harness: unexpected error", err);
  process.exit(1);
});
