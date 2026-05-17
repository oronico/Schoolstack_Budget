# Primary Data Source Registry

_Generated from `lib/finance/src/registry/canonical-metrics.ts`. Do not edit by hand — see the registry README for how to add metrics._

This document lists every canonical value the SchoolStack Budget product renders, the single source-of-truth accessor for that value, and every downstream surface that prints it. Every surface MUST reconcile to its canonical accessor (verified by the M5 cross-surface harness).
## Revenue

### Total revenue by year (Y1–Y5)

- **id:** `revenue-total-year`
- **description:** Total revenue by year (Y1–Y5)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `computeYearFinancialsFromData(modelData)[y].totalRevenue` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** #860, #912, #915, #925

**Notes.** Year index is 0-based in code, 1-based in UI/PDF (Year 1 = y=0). Includes funding-mix corrections from #860. Per #912, every renderer must route through computeYearFinancialsFromData; local re-implementations using computeRevenueForYear caused $33K-$900K drift on microschool/charter models pre-fix.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | computeYearlyData → YearData.totalRevenue (lender + board) |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildFiveYearProjection — 5-Year Change in Net Assets Projection table revenue row |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Five-year overview chart revenue series |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender + Board commentary base-case figures |

### Per-line revenue value (Year 1)

- **id:** `revenue-per-line-y1-value`
- **description:** Per-line revenue value (Year 1)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `driverVal(row.amounts, 0, row.driverType, students, row.escalationRate)` (in `artifacts/api-server/src/lib/workbook-helpers.ts`)
- **related tasks:** #925, #927

**Notes.** #925: rows with driverType='percent_of_base' (e.g. scholarships_aid) store a RATE, not USD. Must render as '12.0% of gross tuition', NOT '$12'. Production data migration plan in M6 (#978) covers backfill of any models whose rows are mis-typed.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildRevenueModel → formatRevenueRowY1Value (Revenue Lines table) |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildAppendixAssumptions revenue rows |

### Revenue quality by bucket (contracted / projected / donor / policy)

- **id:** `revenue-quality-by-bucket`
- **description:** Revenue quality by bucket (contracted / projected / donor / policy)
- **unit:** pct
- **rounding:** 1 decimals (half_up)
- **tolerance:** abs ≤ 0.1
- **canonical:** `ConsultantOutput.revenueQuality[y].pctByBucket.{contracted|projected|donor_dependent|policy_dependent}` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** #613, #927

**Notes.** Engine returns 0..1 fractions; renderers multiply by 100 for percent display. #927 reclassified voucher revenue from policy_dependent → contracted for ESA-funded states with executed contracts; M6 covers the prod data migration.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildRevenueModel linkedMetrics 'Year 1 Contracted Revenue %' |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary revenue-quality paragraph (×100 for percent form) |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Revenue Quality breakdown card |

### Revenue composition (tuition / public / philanthropy %)

- **id:** `revenue-composition`
- **description:** Revenue composition (tuition / public / philanthropy %)
- **unit:** pct
- **rounding:** 1 decimals (half_up)
- **tolerance:** abs ≤ 0.1
- **canonical:** `ConsultantOutput.revenueComposition[y].{tuitionPct|publicPct|philanthropyPct}` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** 0..1 fractions, formatted as 'X.X%' via pct() helper.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildRevenueModel narrative + linkedMetrics |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Revenue composition pie chart |

### Hard revenue coverage ratio (Year 1)

- **id:** `revenue-hard-coverage-y1`
- **description:** Hard revenue coverage ratio (Year 1)
- **unit:** ratio
- **rounding:** 2 decimals (half_up)
- **tolerance:** abs ≤ 0.01
- **canonical:** `ConsultantOutput.revenueQuality[0].hardRevenueCoverage` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** #613

**Notes.** May be null when there are no fixed costs. Formatted as 'X.XXx' (×, not lowercase x in PDF style guide).

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildRevenueModel linkedMetrics 'Hard Revenue Coverage (Y1)' |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Revenue Quality card hard-coverage stat |

## Cash

### Cash runway (months)

- **id:** `cash-runway-months`
- **description:** Cash runway (months)
- **unit:** months
- **rounding:** 1 decimals (half_up)
- **tolerance:** abs ≤ 0.1
- **canonical:** `ConsultantOutput.cashRunwayMonths` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** #937

**Notes.** #937: cashRunwayMonths is a fractional coverage ratio (year-end cash / monthly fixed costs), NOT a calendar count. Every surface MUST route through formatRunwayMonths so the 60+ months cap and 1-decimal formatting are consistent.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/format-runway.ts` | formatRunwayMonths / formatRunwayMonthsShort (canonical formatter) |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildExecutiveSummary linkedMetrics 'Cash Runway' |
| `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx` | CashRunwayCard |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary runway paragraph (FigureScribe.monthsCount) |

