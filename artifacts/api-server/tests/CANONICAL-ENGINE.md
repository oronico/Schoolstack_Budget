# Canonical Engine + Export Reconciliation

This doc explains the regression scaffolding that locks in
`@workspace/finance` as the **single source of truth** for DSCR, cash
runway, break-even, and cash position across the school-financial-model
project — and how to extend it when you add a new golden model.

## The three guardrails

Every PR runs three layered checks (all wired into the api-server
aggregate `pnpm run test`, which `.replit`'s `api-tests` validation
invokes):

1. **`tests/canonical-engine-enforcement.ts`** — static scan that
   bans new local re-implementations of the four canonical formulas
   (DSCR, cash-runway months, break-even year, cash position) outside
   `lib/finance/`. Pre-existing legacy occurrences live on a small
   `KNOWN_VIOLATIONS` allowlist; any *new* violation fails the test.
2. **`tests/export-reconciliation.ts`** — for each golden fixture,
   generates every founder-facing export (Lender Pro Forma workbook,
   Underwriting workbook, Lender packet PDF data, Board packet PDF
   data) and asserts headline figures (DSCR by year, ending cash,
   normalized DSCR, stress-scenario results, break-even, cash runway)
   match the canonical engine output to the cent.
3. **Formula-parity tests** for goldens — already in place:
   - `tests/cross-engine-test.ts` snapshots
     `runConsultantEngine`'s output for each golden against
     `tests/golden-snapshots/<golden>.json`.
   - `lib/finance/src/decision-engine/__tests__/scenario-engine-parity.test.ts`
     snapshots `computeBaseFinancials` and `computeLenderStressTests`
     for each golden against `lib/finance/.../snapshots/<golden>.json`.

If you change a canonical formula, all three guardrails will
intentionally fail — that's the contract.

## Failure messages

`export-reconciliation.ts` tags every failure with three coordinates:

```
FAIL [golden=charter] [surface=lender-proforma:Stress(esa_delay_3mo)]
     [metric=DSCR Y2] expected=1.18 actual=1.21 diff=0.03 tol=0.01
```

That tells you (a) which golden, (b) which export surface and which
scenario block inside it, and (c) which metric drifted. The fix is
almost always: trace the surface back to its data builder and route
the value through `@workspace/finance` instead of computing it
locally.

`canonical-engine-enforcement.ts` reports the file path, line
number, and the forbidden pattern it matched, plus the
`KNOWN_VIOLATIONS` entry you'd need to add (with a justification)
if the violation is intentional legacy.

## Adding a new golden model

A "golden" is a deterministic `TestModelPayload` fixture that
exercises a meaningful product variant (microschool, charter,
classical, etc.). Adding one takes four steps:

1. **Author the fixture in `lib/finance`.**
   Create your fixture in `lib/finance/src/test-fixtures.ts`,
   following the shape of `microschoolFixture`, `charterFixture`,
   or `chestertonAcademyFixture`. Export it from
   `lib/finance/src/index.ts` so api-server tests can import it via
   `@workspace/finance`.

2. **Snapshot the canonical engine.**
   Run the canonical-engine snapshot generator so
   `scenario-engine-parity.test.ts` has a baseline:

   ```
   pnpm --filter @workspace/finance test
   ```

   First run will fail with a "snapshot missing" message and write
   the candidate. Verify the numbers by hand, then re-run; the test
   should pass.

3. **Snapshot the consultant engine.**
   Add your fixture to the `GOLDENS` array in
   `artifacts/api-server/tests/cross-engine-test.ts` and to the
   golden-snapshot generator at
   `artifacts/school-financial-model/scripts/gen-golden-snapshots.ts`.
   Run:

   ```
   pnpm --filter @workspace/school-financial-model run gen-golden-snapshots
   pnpm --filter @workspace/api-server run test:cross-engine
   ```

4. **Wire into export reconciliation.**
   Add an entry to the `GOLDENS` array at the top of
   `artifacts/api-server/tests/export-reconciliation.ts`:

   ```ts
   const GOLDENS: GoldenSpec[] = [
     { name: "microschool", fixture: microschoolFixture },
     { name: "charter", fixture: charterFixture },
     { name: "chesterton", fixture: chestertonAcademyFixture },
     { name: "your-new-model", fixture: yourNewFixture }, // <— add
   ];
   ```

   Then run:

   ```
   pnpm --filter @workspace/api-server run test:export-reconciliation
   ```

   Every reconciliation must pass on the first run for a new
   golden — failures here mean an export is computing a headline
   figure outside the canonical engine. Fix the export, not the
   tolerances.

