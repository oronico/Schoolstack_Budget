import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, statusBadge, labelValue,
  fmtCurrency, ensureSpace,
  renderDecisionHistorySection,
  renderPacketTable, renderPacketInsights, renderLinkedMetrics,
  drawActualVsProjectedPill,
  type PDFDoc, type TableColumn, BRAND,
} from "../pdf-utils.js";
import type { LenderPacket, RiskMitigant, BudgetNarrativeData, FlaggedAssumptionExport, BreakEvenDownsideExport, FounderCompPdfBlock } from "./build-lender-packet";
import type { LenderStressTestResults, ProgramBreakEven } from "@workspace/finance";
import {
  ASSUMPTION_REGISTRY,
  PRO_FORMA_METHODOLOGY_NOTE_TITLE,
  PRO_FORMA_METHODOLOGY_NOTE_BODY,
  ASSUMPTION_CONFIDENCE_LABELS,
  listAssumptionKeys,
  isEstimateWithoutEvidence,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  computeAssumptionConfidenceRollup,
  classifyEvidenceFileEmbed,
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_ATTACHMENT_MAX_BYTES as SHARED_EVIDENCE_ATTACHMENT_MAX_BYTES,
  type AssumptionKey,
} from "@workspace/finance";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "../benchmark-thresholds";
import type { PacketSection, LinkedMetric } from "./packet-types";
import { renderForecastAccuracySection } from "./forecast-accuracy-pdf.js";
import { renderCashRunwayTroughCallout, renderCashRunwayAccrualToggle } from "./cash-runway-pdf.js";
import { drawLenderSummaryPage } from "./lender-summary-pdf.js";
import type { LenderSummaryData } from "./build-lender-summary.js";
import type { NarrativeCommentary } from "./build-narrative-commentary.js";
import { lenderReadinessCoachingHeadline } from "../lender-readiness-coaching.js";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage.js";
import { rasterizePdfFirstPage } from "../pdf-rasterize.js";
import { PDFDocument as PdfLibDocument } from "pdf-lib";

export async function generateLenderPacketPDF(
  packet: LenderPacket,
  lenderSummary?: LenderSummaryData,
): Promise<Buffer> {
  const doc = createDoc();

  // Task #615 — one-page Lender Summary leads the packet, on letter
  // portrait. Only rendered when the route supplies the canonical-engine
  // summary; otherwise we keep the legacy cover-first layout for callers /
  // tests that still build the packet without the summary.
  if (lenderSummary) {
    drawLenderSummaryPage(doc, lenderSummary);
    doc.addPage();
  }

  drawCoverPage(doc, packet);
  doc.addPage();

  // Task #617 - lender-ready narrative commentary leads the body of the
  // packet. Every figure printed here was produced by the same canonical
  // engine that built the rest of the report (guard test enforces).
  // Task #740 — when the founder edited the Lender narrative draft on the
  // wizard's Lender Narrative step, that prose wins; otherwise the
  // deterministic `buildLenderCommentary` output (which the guard test
  // figure-allowlists) is rendered as the fallback so the founder always
  // ships a polished narrative.
  renderNarrativeCommentarySection(
    doc,
    "Lender Commentary",
    packet.lenderCommentary,
    packet.budgetNarrative.audienceDrafts?.lender,
  );

  const execSection = packet.sections.find(s => s.id === "executive_summary" && s.included);
  if (execSection) {
    renderSection(doc, execSection, packet);
  }

  const execSummary = packet.sections.find(s => s.id === "executive_summary");
  renderBudgetNarrativeSection(doc, packet.budgetNarrative, packet.flaggedAssumptions, execSummary?.narrative);
  // Task #659 — Assumptions Confidence summary, grouped by wizard step.
  // Renders right after the budget narrative so a reviewer reading the
  // founder's prose immediately sees which numbers are anchored vs.
  // estimate. Skipped silently when the founder hasn't tagged anything.
  await renderAssumptionsConfidenceSection(doc, packet.assumptionConfidence, packet.provenance);

  for (const section of packet.sections) {
    if (!section.included) continue;
    if (section.id === "cover") continue;
    if (section.id === "executive_summary") continue;

    renderSection(doc, section, packet);
  }

  // Forecast accuracy lives after the listed sections — it summarizes the
  // founder's track record across decisions and complements the decision
  // history block. Per Task #216 the section is omitted gracefully (no
  // title, no placeholder copy) when no Pursued saved scenarios with
  // realized actuals exist — first-time founders without a track record
  // shouldn't get a half-empty section in their lender packet.
  renderBreakEvenDownsideSection(doc, packet.breakEvenDownside);

  // Task #668 — per-program break-even table for Year 1. Lenders ask
  // "which programs carry the school?" — this section answers it with
  // the same numbers the planner shows on screen.
  renderProgramBreakEvenSection(doc, packet.programBreakEvenY1);

  // Task #616 — fixed lender stress-test battery. Identical numbers appear
  // on the founder dashboard, consultant view, and lender pro-forma
  // workbook because every surface pulls from the same canonical helper.
  renderLenderStressTestsSection(doc, packet.lenderStressTests);

  // Task #894 — Methodology callout. The lender packet ships TWO Excel
  // workbooks (underwriting + lender pro-forma), and on the same payload
  // their Y1 Net Income figures will not tie because each uses a
  // different driver model and a different bottom-line definition.
  // Surface that here so a reader who cracks open both files isn't
  // surprised. See `lender-proforma-export.ts` `buildPnL` doc comment.
  renderProFormaMethodologyNote(doc);

  renderForecastAccuracySection(
    doc,
    packet.forecastAccuracy,
    "lender",
    true,
    packet.forecastAccuracyFilter,
    packet.forecastAccuracyUnfilteredCount,
  );

  // Task #699 — Founder compensation block, mirroring the labeled
  // breakdown the Excel export now renders. Numbers come from
  // `computeFounderCompNormalization` so the workbook, in-app dashboard,
  // and PDF cannot drift.
  renderFounderCompBlock(doc, packet.founderCompNormalization);

  drawFooter(doc);
  const baseBuffer = await docToBuffer(doc);
  // Task #722 — fetch any uploaded PDF attachments (lease, MOU, signed
  // quotes) from App Storage and merge them onto the end of the packet
  // so it ships as a single self-contained underwriting bundle. Image
  // attachments are still inlined under each manifest entry by the
  // existing thumbnail render path; PDFs needed a separate merge step
  // because PDFKit cannot embed another PDF mid-document.
  const pdfsToEmbed = await collectEvidencePdfsForPacket(packet.assumptionConfidence);
  return mergeEvidencePdfs(baseBuffer, pdfsToEmbed);
}

/**
 * Task #699 — Render the Founder Compensation breakdown block on a
 * packet PDF. Same data shape (and same labels / "not paying yet" note)
 * the Excel export's Personnel sheet now renders, so a reviewer reading
 * the PDF and a reviewer reading the workbook see identical numbers.
 *
 * Exported so the board PDF generator can call the same renderer rather
 * than carry its own copy that could drift.
 */
