// Task #454 regression guard. The string returned by `schoolModelFromType`
// is printed verbatim in the underwriting workbook header ("School Model"
// cell). If we ever drift back to raw snake_case enum ids, lender-facing
// exports start showing internal codes like `learning_pod` to the founder
// and the lender — this test fails loudly when that happens.

import { schoolModelFromType } from "../src/lib/workbook-helpers.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eq<T>(label: string, actual: T, expected: T): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("— schoolModelFromType: human-readable display labels —");

// First-class personas (Task #454): each returns a distinct, human-readable
// label rather than a raw enum id.
eq("learning_pod label", schoolModelFromType("learning_pod"), "learning pod");
eq("tutoring_center label", schoolModelFromType("tutoring_center"), "tutoring center");
eq("homeschool_coop label", schoolModelFromType("homeschool_coop"), "homeschool co-op");

// Pre-existing labels stay the same so prior workbooks render unchanged.
eq("microschool label", schoolModelFromType("microschool"), "microschool");
eq("charter_school label", schoolModelFromType("charter_school"), "charter");
eq("private_school label", schoolModelFromType("private_school"), "private");
eq("undefined falls back to private", schoolModelFromType(undefined), "private");

// No first-class persona may leak a raw snake_case id (the regression the
// reviewer caught). Any underscore in the displayed string is a bug.
for (const t of ["learning_pod", "tutoring_center", "homeschool_coop"] as const) {
  const out = schoolModelFromType(t);
  check(
    `${t} display string contains no underscore`,
    !out.includes("_"),
    `got "${out}"`,
  );
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(f);
  process.exit(1);
}
