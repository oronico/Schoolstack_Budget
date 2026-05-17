/**
 * Task #930 / M1 — Primary Data Source Registry.
 *
 * This is the SINGLE SOURCE OF TRUTH for every number the SchoolStack
 * Budget product renders to a founder, lender, or board reviewer. For
 * each canonical metric we record:
 *
 *   - `id`          stable slug used in tests, harness, and the
 *                   parallel `docs/primary-data-source-registry.md`
 *                   reviewer-facing doc.
 *   - `category`    high-level grouping (revenue, cash, debt, ...).
 *   - `label`       human-readable name (matches PDF / UI copy).
 *   - `unit`        usd | pct | ratio | months | count | year |
 *                   enum | text. Drives the M2 extractor's diffing
 *                   tolerance — currency is rounded to dollars, ratios
 *                   to 2 decimals, months to 1 decimal, etc.
 *   - `canonical`   the ONE function/field path that every other
 *                   surface MUST reconcile to. `module` is the
 *                   import path; `accessor` is a human-readable
 *                   dotted path (e.g. "ConsultantOutput.dscr[0]").
 *                   When a metric has a parametric accessor (e.g.
 *                   "per year y in 0..4") we document the index
 *                   semantics in `notes`.
 *   - `surfaces`    EVERY downstream consumer that prints this
 *                   value. M5 (#977) walks this list and asserts
 *                   each surface returns the same number for a
 *                   shared fixture set.
 *   - `notes`       reviewer-facing prose. Anything subtle about
 *                   the metric (sign convention, sentinel values,
 *                   composition, what "year" means, etc.).
 *   - `relatedTasks`  past tasks that touched this metric. Helps
 *                   the M4 triage step find the engineer who last
 *                   moved the canonical definition.
 *
 * Maintenance rule (also asserted in
 * `__tests__/canonical-metrics-registry.test.ts`):
 *
 *   - Every entry must have at least one surface.
 *   - Every `id` must be unique and kebab-case.
 *   - `canonical.module` must point at `@workspace/finance` or an
 *     api-server lib path (no UI surfaces — the canonical source
 *     never lives in a render layer).
 *   - When adding a new metric to any surface, you MUST add a
 *     registry entry first, then have M5's harness verify the
 *     surface reads the same canonical accessor.
 */

export type MetricCategory =
  | "revenue"
  | "cash"
  | "debt"
  | "per_student"
  | "capacity_breakeven"
  | "stress"
  | "founder_comp"
  | "rating"
  | "assumptions"
  | "narrative";

export type MetricUnit =
  | "usd"
  | "pct"
  | "ratio"
  | "months"
  | "count"
  | "year"
  | "enum"
  | "text";

export interface MetricSurface {
  /** File path (relative to repo root) that renders this metric. */
  path: string;
  /** Short description of where in the file the metric appears. */
  location: string;
}

/**
 * How a value should be rounded when extracted and printed for diffing.
 * `decimals` is the number of fractional digits the canonical value
 * should be rounded to before comparison. M2's extractor uses this to
 * normalize raw values pulled out of PDFs / JSON / DOM.
 */
export interface MetricRounding {
  decimals: number;
  /** "half_up" (default) or "trunc"; only "half_up" used today. */
  mode?: "half_up" | "trunc";
}

/**
 * Per-metric reconciliation tolerance used by M4 (integrity report) and
 * M5 (CI harness). A surface value is considered "in sync" with the
 * canonical value when either `abs(diff) <= abs` OR
 * `abs(diff) / abs(canonical) <= rel`. `abs` is in the metric's unit
 * (USD for unit=usd, ratio points for unit=ratio, etc.).
 */
export interface MetricTolerance {
  abs?: number;
  rel?: number;
}

export interface CanonicalMetric {
  id: string;
  category: MetricCategory;
  label: string;
  /**
   * One-sentence reviewer-facing definition of what this metric means.
   * Defaults to `label` if not explicitly set (most labels are already
   * self-describing); override when the metric needs disambiguation.
   */
  description: string;
  unit: MetricUnit;
  rounding: MetricRounding;
  tolerance: MetricTolerance;
  canonical: {
    module: string;
    accessor: string;
  };
  surfaces: MetricSurface[];
  notes: string;
  relatedTasks: number[];
}

/**
 * Input form: description / rounding / tolerance are optional and
 * filled by `materializeMetric()` from sensible per-unit defaults.
 * This keeps entries terse while still guaranteeing every materialized
 * `CanonicalMetric` carries all three fields (asserted by lint).
 */