export function renderFounderCompBlock(
  doc: PDFDoc,
  block: FounderCompPdfBlock | null,
): void {
  if (!block) return;

  const yearCount = block.reported.length;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Math.round(n));

  ensureSpace(doc, 80);
  sectionTitle(doc, "Founder Compensation");
  bodyText(
    doc,
    "Per-year founder pay shown two ways: as planned (what the founder draws) and at market rate (what a comparable hire would cost). The lender adjustment is the gap underwriters apply to staffing cost and DSCR.",
  );

  const yearLabels: TableColumn[] = [];
  for (let y = 0; y < yearCount; y++) {
    yearLabels.push({ header: `Y${y + 1}`, width: 60, align: "right" });
  }
  const cols: TableColumn[] = [
    { header: "Line", width: 230 },
    ...yearLabels,
    { header: `${yearCount}-Yr Total`, width: 70, align: "right" },
  ];

  const sumOf = (arr: number[]): number => arr.reduce((s, v) => s + (v || 0), 0);

  const rows: string[][] = [
    [
      "As planned (reported)",
      ...block.reported.map((v) => fmt(v || 0)),
      fmt(sumOf(block.reported)),
    ],
    [
      "  Fully-loaded (incl. benefits + payroll tax)",
      ...block.reportedLoaded.map((v) => fmt(v || 0)),
      fmt(sumOf(block.reportedLoaded)),
    ],
    [
      "Market rate (normalized)",
      ...block.normalized.map((v) => fmt(v || 0)),
      fmt(sumOf(block.normalized)),
    ],
    [
      "  Fully-loaded (incl. benefits + payroll tax)",
      ...block.normalizedLoaded.map((v) => fmt(v || 0)),
      fmt(sumOf(block.normalizedLoaded)),
    ],
    [
      "Lender adjustment (market - planned)",
      ...block.delta.map((v) => fmt(v || 0)),
      fmt(block.totalDelta),
    ],
  ];

  drawTable(doc, cols, rows, { zebra: true, highlightLastRow: true });

  const note = block.notPayingYet
    ? "Note: Founder selected \u201Cnot paying yet\u201D \u2014 reported founder compensation is $0 across all years. The market-rate line shows what a comparable hire would cost; the lender adjustment is the gap underwriters apply."
    : block.hasAdjustment
    ? "Note: Founder is paying themselves below market rate (\u201Csweat equity\u201D). Lenders and boards underwrite to the market-rate line; the adjustment shows the gap."
    : "Note: Reported and market-rate founder compensation match \u2014 no normalization adjustment is applied.";
  doc.moveDown(0.3);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.darkGray);
  doc.text(note, doc.page.margins.left, doc.y, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  });
  doc.font("Helvetica").fillColor(BRAND.black);
  doc.moveDown(0.3);
}

