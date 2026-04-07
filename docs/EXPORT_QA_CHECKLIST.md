# SchoolStack Budget — Export QA Checklist

**Purpose:** Validate that Excel exports are underwriting-grade, formula-transparent, and flexible enough for real-world scenario planning across all K-12 models.
**Applies to:** `/api/public/export-budget`, `/api/public/export-underwriting`, `/api/public/export-single-year`, authenticated underwriting workbook exports.

---

## Release Gate Definition (Must Pass)

A release only passes when all of the following are true:

1. **Formula Transparency:** Underwriters can inspect and trace formulas directly in Excel cells (no black-box-only outputs).
2. **Scenario Flexibility:** Users can adjust hard-coded assumptions (e.g., inflation/escalation) and see modeled impact.
3. **Institutional Presentation:** Workbook layout/formatting is board-, lender-, and audit-ready (clear titles, sections, footers, and numeric formatting).
4. **Universal K-12 Coverage:** Canonical payloads and smoke tests cover all major K-12 program archetypes and operating stages.

---

## Pre-Test Setup

### Canonical Payload Coverage (K-12 Program Matrix)

Maintain and execute payloads that span school size, model type, and funding structure.

| Payload | Program Type | Stage | Funding Mix | Size Envelope |
|---|---|---|---|---|
| Microschool Startup | Microschool / hybrid | Pre-opening | Tuition + philanthropy | 15→45 students |
| Private + ESA | Private independent/religious | Early operating | Tuition + ESA/vouchers + fundraising | 80→220 students |
| Charter Public Funding | Charter | Pre-opening or operating | ADA/per-pupil + federal grants | 150→400 students |
| Homeschool Co-op | Co-op / multi-family program | Operating | Tuition/fees + grants + fundraising | 30→120 students |
| Charter ADA Grade-Band | Charter (grade-banded assumptions) | Operating | ADA by grade band + supplemental grants | 200→600 students |

Minimum expectation per release: validate at least one file per payload in `artifacts/api-server/qa-output/` and automated parity checks.

---

## Structural Checks

For each exported workbook, verify:

### Tab Structure (Budget/Underwriting Public Export)
- [ ] Workbook contains expected tabs (3 base tabs, 4 for operating schools with actuals comparison)
- [ ] Tab 1: `Assumptions`
- [ ] Tab 2: `5-Year Model`
- [ ] Tab 3: `Year 1 Pro Forma`
- [ ] Optional Tab 4 (operating schools): `Actuals vs. Projections`

### Tab Structure (Single-Year Public Export)
- [ ] Workbook contains 5 tabs
- [ ] Tab 1: `Assumptions`
- [ ] Tab 2: `Revenue`
- [ ] Tab 3: `Personnel`
- [ ] Tab 4: `Operating Expenses`
- [ ] Tab 5: `P&L Summary`

### Data Integrity
- [ ] No `#REF!`, `#DIV/0!`, `#VALUE!`, `#N/A`, `NaN`, `undefined`, or `null` cell values
- [ ] No merged-cell corruption or hidden-sheet dependency errors
- [ ] Currency, percent, and integer formats align to row semantics

---

## Embedded Formula Visibility and Traceability

### Cell-Level Formula Requirements
- [ ] Formula-bearing lines exist for totals, subtotals, margins, and coverage metrics (not flattened values)
- [ ] Underwriters can click key cells and view formula expressions in Excel formula bar
- [ ] Relative/absolute references are stable when copied across 5-year columns
- [ ] Formula count is within expected range for each template and does not regress unexpectedly

### Recalculation/Dependence Checks
- [ ] Editing Year 1 enrollment updates linked revenue and staffing-dependent rows
- [ ] Editing escalation assumptions updates downstream years without manual edits
- [ ] Debt-service assumptions flow through DSCR and surplus metrics where applicable
- [ ] Cross-tab references do not break when workbook opens in Microsoft Excel desktop and Excel web

---

## Flexibility Validation (Hard-Coded Assumption Overrides)

### Escalation and Inflation Controls
- [ ] Global escalation assumption(s) are editable on assumptions tab
- [ ] Row-level exception support is validated (e.g., static contract expense at 0% escalation)
- [ ] At least one test scenario verifies mixed behavior: one row escalates, another remains static

### Contract and Program Exceptions
- [ ] Fixed-fee contracts remain constant across years when designated static
- [ ] Headcount-driven rows respond to enrollment/staffing changes
- [ ] Grant cliff scenarios can be represented without formula breakage

### Sensitivity Usability
- [ ] A reviewer can perform “what-if” edits in under 2 minutes without re-exporting
- [ ] Workbook does not require macros or unsupported add-ins to recalculate

---

## Financial Content Checks

### Required Row Labels
- [ ] `Total Revenue`
- [ ] `Total Operating Expenses` (or `Total Expenses`)
- [ ] `Net Income` / `Net Operating Income` / `Surplus (Deficit)`
- [ ] `Debt Service Coverage Ratio (DSCR)` when debt exists

### Revenue, Staffing, Expense Fidelity
- [ ] Every payload revenue row appears in output with expected Year 1 value basis
- [ ] Staffing rows preserve position, count, salary, and benefit assumptions
- [ ] Expense rows preserve category-level assumptions and escalation logic
- [ ] Multi-year projections are internally consistent with stated escalation methods

---

## Fortune 100 Grade Presentation Standards

For at least one representative workbook per release, manually confirm:

- [ ] Professional title block (school/program name, model type, date/version)
- [ ] Executive-ready section headers and category groupings
- [ ] Consistent typography and cell styles (headers, inputs, formulas, outputs)
- [ ] Financial number formatting (currency, commas, negatives, percentages)
- [ ] Visual hierarchy for auditor/lender review (clear subtotals and totals)
- [ ] Print/PDF layout is clean (no clipped columns/rows, logical pagination)
- [ ] Footers/metadata suitable for diligence packet inclusion

---

## Underwriter / Auditor Trust Checks

- [ ] Assumptions tab gives a complete “single source of truth” for key drivers
- [ ] Workbook logic is explainable line-by-line by a reviewer without code access
- [ ] Major ratios (margin, payroll %, DSCR, liquidity proxies) reconcile to source rows
- [ ] No unexplained hard-coded overrides in computed totals
- [ ] Export filenames and titles are deterministic and deal-file friendly

---

## Export Endpoint Checks

### Budget Export (`/api/public/export-budget`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Opens in Excel without repair prompt

### Underwriting Export (`/api/public/export-underwriting`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Public workbook quality checks pass
- [ ] Authenticated underwriting workbook (extended tab set) passes tab and formula checks

### Single-Year Export (`/api/public/export-single-year`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Contains expected 5 tabs and Year 1-focused outputs

---

## Automated Validation Commands

```bash
pnpm --filter @workspace/api-server run qa:golden
pnpm --filter @workspace/api-server run test -- tests/lender-parity-check.ts
pnpm --filter @workspace/api-server run test -- tests/excel-qa.ts
```

Expected: all pass with zero critical failures.

---

## Manual Spot Check Protocol

For at least one workbook per major school archetype in each release cycle:

1. Open workbook in Microsoft Excel desktop
2. Confirm visible formulas on core summary rows
3. Change inflation/escalation and verify downstream recalculation
4. Mark one expense row as static-contract and verify no escalation drift
5. Validate design/formatting against board/lender presentation quality
6. Export/print to PDF and ensure diligence-ready layout

Release is blocked until all mandatory items above pass.
