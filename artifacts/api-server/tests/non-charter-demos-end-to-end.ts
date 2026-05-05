// Task #547 — End-to-end smoke test for the tuition-based
// (non-charter) demo models.
// Task #558 — extended to also exercise the Chesterton Academy demo,
// the fourth seeded demo (private_school schoolType, CSN founding-
// class shape) used by the chesterton-preview branch deploy.
//
// Task #545 added an end-to-end smoke test that loads
// `CHARTER_SCHOOL_MODEL` (the seeded `charter_public_funded` /
// per-pupil ADM demo) and runs it through `runConsultantEngine`,
// `generateWorkbook`, and `buildLenderPacket`. The other two seeded
// demo models — `MICROSCHOOL_MODEL` (Oakwood Learning Studio,
// `schoolType: microschool`) and `PRIVATE_SCHOOL_MODEL` (Riverside
// Christian Academy, `schoolType: private_school`), both on the
// `tuition_based` funding profile — never got the same coverage.
// A regression in the per-student tuition row driver, the private-
// school consultant branch (`isPrivate` block in
// `consultant-engine.ts:generateRecommendations`), or the
// microschool-specific recommendations would still slip through.
//
// This test loads each of those two payloads (the exact objects
// that get inserted into `financial_models` on a fresh preview env)
// and runs them through the same three downstream surfaces a
// reviewer would actually exercise:
//
//   1. `runConsultantEngine`  — must complete without throwing,
//      must produce non-zero year-1 tuition revenue (the whole
//      reason for the tuition-based demos), and must emit narrative
//      that reflects the school type — i.e. mentions tuition /
//      private / microschool guidance, NOT the charter / per-pupil
//      / ADM copy from the public-funding branch.
//   2. `generateWorkbook`     — underwriting workbook export.
//      Must complete without throwing and produce a non-trivial
//      xlsx blob (PK magic bytes).
//   3. `buildLenderPacket`    — lender PDF packet builder. Must
//      complete without throwing and produce a populated packet
//      with a `lenderReadiness` verdict.
//
// Hermetic: no DB, no network, no env vars required.

