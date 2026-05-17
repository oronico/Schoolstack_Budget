/**
 * Task #930 / M3 — Canonical baseline writer harness.
 *
 * Regenerates `tests/__baselines__/canonical-values.json` from the
 * discovered persona fixtures and asserts the resulting file is
 * structurally sound (one entry per persona, every metric in the
 * registry represented for every persona). Checked into version
 * control so any canonical drift surfaces as a reviewable file diff
 * in the same PR — the file is the source of truth M4 (#976) diffs
 * extracted surface values against.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CANONICAL_METRICS } from "@workspace/finance";

import {
  loadPersonaFixturesAsync,
  writeCanonicalBaseline,
  DEFAULT_BASELINE_PATH,
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
  const outPath = resolve(
    process.cwd(),
    "tests/__baselines__/canonical-values.json",
  );
  console.log(`\n— Writing canonical baseline → ${outPath}`);
  const baseline = await writeCanonicalBaseline(outPath);
  const fixtures = await loadPersonaFixturesAsync();

  check(
    "baseline JSON file written to disk",
    existsSync(outPath),
    outPath,
  );
  check(
    "default baseline path is exported and resolves under cwd",
    DEFAULT_BASELINE_PATH.endsWith("tests/__baselines__/canonical-values.json"),
    DEFAULT_BASELINE_PATH,
  );
  check(
    "baseline includes every discovered persona",
    baseline.personas.length === fixtures.length &&
      fixtures.every((f) => baseline.personas.includes(f.slug)),
    `personas=${baseline.personas.join(",")} fixtures=${fixtures
      .map((f) => f.slug)
      .join(",")}`,
  );

  // Round-trip: parse the file back and assert every persona has an
  // entry for every metric in the registry. M4 will consume this
  // file, so the on-disk shape — not just the in-memory return —
  // must be complete.
  const onDisk = JSON.parse(readFileSync(outPath, "utf8")) as typeof baseline;
  for (const fx of fixtures) {
    const v = onDisk.values?.[fx.slug];
    check(
      `[${fx.slug}] persona block present in on-disk baseline`,
      !!v,
      v ? "" : "missing",
    );
    if (!v) continue;
    const missing: string[] = [];
    for (const m of CANONICAL_METRICS) {
      if (!(m.id in v)) missing.push(m.id);
    }
    check(
      `[${fx.slug}] every registry metric represented in baseline`,
      missing.length === 0,
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
    );
  }

  console.log(
    `\nintegrity-canonical-baseline: ${passed} pass, ${failed} fail`,
  );
  if (failed > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("integrity-canonical-baseline: unhandled error", err);
  process.exit(1);
});
