/**
 * Task #930 / M3 — Canonical baseline writer.
 *
 * Emits the full `persona × metric → value` map computed by the
 * canonical layer to a JSON file on disk. M4 (#976) reads this
 * baseline as the source of truth when diffing extracted surface
 * values against the canonical answer key; checking the baseline
 * into version control gives the M5 harness a stable anchor and
 * makes any canonical drift show up as a reviewable file diff in
 * the same PR.
 *
 * Default output path lives under `tests/__baselines__/` so it
 * sits next to the integrity test suite that produces it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { CANONICAL_METRICS } from "@workspace/finance";

import { computeCanonicalValuesForFixture } from "./compute.js";
import {
  loadPersonaFixturesAsync,
  type PersonaFixture,
} from "./fixtures.js";

export const DEFAULT_BASELINE_PATH = resolve(
  process.cwd(),
  "tests/__baselines__/canonical-values.json",
);

export interface CanonicalBaseline {
  /** Number of metrics in the registry at generation time. */
  metricCount: number;
  /** Slugs of every persona included. */
  personas: string[];
  /**
   * Nested map: `values[persona][metricId] = naturalFormValue`.
   * Notes are kept on a parallel `notes[persona][metricId]` map so
   * the diffable values file stays compact.
   */
  values: Record<string, Record<string, unknown>>;
  notes: Record<string, Record<string, string>>;
}

/**
 * Compute every canonical value for every discovered persona and
 * write the result to `outPath` (defaults to
 * `tests/__baselines__/canonical-values.json` under cwd). Creates
 * the parent directory if needed. Throws if any resolver throws —
 * the baseline must be complete or absent, never partial.
 */
export async function writeCanonicalBaseline(
  outPath: string = DEFAULT_BASELINE_PATH,
  fixtures?: readonly PersonaFixture[],
): Promise<CanonicalBaseline> {
  const personas = fixtures ?? (await loadPersonaFixturesAsync());
  const values: Record<string, Record<string, unknown>> = {};
  const notes: Record<string, Record<string, string>> = {};
  for (const fx of personas) {
    const records = await computeCanonicalValuesForFixture(fx);
    const v: Record<string, unknown> = {};
    const n: Record<string, string> = {};
    for (const r of records) {
      v[r.metricId] = r.value;
      if (r.note) n[r.metricId] = r.note;
    }
    values[fx.slug] = v;
    notes[fx.slug] = n;
  }
  // Intentionally no `generatedAt` field — the baseline is checked
  // into version control and any change must be a real value diff
  // worth reviewing, not timestamp churn. CI's `git log` already
  // tells reviewers WHEN the baseline last moved.
  const baseline: CanonicalBaseline = {
    metricCount: CANONICAL_METRICS.length,
    personas: personas.map((p) => p.slug),
    values,
    notes,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  return baseline;
}
