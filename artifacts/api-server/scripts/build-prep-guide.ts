/**
 * Task #889 — build the printable Model Prep Guide PDF.
 *
 * Reads the section copy from
 * `../school-financial-model/scripts/prep-guide/content.ts` and the wizard
 * screenshots from `../school-financial-model/public/images/prep-guide/`,
 * then writes the bundled PDF to
 * `../school-financial-model/public/prep-guide.pdf`.
 *
 * Reuses the existing `pdf-utils` brand styling (header bar, navy section
 * titles, footer with page numbers) so the prep guide visually matches
 * the lender / board packets founders see later in the wizard.
 *
 * Reproducible: same content + same screenshots + same fonts always
 * produce a byte-equivalent PDF (PDFKit is deterministic when the
 * `info.CreationDate` is not set; we leave it at PDFKit's default of
 * "no date" so the output is stable across runs).
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec tsx scripts/build-prep-guide.ts
 */
import PDFDocument from "pdfkit";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AT_A_GLANCE,
  COVER,
  SECTIONS,
  type PrepGuideSection,
} from "../../school-financial-model/scripts/prep-guide/content.js";
import { BRAND, drawFooter } from "../src/lib/pdf-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SFM_ROOT = resolve(__dirname, "..", "..", "school-financial-model");
const SCREENSHOT_DIR = join(SFM_ROOT, "public", "images", "prep-guide");
const OUT_PATH = join(SFM_ROOT, "public", "prep-guide.pdf");

type Doc = InstanceType<typeof PDFDocument>;

// PDFKit stamps a random 16-byte file identifier into the trailer on
// construction (`crypto.randomBytes(16)`). The field is internal and not
// part of the published types, but it's a known stable surface — the
// prep-guide build needs to pin it so reruns are byte-identical.
type DocWithId = Doc & { _id: Buffer };

// Fixed epoch used for the PDF's CreationDate / ModDate / file-ID so
// successive runs produce byte-identical output. Bumping this only when
// content changes is fine; what matters is that it is a constant.
const FIXED_DATE = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
const FIXED_FILE_ID = Buffer.from(
  "5363686f6f6c537461636b50726570477569",
  "hex",
);

function createDoc(): Doc {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: {
      Title: "SchoolStack Budget — Model Prep Guide",
      Author: "SchoolStack.ai",
      Creator: "SchoolStack Budget",
      Subject:
        "What to gather and decide before building your school's 5-year financial model.",
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    bufferPages: true,
    compress: true,
  });
  (doc as DocWithId)._id = FIXED_FILE_ID.subarray(0, 16);
  return doc;
}

function pageWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensure(doc: Doc, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom - 30;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function bandedHeader(doc: Doc, label: string): void {
  // Thin navy band shown at the top of every non-cover page so the guide
  // is identifiable on a printed page even after the cover is detached.
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);
  const y = 24;
  doc.save();
  doc.rect(margin, y, w, 14).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.white);
  doc.text("SchoolStack Budget — Model Prep Guide", margin + 8, y + 3, {
    width: w - 16,
    lineBreak: false,
  });
  const right = label;
  const rW = doc.widthOfString(right);
  doc.text(right, margin + w - rW - 8, y + 3, { lineBreak: false });
  doc.restore();
  doc.y = y + 14 + 18;
}

function renderCover(doc: Doc): void {
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);

  // Full-bleed top band for the cover.
  doc.save();
  doc.rect(0, 0, doc.page.width, 200).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 60, { width: w });
  doc.font("Helvetica").fontSize(9).fillColor("#94A3B8");
  doc.text("by SchoolStack.ai", margin, 78, { width: w });
  doc.restore();

  doc.y = 240;
  doc.font("Helvetica-Bold").fontSize(36).fillColor(BRAND.navy);
  doc.text(COVER.title, margin, doc.y, { width: w });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(14).fillColor(BRAND.darkGray);
  doc.text(COVER.subtitle, { width: w, lineGap: 3 });

  doc.moveDown(2);
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.black);
  doc.text(COVER.intro, { width: w, lineGap: 4, align: "left" });

  // Footer hint on the cover.
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(BRAND.gray);
  doc.text(
    "Print on letter-size paper. Reads cleanly in black & white.",
    margin,
    doc.page.height - 80,
    { width: w, align: "center" },
  );
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(COVER.byline, margin, doc.page.height - 64, {
    width: w,
    align: "center",
  });
}

