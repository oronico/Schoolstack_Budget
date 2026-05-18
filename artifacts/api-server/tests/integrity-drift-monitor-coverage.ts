/**
 * Task #987 — Production drift-monitor coverage gate.
 *
 * Asserts the shared `M2_LABEL_TO_METRIC` table + the
 * `PRODUCTION_DRIFT_EXCLUSIONS` allowlist together account for EVERY
 * id in the canonical metrics registry. Adding a new metric to
 * `lib/finance/src/registry/canonical-metrics.ts` therefore forces
 * an explicit decision:
 *
 *   - "this metric is surfaced on a lender/board packet leaf" →
 *     add an `M2_LABEL_TO_METRIC` entry so both the CI integrity
 *     report and the production drift monitor compare it, OR
 *   - "this metric is composite / not directly comparable on a
 *     packet leaf" → add it to `PRODUCTION_DRIFT_EXCLUSIONS` with
 *     an auditable rationale.
 *
 * The previous failure mode this test prevents: a registry metric is
 * added, the CI report picks it up via the canonical-vs-canonical
 * coverage pass, but the production drift monitor never compares it
 * because its smaller hand-maintained table fell behind. With the
 * shared module + this gate, that path is now compile-failing on the
 * registry-author's PR.
 */
import assert from "node:assert/strict";

import { CANONICAL_METRICS } from "@workspace/finance";

import {
  M2_LABEL_TO_METRIC,
  PRODUCTION_DRIFT_EXCLUSIONS,
} from "../src/lib/integrity/label-mappings.js";

const mappedMetricIds = new Set<string>(
  Object.values(M2_LABEL_TO_METRIC).map((m) => m.metricId),
);
const excludedMetricIds = new Set<string>(
  Object.keys(PRODUCTION_DRIFT_EXCLUSIONS),
);

// 1. Every registered metric is classified — mapped OR excluded.
const unclassified: string[] = [];
for (const metric of CANONICAL_METRICS) {
  if (mappedMetricIds.has(metric.id)) continue;
  if (excludedMetricIds.has(metric.id)) continue;
  unclassified.push(metric.id);
}
assert.deepEqual(
  unclassified,
  [],
  `Production drift monitor coverage gap — ${unclassified.length} ` +
    `registered metric(s) are neither mapped in M2_LABEL_TO_METRIC ` +
    `nor classified in PRODUCTION_DRIFT_EXCLUSIONS:\n  - ` +
    unclassified.join("\n  - ") +
    `\n\nResolve by either (a) adding a label entry in ` +
    `artifacts/api-server/src/lib/integrity/label-mappings.ts ` +
    `that maps a packet-surface leaf to the metric, or (b) adding ` +
    `the metric id to PRODUCTION_DRIFT_EXCLUSIONS with a rationale ` +
    `(see existing entries for examples).`,
);

// 2. No mapping points at a metric id that doesn't exist in the registry.
const registryIds = new Set<string>(CANONICAL_METRICS.map((m) => m.id));
const danglingMappings: Array<[string, string]> = [];
for (const [label, mapping] of Object.entries(M2_LABEL_TO_METRIC)) {
  if (!registryIds.has(mapping.metricId)) {
    danglingMappings.push([label, mapping.metricId]);
  }
}
assert.deepEqual(
  danglingMappings,
  [],
  `M2_LABEL_TO_METRIC contains mapping(s) pointing at a metric id ` +
    `that does not exist in CANONICAL_METRICS: ` +
    danglingMappings.map(([l, m]) => `${l} → ${m}`).join(", "),
);

// 3. No exclusion entry references a metric id that doesn't exist
//    (catches stale rationale rows left behind by registry renames).
const danglingExclusions: string[] = [];
for (const id of excludedMetricIds) {
  if (!registryIds.has(id)) danglingExclusions.push(id);
}
assert.deepEqual(
  danglingExclusions,
  [],
  `PRODUCTION_DRIFT_EXCLUSIONS lists metric id(s) that no longer ` +
    `exist in CANONICAL_METRICS: ${danglingExclusions.join(", ")}`,
);

// 4. No metric is in both buckets (mapped AND excluded) — that would
//    be self-contradictory.
const conflicting: string[] = [];
for (const id of mappedMetricIds) {
  if (excludedMetricIds.has(id)) conflicting.push(id);
}
assert.deepEqual(
  conflicting,
  [],
  `Metric id(s) are both mapped and excluded — remove from ` +
    `PRODUCTION_DRIFT_EXCLUSIONS: ${conflicting.join(", ")}`,
);

console.log(
  `integrity-drift-monitor-coverage: OK ` +
    `(${mappedMetricIds.size} mapped, ${excludedMetricIds.size} excluded, ` +
    `${CANONICAL_METRICS.length} registered)`,
);
