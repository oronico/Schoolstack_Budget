import ExcelJS from "exceljs";
import {
  DECISION_LABELS,
  OUTCOME_LABELS,
  buildDecisionBullets,
  coercePersistedDecisionOverrides,
  computeDecisionImpactFromPersisted,
  isDecisionOutcomeStatus,
  isDecisionType,
  type DecisionEngineModelData,
  type DecisionFieldChange,
  type DecisionOutcomeStatus,
  type DecisionType as DecisionHistoryType,
} from "@workspace/finance";
import type { ModelData } from "../workbook-helpers";
import {
  NAVY,
  WHITE,
  GREEN_BG,
  RED_BG,
  AMBER_BG,
  EVERGREEN,
  NF,
  BF,
  BORDER,
  printSetup,
} from "../workbook-helpers.js";

// Re-exported for the packet builders / PDF renderers / tests that imported
// these names from this module before the bullet logic moved into
// @workspace/finance.
export type { DecisionOutcomeStatus, DecisionHistoryType };

export interface DecisionHistoryItem {
  name: string;
  decisionType?: DecisionHistoryType;
  decisionTypeLabel: string;
  outcomeStatus: DecisionOutcomeStatus;
  outcomeLabel: string;
  bullets: string[];
  retrospective?: string;
  appliedToModelAt?: string;
  outcomeUpdatedAt?: string;
  createdAt?: string;
  // For pursued items, indicates whether the decision has been folded back into
  // the base model (so reviewers know whether the projection already reflects
  // it) or is still pending apply.
  appliedNote?: string;
  isPendingApply?: boolean;
  // Snapshot of the field-level before/after diff captured at apply time by
  // `summarizeDecisionChanges` and persisted on the scenario (Task #375). The
  // lender / board PDF "Decision history" section renders 3–6 of these so
  // reviewers can see exactly which fields the decision moved. Older saved
  // scenarios pre-this feature simply have an empty array and the renderer
  // degrades gracefully (skips the diff block).
  appliedFieldChanges: DecisionFieldChange[];
  /**
   * Lowest projected ending-cash year for the decision's adjusted forecast,
   * computed by replaying the saved overrides through the decision engine
   * (Task #378). Mirrors the in-app `ImpactSummary` trough callout so the
   * board / lender PDFs surface the runway crunch year per decision without
   * the founder flipping back to the planner. Null when we couldn't compute
   * an adjusted forecast (missing decision type, malformed overrides, or
   * a runtime error in the engine — we degrade silently).
   */
  troughCallout: { year: number; endingCash: string; isNegative: boolean } | null;
}

interface RawScenario {
  name?: unknown;
  createdAt?: unknown;
  decisionType?: unknown;
  outcomeStatus?: unknown;
  retrospective?: unknown;
  outcomeUpdatedAt?: unknown;
  appliedToModelAt?: unknown;
  appliedFieldChanges?: unknown;
  overrides?: Record<string, unknown> | null;
}

// Defensively coerce a persisted `appliedFieldChanges` value into the typed
// shape. We only accept entries that look exactly like a DecisionFieldChange
// (label/before/after strings + a known `kind`); anything malformed is
// dropped silently so a hand-edited scenario can never crash the PDF renderer.
function coerceAppliedFieldChanges(raw: unknown): DecisionFieldChange[] {
  if (!Array.isArray(raw)) return [];
  const out: DecisionFieldChange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.label !== "string" || !e.label.trim()) continue;
    if (typeof e.before !== "string") continue;
    if (typeof e.after !== "string") continue;
    if (e.kind !== "added" && e.kind !== "modified") continue;
    out.push({ label: e.label, before: e.before, after: e.after, kind: e.kind });
  }
  return out;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