import {
  runConsultantEngine,
  computeYearFinancialsFromData,
} from "../src/lib/consultant-engine.js";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import {
  CHESTERTON_ACADEMY_MODEL,
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

interface DemoCase {
  // Human-readable label used in failure messages.
  label: string;
  // The exact seeded model object (name, schoolStage, fundingProfile, data).
  model: typeof MICROSCHOOL_MODEL;
  // Expected `schoolType` on `data.schoolProfile`, sanity-checked so a
  // refactor that flips the seed payload to a different type is caught
  // before the rest of this test gives a misleading result.
  expectedSchoolType: "microschool" | "private_school";
  // Substrings the consultant narrative MUST contain (lowercased) to
  // prove the engine engaged the right tuition-side branch.
  // A match against ANY of these passes the assertion — the wording in
  // `consultant-engine.ts` may shift across refactors, so we accept
  // any of the canonical phrases that come from the relevant branch.
  expectedNarrativeAny: string[];
}

const CASES: DemoCase[] = [
  {
    label: "microschool (Oakwood Learning Studio)",
    model: MICROSCHOOL_MODEL,
    expectedSchoolType: "microschool",
    // The `isMicroschool` block emits "Microschool Per-Student Revenue
    // Check" / "Microschool Staffing Efficiency". The `isPrivate` block
    // (microschools also satisfy `fundingProfile === "tuition_based"`)
    // emits "Strengthen Tuition Revenue Base" / "Plan for Tuition
    // Collection & Discount Risk". At least one of these phrases must
    // appear, otherwise neither tuition-side branch fired.
    expectedNarrativeAny: ["microschool", "tuition"],
  },
  {
    label: "private school (Riverside Christian Academy)",
    model: PRIVATE_SCHOOL_MODEL,
    expectedSchoolType: "private_school",
    // The `isPrivate` block always emits at least one of "Strengthen
    // Tuition Revenue Base" or "Plan for Tuition Collection & Discount
    // Risk" (the two predicates `< 0.6` and `> 0.5` together cover
    // every possible tuitionPct). "Private schools" appears in the
    // descriptions of both.
    expectedNarrativeAny: ["tuition", "private school"],
  },
  {
    // Task #558 — Chesterton Academy demo also runs through the
    // `isPrivate` consultant branch (it uses `schoolType:
    // "private_school"` so the consultant treats it as a private
    // school; the CSN flavor is in the input numbers, not the
    // narrative branch). Same expected substrings as Riverside.
    label: "chesterton academy (Chesterton Academy of Saint Edmund)",
    model: CHESTERTON_ACADEMY_MODEL,
    expectedSchoolType: "private_school",
    expectedNarrativeAny: ["tuition", "private school"],
  },
];

async function runCase(c: DemoCase): Promise<void> {
  const data = c.model.data as unknown as Record<string, unknown>;
  const sp = (data.schoolProfile as Record<string, unknown>) || {};

  // Sanity: the seed must still self-identify as the tuition-based,
  // non-charter school we wrote this test against. If a refactor
  // flips the funding profile to `charter_public_funded` (or anything
  // else), every later assertion below becomes meaningless — fail
  // loudly here instead.
  check(
    `[${c.label}] seed payload still uses fundingProfile=tuition_based`,
    c.model.fundingProfile === "tuition_based",
    `got=${c.model.fundingProfile}`,
  );
  check(
    `[${c.label}] seed payload still uses schoolType=${c.expectedSchoolType}`,
    sp.schoolType === c.expectedSchoolType,
    `got=${sp.schoolType}`,
  );
  // Both demos drive revenue off `revenueRows` with at least one
  // `per_student` tuition row. The point of the smoke test is to
  // exercise that driver, so confirm it's still present in the seed.
  const revenueRows = (data.revenueRows as Array<{
    enabled: boolean;
    category: string;
    driverType: string;
  }>) || [];
  check(
    `[${c.label}] seed payload still has an enabled per_student tuition row`,
    revenueRows.some(
      (r) =>
        r.enabled &&
        r.category === "tuition_and_fees" &&
        r.driverType === "per_student",
    ),
    `revenueRows=${revenueRows.length}`,
  );

  // ---- 1. Consultant engine -----------------------------------------------
  let consultant: Awaited<ReturnType<typeof runConsultantEngine>> | undefined;
  try {
    consultant = await runConsultantEngine(data);
    check(`[${c.label}] runConsultantEngine completes without throwing`, true);
  } catch (err) {
    check(
      `[${c.label}] runConsultantEngine completes without throwing`,
      false,
      err instanceof Error ? err.message : String(err),
    );
    // No point continuing — every later assertion needs `consultant`.
    return;
  }

  // Year-1 tuition revenue must be > 0. The whole reason for the
  // tuition-based demos is to exercise the per-student tuition path,
  // so a zero value means a regression in the per_student driver or
  // the `tuition_and_fees` category, not just a different forecast.
  const yearly = computeYearFinancialsFromData(data);
  const y1 = yearly[0];
  check(
    `[${c.label}] year-1 tuition revenue is non-zero`,
    !!y1 && y1.tuitionRevenue > 0,
    `tuitionRevenue=${y1?.tuitionRevenue ?? "(missing)"}`,
  );
  check(
    `[${c.label}] consultant.revenueComposition[0].tuitionPct > 0`,
    consultant.revenueComposition[0]?.tuitionPct > 0,
    `tuitionPct=${consultant.revenueComposition[0]?.tuitionPct}`,
  );
  // Counterpart: public/per-pupil revenue must be ZERO for these
  // tuition-based demos. If a regression starts routing tuition rows
  // through the public-funding category, the charter test would still
  // pass but these demos would silently look like charter schools.
  check(
    `[${c.label}] year-1 public-funding revenue is zero`,
    !!y1 && y1.publicRevenue === 0,
    `publicRevenue=${y1?.publicRevenue ?? "(missing)"}`,
  );

  // The consultant narrative must show tuition-branch-specific copy,
  // proving the engine engaged the right `isPrivate` / `isMicroschool`
  // path rather than silently defaulting elsewhere.
  //
  // Following the charter-test pattern: deliberately exclude
  // `executiveSummary` from this scan because the engine echoes the
  // school name into it, which could cause spurious matches (e.g.
  // "Riverside Christian Academy" contains "academy"). The
  // recommendations, key metrics, health signals, and enrollment
  // guidance are generated from the school-type-specific code paths
  // and are the right surfaces to check.
  const branchOnlyNarrative = [
    consultant.biggestStrength,
    consultant.biggestRisk,
    consultant.lenderReadinessExplanation,
    ...consultant.recommendations.map((r) => `${r.title}\n${r.description}`),
    ...consultant.healthSignals.map((s) => `${s.dimension}\n${s.explanation}`),
    ...consultant.enrollmentGuidance,
    ...consultant.keyMetrics.map((m) => `${m.name}\n${m.interpretation}`),
  ]
    .join("\n")
    .toLowerCase();
  check(
    `[${c.label}] consultant narrative uses tuition-branch language ` +
      `(any of: ${c.expectedNarrativeAny.join(", ")}) outside the executive summary`,
    c.expectedNarrativeAny.some((needle) =>
      branchOnlyNarrative.includes(needle),
    ),
    `narrative excerpt: ${branchOnlyNarrative.slice(0, 240).replace(/\s+/g, " ")}`,
  );

  // Stronger negative signal: NO charter-branch copy may appear in
  // the recommendation/health/metric narrative for a tuition-based
  // school. The charter recommendations all use the literal word
  // "charter" in their titles ("Verify Charter Funding Assumptions",
  // "Charter Funding Timing & Cash Flow Risk", etc.), and "ADM"
  // appears nowhere in the tuition copy. If either word leaks into
  // a tuition-based demo, the engine has misclassified the school.
  //
  // Note: the school *names* don't contain "charter" or "adm" so a
  // match here genuinely indicates a code-path regression, not a
  // coincidental name collision.
  check(
    `[${c.label}] consultant narrative does NOT use charter-only language`,
    !/\bcharter\b|\badm\b/.test(branchOnlyNarrative),
    `narrative excerpt: ${branchOnlyNarrative.slice(0, 240).replace(/\s+/g, " ")}`,
  );

  // ---- 2. Workbook export -------------------------------------------------
  let workbookBuffer: Buffer | undefined;
  try {
    workbookBuffer = await generateWorkbook(data);
    check(`[${c.label}] generateWorkbook completes without throwing`, true);
  } catch (err) {
    check(
      `[${c.label}] generateWorkbook completes without throwing`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  check(
    `[${c.label}] workbook buffer is a non-trivial xlsx blob`,
    !!workbookBuffer && workbookBuffer.length > 1000,
    `length=${workbookBuffer?.length ?? "(missing)"}`,
  );
  // xlsx files are zip-formatted and always start with the "PK\x03\x04"
  // local file header — a quick magic-bytes check that catches the
  // "we returned an empty/HTML buffer" class of regressions cheaply.
  check(
    `[${c.label}] workbook buffer has xlsx (PK) magic bytes`,
    !!workbookBuffer &&
      workbookBuffer[0] === 0x50 &&
      workbookBuffer[1] === 0x4b,
    `bytes=${workbookBuffer?.slice(0, 4).toString("hex")}`,
  );

  // ---- 3. Lender packet ---------------------------------------------------
  let lender: ReturnType<typeof buildLenderPacket> | undefined;
  try {
    lender = buildLenderPacket(
      data as unknown as ModelData,
      consultant,
      /* modelId */ 1,
      "comfortable",
    );
    check(`[${c.label}] buildLenderPacket completes without throwing`, true);
  } catch (err) {
    check(
      `[${c.label}] buildLenderPacket completes without throwing`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
  check(
    `[${c.label}] lender packet has at least one populated section`,
    !!lender && Array.isArray(lender.sections) && lender.sections.length > 0,
    `sections=${lender?.sections?.length ?? "(missing)"}`,
  );
  check(
    `[${c.label}] lender packet carries a lenderReadiness verdict`,
    !!lender &&
      typeof lender.lenderReadiness?.status === "string" &&
      lender.lenderReadiness.status.length > 0,
    `status=${lender?.lenderReadiness?.status ?? "(missing)"}`,
  );
}

// Task #558 — pin the canonical tuition-demo inventory size. The
// seeded preview environment has 4 demos total, of which 3 are
// tuition-based (microschool, private school, Chesterton academy)
// and 1 is charter (covered by tests/charter-demo-end-to-end.ts).
// If a future change drops or adds a tuition demo here without
// updating CASES, this guard fails loudly.
const EXPECTED_TUITION_CASES = 3;

async function run(): Promise<void> {
  check(
    `CASES contains exactly ${EXPECTED_TUITION_CASES} tuition demos`,
    CASES.length === EXPECTED_TUITION_CASES,
    `got=${CASES.length}`,
  );

  for (const c of CASES) {
    await runCase(c);
  }

  console.log(`\nnon-charter-demos-end-to-end: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
