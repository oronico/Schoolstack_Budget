// Task #846 — CI guard against `NODE_TLS_REJECT_UNAUTHORIZED=0`.
//
// Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` (or programmatically
// `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`) tells Node to
// silently accept ANY TLS certificate, including expired,
// self-signed, or attacker-controlled ones. It is a one-line MitM
// vulnerability and the security scan flagged it as a class-of-bug
// to keep out of the codebase forever.
//
// This test walks the workspace and fails the build the moment any
// application or script file disables TLS verification. The check is
// intentionally conservative — it allows mentioning the env-var name
// in comments / docs / this very file, but rejects any line that
// actually assigns "0" / 0 / "false" to it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

// Task #846 — scan every directory that can carry executable config:
// application code (artifacts, packages), shell helpers (scripts),
// and CI definitions (.github/workflows + alternate CI engines like
// .circleci, .gitlab-ci, .buildkite). The CI dirs are explicitly
// included because a `NODE_TLS_REJECT_UNAUTHORIZED=0` line in a
// workflow YAML would silently disable cert verification for every
// test/deploy step run on CI — the security review called this out
// as a must-cover scope.
const SCAN_DIRS = [
  "artifacts",
  "packages",
  "scripts",
  ".github",
  ".circleci",
  ".gitlab-ci",
  ".buildkite",
];
const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sh",
  ".bash",
  ".zsh",
  ".env",
  ".yml",
  ".yaml",
  ".toml",
  ".dockerfile",
  ".json",
]);
const SCAN_FILENAMES = new Set([
  "Dockerfile",
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  ".env.development",
  "Makefile",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".local",
]);

// Self-exempt: this test file legitimately contains the env-var name
// (and example bypass strings) in code, so we never scan it.
const SELF_PATH = path.resolve(__filename);

// Match any of:
//   NODE_TLS_REJECT_UNAUTHORIZED=0
//   NODE_TLS_REJECT_UNAUTHORIZED = 0
//   NODE_TLS_REJECT_UNAUTHORIZED: "0"
//   process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
//   "NODE_TLS_REJECT_UNAUTHORIZED": "0"
// The "value" half is captured then sanity-checked separately so
// alternate spellings (false / "0" / 0 / no) all fail.
const ASSIGN_RE =
  /NODE_TLS_REJECT_UNAUTHORIZED["'\]]?\s*[:=]\s*['"]?([^'"\s,;}]+)/g;

const FORBIDDEN_VALUES = new Set(["0", "false", "no", "off"]);

interface Finding {
  file: string;
  line: number;
  text: string;
  value: string;
}

function shouldScanFile(filePath: string): boolean {
  if (filePath === SELF_PATH) return false;
  const base = path.basename(filePath);
  if (SCAN_FILENAMES.has(base)) return true;
  const ext = path.extname(filePath).toLowerCase();
  return SCAN_EXTS.has(ext);
}

function walk(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (shouldScanFile(full)) out.push(full);
    }
  }
}

function scanFile(filePath: string): Finding[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  if (!content.includes("NODE_TLS_REJECT_UNAUTHORIZED")) return [];

  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    ASSIGN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASSIGN_RE.exec(line)) !== null) {
      const value = m[1].toLowerCase().replace(/[)\]}]+$/, "");
      if (FORBIDDEN_VALUES.has(value)) {
        findings.push({
          file: filePath,
          line: i + 1,
          text: line.trim(),
          value,
        });
      }
    }
  }
  return findings;
}

const allFiles: string[] = [];
for (const dir of SCAN_DIRS) {
  const full = path.join(repoRoot, dir);
  try {
    if (statSync(full).isDirectory()) walk(full, allFiles);
  } catch {
    /* dir may not exist in all checkouts */
  }
}
// Also scan top-level config files at the repo root.
try {
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      const full = path.join(repoRoot, entry.name);
      if (shouldScanFile(full)) allFiles.push(full);
    }
  }
} catch {
  /* ignore */
}

const allFindings: Finding[] = [];
for (const f of allFiles) {
  for (const finding of scanFile(f)) allFindings.push(finding);
}

console.log(
  `\nno-tls-reject-unauthorized: scanned ${allFiles.length} files for NODE_TLS_REJECT_UNAUTHORIZED bypasses`,
);

if (allFindings.length === 0) {
  console.log("  ✓ no occurrences of NODE_TLS_REJECT_UNAUTHORIZED=0 found");
  process.exit(0);
}

console.error(
  `\n  ✗ Found ${allFindings.length} forbidden NODE_TLS_REJECT_UNAUTHORIZED bypass(es):`,
);
for (const f of allFindings) {
  const rel = path.relative(repoRoot, f.file);
  console.error(`    - ${rel}:${f.line}  (value=${f.value})`);
  console.error(`        ${f.text}`);
}
console.error(
  "\nDisabling TLS certificate verification is a one-line MitM vulnerability. " +
    "Use a properly trusted CA bundle, or pass a per-request `agent` with `rejectUnauthorized: false` " +
    "scoped to the single dev/test call site instead — never set the global env var.",
);
process.exit(1);