// Match the cash formatter used by `build-cash-runway` so the per-decision
// trough callout reads consistently with the top-level Cash & Runway card
// (Task #378 keeps styling aligned with the existing trough callouts in the
// board / lender packets).
function fmtCash(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// Replay a saved decision's persisted overrides against the current base
// model and pick out the lowest ending-cash year of the adjusted forecast.
// Returns null on any failure path (no decision type, malformed overrides,
// engine throws) so the renderer degrades gracefully — older saved scenarios
// without a typed decision simply skip the callout.
function buildTroughCallout(
  modelData: ModelData,
  decisionType: DecisionHistoryType | undefined,
  overrides: ReturnType<typeof coercePersistedDecisionOverrides>,
): DecisionHistoryItem["troughCallout"] {
  if (!decisionType) return null;
  try {
    const impact = computeDecisionImpactFromPersisted(
      modelData as unknown as DecisionEngineModelData,
      decisionType,
      overrides,
    );
    const cash = impact.adjusted.cashPosition;
    if (!Array.isArray(cash) || cash.length === 0) return null;
    let bestIdx = -1;
    let bestVal = Infinity;
    for (let i = 0; i < cash.length; i++) {
      const v = cash[i];
      if (typeof v !== "number" || !isFinite(v)) continue;
      if (v < bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return null;
    return {
      year: bestIdx + 1,
      endingCash: fmtCash(bestVal),
      isNegative: bestVal < 0,
    };
  } catch {
    return null;
  }
}

function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function buildDecisionHistory(modelData: ModelData): DecisionHistoryItem[] {
  const raw = modelData as unknown as Record<string, unknown>;
  const scenarios = raw.customScenarios;
  if (!Array.isArray(scenarios)) return [];

  const items: DecisionHistoryItem[] = [];
  for (const entry of scenarios as RawScenario[]) {
    if (!entry || typeof entry !== "object") continue;
    if (!isDecisionOutcomeStatus(entry.outcomeStatus)) continue;

    const decisionType = isDecisionType(entry.decisionType) ? entry.decisionType : undefined;
    const overrides = coercePersistedDecisionOverrides(
      entry.overrides && typeof entry.overrides === "object"
        ? (entry.overrides as Record<string, unknown>)
        : null,
    );
    const bullets = buildDecisionBullets(overrides, decisionType);

    const appliedAt = formatDate(asString(entry.appliedToModelAt));
    const isPursued = entry.outcomeStatus === "pursued";
    let appliedNote: string | undefined;
    let isPendingApply: boolean | undefined;
    if (isPursued) {
      if (appliedAt) {
        appliedNote = `Folded into the base model on ${appliedAt}`;
        isPendingApply = false;
      } else {
        appliedNote = "Pending apply to base model";
        isPendingApply = true;
      }
    }

    items.push({
      name: asString(entry.name) || "Untitled scenario",
      decisionType,
      decisionTypeLabel: decisionType ? DECISION_LABELS[decisionType] : "Custom scenario",
      outcomeStatus: entry.outcomeStatus,
      outcomeLabel: OUTCOME_LABELS[entry.outcomeStatus],
      bullets,
      retrospective: asString(entry.retrospective),
      appliedToModelAt: asString(entry.appliedToModelAt),
      outcomeUpdatedAt: asString(entry.outcomeUpdatedAt),
      createdAt: asString(entry.createdAt),
      appliedNote,
      isPendingApply,
      appliedFieldChanges: coerceAppliedFieldChanges(entry.appliedFieldChanges),
      troughCallout: buildTroughCallout(modelData, decisionType, overrides),
    });
  }

  // Sort: pursued first (so reviewers see what actually happened), then on hold,
  // then declined. Within each group, most recently updated first.
  const statusOrder: Record<DecisionOutcomeStatus, number> = { pursued: 0, on_hold: 1, declined: 2 };
  items.sort((a, b) => {
    const so = statusOrder[a.outcomeStatus] - statusOrder[b.outcomeStatus];
    if (so !== 0) return so;
    const at = a.outcomeUpdatedAt || a.createdAt || "";
    const bt = b.outcomeUpdatedAt || b.createdAt || "";
    return bt.localeCompare(at);
  });

  return items;
}

export function buildDecisionHistoryNarrative(items: DecisionHistoryItem[]): string {
  if (items.length === 0) {
    return "No decisions have been tracked with an outcome yet. As the team marks saved scenarios as Pursued, Declined, or On hold, those outcomes (and any retrospective notes) will appear here so reviewers can see what actually happened versus what was modeled.";
  }
  const counts = items.reduce(
    (acc, it) => {
      acc[it.outcomeStatus] = (acc[it.outcomeStatus] || 0) + 1;
      return acc;
    },
    { pursued: 0, declined: 0, on_hold: 0 } as Record<DecisionOutcomeStatus, number>,
  );
  const parts: string[] = [];
  if (counts.pursued) parts.push(`${counts.pursued} pursued`);
  if (counts.on_hold) parts.push(`${counts.on_hold} on hold`);
  if (counts.declined) parts.push(`${counts.declined} declined`);
  const summary = parts.join(", ");
  return `Track record of ${items.length} tracked decision${items.length === 1 ? "" : "s"} (${summary}). Each entry shows the modeled change, the outcome the team logged, and any retrospective notes captured after the fact.`;
}

const OUTCOME_FILL_COLOR: Record<DecisionOutcomeStatus, string> = {
  pursued: GREEN_BG,
  declined: RED_BG,
  on_hold: AMBER_BG,
};

// Adds a "Decision History" worksheet to the workbook so reviewers downloading
// the Excel pack get the same outcome track record that already appears in the
// PDF lender / board packets (added in task #187). The empty-state copy mirrors
// the PDF version so reviewers see the same guidance regardless of format.
export function addDecisionHistorySheet(wb: ExcelJS.Workbook, modelData: ModelData): void {
  const items = buildDecisionHistory(modelData);
  const narrative = buildDecisionHistoryNarrative(items);

  const ws = wb.addWorksheet("Decision History", {
    properties: { tabColor: { argb: EVERGREEN } },
  });
  printSetup(ws);

  ws.columns = [
    { width: 3 },   // A: gutter
    { width: 30 },  // B: Decision name
    { width: 22 },  // C: Decision type
    { width: 14 },  // D: Outcome
    { width: 30 },  // E: Applied to base model
    { width: 18 },  // F: Outcome logged
    { width: 38 },  // G: Modeled change details
    { width: 50 },  // H: Retrospective notes
  ];

  // Title row
  ws.mergeCells("B1:H1");
  const title = ws.getCell("B1");
  title.value = "Decision History";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 24;

  // Narrative row (wraps across the full width)
  ws.mergeCells("B2:H2");
  const sub = ws.getCell("B2");
  sub.value = narrative;
  sub.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B7280" } };
  sub.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = items.length === 0 ? 60 : 44;

  if (items.length === 0) {
    // Empty state mirrors the lender PDF's hint copy verbatim so reviewers see
    // the same guidance regardless of which format they downloaded.
    ws.mergeCells("B4:H4");
    const empty = ws.getCell("B4");
    empty.value =
      "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here.";
    empty.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF6B7280" } };
    empty.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(4).height = 30;
    return;
  }

  // Header row
  const headerRow = 4;
  const headers = [
    "Decision",
    "Type",
    "Outcome",
    "Applied to base model?",
    "Outcome logged",
    "Modeled change",
    "What happened (retrospective)",
  ];
  for (let i = 0; i < headers.length; i++) {
    const cell = ws.getCell(headerRow, 2 + i);
    cell.value = headers[i];
    cell.font = { ...BF, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.border = BORDER;
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  }
  ws.getRow(headerRow).height = 28;

  // Item rows
  let r = headerRow + 1;
  for (const item of items) {
    const nameCell = ws.getCell(r, 2);
    nameCell.value = item.name;
    nameCell.font = BF;
    nameCell.border = BORDER;
    nameCell.alignment = { vertical: "top", wrapText: true };

    const typeCell = ws.getCell(r, 3);
    typeCell.value = item.decisionTypeLabel;
    typeCell.font = NF;
    typeCell.border = BORDER;
    typeCell.alignment = { vertical: "top", wrapText: true };

    const outcomeCell = ws.getCell(r, 4);
    outcomeCell.value = item.outcomeLabel;
    outcomeCell.font = { ...BF, color: { argb: NAVY } };
    outcomeCell.border = BORDER;
    outcomeCell.alignment = { vertical: "top", horizontal: "center" };
    outcomeCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: OUTCOME_FILL_COLOR[item.outcomeStatus] },
    };

    const appliedCell = ws.getCell(r, 5);
    if (item.outcomeStatus === "pursued") {
      const prefix = item.isPendingApply ? "[PENDING] " : "[APPLIED] ";
      appliedCell.value = `${prefix}${item.appliedNote ?? ""}`.trim();
    } else {
      appliedCell.value = "—";
    }
    appliedCell.font = NF;
    appliedCell.border = BORDER;
    appliedCell.alignment = { vertical: "top", wrapText: true };

    const loggedCell = ws.getCell(r, 6);
    loggedCell.value = formatDate(item.outcomeUpdatedAt) ?? "—";
    loggedCell.font = NF;
    loggedCell.border = BORDER;
    loggedCell.alignment = { vertical: "top", horizontal: "left" };

    const bulletsCell = ws.getCell(r, 7);
    bulletsCell.value = item.bullets.length > 0
      ? item.bullets.map((b) => `• ${b}`).join("\n")
      : "—";
    bulletsCell.font = NF;
    bulletsCell.border = BORDER;
    bulletsCell.alignment = { vertical: "top", wrapText: true };

    const retroCell = ws.getCell(r, 8);
    retroCell.value = item.retrospective ?? "—";
    retroCell.font = NF;
    retroCell.border = BORDER;
    retroCell.alignment = { vertical: "top", wrapText: true };

    // Estimate row height to fit longest wrapped content (rough heuristic).
    const lineCount = Math.max(
      1,
      Math.ceil((item.retrospective?.length ?? 0) / 60),
      item.bullets.length,
      Math.ceil(((item.appliedNote?.length ?? 0) + 12) / 30),
    );
    ws.getRow(r).height = Math.min(120, Math.max(28, lineCount * 16));

    // Optional left accent stripe in column A so pursued/declined/on_hold are
    // also distinguishable at a glance even without color in the outcome cell.
    const accent = ws.getCell(r, 1);
    accent.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: OUTCOME_FILL_COLOR[item.outcomeStatus] },
    };

    r++;
  }

  // Footer line consistent with other lender sheets.
  r += 1;
  ws.mergeCells(r, 2, r, 8);
  const footer = ws.getCell(r, 2);
  footer.value = "Generated by SchoolStack Budget (budget.schoolstack.ai)";
  footer.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B7280" } };
}
