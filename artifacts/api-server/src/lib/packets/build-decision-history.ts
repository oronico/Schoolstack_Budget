import {
  DECISION_LABELS,
  OUTCOME_LABELS,
  buildDecisionBullets,
  coercePersistedDecisionOverrides,
  isDecisionOutcomeStatus,
  isDecisionType,
  type DecisionOutcomeStatus,
  type DecisionType as DecisionHistoryType,
} from "@workspace/finance";
import type { ModelData } from "../workbook-helpers";

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
}

interface RawScenario {
  name?: unknown;
  createdAt?: unknown;
  decisionType?: unknown;
  outcomeStatus?: unknown;
  retrospective?: unknown;
  outcomeUpdatedAt?: unknown;
  appliedToModelAt?: unknown;
  overrides?: Record<string, unknown> | null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
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
