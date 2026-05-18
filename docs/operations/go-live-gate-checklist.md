# Go-Live Gate Checklist

**Status:** Drafted for Task #930-M7 (final milestone of #930 pre-launch
math-integrity epic).
**Audience:** Anyone with merge authority to `main`. This is the gate
that must read green before the production cutover window from
`docs/operations/go-live-data-migration-plan.md` (M6) is opened. Any red
box is a hold.
**Scope:** Verification-only. New features and threshold recalibration
are out of scope here — they belong to filed follow-ups (#964 for
threshold recalibration; the three architectural follow-ups filed at
the close of #930 for continuous monitoring, drift detection, and
schema-migration tooling).
**Review date target:** **Friday, May 29, 2026** (Lance Helming, CFO
advisory; Allison as backup). The technical gate (sections 1–8 below)
must read green by **Thursday, May 28**, leaving Friday for the live
walkthrough and any same-day non-blocking fixes.

---

## How to read this document

Each gate is a single, falsifiable statement. The reviewer checks one
of three boxes:

- `[x]` — verified green, with the evidence column filled in.
- `[ ]` — not yet verified.
- `[!]` — verified red, with a filed follow-up task number in the
  evidence column. Filed follow-ups must either be closed or
  explicitly waived by a named approver before the gate opens.

A gate without an evidence value is treated as red regardless of
which box is checked — the point of the column is auditability after
the cutover, not a tick-box ritual during it.

---

## 1. Integrity report — zero unresolved discrepancies

The M4 integrity report (`artifacts/api-server/reports/math-integrity-report.md`)
runs every persona fixture × every registry metric × every consumer
surface and diffs the rendered value against the canonical (M3)
computation. The acceptance bar is zero `unresolved` and zero `drift`.

| # | Gate | Evidence | State |
|---|---|---|---|
| 1.1 | M4 report header shows `unresolved: 0` in the registry-surface section. | Open `artifacts/api-server/reports/math-integrity-report.md`; the "Coverage (registry-driven)" block prints the counts. Today: `pass: 30, drift: 0, missing: 0, skipped-structural: 183, unresolved: 0`. | [x] |
| 1.2 | M4 report shows `drift: 0` in the M2 → M1 mapping section. | Same report, "M2 → M1 mapping" block. Today: `pass: 156, drift: 0, missing: 0, skipped-structural: 3`. | [x] |
| 1.3 | Every M2 unmapped label has an entry in `M2_UNMAPPED_RATIONALE`. | The M4 run fails if any new label appears with neither a mapping nor a rationale; today's run reports `unmapped label classes: 69`, all classified. Re-run with `pnpm --filter @workspace/api-server exec tsx scripts/run-math-integrity-report.ts` to refresh. | [x] |
| 1.4 | The M4 report has been re-generated against the current `main` HEAD within the 72 hours before the cutover. | Stamp the regeneration date at the top of the markdown report when re-running. | [ ] |

## 2. CI math-integrity harness — green in `api-tests`

The M5 standing harness (`artifacts/api-server/tests/math-integrity-harness.ts`)
composes M1–M4 and is wired into the `api-tests` workflow. Any
regression that would have produced a drift in the M4 report fails the
harness instead.

| # | Gate | Evidence | State |
|---|---|---|---|
| 2.1 | `api-tests` workflow on `main` HEAD reads green end-to-end. | Workflow status badge or last full-chain log in `/tmp/logs/api-tests_*.log`. The chain runs `pnpm --filter @workspace/api-server run test` — currently 100+ test scripts including the math-integrity harness. | [!] — Filed: **#985** (in-chain `test:parity` state pollution; passes 142/142 in isolation but fails first-in-chain with DSCR/Cash diffs against charter/chesterton/heritage-private goldens). MUST be resolved before this gate opens. |
| 2.2 | The math-integrity harness passes in isolation: `pnpm --filter @workspace/api-server run test:math-integrity-harness`. | Console output `0 failed`. | [ ] |
| 2.3 | The component-state extractor coverage covers both `extractComponentState` (props-walk superset) AND `extractRendered` (DOM-walk subset), per the M5 task's "intentional split" guidance. | M5 task notes (`.local/tasks/task-977.md`); harness file imports both extractors. | [ ] |