function drawCoverPage(doc: PDFDoc, packet: LenderPacket) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  doc.save();
  doc.rect(0, 0, pageW, 120).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 30, { width: contentW });
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.gray);
  doc.text("Lender Conversation Snapshot", margin, 60);
  doc.restore();

  doc.y = 150;

  doc.font("Helvetica-Bold").fontSize(28).fillColor(BRAND.navy);
  doc.text(packet.schoolName, margin, doc.y, { width: contentW, align: "center" });
  doc.moveDown(0.8);

  doc.font("Helvetica").fontSize(12).fillColor(BRAND.darkGray);
  doc.text("5-Year Financial Model", { align: "center" });
  doc.moveDown(0.3);
  doc.text(`Prepared ${new Date(packet.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  // Task #657 — provenance label so a lender immediately knows whether
  // they're reviewing a model built from the school's actuals or from
  // forward-looking assumptions. Defaults to "assumptions" for older
  // packets that pre-date the wizardPathway field.
  doc.moveDown(0.3);
  doc.font("Helvetica-Oblique").fontSize(11).fillColor(BRAND.darkGray);
  doc.text(
    packet.provenance === "actuals" ? "Built from actuals" : "Built from assumptions",
    { align: "center" },
  );
  doc.font("Helvetica").fillColor(BRAND.darkGray);
  doc.moveDown(2);

  statusBadge(
    doc,
    lenderReadinessCoachingHeadline(packet.lenderReadiness.status),
    packet.lenderReadiness.status,
  );
  doc.moveDown(0.5);
  bodyText(doc, packet.lenderReadiness.explanation);

  doc.moveDown(1.5);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy);
  doc.text("Packet Contents", margin, doc.y);
  doc.moveDown(0.5);

  const includedSections = packet.sections.filter((s) => s.included && s.id !== "cover");
  for (let i = 0; i < includedSections.length; i++) {
    const s = includedSections[i];
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(`${i + 1}.  ${s.title}`, margin + 10, doc.y, { width: contentW - 20 });
    doc.moveDown(0.15);
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
  doc.text("This packet is generated from the school's financial model and is intended for lender review.", { align: "center" });
  doc.text("All projections are based on assumptions entered by the school founder.", { align: "center" });
}

type NarrativeStringKey = Exclude<keyof BudgetNarrativeData, "audienceDrafts">;
const NARRATIVE_LABELS: Array<[NarrativeStringKey, string]> = [
  ["enrollmentStrategy", "Enrollment Strategy"],
  ["retentionPlan", "Retention Plan"],
  ["riskMitigation", "Risk Mitigation"],
  ["missionAndVision", "Mission & Vision"],
  ["revenueAssumptions", "Revenue Assumptions"],
  ["staffingPhilosophy", "Staffing Philosophy"],
  ["expenseAssumptions", "Expense Assumptions"],
  ["growthStrategy", "Growth Strategy"],
  ["additionalContext", "Additional Context"],
];

function renderBudgetNarrativeSection(doc: PDFDoc, narrative: BudgetNarrativeData, flagged: FlaggedAssumptionExport[], autoNarrative?: string) {
  const hasNarrative = NARRATIVE_LABELS.some(([key]) => narrative[key]?.trim());
  const hasFlags = flagged.length > 0;

  sectionTitle(doc, "Budget Narrative");

  if (!hasNarrative) {
    if (autoNarrative?.trim()) {
      bodyText(doc, autoNarrative);
    } else {
      bodyText(doc, "The school founder has not yet provided narrative context for this financial model. Lenders should request clarification on enrollment strategy, retention plans, and risk mitigation before underwriting.");
    }
    if (!hasFlags) {
      doc.moveDown(0.5);
      return;
    }
  }

  if (hasNarrative) {
    for (const [key, label] of NARRATIVE_LABELS) {
      const text = narrative[key]?.trim();
      if (!text) continue;
      const isPrimary = key === "enrollmentStrategy" || key === "retentionPlan" || key === "riskMitigation";
      ensureSpace(doc, 40);
      if (isPrimary) {
        doc.save();
        doc.rect(doc.page.margins.left, doc.y, 3, 14).fill(BRAND.amber);
        doc.restore();
        doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
        doc.text(label, doc.page.margins.left + 10, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10 });
      } else {
        subSection(doc, label);
      }
      bodyText(doc, text);
      doc.moveDown(0.3);
    }
  }

  if (hasFlags) {
    ensureSpace(doc, 30);
    subSection(doc, "Flagged Assumptions");
    for (const fa of flagged) {
      ensureSpace(doc, 30);
      const severityLabel = fa.flag.severity.charAt(0).toUpperCase() + fa.flag.severity.slice(1);
      const color = fa.flag.severity === "critical" ? BRAND.red : fa.flag.severity === "warning" ? BRAND.amber : BRAND.teal;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(color);
      doc.text(`[${severityLabel}] `, doc.page.margins.left, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
      doc.text(fa.flag.currentValue);
      if (fa.userExplanation.trim()) {
        doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
        doc.text(`  Explanation: ${fa.userExplanation}`, doc.page.margins.left + 10, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
        });
      }
      doc.moveDown(0.2);
    }
  }

  doc.moveDown(0.5);
}

// Task #659 — group registered assumption keys by their wizard step
// title and render confidence + (optional) evidence note for each one
// the founder has tagged. Skipped silently when no entries exist.
// Task #716 — exported so the board PDF can reuse the exact same
// renderer (including the Actual / Projected pill on the rollup) instead
// of carrying a parallel implementation that could drift.
export async function renderAssumptionsConfidenceSection(
  doc: PDFDoc,
  confidence: LenderPacket["assumptionConfidence"],
  provenance?: "actuals" | "assumptions",
): Promise<void> {
  const entries = Object.entries(confidence || {}).filter(([k]) =>
    Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k),
  ) as Array<[AssumptionKey, { confidence: keyof typeof ASSUMPTION_CONFIDENCE_LABELS; evidenceNote?: string }]>;

  ensureSpace(doc, 60);
  sectionTitle(doc, "Assumptions Confidence");

  // Task #703 — always render the Strong / Moderate / Needs Support
  // rollup at the top of the section, even when the founder has not
  // tagged any keys yet. An empty map deliberately produces a "Needs
  // Support" posture so reviewers see the same single-figure confidence
  // signal on every packet (matches the wizard Review screen and the
  // Founder Planning Workbook dashboard).
  const rollup = computeAssumptionConfidenceRollup({ assumptionConfidence: confidence });
  ensureSpace(doc, 22);
  const rollupTone =
    rollup.status === "Strong"
      ? BRAND.green
      : rollup.status === "Moderate"
        ? BRAND.amber
        : BRAND.red;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(rollupTone);
  doc.text(`Overall: ${rollup.status}`, doc.page.margins.left, doc.y, { continued: true });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(
    `   ${Math.round(rollup.evidenceRatio * 100)}% weighted evidence  ·  ${rollup.taggedKeys} of ${rollup.totalKeys} tagged   `,
    { continued: true },
  );
  // Task #710 — Actual / Projected indicator on the rollup, mirroring
  // the wizard Review screen so a reviewer immediately sees whether the
  // model behind the confidence rollup was seeded from last year's
  // actuals or built as a forward-looking projection.
  doc.text("", { continued: false });
  drawActualVsProjectedPill(doc, provenance === "actuals" ? "actual" : "projected");
  doc.moveDown(0.6);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(rollup.message, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  doc.font("Helvetica").fillColor(BRAND.black);
  doc.moveDown(0.5);

  bodyText(
    doc,
    "Each major assumption below is tagged by the founder with the source they leaned on. " +
      "Higher-confidence sources (actuals, signed agreements, written quotes) are stronger evidence than research benchmarks or estimates.",
  );

  // Task #703 — when nothing is tagged, surface the empty state directly
  // under the rollup so reviewers know the posture is intentional, then
  // exit before the per-step section iterator (which would render nothing).
  if (entries.length === 0) {
    ensureSpace(doc, 16);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(
      `0 of ${listAssumptionKeys().length} assumptions tagged yet — the founder has not anchored any inputs to evidence. Posture defaults to "Needs Support" until at least some keys are tagged.`,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
    );
    doc.font("Helvetica").fillColor(BRAND.black);
    return;
  }

  // Cover summary: how many of the registered keys are tagged at all,
  // and which high-impact assumptions are still bare estimates. The same
  // tally drives the AssumptionFlag emitted by detectUnusualAssumptions.
  const totalRegistered = listAssumptionKeys().length;
  ensureSpace(doc, 16);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(`${entries.length} of ${totalRegistered} assumptions tagged.`);
  doc.moveDown(0.2);
  const bareHighImpact = HIGH_IMPACT_CONFIDENCE_KEYS.filter((k) =>
    isEstimateWithoutEvidence(confidence?.[k]),
  );
  if (bareHighImpact.length > 0) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.amber);
    doc.text(
      `${bareHighImpact.length} swing-factor assumption${bareHighImpact.length === 1 ? "" : "s"} still tagged "estimate" with no evidence note: ${bareHighImpact
        .map((k) => ASSUMPTION_REGISTRY[k].label)
        .join(", ")}.`,
    );
    doc.moveDown(0.3);
  }

  // Group by stepTitle so the section reads in the same order the founder
  // walked the wizard. Sort steps by `defaultStepNumber` of their first
  // tagged key so non-default step orders still render coherently.
  const byStep = new Map<string, AssumptionKey[]>();
  for (const [key] of entries) {
    const step = ASSUMPTION_REGISTRY[key].stepTitle;
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step)!.push(key);
  }
  const orderedSteps = [...byStep.keys()].sort((a, b) => {
    const ka = byStep.get(a)![0];
    const kb = byStep.get(b)![0];
    return ASSUMPTION_REGISTRY[ka].defaultStepNumber - ASSUMPTION_REGISTRY[kb].defaultStepNumber;
  });

  for (const step of orderedSteps) {
    ensureSpace(doc, 30);
    subSection(doc, step);
    for (const key of byStep.get(step)!) {
      const entry = confidence[key];
      if (!entry) continue;
      ensureSpace(doc, 24);
      const meta = ASSUMPTION_REGISTRY[key];
      const label = ASSUMPTION_CONFIDENCE_LABELS[entry.confidence];
      const isBare = isEstimateWithoutEvidence(entry);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
      doc.text(`${meta.label}: `, doc.page.margins.left, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(9).fillColor(isBare ? BRAND.amber : BRAND.black);
      doc.text(label);
      const note = entry.evidenceNote?.trim();
      if (note) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.darkGray);
        doc.text(`  Evidence: ${note}`, doc.page.margins.left + 10, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
        });
      }
      // Task #707 — list each uploaded evidence file under the
      // assumption so a reviewer reading the confidence section sees
      // exactly which lease / MOU / quote the founder attached. Full
      // filename + size is also listed in the Evidence Files appendix
      // at the end of the section for an at-a-glance manifest.
      const files = (entry as { evidenceFiles?: Array<{ name?: string; size?: number }> }).evidenceFiles;
      if (Array.isArray(files) && files.length > 0) {
        doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
        for (const f of files) {
          if (!f?.name) continue;
          const sizeStr = typeof f.size === "number" ? `  (${formatEvidenceFileSize(f.size)})` : "";
          doc.text(`  Attached: ${f.name}${sizeStr}`, doc.page.margins.left + 10, doc.y, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
          });
        }
      }
      doc.moveDown(0.2);
    }
    doc.moveDown(0.3);
  }

  // Task #707 — Evidence files appendix. Manifest of every uploaded
  // attachment so the lender knows what supporting documents the
  // founder asked them to review. Skipped silently when no files were
  // uploaded.
  await renderAssumptionsEvidenceAppendix(doc, confidence);
}

function formatEvidenceFileSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface AppendixFileLike {
  name?: string;
  size?: number;
  uploadedAt?: string;
  mimeType?: string;
  /** Task #714 — App Storage path; when set, the appendix prints a
   *  clickable download link so the lender reviewer can pull the file
   *  straight from the packet. */
  objectPath?: string;
}

// Task #732 — pluggable bytes loader so the lender appendix can fetch
// the underlying image bytes from App Storage and embed thumbnails. The
// default loader streams the object via ObjectStorageService; tests
// replace it via `setEvidenceBytesLoader` so they can exercise the
// thumbnail render path without touching real storage.
export type EvidenceBytesLoader = (objectPath: string) => Promise<Buffer | null>;

const defaultEvidenceBytesLoader: EvidenceBytesLoader = async (objectPath) => {
  try {
    const svc = new ObjectStorageService();
    const file = await svc.getObjectEntityFile(objectPath);
    const [bytes] = await file.download();
    return bytes;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    return null;
  }
};

let evidenceBytesLoader: EvidenceBytesLoader = defaultEvidenceBytesLoader;

export function setEvidenceBytesLoader(loader: EvidenceBytesLoader | null): void {
  evidenceBytesLoader = loader ?? defaultEvidenceBytesLoader;
}

// Cap how much we pull per file (5 MB) and how much we pull total per
// packet (25 MB) so a founder who attached a stack of 50 MB photos
// can't blow up memory or balloon the packet PDF beyond what email
// gateways will accept.
// Task #723 — per-file inline-preview cap is shared with the wizard's
// pre-export preview via @workspace/finance so the founder sees the
// same eligibility classification on screen that they'll get in the
// PDF appendix. Total per-packet budget stays local to the renderer.
const EVIDENCE_THUMBNAIL_MAX_BYTES = EVIDENCE_INLINE_PREVIEW_MAX_BYTES;
const EVIDENCE_THUMBNAIL_TOTAL_BUDGET_BYTES = 25 * 1024 * 1024;
// Task #722 — per-file cap (10 MB) for PDF attachments merged onto the
// end of the packet. Files exceeding the cap fall back to the manifest
// entry with an "available on request" note instead of being embedded.
// A separate total budget guards against a stack of borderline-cap PDFs
// from inflating the packet beyond what email gateways accept.
// Task #723 — sourced from @workspace/finance so the wizard's
// pre-export attachments preview classifies each file with the same
// caps the renderer enforces.
const EVIDENCE_ATTACHMENT_MAX_BYTES = SHARED_EVIDENCE_ATTACHMENT_MAX_BYTES;
const EVIDENCE_ATTACHMENT_TOTAL_BUDGET_BYTES = 50 * 1024 * 1024;
const THUMBNAIL_BOX = 56;
const THUMBNAIL_GAP = 10;

function isPdfAttachment(file: AppendixFileLike): boolean {
  const mime = (file.mimeType || "").toLowerCase();
  if (mime === "application/pdf") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".pdf");
}

// Task #723 — disposition is derived from the shared
// `classifyEvidenceFileEmbed` helper so the wizard preview surface and
// the renderer can never disagree about what each file will do.
type EvidenceDisposition = "image" | "embedded-pdf" | "oversized" | "unsupported";

// Task #841 — exported so the wizard's preview-vs-server parity guard
// (`tests/packet-attachments-preview-parity.ts`) can feed the same
// fixtures through both the founder-facing `classifyPacketAttachment`
// helper and this server-side classifier and assert they agree.
export function evidenceAttachmentDisposition(file: AppendixFileLike): EvidenceDisposition {
  const klass = classifyEvidenceFileEmbed({
    mimeType: file.mimeType,
    name: file.name,
    size: file.size,
  });
  switch (klass.disposition) {
    case "embed_inline":
      return "image";
    case "append_link":
      return "embedded-pdf";
    case "too_large":
      return "oversized";
    case "unsupported":
      return "unsupported";
  }
}

// Task #878 — extracted from the inline label block in
// `renderAssumptionsEvidenceAppendix` so the parity guard
// (`tests/packet-attachments-evidence-appendix-parity.ts`) can pin the
// rendered manifest wording for each disposition. Without this helper
// the wording lived as string literals deep inside the renderer, and a
// drive-by tweak ("5 MB embed cap" → "5 MB cap") could silently desync
// the founder preview from the rendered PDF even though the
// dispositions still matched. Returning `null` means the row prints no
// disposition note (e.g. an `image` row whose preview bytes failed to
// load is handled by the dedicated branch below).
export type EvidenceManifestNoteTone = "info" | "warn";
export interface EvidenceManifestNote {
  text: string;
  tone: EvidenceManifestNoteTone;
}

export function evidenceAttachmentManifestNote(
  file: AppendixFileLike,
  options: { imagePreviewLoaded: boolean } = { imagePreviewLoaded: true },
): EvidenceManifestNote | null {
  const disposition = evidenceAttachmentDisposition(file);
  if (disposition === "embedded-pdf") {
    return { text: "Full PDF embedded at end of packet.", tone: "info" };
  }
  if (disposition === "image") {
    if (options.imagePreviewLoaded) {
      return { text: "Preview embedded above.", tone: "info" };
    }
    return {
      text: "Available on request — preview could not be loaded.",
      tone: "warn",
    };
  }
  if (disposition === "oversized") {
    // Cap wording mirrors the per-mime-type caps so an oversized image
    // (5 MB inline-preview cap) doesn't get blamed on the 10 MB PDF cap.
    const capMb = isImageMime(file.mimeType)
      ? Math.round(EVIDENCE_THUMBNAIL_MAX_BYTES / (1024 * 1024))
      : Math.round(EVIDENCE_ATTACHMENT_MAX_BYTES / (1024 * 1024));
    return {
      text: `Available on request — exceeds ${capMb} MB embed cap.`,
      tone: "warn",
    };
  }
  if (disposition === "unsupported") {
    return {
      text: "Available on request — file type cannot be inlined.",
      tone: "warn",
    };
  }
  return null;
}

/**
 * Task #722 — walk the assumption-confidence map and load bytes for any
 * uploaded PDF attachments that fit under the 10 MB per-file cap (and
 * the per-packet total budget). Returned PDFs are merged onto the end
 * of the rendered packet by `mergeEvidencePdfs` so the packet ships as
 * a single self-contained underwriting bundle. Files that fail any cap
 * (or fail to load) are silently skipped — the manifest in the
 * Evidence Files appendix still lists them with an "available on
 * request" note so the reviewer knows what to ask for.
 */
export async function collectEvidencePdfsForPacket(
  confidence: Record<string, unknown> | undefined,
): Promise<Array<{ name: string; bytes: Buffer }>> {
  const out: Array<{ name: string; bytes: Buffer }> = [];
  let totalBytes = 0;
  for (const [k, entry] of Object.entries(confidence || {})) {
    if (!Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k)) continue;
    const files = (entry as { evidenceFiles?: AppendixFileLike[] } | undefined)
      ?.evidenceFiles;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (!f?.objectPath) continue;
      if (!isPdfAttachment(f)) continue;
      if (typeof f.size === "number" && f.size > EVIDENCE_ATTACHMENT_MAX_BYTES) continue;
      if (totalBytes >= EVIDENCE_ATTACHMENT_TOTAL_BUDGET_BYTES) break;
      try {
        const bytes = await evidenceBytesLoader(f.objectPath);
        if (!bytes || bytes.length === 0) continue;
        if (bytes.length > EVIDENCE_ATTACHMENT_MAX_BYTES) continue;
        if (totalBytes + bytes.length > EVIDENCE_ATTACHMENT_TOTAL_BUDGET_BYTES) continue;
        totalBytes += bytes.length;
        out.push({ name: f.name || "attachment.pdf", bytes });
      } catch {
        // skip — manifest still lists the file with the download link
      }
    }
  }
  return out;
}

/**
 * Task #722 — append every supplied PDF onto the end of the packet
 * buffer using pdf-lib. Pages from each attachment are copied in
 * order, so the packet's page count grows by the sum of the embedded
 * PDFs' page counts. Unparseable attachments (corrupted, encrypted,
 * etc.) are skipped silently — they remain in the manifest with an
 * "available on request" note for the reviewer to chase.
 */
export async function mergeEvidencePdfs(
  packetBuffer: Buffer,
  pdfs: Array<{ name: string; bytes: Buffer }>,
): Promise<Buffer> {
  if (pdfs.length === 0) return packetBuffer;
  let merged: PdfLibDocument;
  try {
    merged = await PdfLibDocument.load(packetBuffer);
  } catch {
    return packetBuffer;
  }
  for (const att of pdfs) {
    try {
      const src = await PdfLibDocument.load(att.bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch {
      // skip unparseable PDFs — manifest already lists them
    }
  }
  const out = await merged.save();
  return Buffer.from(out);
}

function isImageMime(mime: string | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  // PDFKit's image() accepts JPEG and PNG only; gifs / webp / heic
  // degrade to the file-type indicator badge.
  return m === "image/png" || m === "image/jpeg" || m === "image/jpg";
}

function isPdfFile(file: AppendixFileLike): boolean {
  if ((file.mimeType || "").toLowerCase() === "application/pdf") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".pdf");
}

// Task #761 — first-page PDF rasterization uses the shared
// `rasterizePdfFirstPage` helper (Task #839 lifted it to
// `lib/pdf-rasterize.ts` so the in-app evidence thumbnail endpoint
// can reuse the same mupdf-wasm path without dragging the entire
// packet renderer into the route module).

function fileTypeBadgeLabel(file: AppendixFileLike): string {
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (ext === "pdf" || (file.mimeType || "").toLowerCase() === "application/pdf") return "PDF";
  if (ext === "docx" || ext === "doc") return "DOC";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "XLS";
  if (ext === "pptx" || ext === "ppt") return "PPT";
  if (ext === "gif") return "GIF";
  if (ext === "webp") return "IMG";
  if (ext === "heic" || ext === "heif") return "IMG";
  if (ext === "txt") return "TXT";
  if (ext) return ext.slice(0, 4).toUpperCase();
  return "FILE";
}

function drawFileTypeBadge(doc: PDFDoc, x: number, y: number, label: string) {
  const w = THUMBNAIL_BOX;
  const h = THUMBNAIL_BOX;
  doc.save();
  doc.roundedRect(x, y, w, h, 4).fill(BRAND.lightGray);
  doc.strokeColor(BRAND.gray).lineWidth(0.5).roundedRect(x, y, w, h, 4).stroke();
  doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(label.length > 3 ? 11 : 14);
  const textW = doc.widthOfString(label);
  const textH = doc.currentLineHeight();
  doc.text(label, x + (w - textW) / 2, y + (h - textH) / 2, { lineBreak: false });
  doc.restore();
}

/** Task #714 — build the public download URL for an evidence file
 *  stored in App Storage. Returns null when no objectPath is present
 *  (legacy inline base64 attachments) or when no public APP_URL is
 *  configured (the appendix degrades to filename-only). */
function evidenceDownloadUrl(objectPath: string | undefined): string | null {
  if (!objectPath) return null;
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
  return `${base}/api/storage${path}`;
}

// Task #707 — render an "Evidence Files" appendix subsection listing
// every founder-uploaded attachment grouped by assumption. The lender
// reviewer can use this as a manifest when pulling the source documents
// from the founder's data room.
async function renderAssumptionsEvidenceAppendix(
  doc: PDFDoc,
  confidence: LenderPacket["assumptionConfidence"],
): Promise<void> {
  const rows: Array<{ label: string; file: AppendixFileLike }> = [];
  for (const [k, entry] of Object.entries(confidence || {})) {
    if (!Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k)) continue;
    const files = (entry as { evidenceFiles?: AppendixFileLike[] } | undefined)?.evidenceFiles;
    if (!Array.isArray(files) || files.length === 0) continue;
    const label = ASSUMPTION_REGISTRY[k as AssumptionKey].label;
    for (const f of files) {
      if (!f?.name) continue;
      rows.push({ label, file: f });
    }
  }
  if (rows.length === 0) return;

  ensureSpace(doc, 60);
  subSection(doc, "Evidence Files");
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(
    `${rows.length} file${rows.length === 1 ? "" : "s"} attached by the founder. Image and PDF attachments preview inline; other file types show a type indicator with a clickable download link.`,
    {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    },
  );
  doc.moveDown(0.3);

  // Task #732 — fetch image bytes up front so each row can render its
  // thumbnail. Task #761 extends the same path to PDF attachments,
  // where the first page is rasterized via mupdf-wasm into a PNG
  // thumbnail (leases / signed MOUs are the most common attachment
  // type, so this is the highest-impact preview to add). All other
  // file types degrade to the file-type indicator badge. We respect a
  // per-file size cap and a per-packet total byte budget so a stack
  // of large attachments can't balloon the packet beyond what email
  // gateways will accept; the budget is charged against the source
  // file size, not the rendered thumbnail, so the rasterizer can't
  // sneak past it.
  let bytesUsed = 0;
  const thumbnails = new Map<AppendixFileLike, Buffer | null>();
  for (const { file } of rows) {
    if (!file.objectPath) continue;
    const isImage = isImageMime(file.mimeType);
    const isPdf = !isImage && isPdfFile(file);
    if (!isImage && !isPdf) continue;
    if (typeof file.size === "number" && file.size > EVIDENCE_THUMBNAIL_MAX_BYTES) continue;
    if (bytesUsed >= EVIDENCE_THUMBNAIL_TOTAL_BUDGET_BYTES) break;
    try {
      const bytes = await evidenceBytesLoader(file.objectPath);
      if (!bytes || bytes.length === 0) continue;
      if (bytes.length > EVIDENCE_THUMBNAIL_MAX_BYTES) continue;
      if (bytesUsed + bytes.length > EVIDENCE_THUMBNAIL_TOTAL_BUDGET_BYTES) continue;
      bytesUsed += bytes.length;
      if (isPdf) {
        const png = await rasterizePdfFirstPage(bytes);
        if (png && png.length > 0) thumbnails.set(file, png);
        // mupdf failed (encrypted PDF, malformed bytes, etc.) —
        // intentionally fall through to the file-type badge.
      } else {
        thumbnails.set(file, bytes);
      }
    } catch {
      // Loader failed — fall back to file-type badge for this row.
    }
  }

  let lastLabel = "";
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  for (const { label, file } of rows) {
    ensureSpace(doc, THUMBNAIL_BOX + 14);
    if (label !== lastLabel) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
      doc.text(label, margin, doc.y);
      doc.moveDown(0.1);
      lastLabel = label;
    }

    const rowTop = doc.y;
    const thumbX = margin + 10;
    const textX = thumbX + THUMBNAIL_BOX + THUMBNAIL_GAP;
    const textWidth = contentWidth - (textX - margin);

    // Render the preview block — image thumbnail when we have bytes,
    // otherwise a file-type indicator badge so the reviewer still gets
    // an at-a-glance signal of what's attached.
    const imageBytes = thumbnails.get(file);
    if (imageBytes) {
      try {
        doc.image(imageBytes, thumbX, rowTop, {
          fit: [THUMBNAIL_BOX, THUMBNAIL_BOX],
          align: "center",
          valign: "center",
        });
      } catch {
        drawFileTypeBadge(doc, thumbX, rowTop, fileTypeBadgeLabel(file));
      }
    } else {
      drawFileTypeBadge(doc, thumbX, rowTop, fileTypeBadgeLabel(file));
    }

    const meta: string[] = [];
    if (typeof file.size === "number") meta.push(formatEvidenceFileSize(file.size));
    if (file.mimeType) meta.push(file.mimeType);
    if (file.uploadedAt) {
      const d = new Date(file.uploadedAt);
      if (!Number.isNaN(d.getTime())) {
        meta.push(`uploaded ${d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
      }
    }
    const metaStr = meta.length ? meta.join(" · ") : "";
    const downloadUrl = evidenceDownloadUrl(file.objectPath);

    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    if (downloadUrl) {
      // Task #714 — render the filename as a clickable link to App
      // Storage so the reviewer can pull the source doc straight from
      // the PDF.
      doc.fillColor(BRAND.navy).text(file.name || "Attachment", textX, rowTop, {
        link: downloadUrl,
        underline: true,
        width: textWidth,
      });
    } else {
      doc.text(file.name || "Attachment", textX, rowTop, {
        width: textWidth,
        link: null,
        underline: false,
      });
    }
    if (metaStr) {
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray)
        .text(metaStr, textX, doc.y, { width: textWidth, link: null, underline: false });
    }

    // Task #722 — render a one-line disposition note so the reviewer
    // immediately knows whether the file body lives inside the packet
    // (embedded PDF / inline image thumbnail) or whether they need to
    // request the source document separately (oversized or unsupported
    // file type). Mirrors the manifest convention used in the lender
    // packet so trustees and lenders see identical wording.
    // Task #722 / #878 — disposition note wording lives in the shared
    // `evidenceAttachmentManifestNote` helper so the parity guard
    // (`tests/packet-attachments-evidence-appendix-parity.ts`) can pin
    // it against the founder-facing wizard preview's labels.
    const note = evidenceAttachmentManifestNote(file, {
      imagePreviewLoaded: Boolean(imageBytes),
    });
    if (note) {
      const dispositionColor = note.tone === "info" ? BRAND.teal : BRAND.amber;
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(dispositionColor)
        .text(note.text, textX, doc.y, {
          width: textWidth,
          link: null,
          underline: false,
        });
    }

    // Advance past the thumbnail box so the next row never overlaps.
    const textBottom = doc.y;
    const rowBottom = Math.max(textBottom, rowTop + THUMBNAIL_BOX);
    doc.y = rowBottom + 8;
    doc.fillColor(BRAND.black);
  }
  doc.moveDown(0.3);
}

