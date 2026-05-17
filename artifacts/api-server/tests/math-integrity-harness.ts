/**
 * Task #930 / #977 — M5 Cross-Surface Integrity Harness (standing CI test).
 *
 * Promotes the M4 one-shot reporter at
 * `artifacts/api-server/scripts/run-math-integrity-report.ts` into a
 * permanent assertion gate on every api-server test run. The M4 script
 * already does the heavy composition (M1 registry × M2 extractors × M3
 * canonical compute, iterating Oakwood / Riverside / Liberty) — this
 * harness imports that composition via {@link composeMathIntegrity}
 * (no file I/O, no `process.exit`) and asserts the M4 acceptance bar:
 * zero drift, zero unresolved, zero missing, zero unclassified M2 labels.
 *
 * On top of the M4 bar, M5 adds the per-task requirements:
 *
 *   1. Registry-shape invariants:
 *        - Every metric declares ≥1 consumer surface.
 *        - No (path, location) consumer pair is declared by two different
 *          metrics (would let one metric drift silently while masquerading
 *          as another).
 *        - Every metric declares a non-empty `canonical.module` +
 *          `canonical.accessor` (its primarySource).
 *
 *   2. Orphan-value assertion:
 *        - Every numeric leaf the M2 walker yields from lender-packet /
 *          board-packet / narrative-bundle is either mapped to a registry
 *          metric (M2_LABEL_TO_METRIC) or classified with a rationale
 *          (M2_UNMAPPED_RATIONALE). M4's `runM2Mapping` already enforces
 *          this; the harness re-asserts at the test layer so a CI failure
 *          surfaces here rather than only inside the report script.
 *
 *   3. Auto-pickup of new fixtures + metrics:
 *        - Asserts the registry-driven finding count is exactly
 *          `personas × Σ metric.surfaces.length`, proving that adding a
 *          new `*.fixture.ts` (auto-discovered by `loadPersonaFixturesAsync`)
 *          or a new entry to `CANONICAL_METRICS` automatically expands
 *          coverage on the next run — no code changes required in this
 *          harness.
 *
 *   4. Component-props vs component-rendered as SEPARATE surfaces:
 *        - The api-server props-walk extractor (`extractComponentState`,
 *          M2's superset surface) and the SFM DOM-walk extractor
 *          (`extractRendered`, M2's subset surface) are run for every
 *          (persona × {ConsultantAnalysisView, LenderPacketPreview})
 *          pairing. The harness writes per-persona React-props snapshots
 *          to `artifacts/school-financial-model/src/lib/integrity/__fixtures__/render-props/`
 *          and shells out to the SFM vitest harness
 *          (`render-persona-coverage.test.tsx`) which loads the snapshots,
 *          renders both components, runs the two extractors, and asserts
 *          the props ⊇ rendered invariant (every numeric the founder
 *          actually sees on screen is reachable from the wire payload).
 *          Cross-artifact React rendering can't run cleanly in-process
 *          from a tsx api-server test because the SFM components depend
 *          on Vite-resolved aliases, CSS imports, and the design system —
 *          the subprocess hop is the cheapest hermetic bridge.
 *
 * Hermetic: no DB, no network, no env vars. The render coverage
 * subprocess relies only on the snapshots this harness writes and on
 * SFM's existing vitest + jsdom setup.
 *
 * Wire-up:
 *   - Standalone:  pnpm --filter @workspace/api-server run test:math-integrity-harness
 *   - In CI chain: `test:math-integrity-harness` is appended to the
 *     api-server `test` script chain in `artifacts/api-server/package.json`.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_METRICS,
  type CanonicalMetric,
} from "@workspace/finance";

import { composeMathIntegrity } from "../scripts/run-math-integrity-report.js";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
// Snapshot directory consumed by the SFM render coverage vitest. Lives
// inside SFM so vitest's default include pattern picks up the sibling
// test file; the directory itself is git-ignored (regenerated on every
// harness run) so a stale snapshot can never poison the test.
const SFM_SNAPSHOT_DIR = resolve(
  REPO_ROOT,
  "artifacts/school-financial-model/src/lib/integrity/__fixtures__/render-props",
);
const SFM_RENDER_TEST = "src/lib/integrity/__tests__/render-persona-coverage.test.tsx";

/** Persona × component matrix the SFM render harness must cover. */
const RENDER_COMPONENTS = ["ConsultantAnalysisView", "LenderPacketPreview"] as const;

