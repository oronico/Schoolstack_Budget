/**
 * Task #923 — Status icon regression test.
 *
 * Asserts that no ASCII bullet placeholder (`[+]` / `[~]` / `[!]` / `[ ]`)
 * leaks into a rendered lender or board PDF, that the chosen Unicode glyphs
 * (✓ ⚠ ✕) appear where status indicators are expected, and that the legend
 * row is rendered above the first Health Dimensions table.
 *
 * Pattern C — phrase guard. Per the #923 addendum, this test is the explicit
 * regression assertion that lives alongside the per-packet text snapshots and
 * the consistency-harness `B7.empty-bullets` probe. The packet sweep covers
 * the three seeded demos AND the four founder-shaped fixtures, with each
 * fixture named in source so a future contributor can trace the scope:
 *
 *   Demos:   microschool, private_school, charter_school
 *   Fixtures: multi_debt_stack, restricted_gifts_heavy,
 *             capital_campaign_mid_cycle, voucher_scholarship_combo
 *
 * Sibling-bug sweep (also #923 addendum):
 *   $ grep -rohP "\[[+~!\*\?xo •\-]\]" --include="*.ts" \
 *       artifacts/api-server/src/lib/packets/ | sort -u
 *   → [*]   (array-index notation in a code comment; preserved as-is)
 * No other bracketed-placeholder pattern exists in the packet source tree,
 * so the four named placeholders are the complete regression scope.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:pdf-bullet-icons-923
 *
 * Hermetic: no DB, no network, no env vars.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { LENDER_PDF_FIXTURES } from "./fixtures/lender-pdf-fixtures.js";
import { extractPdfFragments } from "./_pdf-text-snapshot-util.js";

const FORBIDDEN = ["[+]", "[~]", "[!]", "[ ]"] as const;
const HEALTH_GLYPH = "\u2713"; // ✓
const WATCH_GLYPH = "\u26A0"; // ⚠
const CRITICAL_GLYPH = "\u2715"; // ✕

interface Case {
  label: string;
  kind: "demo" | "fixture";
  data: unknown;
}

const CASES: Case[] = [
  { label: "microschool", kind: "demo", data: MICROSCHOOL_MODEL.data },
  { label: "private_school", kind: "demo", data: PRIVATE_SCHOOL_MODEL.data },
  { label: "charter_school", kind: "demo", data: CHARTER_SCHOOL_MODEL.data },
  ...LENDER_PDF_FIXTURES.map((f) => ({
    label: f.label,
    kind: "fixture" as const,
    data: f.data,
  })),
];

// Sanity check: the four founder fixtures the addendum names must all be
// covered. Failing here means LENDER_PDF_FIXTURES was reshuffled without
// updating this regression test.
const REQUIRED_FIXTURES = [
  "multi_debt_stack",
  "restricted_gifts_heavy",
  "capital_campaign_mid_cycle",
  "voucher_scholarship_combo",
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? `\n${detail}` : ""}`);
  }
}

function findForbidden(joined: string): string | null {
  for (const token of FORBIDDEN) {
    if (joined.includes(token)) return token;
  }
  return null;
}

async function renderLender(data: unknown): Promise<string[]> {
  const consultant = await runConsultantEngine(data as Parameters<typeof runConsultantEngine>[0]);
  const packet = buildLenderPacket(
    data as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
  const pdf = await generateLenderPacketPDF(packet);
  return extractPdfFragments(pdf);
}

async function renderBoard(data: unknown): Promise<string[]> {
  const consultant = await runConsultantEngine(data as Parameters<typeof runConsultantEngine>[0]);
  const packet = buildBoardPacket(
    data as Parameters<typeof buildBoardPacket>[0],
    consultant,
    0,
  );
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
  const pdf = await generateBoardPacketPDF(packet);
  return extractPdfFragments(pdf);
}

async function runOne(c: Case): Promise<void> {
  for (const packetKind of ["lender", "board"] as const) {
    const fragments =
      packetKind === "lender" ? await renderLender(c.data) : await renderBoard(c.data);
    const joined = fragments.join("\n");

    const found = findForbidden(joined);
    check(
      `${packetKind}/${c.label}: no ASCII bullet placeholder`,
      found === null,
      found
        ? `    Status icon regression in ${packetKind} at ${c.label}: ` +
          `found placeholder '${found}' — every status indicator must route through ` +
          `renderStatusIcon() in pdf-utils.ts (Task #923).`
        : "",
    );

    // Every packet shows at least one healthy + one critical-or-watch metric
    // because the consultant engine always populates the Health Dimensions
    // table with a mix of statuses across the seven assessed dimensions.
    check(
      `${packetKind}/${c.label}: ✓ glyph present`,
      joined.includes(HEALTH_GLYPH),
      `    expected Unicode '✓' (U+2713) somewhere in the rendered PDF`,
    );
    const hasWatchOrCritical = joined.includes(WATCH_GLYPH) || joined.includes(CRITICAL_GLYPH);
    check(
      `${packetKind}/${c.label}: ⚠ or ✕ glyph present`,
      hasWatchOrCritical,
      `    expected at least one '⚠' (U+26A0) or '✕' (U+2715) glyph`,
    );

    // Legend row above the first Health Dimensions table — both packet
    // types render a Health Dimensions table, so both must carry the legend.
    // #923 addendum — neutral metrics must render with NO glyph (empty
    // string), not a space-prefixed label. A space-only prefix would leak
    // through here as a fragment that starts with " " before the metric
    // label, which is what the lender `neutralIcon: " "` override used to
    // produce. Assert no fragment starts with the space-glyph pattern.
    const spacePrefixed = fragments.find((f) => /^ [A-Za-z]/.test(f));
    check(
      `${packetKind}/${c.label}: neutral metrics emit no space-glyph prefix`,
      spacePrefixed === undefined,
      spacePrefixed
        ? `    Status icon regression in ${packetKind} at ${c.label}: ` +
          `fragment '${spacePrefixed}' starts with a space — neutral rows must use STATUS_ICON.neutral (empty) per #923 addendum Option A.`
        : "",
    );

    check(
      `${packetKind}/${c.label}: status-icon legend row present`,
      joined.includes("Legend:") &&
        joined.includes(HEALTH_GLYPH) &&
        joined.includes(WATCH_GLYPH) &&
        joined.includes(CRITICAL_GLYPH),
      `    expected a "Legend: ✓ Healthy ⚠ Watch closely ✕ Critical" row above the Health Dimensions table`,
    );
  }
}

async function main(): Promise<void> {
  for (const f of REQUIRED_FIXTURES) {
    check(
      `fixture coverage: ${f}`,
      CASES.some((c) => c.label === f),
      `    LENDER_PDF_FIXTURES is missing the '${f}' founder fixture named in the #923 addendum.`,
    );
  }

  for (const c of CASES) {
    try {
      await runOne(c);
    } catch (err) {
      failed++;
      failures.push(`  FAIL: ${c.label} threw: ${(err as Error).message}`);
    }
  }

  if (failed > 0) {
    console.error(failures.join("\n"));
  }
  console.log(`pdf-bullet-icons-923: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("pdf-bullet-icons-923: unexpected error", err);
  process.exit(1);
});