## 3. Workbook downloads — clean in Excel AND LibreOffice

Releases-gate-clause from `docs/EXPORT_QA_CHECKLIST.md`. The four
public export endpoints must each produce a file that opens cleanly
(no "repair" prompt, no `#REF!`/`#DIV/0!`/`#VALUE!`/`NaN`) in both
Microsoft Excel desktop and LibreOffice Calc, and the formulas must
recalculate when an input cell is edited.

| # | Gate | Evidence | State |
|---|---|---|---|
| 3.1 | `POST /api/public/export-budget` — one workbook per K-12 archetype (microschool, private+ESA, charter, homeschool co-op, charter ADA grade-band) opens in Excel desktop without a repair prompt. Filenames recorded below. | Per `docs/EXPORT_QA_CHECKLIST.md` §"Manual Spot Check Protocol"; export each fixture, save to `artifacts/api-server/qa-output/m7-<date>/<archetype>-budget.xlsx`, list the five filenames + Excel build number here. | [ ] |
| 3.2 | Same five workbooks open in LibreOffice Calc (≥ 7.6) without a repair prompt. | Open each file from §3.1; record LibreOffice build number + "no prompt" confirmation in this cell. | [ ] |
| 3.3 | Formulas recalculate when an input cell is edited: change the "tuition escalation %" cell on the Assumptions tab from its seed value to `0.05`; the Y5 revenue cell on the 5-Year Model tab updates and the new value matches the canonical compute from `lib/finance` for that input. | Per `docs/EXPORT_QA_CHECKLIST.md` §"Recalculation/Dependence Checks". Record the cell coordinates touched + the canonical-compute value used as the oracle. | [ ] |
| 3.4 | Zero `#REF!` / `#DIV/0!` / `#VALUE!` / `#N/A` / `NaN` / `undefined` / `null` cell values across all five workbooks. | `pnpm --filter @workspace/api-server run qa:excel -- artifacts/api-server/qa-output/m7-<date>/*.xlsx` reads `0 issues found`. Paste the run's summary line into this cell. | [ ] |

## 4. PDF render at scale — 10+ distinct fixtures, zero render errors

The lender-packet, board-packet, decision-comparison, and pro-forma
PDF generators must render every one of the named persona fixtures
without throwing, without producing the encoding-corruption pattern
that #922 fixed, and without dropping any declared section.

| # | Gate | Evidence | State |
|---|---|---|---|
| 4.1 | All 12 named persona fixtures render to PDF without throwing. The fixtures are: `liberty`, `oakwood`, `riverside` (integrity report personas); `microschool`, `private_school`, `charter`, `chesterton`, `chesterton_csn_wizard` (seed-preview personas from `artifacts/api-server/src/lib/seed-preview-data.ts`); `multi_debt_stack`, `restricted_gifts_heavy`, `capital_campaign_mid_cycle`, `voucher_scholarship_combo` (edge-case fixtures from `artifacts/api-server/tests/fixtures/lender-pdf-fixtures.ts:214`). | Run from repo root: `pnpm --filter @workspace/api-server run test:lender-pdf-text-snapshot && pnpm --filter @workspace/api-server run test:board-pdf-text-snapshot && pnpm --filter @workspace/api-server run test:decision-comparison-text-snapshot`. All three suites must read `0 failed`. Paste the final "N passed, 0 failed" line from each suite into this cell. | [ ] |
| 4.2 | No encoding-corruption regression — Task #922's text-extraction snapshot is byte-identical across two consecutive runs of `artifacts/api-server/tests/pdf-encoding-corruption-922.ts`. | `pnpm --filter @workspace/api-server exec tsx tests/pdf-encoding-corruption-922.ts` reads `0 failed` on two consecutive invocations. Paste both summary lines. | [ ] |
| 4.3 | No bullet-icon regression — Task #923's PDF bullet glyph snapshot in `artifacts/api-server/tests/pdf-bullet-icons-923.ts` is unchanged. | `pnpm --filter @workspace/api-server exec tsx tests/pdf-bullet-icons-923.ts` reads `0 failed`. Paste the summary line. | [ ] |
| 4.4 | No declared section is missing from any persona's lender packet PDF. | After §4.1 runs, `git diff -- artifacts/api-server/tests/__snapshots__/lender-packet-*.txt` is empty (or any diff has been reviewed and the new snapshot committed before the cutover). Paste the diff status (`empty` or commit SHA of the reviewed snapshot update). | [ ] |

