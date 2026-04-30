/**
 * Backend roll-up adapter for inline rationales (Task #331).
 *
 * Mirrors `artifacts/school-financial-model/src/lib/lender-narrative-rollup.ts`
 * — kept in sync by convention because the frontend and backend live in
 * different packages without shared codegen for these label maps. Keys are
 * stable `step:categoryId` strings (see `budgetNarrativeSchema` for the
 * authoritative list). Both sides exclude `expenses:capital_financing`
 * from the Expenses roll-up (it belongs to Risk Mitigation / capital).
 */

import type { ModelData } from "../workbook-helpers";

export type RationaleSectionKey =
  | "enrollmentStrategy"
  | "revenueAssumptions"
  | "staffingPhilosophy"
  | "expenseAssumptions"
  | "riskMitigation";

const REVENUE_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets (Scholarships & Discounts)",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  philanthropy: "Philanthropy",
  other_revenue: "Other Revenue",
};

const STAFFING_LABELS: Record<string, string> = {
  instructional: "Instructional",
  school_leadership: "School Leadership",
  student_support: "Student Support",
  operations: "Operations",
  administrative: "Administrative",
  other: "Other",
};

const EXPENSE_LABELS: Record<string, string> = {
  personnel: "People",
  instructional_program: "Program",
  technology: "Technology",
  occupancy_facility: "Facility",
  administrative_general: "Admin & Operations",
  capital_financing: "Capital & Debt",
};

const REVENUE_KEY_ORDER = [
  "tuition_and_fees",
  "tuition_offsets",
  "public_funding",
  "school_choice",
  "philanthropy",
  "other_revenue",
];

const STAFFING_KEY_ORDER = [
  "school_leadership",
  "instructional",
  "student_support",
  "operations",
  "administrative",
  "other",
];

const EXPENSE_KEY_ORDER = [
  "instructional_program",
  "technology",
  "occupancy_facility",
  "administrative_general",
];

const CAPITAL_FINANCING_KEYS: Array<{ key: string; label: string }> = [
  { key: "capitalFinancing:debtTerms", label: "Debt Terms" },
  { key: "capitalFinancing:dscrCovenants", label: "DSCR Covenants" },
  { key: "expenses:capital_financing", label: "Capital & Debt Expense" },
];

export interface RationaleEntry {
  /** Stable `step:categoryId` key. */
  key: string;
  /** Human-readable category label (custom-overridden when present). */
  label: string;
  /** The founder's reasoning text, trimmed. */
  text: string;
}

export interface SectionRationaleRollup {
  /** Concatenated rationale text formatted for embedding in a narrative. */
  text: string;
  /** Per-category breakdown, in display order. */
  entries: RationaleEntry[];
}

function trimmed(s: string | undefined | null): string {
  return (s ?? "").trim();
}

function formatRollupText(entries: RationaleEntry[]): string {
  if (entries.length === 0) return "";
  if (entries.length === 1) return entries[0].text;
  return entries.map((e) => `${e.label}: ${e.text}`).join(" ");
}

export function extractInlineRationales(modelData: ModelData): Record<string, string> {
  const raw = modelData as unknown as Record<string, unknown>;
  const narrative = (raw.budgetNarrative || {}) as Record<string, unknown>;
  const inline = (narrative.inlineRationales || {}) as unknown;
  if (!inline || typeof inline !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(inline as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export function extractCustomExpenseLabels(modelData: ModelData): Record<string, string> {
  const raw = modelData as unknown as Record<string, unknown>;
  const labels = (raw.customCategoryLabels || {}) as unknown;
  if (!labels || typeof labels !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export function buildSectionRollup(
  key: RationaleSectionKey,
  inlineRationales: Record<string, string>,
  customExpenseLabels: Record<string, string> = {},
): SectionRationaleRollup {
  if (key === "enrollmentStrategy") {
    const text = trimmed(inlineRationales["enrollment:programs"]);
    if (!text) return { text: "", entries: [] };
    return {
      text,
      entries: [{ key: "enrollment:programs", label: "Enrollment Strategy", text }],
    };
  }

  if (key === "revenueAssumptions") {
    const entries: RationaleEntry[] = [];
    for (const cat of REVENUE_KEY_ORDER) {
      const rkey = `revenue:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      entries.push({ key: rkey, label: REVENUE_LABELS[cat] ?? cat, text });
    }
    return { text: formatRollupText(entries), entries };
  }

  if (key === "staffingPhilosophy") {
    const entries: RationaleEntry[] = [];
    for (const cat of STAFFING_KEY_ORDER) {
      const rkey = `staffing:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      entries.push({ key: rkey, label: STAFFING_LABELS[cat] ?? cat, text });
    }
    return { text: formatRollupText(entries), entries };
  }

  if (key === "expenseAssumptions") {
    const entries: RationaleEntry[] = [];
    for (const cat of EXPENSE_KEY_ORDER) {
      const rkey = `expenses:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      entries.push({ key: rkey, label: EXPENSE_LABELS[cat] ?? cat, text });
    }
    for (const fullKey of Object.keys(inlineRationales)) {
      if (!fullKey.startsWith("expenses:")) continue;
      const cat = fullKey.slice("expenses:".length);
      if (EXPENSE_KEY_ORDER.includes(cat)) continue;
      if (cat === "capital_financing") continue;
      const text = trimmed(inlineRationales[fullKey]);
      if (!text) continue;
      const label = customExpenseLabels[cat] ?? EXPENSE_LABELS[cat] ?? cat;
      entries.push({ key: fullKey, label, text });
    }
    return { text: formatRollupText(entries), entries };
  }

  if (key === "riskMitigation") {
    const entries: RationaleEntry[] = [];
    for (const { key: rkey, label } of CAPITAL_FINANCING_KEYS) {
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      entries.push({ key: rkey, label, text });
    }
    return { text: formatRollupText(entries), entries };
  }

  return { text: "", entries: [] };
}

/**
 * Footer prefix used when threading rationale into a packet section's
 * narrative — kept as a constant so PDF tests can match against it.
 */
export const FOUNDER_REASONING_PREFIX = "Founder's reasoning:";

export function withFounderReasoning(
  baseNarrative: string,
  rationaleText: string,
): string {
  const base = (baseNarrative || "").trim();
  const rationale = (rationaleText || "").trim();
  if (!rationale) return baseNarrative;
  if (!base) return `${FOUNDER_REASONING_PREFIX} ${rationale}`;
  return `${base} ${FOUNDER_REASONING_PREFIX} ${rationale}`;
}

/**
 * Convenience: build all five rollups from `modelData` in one pass. Used by
 * packet builders to enrich each PacketSection narrative.
 */
export function buildAllRollups(modelData: ModelData): Record<RationaleSectionKey, SectionRationaleRollup> {
  const inline = extractInlineRationales(modelData);
  const customLabels = extractCustomExpenseLabels(modelData);
  return {
    enrollmentStrategy: buildSectionRollup("enrollmentStrategy", inline, customLabels),
    revenueAssumptions: buildSectionRollup("revenueAssumptions", inline, customLabels),
    staffingPhilosophy: buildSectionRollup("staffingPhilosophy", inline, customLabels),
    expenseAssumptions: buildSectionRollup("expenseAssumptions", inline, customLabels),
    riskMitigation: buildSectionRollup("riskMitigation", inline, customLabels),
  };
}
