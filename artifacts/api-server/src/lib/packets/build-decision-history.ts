import type { ModelData } from "../workbook-helpers";

// Mirrors the OutcomeStatus and DecisionType enums declared in
// artifacts/school-financial-model/src/pages/model-wizard/schema.ts. Kept inline
// here so api-server doesn't have to import from the frontend package.
export type DecisionOutcomeStatus = "pursued" | "declined" | "on_hold";
export type DecisionHistoryType = "add_program" | "evaluate_site" | "change_enrollment";

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

const OUTCOME_LABELS: Record<DecisionOutcomeStatus, string> = {
  pursued: "Pursued",
  declined: "Declined",
  on_hold: "On hold",
};

const DECISION_LABELS: Record<DecisionHistoryType, string> = {
  add_program: "Add a program",
  evaluate_site: "Evaluate a site",
  change_enrollment: "Change enrollment",
};

function isOutcomeStatus(v: unknown): v is DecisionOutcomeStatus {
  return v === "pursued" || v === "declined" || v === "on_hold";
}

function isDecisionType(v: unknown): v is DecisionHistoryType {
  return v === "add_program" || v === "evaluate_site" || v === "change_enrollment";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asNumberArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : 0));
  return out;
}

// Port of buildDecisionBullets from
// artifacts/school-financial-model/src/lib/decision-flows.ts. Kept locally so
// the packet builders can produce the same human-readable summaries without
// reaching across artifact boundaries.
function buildBullets(
  overrides: Record<string, unknown>,
  decisionType?: DecisionHistoryType,
): string[] {
  const bullets: string[] = [];

  const addProgramName = asString(overrides.addProgramName);
  if (decisionType === "add_program" || addProgramName) {
    if (addProgramName) {
      const band = asString(overrides.addProgramGradeBand);
      bullets.push(`Program: ${addProgramName}${band ? ` (${band})` : ""}`);
    }
    const tuition = asNumber(overrides.addProgramTuition);
    if (tuition) bullets.push(`Tuition $${tuition.toLocaleString()}/yr`);
    const enrollment = asNumberArray(overrides.addProgramEnrollment);
    if (enrollment) {
      const total = enrollment.reduce((a, b) => a + b, 0);
      bullets.push(`Adds ${total} cumulative students (5 yrs)`);
    }
    const fte = asNumber(overrides.addProgramAddedFte);
    if (fte) bullets.push(`+${fte} FTE`);
    if (overrides.addProgramStaffingTbd === true) bullets.push("Staffing: TBD");
    return bullets;
  }

  const enrollmentDelta = asNumberArray(overrides.enrollmentDelta);
  if (enrollmentDelta && enrollmentDelta.some((v) => v !== 0)) {
    const sum = enrollmentDelta.reduce((a, b) => a + b, 0);
    bullets.push(`Enrollment ${sum > 0 ? "+" : ""}${sum} cumulative`);
  }
  const retention = asNumber(overrides.retentionRate);
  if (retention !== undefined) bullets.push(`Retention ${retention}%`);
  const tuitionDelta = asNumber(overrides.tuitionDeltaPerStudent);
  if (tuitionDelta !== undefined && tuitionDelta !== 0) {
    bullets.push(`Tuition ${tuitionDelta > 0 ? "+" : ""}$${tuitionDelta}/student`);
  }
  const monthlyRent = asNumber(overrides.monthlyRent);
  if (monthlyRent !== undefined) {
    bullets.push(`Rent $${monthlyRent.toLocaleString()}/mo`);
  }
  const rentEsc = asNumber(overrides.rentEscalation);
  if (rentEsc !== undefined) bullets.push(`Rent escalation ${rentEsc}%`);
  const sqftDelta = asNumber(overrides.sqftDelta);
  if (sqftDelta !== undefined && sqftDelta !== 0) {
    bullets.push(`Sqft ${sqftDelta > 0 ? "+" : ""}${sqftDelta}`);
  }
  const fitOut = asNumber(overrides.siteFitOutCost);
  if (fitOut) bullets.push(`Fit-out $${fitOut.toLocaleString()} (Y1)`);
  return bullets;
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
    if (!isOutcomeStatus(entry.outcomeStatus)) continue;

    const decisionType = isDecisionType(entry.decisionType) ? entry.decisionType : undefined;
    const overrides = (entry.overrides && typeof entry.overrides === "object" ? entry.overrides : {}) as Record<string, unknown>;
    const bullets = buildBullets(overrides, decisionType);

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
