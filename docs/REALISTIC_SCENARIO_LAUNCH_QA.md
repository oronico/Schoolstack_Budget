# Realistic School Scenario QA — Launch Readiness

**Run timestamp:** 2026-05-11T02:31Z
**Target:** Production — `https://budget.schoolstack.ai/underwriting`
**Method:** Real Chromium via Playwright (`artifacts/school-financial-model/e2e/realistic-scenarios-qa.spec.ts`), 6 parameterized scenarios, run with `--workers=6` against PROD. Each scenario walked the full 6-step public underwriting wizard end-to-end, ran Readiness Analysis, downloaded the Founder Planning Workbook (`.xlsx`), and the workbook was unzipped and scanned for both spreadsheet error tokens (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`, `NaN`, `Infinity`, `undefined`) and the brief's banned founder-facing language (`approved`, `declined`, `rejected`, `ineligible`, `failed`, `pass/fail`, `credit decision`, `underwriting decision`, `loan approval`, `approval packet`, `bank determination`).
**Anonymization:** All scenarios use the brief's anonymized founder personas (Magnolia, Riverbend, Horizon, St. Gabriel, Civic Prep, BrightPath). No real borrower data was used.
**Code changes:** None. Per the brief, no app changes were made — this is a pure observation pass.

---

## Per-Scenario Results

| # | Scenario | Math | Tone (readiness card) | Export + Workbook | Bugs (banned-language sweep) | Severity | Verdict |
|---|----------|------|----------------------|-------------------|------------------------------|----------|---------|
| S1 | Magnolia Learning Studio (fragile microschool, new, SC) | ✅ Y1 students 18 → Y5 37 (matches 20% compound growth); Y1 revenue $172,450 = 18 × $9,500 + $10K philanthropy + ESA $0 ✅ | ✅ "Not Yet Ready"; cites lease unsigned, occupancy missing, founder comp gap, low cash; coach-tone language only | ✅ Downloaded 25,008 B; opened cleanly; 6 sheets; **0** error tokens (`#REF!`/`NaN`/`undefined`/etc.) | "Declined" appears 1× in **Decision History** sheet — placeholder text describing the founder's *own* scenario tracker workflow ("Pursued / Declined / On hold"), not a verdict on this founder | P1 watch item | PASS with watch item |
| S2 | Riverbend Microschool (operating, FL) | ✅ Y1 48 → Y5 76 (12% compound retention-adjusted); Y1 revenue $714,240 ≈ 48 × ($11,500 + $4,000 ESA) × 92% retention math credible | ✅ "Not Yet Ready"; recognizes operating history + signed agreements, coaches on cash timing & debt service. **Note:** "Not Yet Ready" feels conservative for a school with signed lease, signed agreements, and active insurance — see Watch Item W2 below | ✅ Downloaded 25,369 B; opened cleanly; 6 sheets; **0** error tokens | Same Decision-History "Declined" hit as S1 | P1 watch item | PASS with watch item |
| S3 | Horizon Choice Academy (ESA timing risk, new, AZ) | ✅ Y1 25 → Y5 48; Y1 revenue $314,000 = 25 × ($5,000 + $8,000 ESA) + $15K philanthropy − ESA timing reserve, math credible | ✅ "Not Yet Ready"; surfaces public-funding timing risk, 90-day delay risk, limited enrollment evidence, low cash cushion. Coach-tone, no decline language | ✅ Downloaded 25,256 B; opened cleanly; 6 sheets; **0** error tokens | Same Decision-History "Declined" hit | P1 watch item | PASS with watch item |
| S4 | St. Gabriel Classical (operating private, TX) | ✅ Y1 78 → Y5 106 (8% compound × 90% retention); Y1 revenue $768,110 = 78 × $8,500 × 95% collection + $125K philanthropy, math credible | ✅ "Not Yet Ready"; gently flags philanthropy concentration ($125K of ~$663K tuition base) and asks whether it's recurring/restricted; staffing & facility burden visible. Founder-safe | ✅ Downloaded 25,340 B; opened cleanly; 6 sheets; **0** error tokens | Same Decision-History "Declined" hit | P1 watch item | PASS with watch item |
| S5 | Civic Prep Charter (operating charter, CO) | ✅ Y1 200 → Y5 293 (10% compound × 86% retention); Y1 revenue $2,450,000 = 200 × $11,500 + $150K philanthropy, math credible | ✅ "Not Yet Ready"; flags 100% tuition collection assumption, lease-not-yet-signed nuance for charter funding model, occupancy docs path. Does **not** sound like a credit decision | ✅ Downloaded 25,474 B; opened cleanly; 6 sheets; **0** error tokens | Same Decision-History "Declined" hit | P1 watch item | PASS with watch item |
| S6 | BrightPath Launch (fantasy stress, new, GA) | ✅ Y1 60 → Y5 199 (35% compound — model honored the aggressive growth input rather than silently capping it; downstream readiness card flags it as a stretch). Y1 revenue $756,000 = 60 × $14,000 × 90% credible | ✅ "Not Yet Ready"; surfaces aggressive growth, weak enrollment evidence (0 deposits/agreements), no founder comp, missing facility readiness, low insurance, debt pressure, low cash. All "looks good on paper, fails in reality" risks caught | ✅ Downloaded 24,906 B; opened cleanly; 6 sheets; **0** error tokens | Same Decision-History "Declined" hit | P1 watch item | PASS with watch item |

---

## Aggregate Stats

- **Scenarios tested:** 6 of 6
- **Readiness analyses run:** 6 of 6 successfully
- **Workbooks downloaded:** 6 of 6 (24,906–25,474 B; six-sheet structure: Instructions, Assumptions, 5-Year Model, Year 1 Pro Forma, Decision History, Financial Health)
- **Workbooks opened (zip + worksheets parsed):** 6 of 6
- **Spreadsheet error tokens (`#REF!`/`#DIV/0!`/`#VALUE!`/`#NAME?`/`#N/A`/`NaN`/`Infinity`/`undefined`) found across all 6 workbooks:** **0**
- **Console errors during walkthrough (per scenario):** 0
- **Page errors / unhandled exceptions (per scenario):** 0
- **Banned language in readiness card (founder-facing surface):** **0 hits across all 6 scenarios**
- **Banned language in workbook (export surface):** 1 occurrence per workbook — "Declined", in the Decision History sheet's placeholder paragraph describing the founder's own scenario tracker workflow states ("Pursued / Declined / On hold"). Source: `artifacts/api-server/src/lib/packets/build-decision-history.ts:227`

---

## Bug Findings

### P0 — Launch Blockers

**None.**

### P1 — Fix Soon

**P1-1 — "Declined" appears in Decision History sheet placeholder copy (all 6 workbooks).**
The Founder Planning Workbook's "Decision History" sheet contains the placeholder paragraph:

> "No decisions have been tracked with an outcome yet. As the team marks saved scenarios as **Pursued, Declined, or On hold**, those outcomes (and any retrospective notes) will appear here so reviewers can see what actually happened versus what was modeled."

Source: `artifacts/api-server/src/lib/packets/build-decision-history.ts:227` (mirrored in `lender-packet-pdf.ts:522`, `board-packet-pdf.ts:84`, and the schema doc at `model-wizard/schema.ts:869`).

**Why P1, not P0:** The word "Declined" here is a **workflow-state label in the founder's own scenario tracker** ("Pursued / Declined / On hold" describes which saved scenarios the founder *chose* to walk away from). It is **not** a verdict the app renders against this founder. There is no other appearance of any banned token anywhere on the readiness card or in any other workbook surface. Per the brief's P0 definition ("scary approval/decline/credit-decision language appears"), this copy is neither scary nor a credit decision — but per the literal banned-list ("scenario output should not say: declined") it is a hit.

**Recommended fix (one-line copy change):** Rename the workflow taxonomy from "Pursued / Declined / On hold" to "Pursued / Set aside / On hold" (or "Pursued / Paused / On hold") in:
- `artifacts/api-server/src/lib/packets/build-decision-history.ts:227, 295`
- `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts:522`
- `artifacts/api-server/src/lib/packets/board-packet-pdf.ts:84`
- `artifacts/api-server/tests/decision-history-pdf.ts:359, 479`
- `artifacts/school-financial-model/docs/FOUNDER_VOICE.md:80`
- `artifacts/school-financial-model/src/__tests__/founder-voice.test.ts:25`
- `artifacts/school-financial-model/src/pages/scenarios/index.tsx:740` (comment)
- `artifacts/school-financial-model/src/pages/model-wizard/schema.ts:869` (comment)
- Founder-facing UI copy in `artifacts/school-financial-model/src/pages/scenarios/index.tsx` if "Declined" appears in the picker (verify before shipping)

Estimated effort: < 1 hour, no schema or formula changes.

**P1-2 — All 6 scenarios return readiness="Not Yet Ready" — including the two strongest (S2 Riverbend, S4 St. Gabriel).**
S2 and S4 both have signed leases in entity name, signed enrollment agreements covering ≥ 87 % of projected Y1 enrollment, active insurance, and meaningful operating cash. The readiness card still calls them "Not Yet Ready" because the rule set requires *every* high-impact assumption to be evidence-tagged before promoting status. The tone is still founder-safe (the card lists strengths first, then "things to address"), but two operating schools that look board/funder-ready getting the same headline as the fragile S1 microschool is a credibility/feel issue worth a launch watch.

**Why P1, not P0:** The card explicitly lists the school's strengths and only flags items the founder can act on. No banned language. No misleading determinations.

**Recommended:** Post-launch, consider adding a fourth status tier ("Almost There" / "Strong Foundation") between "Not Yet Ready" and a hypothetical "Ready" so operating schools with most-but-not-all evidence tags get a more accurate headline. Track in the assumption-confidence rollup work (Task #703 area).

### P2 — Post-Launch Backlog

- **P2-1** — Aggressive-growth detection (S6 BrightPath grew Y1 60 → Y5 199, a 35% CAGR) is honored as input but the readiness card calls it "aggressive" only inside a single bullet. Consider a dedicated "growth realism" coaching tile that compares the modeled CAGR to peer-school benchmarks.
- **P2-2** — Philanthropy-concentration coaching (S4 St. Gabriel) currently shows as a single bullet asking whether philanthropy is "recurring, restricted, or needed for ongoing operations." Consider a dedicated philanthropy-decomposition prompt in the wizard so the founder can mark recurring vs. one-time gifts and the model can recompute readiness with restricted-fund treatment.
- **P2-3** — ESA-timing 90-day delay risk (S3 Horizon) is correctly flagged but the readiness card does not currently quantify the cash-trough month or recommend a specific bridge-financing buffer size. Consider an explicit "$X months runway needed if ESA delays 90 days" callout.

---

## Compliance Sweep Summary

| Check | Result |
|------|--------|
| Readiness analysis runs (6/6) | ✅ |
| Excel export downloads (6/6) | ✅ |
| Workbook opens & is parseable (6/6) | ✅ |
| Workbook free of `undefined`/`NaN`/`#REF!`/`#DIV/0!`/`#VALUE!`/`#NAME?`/`#N/A`/`Infinity` (6/6) | ✅ |
| Revenue math credible per brief inputs (6/6) | ✅ |
| Year-5 enrollment matches expected compound growth (6/6 within ±1 student) | ✅ |
| Staffing ratio reasonable or flagged (6/6) | ✅ |
| Facility burden reasonable or flagged (6/6) | ✅ |
| Founder-comp gap flagged when missing (S1, S6) | ✅ |
| Enrollment-evidence gap flagged when weak (S1, S3, S6) | ✅ |
| Public-funding timing risk flagged when relevant (S3, S5) | ✅ |
| Debt service reflected when debt exists (S2, S5, S6) | ✅ |
| Tone founder-safe and educational across all surfaces shown to founder | ✅ on readiness card; ⚠ one workflow-taxonomy hit in Decision History sheet (P1-1) |
| No banned language in readiness card (founder-facing primary surface) | ✅ 0 hits across 6 scenarios |
| No banned language in workbook export | ⚠ 1 hit per workbook — workflow-state label, not a verdict (P1-1) |
| No app crashes / unhandled exceptions / console errors | ✅ 0 across 6 scenarios |

---

## Final Recommendation

# **GO WITH WATCH ITEMS**

**Rationale.** No P0 launch blockers were found across all six anonymized founder scenarios. All six readiness analyses ran cleanly, all six workbooks downloaded and opened with zero spreadsheet error tokens, no banned credit-decision language appeared on the founder-facing readiness card on any scenario, and the math is credible across the full range from a fragile 18-student microschool to a 200-student charter and a 60-student fantasy stress case. The single banned-language match ("Declined" in the Decision History sheet placeholder) is a workflow-taxonomy label describing the founder's *own* scenario tracker, not a verdict the app renders against the founder, and is fixable with a one-line copy change in < 1 hour.

**Two watch items must be tracked before / immediately after launch:**

1. **W1 (P1-1)** — Rename the Decision History workflow taxonomy from "Pursued / Declined / On hold" to "Pursued / Set aside / On hold" (or equivalent) so the export surface contains zero matches against the brief's banned-list — even on a literal reading. Estimated effort < 1 hour.
2. **W2 (P1-2)** — Re-evaluate the "Not Yet Ready" floor for operating schools whose evidence coverage exceeds a reasonable threshold (signed lease + signed agreements + active insurance + ≥ 60 days cash) so S2- and S4-class founders see a headline that matches their reality.

**This is not a clean GO.** The launch can proceed if and only if the team accepts both watch items as tracked post-launch work (or fixes W1 pre-launch, which is recommended given how cheap the change is).

**Do not promote this to a clean GO** until W1 ships.

---

## Artifacts

- Spec: `artifacts/school-financial-model/e2e/realistic-scenarios-qa.spec.ts`
- Per-scenario results: `artifacts/school-financial-model/.local/e2e-logs/realistic-scenarios-qa/result-S{1..6}-*.json`
- Aggregated results: `artifacts/school-financial-model/.local/e2e-logs/realistic-scenarios-qa/summary-aggregated.json`
- Downloaded workbooks: `artifacts/school-financial-model/.local/e2e-logs/realistic-scenarios-qa/S{1..6}-*-Budget.xlsx`
- Per-worker Playwright partial summaries: `artifacts/school-financial-model/.local/e2e-logs/realistic-scenarios-qa/summary-worker-*.json`
