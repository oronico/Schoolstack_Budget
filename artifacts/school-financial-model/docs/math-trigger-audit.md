# Math-Trigger Audit (Task #318)

**Goal.** Catalogue every "logic-tree trigger" in the SchoolStack Budget wizard
where founder selections (state, entity type, school stage, funding profile,
etc.) drive the underlying math, and document the integrity status of each one
after the Task #318 fixes (F1, F2, F3) land.

**Scope.** This audit covers the React wizard steps under
`src/pages/model-wizard/steps/`, the canonical defaults under `src/lib/`, and
the shared engine under `lib/finance/src/decision-engine/`. The API mirror in
`artifacts/api-server/src/lib/consultant-engine.ts` is treated as a downstream
parity target.

> Glossary
> - **Trigger** = a profile field whose value changes the *numbers*, not just
>   labels or copy.
> - **Driver** = the engine code that consumes the resulting state. Most live
>   in `scenario-engine.ts` (UI, golden-frozen) and `consultant-engine.ts`
>   (API mirror, parity-tested).

---

## 1. Trigger inventory

| # | Trigger field                              | Step       | What it changes                                                                                       | Status                    |
|---|--------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|---------------------------|
| 1 | `schoolProfile.state`                      | Profile    | Funding programs (per-student amounts), payroll-tax components & wage-base caps, entity filing fees   | Fixed (F1, F2, F3)        |
| 2 | `schoolProfile.entityType`                 | Profile    | Tax labels (profit vs net income), state entity filing fees, eligibility for nonprofit-only programs  | Fixed (F3)                |
| 3 | `schoolProfile.schoolStage`                | Profile    | `getYearCount` (5 vs 3 vs 1), enrollment ramp, stage-adjusted defaults, golden snapshot keying        | Pre-existing (passing)    |
| 4 | `schoolProfile.fundingProfile`             | Profile    | Default revenue rows enabled, default expense rows enabled, philanthropy assumptions                  | Pre-existing (passing)    |
| 5 | `schoolProfile.schoolType`                 | Profile    | Religious-school sub-flow (diocesan / congregation), accreditation defaults                           | Pre-existing (passing)    |
| 6 | `schoolProfile.hasManagementFee` + %       | Expense    | Authorizer/Management fee row (% of revenue) — reactive sync via `useEffect`                          | Pre-existing (passing)    |
| 7 | `schoolProfile.{isDiocesan,…}`             | Expense    | Faith-fundraising assumptions: assessment %, fiscal-sponsor fee guidance                              | Pre-existing (passing)    |
| 8 | `schoolProfile.{hasBookkeeper,…}`/cost     | Expense    | Bookkeeper, lawyer, insurance, banking line items                                                     | Pre-existing (passing)    |
| 9 | Staffing row `payrollTaxRate` field        | Staffing   | Per-row payroll-tax rate — overrides the state default when the user manually edits it                | Fixed (F1)                |
| 10| Staffing row `salary` × `effectiveFte`    | Staffing   | Wage-base caps now apply per-FTE so multi-FTE rows hit FICA caps once *per* employee, not row-wide    | Fixed (F1)                |
| 11| Revenue line `category=esa_voucher`/`tax_credit` `program` selection | Revenue   | Pre-fills $/student amounts using the matched `ProgramInfo.perStudent.{min,max}` midpoint            | Fixed (F2)                |
| 12| Capital/debt loan parameters               | Expense    | Annual debt service via `computeAnnualDebt`                                                            | Pre-existing (passing)    |
| 13| Escalation rates (`generalCostInflation`,…)| Expense    | Year-over-year ramp on enabled rows via `computeEscalatedAmounts`                                     | Pre-existing (passing)    |

---

## 2. Concrete fixes shipped in Task #318

### F1 — SUTA / FICA wage-base caps

**Symptom.** Founders saw an over-stated payroll-tax line for any salary that
exceeded a state's SUI taxable wage base. The engine multiplied the *full*
salary by a flat blended percent (e.g. WA → 9.95%), so a $200k Head of School
showed ~$19,900 in payroll tax versus the actually-owed ~$16,041 — a 24%
overstatement on that row.

**Root cause.** `STATE_PAYROLL_TAX_MAP` exposed only a single blended `rate`,
with no notion of per-component wage-base caps (FICA-OASDI $176,100, FUTA $7k,
SUI varies $7k–$176,100 by state, PFML/comp varies).

**Fix.**
1. `state-payroll-tax-data.ts` — every state component now carries an optional
   `wageBase: number`; FICA-OASDI, FUTA, every state SUI/PFML/comp entry is
   populated with the 2025 base. Federal-uncapped components (Medicare) leave
   `wageBase` undefined.
2. New helpers `computePayrollTaxForSalary(salary, components)` and
   `computeEffectivePayrollTaxRate(salary, components)` apply the per-component
   cap.
3. `model-shape.ts` (engine) — `StaffingRowLike.payrollTaxComponents?` added so
   the engine can use the cap-aware path. `StaffingRowData` and
   `staffingRowSchema` mirror the field.
4. `lib/finance/.../scenario-engine.ts` and
   `artifacts/api-server/src/lib/consultant-engine.ts` now call
   `computePayrollTaxForSalary` per-FTE when components are present and the
   user has *not* manually overridden the row's blended rate. This preserves
   user intent (manual override wins) while giving the default the correct
   shape.
