#!/usr/bin/env tsx
/**
 * Regression test: the generated §1 of the go-live data migration plan
 * must match the hand-written version in docs/operations/go-live-data-
 * migration-plan.md exactly. This is the proof that the tooling can
 * reproduce the M6 plan and so is a credible replacement for the
 * artisanal review going forward.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../schema-change-lib.js";
import { buildGoLivePlanSection1 } from "../go-live-plan-render.js";

const PLAN_PATH = path.join(
  REPO_ROOT,
  "docs",
  "operations",
  "go-live-data-migration-plan.md",
);

function extractSection1(markdown: string): string {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => l.startsWith("## 1. Schema migrations"));
  if (startIdx < 0) throw new Error("Cannot find §1 in plan markdown");
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      endIdx = i;
      break;
    }
  }
  // Strip the trailing horizontal-rule + blank-line separator that lives
  // between sections, so the comparison is body-only.
  let end = endIdx;
  while (end > startIdx && (lines[end - 1] === "" || lines[end - 1] === "---")) {
    end -= 1;
  }
  return lines.slice(startIdx, end).join("\n") + "\n";
}

function main(): void {
  const plan = fs.readFileSync(PLAN_PATH, "utf8");
  const expected = extractSection1(plan);
  const actual = buildGoLivePlanSection1();
  try {
    assert.equal(actual, expected);
  } catch (err) {
    process.stderr.write("Generated §1 does not match the hand-written M6 plan.\n");
    process.stderr.write("--- expected ---\n");
    process.stderr.write(expected);
    process.stderr.write("--- actual ---\n");
    process.stderr.write(actual);
    throw err;
  }
  process.stdout.write("go-live plan §1 regression: OK\n");
}

main();
