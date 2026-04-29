import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, ensureSpace,
  BRAND, type PDFDoc, type TableColumn,
} from "./pdf-utils.js";

// What the client posts when it asks for a board-ready PDF of the
// side-by-side decision comparison. The two impacts have already been
// computed against the founder's current base model client-side; we just
// render them. Keeping the math on the client and the layout on the server
// avoids duplicating the decision-flow engine.
export interface DecisionComparisonRequest {
  schoolName?: string;
  primary: DecisionComparisonSide;
  compare: DecisionComparisonSide;
}

export interface DecisionComparisonSide {
  // Founder-given scenario name, e.g. "Annex on Birch St."
  label: string;
  // Decision type label, e.g. "Evaluate a site". Optional.
  decisionLabel?: string;
  // Founder narrative captured at save time. Optional.
  narrative?: string;
  impact: SerializedDecisionImpact;
}

export interface SerializedScenarioMetrics {
  revenue: number[];
  netIncome: number[];
  netMargin: number[];
  dscr: number[];
  breakEvenYear: number | null;
  cashRunwayMonths: number;
}

export interface SerializedDecisionImpact {
  base: SerializedScenarioMetrics;
  adjusted: SerializedScenarioMetrics;
  deltas: {
    revenue: number[];
    netIncome: number[];
    breakEvenYearShift: number | null;
    cashRunwayDeltaMonths: number;
  };
  nudges: { signal: "green" | "amber" | "red"; label: string; message: string }[];
}

// --- Validation ----------------------------------------------------------

function isFiniteNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

function isMetrics(v: unknown): v is SerializedScenarioMetrics {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isFiniteNumberArray(o.revenue) &&
    isFiniteNumberArray(o.netIncome) &&
    isFiniteNumberArray(o.netMargin) &&
    isFiniteNumberArray(o.dscr) &&
    (o.breakEvenYear === null || typeof o.breakEvenYear === "number") &&
    typeof o.cashRunwayMonths === "number"
  );
}

function isSide(v: unknown): v is DecisionComparisonSide {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.label !== "string") return false;
  const im = o.impact as Record<string, unknown> | undefined;
  if (!im) return false;
  if (!isMetrics(im.base) || !isMetrics(im.adjusted)) return false;
  const d = im.deltas as Record<string, unknown> | undefined;
  if (!d) return false;
  if (!isFiniteNumberArray(d.revenue) || !isFiniteNumberArray(d.netIncome)) return false;
  if (!(d.breakEvenYearShift === null || typeof d.breakEvenYearShift === "number")) return false;
  if (typeof d.cashRunwayDeltaMonths !== "number") return false;
  if (!Array.isArray(im.nudges)) return false;
  return true;
}

export function validateDecisionComparisonRequest(body: unknown): DecisionComparisonRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isSide(b.primary) || !isSide(b.compare)) return null;
  return {
    schoolName: typeof b.schoolName === "string" ? b.schoolName : undefined,
    primary: b.primary,
    compare: b.compare,
  };
}

// --- Formatters (mirror the on-screen ImpactComparison) ------------------

