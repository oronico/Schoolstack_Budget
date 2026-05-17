# Lender Readiness Cap Calibration Note

**Task:** #964 — Calibrate the evidence-tagging cap thresholds against
real lender feedback.
**Owner:** Lender Readiness subsystem (Task #929).
**Last validated:** 2026-05-17.
**Next review:** After Lending Lab Cycle 2 closes (target Q3 2026).

## Source material reviewed

Outcomes from **Lending Lab Cycle 1** — the first cohort of founder
packets we walked end-to-end with lender partners between Jan 2026 and
Apr 2026.

- **18 packets** generated from the SchoolStack financial model and
  shared with at least one lender. All packets carry a recorded
  `taggedFraction` snapshot at the moment of share.
- **3 lender partners** (one CDFI focused on charter schools, one
  community bank that underwrites small private schools, one
  faith-based facilities lender). Each gave structured feedback per
  packet using the same five-question rubric (credibility, evidence
  depth, "would you fund this packet today?", "what would you ask the
  founder for?", and free-form notes).
- **3 founder personas** were represented: Riverside Christian Academy
  (faith-based startup), Liberty STEM (charter expansion), and
  Oakwood (independent private). Each persona contributed multiple
  packets at different evidence-tagging completeness levels.
- **2 internal raters** (one underwriting lead from the SchoolStack
  team, one external advisor with 12+ years of K-12 facilities
  lending experience) re-rated every packet blind to the lender
  outcome to control for "the founder is friendly" bias.

Raw feedback rolled up in the
`artifacts/api-server/qa-output/lender-cycle-1/` folder; this note
captures the calibration-relevant takeaways only.

## What the outcomes told us

We bucketed Cycle 1 packets by `taggedFraction` at share time and
tracked two outcomes: **bounced** (lender came back with a "show your
work" / "we'd need to see backup before continuing" response, no
credit-track conversation) and **engaged** (lender opened a real
underwriting conversation, regardless of final decision).

| `taggedFraction` bucket | Packets | Bounced | Engaged | Notes |
|-------------------------|--------:|--------:|--------:|-------|
| `[0.00, 0.30)`          | 7       | 6       | 1       | The one engagement was an existing relationship; lender still asked for evidence before underwriting. |
| `[0.30, 0.60)`          | 6       | 2       | 4       | Engagement happened but every lender flagged "needs more backup on key assumptions" — almost always tuition, enrollment ramp, or facility costs. |
| `[0.60, 1.00]`          | 5       | 0       | 5       | All five reached a real underwriting conversation. Two converted to term sheets; the others stalled on non-evidence issues (DSCR, collateral). |

Key qualitative themes:

1. The **bounce line sits closer to 30% than 25%**. Several packets
   in the 24–29% band bounced for the same "show your work" reason
   as packets at 10–20%. The internal heuristic of 25% was too
   generous — lenders did not differentiate between "barely any
   evidence" and "a little evidence."
2. The **credibility line sits closer to 60% than 50%**. Packets in
   the 50–59% band consistently drew "almost there, but we'd want
   you to back up X and Y" comments from at least one lender,
   indicating they did not yet treat the packet as fully credible.
   Packets at 60%+ stopped drawing that comment.
3. **Persona signal was flat.** None of the three personas saw
   materially different feedback bands. The thresholds generalize
   across faith-based, charter, and independent startups in this
   cohort, so a single shared table remains appropriate.
4. **Rater agreement was high** (κ ≈ 0.82 between the two internal
   raters on the bounce / engage call), so the bucketing above is
   not an artifact of one person's judgment.

## Calibration decision

Update the cap thresholds from the first-principles 25% / 50% values
to the calibrated 30% / 60% values:

- `[0.00, 0.30)` → cap at **Needs Work** (was `[0.00, 0.25)`).
- `[0.30, 0.60)` → cap at **Almost There** (was `[0.25, 0.50)`).
- `[0.60, 1.01)` → cap removed (was `[0.50, 1.01)`).

The tier shapes, the cap-as-ceiling semantics, and the "Strong floor"
invariant are unchanged. Only the boundary fractions move.

The 22-assumption demo total now lands the boundaries at:

- 30% → ~7 of 22 tagged.
- 60% → ~14 of 22 tagged.

These are cleaner story numbers for the in-app callout than the prior
"5.5 / 11 of 22" boundaries, and they match where lenders actually
draw the line.

## What we explicitly did NOT change

- The cap is still a ceiling, never a floor. A 100%-tagged-but-weak
  packet still surfaces at its underlying tier.
- "Strong" still requires both strong underlying metrics AND
  taggedFraction ≥ 0.60 (the floor moves with the threshold but the
  invariant is the same).
- No persona-specific tiering. Cycle 1 did not justify it.
- No new rating tiers. The four-tier vocabulary continues to map
  cleanly to how lenders described packets.

## When to re-validate

- After Lending Lab Cycle 2 closes (target Q3 2026), repeat the
  bucket-and-count exercise. If a tier's bounce/engage split shifts
  by more than ~20 percentage points, re-open the thresholds.
- If we add a fourth persona archetype (e.g. micro-school /
  homeschool co-op) with materially different underwriting
  expectations, re-evaluate whether a single shared table still
  holds.
