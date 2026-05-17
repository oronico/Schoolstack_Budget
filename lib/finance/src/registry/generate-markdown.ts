/**
 * Generates the reviewer-facing markdown view of the canonical
 * metrics registry. Run via:
 *
 *   pnpm --filter @workspace/finance exec tsx \
 *     src/registry/generate-markdown.ts > ../../docs/primary-data-source-registry.md
 *
 * The output is checked into git and asserted-current by the
 * `canonical-metrics-registry.test.ts` lint test.
 */

import {
  CANONICAL_METRICS,
  type CanonicalMetric,
  type MetricCategory,
} from "./canonical-metrics.js";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  revenue: "Revenue",
  cash: "Cash",
  debt: "Debt",
  per_student: "Per-student",
  capacity_breakeven: "Capacity & Break-even",
  stress: "Stress Tests",
  founder_comp: "Founder Comp / Normalization",
  rating: "Lender Readiness Rating",
  assumptions: "Assumptions / Evidence",
  narrative: "Narrative Commentary",
};

const CATEGORY_ORDER: MetricCategory[] = [
  "revenue",
  "cash",
  "debt",
  "per_student",
  "capacity_breakeven",
  "stress",
  "founder_comp",
  "rating",
  "assumptions",
  "narrative",
];

function renderMetric(m: CanonicalMetric): string {
  const tasks =
    m.relatedTasks.length > 0
      ? m.relatedTasks.map((t) => `#${t}`).join(", ")
      : "—";
  const surfaceRows = m.surfaces
    .map((s) => `| \`${s.path}\` | ${s.location} |`)
    .join("\n");
  return [
    `### ${m.label}`,
    "",
    `- **id:** \`${m.id}\``,
    `- **unit:** ${m.unit}`,
    `- **canonical:** \`${m.canonical.accessor}\` (in \`${m.canonical.module}\`)`,
    `- **related tasks:** ${tasks}`,
    "",
    `**Notes.** ${m.notes}`,
    "",
    `**Surfaces:**`,
    "",
    `| File | Where |`,
    `| --- | --- |`,
    surfaceRows,
    "",
  ].join("\n");
}

export function renderRegistryMarkdown(): string {
  const header = [
    "# Primary Data Source Registry",
    "",
    "_Generated from `lib/finance/src/registry/canonical-metrics.ts`. Do not edit by hand — see the registry README for how to add metrics._",
    "",
    "This document lists every canonical value the SchoolStack Budget product renders, the single source-of-truth accessor for that value, and every downstream surface that prints it. Every surface MUST reconcile to its canonical accessor (verified by the M5 cross-surface harness).",
    "",
  ].join("\n");

  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const ms = CANONICAL_METRICS.filter((m) => m.category === cat);
    if (ms.length === 0) continue;
    sections.push(`## ${CATEGORY_LABELS[cat]}`);
    sections.push("");
    for (const m of ms) sections.push(renderMetric(m));
  }

  return `${header}${sections.join("\n")}`;
}

// CLI: print to stdout when run directly.
const isMain = (() => {
  try {
    const argv1 = process.argv[1] || "";
    return argv1.endsWith("generate-markdown.ts") || argv1.endsWith("generate-markdown.js");
  } catch {
    return false;
  }
})();
if (isMain) {
  process.stdout.write(renderRegistryMarkdown());
}
