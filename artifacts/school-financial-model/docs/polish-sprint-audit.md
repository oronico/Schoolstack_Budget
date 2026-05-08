# SchoolStack Budget — Polish Sprint Audit

**Source brief:** `attached_assets/Pasted-SchoolStack-Budget-full-application-polish-sprint-Role-_1778265144884.txt` (591 lines)
**Audit task:** #701 (audit + targeted small fixes; larger work split into Tasks #702–#706)
**Tone reference:** `artifacts/school-financial-model/docs/FOUNDER_VOICE.md`

This report walks the brief's 16 phases against the codebase as it stands today, marks each as **Already shipped** / **Partial** / **Missing**, names the files reviewed, lists concrete gaps where applicable, and recommends a fix size: **S** (≤30 min, shipped here) / **M** (half-day, deferred to a follow-on task) / **L** (multi-day, lives in #702–#706).

---

## Phase 1 — Information architecture review

**Status:** Already shipped (with one M-sized polish deferred).

The wizard already has the 13 steps the brief calls for, in the order it specifies (Story → School Details → Actuals Intake → Enrollment → Revenue → Staffing → Expenses → Capital & Financing → Assumptions → Review → Consultant → Lender Narrative → Export).

- Files reviewed: `src/pages/model-wizard/index.tsx`, `src/pages/model-wizard/steps/*.tsx`, `src/pages/model-wizard/schema.ts`.
- Stage-based pathway gating *already exists* at the step-visibility layer: `computeVisibleSteps` in `index.tsx` only inserts the Actuals Intake step when `wizardPathway === "actuals"`, and `getWizardPathway` in `schema.ts` derives a default pathway from school stage so legacy operating-school models still land on the actuals route.
- Gap: the founder-facing branching experience the brief describes (an explicit fork after School Details with stage-aware copy, a named Assumptions-first launch checklist surface for new schools, and an explicit "Reset to actual" affordance on downstream steps) is not yet built on top of that gating. Fix size: **L**, lives in **Task #703 (Actuals-first & Assumptions-first pathways)**.

## Phase 2 — Beginner/Expert experience controls

**Status:** Partial.

A `GuidanceModeSelector` with three depths (Compact / Guided / Extra help) already exists and persists per user via `use-show-coach`. CFO mode behaves close to "Compact" today.

- Files reviewed: `src/components/coaching/GuidanceModeSelector.tsx`, `src/lib/coaching/use-show-coach.ts`.
- Gap: the toggle is not framed as the brief's two named modes (Guided Builder / CFO Mode), it is not surfaced from every step header, and CFO mode still hides several advanced controls behind disclosure clicks. Fix size: **L**, lives in **Task #702 (Beginner/Expert mode + teaching layer polish)**.

## Phase 3 — Beginner teaching layer

**Status:** Partial. **Seven missing concept entries shipped here as part of #701.**

The codebase has a rich coaching layer: `ConceptExplainer`, `MicroLessonCard`, `WhyThisMatters`, `RationaleField`, plus per-school-type explainer copy in `lib/coaching/explainers.ts`. Required concepts that already had an entry: revenue, expense, net_income, cash_flow, break_even, reserves, debt_service, paying_yourself (founder compensation), budget_vs_actual (actuals vs projections), dscr_explained.

**Concept entries added in this task** (S-fix, shipped now in `lib/coaching/concept-explanations.ts` — seven entries):

- `beginning_cash` — what beginning cash is and why thin balances matter.
- `ending_cash` — how ending cash rolls forward to next month and why it surfaces the year's low point.
- `staffing_cost_ratio` — frames the largest budget line and points the founder back to their school-type benchmark on the Staffing step (deliberately avoids a single hard-coded healthy range so the explainer cannot contradict the in-app at-risk threshold computed in `api-server/src/lib/financial-health.ts`).
- `facility_cost_ratio` — typical 12-20% range and the "rent does not shrink" framing.
- `public_funding_timing` — the state-schedule lag and why stress-testing a late payment matters.
- `tuition_collection_rate` — why 100% is unrealistic and what an honest rate looks like.
- `assumption_confidence` — what each evidence level means and the brief's "this does not mean your plan is weak" framing.

Wiring these new explainers into the actual wizard step UIs (so they render where the founder needs them) is **L** and lives in **Task #702**.

## Phase 4 — Actuals-first pathway for operating schools

**Status:** Partial.

`ActualsIntakeStep.tsx` already accepts a P&L upload (CSV/Excel from QuickBooks/Xero), captures the brief's actuals fields (prior-year enrollment, revenue/expense by category, ending cash, current cash, debt, accounting basis), and stores them on the model.

- Gap: actuals do not seed Year 1 inputs on downstream steps; the actual-vs-projected distinction is not visible after the founder leaves Actuals Intake; exports do not visibly distinguish actual vs projected figures. Fix size: **L**, lives in **Task #703**.

## Phase 5 — Assumptions-first pathway for new schools

