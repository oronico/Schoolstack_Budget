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
   registry-driven severity threshold. **Update 2026-05-18 —
   promoted from post-launch into M6/M7 cutover scope.** The
   implementation (migration `0008_integrity_drift_events.sql`,
   schema, monitor module, four `routes/models.ts` call sites, admin
   UI route, operational doc, tests) all landed under the #987
   banner and are in main. The migration is row 1.6 of
   `docs/operations/go-live-data-migration-plan.md` §1. The activation
   posture (`INTEGRITY_DRIFT_SAMPLE_RATE=0` at cutover; flag raised
   only after the criteria in §"Production drift monitor — cutover
   posture" below are met) is the live decision; flip-the-flag is a
   post-cutover operational step, not part of the M7 review.
3. **Task #988 — Make schema changes ship with their migration,
   rollback, and impact count built in.** Tooling layer above the
   M6 hand-assembled migration plan so the next go-live plan is
   generated from the repo rather than re-assembled by hand.

All three were filed via `proposeFollowUpTasks` from this milestone
and live in the project task tracker as PROPOSED. **Task #987 was
subsequently promoted into M6/M7 cutover scope on 2026-05-18 —
see the inline update on item 2 above and §"Production drift
monitor — cutover posture" below.** Tasks #986 and #988 remain
post-launch architectural posture #930 leaves behind and are NOT
prerequisites for the M7 cutover.

---

## Production drift monitor — cutover posture (Task #987)

**Why this section exists.** A future reviewer opening `psql` after
cutover and asking "the `integrity_drift_events` table exists but
shows no rows — is the drift monitor broken?" should find the answer
here, not in commit messages or in someone's head. The empty table is
by design; the monitor is shipped **dark** at cutover and activated
deliberately once the conditions below are met.

### Cutover-day posture

- **Migration:** `0008_integrity_drift_events.sql` runs inline at
  Drizzle migrator boot (row 1.6 of the M6 plan §1). After cutover
  the table exists in production and the two btree indexes are built.
- **Code path:** the four `routes/models.ts` call sites (lines 1119,
  1195, 1311, 1382) DO call into `drift-monitor.ts` on every
  consultant / PDF / board / board-PDF response — fire-and-forget via
  `setImmediate`, never blocking the user response.
- **Sample gate:** `INTEGRITY_DRIFT_SAMPLE_RATE` is **unset (treated
  as `0`)** on the production Railway environment at cutover. With
  the gate at zero, the monitor short-circuits before any DB write,
  so the table stays empty by design.
- **Alert path:** ADMIN_EMAILS is wired but no digest can fire while
  `SAMPLE_RATE=0`. The first time the flag is raised above zero is
  also the first time the alert path is live against real traffic;
  treat that change as its own operational event.

### Criteria for raising `INTEGRITY_DRIFT_SAMPLE_RATE` above zero

These are go/no-go gates, not a target date. "Should we turn this on
yet?" has a yes/no answer when every box below is checked. If any
box is `[ ]`, the answer is no.

| # | Gate | Signal | State |
|---|---|---|---|
| DM.1 | **Real-founder packet volume.** At least **25** distinct real-founder financial models have rendered a lender or board packet end-to-end (not demos, not internal QA) since cutover, with zero PDF render errors and zero workbook export errors logged across those renders. | Count from the audit log; PDF/workbook error count from the structured log channel for the same window. | [ ] |
| DM.2 | **Stability window.** **7 consecutive calendar days** of post-cutover production traffic with no P0/P1 incident on a math-affecting code path (engine, packet builder, workbook writer, drift monitor itself). | Incident log + on-call rotation handoff notes. | [ ] |
| DM.3 | **CI integrity harness green.** The `api-tests` workflow has been green on `main` for the same 7-day window — specifically the `test:math-integrity-harness`, `test:integrity-canonical-compute`, `test:integrity-canonical-baseline`, `test:integrity-drift-monitor`, and `test:integrity-drift-monitor-coverage` lines. A red harness during the stability window resets the clock; alert fatigue from a monitor whose own CI is failing would be worse than no monitor. | Latest 7-day CI history. | [ ] |
| DM.4 | **Coverage gate green AND complete.** Every metric in `CANONICAL_METRICS` is either mapped to a packet leaf in `M2_LABEL_TO_METRIC` OR present in `PRODUCTION_DRIFT_EXCLUSIONS` with an auditable rationale. (`test:integrity-drift-monitor-coverage` enforces this; if it has been waived or skipped in the window, the answer is no.) | Test output + manual read of `src/lib/integrity/label-mappings.ts`. | [ ] |
| DM.5 | **Alert path proven.** A synthetic high-severity drift event has been injected (e.g. via a one-off script in a non-production environment with the same alerting wiring) and the digest landed in the ADMIN_EMAILS inbox within the configured `INTEGRITY_DRIFT_ALERT_DIGEST_MINUTES`. Live testing the paging mechanism on the same change that activates production paging is unacceptable. | Inbox screenshot + log line showing `digestPaged=true`. | [ ] |
| DM.6 | **First-48h owner named.** A specific engineer has agreed (calendar-confirmed) to be primary on-call for the first 48 hours after the flag is raised — to triage every digest, distinguish real drift from monitor false positives, and pull the flag back to zero if signal-to-noise is below 1:1. | Calendar invite + name recorded here. | [ ] |

### Activation procedure (when DM.1–DM.6 are all checked)

1. Start at `INTEGRITY_DRIFT_SAMPLE_RATE=0.01` (1% of traffic), not
   at `1.0`. Run for 24 hours. Read the first digest under no time
   pressure.
2. If signal-to-noise on the 24h window is ≥ 1:1 (real drift events
   outnumber monitor false positives), raise to `0.1` (10%) for
   another 24 hours.
3. Raise to `1.0` (full traffic) only after a second clean 24h window
   at `0.1`. Record each transition (timestamp, prior rate, new rate,
   reason) in this section as an append-only log below.

### Activation log (append-only)

| Date | Prior rate | New rate | Operator | Reason / signal |
|---|---|---|---|---|
| _(none — flag is at 0 as of cutover)_ | | | | |
