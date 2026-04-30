/**
 * Lender Narrative roll-up adapter (Task #331).
 *
 * Converts the inline rationales captured per category card across the
 * wizard (`budgetNarrative.inlineRationales`) into prefilled prose for each
 * Lender Narrative section, paired with metadata about which earlier-step
 * cards contributed so the UI can render a "Pulled from your earlier notes"
 * badge with a back-link to the source step.
 *
 * Key conventions are documented in `budgetNarrativeSchema` (schema.ts):
 * inline rationale keys are stable `step:categoryId` strings (e.g.
 * `revenue:tuition_and_fees`, `staffing:instructional`). This adapter
 * groups those keys by narrative section.
 */

import { CATEGORY_LABELS as REVENUE_CATEGORY_LABELS } from "@/lib/revenue-defaults";
import { FUNCTION_CATEGORY_LABELS } from "@/lib/staffing-defaults";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-defaults";

export type NarrativeSectionKey =
  | "enrollmentStrategy"
  | "revenueAssumptions"
  | "staffingPhilosophy"
  | "expenseAssumptions"
  | "riskMitigation";

export interface RationaleSource {
  /** The semantic `step:categoryId` key from `inlineRationales`. */
  rationaleKey: string;
  /** The human-readable label for the source category. */
  categoryLabel: string;
  /** The wizard step number the founder should jump to for editing. */
  sourceStep: number;
}

export interface SectionRollup {
  /** Concatenated rationale text, with per-category headings. Empty string when no rationale. */
  text: string;
  /** Categories that contributed to the roll-up, in display order. */
  sources: RationaleSource[];
}

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

/** Wizard step IDs (mirror the `STEPS` array in `model-wizard/index.tsx`). */
export const STEP_IDS = {
  enrollment: 3,
  revenue: 4,
  staffing: 5,
  expenses: 6,
  capitalFinancing: 7,
} as const;

function trimmed(s: string | undefined): string {
  return (s ?? "").trim();
}

function joinSourcesText(sources: Array<{ label: string; text: string }>): string {
  if (sources.length === 0) return "";
  if (sources.length === 1) return sources[0].text;
  // Multiple sources → label each so the lender can tell which category each
  // bit of reasoning belongs to.
  return sources.map((s) => `${s.label}: ${s.text}`).join("\n\n");
}

/**
 * Builds the section roll-up for a given narrative key. Returns an empty
 * `text` and empty `sources` when no inline rationale exists for the
 * section — callers should fall back to their existing computed prefill in
 * that case.
 */
export function buildSectionRollup(
  key: NarrativeSectionKey,
  inlineRationales: Record<string, string>,
  customExpenseLabels: Record<string, string> = {},
): SectionRollup {
  if (key === "enrollmentStrategy") {
    const text = trimmed(inlineRationales["enrollment:programs"]);
    if (!text) return { text: "", sources: [] };
    return {
      text,
      sources: [
        {
          rationaleKey: "enrollment:programs",
          categoryLabel: "Enrollment Strategy",
          sourceStep: STEP_IDS.enrollment,
        },
      ],
    };
  }

  if (key === "revenueAssumptions") {
    const sources: RationaleSource[] = [];
    const collected: Array<{ label: string; text: string }> = [];
    for (const cat of REVENUE_KEY_ORDER) {
      const rkey = `revenue:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      const label = REVENUE_CATEGORY_LABELS[cat as keyof typeof REVENUE_CATEGORY_LABELS] ?? cat;
      sources.push({ rationaleKey: rkey, categoryLabel: label, sourceStep: STEP_IDS.revenue });
      collected.push({ label, text });
    }
    return { text: joinSourcesText(collected), sources };
  }

  if (key === "staffingPhilosophy") {
    const sources: RationaleSource[] = [];
    const collected: Array<{ label: string; text: string }> = [];
    for (const cat of STAFFING_KEY_ORDER) {
      const rkey = `staffing:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      const label = FUNCTION_CATEGORY_LABELS[cat as keyof typeof FUNCTION_CATEGORY_LABELS] ?? cat;
      sources.push({ rationaleKey: rkey, categoryLabel: label, sourceStep: STEP_IDS.staffing });
      collected.push({ label, text });
    }
    return { text: joinSourcesText(collected), sources };
  }

  if (key === "expenseAssumptions") {
    const sources: RationaleSource[] = [];
    const collected: Array<{ label: string; text: string }> = [];
    // Built-in operating expense categories first (in display order), then
    // any custom categories defined by the founder. We deliberately exclude
    // `expenses:capital_financing` here — it belongs to Risk Mitigation /
    // capital section.
    for (const cat of EXPENSE_KEY_ORDER) {
      const rkey = `expenses:${cat}`;
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      const label = EXPENSE_CATEGORY_LABELS[cat] ?? cat;
      sources.push({ rationaleKey: rkey, categoryLabel: label, sourceStep: STEP_IDS.expenses });
      collected.push({ label, text });
    }
    // Custom categories — keys look like `expenses:custom_<timestamp>_<n>`.
    for (const fullKey of Object.keys(inlineRationales)) {
      if (!fullKey.startsWith("expenses:")) continue;
      const cat = fullKey.slice("expenses:".length);
      if (EXPENSE_KEY_ORDER.includes(cat)) continue;
      if (cat === "capital_financing") continue;
      const text = trimmed(inlineRationales[fullKey]);
      if (!text) continue;
      const label = customExpenseLabels[cat] ?? EXPENSE_CATEGORY_LABELS[cat] ?? cat;
      sources.push({ rationaleKey: fullKey, categoryLabel: label, sourceStep: STEP_IDS.expenses });
      collected.push({ label, text });
    }
    return { text: joinSourcesText(collected), sources };
  }

  if (key === "riskMitigation") {
    const sources: RationaleSource[] = [];
    const collected: Array<{ label: string; text: string }> = [];
    for (const { key: rkey, label } of CAPITAL_FINANCING_KEYS) {
      const text = trimmed(inlineRationales[rkey]);
      if (!text) continue;
      const sourceStep = rkey.startsWith("expenses:") ? STEP_IDS.expenses : STEP_IDS.capitalFinancing;
      sources.push({ rationaleKey: rkey, categoryLabel: label, sourceStep });
      collected.push({ label, text });
    }
    return { text: joinSourcesText(collected), sources };
  }

  return { text: "", sources: [] };
}

/** All narrative section keys this adapter knows how to roll up. */
export const ROLLUP_SECTION_KEYS: NarrativeSectionKey[] = [
  "enrollmentStrategy",
  "revenueAssumptions",
  "staffingPhilosophy",
  "expenseAssumptions",
  "riskMitigation",
];
