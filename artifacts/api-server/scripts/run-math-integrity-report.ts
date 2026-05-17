/**
 * Task #930 / M4 — Math Integrity Report + Triage.
 *
 * Composes:
 *   - M1 registry (lib/finance/src/registry/canonical-metrics.ts) — the
 *     32 metrics, units, tolerances, and declared surfaces.
 *   - M2 extractors (src/lib/integrity/extract/) — used for surface
 *     coverage diagnostics (extra-value scan).
 *   - M3 canonical compute (src/lib/integrity/canonical/) — the single
 *     source-of-truth value per persona for every registered metric.
 *
 * For each persona fixture (Oakwood / Riverside / Liberty) the harness:
 *   1. Runs the consultant engine.
 *   2. Builds the lender packet, board packet, narrative bundle.
 *   3. Computes the canonical value of every metric (M3).
 *   4. For every registered metric × every surface the registry lists,
 *      reads the value out of the rendered surface at its declared
 *      location and compares it to the canonical value using the
 *      registry's per-metric tolerance.
 *   5. Triages each finding into one of:
 *        - pass                       value within tolerance
 *        - drift                      value finite but outside tolerance
 *        - missing                    surface read returned null/undefined
 *        - skipped-structural         text/enum metric, exact compare ok
 *        - unresolved                 surface has no explicit reader yet
 *      Findings that match a known calc bug are tagged with the
 *      blocker task id in `triage` notes.
 *
 * Outputs:
 *   - artifacts/api-server/reports/math-integrity-report.md
 *   - artifacts/api-server/reports/math-integrity-report.csv
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     ./scripts/run-math-integrity-report.ts
 *
 * Exit code is 1 when any unresolved discrepancy remains in the report
 * (zero unresolved is the M4 acceptance bar).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_METRICS,
  type CanonicalMetric,
  type MetricTolerance,
} from "@workspace/finance";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import {
  buildLenderPacket,
  type LenderPacket,
} from "../src/lib/packets/build-lender-packet.js";
import {
  buildBoardPacket,
  type BoardPacket,
} from "../src/lib/packets/build-board-packet.js";
import {
  buildNarrativeBundle,
  type NarrativeSourceBundle,
} from "../src/lib/packets/build-narrative-commentary.js";
import {
  loadPersonaFixturesAsync,
  type PersonaFixture,
} from "../src/lib/integrity/canonical/fixtures.js";
import { computeCanonicalValues } from "../src/lib/integrity/canonical/compute.js";
import type { ConsultantOutput } from "../src/lib/consultant-engine.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { extractJsonExport } from "../src/lib/integrity/extract/index.js";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type Severity =
  | "pass"
  | "drift"
  | "missing"
  | "unresolved"
  | "skipped-structural";

interface SurfaceContext {
  persona: PersonaFixture;
  consultant: ConsultantOutput;
  lenderPacket: LenderPacket;
  boardPacket: BoardPacket;
  narrativeBundle: NarrativeSourceBundle;
  modelData: ModelData;
  /** The canonical value resolved by M3 for this metric/persona. */
  canonical: unknown;
}

type SurfaceValue = number | string | null | undefined;

interface SurfaceReader {
  /** Stable surface identifier — keyed to a registry surface entry. */
  surface: string;
  /** Human-readable location on that surface (used in report). */
  location: string;
  read: (ctx: SurfaceContext) => SurfaceValue | SurfaceValue[];
  /**
   * If set, the reader is intentionally a no-op for this surface — the
   * canonical value is composite/aggregate and the surface only renders
   * a derived/related figure already diffed elsewhere. The string is
   * the triage rationale; the row is classified `skipped-structural`.
   */
  intentionalSkip?: string;
  /**
   * Optional projection of the canonical value into the shape this
   * reader produces. Default: identity (passed through `canonicalReadable`).
   * Use this when the canonical is an array but the reader sees only one
   * element (e.g. narrative bundle exposes Y1-only of a 5-year series).
   */
  projectCanonical?: (canonical: unknown) => SurfaceValue | SurfaceValue[];
}