function renderSection(doc: PDFDoc, section: PacketSection, packet: LenderPacket) {
  if (section.id === "decision_history") {
    // Task #920 — suppress the entire section (heading AND body) when no
    // decisions with an outcome exist. A solitary "no decisions tracked
    // yet" line telegraphs an unbuilt feature to lenders and adds no
    // signal. The section reappears as soon as one outcome is recorded.
    if (packet.decisionHistory.length === 0) return;
    renderDecisionHistorySection(doc, section, packet.decisionHistory, {
      emptyStateHint:
        "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here.",
    });
    return;
  }

  sectionTitle(doc, section.title);

  if (section.narrative) {
    bodyText(doc, section.narrative);
  }

  if (section.insights && section.insights.length > 0) {
    renderPacketInsights(doc, section.insights);
  }

  if (section.linkedMetrics.length > 0) {
    renderMetrics(doc, section.linkedMetrics);
  }

  if (section.id === "key_risks" && packet.riskMitigants.length > 0) {
    renderRiskMitigants(doc, packet.riskMitigants);
    if (section.linkedMetrics.length > 0) {
      renderMetrics(doc, section.linkedMetrics);
    }
    drawFooterNote(doc, "See Appendix for complete assumption details.");
    return;
  }

  if (section.id === "debt_service" && packet.dscrSummary) {
    doc.moveDown(0.3);
    subSection(doc, "DSCR Summary");
    labelValue(doc, "Current DSCR:", packet.dscrSummary.currentDSCR);
    labelValue(doc, "Benchmark:", packet.dscrSummary.benchmark);
    labelValue(doc, "Trend:", packet.dscrSummary.trendDescription);
    doc.moveDown(0.3);
  }

  if (section.tables && section.tables.length > 0) {
    for (const table of section.tables) {
      renderPacketTable(doc, table);
    }
  }

  // After the operating reserve / ending cash table, surface a one-line
  // callout for the trough year so lenders see the runway crunch year at
  // a glance — same wording used in the board packet (Task #213).
  if (section.id === "debt_service" && packet.cashRunway) {
    if (packet.cashRunway.troughCallout) {
      renderCashRunwayTroughCallout(doc, packet.cashRunway, { prependEnsureSpace: 24 });
    }
    // Task #646 — surface the unrestricted-cash headline + accrual context
    // alongside the trough callout so lenders see the same figure DSCR /
    // runway are computed off as the founder's dashboard hero card.
    renderCashRunwayAccrualToggle(doc, packet.cashRunway, { prependEnsureSpace: 32 });
  }

  if (section.linkedAssumptions.length > 0 && shouldShowAssumptions(section.id)) {
    doc.moveDown(0.3);
    subSection(doc, "Supporting Assumptions");
    for (const a of section.linkedAssumptions.slice(0, 10)) {
      labelValue(doc, a.label, a.value);
      // Task #455 — when an assumption carries a fragility footnote (e.g. a
      // litigated voucher program), render it as a small italic line right
      // under the value so the caveat sits next to the dollar amount.
      if (a.note) {
        renderAssumptionNote(doc, a.note);
      }
    }
    if (section.linkedAssumptions.length > 10) {
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
      doc.text(`  ... and ${section.linkedAssumptions.length - 10} more (see Appendix)`);
    }
    doc.moveDown(0.3);
  }
}

