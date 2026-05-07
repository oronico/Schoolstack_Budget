import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const SRC_ROOT = join(__dirname, "..");

const BANNED_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "underwriting decision", re: /underwriting\s+decision/i },
  { label: "credit decision", re: /credit\s+decision/i },
  { label: "bank determination", re: /bank\s+determination/i },
  { label: "credit memo", re: /credit\s+memo/i },
  { label: "underwriting file", re: /underwriting\s+file/i },
  { label: "approval packet", re: /approval\s+packet/i },
  { label: "bank review", re: /bank\s+review/i },
  { label: 'old export label "Lender-Ready Packet"', re: /Lender[-\s]Ready\s+Packet/i },
  { label: 'old export label "Lender Packet"', re: /\bLender\s+Packet\b/i },
  { label: 'old export label "Board Summary"', re: /\bBoard\s+Summary\b/i },
  { label: 'old export label "Board Packet"', re: /\bBoard\s+Packet\b/i },
  { label: 'old export label "Underwriting Package"', re: /\bUnderwriting\s+Package\b/i },
  { label: 'old export label "Underwriting Workbook"', re: /\bUnderwriting\s+Workbook\b/i },
  { label: 'old export label "Formula Workbook"', re: /\bFormula\s+Workbook\b/i },
  { label: 'old phrase "Public Underwriting Wizard"', re: /Public\s+Underwriting\s+Wizard/i },
];

const FILE_ALLOWLIST = new Set<string>([
  // Style guide / lint test itself enumerate the banned words as data.
  "__tests__/founder-voice.test.ts",
  // Cookie consent uses universal "Accept / Decline cookies" vocabulary.
  "components/CookieConsent.tsx",
  // Founder scenario tracker lets founders mark scenarios as
  // Pursued / Declined / On hold — a founder choice, not a credit verdict.
  "pages/scenarios/index.tsx",
  // Wizard schema documents the same scenario-tracker statuses in a comment.
  "pages/model-wizard/schema.ts",
  // Cookie consent storage uses "accepted" / "declined" as the consent value.
  "lib/analytics.ts",
]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
      out.push(...listFiles(full));
    } else if (st.isFile()) {
      const ext = extname(entry);
      if (ext === ".ts" || ext === ".tsx") {
        out.push(full);
      }
    }
  }
  return out;
}

// Strip block comments and line comments so banned wording in code comments
// (e.g. historical notes about Task #485) does not break the build.
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  return out;
}

describe("founder voice — no banned phrases on founder-facing surfaces", () => {
  const files = listFiles(SRC_ROOT);

  for (const pattern of BANNED_PATTERNS) {
    it(`does not use "${pattern.label}"`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const rel = relative(SRC_ROOT, file).split(/[\\/]/).join("/");
        if (FILE_ALLOWLIST.has(rel)) continue;
        const stripped = stripComments(readFileSync(file, "utf8"));
        if (pattern.re.test(stripped)) {
          offenders.push(rel);
        }
      }
      expect(
        offenders,
        `Founder-facing surfaces must not contain "${pattern.label}". ` +
          `See docs/FOUNDER_VOICE.md for the approved vocabulary. ` +
          `Offenders: ${offenders.join(", ")}`,
      ).toEqual([]);
    });
  }
});
