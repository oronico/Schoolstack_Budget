/**
 * Task #930 / M3 — Canonical Computation Layer tests.
 *
 * Two guarantees:
 *
 *   1. Registry-coverage assertion. Every metric id in
 *      `lib/finance/src/registry/canonical-metrics.ts` MUST have a
 *      resolver in
 *      `artifacts/api-server/src/lib/integrity/canonical/compute.ts`,
 *      and vice versa (no stale resolvers). Adding a metric without
 *      adding a resolver — or removing a metric without removing
 *      its resolver — fails this test loudly.
 *
 *   2. Persona-fixture smoke. For every persona fixture (Oakwood,
 *      Riverside, Liberty) the layer returns a non-undefined value
 *      record for every registered metric and never throws. Anchor
 *      metrics (`tier: "anchor-all"`) additionally must surface a
 *      concrete (non-null) value on EVERY persona so M5 has
 *      something to anchor against.
 *
 * Hermetic: no DB, no network. Drives the consultant engine in
 * process against the seed payloads.
 */
import { CANONICAL_METRICS } from "@workspace/finance";

import {
  computeCanonicalValuesForFixture,
  findRegistryGaps,
  findResolverGaps,
  listResolverMetricIds,
  loadPersonaFixtures,
} from "../src/lib/integrity/canonical/index.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

async function main(): Promise<void> {
  console.log("\n— Section 1: registry coverage —");
  const registryGaps = findRegistryGaps();
  check(
    "every registry metric has a resolver",
    registryGaps.length === 0,
    registryGaps.length > 0
      ? `Missing resolvers for: ${registryGaps.join(", ")}`
      : "",
  );
  const resolverGaps = findResolverGaps();
  check(
    "no stale resolvers (every resolver maps to a registry entry)",
    resolverGaps.length === 0,
    resolverGaps.length > 0 ? `Stale resolvers: ${resolverGaps.join(", ")}` : "",
  );
  check(
    "resolver count matches registry count",
    listResolverMetricIds().length === CANONICAL_METRICS.length,
    `resolvers=${listResolverMetricIds().length} registry=${CANONICAL_METRICS.length}`,
  );

  console.log("\n— Section 2: tier annotations —");
  const validTiers = new Set(["structural", "anchor-oakwood", "anchor-all"]);
  let badTier = 0;
  for (const m of CANONICAL_METRICS) {
    if (!validTiers.has(m.tier)) badTier++;
  }
  check("every metric carries a valid tier", badTier === 0, `bad=${badTier}`);

  console.log("\n— Section 3: persona-fixture smoke —");
  const fixtures = loadPersonaFixtures();
  check(
    "three personas registered (Oakwood / Riverside / Liberty)",
    fixtures.length === 3 &&
      fixtures.map((f) => f.slug).join(",") === "oakwood,riverside,liberty",
    fixtures.map((f) => f.slug).join(","),
  );

  const valuesByPersonaMetric = new Map<string, Map<string, unknown>>();
  for (const fixture of fixtures) {
    console.log(`  · running consultant engine for ${fixture.slug}…`);
    let records: Awaited<ReturnType<typeof computeCanonicalValuesForFixture>>;
    try {
      records = await computeCanonicalValuesForFixture(fixture);
      check(`[${fixture.slug}] resolves without throwing`, true);
    } catch (err) {
      check(
        `[${fixture.slug}] resolves without throwing`,
        false,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }
    check(
      `[${fixture.slug}] one record per registered metric`,
      records.length === CANONICAL_METRICS.length,
      `got ${records.length}, expected ${CANONICAL_METRICS.length}`,
    );
    const byMetric = new Map<string, unknown>();
    for (const r of records) byMetric.set(r.metricId, r.value);
    valuesByPersonaMetric.set(fixture.slug, byMetric);

    // Every record has a value field (may legitimately be null).
    let missing = 0;
    for (const r of records) {
      if (typeof r.value === "undefined") missing++;
    }
    check(
      `[${fixture.slug}] no undefined values (null OK for legitimately-empty)`,
      missing === 0,
      `${missing} undefined`,
    );
  }

  console.log("\n— Section 4: anchor-all coverage —");
  const anchorAll = CANONICAL_METRICS.filter((m) => m.tier === "anchor-all");
  check(
    "at least one anchor-all metric exists",
    anchorAll.length > 0,
    `count=${anchorAll.length}`,
  );
  for (const metric of anchorAll) {
    for (const fixture of fixtures) {
      const value = valuesByPersonaMetric.get(fixture.slug)?.get(metric.id);
      const concrete =
        value !== undefined &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0);
      check(
        `[anchor-all] ${metric.id} resolves to a concrete value for ${fixture.slug}`,
        concrete,
        concrete ? "" : `value=${JSON.stringify(value)}`,
      );
    }
  }

  console.log("\n— Section 5: anchor-oakwood coverage —");
  // Oakwood is the single fixture every `anchor-oakwood` metric must
  // surface a concrete value for. A short allow-list captures metrics
  // whose canonical accessor legitimately returns null/empty for this
  // persona (e.g. founder-comp normalization is a no-op when the
  // owner-operator already draws market comp; break-even-year is null
  // when the school is cumulatively profitable from Y1). Adding a
  // metric here requires an explanatory comment so M5 reviewers can
  // see WHY null is acceptable.
  const ANCHOR_OAKWOOD_NULL_ALLOWED = new Set<string>([
    // Oakwood is cumulatively profitable from Y1, so the cumulative
    // net-income curve never crosses zero from below — the canonical
    // break-even-year accessor returns null by design.
    "break-even-year",
    // Oakwood's base + stress scenarios all keep ending Y5 cash
    // positive, so the "stress scenarios that go negative by Y5"
    // bundle is correctly an empty array.
    "stress-negative-y5-scenarios",
  ]);
  const anchorOak = CANONICAL_METRICS.filter(
    (m) => m.tier === "anchor-oakwood",
  );
  for (const metric of anchorOak) {
    const value = valuesByPersonaMetric.get("oakwood")?.get(metric.id);
    const isAllowedNull = ANCHOR_OAKWOOD_NULL_ALLOWED.has(metric.id);
    const concrete =
      value !== undefined &&
      (isAllowedNull ||
        (value !== null && !(Array.isArray(value) && value.length === 0)));
    check(
      `[anchor-oakwood] ${metric.id} resolves to a concrete value for Oakwood`,
      concrete,
      concrete ? "" : `value=${JSON.stringify(value)}`,
    );
  }

  console.log(
    `\nintegrity-canonical-compute: ${passed} pass, ${failed} fail ` +
      `(${CANONICAL_METRICS.length} metrics × ${fixtures.length} personas)`,
  );
  if (failed > 0) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("integrity-canonical-compute: top-level failure");
  console.error(err);
  process.exit(1);
});