// Task #455 — render the small italic footnote attached to a linked
// assumption (e.g. "OH EdChoice voucher is currently in litigation.").
// Indented to visually associate with the labelValue line above and
// colored amber so a quick skim spots the caveat next to the dollars.
function renderAssumptionNote(doc: PDFDoc, note: string): void {
  const margin = doc.page.margins.left;
  const indent = margin + 8;
  const w = doc.page.width - doc.page.margins.right - indent;
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.amber);
  doc.text(note, indent, doc.y, { width: w });
  doc.fillColor(BRAND.black);
}

function shouldShowAssumptions(sectionId: string): boolean {
  return ["school_overview", "enrollment_plan", "revenue_model", "staffing_plan", "capital_debt", "appendix_assumptions"].includes(sectionId);
}

function renderMetrics(doc: PDFDoc, metrics: LinkedMetric[]) {
  // #923 addendum Option A — neutral metrics render with no glyph (plain
  // label only); rely on STATUS_ICON.neutral ("") instead of overriding to
  // a space, so a neutral row reads flush with the section heading rather
  // than indented by one space character.
  renderLinkedMetrics(doc, metrics, {
    limit: 8,
    showBenchmark: true,
    reserveInitialSpace: true,
  });
}

function renderRiskMitigants(doc: PDFDoc, riskMitigants: RiskMitigant[]) {
  doc.moveDown(0.3);

  for (const rm of riskMitigants) {
    ensureSpace(doc, 60);

    const severityColor = rm.severity === "critical" ? BRAND.red : rm.severity === "high" ? BRAND.amber : BRAND.darkGray;

    doc.save();
    doc.roundedRect(doc.page.margins.left, doc.y, 4, 40, 1).fill(severityColor);
    doc.restore();

    const indent = doc.page.margins.left + 12;
    const w = doc.page.width - doc.page.margins.right - indent;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(severityColor);
    doc.text(`${rm.severity.toUpperCase()}`, indent, doc.y);

    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
    doc.text(rm.risk, indent, doc.y, { width: w });

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(rm.whyItMatters, indent, doc.y, { width: w });

    if (rm.supportingMetrics.length > 0) {
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
      const evidence = rm.supportingMetrics.map((sm) => `${sm.label}: ${sm.value}`).join("  |  ");
      doc.text(`Evidence: ${evidence}`, indent, doc.y, { width: w });
    }

    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.teal);
    doc.text("Mitigation: ", indent, doc.y, { continued: true, width: w });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(rm.mitigant, { width: w - 60 });

    doc.moveDown(0.5);
  }
}