export type CanonicalMetricInput = Omit<
  CanonicalMetric,
  "description" | "rounding" | "tolerance"
> & {
  description?: string;
  rounding?: MetricRounding;
  tolerance?: MetricTolerance;
};

/**
 * Per-unit defaults. M4/M5 use these as the baseline tolerance when
 * an entry does not override. Override on individual entries when a
 * tighter / looser bound is justified.
 */
export function defaultRounding(unit: MetricUnit): MetricRounding {
  switch (unit) {
    case "usd":
      return { decimals: 0 };
    case "pct":
      return { decimals: 1 };
    case "ratio":
      return { decimals: 2 };
    case "months":
      return { decimals: 1 };
    case "count":
    case "year":
      return { decimals: 0 };
    case "enum":
    case "text":
      return { decimals: 0 };
  }
}

export function defaultTolerance(unit: MetricUnit): MetricTolerance {
  switch (unit) {
    case "usd":
      // Within $1 OR 0.1% relative — accommodates rounding-mode drift
      // between the engine ($) and PDFs (rounded display).
      return { abs: 1, rel: 0.001 };
    case "pct":
      return { abs: 0.1 };
    case "ratio":
      return { abs: 0.01 };
    case "months":
      return { abs: 0.1 };
    case "count":
    case "year":
      return { abs: 0 };
    case "enum":
    case "text":
      // Exact string match.
      return { abs: 0 };
  }
}

export function materializeMetric(m: CanonicalMetricInput): CanonicalMetric {
  return {
    ...m,
    description: m.description ?? m.label,
    rounding: m.rounding ?? defaultRounding(m.unit),
    tolerance: m.tolerance ?? defaultTolerance(m.unit),
  };
}

/**
 * The registry. Ordered by category, then by render order within
 * each category. Keep ordering stable — the generated markdown view
 * preserves it.
 *
 * Entries are written in the terse `CanonicalMetricInput` form;
 * `materializeMetric` fills in description / rounding / tolerance
 * defaults at module load so every exported `CanonicalMetric` has
 * all three fields (asserted by the lint test).
 */