**Status:** Partial.

The wizard already collects most of the brief's launch-stage prompts across School Details, Enrollment, Revenue, and Capital & Financing (projected opening month, year-1 operating months, committed students via `enrollment.year1`, signed agreements, deposits, waitlist, startup costs). What is missing is the **named pathway** — a single launch-checklist surface that walks a new founder through these prompts in one place, with the brief's exact framing copy. Fix size: **L**, lives in **Task #703**.

## Phase 6 — Revenue step polish

**Status:** Partial. Already strong — most attributes exist.

Revenue rows already support amount, driver type, timing, collection rate, source/confidence, recurring vs one-time. `tuition_assumptions`, `grants_fundraising`, and per-school-type explainers cover the brief's coaching themes.

- Gap: not every row consistently exposes the full attribute set in CFO mode; restricted-vs-unrestricted is not modeled for grants; the brief's three exact coaching lines (revenue strength, fundraising dependence, late public-funding cash impact) are not all present verbatim. Fix size: **M/L**, lives in **Task #704 (Per-step polish)**.

## Phase 7 — Enrollment step polish

**Status:** Partial. Inputs are strong; outputs need surfacing.

The Enrollment step already collects Y1–Y5 enrollment, capacity, retention, applications, deposits, waitlist, signed agreements, and grade bands.

- Gap: the brief's required outputs — break-even enrollment, enrollment needed to cover staffing, enrollment needed to cover facility, utilization %, growth-reasonableness flag — are computed elsewhere (`BreakEvenDownsideCard`, financial-health) but are not surfaced inline on the Enrollment step itself. Fix size: **L**, lives in **Task #704**.

## Phase 8 — Staffing step polish

**Status:** Partial. Strongest single step in the wizard today.