function renderAtAGlance(doc: Doc): void {
  doc.addPage();
  bandedHeader(doc, "At a glance");

  const margin = doc.page.margins.left;
  const w = pageWidth(doc);

  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND.navy);
  doc.text("At a glance — one-page checklist", margin, doc.y, { width: w });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor(BRAND.darkGray);
  doc.text(
    "Tear this page off and tape it next to your computer. The rest of the guide walks each section in detail.",
    { width: w, lineGap: 3 },
  );
  doc.moveDown(1);

  for (const block of AT_A_GLANCE) {
    ensure(doc, 24 + block.bullets.length * 16);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND.navy);
    doc.text(block.section, margin, doc.y, { width: w });
    doc.moveDown(0.3);
    for (const bullet of block.bullets) {
      ensure(doc, 16);
      const y0 = doc.y;
      // Hollow square checkbox so a founder can tick it on paper.
      doc.save();
      doc.lineWidth(0.8).strokeColor(BRAND.darkGray);
      doc.rect(margin, y0 + 2, 9, 9).stroke();
      doc.restore();
      doc.font("Helvetica").fontSize(10).fillColor(BRAND.black);
      doc.text(bullet, margin + 16, y0, {
        width: w - 16,
        lineGap: 2,
      });
      doc.moveDown(0.15);
    }
    doc.moveDown(0.5);
  }
}

function renderTOC(doc: Doc): void {
  doc.addPage();
  bandedHeader(doc, "Contents");
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);

  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND.navy);
  doc.text("What's inside", margin, doc.y, { width: w });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor(BRAND.darkGray);
  doc.text(
    "Sections follow the wizard in order. Skip the \"Already Operating\" section if your school hasn't opened yet.",
    { width: w, lineGap: 3 },
  );
  doc.moveDown(1);

  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    ensure(doc, 22);
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy);
    doc.text(`${i + 1}.`, margin, y0, { width: 24, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.black);
    doc.text(s.shortTitle, margin + 24, y0, {
      width: w - 24,
      lineBreak: false,
    });
    if (s.badge) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.amber);
      doc.text(`  (${s.badge} — skip if you haven't opened yet)`, {
        continued: false,
      });
    } else {
      doc.moveDown(0.1);
    }
    doc.moveDown(0.4);
  }
}

function drawScreenshotOrPlaceholder(
  doc: Doc,
  filename: string,
  caption: string,
): void {
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);
  const targetH = 280;
  ensure(doc, targetH + 40);

  const filePath = join(SCREENSHOT_DIR, filename);
  const y0 = doc.y;

  if (existsSync(filePath)) {
    try {
      doc.image(filePath, margin, y0, {
        fit: [w, targetH],
        align: "center",
        valign: "center",
      });
    } catch (err) {
      // Fall through to the placeholder if PDFKit can't decode the file.
      console.warn(
        `[prep-guide] failed to embed ${filename}: ${(err as Error).message}`,
      );
      drawPlaceholder(doc, y0, w, targetH, filename);
    }
  } else {
    drawPlaceholder(doc, y0, w, targetH, filename);
  }

  doc.y = y0 + targetH + 10;
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
  doc.text(caption, margin, doc.y, { width: w, align: "center" });
  doc.moveDown(0.5);
  doc.fillColor(BRAND.black);
}

function drawPlaceholder(
  doc: Doc,
  y0: number,
  w: number,
  h: number,
  filename: string,
): void {
  const margin = doc.page.margins.left;
  doc.save();
  doc.rect(margin, y0, w, h).fill(BRAND.lightGray);
  doc.lineWidth(0.5).strokeColor(BRAND.gray);
  doc.rect(margin, y0, w, h).stroke();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.darkGray);
  doc.text("Wizard screenshot", margin, y0 + h / 2 - 22, {
    width: w,
    align: "center",
  });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.gray);
  doc.text(
    `Run \`pnpm --filter @workspace/school-financial-model run capture:prep-guide\` to refresh "${filename}".`,
    margin + 20,
    y0 + h / 2 + 0,
    { width: w - 40, align: "center" },
  );
}