function renderBreakEvenDownsideSection(doc: PDFDoc, bed: BreakEvenDownsideExport) {
  ensureSpace(doc, 60);
  sectionTitle(doc, "Break-Even & Downside Sensitivity");
  bodyText(
    doc,
    bed.maxCapacity
      ? `Break-even student counts assume current revenue and cost mix. Utilization compares break-even to the stated max capacity of ${bed.maxCapacity} students.`
      : "Break-even student counts assume current revenue and cost mix. Set max capacity in the wizard to see utilization %.",
  );
  doc.moveDown(0.3);

  subSection(doc, "Per-Year Break-Even");
  for (let y = 0; y < 5; y++) {
    const be = bed.breakEvenStudents[y];
    const util = bed.breakEvenUtilization[y];
    const planned = bed.enrollment[y] ?? 0;
    const beStr = be === null ? "N/A" : `${be} students`;
    const utilStr = util === null ? "" : ` · ${(util * 100).toFixed(0)}% of capacity`;
    labelValue(doc, `Year ${y + 1} (planned ${planned}):`, `${beStr}${utilStr}`);
  }
  doc.moveDown(0.3);

  subSection(doc, "Downside Enrollment Band");
  for (const [label, ds] of [
    ["If 10% fewer students enroll", bed.downsideBand.minus10] as const,
    ["If 20% fewer students enroll", bed.downsideBand.minus20] as const,
  ]) {
    ensureSpace(doc, 30);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.amber);
    doc.text(label, doc.page.margins.left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    for (let y = 0; y < 5; y++) {
      const dscrStr = ds.dscr[y] > 0 ? `${ds.dscr[y].toFixed(2)}x` : "N/A";
      labelValue(
        doc,
        `  Year ${y + 1} (${ds.enrollment[y]} students):`,
        `DSCR ${dscrStr} · Ending cash ${fmtCurrency(ds.endingCash[y])}`,
      );
    }
    doc.moveDown(0.3);
  }

  renderSensitivityGridSection(doc, bed.sensitivityGrid);
}

