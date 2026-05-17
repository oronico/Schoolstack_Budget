/**
 * Task #930 / M3 — Canonical Computation Layer.
 *
 * For every metric in the M1 registry
 * (`lib/finance/src/registry/canonical-metrics.ts`) this module
 * computes the single canonical value per persona fixture
 * (Oakwood / Riverside / Liberty). The result is the source of
 * truth M5's cross-surface harness will diff every rendered
 * surface against.
 *
 * Design notes
 * ────────────
 * 1. We run the consultant engine ONCE per persona (heavy: revenue
 *    expansion, scenario battery, lender stress tests) and then
 *    dispatch every metric resolver over the same shared output.
 *    Resolvers MUST NOT re-invoke the engine — they read fields off
 *    the cached `ConsultantOutput` + `NarrativeSourceBundle` only.
 *
 * 2. Resolvers return whatever JSON-serialisable shape the registry
 *    accessor documents (scalar, array, or small object). M4 does
 *    the rounding / tolerance comparison against extracted surface
 *    values, so the canonical value stays in its natural unit here.
 *
 * 3. Every metric id in the registry MUST have a resolver entry.
 *    The coverage assertion in
 *    `tests/integrity-canonical-compute.ts` enforces this — if you
 *    add a metric to the registry without adding a resolver here
 *    the api-server test suite fails loudly.
 *
 * 4. When a resolver cannot honour the registry accessor verbatim
 *    (e.g. the canonical accessor says
 *    `findLowestCashMonthAcrossYears(computeYear1MonthlyCashFlow(...))`
 *    which the lender packet rescales for tie-out), we call the
 *    raw lib helpers as the registry literally states and record
 *    the result under `notes`. Phase 2 (M4) consumes the
 *    surface-vs-canonical diff and decides whether the registry
 *    accessor or the packet rescaling is the bug.
 */
import {
  breakEvenYearFromAnnual,
  computeYear1MonthlyCashFlow,
  findLowestCashMonthAcrossYears,
  computeAnnualDebt,
  computeRevenueRowAmountsForYear,
  ASSUMPTION_REGISTRY,
  CANONICAL_METRICS,
  listCanonicalMetricIds,
  type MonthlyRevenueRowLike,
  type CanonicalMetric,
} from "@workspace/finance";

import {
  runConsultantEngine,
  type ConsultantOutput,
  type KeyMetric,
} from "../../consultant-engine.js";
import {
  buildNarrativeBundle,
  type NarrativeSourceBundle,
} from "../../packets/build-narrative-commentary.js";
import type { ModelData } from "../../workbook-helpers.js";

import type { PersonaFixture, PersonaSlug } from "./fixtures.js";

/**
 * The natural-form value of a single canonical metric for a single
 * persona. `value === null` is reserved for metrics whose accessor
 * legitimately returns no value for this persona (e.g. break-even
 * year when the school never crosses zero, founder-comp adjustment
 * when the persona doesn't draw founder comp). `note` carries any
 * non-blocking caveat surfaced by the resolver.
 */
export interface CanonicalValueRecord {
  metricId: string;
  persona: PersonaSlug;
  /** Natural-form value (scalar, array, object) — JSON-serialisable. */
  value: unknown;
  /** Optional reviewer note (e.g. registry-vs-surface caveat). */
  note?: string;
}

export interface ComputeResolverContext {
  fixture: PersonaFixture;
  modelData: ModelData;
  consultant: ConsultantOutput;
  narrativeBundle: NarrativeSourceBundle;
}

export type CanonicalResolver = (ctx: ComputeResolverContext) => {
  value: unknown;
  note?: string;
};

// ───────────────────────────────────────────────────────────────────────
// Resolver helpers
// ───────────────────────────────────────────────────────────────────────

function findKeyMetric(
  keyMetrics: readonly KeyMetric[],
  matcher: RegExp,
): KeyMetric | null {
  return keyMetrics.find((m) => matcher.test(m.name)) ?? null;
}