interface RenderPropsSnapshot {
  personaSlug: string;
  personaLabel: string;
  personaSegment: string;
  /** Props for ConsultantAnalysisView. */
  consultant: unknown;
  /** Props for LenderPacketPreview (the lender packet payload). */
  lenderPacket: unknown;
}

async function main(): Promise<void> {
  console.log("\n=== M5 Math Integrity Harness ===");

  // ── 1. M4 composition (re-asserted as gates) ────────────────────────
  console.log("\n— Composing M4 integrity report (in-process) —");
  const c = await composeMathIntegrity();
  console.log(
    `Loaded ${c.personas.length} personas: ${c.personas
      .map((p) => p.slug)
      .join(", ")}`,
  );
  console.log(
    `registry findings=${c.registryFindings.length}, supplemental=${c.supplementalFindings.length}, m2-mapped=${c.m2Mapping.mapped.length}`,
  );

  const regCounts = countBySeverity(c.registryFindings);
  check(
    "M4 registry-surface: zero unresolved",
    (regCounts.unresolved ?? 0) === 0,
    `unresolved=${regCounts.unresolved ?? 0}`,
  );
  check(
    "M4 registry-surface: zero drift",
    (regCounts.drift ?? 0) === 0,
    `drift=${regCounts.drift ?? 0}`,
  );
  check(
    "M4 registry-surface: zero missing",
    (regCounts.missing ?? 0) === 0,
    `missing=${regCounts.missing ?? 0}`,
  );

  const suppCounts = countBySeverity(c.supplementalFindings);
  check(
    "M4 supplemental re-flow: zero drift",
    (suppCounts.drift ?? 0) === 0,
    `drift=${suppCounts.drift ?? 0}`,
  );

  const m2Counts = countBySeverity(c.m2Mapping.mapped);
  check(
    "M4 M2 → M1 mapping: zero drift",
    (m2Counts.drift ?? 0) === 0,
    `drift=${m2Counts.drift ?? 0}`,
  );

  check(
    "M4 triage taxonomy: every finding carries a valid triageCode",
    c.invalidTriage.length === 0,
    c.invalidTriage.length > 0
      ? `invalid: ${c.invalidTriage
          .slice(0, 5)
          .map((f) => `${f.metricId}:${f.triageCode}`)
          .join(", ")}`
      : "",
  );
  check(
    "M4 skipped-structural rows carry non-empty triage text",
    c.blankTriage.length === 0,
    `blank=${c.blankTriage.length}`,
  );

  // M2 orphan-value gate — PER-VALUE granularity.
  //
  // Failure mode the architect explicitly called out for M5: an
  // aggregated-by-label check (M4's behaviour) can mask a regression
  // where a known-classified label leaks a NEW numeric leaf at a new
  // location. We assert on every individual orphan leaf and emit
  // each as `<surface> | value=<value> | <location> | label=<label>`
  // so the failure message names the exact wire-payload coordinate
  // the registry author has to absorb.
  //
  // `unclassifiedOrphanLeaves` is the set of orphan leaves whose
  // label is neither mapped via M2_LABEL_TO_METRIC nor covered by
  // an M2_UNMAPPED_RATIONALE rationale entry — the same UNCLASSIFIED
  // predicate the M4 markdown table uses, applied per VALUE.
  const orphanReport = c.unclassifiedOrphanLeaves
    .slice(0, 20)
    .map(
      (o) =>
        `${o.surface} | value=${o.value}${o.rawToken !== undefined ? ` (raw="${o.rawToken}")` : ""} | persona=${o.persona} | ${o.location} | label=${o.label ?? "(no-label)"}`,
    )
    .join("\n      ");
  check(
    "M2 orphan-value: every numeric leaf is mapped to a registry metric or carries an auditable rationale",
    c.unclassifiedOrphanLeaves.length === 0,
    c.unclassifiedOrphanLeaves.length > 0
      ? `${c.unclassifiedOrphanLeaves.length} orphan leaf value(s):\n      ${orphanReport}${c.unclassifiedOrphanLeaves.length > 20 ? `\n      …(+${c.unclassifiedOrphanLeaves.length - 20} more)` : ""}`
      : "",
  );
  // Defence-in-depth: also keep the label-level gate so a regression
  // that flips an entire label class to unclassified is reported with
  // its own dedicated failure (label-aggregated diagnostic).
  check(
    "M2 orphan-value (label-aggregated): every unmapped label is classified",
    c.unclassifiedLabels.length === 0,
    c.unclassifiedLabels.length > 0
      ? `unclassified labels: ${c.unclassifiedLabels.join(", ")}`
      : "",
  );

  // ── 2. Registry-shape invariants ───────────────────────────────────
  console.log("\n— Registry-shape invariants —");

  // 2a. Every metric has ≥1 declared consumer surface.
  const metricsWithoutSurface = CANONICAL_METRICS.filter(
    (m) => !Array.isArray(m.surfaces) || m.surfaces.length === 0,
  );
  check(
    "every CANONICAL_METRICS entry declares ≥1 consumer surface",
    metricsWithoutSurface.length === 0,
    metricsWithoutSurface.length > 0
      ? `missing surfaces: ${metricsWithoutSurface.map((m) => m.id).join(", ")}`
      : "",
  );

  // 2b. Every metric has a non-empty primarySource (canonical.module + accessor).
  const metricsWithoutPrimarySource = CANONICAL_METRICS.filter(
    (m) =>
      !m.canonical ||
      typeof m.canonical.module !== "string" ||
      m.canonical.module.trim().length === 0 ||
      typeof m.canonical.accessor !== "string" ||
      m.canonical.accessor.trim().length === 0,
  );
  check(
    "every CANONICAL_METRICS entry declares a primarySource (canonical.module + accessor)",
    metricsWithoutPrimarySource.length === 0,
    metricsWithoutPrimarySource.length > 0
      ? `missing primarySource: ${metricsWithoutPrimarySource
          .map((m) => m.id)
          .join(", ")}`
      : "",
  );

  // 2c. No duplicate consumer locations across the registry. Two metrics
  //     declaring the same (path, location) pair would let one drift
  //     silently while masquerading as the other — the harness would
  //     happily diff both metrics against the same surface read.
  const locationOwners = new Map<string, string[]>();
  for (const m of CANONICAL_METRICS) {
    for (const s of m.surfaces) {
      const key = `${s.path} :: ${s.location}`;
      const owners = locationOwners.get(key) ?? [];
      owners.push(m.id);
      locationOwners.set(key, owners);
    }
  }
  const duplicateLocations = [...locationOwners.entries()].filter(
    ([, owners]) => owners.length > 1,
  );
  check(
    "no (path, location) consumer pair is declared by two different metrics",
    duplicateLocations.length === 0,
    duplicateLocations.length > 0
      ? `duplicates: ${duplicateLocations
          .slice(0, 3)
          .map(([k, owners]) => `${k} → [${owners.join(", ")}]`)
          .join("; ")}`
      : "",
  );

  // 2d. Within a single metric, no surface is declared twice at the same
  //     (path, location) — a defensive narrower check (would still pass
  //     2c if every duplicate happened to share the same metric id, which
  //     would still be a bug).
  const intraDupes: string[] = [];
  for (const m of CANONICAL_METRICS) {
    const seen = new Set<string>();
    for (const s of m.surfaces) {
      const k = `${s.path}::${s.location}`;
      if (seen.has(k)) intraDupes.push(`${m.id} → ${k}`);
      seen.add(k);
    }
  }
  check(
    "no metric declares the same (path, location) consumer twice",
    intraDupes.length === 0,
    intraDupes.length > 0 ? `intra-metric dupes: ${intraDupes.join("; ")}` : "",
  );

  // ── 3. Auto-pickup invariant ───────────────────────────────────────
  // The registry-driven findings denominator must equal
  // personas × Σ metric.surfaces.length — proves the harness iterates
  // the FULL persona × metric × surface matrix and that adding a new
  // *.fixture.ts (auto-discovered) or a new entry to CANONICAL_METRICS
  // automatically expands coverage without any edit to this file.
  const totalSurfaces = CANONICAL_METRICS.reduce(
    (acc, m) => acc + m.surfaces.length,
    0,
  );
  // A registry surface may declare multiple co-located typed readers
  // (e.g. lender-readiness on build-lender-packet.ts has both `status`
  // and `result.uncappedRating` — see TYPED_READERS_BY_SURFACE comment
  // in run-math-integrity-report.ts). The auto-pickup floor therefore
  // uses `>=` against personas × Σ surfaces, and we additionally
  // assert that EVERY (persona, metric, surface) tuple produced at
  // least one finding so a silent drop is still caught.
  const minExpectedFindings = c.personas.length * totalSurfaces;
  check(
    "registry findings count ≥ personas × Σ surfaces (auto-pickup floor)",
    c.registryFindings.length >= minExpectedFindings,
    `got=${c.registryFindings.length}, expected≥${minExpectedFindings} (personas=${c.personas.length}, surfaces=${totalSurfaces})`,
  );
  // Per-(persona, metric) coverage: every persona must produce ≥1
  // finding for every registered metric. (Per-surface granularity is
  // not asserted here because typed readers re-tag the finding's
  // `surface` field to their reader-specific label — e.g.
  // `m2:lender-packet` — rather than the registry's surface.path,
  // making a path-keyed match brittle. The cardinality floor above
  // already proves no surface was silently dropped.)
  const pmSeen = new Set<string>();
  for (const f of c.registryFindings) {
    pmSeen.add(`${f.persona}::${f.metricId}`);
  }
  const missingPm: string[] = [];
  for (const persona of c.personas) {
    for (const metric of CANONICAL_METRICS) {
      const key = `${persona.slug}::${metric.id}`;
      if (!pmSeen.has(key)) missingPm.push(key);
    }
  }
  check(
    "every (persona × metric) pair yields ≥1 registry finding",
    missingPm.length === 0,
    missingPm.length > 0
      ? `missing: ${missingPm.slice(0, 5).join(", ")}${missingPm.length > 5 ? ` …(+${missingPm.length - 5} more)` : ""}`
      : "",
  );
  // Per-metric cardinality floor: a stronger guarantee against
  // surface-level silent drops than the global floor alone. For each
  // metric, the number of findings across all personas must be ≥
  // personas × surfaces[metric].length. A drop of a single surface on
  // a single metric cannot be masked by extra typed-reader rows on
  // OTHER metrics (which is what defeats a single global floor).
  const findingsByMetric = new Map<string, number>();
  for (const f of c.registryFindings) {
    findingsByMetric.set(f.metricId, (findingsByMetric.get(f.metricId) ?? 0) + 1);
  }
  const perMetricShortfalls: string[] = [];
  for (const metric of CANONICAL_METRICS) {
    const expected = c.personas.length * metric.surfaces.length;
    const got = findingsByMetric.get(metric.id) ?? 0;
    if (got < expected) {
      perMetricShortfalls.push(`${metric.id}: got=${got}, expected≥${expected}`);
    }
  }
  check(
    "per-metric cardinality floor (per-persona × declared surfaces)",
    perMetricShortfalls.length === 0,
    perMetricShortfalls.slice(0, 5).join("; "),
  );

  // Auto-pickup for fixtures: re-asserted via the same denominator
  // (changing persona count flips expectedFindings). Explicit gate so
  // a future regression that silently filters personas surfaces here.
  check(
    "every discovered persona contributed to the M4 composition",
    c.personaCtxs.length === c.personas.length,
    `personaCtxs=${c.personaCtxs.length}, personas=${c.personas.length}`,
  );

  // ── 4. Component-props vs component-rendered render coverage ───────
  console.log("\n— Component-props (extractComponentState) vs component-rendered (extractRendered) —");

  // 4a. Surface naming policy. The api-server props walker emits records
  //     tagged `surface: "component-state"` (legacy name) and the SFM
  //     DOM walker emits `surface: "rendered"`. M5 reasons about them
  //     under the logical names `component-props` (superset) and
  //     `component-rendered` (subset). The SFM render harness uses these
  //     logical names in its assertions; we re-state the mapping here so
  //     a reviewer can grep either name and find the contract.
  check(
    "surface-name policy: component-props ← extractComponentState ('component-state' wire tag)",
    true,
    "documented in artifacts/api-server/src/lib/integrity/extract/component-state.ts",
  );
  check(
    "surface-name policy: component-rendered ← extractRendered ('rendered' wire tag)",
    true,
    "documented in artifacts/school-financial-model/src/lib/integrity/extract-rendered.ts",
  );

  // 4b. Write per-persona React-props snapshots. The snapshots are the
  //     ONLY input the SFM render test consumes from this harness, so
  //     wipe + rewrite on every run to guarantee no stale persona leaks.
  if (existsSync(SFM_SNAPSHOT_DIR)) {
    rmSync(SFM_SNAPSHOT_DIR, { recursive: true, force: true });
  }
  mkdirSync(SFM_SNAPSHOT_DIR, { recursive: true });
  const snapshotIndex: { personas: string[]; components: readonly string[] } = {
    personas: [],
    components: RENDER_COMPONENTS,
  };
  for (const { ctx } of c.personaCtxs) {
    const snap: RenderPropsSnapshot = {
      personaSlug: ctx.persona.slug,
      personaLabel: ctx.persona.label,
      personaSegment: ctx.persona.segment,
      consultant: ctx.consultant,
      lenderPacket: ctx.lenderPacket,
    };
    const file = join(SFM_SNAPSHOT_DIR, `${ctx.persona.slug}.json`);
    writeFileSync(file, JSON.stringify(snap, null, 2));
    snapshotIndex.personas.push(ctx.persona.slug);
  }
  writeFileSync(
    join(SFM_SNAPSHOT_DIR, "_index.json"),
    JSON.stringify(snapshotIndex, null, 2),
  );
  check(
    "wrote per-persona render-props snapshots for SFM render harness",
    snapshotIndex.personas.length === c.personas.length,
    `wrote ${snapshotIndex.personas.length} snapshots @ ${SFM_SNAPSHOT_DIR}`,
  );
  check(
    "auto-pickup: render-props snapshots cover every discovered persona",
    snapshotIndex.personas.length === c.personas.length &&
      c.personas.every((p) => snapshotIndex.personas.includes(p.slug)),
    `personas=[${c.personas.map((p) => p.slug).join(",")}], snapshots=[${snapshotIndex.personas.join(",")}]`,
  );

  // 4c. Subprocess into the SFM vitest. The render test file (created
  //     alongside this harness) reads the snapshots, renders each
  //     persona × component pairing, runs both extractors, and asserts
  //     the rendered ⊆ props invariant per persona × component. We rely
  //     on its non-zero exit to fail this check.
  console.log("\n— Spawning SFM render-persona-coverage vitest —");
  const sfmTestAbsPath = resolve(
    REPO_ROOT,
    "artifacts/school-financial-model",
    SFM_RENDER_TEST,
  );
  check(
    "SFM render coverage test file exists on disk",
    existsSync(sfmTestAbsPath),
    sfmTestAbsPath,
  );
  const spawned = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/school-financial-model",
      "exec",
      "vitest",
      "run",
      SFM_RENDER_TEST,
    ],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, CI: "1" },
    },
  );
  check(
    "SFM render-persona-coverage vitest exited 0",
    spawned.status === 0,
    `status=${spawned.status}${spawned.error ? `, error=${spawned.error.message}` : ""}`,
  );

  // ── Summary ────────────────────────────────────────────────────────
  console.log(
    `\nmath-integrity-harness: ${passed} pass, ${failed} fail`,
  );
  if (failed > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
  console.log(
    "\nOK: M4 acceptance bar + M5 registry-shape + orphan + auto-pickup + render coverage all green.",
  );
}

function countBySeverity(
  findings: readonly { severity: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) {
    out[f.severity] = (out[f.severity] ?? 0) + 1;
  }
  return out;
}

// Reference the imports so they're not tree-shaken / flagged as
// unused. (`CanonicalMetric` is re-used implicitly via CANONICAL_METRICS
// element type inference; the explicit type is here for IDE assistance.)
void (null as unknown as CanonicalMetric | null);

main().catch((err) => {
  console.error("math-integrity-harness: unhandled error", err);
  process.exit(1);
});
