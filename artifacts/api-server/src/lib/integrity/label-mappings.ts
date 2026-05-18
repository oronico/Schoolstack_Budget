/**
 * Task #987 — Shared M2 label → canonical-metric mapping.
 *
 * Single source of truth for the "which numeric leaf labels on the
 * rendered lender/board/narrative payloads map to which registry
 * metric, and how do we project the canonical value to the scalar
 * shape the leaf carries?" question.
 *
 * Two consumers import this:
 *   - `scripts/run-math-integrity-report.ts` (the M4 CI integrity
 *     report) uses it to route every numeric leaf from the persona-
 *     fixture battery to a registry metric for comparison.
 *   - `src/lib/integrity/drift-monitor.ts` (the production sampled
 *     drift monitor, Task #987) uses the EXACT same table so the
 *     production-traffic comparison covers the same metrics CI does.
 *     Without this shared module the two tables would silently drift
 *     and production coverage would regress invisibly — the failure
 *     mode this task was opened to lock down.
 *
 * `PRODUCTION_DRIFT_EXCLUSIONS` complements the mapping: it lists
 * every registry metric NOT directly compared on production packet
 * surfaces, with an auditable rationale (composite per-year arrays,
 * narrative bundles, stress-scenario tables, etc.). A coverage test
 * (`tests/integrity-drift-monitor-coverage.ts`) asserts every
 * registered metric is either mapped OR excluded — adding a new
 * registry metric without classifying it fails CI.
 */

/**
 * Scalar value a canonical accessor can be projected down to for
 * leaf-level comparison. Mirrors the integrity report's local
 * `SurfaceValue` alias so callers can use the same shape.
 */
export type SurfaceValue = string | number | null;

export interface LabelMapping {
  metricId: string;
  /** Project the canonical for `metricId` to the scalar shape the leaf carries. */
  pickCanonical?: (canonical: unknown) => SurfaceValue;
  /**
   * Optional path-filter predicate. If set, only leaves whose path
   * satisfies the predicate are routed to this metric. Used to
   * exclude per-scenario sensitivity duplicates (`scenarios[N]`
   * paths) so the mapped comparison stays anchored to the base /
   * headline scenario.
   */
  pathFilter?: (path: string) => boolean;
}

/**
 * Default path filter for headline / base-scenario leaves only —
 * excludes any leaf inside `lenderStressTests.scenarios[N]` (per-
 * scenario sensitivity rows that intentionally deviate from the
 * base canonical) and inside `deltaVsBase` (sensitivity deltas,
 * not absolute values).
 */
export const BASE_SCENARIO_ONLY = (path: string): boolean =>
  !/\.scenarios\[\d+\]/.test(path) && !/\.deltaVsBase\./.test(path);

const pickFromObject =
  <K extends string>(key: K) =>
  (c: unknown): SurfaceValue =>
    typeof c === "object" && c !== null && key in c
      ? ((c as Record<string, unknown>)[key] as SurfaceValue)
      : null;

function pickBucketPct(canonical: unknown, key: string): SurfaceValue {
  if (!Array.isArray(canonical) || canonical.length === 0) return null;
  const y1 = canonical[0] as Record<string, unknown> | undefined;
  if (!y1 || typeof y1 !== "object") return null;
  const v = y1[key];
  return typeof v === "number" ? v * 100 : null;
}

/**
 * Authoritative `label → metric` mapping. Adding a new entry expands
 * coverage on BOTH the CI integrity report and the production drift
 * monitor in one place.
 */
export const M2_LABEL_TO_METRIC: Record<string, LabelMapping> = {
  cashRunwayMonths: {
    metricId: "cash-runway-months",
    pathFilter: BASE_SCENARIO_ONLY,
  },
  troughEndingCash: { metricId: "cash-trough-ending-cash" },
  reserveMonthsLastYear: { metricId: "reserve-months-last-year" },
  breakEvenYear: {
    metricId: "break-even-year",
    pathFilter: BASE_SCENARIO_ONLY,
  },
  breakEvenStudentsY1: { metricId: "break-even-students-y1" },
  dscrY1Normalized: {
    metricId: "dscr-year-series-normalized",
    pickCanonical: (c) => (Array.isArray(c) ? (c[0] as SurfaceValue) : null),
  },
  dscrMinNormalized: {
    metricId: "dscr-min-normalized",
    pickCanonical: pickFromObject("min"),
  },
  founderCompTotalDelta: {
    metricId: "founder-comp-adjustment",
    pickCanonical: pickFromObject("totalDelta"),
  },
  taggedFraction: {
    metricId: "lender-readiness-cap",
    pickCanonical: pickFromObject("taggedFraction"),
    // Only the lender-readiness "result.cap" exposes the realized
    // overall tagged fraction. The intermediate dimension/severity
    // caps are diagnostic and don't always equal the overall.
    pathFilter: (p) => p.includes("lenderReadiness.result.cap"),
  },
  // Per-bucket Y1 percentage projections. Canonical is the per-year
  // `pctByBucket` array (snake_case keys, 0-1 fractions). The leaves
  // carry the camelCase pre-formatted percent (×100).
  contractedPct: {
    metricId: "revenue-quality-by-bucket",
    pickCanonical: (c) => pickBucketPct(c, "contracted"),
  },
  projectedPct: {
    metricId: "revenue-quality-by-bucket",
    pickCanonical: (c) => pickBucketPct(c, "projected"),
  },
  donorDependentPct: {
    metricId: "revenue-quality-by-bucket",
    pickCanonical: (c) => pickBucketPct(c, "donor_dependent"),
  },
  policyDependentPct: {
    metricId: "revenue-quality-by-bucket",
    pickCanonical: (c) => pickBucketPct(c, "policy_dependent"),
  },
};