## 5. Acknowledged-warning lifecycle — verified end-to-end

The assumption-flags subsystem emits warnings the founder can
acknowledge. The acknowledgement must persist, suppress the warning
on re-render, AND surface in the lender packet's audit trail so a
lender can see "this was flagged and acknowledged" rather than the
warning silently disappearing.

| # | Gate | Evidence | State |
|---|---|---|---|
| 5.1 | An acknowledged warning persists across a hard refresh of the wizard. | Manual: open a model in `/dashboard`, trigger a warning (e.g. low-working-capital), acknowledge it, hard-refresh the page, confirm the warning is suppressed. Document the model id + date in this evidence column. | [ ] |
| 5.2 | An acknowledged warning is recorded in the lender packet's audit-trail section. | Re-export the lender packet PDF after acknowledging; the audit-trail page must list the acknowledgement with timestamp and the warning class. | [ ] |
| 5.3 | An unacknowledged warning is rendered on the lender packet PDF (NOT silently dropped). | Same: an open warning must appear in the audit-trail with status `unacknowledged`. | [ ] |

## 6. Required-field validation — every `required_conditional` field covered (#928 follow-up)

`required_conditional` is the field-validation class for fields that
are required only when another field has a particular value (e.g.
"loan term" is required only if "has debt" is true). Task #928 filed
a follow-up to verify every one is validated; this gate is the
verification.

| # | Gate | Evidence | State |
|---|---|---|---|
| 6.1 | Every field annotated `required_conditional` in the wizard schema produces a blocking validation error when the trigger condition is true and the field is empty. | Sweep: `rg -nP "required_conditional\|requiredConditional" artifacts/school-financial-model/src lib/ artifacts/api-server/src` returns the field list. For each, write a unit test asserting the validator fires; file blocker follow-up if any are uncovered. | [ ] |
| 6.2 | The list of `required_conditional` fields is unchanged from the snapshot the M4 reviewer signed off on; any additions since require re-review. | Diff the rg output above against the snapshot kept in the M7 completion summary §B. | [ ] |

## 7. Confidence cap — verified at threshold boundaries (#929)

Already covered by `artifacts/api-server/tests/lender-readiness-cap.ts`
(four pillars: subsystem invariants, threshold-boundary cases at
0.29/0.30/0.59/0.60/0.99/1.00, "Strong" floor invariants, and
cross-surface callout determinism).

| # | Gate | Evidence | State |
|---|---|---|---|
| 7.1 | `pnpm --filter @workspace/api-server run test:lender-readiness-cap` reads `0 failed`. | Console output. | [ ] |
| 7.2 | Companion suite `test:lender-readiness-cap-health-risk` reads `0 failed`. | Console output. | [ ] |

## 8. TODO / FIXME / `[citation pending]` sweep — complete

Source-tree sweep for unfinished work that would embarrass the launch
if a reviewer found it during walkthrough.

