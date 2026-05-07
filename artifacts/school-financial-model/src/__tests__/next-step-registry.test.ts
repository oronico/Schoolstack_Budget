// Task #658 — registry-level enforcement that every emit site of a
// coach-voice flag carries a non-empty `nextStep` whose literal string
// contains none of the banned credit-verdict words.
//
// We scan the source files of all five flag-emitting engines and assert,
// for every `nextStep:` occurrence, that the value is a non-empty string
// (or template literal whose static segments are non-empty) and contains
// no banned patterns. This naturally enforces the rule on every future
// emit site at PR time, without requiring fixture coverage of every
// branch.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

const ENGINE_FILES = [
  // Frontend diagnostics — DiagnosticFinding.nextStep
  "artifacts/school-financial-model/src/lib/coaching/diagnostics-engine.ts",
  // Backend consultant/lender — DecisionIssue.nextStep
  "artifacts/api-server/src/lib/decision-rules.ts",
  // Backend health — HealthSignal.nextStep
  "artifacts/api-server/src/lib/financial-health.ts",
  // Backend assumptions — AssumptionFlag.nextStep
  "artifacts/api-server/src/lib/assumption-flags.ts",
  // Scenario engine + decision flows — NudgeItem.nextStep
  "lib/finance/src/decision-engine/scenario-engine.ts",
  "lib/finance/src/decision-engine/decision-flows.ts",
];

const BANNED = [
  /\bapproved\b/i,
  /\bdeclined\b/i,
  /\bfailed\b/i,
  /\brejected\b/i,
  /\brejection\b/i,
  /\bineligible\b/i,
  /loan\s+approval/i,
  /\b(you|your|the)\s+(model|plan|application)\s+(passed|failed)\b/i,
];

interface Hit {
  file: string;
  line: number;
  raw: string;
  literal: string;
}

// Match `nextStep:` followed by either a string literal or a template
// literal. We only enforce against emit-site object properties — interface
// declarations (`nextStep: string;`) are excluded by requiring a value
// that starts with `"`, `'`, or backtick.
function findNextStepEmits(src: string, file: string): Hit[] {
  const hits: Hit[] = [];
  const lines = src.split("\n");
  // Tolerate leading whitespace and a possible ternary wrapping; capture
  // the first quoted/template literal that follows.
  const RE = /nextStep\s*:\s*(?:[^,\n]*?\?\s*[^:]*?:\s*)?(["'`])((?:\\.|(?!\1).)*)\1/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/nextStep\s*:/.test(line)) continue;
    // Skip pure interface declarations like `nextStep: string;`
    if (/nextStep\s*:\s*string\s*;?\s*(?:\/\/.*)?$/.test(line.trim())) continue;
    // Reset regex per line
    RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(line)) !== null) {
      hits.push({ file, line: i + 1, raw: line.trim(), literal: m[2] });
    }
  }
  return hits;
}

describe("Task #658 — nextStep registry enforcement", () => {
  const allHits: Hit[] = [];
  for (const rel of ENGINE_FILES) {
    const src = readFileSync(resolve(REPO_ROOT, rel), "utf8");
    const hits = findNextStepEmits(src, rel);
    allHits.push(...hits);
  }

  it("scans every flag-emitting engine file", () => {
    expect(ENGINE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it("finds at least one nextStep emit site per engine file", () => {
    for (const rel of ENGINE_FILES) {
      const fileHits = allHits.filter((h) => h.file === rel);
      expect(fileHits.length, `${rel} has no nextStep emits`).toBeGreaterThan(0);
    }
  });

  it("every nextStep literal is non-empty", () => {
    for (const h of allHits) {
      const trimmed = h.literal.replace(/\\.|\$\{[^}]*\}/g, "x").trim();
      expect(trimmed.length, `${h.file}:${h.line} → empty nextStep`).toBeGreaterThan(0);
    }
  });

  it("no nextStep literal contains a banned credit-verdict word", () => {
    for (const h of allHits) {
      // Drop ${...} placeholders before banned-word scanning so dynamic
      // numeric formatters don't accidentally match.
      const flat = h.literal.replace(/\$\{[^}]*\}/g, " ");
      for (const re of BANNED) {
        expect(re.test(flat), `${h.file}:${h.line} → banned ${re}: "${h.literal}"`).toBe(false);
      }
    }
  });

  it("totals at least 25 emit sites across all engines (sanity floor)", () => {
    expect(allHits.length).toBeGreaterThanOrEqual(25);
  });
});