## Tightening tolerances

The reconciliation test uses three tolerances:

| Constant     | Value | Used for                                    |
|--------------|-------|---------------------------------------------|
| `CENT`       | `1`   | dollar amounts and student counts           |
| `DSCR_EPS`   | `0.01`| DSCR ratio (matches engine's `0.00x` round) |
| `MONTH_EPS`  | `0.1` | cash-runway months (matches `0.0` display)  |

Do not loosen these to make a test pass. If a real product change
needs a wider band, raise it to discussion first — the whole point
is that exports tie to canonical at display precision.

## Underwriting workbook caveats

`export-reconciliation.ts` reconciles the Underwriting workbook's
**DSCR & Covenants** sheet headline rows — DSCR by year, Ending
Cash by year, and Break-Even Enrollment by year — against canonical
to the cent. `generateUnderwritingWorkbook` passes those values
through `canonicalOverrides` from `@workspace/finance` so the
sheet ties to the dashboard, lender packet, and Lender Pro Forma
stress tests.

**Task #738 — CF↔BS↔DSCR cash tie.** The Monthly Cash Flow Y1 tab
historically used the workbook's local revenue/expense helpers
(`computeRevenueForYear`, `computeExpenseForYear`,
`computeCapDebtForYear`), which can drift from the canonical
scenario engine. That drift made the CF "Ending Cash (Month 12)"
disagree with the canonical accrual cash position
(`startingCash + cumulative NI`), which in turn broke the
DSCR ↔ BS ↔ CF cash tie that
`export-formula-results.ts` (the `qa:formula-results` cross-tab
regression) enforces. To fix this, `generateUnderwritingWorkbook`
now passes the canonical Y1 totals (`canonical.revByYear[0]`,
`persByYear[0]`, `opexByYear[0]`, `cdByYear[0]`) into
`buildMonthlyCashFlowY1`, which:

1. Uses canonical totals as the annual targets for the Personnel,
   Operating Expenses, Debt Service, and Total Revenue rows
   (preserving the legacy monthly *shape* via
   `distributeRevenueMonthly` rescaled to canonical revenue).
2. Absorbs the per-month rounding drift into the Net Cash Flow
   M12 cell so `startingCash + Σ(net)` lands exactly on
   canonical NI[0].

Result: CF Cumulative Cash M12 = startingCash + canonical NI[0]
= canonical `cashPosition[0]`. The Balance Sheet then cross-
references that cell for Y1 cash, and Y2-Y5 add cumulative NI
from the Operating Statement, which equals `canonical.cashPosition[y]`
by construction. DSCR Ending Cash continues to use
`canonicalOverrides.cashPosition`, so all three sheets agree
to the cent for every fixture.

The workbook's `startingCash` derivation also falls back to
`openingBalances.cash` (matching the engine's
`data.openingBalances?.cash || 0`) so it cannot diverge from
canonical when the older `priorYearSnapshot.endingCash` /
`currentYearProjection.currentCash` slots are absent.

A few rows on the same sheet remain on the workbook's local
working-capital cash trajectory by design — these are the loan-
committee analytical view, not the headline figures:

- **CFADS** row (above DSCR) — kept as the workbook's own
  cash-flow-available-for-debt-service derivation so lenders can
  audit the build-up.
- **Days Cash on Hand**, **Months of Runway**, **Current Ratio**,
  and the **Cash Reserve / Days Cash covenant checks** — all use
  the working-capital `cashByYear` basis, not the canonical
  accrual cash position. To keep cached values and live formulas
  consistent after the Ending Cash row was switched to canonical,
  `buildDSCRCovenants` writes a hidden "Working-Capital Cash"
  row, and Days Cash / Months Runway formulas reference *that*
  row (never the Ending Cash row). The reconciliation test
  asserts this — see the
  `Days Cash Y… formula avoids Ending Cash row` /
  `Months Runway Y… formula avoids Ending Cash row` checks. Do
  not reroute those formulas through `cashRow`; if you need a
  canonical-cash variant of those metrics, add a separate row.
- **Per-student break-even derivation rows** (Revenue per Student,
  Fixed Costs, Variable Cost per Student) — kept as the
  workbook's own derivation trail; the canonical Break-Even
  Enrollment row sits below them.
