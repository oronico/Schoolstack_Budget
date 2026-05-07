import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const SRC_ROOT = join(__dirname, "..");

type BannedPattern = {
  label: string;
  re: RegExp;
  // Per-pattern allowlist (relative paths under SRC_ROOT). Used for
  // literal judgment-word bans where a few non-founder-verdict files
  // (cookie consent, scenarios tracker, /underwriting reviewer screen,
  // generic JS error throws) legitimately use the word.
  extraAllowlist?: string[];
};

// Files where any banned word may appear (style guide, scenarios tracker,
// cookie consent, internal-only reviewer screens).
const GLOBAL_ALLOWLIST = new Set<string>([
  // Style guide / lint test itself enumerate the banned words as data.
  "__tests__/founder-voice.test.ts",
  // Cookie consent uses universal "Accept / Decline cookies" vocabulary.
  "components/CookieConsent.tsx",
  // Founder scenario tracker lets founders mark scenarios as
  // Pursued / Declined / On hold — a founder choice, not a credit verdict.
  "pages/scenarios/index.tsx",
  // Wizard schema documents the same scenario-tracker statuses.
  "pages/model-wizard/schema.ts",
  // Cookie consent storage uses "accepted" / "declined" as the consent value.
  "lib/analytics.ts",
]);

// Files where generic JS "throw new Error('… failed')" handling is fine —
// the word is a runtime-error label, not a founder-facing credit verdict.
const GENERIC_ERROR_FAILED_ALLOWLIST = [
  "components/NpsModal.tsx",
  "components/export/BoardPacketPreview.tsx",
  "components/export/LenderPacketPreview.tsx",
  "components/whatif/WhatIfDrawer.tsx",
  "pages/shared/SharedModelPage.tsx",
  "pages/model-wizard/index.tsx",
  "pages/model-wizard/steps/ExportStep.tsx",
  "pages/auth/reset-password.tsx",
  "pages/auth/register.tsx",
  "components/FeedbackWidget.tsx",
  "components/coaching/GuidanceModeSelector.tsx",
  // Admin console is an internal staff-only surface (out of scope for
  // founder voice). Throws "Failed to fetch …" runtime errors throughout.
  "pages/admin.tsx",
  // /underwriting is the internal lender-reviewer screen — out of scope
  // for founder-voice rewrites per task #655. It throws "Analysis failed"
  // / "Export failed" runtime errors.
  "pages/underwriting.tsx",
  // Test fixtures naming a scenario "(declined)" / asserting save-failure
  // strings are internal test surfaces.
  "lib/__tests__/forecast-accuracy.test.ts",
];

const BANNED_PATTERNS: BannedPattern[] = [
  { label: "underwriting decision", re: /underwriting\s+decision/i },
  { label: "credit decision", re: /credit\s+decision/i },
  { label: "bank determination", re: /bank\s+determination/i },
  { label: "credit memo", re: /credit\s+memo/i },
  { label: "underwriting file", re: /underwriting\s+file/i },
  { label: "approval packet", re: /approval\s+packet/i },
  { label: "bank review", re: /bank\s+review/i },
  // Literal judgment-word bans (per task #655). Allowlists below cover the
  // narrow non-founder-verdict contexts where these words legitimately
  // appear (cookie consent, scenarios tracker, /underwriting reviewer
  // screen, generic JS runtime-error throws, banking-glossary coaching
  // copy, test fixtures).
  { label: "ineligible", re: /\bineligible\b/i },
  { label: "pass/fail (only allowed in internal test names)", re: /\bpass\s*[\/]\s*fail\b/i },
  {
    label: '"approved" (literal)',
    re: /\bapproved\b/i,
    extraAllowlist: [
      // /underwriting is an internal lender-reviewer screen carrying a
      // PublicFundingApprovalStatus enum + an "Approved" select option.
      "pages/underwriting.tsx",
      // Coaching glossary uses standard banking term
      // "pre-approved line of credit" — industry vocabulary, not a
      // verdict applied to the founder.
      "lib/coaching/explainers.ts",
    ],
  },
  {
    label: '"declined" (literal)',
    re: /\bdeclined\b/i,
    extraAllowlist: [
      // Forecast-accuracy test fixtures mark scenarios as "declined"
      // (mirrors the founder-driven scenario tracker).
      "lib/__tests__/forecast-accuracy.test.ts",
    ],
  },
  {
    label: '"failed" (literal)',
    re: /\bfailed\b/i,
    extraAllowlist: GENERIC_ERROR_FAILED_ALLOWLIST,
  },
  { label: 'old export label "Lender-Ready Packet"', re: /Lender[-\s]Ready\s+Packets?/i },
  { label: 'old export label "Lender Packet" (incl. plural)', re: /\bLender\s+Packets?\b/i },
  { label: 'old export label "Board Summary" (incl. plural)', re: /\bBoard\s+Summar(?:y|ies)\b/i },
  { label: 'old export label "Board Packet" (incl. plural)', re: /\bBoard\s+Packets?\b/i },
  {
    label: 'old combined phrase "lender / board packet(s)"',
    re: /\b(?:lender|board)\s*[/&]\s*(?:lender|board)\s+packets?\b/i,
  },
  { label: 'old export label "Underwriting Package"', re: /\bUnderwriting\s+Package\b/i },
  { label: 'old export label "Underwriting Workbook"', re: /\bUnderwriting\s+Workbook\b/i },
  { label: 'old export label "Formula Workbook"', re: /\bFormula\s+Workbook\b/i },
  { label: 'old phrase "Public Underwriting Wizard"', re: /Public\s+Underwriting\s+Wizard/i },
];

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
      const perPattern = new Set(pattern.extraAllowlist ?? []);
      for (const file of files) {
        const rel = relative(SRC_ROOT, file).split(/[\\/]/).join("/");
        if (GLOBAL_ALLOWLIST.has(rel)) continue;
        if (perPattern.has(rel)) continue;
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