function fmtMoney(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function fmtMoneyDelta(v: number): string {
  if (v === 0) return "$0";
  return (v > 0 ? "+" : "") + fmtMoney(v);
}

function fmtBreakEven(shift: number | null): string {
  if (shift === null) return "—";
  if (shift === 0) return "Same";
  return shift > 0 ? `+${shift}y` : `${shift}y`;
}

function fmtRunway(months: number): string {
  if (months === 0) return "0 mo";
  return `${months > 0 ? "+" : ""}${months.toFixed(1)} mo`;
}

function fmtRunwayAbs(months: number): string {
  return months >= 60 ? "60+ mo" : `${months.toFixed(0)} mo`;
}

// File name like "ComparisonA_vs_B.pdf" — strip illegal characters.
export function buildComparisonFileName(primaryLabel: string, compareLabel: string): string {
  const safe = (s: string) =>
    (s || "Scenario").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Scenario";
  return `Decision_Comparison_${safe(primaryLabel)}_vs_${safe(compareLabel)}.pdf`;
}

// --- Layout helpers ------------------------------------------------------

interface HeadlineTile {
  label: string;
  primaryDisplay: string;
  primarySub: string;
  compareDisplay: string;
  compareSub: string;
  // Winner side, if any. null for ties or non-comparable.
  winner: "primary" | "compare" | null;
}

function decideWinner(
  primary: number | null,
  compare: number | null,
  higherIsBetter: boolean,
): "primary" | "compare" | null {
  if (primary === null || compare === null) return null;
  if (!isFinite(primary) || !isFinite(compare)) return null;
  if (primary === compare) return null;
  if (higherIsBetter) return primary > compare ? "primary" : "compare";
  return primary < compare ? "primary" : "compare";
}

function buildHeadlineTiles(
  primary: SerializedDecisionImpact,
  compare: SerializedDecisionImpact,
): HeadlineTile[] {
  return [
    {
      label: "Y5 net income vs base",
      primaryDisplay: fmtMoneyDelta(primary.deltas.netIncome[4] ?? 0),
      primarySub: `to ${fmtMoney(primary.adjusted.netIncome[4] ?? 0)}`,
      compareDisplay: fmtMoneyDelta(compare.deltas.netIncome[4] ?? 0),
      compareSub: `to ${fmtMoney(compare.adjusted.netIncome[4] ?? 0)}`,
      winner: decideWinner(
        primary.deltas.netIncome[4] ?? 0,
        compare.deltas.netIncome[4] ?? 0,
        true,
      ),
    },
    {
      label: "Y5 revenue vs base",
      primaryDisplay: fmtMoneyDelta(primary.deltas.revenue[4] ?? 0),
      primarySub: `to ${fmtMoney(primary.adjusted.revenue[4] ?? 0)}`,
      compareDisplay: fmtMoneyDelta(compare.deltas.revenue[4] ?? 0),
      compareSub: `to ${fmtMoney(compare.adjusted.revenue[4] ?? 0)}`,
      winner: decideWinner(
        primary.deltas.revenue[4] ?? 0,
        compare.deltas.revenue[4] ?? 0,
        true,
      ),
    },
    {
      label: "Break-even shift",
      primaryDisplay: fmtBreakEven(primary.deltas.breakEvenYearShift),
      primarySub: `to Y${primary.adjusted.breakEvenYear ?? "-"}`,
      compareDisplay: fmtBreakEven(compare.deltas.breakEvenYearShift),
      compareSub: `to Y${compare.adjusted.breakEvenYear ?? "-"}`,
      // Lower (more negative) = pulled in sooner = better.
      winner: decideWinner(
        primary.deltas.breakEvenYearShift,
        compare.deltas.breakEvenYearShift,
        false,
      ),
    },
    {
      label: "Cash runway vs base",
      primaryDisplay: fmtRunway(primary.deltas.cashRunwayDeltaMonths),
      primarySub: `to ${fmtRunwayAbs(primary.adjusted.cashRunwayMonths)}`,
      compareDisplay: fmtRunway(compare.deltas.cashRunwayDeltaMonths),
      compareSub: `to ${fmtRunwayAbs(compare.adjusted.cashRunwayMonths)}`,
      winner: decideWinner(
        primary.deltas.cashRunwayDeltaMonths,
        compare.deltas.cashRunwayDeltaMonths,
        true,
      ),
    },
  ];
}

function drawAvsBHeader(doc: PDFDoc, primary: DecisionComparisonSide, compare: DecisionComparisonSide) {
  const margin = doc.page.margins.left;
  const totalW = doc.page.width - margin * 2;
  const colW = (totalW - 10) / 2;
  const h = 38;
  ensureSpace(doc, h + 6);
  const y = doc.y;

  doc.save();
  // A side — navy accent
  doc.rect(margin, y, colW, h).fill(BRAND.lightGray);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
  doc.text("A", margin + 8, y + 6, { lineBreak: false });
  if (primary.decisionLabel) {
    doc.font("Helvetica").fontSize(7).fillColor(BRAND.darkGray);
    doc.text(primary.decisionLabel.toUpperCase(), margin + 18, y + 6, { lineBreak: false });
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.black);
  doc.text(primary.label, margin + 8, y + 18, { width: colW - 16, lineBreak: false, ellipsis: true });

  // B side — teal accent
  const bx = margin + colW + 10;
  doc.rect(bx, y, colW, h).fill("#CCFBF1"); // teal-100
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.teal);
  doc.text("B", bx + 8, y + 6, { lineBreak: false });
  if (compare.decisionLabel) {
    doc.font("Helvetica").fontSize(7).fillColor(BRAND.darkGray);
    doc.text(compare.decisionLabel.toUpperCase(), bx + 18, y + 6, { lineBreak: false });
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.black);
  doc.text(compare.label, bx + 8, y + 18, { width: colW - 16, lineBreak: false, ellipsis: true });
  doc.restore();

  doc.y = y + h + 8;
}

