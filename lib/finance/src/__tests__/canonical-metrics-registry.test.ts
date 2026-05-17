/**
 * Lint test for the M1 Primary Data Source Registry (Task #973).
 *
 * Asserts:
 *   1. Every entry has a unique, kebab-case `id`.
 *   2. Every entry has at least one surface.
 *   3. `canonical.module` points at @workspace/finance or an
 *      api-server lib path — never a UI / render file.
 *   4. The generated markdown view in `docs/` is in sync with the
 *      registry (re-run `pnpm --filter @workspace/finance exec tsx
 *      src/registry/generate-markdown.ts > docs/primary-data-source-registry.md`
 *      if this fails).
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_METRICS } from "../registry/canonical-metrics.js";
import { renderRegistryMarkdown } from "../registry/generate-markdown.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// 1. unique ids
const ids = CANONICAL_METRICS.map((m) => m.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
assert.equal(dupes.length, 0, `Duplicate metric ids: ${dupes.join(", ")}`);

// 1b. kebab-case
for (const id of ids) {
  assert.ok(KEBAB.test(id), `Metric id "${id}" is not kebab-case`);
}

// 2. at least one surface
for (const m of CANONICAL_METRICS) {
  assert.ok(
    m.surfaces.length > 0,
    `Metric "${m.id}" has no surfaces. Either add a surface or drop the entry.`,
  );
  for (const s of m.surfaces) {
    assert.ok(
      s.path.length > 0 && s.location.length > 0,
      `Metric "${m.id}" has a surface with an empty path or location.`,
    );
  }
}

// 3. canonical.module is non-UI, prefix-allowed, and (if a file path) exists on disk
const UI_DIRS = ["/components/", "/pages/", "/views/", "/ui/"];
const ALLOWED_MODULE_PREFIXES = [
  "@workspace/finance",
  "artifacts/api-server/src/lib/",
];
for (const m of CANONICAL_METRICS) {
  const mod = m.canonical.module;
  assert.ok(mod.length > 0, `Metric "${m.id}" has empty canonical.module.`);
  assert.ok(
    !UI_DIRS.some((d) => mod.includes(d)),
    `Metric "${m.id}" canonical.module "${mod}" looks like a UI surface. ` +
      `Canonical owners must live in @workspace/finance or an api-server lib.`,
  );
  assert.ok(
    ALLOWED_MODULE_PREFIXES.some((p) => mod === p || mod.startsWith(p)),
    `Metric "${m.id}" canonical.module "${mod}" is not on the allowlist ` +
      `(@workspace/finance or artifacts/api-server/src/lib/...).`,
  );
  if (mod !== "@workspace/finance" && !mod.startsWith("@workspace/")) {
    assert.ok(
      existsSync(resolve(repoRoot, mod)),
      `Metric "${m.id}" canonical.module "${mod}" does not exist on disk.`,
    );
  }
}

// 3b. Every surface path must exist on disk.
for (const m of CANONICAL_METRICS) {
  for (const s of m.surfaces) {
    assert.ok(
      existsSync(resolve(repoRoot, s.path)),
      `Metric "${m.id}" surface "${s.path}" does not exist on disk.`,
    );
  }
}

// 3c. No consumer (path + location) appears under two metrics.
// This is the M1 "no consumer location appears under two metrics" rule —
// it would otherwise let two canonical sources silently claim the same
// rendered cell, defeating the registry.
const seenConsumers = new Map<string, string>();
for (const m of CANONICAL_METRICS) {
  for (const s of m.surfaces) {
    const key = `${s.path}::${s.location}`;
    const prior = seenConsumers.get(key);
    assert.ok(
      prior === undefined,
      `Consumer "${key}" appears under both "${prior}" and "${m.id}". ` +
        `Each rendered location must map to exactly one canonical metric — ` +
        `pick one owner or differentiate the surface location.`,
    );
    seenConsumers.set(key, m.id);
  }
}

// 3d. Every materialized entry has description, rounding, tolerance.
for (const m of CANONICAL_METRICS) {
  assert.ok(
    typeof m.description === "string" && m.description.length > 0,
    `Metric "${m.id}" has empty description.`,
  );
  assert.ok(
    m.rounding && Number.isInteger(m.rounding.decimals) && m.rounding.decimals >= 0,
    `Metric "${m.id}" has invalid rounding.`,
  );
  assert.ok(
    m.tolerance && (m.tolerance.abs !== undefined || m.tolerance.rel !== undefined),
    `Metric "${m.id}" has no tolerance (need abs and/or rel).`,
  );
}

// 4. markdown view is current
const mdPath = resolve(repoRoot, "docs/primary-data-source-registry.md");
assert.ok(
  existsSync(mdPath),
  `Missing docs/primary-data-source-registry.md. ` +
    `Generate it with: pnpm --filter @workspace/finance exec tsx ` +
    `src/registry/generate-markdown.ts > docs/primary-data-source-registry.md`,
);
const onDisk = readFileSync(mdPath, "utf8");
const expected = renderRegistryMarkdown();
assert.equal(
  onDisk,
  expected,
  `docs/primary-data-source-registry.md is stale. ` +
    `Regenerate with: pnpm --filter @workspace/finance exec tsx ` +
    `src/registry/generate-markdown.ts > docs/primary-data-source-registry.md`,
);

// eslint-disable-next-line no-console
console.log(
  `canonical-metrics-registry: OK (${CANONICAL_METRICS.length} metrics, ` +
    `${CANONICAL_METRICS.reduce((n, m) => n + m.surfaces.length, 0)} surfaces)`,
);