/**
 * Registry metrics that are intentionally NOT directly compared on
 * production packet surfaces, with an auditable rationale. The
 * coverage test in `tests/integrity-drift-monitor-coverage.ts`
 * requires every `CANONICAL_METRICS` id to either appear as the
 * `metricId` of an `M2_LABEL_TO_METRIC` entry above OR appear in
 * this allowlist — so adding a new registry metric without
 * classifying it fails CI.
 *
 * Most exclusions fall into a few categories:
 *   - per-year / per-scenario composite arrays exposed as the
 *     `scenarios[N].values` shape (compared element-wise inside
 *     the M4 report, not as a single leaf);
 *   - reported (non-normalized) DSCR variants whose leaves carry
 *     the normalized label (covered by the normalized metric);
 *   - intermediate lender-readiness caps captured as composites,
 *     not as leaves;
 *   - narrative / coaching bundles that don't carry numeric leaves
 *     on the lender / board packets.
 */
export const PRODUCTION_DRIFT_EXCLUSIONS: Record<string, string> = {
  // Composite per-year arrays — compared element-wise via the
  // `scenarios[N].values[Y]` extractor in the M4 report, not as
  // a single labeled leaf on the packet surface.
  "revenue-total-year":
    "Per-year array; rendered as separate y1..y5 leaves, not a single labeled scalar.",
  "revenue-per-line-y1-value":
    "Per-revenue-line breakdown; rendered inside a table, leaves carry per-line labels not the metric id.",
  "revenue-composition":
    "Per-year composition object; rendered as a chart payload, no single labeled scalar leaf.",
  "revenue-hard-coverage-y1":
    "Single Y1 hard-coverage figure surfaced inside a wider revenue-quality block; not a top-level packet leaf.",
  "cash-monthly-low":
    "Monthly-grain detail surfaced only in workbook export, not the lender/board packet JSON.",
  "dscr-year-series-reported":
    "Reported (non-normalized) DSCR; packet leaves carry the normalized label, covered by `dscr-year-series-normalized`.",
  "annual-debt-service":
    "Per-year array; covered by the wider DSCR section, not a single labeled leaf.",
  "revenue-per-student":
    "Per-year array; rendered as separate per-year leaves inside the revenue section.",
  "cost-per-student":
    "Per-year array; rendered as separate per-year leaves inside the cost section.",
  "capacity-utilization-y1":
    "Y1 capacity utilization is rendered inside an enrollment block; not surfaced as a top-level labeled leaf today.",
  // Stress-scenario tables: compared element-wise via the per-
  // scenario M2 walk, not via a top-level label.
  "stress-base-net-income":
    "Base-scenario net income for the stress table — compared inside the `scenarios[0]` walk, not at the top level.",
  "stress-scenario-dscr":
    "Per-scenario DSCR; surfaced inside `lenderStressTests.scenarios[N]` and excluded by BASE_SCENARIO_ONLY.",
  "stress-scenario-ending-cash":
    "Per-scenario ending cash; surfaced inside `lenderStressTests.scenarios[N]` and excluded by BASE_SCENARIO_ONLY.",
  "stress-scenario-net-income":
    "Per-scenario net income; surfaced inside `lenderStressTests.scenarios[N]` and excluded by BASE_SCENARIO_ONLY.",
  "stress-worst-scenario":
    "Identifier (string), not a numeric leaf — nothing to diff via the numeric walker.",
  "stress-negative-y5-scenarios":
    "Count metric surfaced inside the stress prose paragraph, not as a labeled numeric leaf.",
  // Lender-readiness intermediates — the cap aggregate is covered
  // by `lender-readiness-cap` above; uncapped/effective are diagnostic.
  "lender-readiness-uncapped":
    "Uncapped score is a debug projection; only the capped result is surfaced on the packet.",
  "lender-readiness-effective":
    "Effective (post-cap) score is exposed only inside the structured `result` object; covered by `lender-readiness-cap` mapping.",
  // Narrative / coaching surfaces — text content, no numeric leaves
  // on the packet.
  "biggest-strength":
    "Narrative text; not a numeric leaf.",
  "biggest-risk":
    "Narrative text; not a numeric leaf.",
  "assumption-registry":
    "Structured registry of assumption flags; not a numeric leaf.",
  "narrative-commentary-bundle":
    "Coach-voice narrative bundle; not a numeric leaf.",
};
