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
import {
  validateNextStep,
  NextStepGuardrailError,
} from "@workspace/finance";

// Task #689 — when adding or editing a `nextStep:` literal in any of the
// engine files below, the string must satisfy
// `validateNextStep` from `lib/finance/src/coaching-flag-guardrail.ts`.
// That guardrail rejects banned credit-verdict vocabulary *and* weak,
// non-actionable phrasings like "Review this", "Look into staffing",
// "Investigate", "Consider this", "TBD", etc. Coach-voice next steps name
// a specific Step, lever, or cadence the founder can act on right now.
// See also `coaching-flag-guardrail.test.ts` for the unit tests that pin
// the contract.

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
  // Underwriting wizard — LenderFlag.label / .nextStep
  "artifacts/school-financial-model/src/pages/underwriting.tsx",
];

// Primary user-facing text fields per engine — these must also pass the
// banned-word check, not only nextStep. Task #658 review pass 3.
const PRIMARY_TEXT_FIELDS = [
  "title",
  "headline",
  "summary",
  "explanation",
  "message",
  "label",
  "whyItMatters",
  "recommendedAction",
  "action",
  "defaultPrompt",
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

  // Task #689 — also enforce the *weak phrasing* and minimum-length rules
  // from the runtime guardrail, not just the banned-word list. We
  // substitute placeholders with a neutral filler so dynamic ${...} parts
  // (which the founder will see filled in at runtime) don't accidentally
  // trip the length floor or weak-phrase regexes.
  it("every nextStep literal passes the runtime guardrail (validateNextStep)", () => {
    const errors: string[] = [];
    for (const h of allHits) {
      const filled = h.literal.replace(/\$\{[^}]*\}/g, "0");
      try {
        validateNextStep(filled, `${h.file}:${h.line}`);
      } catch (err) {
        if (err instanceof NextStepGuardrailError) {
          errors.push(`${err.message} (raw: "${h.literal}")`);
        } else {
          throw err;
        }
      }
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("totals at least 25 emit sites across all engines (sanity floor)", () => {
    expect(allHits.length).toBeGreaterThanOrEqual(25);
  });

  // Task #658 review pass 3 — also enforce coach tone on primary text
  // fields (title / summary / headline / message / label / etc.). This
  // catches verdict-style phrasing in the headline of a flag, not just
  // the next-step copy underneath it.
  describe("primary text fields are coach-tone (no banned words)", () => {
    const RE = new RegExp(
      `(${PRIMARY_TEXT_FIELDS.join("|")})\\s*:\\s*(?:[^,\\n]*?\\?\\s*[^:]*?:\\s*)?(["'\`])((?:\\\\.|(?!\\2).)*)\\2`,
      "g",
    );

    interface PrimaryHit { file: string; line: number; field: string; literal: string }
    const primary: PrimaryHit[] = [];

    for (const rel of ENGINE_FILES) {
      const src = readFileSync(resolve(REPO_ROOT, rel), "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip pure interface declarations (`title: string;`) and
        // anything inside an obvious comment line.
        if (/^\s*\/\//.test(line)) continue;
        // Skip select-option label lists — they're UI option text, not
        // flag copy (e.g. `{ value: "x", label: "Microschool" }`).
        if (/value\s*:\s*["']/.test(line) && /label\s*:/.test(line)) continue;
        RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RE.exec(line)) !== null) {
          if (/string\s*;?\s*$/.test(line.trim())) continue;
          primary.push({ file: rel, line: i + 1, field: m[1], literal: m[3] });
        }
      }
    }

    it("finds at least 50 primary-text emit sites (sanity floor)", () => {
      expect(primary.length).toBeGreaterThanOrEqual(50);
    });

    it("no primary-text literal contains a banned credit-verdict word", () => {
      for (const h of primary) {
        const flat = h.literal.replace(/\$\{[^}]*\}/g, " ");
        for (const re of BANNED) {
          expect(re.test(flat), `${h.file}:${h.line} (${h.field}) → banned ${re}: "${h.literal}"`).toBe(false);
        }
      }
    });
  });
});