const RAW_METRICS: readonly CanonicalMetricInput[] = [
  // ─────────────────────────────────────────────────────────────────
  // REVENUE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "revenue-total-year",
    category: "revenue",
    label: "Total revenue by year (Y1–Y5)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "computeYearFinancialsFromData(modelData)[y].totalRevenue",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "computeYearlyData → YearData.totalRevenue (lender + board)",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildFiveYearProjection — 5-Year Change in Net Assets Projection table revenue row",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Five-year overview chart revenue series",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender + Board commentary base-case figures",
      },
    ],
    notes:
      "Year index is 0-based in code, 1-based in UI/PDF (Year 1 = y=0). Includes funding-mix corrections from #860. Per #912, every renderer must route through computeYearFinancialsFromData; local re-implementations using computeRevenueForYear caused $33K-$900K drift on microschool/charter models pre-fix.",
    relatedTasks: [860, 912, 915, 925],
  },
  {
    id: "revenue-per-line-y1-value",
    category: "revenue",
    label: "Per-line revenue value (Year 1)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/workbook-helpers.ts",
      accessor: "driverVal(row.amounts, 0, row.driverType, students, row.escalationRate)",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildRevenueModel → formatRevenueRowY1Value (Revenue Lines table)",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildAppendixAssumptions revenue rows",
      },
    ],
    notes:
      "#925: rows with driverType='percent_of_base' (e.g. scholarships_aid) store a RATE, not USD. Must render as '12.0% of gross tuition', NOT '$12'. Production data migration plan in M6 (#978) covers backfill of any models whose rows are mis-typed.",
    relatedTasks: [925, 927],
  },
  {
    id: "revenue-quality-by-bucket",
    category: "revenue",
    label: "Revenue quality by bucket (contracted / projected / donor / policy)",
    unit: "pct",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.revenueQuality[y].pctByBucket.{contracted|projected|donor_dependent|policy_dependent}",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildRevenueModel linkedMetrics 'Year 1 Contracted Revenue %'",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary revenue-quality paragraph (×100 for percent form)",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Revenue Quality breakdown card",
      },
    ],
    notes:
      "Engine returns 0..1 fractions; renderers multiply by 100 for percent display. #927 reclassified voucher revenue from policy_dependent → contracted for ESA-funded states with executed contracts; M6 covers the prod data migration.",
    relatedTasks: [613, 927],
  },
  {
    id: "revenue-composition",
    category: "revenue",
    label: "Revenue composition (tuition / public / philanthropy %)",
    unit: "pct",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.revenueComposition[y].{tuitionPct|publicPct|philanthropyPct}",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildRevenueModel narrative + linkedMetrics",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Revenue composition pie chart",
      },
    ],
    notes: "0..1 fractions, formatted as 'X.X%' via pct() helper.",
    relatedTasks: [],
  },
  {
    id: "revenue-hard-coverage-y1",
    category: "revenue",
    label: "Hard revenue coverage ratio (Year 1)",
    unit: "ratio",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.revenueQuality[0].hardRevenueCoverage",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildRevenueModel linkedMetrics 'Hard Revenue Coverage (Y1)'",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Revenue Quality card hard-coverage stat",
      },
    ],
    notes:
      "May be null when there are no fixed costs. Formatted as 'X.XXx' (×, not lowercase x in PDF style guide).",
    relatedTasks: [613],
  },

  // ─────────────────────────────────────────────────────────────────
  // CASH
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cash-runway-months",
    category: "cash",
    label: "Cash runway (months)",
    unit: "months",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.cashRunwayMonths",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/format-runway.ts",
        location: "formatRunwayMonths / formatRunwayMonthsShort (canonical formatter)",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildExecutiveSummary linkedMetrics 'Cash Runway'",
      },
      {
        path: "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx",
        location: "CashRunwayCard",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary runway paragraph (FigureScribe.monthsCount)",
      },
    ],
    notes:
      "#937: cashRunwayMonths is a fractional coverage ratio (year-end cash / monthly fixed costs), NOT a calendar count. Every surface MUST route through formatRunwayMonths so the 60+ months cap and 1-decimal formatting are consistent.",
    relatedTasks: [937],
  },
  {
    id: "cash-trough-ending-cash",
    category: "cash",
    label: "Trough ending cash (lowest year-end)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
      accessor: "buildNarrativeBundle → troughEndingCash (= min(openingCash + cumulativeNetIncome[y]))",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary trough paragraph",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildCashFlow — Cash flow section trough callout",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Cash trough KPI card",
      },
    ],
    notes:
      "Annual granularity (computed from cumulativeFinancials). For intra-year low see cash-monthly-low.",
    relatedTasks: [],
  },
  {
    id: "cash-monthly-low",
    category: "cash",
    label: "Lowest monthly ending cash (across all years)",
    unit: "usd",
    canonical: {
      module: "@workspace/finance",
      accessor: "findLowestCashMonthAcrossYears(computeYear1MonthlyCashFlow(...))",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildCashFlow — Monthly cash flow trough callout",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Monthly cash low coaching flag",
      },
    ],
    notes: "Monthly granularity. Names the {year, month} where cash bottoms.",
    relatedTasks: [],
  },
  {
    id: "reserve-months-last-year",
    category: "cash",
    label: "Operating reserve months (last modeled year)",
    unit: "months",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.cumulativeFinancials[last].reserveMonths",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary reserves sentence (uses reserveLastYearNumber for year label)",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Reserve months KPI",
      },
    ],
    notes:
      "Calendar months, not coverage ratio (distinct from cash-runway-months). Last year = cumulativeFinancials[length-1].",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // DEBT
  // ─────────────────────────────────────────────────────────────────
  {
    id: "dscr-year-series-normalized",
    category: "debt",
    label: "DSCR series (normalized, Y1–Y5)",
    unit: "ratio",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.normalizedView.normalized.dscr[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildDebtService — DSCR by year table",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary base-case DSCR figures",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "DSCR trend chart",
      },
    ],
    notes:
      "Normalized series = founder comp at market (lender-primary). DSCR=0 is a sentinel meaning 'no debt service modeled this year' — must be filtered before min/max comparisons.",
    relatedTasks: [],
  },
  {
    id: "dscr-year-series-reported",
    category: "debt",
    label: "DSCR series (reported / founder plan)",
    unit: "ratio",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.normalizedView.reported.dscr[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildDebtService — DSCR table 'as reported' column when founderCompHasAdjustment",
      },
    ],
    notes:
      "Only meaningful when normalizedView.founderComp.hasAdjustment is true. Otherwise reported === normalized.",
    relatedTasks: [],
  },
  {
    id: "dscr-min-normalized",
    category: "debt",
    label: "Minimum DSCR across modeled years (normalized)",
    unit: "ratio",
    canonical: {
      module: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
      accessor: "buildNarrativeBundle → dscrMinNormalized (filters 0 sentinels)",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary 'toughest year' paragraph",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildDebtService — Debt service section min-DSCR callout",
      },
    ],
    notes: "Ignores DSCR=0 (no-debt-service sentinel). Paired with year label dscrMinNormalizedYear.",
    relatedTasks: [],
  },
  {
    id: "annual-debt-service",
    category: "debt",
    label: "Annual debt service by year",
    unit: "usd",
    canonical: {
      module: "@workspace/finance",
      accessor: "computeAnnualDebt(capitalAndDebtRows, year)",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildDebtService — Debt service table principal+interest column",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "YearData.debtService (diagnostic fallback when canonical engine row missing)",
      },
    ],
    notes:
      "Sum of principal + interest. Per-line amortization via computeAnnualDebtForYear / computeInterestPortion / computePrincipalPortion.",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // PER-STUDENT
  // ─────────────────────────────────────────────────────────────────
  {
    id: "revenue-per-student",
    category: "per_student",
    label: "Revenue per student (by year)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.keyMetrics[name='Revenue per student'].value",
    },
    surfaces: [
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "KPI grid revenuePerStudent card",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildHealthAssessment linkedMetrics",
      },
    ],
    notes: "totalRevenue / enrollment for the named year. Year 1 by default.",
    relatedTasks: [],
  },
  {
    id: "cost-per-student",
    category: "per_student",
    label: "Cost per student (by year)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.keyMetrics[name='Cost per student'].value",
    },
    surfaces: [
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "KPI grid costPerStudent card",
      },
    ],
    notes: "totalExpenses / enrollment for the named year.",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // CAPACITY / BREAK-EVEN
  // ─────────────────────────────────────────────────────────────────
  {
    id: "capacity-utilization-y1",
    category: "capacity_breakeven",
    label: "Capacity utilization (Year 1)",
    unit: "pct",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.keyMetrics[name~='Capacity utilization'].value",
    },
    surfaces: [
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Capacity KPI card",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildFacilityKPIs — Facility KPIs section",
      },
    ],
    notes: "enrollment[y] / schoolProfile.maxCapacity. Null when maxCapacity is missing.",
    relatedTasks: [],
  },
  {
    id: "break-even-year",
    category: "capacity_breakeven",
    label: "Break-even year (first cumulative-positive year)",
    unit: "year",
    canonical: {
      module: "@workspace/finance",
      accessor: "breakEvenYearFromAnnual(cumulativeFinancials)",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary break-even sentence",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Break-even year KPI card",
      },
    ],
    notes:
      "First year where cumulativeNetIncome >= 0. Null when the school never breaks even within the modeled window.",
    relatedTasks: [],
  },
  {
    id: "break-even-students-y1",
    category: "capacity_breakeven",
    label: "Break-even students (Year 1)",
    unit: "count",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.lenderStressTests.base.breakEvenStudents[0]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary 'you need X students to break even' line",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildFiveYearProjection — Break-even callout under 5-year projection",
      },
    ],
    notes:
      "Engine derives from fixed/variable cost decomposition. Utilization = breakEvenStudents / maxCapacity (see break-even-utilization-y1).",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // STRESS TESTS
  // ─────────────────────────────────────────────────────────────────
  {
    id: "stress-base-net-income",
    category: "stress",
    label: "Base scenario net income (Y1–Y5)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.lenderStressTests.base.netIncome[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildStressTests — Stress tests table base row",
      },
    ],
    notes: "Must equal canonicalYf[y].netIncome modulo founder-comp normalization choice.",
    relatedTasks: [],
  },
  {
    id: "stress-scenario-dscr",
    category: "stress",
    label: "Stress scenario DSCR (per-scenario, Y1–Y5)",
    unit: "ratio",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.lenderStressTests.scenarios[*].dscr[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildStressTests — DSCR cells in per-scenario rows",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Stress tests Min-DSCR column + custom stress test form result",
      },
    ],
    notes:
      "DSCR=0 sentinel ('no debt service this year') applies here too — filter before computing min. Custom UI scenarios computed via computeCustomLenderStressTest MUST share the same engine path so the in-app preview reconciles to the packet.",
    relatedTasks: [],
  },
  {
    id: "stress-scenario-ending-cash",
    category: "stress",
    label: "Stress scenario ending cash (per-scenario, Y1–Y5)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.lenderStressTests.scenarios[*].endingCash[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildStressTests — Min-cash cells in per-scenario rows",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Stress tests Min-cash column + custom stress test form result",
      },
    ],
    notes: "Min over the 5-year series gives the worst-cash readout the lender focuses on.",
    relatedTasks: [],
  },
  {
    id: "stress-scenario-net-income",
    category: "stress",
    label: "Stress scenario net income (per-scenario, Y1–Y5)",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.lenderStressTests.scenarios[*].netIncome[y]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildStressTests — Y5 net income cells; powers the 'N of M negative Y5' headline",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "negativeY5StressScenarios bundle (drives lender closing paragraph)",
      },
    ],
    notes: "Same array feeds the #918 negative-Y5 detection — both surfaces MUST read netIncome[4] from this list.",
    relatedTasks: [918],
  },
  {
    id: "stress-worst-scenario",
    category: "stress",
    label: "Worst-case stress scenario",
    unit: "text",
    canonical: {
      module: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
      accessor: "buildNarrativeBundle → worstStress",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary closing paragraph",
      },
    ],
    notes:
      "#924 canonical criterion: PRIMARY = lowest non-zero finite min DSCR across the scenario's 5 years; TIEBREAK = largest Y1 net income decline vs. base. Documented so the prose claim is reproducible from the Stress Testing table.",
    relatedTasks: [924],
  },
  {
    id: "stress-negative-y5-scenarios",
    category: "stress",
    label: "Stress scenarios with negative Y5 net income",
    unit: "count",
    canonical: {
      module: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
      accessor: "buildNarrativeBundle → negativeY5StressScenarios[]",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary closing paragraph (names failing scenarios)",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildStressTests — 'N of M scenarios result in negative Y5 net income' headline",
      },
    ],
    notes:
      "#918: both surfaces must read netIncome[4] from the same scenarios[] array so the commentary never says 'no major red flags' when the table on the same packet shows scenarios in the red.",
    relatedTasks: [918],
  },

  // ─────────────────────────────────────────────────────────────────
  // FOUNDER COMP / NORMALIZATION
  // ─────────────────────────────────────────────────────────────────
  {
    id: "founder-comp-adjustment",
    category: "founder_comp",
    label: "Founder compensation normalization adjustment",
    unit: "usd",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.normalizedView.founderComp.{hasAdjustment, totalDelta, perYearDelta[]}",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Lender commentary 'normalization' paragraph (founderCompHasAdjustment + totalDelta)",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Founder comp normalization callout",
      },
    ],
    notes:
      "Delta = market salary − planned draw, summed across modeled years. Only render the paragraph when hasAdjustment===true.",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // RATING (#929)
  // ─────────────────────────────────────────────────────────────────
  {
    id: "lender-readiness-uncapped",
    category: "rating",
    label: "Lender readiness — uncapped rating",
    unit: "enum",
    canonical: {
      module: "artifacts/api-server/src/lib/lender-readiness-caps.ts",
      accessor: "applyConfidenceCap(...).uncappedRating",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-lender-packet.ts",
        location: "lenderReadiness.result.uncappedRating",
      },
    ],
    notes:
      "#929: the rating computed purely from financial signals, BEFORE evidence-tagging cap is applied. Internal-only — consumers should display effectiveRating unless explicitly contrasting the two.",
    relatedTasks: [929],
  },
  {
    id: "lender-readiness-effective",
    category: "rating",
    label: "Lender readiness — effective (displayed) rating",
    unit: "enum",
    canonical: {
      module: "artifacts/api-server/src/lib/lender-readiness-caps.ts",
      accessor: "applyConfidenceCap(...).effectiveRating",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-lender-packet.ts",
        location: "lenderReadiness.status + lenderReadiness.result.effectiveRating",
      },
      {
        path: "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx",
        location: "NarrativeHeader readiness banner",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Lender readiness card",
      },
    ],
    notes:
      "#929: capped form. One of 'Strong' | 'Almost There' | 'Needs Work' | 'Not Yet Ready'. 'Almost There' is the new mid-tier produced by the confidence cap at 25–50% tagged evidence; UI must share amber treatment with 'Needs Work'.",
    relatedTasks: [929],
  },
  {
    id: "lender-readiness-cap",
    category: "rating",
    label: "Lender readiness — confidence cap metadata",
    unit: "text",
    canonical: {
      module: "artifacts/api-server/src/lib/lender-readiness-caps.ts",
      accessor: "applyConfidenceCap(...).cap.{applied, reason, pendingEvidenceCount, totalAssumptionCount, taggedCount, taggedFraction}",
    },
    surfaces: [
      {
        path: "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx",
        location: "Cap callout (testid readiness-cap-callout-packet)",
      },
      {
        path: "artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx",
        location: "Cap-preview CTA on consultant analysis view (#966)",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-lender-packet.ts",
        location: "Pre-rendered cap callout string (used verbatim on PDF cover)",
      },
    ],
    notes:
      "#929 + #966: pre-rendered callout string is the source of truth — PDF cover and in-app banner BOTH print it verbatim so the two surfaces never disagree.",
    relatedTasks: [929, 966],
  },
  {
    id: "biggest-strength",
    category: "rating",
    label: "Biggest strength (one-liner)",
    unit: "text",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.biggestStrength",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildExecutiveSummary linkedMetrics — biggestStrength entry",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Narrative bundle, surfaced in commentary prose (biggestStrength)",
      },
    ],
    notes: "Engine-authored — never recompute in renderers.",
    relatedTasks: [],
  },
  {
    id: "biggest-risk",
    category: "rating",
    label: "Biggest risk (one-liner)",
    unit: "text",
    canonical: {
      module: "artifacts/api-server/src/lib/consultant-engine.ts",
      accessor: "ConsultantOutput.biggestRisk",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildExecutiveSummary linkedMetrics — biggestRisk entry",
      },
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "Narrative bundle (biggestRisk)",
      },
    ],
    notes: "Engine-authored.",
    relatedTasks: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // ASSUMPTIONS / EVIDENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "assumption-registry",
    category: "assumptions",
    label: "Assumption registry (every tagged input)",
    unit: "text",
    canonical: {
      module: "@workspace/finance",
      accessor: "ASSUMPTION_REGISTRY",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-packet-data.ts",
        location: "buildAppendixAssumptions",
      },
      {
        path: "artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx",
        location: "Per-assumption evidence-tagging card (drives cap denominator)",
      },
      {
        path: "artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceRollupCard.tsx",
        location: "Rollup card showing tagged / total count across the wizard",
      },
    ],
    notes:
      "The single declarative table of every assumption the engine reads. Drives both the lender-packet appendix AND the cap denominator (totalAssumptionCount). Adding a new assumption surface MUST add a row here first.",
    relatedTasks: [929],
  },

  // ─────────────────────────────────────────────────────────────────
  // NARRATIVE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "narrative-commentary-bundle",
    category: "narrative",
    label: "Narrative source bundle (lender + board commentary)",
    unit: "text",
    canonical: {
      module: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
      accessor: "buildNarrativeBundle(modelData, consultantOutput)",
    },
    surfaces: [
      {
        path: "artifacts/api-server/src/lib/packets/build-narrative-commentary.ts",
        location: "buildLenderCommentary / buildBoardCommentary",
      },
      {
        path: "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx",
        location: "CommentaryBlock lender",
      },
      {
        path: "artifacts/school-financial-model/src/components/export/BoardPacketPreview.tsx",
        location: "CommentaryBlock board",
      },
    ],
    notes:
      "#617: every numeric figure in the rendered prose MUST come from a FigureScribe formatter so the guard test can prove no hallucinated numbers slipped in. Bundle is surfaced on the packet JSON for in-app 'Regenerate' to refresh prose without re-fetching the whole packet.",
    relatedTasks: [617, 918, 924, 937],
  },
];

/**
 * Materialized registry. Every entry has `description`, `rounding`,
 * and `tolerance` filled in (from per-entry overrides or per-unit
 * defaults). Downstream consumers (M2–M5) read from this.
 */
export const CANONICAL_METRICS: readonly CanonicalMetric[] =
  RAW_METRICS.map(materializeMetric);

/**
 * Lookup helper. Throws if the id is unknown — callers (the M5
 * harness, M2 extractor) should fail loudly if they reference a
 * stale id rather than silently skipping a metric.
 */
export function getCanonicalMetric(id: string): CanonicalMetric {
  const found = CANONICAL_METRICS.find((m) => m.id === id);
  if (!found) {
    throw new Error(
      `[canonical-metrics] Unknown metric id "${id}". ` +
        `Add it to lib/finance/src/registry/canonical-metrics.ts.`,
    );
  }
  return found;
}

/** All metric ids, in registry order. */
export function listCanonicalMetricIds(): string[] {
  return CANONICAL_METRICS.map((m) => m.id);
}

/** Filter helper used by the M4 integrity report. */
export function metricsByCategory(category: MetricCategory): CanonicalMetric[] {
  return CANONICAL_METRICS.filter((m) => m.category === category);
}