interface Finding {
  metricId: string;
  category: string;
  unit: string;
  persona: string;
  surface: string;
  location: string;
  extracted: string;
  canonical: string;
  deltaAbs: string;
  deltaRel: string;
  toleranceAbs: string;
  toleranceRel: string;
  severity: Severity;
  triage: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Comparator
// ─────────────────────────────────────────────────────────────────────────

function withinTolerance(
  extracted: number,
  canonical: number,
  tol: MetricTolerance,
): boolean {
  const diff = Math.abs(extracted - canonical);
  if (typeof tol.abs === "number" && diff <= tol.abs) return true;
  if (
    typeof tol.rel === "number" &&
    canonical !== 0 &&
    diff / Math.abs(canonical) <= tol.rel
  ) {
    return true;
  }
  // Exact-match fallback when neither bound matches a zero canonical
  if (
    diff === 0 &&
    (typeof tol.abs === "number" || typeof tol.rel === "number")
  ) {
    return true;
  }
  return false;
}

function formatNumber(n: number, unit: string): string {
  if (!Number.isFinite(n)) return String(n);
  if (unit === "usd") return n.toFixed(0);
  if (unit === "pct") return n.toFixed(2);
  if (unit === "ratio") return n.toFixed(3);
  if (unit === "months") return n.toFixed(2);
  return String(n);
}

function fmt(v: SurfaceValue, unit: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return formatNumber(v, unit);
  return JSON.stringify(v);
}

// ─────────────────────────────────────────────────────────────────────────
// Coverage tables
// ─────────────────────────────────────────────────────────────────────────
//
// The harness drives coverage from `metric.surfaces[]` on the registry
// (the canonical source of which surfaces SHOULD agree on each metric).
// For each declared surface the harness asks:
//
//   1. Do I have a typed-shape reader at `TYPED_READERS_BY_SURFACE`
//      keyed by (metricId, surfacePath)? If yes, run it and diff.
//   2. Otherwise, is there a declared structural-skip note at
//      `STRUCTURAL_SKIPS_BY_PATH[path]` explaining how that surface is
//      covered by another mechanism (snapshot test, prop pass-through,
//      pure formatter)? If yes, emit `skipped-structural` with the note.
//   3. Otherwise emit `unresolved` — the report fails until a reader or
//      a structural-skip note is added.
//
// This guarantees the report denominator is the FULL set of registry
// surfaces, so "zero unresolved" is a meaningful acceptance signal.
//
// `SUPPLEMENTAL_READERS` (below the surface table) are additional
// typed-shape canonical re-flow checks that exercise consultant-engine
// fields directly (not declared as their own surface in the registry —
// those fields ARE the canonical) so any future refactor that
// accidentally short-circuits the canonical source is caught.

/**
 * Surfaces that exist in the registry but cannot be diffed against the
 * canonical value at the typed-shape layer (React components reading
 * props, pre-formatted PacketSection rows, pure formatter helpers,
 * wizard UI driven off the persona-independent ASSUMPTION_REGISTRY).
 * The string value is the triage note explaining how the surface IS
 * covered today, so a reviewer can audit the rationale.
 */
const STRUCTURAL_SKIPS_BY_PATH: Record<string, string> = {
  "artifacts/api-server/src/lib/packets/build-packet-data.ts":
    "PacketSection rows are pre-formatted strings (via FigureScribe formatters). Underlying number flows from the same consultant-engine field the canonical resolver reads; covered by build-packet-data tests + canonical-engine-enforcement test. The corresponding consultant-engine field IS diffed via the SUPPLEMENTAL_READERS canonical re-flow section.",
  "artifacts/api-server/src/lib/packets/format-runway.ts":
    "Pure formatter helper (formatRunwayMonths). Numeric input flows from consultant.cashRunwayMonths, which IS diffed by the SUPPLEMENTAL_READERS canonical re-flow section. Covered by test:format-runway.",
  "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx":
    "React component reads `consultant.*` props directly — same canonical source as the resolver. No engine logic in the renderer; visual layer covered by wizard-preview-matches-pdf and the component-state extractor.",
  "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx":
    "React preview renders `lenderPacket` props verbatim (same payload diffed at the typed-shape layer). Visual parity covered by wizard-preview-matches-pdf test.",
  "artifacts/school-financial-model/src/components/export/BoardPacketPreview.tsx":
    "React preview renders `boardPacket` props verbatim. Visual parity covered by test:board-pdf-text-snapshot + wizard-preview-matches-pdf.",
  "artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx":
    "Wizard UI drives the persona-independent ASSUMPTION_REGISTRY (cap denominator). Per-persona numeric diff is not meaningful; the registry catalog is asserted by lender-readiness-cap tests.",
  "artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceRollupCard.tsx":
    "Same as AssumptionConfidenceCard — rollup card over persona-independent catalog.",
};

/**
 * Per-(metric, surface) typed-shape readers. Keyed by a composite
 * `${metricId}::${path}` so the registry surface and the reader are
 * unambiguously paired. Each entry yields one or more readers (a single
 * surface can have multiple co-located reads — e.g. lender-readiness on
 * `build-lender-packet.ts` has both `status` and `result.uncappedRating`
 * to diff against the same canonical).
 */
const TYPED_READERS_BY_SURFACE: Record<string, SurfaceReader[]> = {
  // build-narrative-commentary.ts — every metric the bundle exposes
  "revenue-total-year::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.revenue-flow",
        location: "narrativeBundle (commentary base-case figures)",
        read: () => null,
        intentionalSkip:
          "NarrativeSourceBundle does not expose the raw 5-year revenue array — only derived figures (troughEndingCash, breakEvenYear, etc.) that feed prose. The underlying consultant.revenue array IS diffed by the SUPPLEMENTAL_READERS canonical re-flow section. Bundle figures derived FROM revenue are diffed by their own metric rows.",
      },
    ],
  "revenue-quality-by-bucket::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.revenueQualityY1",
        location: "narrativeBundle.revenueQualityY1.{contractedPct|projectedPct|donorDependentPct|policyDependentPct} (×100)",
        read: ({ narrativeBundle }) => {
          const r = narrativeBundle.revenueQualityY1;
          if (!r) return null;
          // Sum of buckets ÷ 100 to compare against canonical fraction sum.
          return (
            ((r.contractedPct ?? 0) +
              (r.projectedPct ?? 0) +
              (r.donorDependentPct ?? 0) +
              (r.policyDependentPct ?? 0)) /
            100
          );
        },
      },
    ],
  "cash-runway-months::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.cashRunwayMonths",
        location: "narrativeBundle.cashRunwayMonths",
        read: ({ narrativeBundle }) => narrativeBundle.cashRunwayMonths,
      },
    ],
  "cash-trough-ending-cash::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.troughEndingCash",
        location: "narrativeBundle.troughEndingCash",
        read: ({ narrativeBundle }) => narrativeBundle.troughEndingCash,
      },
    ],
  "reserve-months-last-year::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.reserveMonthsLastYear",
        location: "narrativeBundle.reserveMonthsLastYear",
        read: ({ narrativeBundle }) => narrativeBundle.reserveMonthsLastYear,
      },
    ],
  "dscr-year-series-normalized::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.dscrY1Normalized",
        location: "narrativeBundle.dscrY1Normalized (compared to canonical[0])",
        read: ({ narrativeBundle }) => narrativeBundle.dscrY1Normalized,
        // Bundle surfaces only Y1; project canonical 5-year array to its first element.
        projectCanonical: (canonical) =>
          Array.isArray(canonical)
            ? ((canonical as SurfaceValue[])[0] ?? null)
            : null,
      },
    ],
  "dscr-min-normalized::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.dscrMinNormalized",
        location: "narrativeBundle.dscrMinNormalized",
        read: ({ narrativeBundle }) => narrativeBundle.dscrMinNormalized,
      },
    ],
  "break-even-year::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.breakEvenYear",
        location: "narrativeBundle.breakEvenYear",
        read: ({ narrativeBundle }) => narrativeBundle.breakEvenYear,
      },
    ],
  "break-even-students-y1::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.breakEvenStudentsY1",
        location: "narrativeBundle.breakEvenStudentsY1",
        read: ({ narrativeBundle }) => narrativeBundle.breakEvenStudentsY1,
      },
    ],
  "stress-scenario-net-income::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.negativeY5StressScenarios (count proxy)",
        location: "narrativeBundle.negativeY5StressScenarios.length (drives lender closing paragraph)",
        read: () => null,
        intentionalSkip:
          "Surface only exposes count + names of failing scenarios, not the per-scenario netIncome series (canonical is `co.lenderStressTests.scenarios[*].netIncome`). The count is diffed by the `stress-negative-y5-scenarios` row; per-scenario netIncome is covered by lender-stress-section-snapshot.",
      },
    ],
  "stress-worst-scenario::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.worstStress.name",
        location: "narrativeBundle.worstStress.name",
        read: ({ narrativeBundle }) => narrativeBundle.worstStress?.name ?? null,
      },
    ],
  "stress-negative-y5-scenarios::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.negativeY5StressScenarios.length",
        location: "narrativeBundle.negativeY5StressScenarios.length",
        read: ({ narrativeBundle }) =>
          narrativeBundle.negativeY5StressScenarios.length,
      },
    ],
  "founder-comp-adjustment::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.founderCompTotalDelta",
        location: "narrativeBundle.founderCompTotalDelta",
        read: ({ narrativeBundle }) => narrativeBundle.founderCompTotalDelta,
      },
    ],
  "biggest-strength::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.biggestStrength",
        location: "narrativeBundle.biggestStrength",
        read: ({ narrativeBundle }) => narrativeBundle.biggestStrength,
      },
    ],
  "biggest-risk::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle.biggestRisk",
        location: "narrativeBundle.biggestRisk",
        read: ({ narrativeBundle }) => narrativeBundle.biggestRisk,
      },
    ],
  "narrative-commentary-bundle::artifacts/api-server/src/lib/packets/build-narrative-commentary.ts":
    [
      {
        surface: "narrative-bundle (composite)",
        location: "buildLenderCommentary / buildBoardCommentary",
        read: () => null,
        intentionalSkip:
          "Composite bundle. Every scalar inside (dscrY1Normalized, troughEndingCash, breakEvenStudentsY1, retentionRatePct, …) is diffed individually by its own metric row above. The bundle itself is intentionally not scalar-compared.",
      },
    ],

  // build-lender-packet.ts — typed shape on the LenderPacket itself
  "lender-readiness-uncapped::artifacts/api-server/src/lib/packets/build-lender-packet.ts":
    [
      {
        surface: "lenderPacket.lenderReadiness.result.uncappedRating",
        location: "lenderPacket.lenderReadiness.result.uncappedRating",
        read: ({ lenderPacket }) =>
          lenderPacket.lenderReadiness.result.uncappedRating,
      },
    ],
  "lender-readiness-effective::artifacts/api-server/src/lib/packets/build-lender-packet.ts":
    [
      {
        surface: "lenderPacket.lenderReadiness.status",
        location: "lenderPacket.lenderReadiness.status",
        read: ({ lenderPacket }) => lenderPacket.lenderReadiness.status,
      },
      {
        surface: "lenderPacket.lenderReadiness.result.effectiveRating",
        location: "lenderPacket.lenderReadiness.result.effectiveRating",
        read: ({ lenderPacket }) =>
          lenderPacket.lenderReadiness.result.effectiveRating,
      },
    ],
  "lender-readiness-cap::artifacts/api-server/src/lib/packets/build-lender-packet.ts":
    [
      {
        surface: "lenderPacket.lenderReadiness.result.cap.taggedFraction",
        location: "lenderPacket.lenderReadiness.result.cap.taggedFraction",
        read: ({ lenderPacket }) =>
          lenderPacket.lenderReadiness.result.cap.taggedFraction,
      },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
// Supplemental canonical re-flow readers (NOT keyed to registry
// surfaces — they sanity-check that the consultant-engine field the
// canonical resolver reads agrees with itself and any sister typed
// accessors. These are reported as a separate section so the main
// coverage report stays anchored to the registry's declared surfaces.)
// ─────────────────────────────────────────────────────────────────────────

const SUPPLEMENTAL_READERS: Record<string, SurfaceReader[]> = {
  // ── Revenue ──
  "revenue-total-year": [
    {
      surface: "consultant.normalizedView.reported.revenue",
      location: "normalizedView.reported.revenue[y]",
      read: ({ consultant }) => consultant.normalizedView.reported.revenue,
    },
    // Registry also lists `lender-packet.cashRunway.yearlyView` as a
    // surface, but that view exposes `endingCash` (not revenue) at the
    // typed-shape layer. The PDF section renders revenue via the
    // `revenue_section` PacketSection which only carries pre-formatted
    // rows — already covered by the build-packet-data tests and the
    // lender-pdf-text-snapshot test. Not adding a second reader here
    // would just produce a spurious "missing" row; the registry surface
    // entry stays as documentation.
  ],

  "revenue-per-line-y1-value": [
    {
      // Per-row Y1 dollars are computed dynamically in the packet
      // builder; the canonical map is { rowId: usdY1 } but no
      // packet-level direct dotted path exposes the same map. Reader
      // returns null → surfaced as "missing reader" (Phase 2 mapping
      // hole, not a calc bug — see triage note).
      surface: "lender-packet.appendixAssumptions.revenueRows",
      location: "(no dotted accessor — string-formatted in linkedAssumptions)",
      read: () => null,
    },
  ],

  "revenue-quality-by-bucket": [
    {
      surface: "consultant.revenueQuality[y].pctByBucket",
      location: "revenueQuality[y].pctByBucket.{contracted|projected|donor_dependent|policy_dependent}",
      read: ({ consultant }) => {
        const y1 = consultant.revenueQuality[0]?.pctByBucket;
        if (!y1) return null;
        // Sum of buckets must equal ~1.0 (sanity check via single
        // composite read). Diff vs canonical sum check.
        const sum =
          (y1.contracted ?? 0) +
          (y1.projected ?? 0) +
          (y1.donor_dependent ?? 0) +
          (y1.policy_dependent ?? 0);
        return sum;
      },
    },
  ],

  "revenue-composition": [
    {
      surface: "consultant.revenueComposition[y]",
      location: "revenueComposition[0].{tuitionPct|publicPct|philanthropyPct}",
      read: ({ consultant }) => {
        const y1 = consultant.revenueComposition?.[0];
        if (!y1) return null;
        const sum =
          (y1.tuitionPct ?? 0) +
          (y1.publicPct ?? 0) +
          (y1.philanthropyPct ?? 0);
        return sum;
      },
    },
  ],

  "revenue-hard-coverage-y1": [
    {
      surface: "consultant.revenueQuality[0].hardRevenueCoverage",
      location: "revenueQuality[0].hardRevenueCoverage",
      read: ({ consultant }) =>
        consultant.revenueQuality[0]?.hardRevenueCoverage ?? null,
    },
  ],

  // ── Cash ──
  "cash-runway-months": [
    {
      surface: "consultant.cashRunwayMonths",
      location: "consultant.cashRunwayMonths",
      read: ({ consultant }) => consultant.cashRunwayMonths,
    },
    {
      surface: "narrative-bundle.cashRunwayMonths",
      location: "narrativeBundle.cashRunwayMonths",
      read: ({ narrativeBundle }) => narrativeBundle.cashRunwayMonths,
    },
    {
      surface: "lender-packet.lenderCommentary.bundle.cashRunwayMonths",
      location: "lenderPacket.lenderCommentary.bundle.cashRunwayMonths",
      read: ({ lenderPacket }) =>
        lenderPacket.lenderCommentary.bundle.cashRunwayMonths,
    },
  ],

  "cash-trough-ending-cash": [
    {
      surface: "narrative-bundle.troughEndingCash",
      location: "narrativeBundle.troughEndingCash",
      read: ({ narrativeBundle }) => narrativeBundle.troughEndingCash,
    },
    {
      surface: "lender-packet.lenderCommentary.bundle.troughEndingCash",
      location: "lenderPacket.lenderCommentary.bundle.troughEndingCash",
      read: ({ lenderPacket }) =>
        lenderPacket.lenderCommentary.bundle.troughEndingCash,
    },
  ],

  "cash-monthly-low": [
    {
      // Lender packet exposes monthly cash via the cash flow section
      // (a PacketSection); the typed packet doesn't surface a single
      // scalar field. Mark unresolved at the typed-shape layer; the
      // existing `cash-runway-pdf-parity` test covers PDF rendering.
      surface: "lender-packet.sections.cash_flow",
      location: "(scalar not exposed on typed packet — formatted into tables)",
      read: () => null,
    },
  ],

  "reserve-months-last-year": [
    {
      surface: "consultant.cumulativeFinancials[last].reserveMonths",
      location: "cumulativeFinancials[length-1].reserveMonths",
      read: ({ consultant }) =>
        consultant.cumulativeFinancials.at(-1)?.reserveMonths ?? null,
    },
    {
      surface: "narrative-bundle.reserveMonthsLastYear",
      location: "narrativeBundle.reserveMonthsLastYear",
      read: ({ narrativeBundle }) => narrativeBundle.reserveMonthsLastYear,
    },
  ],

  // ── Debt ──
  "dscr-year-series-normalized": [
    {
      surface: "consultant.normalizedView.normalized.dscr",
      location: "normalizedView.normalized.dscr[y]",
      // Compare arrays via sum (single scalar diff). Per-element
      // diffing is done by the structural array compare path.
      read: ({ consultant }) => consultant.normalizedView.normalized.dscr,
    },
  ],

  "dscr-year-series-reported": [
    {
      surface: "consultant.normalizedView.reported.dscr",
      location: "normalizedView.reported.dscr[y]",
      read: ({ consultant }) => consultant.normalizedView.reported.dscr,
    },
  ],

  "dscr-min-normalized": [
    {
      surface: "narrative-bundle.dscrMinNormalized",
      location: "narrativeBundle.dscrMinNormalized",
      read: ({ narrativeBundle }) => narrativeBundle.dscrMinNormalized,
    },
  ],

  "annual-debt-service": [
    {
      surface: "consultant.normalizedView.reported.loanDebtService",
      location: "normalizedView.reported.loanDebtService[y]",
      read: ({ consultant }) =>
        consultant.normalizedView.reported.loanDebtService ?? null,
    },
  ],

  // ── Per-student ──
  "revenue-per-student": [
    {
      surface: "consultant.keyMetrics[name~='Revenue per Student']",
      location: "keyMetrics filter",
      read: ({ consultant }) => {
        const km = consultant.keyMetrics.find((m) =>
          /^Revenue per Student/i.test(m.name),
        );
        return km?.value ?? null;
      },
    },
  ],

  "cost-per-student": [
    {
      surface: "consultant.keyMetrics[name~='Cost per Student']",
      location: "keyMetrics filter",
      read: ({ consultant }) => {
        const km = consultant.keyMetrics.find((m) =>
          /^Cost per Student/i.test(m.name),
        );
        return km?.value ?? null;
      },
    },
  ],

  // ── Capacity / break-even ──
  "capacity-utilization-y1": [
    {
      surface: "consultant.keyMetrics[name~='Capacity Utilization']",
      location: "keyMetrics filter",
      read: ({ consultant }) => {
        const km = consultant.keyMetrics.find((m) =>
          /^Capacity Utilization/i.test(m.name),
        );
        return km?.value ?? null;
      },
    },
  ],

  "break-even-year": [
    {
      surface: "narrative-bundle.breakEvenYear",
      location: "narrativeBundle.breakEvenYear",
      read: ({ narrativeBundle }) => narrativeBundle.breakEvenYear,
    },
  ],

  "break-even-students-y1": [
    {
      surface: "consultant.lenderStressTests.base.breakEvenStudents[0]",
      location: "lenderStressTests.base.breakEvenStudents[0]",
      read: ({ consultant }) =>
        consultant.lenderStressTests.base.breakEvenStudents[0] ?? null,
    },
    {
      surface: "narrative-bundle.breakEvenStudentsY1",
      location: "narrativeBundle.breakEvenStudentsY1",
      read: ({ narrativeBundle }) => narrativeBundle.breakEvenStudentsY1,
    },
  ],

  // ── Stress tests ──
  "stress-base-net-income": [
    {
      surface: "consultant.lenderStressTests.base.netIncome",
      location: "lenderStressTests.base.netIncome[y]",
      read: ({ consultant }) => consultant.lenderStressTests.base.netIncome,
    },
  ],

  "stress-scenario-dscr": [
    {
      surface: "consultant.lenderStressTests.scenarios[*].dscr",
      location: "(array of {name, dscr[y]})",
      read: () => null, // composite — structural array compare handles this
    },
  ],

  "stress-scenario-ending-cash": [
    {
      surface: "consultant.lenderStressTests.scenarios[*].endingCash",
      location: "(array of {name, endingCash[y]})",
      read: () => null,
    },
  ],

  "stress-scenario-net-income": [
    {
      surface: "consultant.lenderStressTests.scenarios[*].netIncome",
      location: "(array of {name, netIncome[y]})",
      read: () => null,
    },
  ],

  "stress-worst-scenario": [
    {
      surface: "narrative-bundle.worstStress.name",
      location: "narrativeBundle.worstStress.name",
      read: ({ narrativeBundle }) => narrativeBundle.worstStress?.name ?? null,
    },
  ],

  "stress-negative-y5-scenarios": [
    {
      surface: "narrative-bundle.negativeY5StressScenarios.length",
      location: "narrativeBundle.negativeY5StressScenarios.length",
      read: ({ narrativeBundle }) =>
        narrativeBundle.negativeY5StressScenarios.length,
    },
  ],

  // ── Founder comp ──
  "founder-comp-adjustment": [
    {
      surface: "consultant.normalizedView.founderComp.totalDelta",
      location: "normalizedView.founderComp.totalDelta",
      read: ({ consultant }) =>
        consultant.normalizedView.founderComp.totalDelta,
    },
    {
      surface: "narrative-bundle.founderCompTotalDelta",
      location: "narrativeBundle.founderCompTotalDelta",
      read: ({ narrativeBundle }) => narrativeBundle.founderCompTotalDelta,
    },
  ],

  // ── Rating ──
  "lender-readiness-uncapped": [
    {
      surface: "consultant.lenderReadinessResult.uncappedRating",
      location: "lenderReadinessResult.uncappedRating",
      read: ({ consultant }) =>
        consultant.lenderReadinessResult.uncappedRating,
    },
    {
      surface: "lender-packet.lenderReadiness.result.uncappedRating",
      location: "lenderPacket.lenderReadiness.result.uncappedRating",
      read: ({ lenderPacket }) =>
        lenderPacket.lenderReadiness.result.uncappedRating,
    },
  ],

  "lender-readiness-effective": [
    {
      surface: "consultant.lenderReadinessResult.effectiveRating",
      location: "lenderReadinessResult.effectiveRating",
      read: ({ consultant }) =>
        consultant.lenderReadinessResult.effectiveRating,
    },
    {
      surface: "lender-packet.lenderReadiness.status",
      location: "lenderPacket.lenderReadiness.status",
      read: ({ lenderPacket }) => lenderPacket.lenderReadiness.status,
    },
    {
      surface: "narrative-bundle.lenderReadiness",
      location: "narrativeBundle.lenderReadiness",
      read: ({ narrativeBundle }) => narrativeBundle.lenderReadiness,
    },
  ],

  "lender-readiness-cap": [
    {
      surface: "consultant.lenderReadinessResult.cap.taggedFraction",
      location: "lenderReadinessResult.cap.taggedFraction",
      read: ({ consultant }) =>
        consultant.lenderReadinessResult.cap.taggedFraction,
    },
  ],

  "biggest-strength": [
    {
      surface: "consultant.biggestStrength",
      location: "consultant.biggestStrength",
      read: ({ consultant }) => consultant.biggestStrength,
    },
    {
      surface: "narrative-bundle.biggestStrength",
      location: "narrativeBundle.biggestStrength",
      read: ({ narrativeBundle }) => narrativeBundle.biggestStrength,
    },
  ],

  "biggest-risk": [
    {
      surface: "consultant.biggestRisk",
      location: "consultant.biggestRisk",
      read: ({ consultant }) => consultant.biggestRisk,
    },
    {
      surface: "narrative-bundle.biggestRisk",
      location: "narrativeBundle.biggestRisk",
      read: ({ narrativeBundle }) => narrativeBundle.biggestRisk,
    },
  ],

  "assumption-registry": [
    {
      // Persona-independent catalog; no per-persona surface diff
      // needed. Marked structural — handled by the structural path.
      surface: "(catalog)",
      location: "(persona-independent)",
      read: () => null,
    },
  ],

  "narrative-commentary-bundle": [
    {
      surface: "lender-packet.lenderCommentary.bundle",
      location: "lenderPacket.lenderCommentary.bundle (composite)",
      read: () => null, // composite — structural compare handles
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Canonical scalar extraction (matches reader return shape)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Given a registry metric and the M3 canonical value (natural form),
 * derive the scalar/array the readers above produce for the comparator.
 * Returns null when the canonical is itself null or shape-incompatible.
 */
function canonicalReadable(
  metric: CanonicalMetric,
  canonical: unknown,
  reader: SurfaceReader,
): SurfaceValue | SurfaceValue[] {
  // Composite / catalog metrics: comparator handles via array-sum heuristic.
  if (canonical === null || canonical === undefined) return null;

  if (metric.id === "revenue-quality-by-bucket") {
    // Canonical is the array of per-year `pctByBucket` records. The
    // reader returns the Y1 bucket sum — mirror the same derivation
    // here so the comparator does an apples-to-apples diff (the buckets
    // are NOT guaranteed to sum to 1.0 — schools with uncategorized
    // revenue rows leave a residual outside the four buckets, by
    // design — so hard-coding 1.0 here would falsely flag drift).
    if (Array.isArray(canonical)) {
      // Canonical resolver emits `consultant.revenueQuality.map(y => y.pctByBucket)`,
      // so each element IS the pctByBucket record directly.
      const y1 = (canonical as Array<Record<string, number>>)[0];
      if (!y1) return null;
      return (
        (y1.contracted ?? 0) +
        (y1.projected ?? 0) +
        (y1.donor_dependent ?? 0) +
        (y1.policy_dependent ?? 0)
      );
    }
    return null;
  }
  if (metric.id === "revenue-composition") {
    // Mirror the reader: Y1 sum of tuitionPct + publicPct +
    // philanthropyPct. Same not-necessarily-1.0 caveat — misc-typed
    // revenue rows fall outside the three buckets (e.g. riverside's
    // Y1 sum is ~0.60 because 40% of revenue is in `r2/r3/r4/r5`
    // generic rows that aren't classified as tuition/public/philanthropy).
    // Hard-coding 1.0 would mis-report that as a drift; deriving from
    // canonical the same way the reader derives from consultant gives a
    // correct identity-compare.
    if (Array.isArray(canonical)) {
      const y1 = (
        canonical as Array<{
          tuitionPct?: number;
          publicPct?: number;
          philanthropyPct?: number;
        }>
      )[0];
      if (!y1) return null;
      return (y1.tuitionPct ?? 0) + (y1.publicPct ?? 0) + (y1.philanthropyPct ?? 0);
    }
    return null;
  }
  if (
    metric.id === "founder-comp-adjustment" &&
    typeof canonical === "object"
  ) {
    return (canonical as { totalDelta: number }).totalDelta;
  }
  if (metric.id === "lender-readiness-cap" && typeof canonical === "object") {
    return (canonical as { taggedFraction: number }).taggedFraction;
  }
  if (metric.id === "dscr-min-normalized" && typeof canonical === "object") {
    return (canonical as { min: number | null }).min;
  }
  if (metric.id === "stress-negative-y5-scenarios") {
    // Canonical is an array; the reader returns its length.
    if (Array.isArray(canonical)) return canonical.length;
    return null;
  }
  if (metric.id === "stress-worst-scenario") {
    if (typeof canonical === "object" && canonical !== null) {
      return (canonical as { name?: string }).name ?? null;
    }
    return null;
  }
  // Reader returns the same shape the canonical resolver returned.
  return canonical as SurfaceValue | SurfaceValue[];
}

// ─────────────────────────────────────────────────────────────────────────
// Comparator dispatch
// ─────────────────────────────────────────────────────────────────────────

/**
 * Engine `keyMetrics[].value` is a pre-formatted display string
 * ("$24,375", "100.0%"). When the canonical resolver returns the
 * underlying number, normalize the string back to a number so the
 * comparator does an apples-to-apples numeric compare instead of a
 * spurious type-mismatch drift. Returns null if the string is not a
 * recognizable numeric format (so the comparator falls through to
 * the text/string path).
 */
function parseFormattedNumeric(s: string): number | null {
  const trimmed = s.trim();
  // Strip $, commas, and trailing % — preserve sign and decimal.
  const cleaned = trimmed.replace(/[$,]/g, "");
  const pctMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    const n = Number.parseFloat(pctMatch[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function compareScalar(
  extracted: SurfaceValue,
  canonical: SurfaceValue,
  metric: CanonicalMetric,
): { severity: Severity; deltaAbs: number | null; deltaRel: number | null } {
  if (extracted === null || extracted === undefined) {
    if (canonical === null || canonical === undefined) {
      return { severity: "pass", deltaAbs: 0, deltaRel: 0 };
    }
    return { severity: "missing", deltaAbs: null, deltaRel: null };
  }
  // If the canonical is numeric but the extracted is a pre-formatted
  // display string ("$24,375", "100.0%"), parse it back to a number
  // before comparing. The engine's `keyMetrics[].value` field is a
  // common source of these — they ARE the same number, just stringified
  // for display.
  if (typeof canonical === "number" && typeof extracted === "string") {
    const parsed = parseFormattedNumeric(extracted);
    if (parsed !== null) extracted = parsed;
  }
  if (metric.unit === "text" || metric.unit === "enum") {
    const e = typeof extracted === "string" ? extracted : String(extracted);
    const c = typeof canonical === "string" ? canonical : String(canonical);
    if (e === c) return { severity: "skipped-structural", deltaAbs: 0, deltaRel: 0 };
    return { severity: "drift", deltaAbs: null, deltaRel: null };
  }
  if (typeof extracted !== "number" || typeof canonical !== "number") {
    return { severity: "drift", deltaAbs: null, deltaRel: null };
  }
  const diff = extracted - canonical;
  const absDiff = Math.abs(diff);
  const relDiff = canonical !== 0 ? absDiff / Math.abs(canonical) : 0;
  if (withinTolerance(extracted, canonical, metric.tolerance)) {
    return { severity: "pass", deltaAbs: diff, deltaRel: relDiff };
  }
  return { severity: "drift", deltaAbs: diff, deltaRel: relDiff };
}

function compareArray(
  extracted: SurfaceValue[],
  canonical: SurfaceValue[],
  metric: CanonicalMetric,
): { severity: Severity; deltaAbs: number | null; deltaRel: number | null } {
  if (extracted.length !== canonical.length) {
    return { severity: "drift", deltaAbs: null, deltaRel: null };
  }
  let worstAbs = 0;
  let worstRel = 0;
  for (let i = 0; i < extracted.length; i++) {
    const e = extracted[i];
    const c = canonical[i];
    const r = compareScalar(e, c, metric);
    if (r.severity === "drift" || r.severity === "missing") return r;
    if (r.deltaAbs !== null) worstAbs = Math.max(worstAbs, Math.abs(r.deltaAbs));
    if (r.deltaRel !== null) worstRel = Math.max(worstRel, r.deltaRel);
  }
  return { severity: "pass", deltaAbs: worstAbs, deltaRel: worstRel };
}

// ─────────────────────────────────────────────────────────────────────────
// Triage notes — calc-bug follow-ups filed as blocker tasks; in-scope
// "no reader yet" findings annotated; structural metrics flagged so
// human reviewer knows they are intentional skips.
// ─────────────────────────────────────────────────────────────────────────

const TRIAGE_NOTES: Record<string, string> = {
  "revenue-per-line-y1-value":
    "Mapping-hole: per-row USD map is computed and formatted inside packet builder, not exposed on typed shape. M5 should add a per-row accessor; covered today by build-packet-data tests.",
  "cash-monthly-low":
    "Mapping-hole: monthly cash scalar is rendered into PacketSection tables only. Existing cash-runway-pdf-parity test covers the PDF surface end-to-end.",
  "stress-scenario-dscr":
    "Composite array — canonical/source identity is `lenderStressTests.scenarios[*]`. Per-scenario diff covered by lender-stress-section-snapshot test. No drift expected (same array reference).",
  "stress-scenario-ending-cash":
    "Composite array — same as stress-scenario-dscr. Covered by lender-stress-section-snapshot.",
  "stress-scenario-net-income":
    "Composite array — same as stress-scenario-dscr. Covered by lender-stress-section-snapshot.",
  "narrative-commentary-bundle":
    "Composite bundle — every scalar inside (dscrMinNormalized, troughEndingCash, breakEvenStudentsY1, retentionRatePct, …) is already diffed individually by its own metric row. The bundle itself is intentionally not scalar-compared.",
  "assumption-registry":
    "Persona-independent catalog. Surfaced once in the report header; no per-persona row needed.",
  "capacity-utilization-y1":
    "Acceptable variance (registry-annotated): engine emits 'Capacity Utilization (Year N)' for the last modeled year, registry label says Y1. Canonical resolver flags this in `note`; the variance is documented and the surface read agrees with the resolver. M5 may rename to capacity-utilization-last-year.",
};

// ─────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────

async function buildPersonaContext(
  persona: PersonaFixture,
): Promise<Omit<SurfaceContext, "canonical">> {
  const consultant = await runConsultantEngine(persona.data);
  const modelData = persona.data as unknown as ModelData;
  const lenderPacket = buildLenderPacket(modelData, consultant, 0);
  const boardPacket = buildBoardPacket(modelData, consultant, 0);
  const narrativeBundle = buildNarrativeBundle(modelData, consultant);
  return { persona, consultant, lenderPacket, boardPacket, narrativeBundle, modelData };
}

function diff(
  metric: CanonicalMetric,
  reader: SurfaceReader,
  ctx: SurfaceContext,
): Finding {
  const persona = ctx.persona.slug;
  const canonicalForReader = reader.projectCanonical
    ? (reader.projectCanonical(ctx.canonical) as SurfaceValue | SurfaceValue[])
    : canonicalReadable(metric, ctx.canonical, reader);

  // Reader declared as an intentional no-op for this surface (the
  // canonical is composite and the surface only renders a derived figure
  // diffed elsewhere). Emit `skipped-structural` with the rationale so
  // a reviewer can audit it; never let it flip to `unresolved`.
  if (reader.intentionalSkip) {
    return {
      metricId: metric.id,
      category: metric.category,
      unit: metric.unit,
      persona,
      surface: reader.surface,
      location: reader.location,
      extracted: "—",
      canonical: Array.isArray(canonicalForReader)
        ? `[${(canonicalForReader as SurfaceValue[]).map((v) => fmt(v, metric.unit)).join(", ")}]`
        : fmt(canonicalForReader as SurfaceValue, metric.unit),
      deltaAbs: "—",
      deltaRel: "—",
      toleranceAbs: String(metric.tolerance.abs ?? "—"),
      toleranceRel: String(metric.tolerance.rel ?? "—"),
      severity: "skipped-structural",
      triage: reader.intentionalSkip,
    };
  }
  let extracted: SurfaceValue | SurfaceValue[];
  try {
    extracted = reader.read(ctx);
  } catch (err) {
    return {
      metricId: metric.id,
      category: metric.category,
      unit: metric.unit,
      persona,
      surface: reader.surface,
      location: reader.location,
      extracted: "ERROR",
      canonical: fmt(canonicalForReader as SurfaceValue, metric.unit),
      deltaAbs: "—",
      deltaRel: "—",
      toleranceAbs: String(metric.tolerance.abs ?? "—"),
      toleranceRel: String(metric.tolerance.rel ?? "—"),
      severity: "drift",
      triage: `Reader threw: ${(err as Error).message}`,
    };
  }

  // "Unresolved" — reader returns null AND canonical is non-null AND
  // there's no triage note explaining the mapping hole.
  if (
    (extracted === null || extracted === undefined) &&
    canonicalForReader !== null &&
    canonicalForReader !== undefined &&
    !TRIAGE_NOTES[metric.id]
  ) {
    return {
      metricId: metric.id,
      category: metric.category,
      unit: metric.unit,
      persona,
      surface: reader.surface,
      location: reader.location,
      extracted: "—",
      canonical: fmt(canonicalForReader as SurfaceValue, metric.unit),
      deltaAbs: "—",
      deltaRel: "—",
      toleranceAbs: String(metric.tolerance.abs ?? "—"),
      toleranceRel: String(metric.tolerance.rel ?? "—"),
      severity: "unresolved",
      triage: "No reader for this surface — add a dotted accessor.",
    };
  }

  let result: ReturnType<typeof compareScalar>;
  if (Array.isArray(extracted) && Array.isArray(canonicalForReader)) {
    result = compareArray(
      extracted as SurfaceValue[],
      canonicalForReader as SurfaceValue[],
      metric,
    );
  } else {
    result = compareScalar(
      extracted as SurfaceValue,
      canonicalForReader as SurfaceValue,
      metric,
    );
  }

  // If the canonical value was a composite the reader could not be
  // expected to mirror (e.g. revenue-per-line map vs single scalar
  // reader, narrative bundle), and the reader returned null, classify
  // as skipped-structural with the triage note.
  if (
    (extracted === null || extracted === undefined) &&
    TRIAGE_NOTES[metric.id]
  ) {
    return {
      metricId: metric.id,
      category: metric.category,
      unit: metric.unit,
      persona,
      surface: reader.surface,
      location: reader.location,
      extracted: "—",
      canonical: fmt(
        Array.isArray(canonicalForReader)
          ? null
          : (canonicalForReader as SurfaceValue),
        metric.unit,
      ),
      deltaAbs: "—",
      deltaRel: "—",
      toleranceAbs: String(metric.tolerance.abs ?? "—"),
      toleranceRel: String(metric.tolerance.rel ?? "—"),
      severity: "skipped-structural",
      triage: TRIAGE_NOTES[metric.id],
    };
  }

  const extractedFmt = Array.isArray(extracted)
    ? `[${extracted.map((v) => fmt(v, metric.unit)).join(", ")}]`
    : fmt(extracted as SurfaceValue, metric.unit);
  const canonicalFmt = Array.isArray(canonicalForReader)
    ? `[${(canonicalForReader as SurfaceValue[]).map((v) => fmt(v, metric.unit)).join(", ")}]`
    : fmt(canonicalForReader as SurfaceValue, metric.unit);

  return {
    metricId: metric.id,
    category: metric.category,
    unit: metric.unit,
    persona,
    surface: reader.surface,
    location: reader.location,
    extracted: extractedFmt,
    canonical: canonicalFmt,
    deltaAbs:
      result.deltaAbs !== null ? formatNumber(result.deltaAbs, metric.unit) : "—",
    deltaRel:
      result.deltaRel !== null
        ? (result.deltaRel * 100).toFixed(4) + "%"
        : "—",
    toleranceAbs: String(metric.tolerance.abs ?? "—"),
    toleranceRel: String(metric.tolerance.rel ?? "—"),
    severity: result.severity,
    triage:
      result.severity === "pass"
        ? "in tolerance"
        : result.severity === "skipped-structural"
        ? "exact-match string (text/enum)"
        : TRIAGE_NOTES[metric.id] ?? "investigate calc/routing",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Report writers
// ─────────────────────────────────────────────────────────────────────────

function toCsv(findings: Finding[]): string {
  const headers = [
    "metricId",
    "category",
    "unit",
    "persona",
    "surface",
    "location",
    "extracted",
    "canonical",
    "deltaAbs",
    "deltaRel",
    "toleranceAbs",
    "toleranceRel",
    "severity",
    "triage",
  ];
  const escape = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [headers.join(",")];
  for (const f of findings) {
    lines.push(
      [
        f.metricId,
        f.category,
        f.unit,
        f.persona,
        f.surface,
        f.location,
        f.extracted,
        f.canonical,
        f.deltaAbs,
        f.deltaRel,
        f.toleranceAbs,
        f.toleranceRel,
        f.severity,
        f.triage,
      ]
        .map((v) => escape(String(v)))
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function toMarkdown(
  findings: Finding[],
  personas: readonly PersonaFixture[],
  supplemental: Finding[],
  m2Coverage: ExtractorCoverage[],
): string {
  const counts = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<Severity, number>,
  );
  const total = findings.length;
  const totalDeclaredSurfaces = CANONICAL_METRICS.reduce(
    (n, m) => n + m.surfaces.length,
    0,
  );
  const expectedRowCount = totalDeclaredSurfaces * personas.length;
  const lines: string[] = [];
  lines.push("# Math Integrity Report (Task #930 / M4)");
  lines.push("");
  lines.push(
    "Composed M1 (registry) × M2 (extractors) × M3 (canonical compute). For every persona × every registered metric × every surface declared in the registry, this report reads the value the renderer consumes and diffs it against the M3 canonical value within the registry's per-metric tolerance.",
  );
  lines.push("");
  lines.push("## Coverage (registry-driven)");
  lines.push("");
  lines.push(`- Personas: ${personas.map((p) => p.slug).join(", ")}`);
  lines.push(`- Metrics in registry: ${CANONICAL_METRICS.length}`);
  lines.push(`- Declared surfaces in registry: ${totalDeclaredSurfaces}`);
  lines.push(
    `- Expected registry-surface rows (personas × declared surfaces): ${expectedRowCount}`,
  );
  lines.push(`- Total registry-surface rows emitted: ${total}`);
  lines.push(`  - pass: ${counts.pass ?? 0}`);
  lines.push(`  - drift: ${counts.drift ?? 0}`);
  lines.push(`  - missing: ${counts.missing ?? 0}`);
  lines.push(`  - skipped-structural: ${counts["skipped-structural"] ?? 0}`);
  lines.push(`  - unresolved: ${counts.unresolved ?? 0}`);
  lines.push("");
  lines.push(
    "**Acceptance bar (M4):** zero `unresolved` AND zero `drift` in the registry-surface section. Coverage is anchored to `metric.surfaces[]` from the registry, so every declared surface contributes exactly one row per persona (or N rows if multiple typed readers are declared for the same surface).",
  );
  lines.push("");

  lines.push("## M2 extractor coverage");
  lines.push("");
  lines.push(
    "The M2 JSON extractor (`extractJsonExport`) is run over each persona's lender packet, board packet, and narrative bundle payload as a coverage probe — it proves the extractor sees the rendered output and reports how many numeric leaves it observed.",
  );
  lines.push("");
  lines.push("| persona | producer | numeric leaves | unique labels | sample labels |");
  lines.push("|---|---|---|---|---|");
  for (const c of m2Coverage) {
    lines.push(
      `| ${c.persona} | ${c.producer} | ${c.leafCount} | ${c.uniqueLabels} | ${c.sampleLabels.join(", ")} |`,
    );
  }
  lines.push("");

  // Group registry-surface findings by severity for human review.
  lines.push("## Registry-surface findings");
  lines.push("");
  const groups: Severity[] = [
    "drift",
    "missing",
    "unresolved",
    "skipped-structural",
    "pass",
  ];
  for (const sev of groups) {
    const rows = findings.filter((f) => f.severity === sev);
    if (rows.length === 0) continue;
    lines.push(`### ${sev} (${rows.length})`);
    lines.push("");
    lines.push(
      "| metricId | persona | surface | extracted | canonical | Δabs | Δrel | triage |",
    );
    lines.push(
      "|---|---|---|---|---|---|---|---|",
    );
    for (const f of rows) {
      const esc = (s: string) =>
        String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(
        `| ${esc(f.metricId)} | ${esc(f.persona)} | ${esc(f.surface)} | ${esc(f.extracted)} | ${esc(f.canonical)} | ${esc(f.deltaAbs)} | ${esc(f.deltaRel)} | ${esc(f.triage)} |`,
      );
    }
    lines.push("");
  }

  if (supplemental.length > 0) {
    const sCounts = supplemental.reduce(
      (acc, f) => ((acc[f.severity] = (acc[f.severity] ?? 0) + 1), acc),
      {} as Record<Severity, number>,
    );
    lines.push("## Supplemental canonical re-flow (sanity)");
    lines.push("");
    lines.push(
      "Additional typed-shape reads exercising consultant-engine fields directly (the fields the canonical resolver reads). Not part of the M4 acceptance bar; reported for defense-in-depth so any future refactor that short-circuits the canonical source surfaces here.",
    );
    lines.push("");
    lines.push(`- pass: ${sCounts.pass ?? 0}`);
    lines.push(`- drift: ${sCounts.drift ?? 0}`);
    lines.push(`- missing: ${sCounts.missing ?? 0}`);
    lines.push(`- skipped-structural: ${sCounts["skipped-structural"] ?? 0}`);
    lines.push(`- unresolved: ${sCounts.unresolved ?? 0}`);
    lines.push("");
    for (const sev of groups) {
      const rows = supplemental.filter((f) => f.severity === sev);
      if (rows.length === 0) continue;
      lines.push(`### ${sev} (${rows.length})`);
      lines.push("");
      lines.push(
        "| metricId | persona | surface | extracted | canonical | Δabs | Δrel | triage |",
      );
      lines.push("|---|---|---|---|---|---|---|---|");
      for (const f of rows) {
        const esc = (s: string) =>
          String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
        lines.push(
          `| ${esc(f.metricId)} | ${esc(f.persona)} | ${esc(f.surface)} | ${esc(f.extracted)} | ${esc(f.canonical)} | ${esc(f.deltaAbs)} | ${esc(f.deltaRel)} | ${esc(f.triage)} |`,
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a `Finding` for one declared registry surface entry on one
 * persona. Resolves the (metric, surface.path) lookup against the
 * typed-shape reader table, falling back to the structural-skip table,
 * and finally to `unresolved` (which fails the acceptance bar).
 */
function evaluateRegistrySurface(
  metric: CanonicalMetric,
  surface: { path: string; location: string },
  ctx: SurfaceContext,
): Finding[] {
  const key = `${metric.id}::${surface.path}`;
  const typedReaders = TYPED_READERS_BY_SURFACE[key];
  if (typedReaders && typedReaders.length > 0) {
    return typedReaders.map((reader) => diff(metric, reader, ctx));
  }
  const structuralNote = STRUCTURAL_SKIPS_BY_PATH[surface.path];
  if (structuralNote) {
    return [
      {
        metricId: metric.id,
        category: metric.category,
        unit: metric.unit,
        persona: ctx.persona.slug,
        surface: surface.path,
        location: surface.location,
        extracted: "—",
        canonical: fmt(
          canonicalReadable(metric, ctx.canonical, {
            surface: surface.path,
            location: surface.location,
            read: () => null,
          }) as SurfaceValue,
          metric.unit,
        ),
        deltaAbs: "—",
        deltaRel: "—",
        toleranceAbs: String(metric.tolerance.abs ?? "—"),
        toleranceRel: String(metric.tolerance.rel ?? "—"),
        severity: "skipped-structural",
        triage: structuralNote,
      },
    ];
  }
  return [
    {
      metricId: metric.id,
      category: metric.category,
      unit: metric.unit,
      persona: ctx.persona.slug,
      surface: surface.path,
      location: surface.location,
      extracted: "—",
      canonical: fmt(
        canonicalReadable(metric, ctx.canonical, {
          surface: surface.path,
          location: surface.location,
          read: () => null,
        }) as SurfaceValue,
        metric.unit,
      ),
      deltaAbs: "—",
      deltaRel: "—",
      toleranceAbs: String(metric.tolerance.abs ?? "—"),
      toleranceRel: String(metric.tolerance.rel ?? "—"),
      severity: "unresolved",
      triage:
        "No typed-shape reader and no structural-skip note for this declared surface. Add one to TYPED_READERS_BY_SURFACE or STRUCTURAL_SKIPS_BY_PATH.",
    },
  ];
}

interface ExtractorCoverage {
  persona: string;
  producer: string;
  leafCount: number;
  uniqueLabels: number;
  sampleLabels: string[];
}

/**
 * Run the M2 `extractJsonExport` walker over each persona's lender
 * packet and board packet JSON. This is a coverage signal — it proves
 * the M2 extractor sees the rendered payload and reports how many
 * numeric leaves it observed, so the report header can show
 * extractor-side coverage alongside the registry-driven row count.
 */
function runM2Coverage(
  personas: readonly { ctx: Omit<SurfaceContext, "canonical"> }[],
): ExtractorCoverage[] {
  const out: ExtractorCoverage[] = [];
  for (const { ctx } of personas) {
    for (const [producer, payload] of [
      ["lender-packet", ctx.lenderPacket],
      ["board-packet", ctx.boardPacket],
      ["narrative-bundle", ctx.narrativeBundle],
    ] as const) {
      const leaves = extractJsonExport(payload as unknown, { producer });
      const labels = new Set<string>();
      for (const l of leaves) {
        if (l.label) labels.add(l.label);
      }
      out.push({
        persona: ctx.persona.slug,
        producer,
        leafCount: leaves.length,
        uniqueLabels: labels.size,
        sampleLabels: Array.from(labels).slice(0, 6),
      });
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("=== Math Integrity Report (M4) ===");
  const personas = await loadPersonaFixturesAsync();
  console.log(`Loaded ${personas.length} personas: ${personas.map((p) => p.slug).join(", ")}`);

  // Registry-driven findings: one row per (persona × metric ×
  // declared surface in registry). This guarantees the denominator is
  // the full coverage surface area, not just whatever the harness
  // happens to have a reader for.
  const findings: Finding[] = [];
  // Supplemental canonical re-flow findings: one row per (persona ×
  // metric × SUPPLEMENTAL_READERS entry). Reported in a separate
  // section so the main coverage signal stays anchored to the
  // registry's declared surfaces.
  const supplementalFindings: Finding[] = [];

  const personaCtxs: { ctx: Omit<SurfaceContext, "canonical">; canonical: Record<string, unknown> }[] = [];
  for (const persona of personas) {
    console.log(`\n— persona: ${persona.slug} (${persona.segment}) —`);
    const baseCtx = await buildPersonaContext(persona);
    const canonical = await computeCanonicalValues(persona);
    personaCtxs.push({ ctx: baseCtx, canonical });

    for (const metric of CANONICAL_METRICS) {
      const canonicalForMetric = canonical[metric.id];
      const ctx: SurfaceContext = { ...baseCtx, canonical: canonicalForMetric };

      // Registry-surface coverage rows
      for (const surface of metric.surfaces) {
        findings.push(...evaluateRegistrySurface(metric, surface, ctx));
      }

      // Supplemental canonical-reflow rows
      const supp = SUPPLEMENTAL_READERS[metric.id];
      if (supp) {
        for (const reader of supp) {
          supplementalFindings.push(diff(metric, reader, ctx));
        }
      }
    }
  }

  // M2 extractor coverage diagnostic — proves the extractor sees the
  // rendered payload and reports how many numeric leaves it observed.
  const m2Coverage = runM2Coverage(personaCtxs);

  const here = dirname(fileURLToPath(import.meta.url));
  const reportsDir = join(here, "..", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const mdPath = join(reportsDir, "math-integrity-report.md");
  const csvPath = join(reportsDir, "math-integrity-report.csv");
  writeFileSync(
    mdPath,
    toMarkdown(findings, personas, supplementalFindings, m2Coverage),
  );
  writeFileSync(csvPath, toCsv([...findings, ...supplementalFindings]));

  const counts = findings.reduce(
    (acc, f) => ((acc[f.severity] = (acc[f.severity] ?? 0) + 1), acc),
    {} as Record<Severity, number>,
  );
  const suppCounts = supplementalFindings.reduce(
    (acc, f) => ((acc[f.severity] = (acc[f.severity] ?? 0) + 1), acc),
    {} as Record<Severity, number>,
  );
  console.log("\n=== Summary (registry-surface coverage) ===");
  console.log(`  pass:                ${counts.pass ?? 0}`);
  console.log(`  drift:               ${counts.drift ?? 0}`);
  console.log(`  missing:             ${counts.missing ?? 0}`);
  console.log(`  skipped-structural:  ${counts["skipped-structural"] ?? 0}`);
  console.log(`  unresolved:          ${counts.unresolved ?? 0}`);
  console.log("\n=== Summary (supplemental canonical re-flow) ===");
  console.log(`  pass:                ${suppCounts.pass ?? 0}`);
  console.log(`  drift:               ${suppCounts.drift ?? 0}`);
  console.log(`  skipped-structural:  ${suppCounts["skipped-structural"] ?? 0}`);
  console.log("\n=== M2 extractor coverage ===");
  for (const c of m2Coverage) {
    console.log(`  ${c.persona}/${c.producer}: ${c.leafCount} numeric leaves, ${c.uniqueLabels} unique labels`);
  }
  console.log(`\nReport written to:\n  ${mdPath}\n  ${csvPath}`);

  // Acceptance bar: zero unresolved in the registry-surface section
  // AND zero drift (because the registry-surface loop now diffs every
  // declared surface — a drift here is a genuine routing/calc bug).
  const unresolved = counts.unresolved ?? 0;
  const drift = counts.drift ?? 0;
  if (unresolved > 0 || drift > 0) {
    console.error(
      `\nFAIL: ${unresolved} unresolved, ${drift} drift in registry-surface coverage. See report.`,
    );
    process.exit(1);
  }
  console.log("\nOK: zero unresolved + zero drift in registry-surface coverage.");
}

main().catch((err) => {
  console.error("run-math-integrity-report: fatal error", err);
  process.exit(1);
});