### Trough ending cash (lowest year-end)

- **id:** `cash-trough-ending-cash`
- **description:** Trough ending cash (lowest year-end)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `buildNarrativeBundle → troughEndingCash (= min(openingCash + cumulativeNetIncome[y]))` (in `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts`)
- **related tasks:** —

**Notes.** Annual granularity (computed from cumulativeFinancials). For intra-year low see cash-monthly-low.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary trough paragraph |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildCashFlow — Cash flow section trough callout |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Cash trough KPI card |

### Lowest monthly ending cash (across all years)

- **id:** `cash-monthly-low`
- **description:** Lowest monthly ending cash (across all years)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `findLowestCashMonthAcrossYears(computeYear1MonthlyCashFlow(...))` (in `@workspace/finance`)
- **related tasks:** —

**Notes.** Monthly granularity. Names the {year, month} where cash bottoms.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildCashFlow — Monthly cash flow trough callout |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Monthly cash low coaching flag |

### Operating reserve months (last modeled year)

- **id:** `reserve-months-last-year`
- **description:** Operating reserve months (last modeled year)
- **unit:** months
- **rounding:** 1 decimals (half_up)
- **tolerance:** abs ≤ 0.1
- **canonical:** `ConsultantOutput.cumulativeFinancials[last].reserveMonths` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Calendar months, not coverage ratio (distinct from cash-runway-months). Last year = cumulativeFinancials[length-1].

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary reserves sentence (uses reserveLastYearNumber for year label) |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Reserve months KPI |

## Debt

### DSCR series (normalized, Y1–Y5)