5. `staffing-defaults.ts` (`generateDefaultStaffingRows`,
   `createBlankStaffRow`, `calculatePersonnelCosts`) thread an optional
   `stateCode` and seed components + a salary-blended `payrollTaxRate` so
   existing UI and downstream readers see a sensible number.
6. `StaffingStep.tsx` reads `schoolProfile.state` and threads it through.

**Engine parity.** Backward-compatible: existing fixtures don't set
`payrollTaxComponents`, so the engine falls back to the flat-rate path and
golden snapshots remain frozen. Parity tests pass without regen.

**Tests.** `math-trigger-fixes.test.ts → F1` (8 cases) covers wage-base
arithmetic, zero-salary edge cases, low-vs-high-earner effective rates, and
51-jurisdiction coverage.

### F2 — ESA / voucher per-student amount auto-fill on manual add

**Symptom.** When a founder clicked "Add line item" inside the ESA / voucher
or tax-credit block on the Revenue step, the new row arrived with `amounts:
[0,0,…]`. To get the right number they had to flip back to the state-data
modal or hand-key the per-student amount — easy to skip, easy to under- or
over-state.

**Root cause.** `addLineItem(category)` in `RevenueStep.tsx` instantiated rows
with hard-coded zeros and no `note`, even when the surrounding category had a
known `programId` from `state-funding-data`.

**Fix.** `RevenueStep.tsx → addLineItem` now resolves the matched
`ProgramInfo` for the current `(state, programId)` and pre-fills `amounts`
using `Math.round((min + max) / 2)` plus an explanatory `note` of the form
*"From {state} program data — typical $X–$Y/student."* The behaviour is
identical to the modal-driven add path, removing a silent zero-default
foot-gun.

**Tests.** Covered by the existing `state-funding-data.test.ts` (program-data
shape) plus integration via `decision-flows.test.ts` (revenue rows render with
non-zero defaults under state context).

### F3 — State business registration & annual report fees

**Symptom.** The Expense step never surfaced state-level entity costs. CA LLCs
quietly owe the $800 minimum franchise tax every year; DE C-corps owe $50 +
franchise tax; NY LLCs hit the one-time publication fee in Y1. None of this
existed in the chart of accounts, so founders modeled $0 for a recurring,
non-trivial cost.

**Fix.**
1. `src/lib/state-entity-fees.ts` — new 51-jurisdiction × 5-entity-type table
   covering `llc_single`, `llc_partnership`, `c_corp`, `s_corp`, and
   `nonprofit_501c3`. Each cell carries `annual` (recurring), optional
   `oneTimeY1` (initial filing / publication), and a `notes` field that
   explains the rate so founders see the citation in-row.
   Helpers: `getStateEntityFeeProfile(stateCode, entityType)` returns null for
   `sole_practitioner` / `undetermined` / unknown states; `buildEntityFeeAmounts`
   distributes `oneTimeY1` to year 1 and the annual fee across years 1..N.
2. `expense-defaults.ts → generateDefaultExpenseRows(...)` accepts an
   `entityFeeContext?: { stateCode, entityType }` and appends a single
   `State Entity Filing Fees` row (id `state_entity_filing_fees`, category
   `administrative_general`, driver `annual_fixed`, enabled by default) when
   the founder has answered both questions and the entity type is in scope.
3. `ExpenseStep.tsx` reads `schoolProfile.state` and `schoolProfile.entityType`,
   passes them into the defaults, and runs a reactive `useEffect` that
   re-syncs (or removes) the entity-fee row whenever either field changes
   after first init.

**Tests.** `math-trigger-fixes.test.ts → F3` (10 cases) covers 51-state
coverage, the 5-entity-type matrix, null fall-throughs for
sole-practitioner/undetermined/unknown-state, the CA $800 spot-check,
year-1 vs. recurring distribution in `buildEntityFeeAmounts`, and the
defaults-row emission/omission paths.

---

## 3. Items intentionally out of scope

- **Local & city business licenses** (e.g. Seattle B&O tax, NYC commercial
  rent tax). These are too address-specific to seed sensibly without the
  founder's exact municipality. Surface as a free-text note on the entity-fee
  row instead.
- **Federal income / unrelated business income tax**. Already covered (or
  intentionally excluded) by the existing tax block — out of Task #318's
  scope.
- **Workers' comp by occupation class**. Today modeled as a flat per-state
  rate; class-code refinement is tracked separately.
- **Repo-wide typecheck failure in `artifacts/budget-allhands`**. Pre-existing
  on `main`, not introduced by Task #318.

---

## 4. Validation summary

- Unit: `pnpm --filter @workspace/school-financial-model run test` — passing,
  including the 18 new cases in `math-trigger-fixes.test.ts`.
- Type: `pnpm --filter @workspace/school-financial-model exec tsc --noEmit` —
  clean.
- E2E: `pnpm --filter @workspace/school-financial-model run test:e2e` —
  passing.
- Engine parity: `scenario-engine-parity.test.ts` continues to pass against
  frozen goldens; no regen needed because fixtures don't supply
  `payrollTaxComponents`, so the engine falls back to the legacy flat-rate
  path on those inputs.
