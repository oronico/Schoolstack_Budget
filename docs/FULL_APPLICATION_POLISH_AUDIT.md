# Full Application Polish Audit — SchoolStack Budget

**Audit date:** May 11, 2026
**Scope:** Full-app UX, logic, and tone audit ahead of broad launch.
**Method:** Five parallel code explorers across tone, revenue terminology,
exports, actuals/projections, and coaching/warnings — combined with manual
review of wizard surfaces and the public/guest wizard.
**Type:** Audit and polish pass — not a rebuild. No major features added,
no wizard restructure, no formula changes.

---

## Summary verdict

**GO WITH WATCH ITEMS.**

The application is structurally sound and ready for broader founder use:

- The 3-layer terminology contract (seat price ≠ revenue source ≠ expected
  cash) is wired through the engine, with the new "% revenue from each
  source" view live on Revenue, Review, and Dashboard surfaces.
- Coaching is uniformly warm and constructive. Every warning across all
  five engines (DiagnosticPanel, DecisionIssue, HealthSignal,
  AssumptionFlag, NudgeItem) carries a `nextStep` — enforced at runtime
  by `assertEveryNextStep`.
- Actuals vs projections are clearly distinguished via badges, source
  attribution, and the `seedY1FromActuals` pathway.
- Founder-facing export labels are correct: "Founder Planning Workbook,"
  "1-Year Operating Budget," "5-Year Financial Model," "Board and Funder
  Summary," "Lender Conversation Snapshot." No "credit memo," "approval
  packet," or "underwriting decision" reaches the founder UI.

**Three watch items prevent a clean GO** — all P0 by the prompt's
banned-word rule, all surface-language fixes (no logic or formula
breakage):

1. The string "failed" leaks into two user-visible error toasts
   (`ExportStep.tsx:246`, `SharedModelPage.tsx:581`).
2. The Enrollment step is missing the seat-price-vs-payer helper text
   that anchors the 3-layer terminology contract.
3. The Revenue step's "tuition is your largest revenue source" coaching
   text conflates seat price with revenue.

None of these block launch. All are short-copy edits and should be
addressed in the next polish sprint.

---

## 1. Audience fit

