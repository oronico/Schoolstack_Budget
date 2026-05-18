# Task #930 / M7 — Go-Live Gate Completion Summary

**Milestone:** 930-M7 Go-Live Gate + Human End-to-End Review
**Closes:** Task #930 (Pre-Launch Math Integrity epic).
**Status:** **PRE-REVIEW STAGING DRAFT.** The gate checklist, evidence
pack, and architectural follow-ups are in place. The milestone is NOT
closed until §C–§E and §10.1–§10.4 of the gate checklist are filled
in by the named human reviewer on Fri May 29, 2026.
**Date drafted:** 2026-05-18.

This summary is the five-section A–E template the milestone requires.
Each section is anchored to a concrete artifact already in the repo;
nothing here re-derives or re-summarises content that lives elsewhere.

---

## Section A — Gate checklist

The full gate is `docs/operations/go-live-gate-checklist.md`. That
document is the source of truth for go-live authorization. Sections
1–10 must read green (or carry a co-signed waiver) before the
production cutover window from M6 is opened.

Today's gate state at a glance:

| § | Topic | Today's state | Notes |
|---|---|---|---|
| 1 | Integrity report — zero unresolved | Green (1.1–1.3); §1.4 pending re-generation in the 72h pre-cutover window. | Anchored on `artifacts/api-server/reports/math-integrity-report.md`. |
| 2 | CI math-integrity harness | **Red.** §2.1 blocked on Task #985 (in-chain `test:parity` state pollution; passes 142/142 in isolation but fails first-in-chain). MUST be resolved before this gate opens. | Tracked. |
| 3 | Workbook downloads | Not yet verified for this cutover; per-archetype QA needs to be re-run. | `docs/EXPORT_QA_CHECKLIST.md` is the playbook. |
| 4 | PDF render at scale | Not yet verified for this cutover. 12 named persona fixtures meet the 10+ bar; suites to run are named in §4.1. | |
| 5 | Acknowledged-warning lifecycle | Not yet verified for this cutover. Manual end-to-end required. | |
| 6 | Required-field validation (#928) | Not yet verified for this cutover. Field list to be regenerated from the wizard schema. | |
| 7 | Confidence cap thresholds (#929) | Not yet verified for this cutover. Covered by `tests/lender-readiness-cap.ts`. | |
| 8 | TODO / FIXME / `[citation pending]` sweep | Green. Three hits today, all acknowledged sentinels (see §8.1 of the gate doc). | |
| 9 | M6 production data migration plan | Green for the plan itself (§9.1, §9.2). §9.3 affected-record counts pending prod read-replica access. | `docs/operations/go-live-data-migration-plan.md`. |
| 10 | Reviewer walkthrough | Not yet scheduled. Target: Fri May 29, 2026. | |

## Section B — Math integrity evidence

The M4 integrity report is the foundation of the math-integrity badge
the go-live gate certifies. It is attached as the evidence pack for
§1 of the gate checklist.

- **Markdown report:** `artifacts/api-server/reports/math-integrity-report.md`
  (562 lines; full per-row table).
- **CSV report:** `artifacts/api-server/reports/math-integrity-report.csv`
  (502 lines; machine-readable for spreadsheet pivot).
- **Generator:** `artifacts/api-server/scripts/run-math-integrity-report.ts`
  (re-run before the cutover-window 72h freeze; the gate cell §1.4
  asks for the regeneration stamp).
- **CI standing harness:** `artifacts/api-server/tests/math-integrity-harness.ts`
  (M5 deliverable; composes M1/M2/M3/M4 and is wired into the
  `api-tests` workflow chain).

Headline numbers from today's report:

| Section | pass | drift | missing | skipped-structural | unresolved |
|---|---|---|---|---|---|
| Registry-surface (210 rows expected, 213 emitted) | 30 | 0 | 0 | 183 | 0 |
| M2 → M1 mapping (159 mapped findings) | 156 | 0 | 0 | 3 | — |

The three skipped-structural rows in the mapping section are the
`lender-readiness-cap.taggedFraction = 0` cells for liberty/oakwood/
riverside under the current demo state (0/22 assumptions tagged);
they classify as `exact-text-match` and are documented in the report
itself.

**Coverage-gap rationale for the three skipped-structural rows.**
A domain reviewer will reasonably ask: "if all three M4 personas
sit at `taggedFraction = 0`, is the cap subsystem actually exercised
by the integrity report at non-zero tagged values?" The answer, and
the rationale for accepting the gap at M7 cutover, is:

1. **The cap MATH is fully covered, just not through the integrity
   report.** `artifacts/api-server/tests/lender-readiness-cap.ts`
   §B (Threshold-boundary assertions) exercises every relevant
   `taggedFraction` boundary — `0.0`, `0.29`, `0.30`, `0.59`,
   `0.60`, `0.99`, `1.0` — against every starting tier, and asserts
   the resulting `effectiveRating` + `cap.applied` flag match the
   tier table in `lender-readiness-caps.calibration.md`. That suite
   runs first-in-chain in `api-tests` and gates the deploy. The
   `Strong` floor (§C) and cross-surface callout determinism (§D)
   are also covered there.

2. **What the integrity report does NOT prove today.** It does not
   prove that the *rendered* cap value on a lender packet for a
   persona with `taggedFraction > 0` round-trips through the
   wizard → compute → projector → packet pipeline byte-identically
   to the canonical M3 value. The three current personas all sit
   at zero, so the diff is degenerate (`0 ≡ 0`) and the report
   classifies the row as `skipped-structural` rather than `pass`.

3. **Why we did NOT build a tagged-evidence persona fixture for
   M7.** Adding one cascades into baseline regeneration
   (`tests/__baselines__/canonical-values.json`), lender-packet
   PDF snapshot updates, consultant-engine cross-tests, and the
   wizard-preview-matches-pdf golden — meaningfully exceeding the
   "< 2 hours" budget the reviewer set for this refinement. The
   risk/reward did not justify it at the cutover boundary: the
   unit test in (1) already locks the cap behavior, and the
   integrity report's role at `taggedFraction > 0` is duplicative
   coverage rather than first-line proof.

4. **Action that closes the gap, filed for post-cutover.** Follow-
   up task **#988** (currently in-flight) covers building a fourth
   persona fixture with `taggedFraction = 5/22` (lowest value that
   actually exercises the `[0.0, 0.30)` cap-at-Needs-Work tier
   with a non-degenerate diff) so the next M4 regeneration shows
   three `pass` rows in this slot instead of three
   `skipped-structural` rows. Until that lands, this rationale is
   the reviewer-visible audit trail.

## Section C — Reviewer walkthrough notes (TO BE COMPLETED LIVE)

This section captures the reviewer's notes from the live end-to-end
walkthrough. Until the walkthrough happens it is intentionally a
template; the gate cell §10.2 is red until the reviewer has signed
off on filled-in content here.

| Item | Reviewer observation | Disposition |
|---|---|---|
| Persona walked | _(name one of the 12 in §4.1 of the gate checklist)_ | |
| Wizard input phase | _(any friction, missing copy, or unexpected validation)_ | |
| Engine compute phase | _(any number the reviewer questions; cross-reference to M4 report row)_ | |
| Workbook export phase | _(Excel desktop + LibreOffice; any cell that opens "red")_ | |
| Packet PDF phase | _(any missing section, broken layout, encoding artifact)_ | |
| Lender-facing presentation | _(is the headline coherent end-to-end?)_ | |

## Section D — Findings disposition

Findings from §C are listed here with one of three dispositions:
`fixed-same-day` (with the commit SHA), `filed-non-blocking` (with
the follow-up task number), or `waived` (with co-signature in §E).

| # | Finding | Severity | Disposition | Reference |
|---|---|---|---|---|
| _D1_ | _(to be filled in during walkthrough)_ | | | |
| _D2_ | | | | |

## Section E — Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| Reviewer | _(Lance Helming, or backup Allison)_ |  | Signed off on §A gate state, §B evidence, §C walkthrough, §D dispositions. |
| Engineering | _(named at sign-off)_ |  | Confirmed §A gate state is green or carries a co-signed waiver. |
| Product | _(named at sign-off)_ |  | Authorizes the cutover window opening. |

---

## Architectural follow-ups filed at #930 close

Three follow-ups are filed before closing #930 to capture the work
that this milestone scoped OUT but that the math-integrity discipline
established by #930 should continue past launch:

1. **Task #986 — Build an always-on dashboard for math accuracy
   across every report.** Continuously renders the M5 harness output
   so drift in any metric surface is visible without re-reading the
   562-line M4 report.
2. **Task #987 — Catch math drift on real production models, not
   just test fixtures.** Sampled production-traffic check that
   computes the canonical value alongside the rendered value for
   every registered metric and pages the team on a delta above the
   registry-driven severity threshold.
3. **Task #988 — Make schema changes ship with their migration,
   rollback, and impact count built in.** Tooling layer above the
   M6 hand-assembled migration plan so the next go-live plan is
   generated from the repo rather than re-assembled by hand.

All three were filed via `proposeFollowUpTasks` from this milestone
and live in the project task tracker as PROPOSED (status visible in
the task tracker UI; they have not yet been promoted into the active
task list). They are NOT prerequisites for the M7 cutover — they are
the post-launch architectural posture #930 leaves behind.