// Task #628 — two-variable sensitivity grid (enrollment delta × tuition
// delta). Rendered as a heatmap-style table where each cell shows Year-1
// DSCR over Year-5 ending cash, color-coded by the same DSCR thresholds
// (BENCHMARK_DSCR_GREEN / AMBER) used elsewhere in the packet.
function renderSensitivityGridSection(doc: PDFDoc, grid: BreakEvenDownsideExport["sensitivityGrid"]) {
  if (!grid || grid.cells.length === 0 || grid.tuitionDeltas.length === 0) return;

  ensureSpace(doc, 60 + grid.cells.length * 22);
  subSection(doc, "Enrollment × Tuition Sensitivity (Yr 1 DSCR / Yr 5 ending cash)");
  bodyText(
    doc,
    `Each cell re-runs the canonical engine with the row's enrollment delta and the column's tuition delta applied together. Cells shaded green clear the ${BENCHMARK_DSCR_GREEN}x DSCR benchmark; amber sit between ${BENCHMARK_DSCR_AMBER}x–${BENCHMARK_DSCR_GREEN}x; red are below ${BENCHMARK_DSCR_AMBER}x.`,
  );
  doc.moveDown(0.3);

  const margin = doc.page.margins.left;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const labelColW = 70;
  const colCount = grid.tuitionDeltas.length;
  const cellW = (contentW - labelColW) / colCount;
  const headerH = 18;
  const rowH = 22;

  // Header row
  ensureSpace(doc, headerH + rowH * grid.cells.length + 6);
  let y = doc.y;
  doc.save();
  doc.rect(margin, y, labelColW, headerH).fill(BRAND.lightGray);
  doc.fillColor(BRAND.darkGray).font("Helvetica-Bold").fontSize(7);
  doc.text("Enrollment ↓ / Tuition →", margin + 3, y + 5, { width: labelColW - 6, lineBreak: false });
  doc.restore();
  for (let c = 0; c < colCount; c++) {
    const cx = margin + labelColW + c * cellW;
    doc.save();
    doc.rect(cx, y, cellW, headerH).fill(BRAND.lightGray);
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(8);
    const tD = grid.tuitionDeltas[c];
    const tLabel = `${tD > 0 ? "+" : ""}${tD}% tuition`;
    doc.text(tLabel, cx, y + 5, { width: cellW, align: "center", lineBreak: false });
    doc.restore();
  }
  y += headerH;

  for (let r = 0; r < grid.cells.length; r++) {
    const row = grid.cells[r];
    const eD = grid.enrollmentDeltas[r];
    // Row label
    doc.save();
    doc.rect(margin, y, labelColW, rowH).fill(BRAND.lightGray);
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(8);
    doc.text(
      `${eD > 0 ? "+" : ""}${eD}% enroll`,
      margin + 3,
      y + 6,
      { width: labelColW - 6, lineBreak: false },
    );
    doc.restore();

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const cx = margin + labelColW + c * cellW;
      // DSCR-based shading; sentinel 0 means "no debt service modeled"
      // — render those neutral so the grid still shows the cash impact.
      let fill = BRAND.white;
      if (cell.dscr === 0) {
        fill = "#F3F4F6";
      } else if (cell.dscr >= BENCHMARK_DSCR_GREEN) {
        fill = "#DCFCE7";
      } else if (cell.dscr >= BENCHMARK_DSCR_AMBER) {
        fill = "#FEF3C7";
      } else {
        fill = "#FEE2E2";
      }
      doc.save();
      doc.rect(cx, y, cellW, rowH).fill(fill);
      doc.strokeColor(BRAND.gray).lineWidth(0.3).rect(cx, y, cellW, rowH).stroke();
      const dscrStr = cell.dscr === 0 ? "—" : `${cell.dscr.toFixed(2)}x`;
      doc.fillColor(BRAND.black).font("Helvetica-Bold").fontSize(8.5);
      doc.text(dscrStr, cx, y + 3, { width: cellW, align: "center", lineBreak: false });
      doc.fillColor(BRAND.darkGray).font("Helvetica").fontSize(7.5);
      doc.text(fmtCurrency(cell.endingCash), cx, y + 12, { width: cellW, align: "center", lineBreak: false });
      doc.restore();
    }
    y += rowH;
  }
  doc.y = y + 4;
  doc.fillColor(BRAND.black).font("Helvetica");
}

// Task #668 — per-program break-even for Year 1. Renders a table showing,
// for each program: enrollment, students needed to break even on its
// allocated fixed-cost share, the allocated fixed cost itself, the
// surplus / subsidy contribution, and a Carries / Subsidised flag. Same
// canonical numbers the planner UI shows on screen. Skipped silently
// when the founder has not defined any programs (single-program schools
// or pre-program models).
function renderProgramBreakEvenSection(doc: PDFDoc, programs: ProgramBreakEven[]) {
  if (!programs || programs.length === 0) return;

  ensureSpace(doc, 80);
  sectionTitle(doc, "Per-Program Break-Even (Year 1)");
  bodyText(
    doc,
    "Allocates Year 1 fixed costs (staffing, facility, debt service, fixed opex) across programs by share of enrollment. " +
      "\"Students needed\" is the count required for each program to cover its allocated fixed cost at current tuition and variable cost. " +
      "Programs with positive surplus are carrying the school; negative surplus means the program is being subsidised by the rest of the portfolio.",
  );
  doc.moveDown(0.3);

  const carriers = programs.filter((p) => p.carriesSchool).length;
  const subsidised = programs.length - carriers;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(
    `${carriers} of ${programs.length} program${programs.length === 1 ? "" : "s"} ${carriers === 1 ? "is" : "are"} carrying the school in Year 1; ${subsidised} ${subsidised === 1 ? "is" : "are"} subsidised.`,
  );
  doc.font("Helvetica").fillColor(BRAND.black);
  doc.moveDown(0.4);

  for (const p of programs) {
    ensureSpace(doc, 20);
    const needed = p.breakEvenStudents === null ? "N/A" : `${p.breakEvenStudents}`;
    const status = p.carriesSchool ? "Carrying" : "Subsidised";
    const statusColor = p.carriesSchool ? BRAND.green : BRAND.amber;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
    doc.text(p.programName, doc.page.margins.left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    labelValue(doc, "  Enrolled (Y1):", `${p.enrollment}`);
    labelValue(doc, "  Students needed to break even:", needed);
    labelValue(doc, "  Allocated fixed cost:", fmtCurrency(p.allocatedFixedCost));
    labelValue(doc, "  Surplus / (subsidy):", fmtCurrency(p.surplus));
    doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor);
    doc.text(`  ${status}`, doc.page.margins.left, doc.y);
    doc.font("Helvetica").fillColor(BRAND.black);
    doc.moveDown(0.4);
  }
}

/**
 * Task #894 — Methodology callout explaining why the two Excel workbooks
 * shipped in the lender packet (underwriting + lender pro-forma) will not
 * tie on Y1 Net Income for the same payload. The lender pro-forma's
 * 5-Year P&L is an intentionally simplified comparator (see
 * `lender-proforma-export.ts` `buildPnL` doc comment) and is the
 * "edit-an-assumption-and-re-run" sheet; the underwriting Operating
 * Statement is the canonical accounting bottom line. Surfacing the
 * divergence here is the credibility-risk mitigation #894 calls for.
 */
export function renderProFormaMethodologyNote(doc: PDFDoc) {
  ensureSpace(doc, 90);
  sectionTitle(doc, PRO_FORMA_METHODOLOGY_NOTE_TITLE);
  bodyText(doc, PRO_FORMA_METHODOLOGY_NOTE_BODY);
  doc.moveDown(0.4);
}

