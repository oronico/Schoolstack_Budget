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
  { label: "underwriting packet", re: /underwriting\s+packet/i },
  { label: "underwriting workbook", re: /underwriting\s+workbook/i },
  { label: '"Underwriting Model workbook"', re: /Underwriting\s+Model\s+workbook/i },
  { label: "approval packet", re: /approval\s+packet/i },
  { label: "loan approval packet", re: /loan\s+approval\s+packet/i },
  { label: "loan approval", re: /loan\s+approval/i, extraAllowlist: ["pages/underwriting.tsx"] },
  { label: "borrower approval", re: /borrower\s+approval/i },
  { label: "bank review", re: /bank\s+review/i },
  // "Rejection / rejected" — the Replit-managed conflict banner uses
  // "rejected with a 409" in a code comment (stripped) and the unhandled
  // promise rejection handler is a JS API name (allowlisted).
  {
    label: '"rejected" (literal)',
    re: /\brejected\b/i,
    extraAllowlist: [
      // PromiseRejectionEvent / mockRejectedValueOnce are JS API names.
      "lib/error-reporter.ts",
      "components/coaching/__tests__/FounderPersonaPrompt.test.tsx",
    ],
  },
  {
    label: '"rejection" (literal)',
    re: /\brejection\b/i,
    extraAllowlist: [
      // window.onunhandledrejection is the standard browser API name.
      "lib/error-reporter.ts",
    ],
  },
  // Task #676 — verdict-style "passed / failed / pass / fail" usage on the
  // founder's plan, application, model, or workbook is banned. The literal
  // words "pass(ed)" / "fail" appear all over the codebase in legitimate
  // contexts (pass-through taxes, "first pass", "fail loudly" test
  // narration, the LendingLabCard internal status keys, descriptive prose
  // like "schools can fail if they run out of cash"), so the ban is
  // scoped to verdict patterns.
  {
    label: '"passed/failed" as a verdict on the founder, plan, model or application',
    re: /\b(you|your|the)\s+(model|plan|application|school|budget|workbook|submission|package|packet|review)\s+(have\s+|has\s+|did\s+not\s+|didn't\s+)?(pass(ed)?|fail(ed)?)\b/i,
    extraAllowlist: [
      // Internal lender-reviewer screen — out of scope per task #655 / #676.
      "pages/underwriting.tsx",
    ],
  },
  {
    label: '"passed/failed" the underwriting / credit / lender review',
    re: /\b(pass(ed)?|fail(ed)?)\s+(the\s+)?(underwriting|credit\s+review|lender\s+review|loan\s+review|approval|application)\b/i,
  },
  {
    label: '"pass/fail verdict"',
    re: /\b(pass|fail)\s+(verdict|determination|decision)\b/i,
  },
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

// Task #676 — the five canonical export labels every founder-facing surface
// must use, and the canonical filename pattern those exports must download
// under (the leading `SchoolName_` prefix is verified separately in
// ExportStep tests, since the school name is dynamic).
const CANONICAL_EXPORT_LABELS = [
  "Founder Planning Workbook",
  "1-Year Operating Budget",
  "5-Year Financial Model",
  "Board and Funder Summary",
  "Lender Conversation Snapshot",
];

const CANONICAL_FILENAME_TOKENS = [
  "Founder_Planning_Workbook",
  "1-Year_Operating_Budget",
  "5-Year_Financial_Model",
  "Board_and_Funder_Summary",
  "Lender_Conversation_Snapshot",
];

const EXPORT_STEP_PATH = join(SRC_ROOT, "pages/model-wizard/steps/ExportStep.tsx");

// Other founder-facing surfaces that name the canonical exports. Each entry
// asserts the surface uses at least one canonical label (the specific labels
// vary — e.g. the lender preview only references "Lender Conversation
// Snapshot") and uses no deprecated label.
const CANONICAL_LABEL_SURFACES: Array<{ path: string; mustContain: string[] }> = [
  {
    path: "pages/model-wizard/steps/ExportStep.tsx",
    mustContain: CANONICAL_EXPORT_LABELS,
  },
  {
    path: "components/export/LenderPacketPreview.tsx",
    mustContain: ["Lender Conversation Snapshot"],
  },
  {
    path: "components/export/BoardPacketPreview.tsx",
    mustContain: ["Board and Funder Summary"],
  },
  {
    path: "components/wizard/ExtendToFiveYearModal.tsx",
    mustContain: [
      "Lender Conversation Snapshot",
      "Board and Funder Summary",
      "5-Year Financial Model",
    ],
  },
  {
    path: "pages/landing.tsx",
    mustContain: [
      "Lender Conversation Snapshot",
      "Board and Funder Summary",
      "Founder Planning Workbook",
      "5-Year Financial Model",
    ],
  },
];

const DEPRECATED_LABEL_TOKENS = [
  "Underwriting Workbook",
  "Underwriting Package",
  "Underwriting Packet",
  "Lender Packet",
  "Lender-Ready Packet",
  "Bank Packet",
  "Credit Memo",
  "Loan Approval Packet",
  "Formula Workbook",
  "Budget Workbook",
];

const DEPRECATED_FILENAME_TOKENS = [
  "Underwriting_Model.xlsx",
  "Underwriting_Workbook.xlsx",
  "Credit_Memo.pdf",
  "Loan_Approval_Packet.pdf",
  "Bank_Packet.xlsx",
  "Budget_Workbook.xlsx",
  "Single-Year_Export.xlsx",
];

describe("founder voice — canonical export labels & filenames", () => {
  it("ExportStep renders each of the five canonical labels", () => {
    const src = readFileSync(EXPORT_STEP_PATH, "utf8");
    for (const label of CANONICAL_EXPORT_LABELS) {
      expect(src, `ExportStep is missing canonical label "${label}"`).toContain(label);
    }
  });

  it("ExportStep download filenames use the five canonical filename tokens", () => {
    const src = readFileSync(EXPORT_STEP_PATH, "utf8");
    for (const token of CANONICAL_FILENAME_TOKENS) {
      expect(src, `ExportStep is missing canonical filename token "${token}"`).toContain(token);
    }
  });

  it("ExportStep falls back to the SchoolName_<token>.<ext> filename pattern", () => {
    const src = readFileSync(EXPORT_STEP_PATH, "utf8");
    // The fallback derives the school name from the wizard form context and
    // prefixes every canonical filename token with `${safeSchoolName}_`.
    expect(src).toMatch(/safeSchoolName/);
    expect(src).toMatch(/\$\{safeSchoolName\}_1-Year_Operating_Budget\.xlsx/);
    expect(src).toMatch(/\$\{safeSchoolName\}_5-Year_Financial_Model\.xlsx/);
    expect(src).toMatch(/\$\{safeSchoolName\}_Founder_Planning_Workbook\.xlsx/);
    expect(src).toMatch(/\$\{safeSchoolName\}_Lender_Conversation_Snapshot\.pdf/);
    expect(src).toMatch(/\$\{safeSchoolName\}_Board_and_Funder_Summary\.pdf/);
  });

  it("ExportStep does not use deprecated filename tokens", () => {
    const src = readFileSync(EXPORT_STEP_PATH, "utf8");
    for (const banned of DEPRECATED_FILENAME_TOKENS) {
      expect(src, `ExportStep should not use deprecated filename "${banned}"`).not.toContain(banned);
    }
  });

  it.each(CANONICAL_LABEL_SURFACES)(
    "$path uses the canonical export labels and no deprecated label",
    ({ path, mustContain }) => {
      const src = readFileSync(join(SRC_ROOT, path), "utf8");
      for (const label of mustContain) {
        expect(src, `${path} is missing canonical label "${label}"`).toContain(label);
      }
      for (const banned of DEPRECATED_LABEL_TOKENS) {
        expect(
          src,
          `${path} must not use deprecated export label "${banned}"`,
        ).not.toContain(banned);
      }
    },
  );
});

// Task #727 — cross-package guard. The api-server emits founder-visible
// strings inside PDF cover titles, Excel sheet/cell values, download
// filenames, and 5xx error bodies. Make sure none of the deprecated
// export labels or banned credit-verdict phrases leak through those
// render paths. Internal demo-generation scripts and code comments are
// out of scope (allowlisted by file).
const API_SERVER_ROOT = join(SRC_ROOT, "../../api-server/src");
const API_SERVER_FOUNDER_FACING_FILES = [
  "lib/packets/lender-summary-pdf.ts",
  "lib/packets/lender-packet-pdf.ts",
  "lib/packets/board-packet-pdf.ts",
  "lib/packets/packet-types.ts",
  "lib/underwriting-workbook.ts",
  "lib/underwriting-export.ts",
  "lib/lender-proforma-export.ts",
  "lib/pdf-proforma.ts",
  "lib/formula-export.ts",
  "routes/models.ts",
  "routes/public.ts",
];

const API_SERVER_BANNED_TOKENS = [
  "Underwriting Snapshot",
  "Underwriting Workbook",
  "Underwriting Package",
  "Underwriting Packet",
  "Underwriting Pro Forma",
  "Underwriting_Pro_Forma",
  "Credit Memo",
  "Loan Approval Packet",
  "Approval Packet",
  "Bank Packet",
  "Lender-Ready Packet",
];

describe("founder voice — api-server founder-visible exports", () => {
  it.each(API_SERVER_FOUNDER_FACING_FILES)(
    "%s contains no deprecated export label or banned credit-verdict phrase",
    (rel) => {
      const stripped = stripComments(readFileSync(join(API_SERVER_ROOT, rel), "utf8"));
      for (const banned of API_SERVER_BANNED_TOKENS) {
        expect(
          stripped,
          `api-server/src/${rel} must not emit "${banned}" — it leaks into ` +
            `PDF/Excel render output, download filenames, or 5xx error ` +
            `bodies. See docs/FOUNDER_VOICE.md for the approved vocabulary.`,
        ).not.toContain(banned);
      }
    },
  );
});

// Task #706 — Consultant view must render the brief's seven coaching
// sections in order, and the Lender Narrative step must surface editable
// Board / Grant / Lender drafts framed as "draft from your model — edit
// before sending".
const CONSULTANT_VIEW_PATH = join(
  SRC_ROOT,
  "components/consultant/ConsultantAnalysisView.tsx",
);
const NARRATIVE_STEP_PATH = join(
  SRC_ROOT,
  "pages/model-wizard/steps/NarrativeStep.tsx",
);

const BRIEF_SECTION_TITLES = [
  "What your model says",
  "What looks strong",
  "What needs more clarity",
  "What could create cash pressure",
  "What to fix first",
  "What someone reviewing this may ask",
  "Suggested next steps before sharing externally",
];

describe("founder voice — Task #706 polish-sprint phases 13-15", () => {
  it("ConsultantAnalysisView renders the seven brief-mandated section titles", () => {
    const src = readFileSync(CONSULTANT_VIEW_PATH, "utf8");
    for (const title of BRIEF_SECTION_TITLES) {
      expect(
        src,
        `ConsultantAnalysisView is missing brief section title "${title}"`,
      ).toContain(title);
    }
  });

  it("ConsultantAnalysisView mounts the seven sections in brief order", () => {
    const src = readFileSync(CONSULTANT_VIEW_PATH, "utf8");
    let cursor = 0;
    for (const title of BRIEF_SECTION_TITLES) {
      const idx = src.indexOf(title, cursor);
      expect(
        idx,
        `Section title "${title}" should appear after the previous one`,
      ).toBeGreaterThan(-1);
      cursor = idx + title.length;
    }
  });

  it("ConsultantAnalysisView mounts seven numbered SectionBand markers", () => {
    const src = readFileSync(CONSULTANT_VIEW_PATH, "utf8");
    for (let n = 1; n <= 7; n += 1) {
      expect(
        src,
        `ConsultantAnalysisView is missing SectionBand number={${n}}`,
      ).toContain(`number={${n}}`);
    }
  });

  it("NarrativeStep renders editable Board, Grant, and Lender draft cards", () => {
    const src = readFileSync(NARRATIVE_STEP_PATH, "utf8");
    expect(src).toContain("Board narrative");
    expect(src).toContain("Grant narrative");
    expect(src).toContain("Lender narrative");
    expect(src).toContain("audience-draft-textarea-");
    expect(src).toMatch(/AudienceDraftsSection/);
    expect(src).toMatch(/"board"[\s\S]{0,200}"grant"[\s\S]{0,200}"lender"/);
  });

  it("NarrativeStep frames audience drafts with the brief's edit-before-sending language", () => {
    const src = readFileSync(NARRATIVE_STEP_PATH, "utf8");
    expect(src).toContain("draft from your model");
    expect(src).toContain("edit before sending");
  });
});

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
