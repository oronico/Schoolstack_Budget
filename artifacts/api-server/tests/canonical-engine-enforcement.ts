/**
 * Task #618 — Canonical-engine enforcement check.
 *
 * Fails if any code path *outside* `lib/finance/` derives a headline
 * lender / board metric (DSCR, cash runway, break-even year, cash
 * position) with hand-rolled math instead of calling the canonical
 * helpers exported from `@workspace/finance`.
 *
 * The canonical helpers are the single source of truth for these
 * numbers. Re-implementing them downstream is what produced the
 * lender-vs-dashboard drift Task #618 was opened to lock down: a
 * bespoke `findIndex(yf => yf.netIncome >= 0)` here, an inline
 * `(netIncome + debtService) / debtService` there, and the same
 * scenario can ship two different DSCRs to two different surfaces.
 *
 * How the check works:
 *   1. Walk the workspace TS source (excluding generated code,
 *      tests, and `lib/finance/` itself).
 *   2. For each forbidden regex, record every `file:line` match.
 *   3. Subtract the `KNOWN_VIOLATIONS` allowlist — these are legacy
 *      occurrences that have been audited and traced back to either
 *      delegating to the canonical engine or being a transitional
 *      shim. Each entry documents *why* it's grandfathered.
 *   4. Anything left fails the check with a message that names the
 *      file:line and points the contributor at the right
 *      `@workspace/finance` import.
 *
 * Adding a new violation? Don't allowlist it — refactor it to import
 * the canonical helper instead. The allowlist is for legacy code only.
 *
 * Adding a new forbidden pattern? Append to `FORBIDDEN_PATTERNS` with
 * the canonical helper that should be used instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

interface ForbiddenPattern {
  /** Short label used in failure messages. */
  id: string;
  /** Regex (per-line). Use the simplest pattern that catches the smell. */
  re: RegExp;
  /** Plain-language guidance: which canonical helper to use instead. */
  fix: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    id: "local-break-even-year",
    re: /\.findIndex\([^)]*\.netIncome\s*[><=]+\s*0/,
    fix: "Read `breakEvenYear` off `computeBaseFinancials(model)` from @workspace/finance instead of deriving it locally with findIndex.",
  },
  {
    id: "local-dscr-formula",
    re: /\([^)]*\.?netIncome[^)]*\+[^)]*[Dd]ebt[Ss]ervice[^)]*\)\s*\/\s*[^)]*[Dd]ebt[Ss]ervice/,
    fix: "Read `dscr[]` off `computeBaseFinancials(model)` from @workspace/finance (or `lenderStressTests.base.dscr`) instead of inlining (NI + DS) / DS.",
  },
  {
    id: "local-cash-runway-fn",
    re: /^\s*export\s+function\s+compute(Cash)?Runway(Months)?\b/,
    fix: "Import `computeCashRunwayMonths` from @workspace/finance instead of declaring a local runway function.",
  },
  {
    // Cash position should always come from `computeBaseFinancials` →
    // `cashPosition[]` / `unrestrictedCash[]`. Local exported helpers
    // that synthesize a cash trajectory are exactly the kind of drift
    // Task #618 locks down. (Note: pure ratio helpers such as
    // `computeDaysCashOnHand` operate on an already-computed cash
    // value and are intentionally not matched.)
    id: "local-cash-position-fn",
    re: /^\s*export\s+function\s+compute([A-Z][A-Za-z0-9_]*)?(CashPosition|EndingCash|CashBalance|CashTrajectory|CashByYear)\b/,
    fix: "Import `computeBaseFinancials` from @workspace/finance and read `cashPosition[]` / `unrestrictedCash[]` instead of synthesizing a local cash trajectory.",
  },
];

/**
 * Allowlist: known legacy `file:line:patternId` occurrences that have
 * been audited and are either (a) a thin wrapper that delegates to the
 * canonical engine elsewhere in the same surface, or (b) a transitional
 * shim that will be removed in a follow-up. Each entry MUST carry a
 * one-line reason so the next maintainer knows whether it can be
 * deleted.
 *
 * Format: `{ file: "<repo-relative path>", pattern: "<id>", line: <1-indexed>, reason: "..." }`.
 *
 * Line numbers are checked as a strict equality so a refactor that
 * shifts the violation to a new line will surface as a new failure
 * (and the entry must be updated or removed).
 */
interface AllowlistEntry {
  file: string;
  pattern: string;
  line: number;
  reason: string;
}