function renderChecklist(
  doc: Doc,
  heading: string,
  items: string[],
  accent: string,
): void {
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);
  ensure(doc, 24);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(accent);
  doc.text(heading, margin, doc.y, { width: w });
  doc.moveDown(0.3);
  for (const item of items) {
    ensure(doc, 18);
    const y0 = doc.y;
    doc.save();
    doc.lineWidth(0.8).strokeColor(BRAND.darkGray);
    doc.rect(margin, y0 + 2, 9, 9).stroke();
    doc.restore();
    doc.font("Helvetica").fontSize(10).fillColor(BRAND.black);
    doc.text(item, margin + 16, y0, { width: w - 16, lineGap: 2 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.5);
}

function renderSection(doc: Doc, section: PrepGuideSection, idx: number): void {
  doc.addPage();
  bandedHeader(doc, `Section ${idx + 1} of ${SECTIONS.length}`);
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);

  // Step number ribbon.
  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.green);
  doc.text(`STEP ${idx + 1}`, margin, doc.y, { width: w });
  doc.moveDown(0.1);

  // Title + optional skip badge.
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND.navy);
  doc.text(section.title, margin, doc.y, { width: w });

  if (section.badge) {
    doc.moveDown(0.2);
    const label = `${section.badge.toUpperCase()} — skip this section if you haven't opened yet`;
    const padX = 6;
    const padY = 3;
    doc.font("Helvetica-Bold").fontSize(8);
    const tw = doc.widthOfString(label) + padX * 2;
    const th = doc.currentLineHeight() + padY;
    const x0 = margin;
    const y0 = doc.y;
    doc.save();
    doc.roundedRect(x0, y0, tw, th, 3).fill(BRAND.amber);
    doc.restore();
    doc.fillColor(BRAND.white);
    doc.text(label, x0 + padX, y0 + padY / 2 + 0.5, { lineBreak: false });
    doc.y = y0 + th + 6;
    doc.fillColor(BRAND.black);
  } else {
    doc.moveDown(0.4);
  }

  // Intro paragraph.
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.black);
  doc.text(section.intro, margin, doc.y, { width: w, lineGap: 4 });
  doc.moveDown(0.8);

  // Screenshot.
  drawScreenshotOrPlaceholder(
    doc,
    section.screenshot,
    `What this step looks like in the wizard.`,
  );

  // Checklists — gather first, then decisions.
  renderChecklist(
    doc,
    "Documents & records to gather",
    section.gather,
    BRAND.teal,
  );
  renderChecklist(
    doc,
    "Numbers & decisions to have ready",
    section.decisions,
    BRAND.green,
  );

  if (section.tip) {
    ensure(doc, 50);
    const padding = 8;
    const stripeW = 4;
    const tw = w;
    const innerW = tw - stripeW - padding * 2;
    doc.font("Helvetica-Bold").fontSize(9);
    const labelH = doc.heightOfString("Tip", { width: innerW });
    doc.font("Helvetica").fontSize(9);
    const bodyH = doc.heightOfString(section.tip, { width: innerW });
    const totalH = padding * 2 + labelH + 3 + bodyH;
    ensure(doc, totalH + 6);
    const y0 = doc.y;
    doc.save();
    doc.roundedRect(margin, y0, tw, totalH, 3).fill(BRAND.cream);
    doc.restore();
    doc.save();
    doc.rect(margin, y0, stripeW, totalH).fill(BRAND.amber);
    doc.restore();
    const textX = margin + stripeW + padding;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.amber);
    doc.text("Tip", textX, y0 + padding, { width: innerW });
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(section.tip, textX, y0 + padding + labelH + 3, {
      width: innerW,
    });
    doc.y = y0 + totalH + 6;
    doc.fillColor(BRAND.black);
  }
}

function renderClosing(doc: Doc): void {
  doc.addPage();
  bandedHeader(doc, "Ready when you are");
  const margin = doc.page.margins.left;
  const w = pageWidth(doc);

  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND.navy);
  doc.text("Ready when you are.", margin, doc.y, { width: w });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.black);
  doc.text(
    "You don't need every box on every page checked to start. The wizard will save your progress and let you come back as new information arrives — a signed lease, an actual enrollment count, a real payroll register. The first pass is the hardest; every pass after that is just refinement.",
    { width: w, lineGap: 4 },
  );
  doc.moveDown(1);
  doc.text(
    "When you're ready, head to budget.schoolstack.ai and start a new model. Coaching tips appear right next to each input, so you're never guessing alone.",
    { width: w, lineGap: 4 },
  );
  doc.moveDown(2);
  doc.font("Helvetica-Oblique").fontSize(10).fillColor(BRAND.darkGray);
  doc.text(
    "Free during beta. Your data stays yours. Built by The Building Hope Impact Fund.",
    { width: w, align: "center" },
  );
}

async function main(): Promise<void> {
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  const doc = createDoc();
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((res, rej) => {
    doc.on("end", () => res());
    doc.on("error", rej);
  });

  renderCover(doc);
  renderAtAGlance(doc);
  renderTOC(doc);
  for (let i = 0; i < SECTIONS.length; i++) {
    renderSection(doc, SECTIONS[i], i);
  }
  renderClosing(doc);

  drawFooter(doc, { date: FIXED_DATE });
  doc.end();
  await done;

  const buffer = Buffer.concat(chunks);
  writeFileSync(OUT_PATH, buffer);
  console.log(
    `[prep-guide] wrote ${OUT_PATH} (${buffer.length.toLocaleString()} bytes, ${SECTIONS.length} sections)`,
  );

  const missing = SECTIONS.filter(
    (s) => !existsSync(join(SCREENSHOT_DIR, s.screenshot)),
  ).map((s) => s.screenshot);
  if (missing.length > 0) {
    console.warn(
      `[prep-guide] ${missing.length} screenshot(s) missing — placeholders rendered. Run capture:prep-guide to refresh:`,
    );
    for (const f of missing) console.warn(`  - ${f}`);
  }
}

main().catch((err) => {
  console.error("[prep-guide] failed:", err);
  process.exit(1);
});