Staffing already supports function category, employment type, FTE, annualized rate, start year, ratio-based defaults via `STAFFING_BENCHMARKS`, benefits rate, payroll tax rate (auto-populated by state), wage cap insight (`buildCapInsightText`). Founder-comp panel already implements as-planned vs market-rate (Tasks #611, #633, #650), with NAIS/NACSA/BLS-keyed benchmarks and band-transition callouts.

- Gap: Beginner-mode field set is not yet pruned from CFO mode (today the founder sees almost everything). Brief's coaching line about sustainable founder pay is present in `PayingYourselfMatters` but not promoted in Guided mode at the founder-comp panel. Staffing-as-%-of-revenue and students-per-teacher are computed but not rendered on the step. Fix size: **L**, lives in **Task #704**.

## Phase 9 — Facility and expense polish

**Status:** Partial.

ExpenseStep already groups categories (instructional / technology / occupancy / admin / capital), supports per-student, monthly, annual, per-FTE drivers, escalation rules, and per-school-type guidance copy. The "Forgotten Costs" prompt covers most of the brief's commonly-missed lines.

- Gap: expenses are not currently grouped *fixed vs variable vs timing-sensitive* — they are grouped by category. Facility status is collected at School Details but its capacity / NNN / occupancy-doc fields are partial. Facility burden % is not rendered on the step. Fix size: **L**, lives in **Task #704**.

## Phase 10 — Cash flow as truth layer

**Status:** Partial.

The engine already produces monthly cash flow (`packages/finance`, `financial-health.ts`); the dashboard's `FinancialSnapshot` renders cash views; the 1-Year Operating Budget export already includes monthly cash flow.

- Gap: the Review page does not yet have a dedicated cash-flow subsection with lowest-cash-month highlight, summer-gap annotation, and the brief's exact plain-English copy. The delayed-public-funding scenario toggle on Review does not exist. Fix size: **L**, lives in **Task #705 (Cash flow + Review command center)**.

## Phase 11 — Assumptions confidence layer

**Status:** Partial.

`AssumptionConfidenceCard.tsx` already implements per-step confidence with a 5-level scale (matches the brief's "actuals / signed agreement / quote / public guidance / research / estimate" superset) and inline evidence capture. It is wired onto every wizard step.

- Gap: per-step confidence answers do not roll up into a single Strong / Moderate / Needs Support posture surfaced on Review or in exports. Fix size: **L**, lives in **Task #703** (paired with the actuals-vs-projections badge).

## Phase 12 — Review page CFO-quality polish

**Status:** Partial.

Review currently surfaces totals, ratios, warnings, and links to the Consultant view. Many of the brief's required metrics are computed (staffing %, facility %, reserves, debt cushion, founder-comp status, revenue quality).

- Gap: the brief's Simple Summary vs CFO Detail split does not exist as a top-level toggle. Some warnings on Review do not yet ship a `Next step:` line. Fix size: **L**, lives in **Task #705**.

## Phase 13 — Consultant output polish

**Status:** Already shipped (tone) / Partial (section structure).

`consultant-engine.ts` produces sectioned coaching output (decision rules, health signals, recommended next actions). Banned-language scan against the consultant view + lender labels comes back **clean** (zero hits on approved/declined/ineligible/credit decision/underwriting determination/rejected — see Banned-Language Regression below).

- Gap: the seven canonical sections in the brief's exact order (What your model says / What looks strong / What needs more clarity / What could create cash pressure / What to fix first / What someone reviewing this may ask / Suggested next steps) are not rendered as a clean seven-block layout today. Fix size: **L**, lives in **Task #706 (Consultant tone + canonical exports + narratives)**.

## Phase 14 — Export polish

**Status:** Already shipped (canonical labels) / Partial (content set audit).

The five canonical export labels and filename tokens are already wired correctly in `ExportStep.tsx`, `BoardPacketPreview.tsx`, `LenderPacketPreview.tsx`, and the api-server export builders. The deprecated-label list from `FOUNDER_VOICE.md` is honored. `founder-voice.test.ts` already enforces the canonical labels and rejects deprecated tokens.

- Gap: a per-export content-set audit against the brief's required-sections checklist (model date / school name / school stage / actuals/projections distinction / assumptions / revenue / expenses / staffing / facility / cash flow / break-even / reserves / scenarios / plain-English summary) has not been performed end-to-end. Fix size: **L**, lives in **Task #706**.

## Phase 15 — Board, grant, and lender communication support

**Status:** Partial.

The Lender Narrative step + Lender Conversation Snapshot + Board and Funder Summary already exist with auto-generated narrative content (`build-board-packet.ts`, `build-lender-packet.ts`, `build-narrative-commentary.ts`).

- Gap: there is no separate "Grant" narrative track using the brief's per-audience prompt set (one-time vs recurring, sustainability beyond the grant, assumption support). Editable inline narrative fields on the Lender Narrative step are partial. Fix size: **L**, lives in **Task #706**.

## Phase 16 — Regression and QA

**Status:** Already strong; no new test infrastructure needed in #701.

Existing test surface includes:

- `founder-voice.test.ts` — enforces banned-language list and canonical export labels.
- `coaching-flag-guardrail.test.ts`, `next-step-coverage.test.ts`, `next-step-registry.test.ts`, `risk-flag-snapshot.test.ts` — coverage for warning + next-step pairing.
- `qa:excel`, `qa:formula-results`, `qa:smoke-arithmetic` on the api-server — exports open and contain no NaN / undefined / #REF!.
- 1300+ frontend Vitest tests, full api-test suite, e2e smoke.

The new concept entries shipped here are covered automatically: `ConceptExplainer.test.tsx` iterates every `ConceptId`, and the strict `Record<ConceptId, ConceptExplanation>` shape would have failed typecheck if any of the seven new IDs were missing an entry. Adding new tests for each downstream task (#702–#706) is in scope of those tasks.

---

## Banned-language regression — clean

A full repo scan against the brief's banned word list returned **zero hits** in `artifacts/school-financial-model/src` and `artifacts/api-server/src`:

```
rg -i '\b(approved|declined|ineligible|credit decision|underwriting determination|rejected)\b'
```

Coverage is enforced going forward by `src/__tests__/founder-voice.test.ts`, which was extended in Task #676 to cover all of the brief's banned phrases plus the canonical-export-label assertions. No additional regression test is needed in #701.

---

## Summary of S-sized fixes shipped in #701

| Item | File | Status |
| --- | --- | --- |
| Add `beginning_cash` concept explainer | `src/lib/coaching/concept-explanations.ts` | Shipped |
| Add `ending_cash` concept explainer | same | Shipped |
| Add `staffing_cost_ratio` concept explainer | same | Shipped |
| Add `facility_cost_ratio` concept explainer | same | Shipped |
| Add `public_funding_timing` concept explainer | same | Shipped |
| Add `tuition_collection_rate` concept explainer | same | Shipped |
| Add `assumption_confidence` concept explainer | same | Shipped |
| Audit report (this file) | `docs/polish-sprint-audit.md` | Shipped |

(Total: seven new concept entries plus the audit report.)

Wiring these new explainers into specific wizard surfaces is intentionally deferred to **Task #702**, where the broader Beginner/Expert and teaching-layer placement work happens — adding `<ConceptExplainer concept="…" />` calls inside each step belongs alongside the mode-toggle and density work, not as a one-off here.

## Recommended follow-on tasks (already proposed)

- **Task #702** — Beginner/Expert mode + teaching layer polish (covers Phases 2, 3 wiring).
- **Task #703** — Actuals-first & Assumptions-first pathways (covers Phases 4, 5, 11 rollup).
- **Task #704** — Per-step polish: Revenue / Enrollment / Staffing / Facility (Phases 6–9).
- **Task #705** — Cash flow truth layer + Review CFO command center (Phases 10, 12).
- **Task #706** — Consultant tone + canonical exports + board/grant/lender narratives (Phases 13–15).

All five depend on #701 and form the rest of the polish-sprint backlog.