function drawHeadlineTiles(doc: PDFDoc, tiles: HeadlineTile[]) {
  const margin = doc.page.margins.left;
  const totalW = doc.page.width - margin * 2;
  const gap = 8;
  const tileW = (totalW - gap * 3) / 4;
  const tileH = 64;

  ensureSpace(doc, tileH + 6);
  const y = doc.y;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const x = margin + i * (tileW + gap);

    doc.save();
    // Outer card
    doc.roundedRect(x, y, tileW, tileH, 4).fillAndStroke("#F8FAFC", "#E2E8F0");

    // Label
    doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.darkGray);
    doc.text(t.label.toUpperCase(), x + 6, y + 5, { width: tileW - 12, lineBreak: false });

    // Two value cells
    const cellY = y + 18;
    const cellH = tileH - 22;
    const cellW = (tileW - 14) / 2;

    drawHeadlineCell(doc, "A", t.primaryDisplay, t.primarySub, t.winner === "primary",
      x + 4, cellY, cellW, cellH);
    drawHeadlineCell(doc, "B", t.compareDisplay, t.compareSub, t.winner === "compare",
      x + 4 + cellW + 6, cellY, cellW, cellH);
    doc.restore();
  }

  doc.y = y + tileH + 8;
}

function drawHeadlineCell(
  doc: PDFDoc,
  side: "A" | "B",
  display: string,
  sub: string,
  isWinner: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const fill = isWinner ? "#DCFCE7" : "#FFFFFF"; // emerald-100 vs white
  const stroke = isWinner ? BRAND.green : "#E2E8F0";
  doc.save();
  doc.roundedRect(x, y, w, h, 3).fillAndStroke(fill, stroke);

  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(isWinner ? BRAND.green : BRAND.darkGray);
  doc.text(side, x + 4, y + 3, { lineBreak: false });

  if (isWinner) {
    // Winner marker — small "BEST" pill in the top-right corner of the cell.
    // We avoid Unicode glyphs (star/checkmark) because PDFKit's standard
    // Helvetica only ships with WinAnsi-encoded characters.
    doc.font("Helvetica-Bold").fontSize(6).fillColor(BRAND.green);
    doc.text("BEST", x + w - 24, y + 3, { width: 22, align: "right", lineBreak: false });
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor(isWinner ? "#047857" : BRAND.black);
  doc.text(display, x + 4, y + 13, { width: w - 8, lineBreak: false, ellipsis: true });

  doc.font("Helvetica").fontSize(6.5).fillColor(BRAND.darkGray);
  doc.text(sub, x + 4, y + 27, { width: w - 8, lineBreak: false, ellipsis: true });
  doc.restore();
}

// Per-year side-by-side table.
function drawPerYearTable(
  doc: PDFDoc,
  primary: SerializedDecisionImpact,
  compare: SerializedDecisionImpact,
) {
  // Reset cursor x before section title — previous draw helpers (tiles,
  // two-column text) leave doc.x sitting inside a column, which would make
  // subSection's plain doc.text(...) wrap into a narrow strip.
  doc.x = doc.page.margins.left;
  subSection(doc, "5-year impact, side-by-side");

  const yearCount = Math.max(
    primary.deltas.netIncome.length,
    compare.deltas.netIncome.length,
    5,
  );
  const labelW = 120;
  const sideW = 30;
  const totalW = doc.page.width - doc.page.margins.left * 2;
  const yearW = (totalW - labelW - sideW) / yearCount;

  const cols: TableColumn[] = [
    { header: "Metric", width: labelW },
    { header: "Side", width: sideW },
    ...Array.from({ length: yearCount }, (_, i) => ({
      header: `Y${i + 1}`,
      width: yearW,
      align: "right" as const,
    })),
  ];

  const rows: string[][] = [];
  const buildRow = (
    label: string,
    side: "A" | "B",
    values: number[],
    fmt: (n: number) => string,
  ) => [label, side, ...Array.from({ length: yearCount }, (_, i) => fmt(values[i] ?? 0))];

  rows.push(buildRow("Net income vs base", "A", primary.deltas.netIncome, fmtMoneyDelta));
  rows.push(buildRow("", "B", compare.deltas.netIncome, fmtMoneyDelta));
  rows.push(buildRow("Revenue vs base", "A", primary.deltas.revenue, fmtMoneyDelta));
  rows.push(buildRow("", "B", compare.deltas.revenue, fmtMoneyDelta));
  rows.push(buildRow("DSCR after", "A", primary.adjusted.dscr, (n) => isFinite(n) ? n.toFixed(2) : "-"));
  rows.push(buildRow("", "B", compare.adjusted.dscr, (n) => isFinite(n) ? n.toFixed(2) : "-"));
  rows.push(buildRow("Net margin after", "A", primary.adjusted.netMargin, (n) => `${(n * 100).toFixed(1)}%`));
  rows.push(buildRow("", "B", compare.adjusted.netMargin, (n) => `${(n * 100).toFixed(1)}%`));

  drawTable(doc, cols, rows, { zebra: true });
}

function drawNarratives(doc: PDFDoc, primary: DecisionComparisonSide, compare: DecisionComparisonSide) {
  if (!primary.narrative?.trim() && !compare.narrative?.trim()) return;
  doc.x = doc.page.margins.left;
  subSection(doc, "Why each decision");
  drawTwoColumnText(
    doc,
    { heading: `A — ${primary.label}`, body: primary.narrative?.trim() || "No narrative captured." },
    { heading: `B — ${compare.label}`, body: compare.narrative?.trim() || "No narrative captured." },
    BRAND.navy,
    BRAND.teal,
  );
}

function drawNudges(doc: PDFDoc, primary: DecisionComparisonSide, compare: DecisionComparisonSide) {
  const aHas = primary.impact.nudges.length > 0;
  const bHas = compare.impact.nudges.length > 0;
  if (!aHas && !bHas) return;
  doc.x = doc.page.margins.left;
  subSection(doc, "Flags & nudges");

  const formatNudges = (ns: SerializedDecisionImpact["nudges"]) => {
    if (ns.length === 0) return "No flags raised.";
    return ns
      .map((n) => {
        const sigil = n.signal === "green" ? "[OK]" : n.signal === "amber" ? "[Watch]" : "[Risk]";
        return `${sigil} ${n.label}: ${n.message}`;
      })
      .join("\n");
  };

  drawTwoColumnText(
    doc,
    { heading: `A — ${primary.label}`, body: formatNudges(primary.impact.nudges) },
    { heading: `B — ${compare.label}`, body: formatNudges(compare.impact.nudges) },
    BRAND.navy,
    BRAND.teal,
  );
}

// Render two columns of text starting at doc.y, advancing doc.y past the
// taller column. PDFKit columns are tricky because the text cursor mutates
// shared state, so we measure each side and reset y between.
function drawTwoColumnText(
  doc: PDFDoc,
  left: { heading: string; body: string },
  right: { heading: string; body: string },
  leftAccent: string,
  rightAccent: string,
) {
  const margin = doc.page.margins.left;
  const totalW = doc.page.width - margin * 2;
  const gap = 12;
  const colW = (totalW - gap) / 2;

  ensureSpace(doc, 60);
  const startY = doc.y;
  const leftX = margin;
  const rightX = margin + colW + gap;

  doc.save();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(leftAccent);
  doc.text(left.heading, leftX, startY, { width: colW, lineBreak: true });
  const afterLeftHeading = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
  doc.text(left.body, leftX, afterLeftHeading, { width: colW, lineGap: 2 });
  const leftEnd = doc.y;
  doc.restore();

  doc.save();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(rightAccent);
  doc.text(right.heading, rightX, startY, { width: colW, lineBreak: true });
  const afterRightHeading = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
  doc.text(right.body, rightX, afterRightHeading, { width: colW, lineGap: 2 });
  const rightEnd = doc.y;
  doc.restore();

  doc.y = Math.max(leftEnd, rightEnd) + 4;
}

// --- Main entrypoint -----------------------------------------------------

export async function generateDecisionComparisonPDF(
  input: DecisionComparisonRequest,
): Promise<Buffer> {
  const doc = createDoc();

  const subtitle = input.schoolName
    ? `${input.schoolName} — board-ready scenario comparison`
    : "Board-ready scenario comparison";
  drawHeader(doc, "Decision Comparison", subtitle);

  drawAvsBHeader(doc, input.primary, input.compare);

  doc.x = doc.page.margins.left;
  sectionTitle(doc, "Headline outcomes");
  bodyText(
    doc,
    "The better number on each metric is highlighted. Use this as the at-a-glance summary you'd present to the board.",
  );
  const tiles = buildHeadlineTiles(input.primary.impact, input.compare.impact);
  drawHeadlineTiles(doc, tiles);

  drawPerYearTable(doc, input.primary.impact, input.compare.impact);

  drawNarratives(doc, input.primary, input.compare);
  drawNudges(doc, input.primary, input.compare);

  drawFooter(doc);
  return docToBuffer(doc);
}
