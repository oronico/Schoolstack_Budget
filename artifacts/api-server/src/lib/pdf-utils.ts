import PDFDocument from "pdfkit";

export const BRAND = {
  green: "#16A34A",
  navy: "#1E293B",
  teal: "#0D9488",
  amber: "#D97706",
  cream: "#FAF9F7",
  white: "#FFFFFF",
  lightGray: "#F1F5F9",
  gray: "#94A3B8",
  darkGray: "#475569",
  red: "#E11D48",
  black: "#0F172A",
};

export type PDFDoc = InstanceType<typeof PDFDocument>;

export function createDoc(): PDFDoc {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: "SchoolStack Budget Report",
      Author: "SchoolStack.ai",
      Creator: "SchoolStack Budget",
    },
    bufferPages: true,
  });
  return doc;
}

export function drawHeader(doc: PDFDoc, title: string, subtitle?: string) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const barH = 60;

  doc.save();
  doc.rect(0, 0, pageW, barH).fill(BRAND.navy);

  doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 20, { continued: false });

  const rightText = "by SchoolStack.ai";
  const rtW = doc.widthOfString(rightText);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.gray);
  doc.text(rightText, pageW - margin - rtW, 26);
  doc.restore();

  doc.y = barH + 20;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND.navy);
  doc.text(title, margin, doc.y, { align: "left" });
  if (subtitle) {
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor(BRAND.darkGray);
    doc.text(subtitle, { align: "left" });
  }
  doc.moveDown(1);
}

export function sectionTitle(doc: PDFDoc, text: string) {
  const margin = doc.page.margins.left;
  const w = doc.page.width - margin * 2;

  ensureSpace(doc, 45);
  doc.moveDown(0.3);
  doc.save();
  doc.rect(margin, doc.y, w, 22).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.white);
  doc.text(text, margin + 8, doc.y + 5, { width: w - 16, lineBreak: false });
  doc.restore();
  doc.y += 26;
}

export function subSection(doc: PDFDoc, text: string) {
  ensureSpace(doc, 30);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
  doc.text(text);
  doc.moveDown(0.3);
}

export function bodyText(doc: PDFDoc, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(BRAND.black);
  doc.text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

export function labelValue(doc: PDFDoc, label: string, value: string) {
  const margin = doc.page.margins.left;
  ensureSpace(doc, 16);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(label, margin, doc.y, { continued: true, width: 200 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.black);
  doc.text(`  ${value}`, { align: "left" });
}

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
}

export function drawTable(doc: PDFDoc, columns: TableColumn[], rows: string[][], options?: { highlightLastRow?: boolean; zebra?: boolean }) {
  const margin = doc.page.margins.left;
  const rowH = 20;
  const headerH = 22;
  const totalW = columns.reduce((s, c) => s + c.width, 0);

  ensureSpace(doc, headerH + rowH * Math.min(rows.length, 3));

  let x = margin;
  const startY = doc.y;

  doc.save();
  doc.rect(x, startY, totalW, headerH).fill(BRAND.lightGray);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
  for (const col of columns) {
    doc.text(col.header, x + 4, startY + 6, { width: col.width - 8, align: col.align || "left", lineBreak: false });
    x += col.width;
  }
  doc.restore();

  let y = startY + headerH;
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowH + 4);
    if (doc.y > y + 5) {
      y = doc.y;
    }

    const isLast = r === rows.length - 1 && options?.highlightLastRow;
    const isZebra = options?.zebra && r % 2 === 1;

    if (isLast || isZebra) {
      doc.save();
      doc.rect(margin, y, totalW, rowH).fill(isLast ? BRAND.lightGray : "#F8FAFC");
      doc.restore();
    }

    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try {
      x = margin;
      const row = rows[r];
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(BRAND.black);
        const cellVal = row[c] || "";
        if (cellVal.startsWith("-") || cellVal.startsWith("(")) {
          doc.fillColor(BRAND.red);
        }
        doc.text(cellVal, x + 4, y + 5, { width: col.width - 8, align: col.align || "left" });
        x += col.width;
      }
    } finally {
      doc.page.margins.bottom = savedBottom;
    }
    y += rowH;
  }
  doc.y = y + 4;
}