- **id:** `dscr-year-series-normalized`
- **description:** DSCR series (normalized, Y1–Y5)
- **unit:** ratio
- **rounding:** 2 decimals (half_up)
- **tolerance:** abs ≤ 0.01
- **canonical:** `ConsultantOutput.normalizedView.normalized.dscr[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Normalized series = founder comp at market (lender-primary). DSCR=0 is a sentinel meaning 'no debt service modeled this year' — must be filtered before min/max comparisons.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildDebtService — DSCR by year table |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary base-case DSCR figures |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | DSCR trend chart |

### DSCR series (reported / founder plan)

- **id:** `dscr-year-series-reported`
- **description:** DSCR series (reported / founder plan)
- **unit:** ratio
- **rounding:** 2 decimals (half_up)
- **tolerance:** abs ≤ 0.01
- **canonical:** `ConsultantOutput.normalizedView.reported.dscr[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Only meaningful when normalizedView.founderComp.hasAdjustment is true. Otherwise reported === normalized.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildDebtService — DSCR table 'as reported' column when founderCompHasAdjustment |

### Minimum DSCR across modeled years (normalized)

- **id:** `dscr-min-normalized`
- **description:** Minimum DSCR across modeled years (normalized)
- **unit:** ratio
- **rounding:** 2 decimals (half_up)
- **tolerance:** abs ≤ 0.01
- **canonical:** `buildNarrativeBundle → dscrMinNormalized (filters 0 sentinels)` (in `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts`)
- **related tasks:** —

**Notes.** Ignores DSCR=0 (no-debt-service sentinel). Paired with year label dscrMinNormalizedYear.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary 'toughest year' paragraph |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildDebtService — Debt service section min-DSCR callout |

### Annual debt service by year

- **id:** `annual-debt-service`
- **description:** Annual debt service by year
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `computeAnnualDebt(capitalAndDebtRows, year)` (in `@workspace/finance`)
- **related tasks:** —

**Notes.** Sum of principal + interest. Per-line amortization via computeAnnualDebtForYear / computeInterestPortion / computePrincipalPortion.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildDebtService — Debt service table principal+interest column |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | YearData.debtService (diagnostic fallback when canonical engine row missing) |

## Per-student

### Revenue per student (by year)

- **id:** `revenue-per-student`
- **description:** Revenue per student (by year)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.keyMetrics[name='Revenue per student'].value` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** totalRevenue / enrollment for the named year. Year 1 by default.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | KPI grid revenuePerStudent card |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildHealthAssessment linkedMetrics |

### Cost per student (by year)

- **id:** `cost-per-student`
- **description:** Cost per student (by year)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.keyMetrics[name='Cost per student'].value` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** totalExpenses / enrollment for the named year.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | KPI grid costPerStudent card |

## Capacity & Break-even

### Capacity utilization (Year 1)

- **id:** `capacity-utilization-y1`
- **description:** Capacity utilization (Year 1)
- **unit:** pct
- **rounding:** 1 decimals (half_up)
- **tolerance:** abs ≤ 0.1
- **canonical:** `ConsultantOutput.keyMetrics[name~='Capacity utilization'].value` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** enrollment[y] / schoolProfile.maxCapacity. Null when maxCapacity is missing.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Capacity KPI card |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildFacilityKPIs — Facility KPIs section |

### Break-even year (first cumulative-positive year)

- **id:** `break-even-year`
- **description:** Break-even year (first cumulative-positive year)
- **unit:** year
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `breakEvenYearFromAnnual(cumulativeFinancials)` (in `@workspace/finance`)
- **related tasks:** —

**Notes.** First year where cumulativeNetIncome >= 0. Null when the school never breaks even within the modeled window.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary break-even sentence |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Break-even year KPI card |

### Break-even students (Year 1)

- **id:** `break-even-students-y1`
- **description:** Break-even students (Year 1)
- **unit:** count
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `ConsultantOutput.lenderStressTests.base.breakEvenStudents[0]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Engine derives from fixed/variable cost decomposition. Utilization = breakEvenStudents / maxCapacity (see break-even-utilization-y1).

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary 'you need X students to break even' line |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildFiveYearProjection — Break-even callout under 5-year projection |

## Stress Tests

### Base scenario net income (Y1–Y5)

- **id:** `stress-base-net-income`
- **description:** Base scenario net income (Y1–Y5)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.lenderStressTests.base.netIncome[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Must equal canonicalYf[y].netIncome modulo founder-comp normalization choice.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildStressTests — Stress tests table base row |

### Stress scenario DSCR (per-scenario, Y1–Y5)

- **id:** `stress-scenario-dscr`
- **description:** Stress scenario DSCR (per-scenario, Y1–Y5)
- **unit:** ratio
- **rounding:** 2 decimals (half_up)
- **tolerance:** abs ≤ 0.01
- **canonical:** `ConsultantOutput.lenderStressTests.scenarios[*].dscr[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** DSCR=0 sentinel ('no debt service this year') applies here too — filter before computing min. Custom UI scenarios computed via computeCustomLenderStressTest MUST share the same engine path so the in-app preview reconciles to the packet.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildStressTests — DSCR cells in per-scenario rows |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Stress tests Min-DSCR column + custom stress test form result |

### Stress scenario ending cash (per-scenario, Y1–Y5)

- **id:** `stress-scenario-ending-cash`
- **description:** Stress scenario ending cash (per-scenario, Y1–Y5)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.lenderStressTests.scenarios[*].endingCash[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Min over the 5-year series gives the worst-cash readout the lender focuses on.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildStressTests — Min-cash cells in per-scenario rows |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Stress tests Min-cash column + custom stress test form result |

### Stress scenario net income (per-scenario, Y1–Y5)

- **id:** `stress-scenario-net-income`
- **description:** Stress scenario net income (per-scenario, Y1–Y5)
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.lenderStressTests.scenarios[*].netIncome[y]` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** #918

**Notes.** Same array feeds the #918 negative-Y5 detection — both surfaces MUST read netIncome[4] from this list.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildStressTests — Y5 net income cells; powers the 'N of M negative Y5' headline |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | negativeY5StressScenarios bundle (drives lender closing paragraph) |

### Worst-case stress scenario

- **id:** `stress-worst-scenario`
- **description:** Worst-case stress scenario
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `buildNarrativeBundle → worstStress` (in `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts`)
- **related tasks:** #924

**Notes.** #924 canonical criterion: PRIMARY = lowest non-zero finite min DSCR across the scenario's 5 years; TIEBREAK = largest Y1 net income decline vs. base. Documented so the prose claim is reproducible from the Stress Testing table.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary closing paragraph |

### Stress scenarios with negative Y5 net income

- **id:** `stress-negative-y5-scenarios`
- **description:** Stress scenarios with negative Y5 net income
- **unit:** count
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `buildNarrativeBundle → negativeY5StressScenarios[]` (in `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts`)
- **related tasks:** #918

**Notes.** #918: both surfaces must read netIncome[4] from the same scenarios[] array so the commentary never says 'no major red flags' when the table on the same packet shows scenarios in the red.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary closing paragraph (names failing scenarios) |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildStressTests — 'N of M scenarios result in negative Y5 net income' headline |

## Founder Comp / Normalization

### Founder compensation normalization adjustment

- **id:** `founder-comp-adjustment`
- **description:** Founder compensation normalization adjustment
- **unit:** usd
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 1 OR rel ≤ 0.10%
- **canonical:** `ConsultantOutput.normalizedView.founderComp.{hasAdjustment, totalDelta, perYearDelta[]}` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Delta = market salary − planned draw, summed across modeled years. Only render the paragraph when hasAdjustment===true.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Lender commentary 'normalization' paragraph (founderCompHasAdjustment + totalDelta) |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Founder comp normalization callout |

## Lender Readiness Rating

### Lender readiness — uncapped rating

- **id:** `lender-readiness-uncapped`
- **description:** Lender readiness — uncapped rating
- **unit:** enum
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `applyConfidenceCap(...).uncappedRating` (in `artifacts/api-server/src/lib/lender-readiness-caps.ts`)
- **related tasks:** #929

**Notes.** #929: the rating computed purely from financial signals, BEFORE evidence-tagging cap is applied. Internal-only — consumers should display effectiveRating unless explicitly contrasting the two.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-lender-packet.ts` | lenderReadiness.result.uncappedRating |

### Lender readiness — effective (displayed) rating

- **id:** `lender-readiness-effective`
- **description:** Lender readiness — effective (displayed) rating
- **unit:** enum
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `applyConfidenceCap(...).effectiveRating` (in `artifacts/api-server/src/lib/lender-readiness-caps.ts`)
- **related tasks:** #929

**Notes.** #929 + #964 calibration: capped form. One of 'Strong' | 'Almost There' | 'Needs Work' | 'Not Yet Ready'. 'Almost There' is the mid-tier produced by the confidence cap at 30–60% tagged evidence (taggedFractionMin/Max in lender-readiness-caps.ts CAP_BANDS); UI must share amber treatment with 'Needs Work'.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-lender-packet.ts` | lenderReadiness.status + lenderReadiness.result.effectiveRating |
| `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx` | NarrativeHeader readiness banner |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Lender readiness card |

### Lender readiness — confidence cap metadata

- **id:** `lender-readiness-cap`
- **description:** Lender readiness — confidence cap metadata
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `applyConfidenceCap(...).cap.{applied, reason, pendingEvidenceCount, totalAssumptionCount, taggedCount, taggedFraction}` (in `artifacts/api-server/src/lib/lender-readiness-caps.ts`)
- **related tasks:** #929, #966

**Notes.** #929 + #966: pre-rendered callout string is the source of truth — PDF cover and in-app banner BOTH print it verbatim so the two surfaces never disagree.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx` | Cap callout (testid readiness-cap-callout-packet) |
| `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` | Cap-preview CTA on consultant analysis view (#966) |
| `artifacts/api-server/src/lib/packets/build-lender-packet.ts` | Pre-rendered cap callout string (used verbatim on PDF cover) |

### Biggest strength (one-liner)

- **id:** `biggest-strength`
- **description:** Biggest strength (one-liner)
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `ConsultantOutput.biggestStrength` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Engine-authored — never recompute in renderers.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildExecutiveSummary linkedMetrics — biggestStrength entry |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Narrative bundle, surfaced in commentary prose (biggestStrength) |

### Biggest risk (one-liner)

- **id:** `biggest-risk`
- **description:** Biggest risk (one-liner)
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `ConsultantOutput.biggestRisk` (in `artifacts/api-server/src/lib/consultant-engine.ts`)
- **related tasks:** —

**Notes.** Engine-authored.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildExecutiveSummary linkedMetrics — biggestRisk entry |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | Narrative bundle (biggestRisk) |

## Assumptions / Evidence

### Assumption registry (every tagged input)

- **id:** `assumption-registry`
- **description:** Assumption registry (every tagged input)
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `ASSUMPTION_REGISTRY` (in `@workspace/finance`)
- **related tasks:** #929

**Notes.** The single declarative table of every assumption the engine reads. Drives both the lender-packet appendix AND the cap denominator (totalAssumptionCount). Adding a new assumption surface MUST add a row here first.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-packet-data.ts` | buildAppendixAssumptions |
| `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx` | Per-assumption evidence-tagging card (drives cap denominator) |
| `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceRollupCard.tsx` | Rollup card showing tagged / total count across the wizard |

## Narrative Commentary

### Narrative source bundle (lender + board commentary)

- **id:** `narrative-commentary-bundle`
- **description:** Narrative source bundle (lender + board commentary)
- **unit:** text
- **rounding:** 0 decimals (half_up)
- **tolerance:** abs ≤ 0
- **canonical:** `buildNarrativeBundle(modelData, consultantOutput)` (in `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts`)
- **related tasks:** #617, #918, #924, #937

**Notes.** #617: every numeric figure in the rendered prose MUST come from a FigureScribe formatter so the guard test can prove no hallucinated numbers slipped in. Bundle is surfaced on the packet JSON for in-app 'Regenerate' to refresh prose without re-fetching the whole packet.

**Surfaces:**

| File | Where |
| --- | --- |
| `artifacts/api-server/src/lib/packets/build-narrative-commentary.ts` | buildLenderCommentary / buildBoardCommentary |
| `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx` | CommentaryBlock lender |
| `artifacts/school-financial-model/src/components/export/BoardPacketPreview.tsx` | CommentaryBlock board |