export function renderLenderStressTestsSection(doc: PDFDoc, stress: LenderStressTestResults) {
  ensureSpace(doc, 80);
  sectionTitle(doc, "Standard Lender Stress Tests");
  bodyText(
    doc,
    "Five fixed downside scenarios re-run against the canonical model. Each row shows the worst-year DSCR, ending-cash trough, and Year-1 net-income delta vs base. Identical figures appear on the founder dashboard and in the lender pro-forma workbook.",
  );
  doc.moveDown(0.3);

  // True minimum DSCR: drop only the engine sentinel (0 = "no debt service
  // modeled"). Negative DSCR — debt service exists, NOI is negative — is the
  // worst case and MUST be surfaced to the lender, not hidden.
  const baseStructural = stress.base.dscr.filter((d) => d !== 0);
  const baseMinDscr: number | null = baseStructural.length ? Math.min(...baseStructural) : null;
  // Task #932 — render the in-year monthly cash signals next to
  // year-end "Min ending cash" so the *monthly* cash story is visible,
  // not just the year-end snapshot. Lead with `firstNegativeCashMonth`
  // (the concrete date a bridge must clear past); fall back to the
  // trough when cash stays positive (use it as the "worst monthly low"
  // benchmark for context).
  const baseFirstNeg = stress.base.firstNegativeCashMonth;
  const baseTrough = stress.base.lowestCashMonth;
  const baseFirstNegStr = baseFirstNeg
    ? ` · ⚠ Cash first goes negative Y${(baseFirstNeg.yearIndex ?? 0) + 1} ${baseFirstNeg.monthLabel} ${fmtCurrency(baseFirstNeg.amount)}`
    : baseTrough
      ? ` · Lowest monthly cash Y${(baseTrough.yearIndex ?? 0) + 1} ${baseTrough.monthLabel} ${fmtCurrency(baseTrough.amount)}`
      : "";
  labelValue(
    doc,
    "Base case:",
    `Min DSCR ${baseMinDscr === null ? "N/A" : baseMinDscr.toFixed(2) + "x"} · Min ending cash ${fmtCurrency(Math.min(...stress.base.endingCash))} · Runway ${stress.base.cashRunwayMonths.toFixed(1)} mo${baseFirstNegStr}`,
  );
  doc.moveDown(0.4);

  for (const sc of stress.scenarios) {
    ensureSpace(doc, 50);
    const structural = sc.dscr.filter((d) => d !== 0);
    const minDscr: number | null = structural.length ? Math.min(...structural) : null;
    const dscrColor =
      minDscr === null
        ? BRAND.darkGray
        : minDscr >= BENCHMARK_DSCR_GREEN
          ? "#15803d"
          : minDscr >= BENCHMARK_DSCR_AMBER
            ? BRAND.amber
            : "#b91c1c";

    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
    doc.text(sc.name, doc.page.margins.left, doc.y);
    doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.gray);
    doc.text(sc.description, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    doc.moveDown(0.15);

    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    const minDscrStr = minDscr === null ? "N/A" : `${minDscr.toFixed(2)}x`;
    const beStr =
      sc.breakEvenYear === null
        ? "Never"
        : `Year ${sc.breakEvenYear}${sc.deltaVsBase.breakEvenYearShift && sc.deltaVsBase.breakEvenYearShift !== 0 ? ` (${sc.deltaVsBase.breakEvenYearShift > 0 ? "+" : ""}${sc.deltaVsBase.breakEvenYearShift}y vs base)` : ""}`;
    doc.fillColor(dscrColor);
    doc.text(`  Min DSCR: ${minDscrStr}`, doc.page.margins.left, doc.y, { continued: true });
    doc.fillColor(BRAND.black);
    doc.text(`   ·   Min ending cash: ${fmtCurrency(Math.min(...sc.endingCash))}   ·   Runway: ${sc.cashRunwayMonths.toFixed(1)} mo   ·   Break-even: ${beStr}`);
    // Task #932 — surface the worst monthly cumulative-cash trough under
    // the scenario so lenders see the in-year low (when tuition has not
    // yet arrived but payroll has), not just the year-end minimum that
    // `Min ending cash` reports.
    const scTrough = sc.lowestCashMonth;
    if (scTrough) {
      doc.fillColor(scTrough.isNegative ? "#b91c1c" : BRAND.gray);
      doc.text(
        `  Lowest monthly cash: Year ${(scTrough.yearIndex ?? 0) + 1} (${scTrough.monthLabel}) ${fmtCurrency(scTrough.amount)}${scTrough.isNegative ? " — dips below zero mid-year" : ""}`,
        doc.page.margins.left,
        doc.y,
      );
      doc.fillColor(BRAND.black);
    }
    const y1 = sc.deltaVsBase.y1NetIncome;
    doc.fillColor(y1 < 0 ? "#b91c1c" : "#15803d");
    doc.text(`  Year-1 net income vs base: ${y1 >= 0 ? "+" : ""}${fmtCurrency(y1)}`, doc.page.margins.left, doc.y);
    doc.fillColor(BRAND.black);
    doc.moveDown(0.5);
  }
}

function drawFooterNote(doc: PDFDoc, text: string) {
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
  doc.text(text, doc.page.margins.left, doc.y, { align: "left" });
  doc.moveDown(0.3);
}


/**
 * Task #617 - Renders the lender / board narrative commentary block as a
 * lead section of the PDF. Each paragraph from `commentary.paragraphs` is
 * rendered as plain prose with a navy section title bar, matching the
 * styling used elsewhere in the packet. We intentionally do NOT print
 * the source bundle - that surfaces in the in-app preview only, where a
 * founder can audit the inputs before regenerating.
 *
 * Task #740 — when the founder edited the audience-specific narrative
 * draft on the Lender Narrative wizard step (`budgetNarrative.audienceDrafts.*`),
 * that prose wins. The deterministic `commentary.paragraphs` are used as
 * the fallback when the founder draft is blank, so the founder-edit path
 * loses nothing the auto-draft delivered. Founder-edited prose is rendered
 * as plain text (paragraph splits on blank lines) and the canonical-engine
 * footer note is suppressed since the figure-allowlist guard does not
 * apply to hand-edited text.
 */
/**
 * Task #740 — Paragraph-selection helper extracted so the fallback chain
 * (founder edit wins → auto-built commentary fallback → render nothing)
 * is unit-testable without spinning up a PDFDoc. The renderer below uses
 * this helper to decide what to print and which footer note to attach.
 *
 * Contract:
 *   - `founderDraft` is non-blank → split on blank lines, trim, drop
 *     empties; `usingFounderDraft = true`.
 *   - `founderDraft` is blank/undefined → use `commentary.paragraphs`
 *     verbatim; `usingFounderDraft = false`.
 *   - When neither path yields any paragraphs, returns an empty array
 *     and the caller must skip rendering the section header so we don't
 *     leave an orphan "Lender Commentary" / "Grant Version" title with
 *     no body.
 */
export function chooseCommentaryParagraphs(
  commentary: NarrativeCommentary | undefined,
  founderDraft?: string,
): { paragraphs: string[]; usingFounderDraft: boolean } {
  const founderText = (founderDraft || "").trim();
  const usingFounderDraft = founderText.length > 0;
  const paragraphs = usingFounderDraft
    ? founderText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : commentary?.paragraphs ?? [];
  return { paragraphs, usingFounderDraft };
}

export function renderNarrativeCommentarySection(
  doc: PDFDoc,
  title: string,
  commentary: NarrativeCommentary,
  founderDraft?: string,
) {
  const { paragraphs, usingFounderDraft } = chooseCommentaryParagraphs(
    commentary,
    founderDraft,
  );
  if (paragraphs.length === 0) return;
  sectionTitle(doc, title);
  for (const paragraph of paragraphs) {
    ensureSpace(doc, 40);
    bodyText(doc, paragraph);
  }
  doc.moveDown(0.3);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
  doc.text(
    usingFounderDraft
      ? "Edited by the founder for this audience. Figures elsewhere in this packet are sourced from the canonical engine."
      : "Every figure in this commentary is sourced from the same canonical engine that powers the rest of this packet.",
    doc.page.margins.left,
    doc.y,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
  );
  doc.fillColor(BRAND.black);
  doc.moveDown(0.5);
}