| Audience | Fit | Notes |
|---|---|---|
| Beginner founder | ✅ Good | `ConceptExplainer`, `GlossaryTerm`, `WhyThisMatters`, `FoundingInsight`, and `RationaleField` provide on-step learning. `assertEveryNextStep` guarantees every warning is actionable. |
| Experienced operator | ✅ Good | `ActualsIntakeStep` accepts CSV / Excel / QuickBooks, `seedY1FromActuals` pre-fills cells, and the matrix UIs allow fast bulk entry. |
| CFO / finance advisor | ✅ Good with watch | CFO toggle in Review reveals line-item logic, ratios, and cash-flow detail. **Watch:** several formula-export cells inject TS-computed values rather than spreadsheet formulas — auditors lose traceability. (P1, see §11.) |
| Board member | ✅ Good | `build-board-packet.ts` delivers a tight summary; coaching headlines surface readiness. |
| Funder / grant reviewer | ✅ Good | Revenue Quality donut + new "Revenue mix by source" card make sustainability visible. |
| Lender / landlord | ✅ Good | Lender Conversation Snapshot, hard-revenue coverage, DSCR, and the readiness coaching headline (Tasks #751/#753/#755) cover the conversation. |

**Verdict:** All six audiences are served. No audience is poorly fit.

---

## 2. Warmth and tone findings

The coaching engines pass cleanly. The leakage is in error-handling and a
few legacy strings.

### P0 — banned-word leakage (user-visible)

| File:Line | Issue | Fix |
|---|---|---|
| `artifacts/school-financial-model/src/pages/model-wizard/steps/ExportStep.tsx:246` | `throw new Error("Export failed")` surfaced to the founder via a toast. | Reword to "We couldn't generate that export — try again or open a model with revenue and expenses entered." |
| `artifacts/school-financial-model/src/pages/shared/SharedModelPage.tsx:581` | `PDF generation failed (${res.status})` shown to guest users. | Reword to "We couldn't put together that PDF right now — refresh and try again." |

Code-only uses of "failed" (comments, `try { } catch` log strings that don't
reach the UI) are fine.

### P1 — judgmental or bank-like phrasing

| File:Line | Issue | Suggested copy |
|---|---|---|
| `NarrativeStep.tsx:699`, `:721` | `"the plan today reads as a \"${lenderReadiness}\" packet"` — passive-voice institutional framing. | "Right now your plan tells a {readiness} story to a lender. Here's what would strengthen it…" |
| `ActualsIntakeStep.tsx:151` | `"Try a cleaner P&L (no merged cells, single sheet)."` — implies the founder's books are dirty. | "Some P&L exports include merged cells or extra sheets — those make import tricky. A single, flat sheet imports best." |
| `ExportStep.tsx:1500` | `"Is this model for a Lending Lab microloan application?"` — sudden lender pivot inside a planning tool. | "Are you sharing this with the SchoolStack Lending Lab? We'll bundle the snapshot they look for." |

### P2 — warnings that could be more actionable

| File:Line | Issue |
|---|---|
| `EnrollmentStep.tsx:803` | "{Y2} enrollment (220) exceeds your facility capacity of 180." Add: "Open Step 2: School Details to revisit your room/seat capacity, or stagger growth across years." |
| `ExpenseStep.tsx:1561` | "address this before finalizing your plan" — vague. Add: "Step 2 covers your facility's square footage and capacity." |
| `chesterton/ChestertonRecruitingStep.tsx:445` | Dead-end "exceeds total facility capacity" warning. Same fix as above. |

**No instances of the banned terms** "approved", "declined", "rejected",
"ineligible", "credit decision", "underwriting decision", "loan approval",
or "approval packet" reach the founder UI.

---

## 3. Step-by-step logic findings

| Step | Purpose clear? | Beginners coached? | Experts unblocked? | Notes |
|---|---|---|---|---|
| Story | ✅ | ✅ `WhyThisMatters` panels | ✅ Optional fields skip cleanly | — |
| School Details | ✅ | ✅ State funding banner | ✅ — | — |
| Actuals Intake | ✅ | ✅ Source pickers | ✅ CSV/Excel/QB import | P1 (§5): `totalRevenue`-only seeds default to `tuition_and_fees`. |
| Enrollment | ⚠️ | **Missing seat-price-vs-payer anchor** (P0, §4) | ✅ Matrix entry | Aggressive-growth + capacity-exceeded coaching present. |
| Revenue | ⚠️ | **P0 conflation in coaching strings** (§4) | ✅ Per-row mix card now live | Per-source mix card + manual-narrative gate just shipped. |
| Staffing | ✅ | ✅ Founder-unpaid + market-rate coaching | ✅ — | Per-component payroll-tax model is well-explained. |
| Expenses | ✅ | ✅ — | ✅ — | P2: capacity-exceeded warning lacks a specific next step. |
| Capital & Financing | ✅ | ✅ — | ✅ DSCR fold-out | — |
| Assumptions & Sensitivity | ✅ | ✅ Confidence chips | ✅ — | E2E: 3 wizard-smoke paths fail navigating into this step on the *_new pathway — preexisting, tracked separately. |
| Review | ✅ | ✅ Simple/CFO toggle | ✅ — | New revenue-mix card embedded; cash-flow subsection covers all required signals. |
| Consultant | ✅ | ✅ — | ✅ — | All five engines surface here; warm tone confirmed. |
| Lender Narrative | ✅ | — | ✅ — | P1: "reads as a packet" framing (§2). |
| Export | ✅ | ✅ Lending Lab opt-in | ✅ — | P0: error toast leaks "failed" (§2). |
| Public/guest wizard | ✅ | ✅ — | — | P0: PDF error toast leaks "failed" (§2). |

---

## 4. Revenue logic findings

This is the area where the audit found the most actionable polish. The
engine is correct (the new `revenue-source-mix` engine + the existing
`revenue-quality` rollup honor the contract). The **language layer**
needs a pass.

### P0 — missing or conflating helper text

| File:Line | Issue | Suggested copy |
|---|---|---|
| `EnrollmentStep.tsx` (no helper found) | The 3-layer anchor is missing on the very step where seats are defined. | Add one short callout near the top: "The number of students you enroll sets the *capacity* of your school. The next step turns that into revenue — what you charge per seat, and who actually pays for the seat (families, ESA, voucher, charter funding, or scholarship)." |
| `RevenueStep.tsx:74` | "This is typically your largest revenue source - 70-90% of total revenue for private and micro schools." Conflates *seat price* with *revenue*. | "Tuition is your seat price. For a tuition-funded school, families pay 70–90% of it directly — but if you accept ESA or vouchers, the same seat may be paid by the state, not the family. Use the Revenue rows to record who actually pays." |
| `RevenueStep.tsx:93` | "ESA vouchers, tax-credit scholarships, and education savings accounts families use to pay tuition." Mixes the family-as-payer mental model with the agency-as-payer reality. | "ESAs, vouchers, and tax-credit scholarships are funded by states or scholarship organizations on behalf of families. The agency disburses the money — often quarterly — so cash timing differs from family-paid tuition." |

### P1 — clarity / cash-timing

| File:Line | Issue |
|---|---|
| `RevenueStep.tsx:98` | "Full cost" is vague — say "the seat price you set." |
| `RevenueStep.tsx:1115` | `tuition_collection_rate` is hidden behind a `GlossaryTerm` click; surface it inline once revenue rows exist. |
| `FinancialSnapshot.tsx:492` | "Cash dips below zero" — link to the *cause* ("Your ESA collection delay of 90 days is creating this gap"). |

### Confirmed-vs-projected revenue

`build-lender-summary.ts:44–47` already separates `contractedPct`,
`projectedPct`, `donorDependentPct`, `policyDependentPct`. The new
revenue-mix card and existing Revenue Quality donut surface this on the
Review step and Dashboard. **No change needed**, but consider requiring
evidence for "Contracted" status (P2 backlog).

---

## 5. Actuals vs projections findings

The pathway is well-built:

- `ActualVsProjectedBadge` and `SeededFromActualsBadge` consistently tag
  cells.
- `seedY1FromActuals` only writes empty cells, preventing data loss.
- The wizard pathway (`actuals` vs `assumptions`) drives whether the
  intake step appears.
- `AssumptionConfidenceCard` lets the founder tag any assumption as
  Actuals / Research / Estimate with optional evidence files.

### P1 watch items

| File:Line | Issue | Recommendation |
|---|---|---|
| `seed-from-actuals.ts:119` | Operating schools that report only `totalRevenue` (no breakdown) get the full amount seeded into `tuition_and_fees`. | Show a "We seeded this as tuition — split by source if your school received public funding or philanthropy" hint when a single-line P&L is imported. |
| `CashFlowSubsection.tsx:416` | The "Low Cash" callout fires only at <25% of opening cash. Founders starting with ~$10k of opening cash never trigger it. | Add a floor: trigger if absolute cash drops below $20k regardless of opening %. |

### P2

| File:Line | Issue |
|---|---|
| `ReviewStep.tsx:497` | The full Y1 column is labeled "Actual" if the founder picked the actuals pathway, even after they've manually overridden cells. |
| `ActualsIntakeStep.tsx:141` | Re-import requires the founder to manually clear cells; document this in the import help. |

---

## 6. Enrollment logic findings

Coaching covers aggressive growth (`fast_enrollment_growth`),
above-capacity (`EnrollmentStep.tsx:803` — needs next-step copy, P2),
and break-even proximity. Retention coaching exists on the operating-school
pathway. **No logic gaps found.**

---

## 7. Staffing and founder compensation findings

`founder_compensation_missing` flag exists with a constructive next step
(add a market-rate role in Step 6). Staffing-as-%-of-revenue is surfaced
at three layers (DiagnosticPanel critical/warning, HealthSignal
staffing_burden, DecisionIssue high_staffing_cost), all warm, all
actionable. **No gaps found.**

---

## 8. Facility and expense findings

Fixed-vs-variable distinction is preserved. Facility burden surfaces in
DiagnosticPanel (`high_occupancy`), HealthSignal (`facility_burden`), and
DecisionIssue (`high_occupancy_cost`). Capacity warnings exist but two
spots need next-step copy (P2, §3).

---

## 9. Cash-flow logic findings

`CashFlowSubsection` covers all required signals: beginning cash, monthly
receipts, monthly payments, ending cash, lowest cash month, summer-gap
annotation, and a "What if public funding is delayed 60/90/120 days?"
stress lever. Frontend and exports share the canonical
`computeYear1MonthlyCashFlow` engine. **One P1 watch item:** the low-cash
callout's 25%-of-opening threshold doesn't fire for thin opening cash
(see §5).

---

## 10. Review and Consultant findings

Both steps answer the seven required questions (what does it say / what's
strong / what needs clarity / what creates pressure / what's most
fragile / what to fix first / what will external audiences ask). Tone
audit shows uniformly warm phrasing ("I'd watch this", "don't worry —
it's fixable"). **No findings.**

---

## 11. Export findings

Founder-facing labels are correct. No banned terms reach the founder UI.

### P1 — formula traceability

| File:Line | Issue |
|---|---|
| `formula-export.ts:585–602` | Several revenue + personnel cells are TS-computed and injected as static values. CFOs lose traceability to the Assumptions sheet. |
| `underwriting-workbook.ts:320` | `computeRevenueQualityRollup` is injected; doesn't trace to assumption cells. |

### P1 — defensive arithmetic

| File:Line | Issue |
|---|---|
| `excel-export.ts:449`, `:572–574` | Margin and tuition-pct cells could emit `NaN` if upstream values are non-numeric (e.g., a malformed import). Wrap in `Number.isFinite` guards. |
| `formula-export.ts:430` | `total *= adm > 0 ? Math.min(ada / adm, 1) : 0.95;` — silent fallback to 0.95 attendance. Add a model-side validator that warns the founder when ADA/ADM are missing on a charter model. |
| `lender-proforma-export.ts:179, 240, 359, 360, 368, 385` | Multiple silent 3% growth fallbacks. Surface these defaults in a "Default assumptions used" footer on the proforma. |

### P1 — placeholder values

| File:Line | Issue |
|---|---|
| `underwriting-workbook.ts:214` | `["Fiscal Year Start Month", sp.fiscalYearStartMonth || 7]` — silent default to July. Either require the founder to set the fiscal-year start in Step 2 or note "(default: July fiscal year)" in the cell. |

### Acceptance — manual checks passed

- No `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#NULL!` patterns found in
  any export builder.
- `safeFormulaValue` (`workbook-helpers.ts:143`) protects against
  `null`/`undefined`/`NaN` cell values.
- Monthly totals reconcile to annual via `computeYear1MonthlyCashFlow`
  shared between UI and export.
- Tuition / public funding / philanthropy are separated in the
  `Revenue Quality` rollup and the new `Revenue mix by source` card.

### Status check — founder-facing labels

| Label | Status |
|---|---|
| Founder Planning Workbook | ✅ `underwriting-workbook.ts:101` |
| 1-Year Operating Budget | ✅ |
| 5-Year Financial Model | ✅ |
| Board and Funder Summary | ✅ `build-board-packet.ts` |
| Lender Conversation Snapshot | ✅ `build-lender-packet.ts` |
| Banned: "credit memo" / "underwriting decision" / "loan approval packet" / "approval packet" | ✅ Not present in founder-facing surfaces. (Backend file/internal names use "underwriting" — invisible to founders.) |

---

## 12. Audience-specific output findings

| Audience | Output | Status |
|---|---|---|
| Board | Board and Funder Summary PDF + workbook | ✅ Tight, decision-anchored |
| Funder / grant | Same packet + Revenue Quality donut + Revenue Mix card | ✅ Sustainability and one-time-vs-recurring story is clear |
| Lender / landlord | Lender Conversation Snapshot PDF + workbook + coaching headline | ✅ Repayment source, cash cushion, facility burden, staffing burden all present |

---

## 13. Logic gap scan summary

| Class | Count | Examples |
|---|---|---|
| Confusing labels | 2 | RevenueStep:74, RevenueStep:93 (§4) |
| Missing helper text | 1 | EnrollmentStep seat-vs-payer anchor (§4) |
| Duplicated questions | 0 | — |
| Fields that don't affect the model | 0 | — |
| UI/export mismatches | 0 | Canonical engine shared |
| Unexplained assumptions | 5 | Silent 3% growth, 0.95 ADA fallback, July fiscal-year, 25% low-cash threshold, totalRevenue→tuition default |
| Cold/punitive tone | 5 | 2 P0 toasts + 3 P1 framings (§2) |
| Untraceable math in export | 2 | formula-export.ts:585, underwriting-workbook.ts:320 |
| Unrealistic-output scenarios | 0 | — |

---

## P0 launch blockers

**None.**

Three P0 watch items by the prompt's strict banned-word rule, all
short-copy fixes that don't block launch:

1. `ExportStep.tsx:246` — "Export failed" toast.
2. `SharedModelPage.tsx:581` — "PDF generation failed" toast.
3. `EnrollmentStep.tsx` — missing seat-price-vs-payer helper.
4. `RevenueStep.tsx:74, :93` — coaching strings that conflate seat price
   with revenue.

---

## P1 fixes (next polish sprint)

1. Reword the lender-readiness "reads as a packet" framing in
   `NarrativeStep.tsx:699, :721`.
2. Reword `ActualsIntakeStep.tsx:151` "cleaner P&L" hint.
3. Add finite-number guards to `excel-export.ts:449, :572–574`.
4. Surface silent default assumptions (3% growth, 0.95 ADA, July fiscal
   year) in a "Default assumptions used" footer in the proforma.
5. Add a $20k absolute floor to the low-cash callout
   (`CashFlowSubsection.tsx:416`).
6. Soften two capacity-exceeded warnings to include a next step
   (EnrollmentStep:803, ExpenseStep:1561, ChestertonRecruitingStep:445).
7. Add a "We seeded this as tuition" hint when `seed-from-actuals.ts`
   only receives a single-line P&L total.
8. Restore formula traceability in `formula-export.ts:585–602` and
   `underwriting-workbook.ts:320` so CFO auditors can trace cells back
   to the Assumptions sheet.

---

## P2 backlog (post-launch)

1. Require evidence (signed agreement / MOU upload) for "Contracted"
   revenue-quality status.
2. Re-evaluate the `ReviewStep` Year-1 actual/projected badge so it
   reflects per-cell overrides instead of the wizard pathway alone.
3. Document re-import behavior in the actuals-intake help.
4. Link cash-trough callouts back to their structural cause (e.g.,
   "ESA disbursement delay").
5. Richer board/funder narratives with grant-specific framing.
6. Automated scenario comparison table.
7. Mobile polish pass on the matrix-entry steps.

---

## Recommended launch language

When announcing the broad launch:

> SchoolStack Budget helps school founders learn financial modeling as
> they build it. Whether you're operating today or planning a launch,
> SchoolStack walks you through enrollment, revenue, staffing, expenses,
> and cash flow with plain-language coaching at every step. Export a
> credible workbook for your board, funders, lenders, or landlord — and
> see cash pressure before it happens.

Avoid in launch copy: "approved," "qualify," "underwriting,"
"credit-ready," "approval packet."

---

## Recommended post-launch sprint plan

**Sprint 1 (week 1):** Ship the four P0 watch items as one polish PR —
all are short-copy edits, low risk, high signal.

**Sprint 2 (week 2):** Tackle P1 traceability + the silent-defaults
footer — these are the items CFOs and lenders will ask about within
weeks of broader use.

**Sprint 3 (week 3):** P1 tone fixes + the $20k low-cash floor.

**Sprint 4 (post-launch backlog):** Pull P2 items into roadmap as
adoption signal warrants.