| # | Gate | Evidence | State |
|---|---|---|---|
| 8.1 | The sweep below returns only entries documented as acknowledged sentinels. The sweep deliberately excludes the gate doc and the M7 completion summary themselves — they reference the tokens by name as part of documenting the gate, and including them in their own sweep would be self-referential. Run: `rg -nP "TODO\|FIXME\|\[citation pending\]" -g '*.ts' -g '*.tsx' -g '*.md' -g '!node_modules' -g '!dist' -g '!attached_assets' -g '!docs/operations/go-live-gate-checklist.md' -g '!docs/operations/m7-completion-summary.md'`. | Today's sweep returns three hits, all `[citation pending]`: (a) `artifacts/api-server/src/lib/lender-readiness-caps.ts:67` — JSDoc on the cap-tier table explicitly defining `[citation pending]` as an acknowledged value; (b) `artifacts/school-financial-model/src/lib/integrity/__tests__/extract-rendered.test.tsx:65` and (c) `artifacts/school-financial-model/src/components/consultant/__tests__/ConsultantAnalysisView.cap-preview.test.tsx:16` — test fixtures using the acknowledged sentinel as the `source` field. All three are acceptable; the gate is green. | [x] |
| 8.2 | Re-run the same sweep against the post-M7 `main` HEAD on the morning of the review. New hits require triage before the walkthrough. | Same `rg` invocation (including the two exclude flags for this checklist and the completion summary); expected count: 3 (the three sentinel entries from §8.1). | [ ] |

## 9. Production data migration plan — M6 ready to execute

The M6 plan (`docs/operations/go-live-data-migration-plan.md`) is the
data-side precondition for the cutover. The plan itself must be read
and signed off by the reviewer; the migrations themselves are
executed in the cutover window, NOT during the review.

| # | Gate | Evidence | State |
|---|---|---|---|
| 9.1 | M6 plan exists, names every schema/classification change since beta started, and assigns each to one of (`one-shot SQL`, `one-shot script`, `loader-side default`, `next-edit auto-upgrade`, `no action`). | `docs/operations/go-live-data-migration-plan.md` §1–§5. | [x] |
| 9.2 | Each migration named in §1 of the M6 plan has a rollback path documented in the same row. | Same file. | [x] |
| 9.3 | Pre-cutover affected-record counts have been run against the prod read-replica and inserted into the M6 plan's "Affected records" column. (M6 ships the SQL; M7 runs it.) | Run the M6 plan's `SELECT count(*)` snippets and write the counts back in. | [ ] |
| 9.4 | The reviewer has read the M6 plan end-to-end and acknowledged the cutover window. | Reviewer name + date in §E of the M7 completion summary. | [ ] |

## 10. Reviewer walkthrough — Lance Helming (or named backup)

One full end-to-end packet, hand-reviewed. Wizard input → engine
compute → workbook export → packet PDF → lender-facing presentation.

| # | Gate | Evidence | State |
|---|---|---|---|
| 10.1 | Review scheduled with Lance Helming for Fri May 29, 2026 (or backup Allison, with a named earliest-availability fallback if Lance is unavailable). | Calendar invite; record the confirmation date here. | [ ] |
| 10.2 | One named persona (one of the 12 in §4.1) has been walked end-to-end by the reviewer with a screen-share. | Reviewer notes captured in §C of the M7 completion summary. | [ ] |
| 10.3 | All blocking findings from the walkthrough have either been fixed same-day OR explicitly waived by the reviewer. | §D of the M7 completion summary names each finding, the disposition, and the reviewer's signoff. | [ ] |
| 10.4 | Non-blocking findings have been filed as named follow-up tasks (NOT dismissed verbally). | Filed task numbers listed in §D. | [ ] |

---

## Sign-off

This checklist's state column is the source of truth for go-live
authorization. Open the production cutover window only when every box
in §1–§10 reads `[x]` (verified green) or carries an explicit waiver
co-signed by the reviewer and one named member of engineering.

| Role | Name | Date | Signature |
|---|---|---|---|
| Reviewer | Lance Helming (or backup Allison) |  |  |
| Engineering | |  |  |
| Product |  |  |  |