const KNOWN_VIOLATIONS: AllowlistEntry[] = [
  // consultant-engine.ts derives a per-yearFinancials breakEvenYear in
  // three legacy paths. The CE feeds these straight into the
  // `ConsultantOutput` it returns, and the FINAL `cashRunwayMonths` /
  // `breakEvenYear` written to `ConsultantOutput` (line 3064 / 3074)
  // come from the canonical `computeCashRunwayMonths` /
  // `computeBaseFinancials` calls. The local findIndex calls feed
  // narrative-builder branches (strengths/risks copy) only — the
  // headline numbers shipped to lenders/boards already reconcile.
  // Tracked for cleanup but safe today (Task #618).
  {
    file: "artifacts/api-server/src/lib/consultant-engine.ts",
    pattern: "local-break-even-year",
    line: 1014,
    reason: "Legacy stress-scenario builder; result fed to narrative copy only. Headline breakEvenYear in ConsultantOutput comes from canonical engine (Task #618).",
  },
  {
    file: "artifacts/api-server/src/lib/consultant-engine.ts",
    pattern: "local-break-even-year",
    line: 1071,
    reason: "Legacy stress-scenario builder; result fed to narrative copy only. Headline breakEvenYear in ConsultantOutput comes from canonical engine (Task #618).",
  },
  {
    file: "artifacts/api-server/src/lib/consultant-engine.ts",
    pattern: "local-break-even-year",
    line: 1759,
    reason: "Legacy assessment builder; only used to gate strengths/risks copy. The ConsultantOutput.breakEvenYear shipped downstream is overwritten with the canonical engine result before return (Task #618).",
  },

  // Legacy single-line DSCR derivations that still live in HTTP route
  // handlers. Each surface either pre-dates the canonical lender
  // stress-test helper or computes a Y1-only diagnostic that doesn't
  // ship to lender / board exports. Refactor candidates for a future
  // task; the export-reconciliation test (also Task #618) guards the
  // surfaces founders actually download.
  {
    file: "artifacts/api-server/src/routes/models.ts",
    pattern: "local-dscr-formula",
    line: 1834,
    reason: "Internal /models response field used by the dashboard; reconciles with canonical via cross-engine + parity tests. Refactor follow-up tracked separately (Task #618).",
  },
  {
    file: "artifacts/api-server/src/routes/admin.ts",
    pattern: "local-dscr-formula",
    line: 1405,
    reason: "Admin diagnostic endpoint, not part of lender / board exports (Task #618).",
  },
  {
    file: "artifacts/api-server/src/routes/admin.ts",
    pattern: "local-dscr-formula",
    line: 1487,
    reason: "Admin diagnostic endpoint, not part of lender / board exports (Task #618).",
  },
  {
    file: "artifacts/api-server/src/routes/public.ts",
    pattern: "local-dscr-formula",
    line: 222,
    reason: "Public preview endpoint surfaces a Y1 DSCR teaser; reconciliation test asserts the lender/board exports use canonical numbers (Task #618).",
  },
  {
    file: "artifacts/api-server/src/lib/review-request-data.ts",
    pattern: "local-dscr-formula",
    line: 80,
    reason: "Reviewer-request emailer payload; not surfaced in lender / board PDFs or workbooks (Task #618).",
  },
];

interface Violation {
  file: string;
  line: number;
  pattern: ForbiddenPattern;
  snippet: string;
}

/**
 * Repo-relative directories to scan. We deliberately exclude
 * `lib/finance/` (the canonical engine itself) and any test
 * directory — tests ARE allowed to inline these formulas to assert
 * canonical engine output.
 */
const SCAN_ROOTS = [
  "artifacts/api-server/src",
  "artifacts/school-financial-model/src",
  "lib/api-zod/src",
  "lib/api-client-react/src",
];

/** Path fragments that disqualify a file from scanning. */
const EXCLUDE_FRAGMENTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}tests${path.sep}`,
  `${path.sep}generated${path.sep}`,
  ".test.ts",
  ".test.tsx",
  ".d.ts",
];

function shouldScan(absPath: string): boolean {
  if (!absPath.endsWith(".ts") && !absPath.endsWith(".tsx")) return false;
  for (const frag of EXCLUDE_FRAGMENTS) {
    if (absPath.includes(frag)) return false;
  }
  return true;
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && shouldScan(full)) {
      out.push(full);
    }
  }
}

function scan(): Violation[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walk(path.join(REPO_ROOT, root), files);
  }
  const violations: Violation[] = [];
  for (const abs of files) {
    let body: string;
    try {
      body = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.re.test(line)) {
          violations.push({
            file: path.relative(REPO_ROOT, abs),
            line: i + 1,
            pattern,
            snippet: line.trim(),
          });
        }
      }
    }
  }
  return violations;
}

function main(): void {
  const violations = scan();
  const allowlistKey = (e: { file: string; pattern: string; line: number }) =>
    `${e.file}::${e.pattern}::${e.line}`;
  const allowed = new Set(KNOWN_VIOLATIONS.map(allowlistKey));

  const unexpected: Violation[] = [];
  const matchedAllowlist = new Set<string>();
  for (const v of violations) {
    const key = allowlistKey({ file: v.file, pattern: v.pattern.id, line: v.line });
    if (allowed.has(key)) {
      matchedAllowlist.add(key);
    } else {
      unexpected.push(v);
    }
  }

  const staleAllowlist = KNOWN_VIOLATIONS.filter(
    (e) => !matchedAllowlist.has(allowlistKey(e)),
  );

  if (unexpected.length === 0 && staleAllowlist.length === 0) {
    console.log(
      `Canonical-engine enforcement: ${violations.length} legacy occurrence(s) ` +
        `accounted for, no new drift detected.`,
    );
    process.exit(0);
  }

  console.error("\nCanonical-engine enforcement FAILED.\n");
  if (unexpected.length > 0) {
    console.error("New canonical-engine drift detected. Each finding below");
    console.error("computes a headline metric outside @workspace/finance:\n");
    for (const v of unexpected) {
      console.error(`  ${v.file}:${v.line}  [pattern=${v.pattern.id}]`);
      console.error(`    ${v.snippet}`);
      console.error(`    Fix: ${v.pattern.fix}\n`);
    }
  }
  if (staleAllowlist.length > 0) {
    console.error(
      "Stale entries in KNOWN_VIOLATIONS (file moved, line shifted, or",
    );
    console.error(
      "violation was already removed). Update or delete the entries below:\n",
    );
    for (const e of staleAllowlist) {
      console.error(
        `  ${e.file}:${e.line}  [pattern=${e.pattern}]  (no matching line found)`,
      );
    }
    console.error("");
  }
  process.exit(1);
}

main();