function parseCurrencyString(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePercentString(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = /(-?\d+(?:\.\d+)?)\s*%/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// ───────────────────────────────────────────────────────────────────────
// Resolver table — one entry per registered metric id
// ───────────────────────────────────────────────────────────────────────

const RESOLVERS: Record<string, CanonicalResolver> = {
  // ── Revenue ──────────────────────────────────────────────────────────
  "revenue-total-year": ({ consultant }) => ({
    value: consultant.normalizedView.reported.revenue,
  }),

  "revenue-per-line-y1-value": ({ modelData, consultant }) => {
    // Honors the registry accessor literally:
    //   `driverVal(row.amounts, 0, row.driverType, students,
    //              row.escalationRate)`
    // resolved per-row via the canonical helper
    // `computeRevenueRowAmountsForYear` (which is what the live
    // workbook / packet builder both call). Returns Y1 dollars
    // keyed by row id so M4 can diff per-row against any surface
    // that prints a revenue line breakdown.
    const raw = modelData as unknown as Record<string, unknown>;
    const rows = Array.isArray(raw.revenueRows)
      ? (raw.revenueRows as Parameters<typeof computeRevenueRowAmountsForYear>[0])
      : [];
    const tuitionTiers = Array.isArray(raw.tuitionTiers)
      ? (raw.tuitionTiers as Parameters<typeof computeRevenueRowAmountsForYear>[3])
      : undefined;
    const schoolProfile = raw.schoolProfile as
      | Parameters<typeof computeRevenueRowAmountsForYear>[4]
      | undefined;
    const students = consultant.normalizedView.reported.enrollment[0] ?? 0;
    const amounts = computeRevenueRowAmountsForYear(
      rows,
      0,
      students,
      tuitionTiers,
      schoolProfile,
    );
    return {
      value: Object.fromEntries(amounts.entries()),
    };
  },

  "revenue-quality-by-bucket": ({ consultant }) => ({
    value: consultant.revenueQuality.map((y) => y.pctByBucket),
  }),

  "revenue-composition": ({ consultant }) => ({
    value: consultant.revenueComposition,
  }),

  "revenue-hard-coverage-y1": ({ consultant }) => ({
    value: consultant.revenueQuality[0]?.hardRevenueCoverage ?? null,
  }),

  // ── Cash ─────────────────────────────────────────────────────────────
  "cash-runway-months": ({ consultant }) => ({
    value: consultant.cashRunwayMonths,
  }),

  "cash-trough-ending-cash": ({ narrativeBundle }) => ({
    value: narrativeBundle.troughEndingCash,
  }),

  "cash-monthly-low": ({ modelData, consultant }) => {
    // Mirrors the registry accessor literally — raw lib helpers,
    // no packet-side rescaling / ending-cash locking. If the lender
    // packet's Monthly Cash Flow Summary shows a different number,
    // that's a registry-vs-surface diff for M4 to triage (Phase 2
    // shape mismatch — surfaced per Task #930 brief).
    const raw = modelData as unknown as Record<string, unknown>;
    const revenueRows = (raw.revenueRows ?? []) as MonthlyRevenueRowLike[];
    const sp = (raw.schoolProfile as Record<string, unknown>) || {};
    const ob = (raw.openingBalances as Record<string, unknown>) || {};
    const fy = sp.fiscalYear as Record<string, unknown> | undefined;
    const startingCash = safeNumber(ob.cash) ?? 0;
    const fyStartMonth = safeNumber(fy?.startMonth) ?? 1;
    const baseOpMonths = sp.isPartialFirstYear
      ? safeNumber(sp.year1OperatingMonths) ?? 10
      : 12;
    const yearly = consultant.normalizedView.reported;
    const cumulatives: number[][] = [];
    let runningOpening = startingCash;
    for (let y = 0; y < 5; y++) {
      const totalRev = yearly.revenue[y];
      if (!Number.isFinite(totalRev) || totalRev <= 0) break;
      const yOpMonths = y === 0 ? baseOpMonths : 12;
      const annualPersonnel = yearly.staffingCost[y] ?? 0;
      const annualDebt = yearly.loanDebtService?.[y] ?? 0;
      const annualOpex =
        (yearly.totalExpenses[y] ?? 0) - annualPersonnel - annualDebt;
      const series = computeYear1MonthlyCashFlow({
        revenueRows,
        yearIndex: y,
        students: yearly.enrollment[y] ?? 0,
        annualPersonnel,
        annualOpex,
        annualDebt,
        openingCash: runningOpening,
        opMonths: yOpMonths,
      });
      cumulatives.push(series.cumulative);
      runningOpening = series.cumulative[series.cumulative.length - 1];
    }
    const trough =
      cumulatives.length > 0
        ? findLowestCashMonthAcrossYears(cumulatives, fyStartMonth)
        : null;
    return {
      value: trough,
      note:
        "Raw lib helpers per registry accessor. Lender packet rescales monthly inflow + locks year-end to canonical accrual cash; M4 owns surface-vs-canonical diffing.",
    };
  },

  "reserve-months-last-year": ({ consultant }) => {
    const last = consultant.cumulativeFinancials.at(-1);
    return { value: last?.reserveMonths ?? null };
  },

  // ── Debt ─────────────────────────────────────────────────────────────
  "dscr-year-series-normalized": ({ consultant }) => ({
    value: consultant.normalizedView.normalized.dscr,
  }),

  "dscr-year-series-reported": ({ consultant }) => ({
    value: consultant.normalizedView.reported.dscr,
  }),

  "dscr-min-normalized": ({ narrativeBundle }) => ({
    value: {
      min: narrativeBundle.dscrMinNormalized,
      year: narrativeBundle.dscrMinNormalizedYear,
    },
  }),

  "annual-debt-service": ({ modelData }) => {
    // Registry accessor: `computeAnnualDebt(capitalAndDebtRows, year)`
    // — sum of P+I across every loan row for each modeled year. A
    // loan contributes its constant amortized payment within its
    // term and zero afterward.
    const raw = modelData as unknown as Record<string, unknown>;
    const rows = Array.isArray(raw.capitalAndDebtRows)
      ? (raw.capitalAndDebtRows as Array<Record<string, unknown>>)
      : [];
    const perYear: number[] = [0, 0, 0, 0, 0];
    for (const row of rows) {
      if (!row.isLoan) continue;
      const principal = safeNumber(row.loanPrincipal) ?? 0;
      const rate = safeNumber(row.loanRate) ?? 0;
      const term = safeNumber(row.loanTermYears) ?? 0;
      if (principal <= 0 || rate <= 0 || term <= 0) continue;
      const annual = computeAnnualDebt(principal, rate, term);
      for (let y = 0; y < 5; y++) {
        if (y < term) perYear[y] += annual;
      }
    }
    return { value: perYear };
  },

  // ── Per-student ──────────────────────────────────────────────────────
  "revenue-per-student": ({ consultant }) => {
    const km = findKeyMetric(consultant.keyMetrics, /^Revenue per Student/i);
    return {
      value: parseCurrencyString(km?.value),
      note: km
        ? undefined
        : 'KeyMetric "Revenue per Student (Year 1)" missing on engine output.',
    };
  },

  "cost-per-student": ({ consultant }) => {
    const km = findKeyMetric(consultant.keyMetrics, /^Cost per Student/i);
    return {
      value: parseCurrencyString(km?.value),
      note: km
        ? undefined
        : 'KeyMetric "Cost per Student (Year 1)" missing on engine output.',
    };
  },

  // ── Capacity / break-even ────────────────────────────────────────────
  "capacity-utilization-y1": ({ consultant }) => {
    // Engine actually emits `Capacity Utilization (Year ${lastYearNum})`
    // (last modeled year, not Y1). Registry label says Y1 — that's a
    // Phase 2 shape mismatch to triage in M4 (#976).
    const km = findKeyMetric(consultant.keyMetrics, /^Capacity Utilization/i);
    return {
      value: parsePercentString(km?.value),
      note: km
        ? 'Engine KeyMetric is "Capacity Utilization (Year N)" (last year, not Y1). Registry id says Y1 — flagged for M4 #976 triage.'
        : "No Capacity Utilization KeyMetric (school has no maxCapacity).",
    };
  },

  "break-even-year": ({ consultant }) => ({
    value: breakEvenYearFromAnnual(
      consultant.normalizedView.reported.netIncome.map((ni) => ({
        netIncome: ni,
      })),
    ),
  }),

  "break-even-students-y1": ({ consultant }) => ({
    value: consultant.lenderStressTests.base.breakEvenStudents[0] ?? null,
  }),

  // ── Stress tests ─────────────────────────────────────────────────────
  "stress-base-net-income": ({ consultant }) => ({
    value: consultant.lenderStressTests.base.netIncome,
  }),

  "stress-scenario-dscr": ({ consultant }) => ({
    value: consultant.lenderStressTests.scenarios.map((s) => ({
      name: s.name,
      dscr: s.dscr,
    })),
  }),

  "stress-scenario-ending-cash": ({ consultant }) => ({
    value: consultant.lenderStressTests.scenarios.map((s) => ({
      name: s.name,
      endingCash: s.endingCash,
    })),
  }),

  "stress-scenario-net-income": ({ consultant }) => ({
    value: consultant.lenderStressTests.scenarios.map((s) => ({
      name: s.name,
      netIncome: s.netIncome,
    })),
  }),

  "stress-worst-scenario": ({ narrativeBundle }) => ({
    value: narrativeBundle.worstStress,
  }),

  "stress-negative-y5-scenarios": ({ narrativeBundle }) => ({
    value: narrativeBundle.negativeY5StressScenarios,
  }),

  // ── Founder comp ─────────────────────────────────────────────────────
  "founder-comp-adjustment": ({ consultant }) => {
    const fc = consultant.normalizedView.founderComp;
    return {
      value: {
        hasAdjustment: fc.hasAdjustment,
        totalDelta: fc.totalDelta,
        perYearDelta: fc.delta,
      },
    };
  },

  // ── Rating ───────────────────────────────────────────────────────────
  "lender-readiness-uncapped": ({ consultant }) => ({
    value: consultant.lenderReadinessResult.uncappedRating,
  }),

  "lender-readiness-effective": ({ consultant }) => ({
    value: consultant.lenderReadinessResult.effectiveRating,
  }),

  "lender-readiness-cap": ({ consultant }) => {
    const cap = consultant.lenderReadinessResult.cap;
    return {
      value: {
        applied: cap.applied,
        reason: cap.reason,
        pendingEvidenceCount: cap.pendingEvidenceCount,
        totalAssumptionCount: cap.totalAssumptionCount,
        taggedCount: cap.taggedCount,
        taggedFraction: cap.taggedFraction,
      },
    };
  },

  "biggest-strength": ({ consultant }) => ({
    value: consultant.biggestStrength,
  }),

  "biggest-risk": ({ consultant }) => ({
    value: consultant.biggestRisk,
  }),

  // ── Assumptions / evidence ───────────────────────────────────────────
  "assumption-registry": () => ({
    // Persona-independent: same catalog across every fixture.
    value: Object.keys(ASSUMPTION_REGISTRY).sort(),
  }),

  // ── Narrative ────────────────────────────────────────────────────────
  "narrative-commentary-bundle": ({ narrativeBundle }) => ({
    value: narrativeBundle,
  }),
};

// ───────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────

/**
 * Returns the set of metric ids that have a registered resolver.
 * Used by the coverage assertion in the M3 test.
 */
export function listResolverMetricIds(): string[] {
  return Object.keys(RESOLVERS).sort();
}

/**
 * Returns metric ids in the registry that have no resolver in this
 * layer. The M3 test asserts this list is empty so adding a metric
 * to the registry without a resolver fails the api-server test
 * suite loudly.
 */
export function findRegistryGaps(): string[] {
  const resolved = new Set(listResolverMetricIds());
  return listCanonicalMetricIds().filter((id) => !resolved.has(id));
}

/**
 * Returns resolver ids that are NOT in the registry — catches
 * stale resolvers left behind when a metric is renamed or removed.
 */
export function findResolverGaps(): string[] {
  const registered = new Set(listCanonicalMetricIds());
  return listResolverMetricIds().filter((id) => !registered.has(id));
}

/**
 * Compute the canonical value for every metric × persona pairing.
 * Runs the consultant engine once per fixture, then dispatches
 * resolvers. Throws if any resolver throws — fail loudly so M5
 * never silently anchors against a partial map.
 */
export async function computeCanonicalValuesForFixture(
  fixture: PersonaFixture,
): Promise<CanonicalValueRecord[]> {
  const consultant = await runConsultantEngine(fixture.data);
  const narrativeBundle = buildNarrativeBundle(
    fixture.data as unknown as ModelData,
    consultant,
  );
  const ctx: ComputeResolverContext = {
    fixture,
    modelData: fixture.data as unknown as ModelData,
    consultant,
    narrativeBundle,
  };
  const out: CanonicalValueRecord[] = [];
  for (const metric of CANONICAL_METRICS) {
    const resolver = RESOLVERS[metric.id];
    if (!resolver) {
      throw new Error(
        `[canonical/compute] No resolver registered for metric "${metric.id}". ` +
          `Add one in artifacts/api-server/src/lib/integrity/canonical/compute.ts.`,
      );
    }
    const { value, note } = resolver(ctx);
    out.push({ metricId: metric.id, persona: fixture.slug, value, note });
  }
  return out;
}

/**
 * Convenience: compute canonical values for the entire persona
 * battery (Oakwood / Riverside / Liberty). Result is keyed by
 * `metricId` then `persona` for direct M5 anchor lookup.
 */
export async function computeCanonicalValuesForFixtures(
  fixtures: readonly PersonaFixture[],
): Promise<Map<string, Map<PersonaSlug, CanonicalValueRecord>>> {
  const out = new Map<string, Map<PersonaSlug, CanonicalValueRecord>>();
  for (const f of fixtures) {
    const records = await computeCanonicalValuesForFixture(f);
    for (const r of records) {
      if (!out.has(r.metricId)) out.set(r.metricId, new Map());
      out.get(r.metricId)!.set(r.persona, r);
    }
  }
  return out;
}

/** Re-exported for tests / harness convenience. */
export type { CanonicalMetric };