/**
 * Render a structured "coaching" insight as a callout block: a left accent
 * stripe, a soft cream background, a colored bold label, and a body sentence.
 *
 * Mirrors the wizard's `FinancingInsight` styling so the same insight surfaced
 * in-product also reads as a distinct coaching note inside the lender / board
 * PDFs (Task #326). The PDFKit standard fonts (WinAnsi) don't carry the bank
 * glyph the wizard uses, so we lean on the accent color + bullet marker for
 * visual identity instead of trying to embed an icon font.
 */
export function drawInsightCallout(
  doc: PDFDoc,
  label: string,
  body: string,
  tone: "info" | "success" | "warning" = "info",
) {
  const accentColor = tone === "warning" ? BRAND.amber : tone === "success" ? BRAND.green : BRAND.teal;
  const margin = doc.page.margins.left;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const padding = 8;
  const stripeW = 4;
  const innerW = contentW - stripeW - padding * 2;

  // Pre-measure to size the callout box and trigger a page break if needed.
  doc.font("Helvetica-Bold").fontSize(9);
  const labelText = `\u2022 ${label}`;
  const labelH = doc.heightOfString(labelText, { width: innerW });
  doc.font("Helvetica").fontSize(9);
  const bodyH = doc.heightOfString(body, { width: innerW });
  const totalH = padding * 2 + labelH + 3 + bodyH;

  ensureSpace(doc, totalH + 6);
  const startY = doc.y;

  doc.save();
  doc.roundedRect(margin, startY, contentW, totalH, 3).fill(BRAND.cream);
  doc.restore();

  doc.save();
  doc.rect(margin, startY, stripeW, totalH).fill(accentColor);
  doc.restore();

  const textX = margin + stripeW + padding;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor);
  doc.text(labelText, textX, startY + padding, { width: innerW });

  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(body, textX, startY + padding + labelH + 3, { width: innerW });

  doc.y = startY + totalH + 6;
}

export function statusBadge(doc: PDFDoc, label: string, status: "good" | "warning" | "danger" | "Strong" | "Needs Work" | "Not Yet Ready") {
  const colors: Record<string, string> = {
    good: BRAND.green,
    Strong: BRAND.green,
    warning: BRAND.amber,
    "Needs Work": BRAND.amber,
    danger: BRAND.red,
    "Not Yet Ready": BRAND.red,
  };
  const color = colors[status] || BRAND.gray;
  const margin = doc.page.margins.left;

  ensureSpace(doc, 24);
  const y = doc.y;

  doc.save();
  doc.roundedRect(margin, y, 12, 12, 2).fill(color);
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.black);
  doc.text(label, margin + 18, y + 1);
  doc.moveDown(0.2);
}

export function drawFooter(doc: PDFDoc) {
  const pages = doc.bufferedPageRange();
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const bottomY = doc.page.height - 30;
    const contentW = pageW - margin * 2;

    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try {
      doc.save();
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
      doc.text(`SchoolStack Budget - Generated ${dateStr}`, margin, bottomY, { width: contentW, align: "left", lineBreak: false });
      doc.text(`Page ${i + 1} of ${pages.count}`, margin, bottomY, { width: contentW, align: "right", lineBreak: false });
      doc.restore();
    } finally {
      doc.page.margins.bottom = savedBottom;
    }
  }
}

export function ensureSpace(doc: PDFDoc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 30;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

export function fmtCurrency(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

export function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Income" : "Profit";
}

export function profitMarginLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Margin" : "Profit Margin";
}

export function entityTypeDisplay(entityType?: string): string {
  switch (entityType) {
    case "sole_practitioner": return "Sole Practitioner";
    case "llc_single": return "LLC - Single Member";
    case "llc_partnership": return "LLC - Partnership";
    case "c_corp": return "C Corporation";
    case "s_corp": return "S Corporation";
    case "nonprofit_501c3": return "501(c)(3) Nonprofit";
    case "undetermined": return "Undetermined";
    default: return entityType || "";
  }
}

export function schoolTypeDisplay(type?: string, otherLabel?: string): string {
  switch (type) {
    case "charter_school": return "Charter School";
    case "homeschool_coop": return "Homeschool Co-Op";
    case "learning_pod": return "Learning Pod";
    case "microschool": return "Microschool";
    case "private_school": return "Private School";
    case "tutoring_center": return "Tutoring Center";
    case "other": return otherLabel || "Other";
    default: return type || "";
  }
}

export function docToBuffer(doc: PDFDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
