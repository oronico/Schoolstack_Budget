# Lending Lab × Budget — Operational Runbook

> Institutional memory for the program team running the Lending Lab and using SchoolStack Budget as the standard pre-application tool. Covers applicant onboarding, what each Budget output is used for, support escalation, and the metrics we track.

Last updated: May 2026.

Companion to `docs/RUNBOOK-engineering.md` (engineering institutional memory).

---

## 1. Program premise

The Lending Lab is the front door to financing for school founders. Budget is the standard financial-modeling tool the Lab requires (or strongly encourages) every applicant to use before submitting an application.

Why this matters for the Lab:

- Every applicant arrives with a comparable, structured 5-year model — not a snowflake spreadsheet.
- Underwriting time per application drops materially because assumptions, evidence, and stress tests are already structured.
- The Lab gains a standing data asset on applicant financial maturity across the cohort.
- Conversion from inquiry → fundable application goes up.

Why this matters for the founder:

- They walk into underwriting with a model their banker will actually open.

---

## 2. The applicant journey (operational)

```
Inquiry  →  Lab intake call  →  Budget account provisioned
       →  Applicant completes 12-step wizard
       →  Applicant exports Lender Packet + Underwriting Workbook + Loan Readiness Scorecard
       →  Applicant submits application + exports
       →  Underwriting review against the standard checklist
       →  Decision
```

### Stage-by-stage, what the Lab actually does

#### Stage 1 — Inquiry
- Capture school name, founder name, contact, school type (charter / private / microschool / learning lab), stage (startup / operating).
- Tag inquiry with cohort and intake date.

#### Stage 2 — Lab intake call (30 min)
- Confirm the founder fits Lab criteria.
- Walk through what Budget is and what they will get out of it.
- Set expectations: ~90 minutes of focused time to land a usable model; longer if they want full lender readiness.
- Provision their Budget account before the call ends. Send the welcome email with their account link and the demo-school walkthrough link.

#### Stage 3 — Applicant completes the wizard
- Lab role: passive support. Founder works through the 12 steps at their own pace.
- The Quick-Start single-year mode is acceptable for founders who need to land *something* fast; encourage expansion to the full 5-year model before they submit.
- Coaching cards fire automatically inside the product — Lab does not need to send tutorials for things the product already explains.
- If a founder gets stuck, see Support Escalation (section 5) before opening a ticket.

#### Stage 4 — Applicant exports the standard packet
The minimum required submission packet is:

1. **Lender Packet (PDF)** — primary narrative document.
2. **Underwriting Workbook (Excel, 26 tabs)** — the full math, formula-linked.
3. **Loan Readiness Scorecard (PDF)** — applicant's own readiness verdict.

Optional / situational:

- **Board Packet (PDF)** — when the school has a governing board the lender wants to see.
- **Decision Comparison (PDF)** — when the application involves a strategic choice (new site, new program, expansion).

Filenames are canonical (`<SchoolName>_<artifact>.<ext>`). Do not rename them — the underwriting checklist matches on the canonical name.

#### Stage 5 — Submission
- Applicant uploads all three required exports through the application portal.
- Lab confirms receipt and the canonical filename pattern.

#### Stage 6 — Underwriting review
See section 4 for the underwriting-side use of each output.

#### Stage 7 — Decision
- Approve, conditional, decline.
- For declines or conditionals: the Lender Packet's "Stress Tests" and "Loan Readiness Scorecard" sections become the basis of the coaching follow-up. The founder can return to Budget, address the gaps, and re-submit.

---

## 3. Talking points for the intake call

When introducing Budget to an applicant, lead with these:

- **"You don't need to be a CFO to use this."** The product adapts its tone and depth to your finance background. It explains as it goes.
- **"It produces what your lender will actually want."** A 26-tab Excel workbook with linked formulas, a multi-section PDF lender packet, a board packet, a readiness scorecard, and side-by-side decision comparisons. All from the same model.
- **"It does the math you'd otherwise have to learn."** Payroll tax caps, fully-loaded benefits, smart escalation, per-pupil funding mix, ESA timing, DSCR, days cash on hand. You answer in plain language; Budget does the math.
- **"You'll see your model the way a banker sees it."** Real-time DSCR and DCOH, stress tests for ESA delays / rent shocks / enrollment misses / wage inflation, and a Strong / Adequate / Needs Work readiness verdict before you submit.
- **"Plan for ~90 minutes of focused time."** Quick-Start single-year mode if you need to land something today; full 5-year for lender readiness.
- **"Demo schools let you explore everything before you touch your own numbers."** Charter, private, microschool, and learning-lab demo models are pre-populated.

What NOT to oversell: this is not a substitute for a banking conversation, a CPA review, or legal counsel.

---

## 4. How underwriting reads each output

The underwriting checklist maps cleanly onto Budget's exports.

| Underwriting question | Where to find it in the Budget output |
| --- | --- |
| Can this school service its debt? | Lender Packet → DSCR section. Underwriting Workbook → debt-service tabs. |
| How thin is the cash position at the worst point? | Lender Packet → DCOH trough call-out. Workbook → cash-runway tab. |
| Are the assumptions defensible? | Lender Packet → Assumptions & Evidence section. Each line tagged Estimate / Quote / Signed Contract. |
| What happens if enrollment misses? | Lender Packet → Stress Tests section. Run automatically. |
| What happens if ESA payments are delayed? | Same — ESA delay scenario runs automatically. |
| Does the operator understand the model? | Lender Packet → Lender Narrative section, written by the founder. |
| Are the PDF and the Excel telling the same story? | Yes, by construction. Cross-engine parity is enforced in the engineering test suite. |
| Is this comparable to the rest of the cohort? | Yes — every applicant uses the same model structure. |

If the underwriting team finds a number in the PDF that disagrees with the Excel, that is a bug, not an applicant error. Escalate to engineering.

---

## 5. Support escalation

The order of operations for an applicant who is stuck:

1. **Check the in-product help.** Coaching cards explain most of what gets people stuck. Have they read the card on the screen they're on?
2. **Check the demo school.** Pointing the applicant at a populated demo school of the same type usually unblocks "what should I put here?" questions.
3. **Lab support response (24 business hours).**
   - Categorize the issue: data entry, conceptual (didn't understand a finance term), product bug, export problem.
   - For conceptual: send a written explanation. Capture the question — if it comes up twice, file it as a candidate micro-lesson.
   - For data entry: walk them through the affected step on a screen-share.
4. **Escalate to engineering** when:
   - An export fails to generate, or fails to open in Excel / a PDF reader.
   - Numbers are visibly wrong (e.g. negative cash where the inputs say there shouldn't be).
   - The same issue is hit by 3+ applicants in a cohort.
   - A founder cannot complete a step due to a UI error or a missing field.
5. **Engineering ticket format:** account email, school name, wizard step or export name, exact error message, screenshot, time of occurrence (UTC). Engineering needs all six fields.

---

## 6. What to track (program metrics)

Run these monthly. They are the leading indicators of program health.

### Adoption
- % of Lending Lab inquiries that complete the Budget wizard end-to-end (any export generated).
- Time-to-first-export from account creation.
- % of submissions that include all three required exports (Lender Packet, Underwriting Workbook, Loan Readiness Scorecard).

### Quality
- Distribution of Loan Readiness Scorecard verdicts at submission (Strong / Adequate / Needs Work).
- % of applicants who used the Decision Comparison export when their application involved a strategic choice.
- # of evidence attachments per Assumptions & Evidence section.

### Conversion
- Inquiry → Budget account created.
- Budget account → first export generated.
- First export → submitted application.
- Submitted application → fundable / approved.
- Approved → funded.

### Underwriting efficiency
- Average underwriting time per application, before and after Budget adoption.
- # of clarification cycles between underwriting and applicant per application.
- # of applications declined for "model quality" reasons (target: trending to zero).

### Cohort signal
- Cohort-level distribution of DSCR (Year 1, Year 5).
- Cohort-level distribution of DCOH trough.
- Cohort-level distribution of school stage and type.

---

## 7. When Budget changes

The engineering team ships changes regularly. The Lab should:

- Subscribe to release notes from engineering.
- Re-walk the wizard quarterly so program coaches stay current with the actual product.
- Re-train any Lab member who hasn't shipped a fully-populated demo school in the last 90 days.
- Flag any change that materially affects the underwriting checklist (new export, new section, new metric) so the checklist is updated in lock-step.

If a wizard step is added, removed, or substantially re-ordered, the talking points in section 3 and the underwriting mapping in section 4 must be updated within the same week.

---

## 8. Decision rights

| Decision | Owner |
| --- | --- |
| Whether Budget is required or strongly encouraged for a given cohort | Lab Director |
| Underwriting checklist contents | Head of Underwriting (with engineering input) |
| Product feature requests | Product / engineering, prioritized against roadmap |
| Support escalation thresholds | Lab Operations Lead |
| Public talking points about Budget | Lab Director + Comms |
| Sharing applicant data with engineering for debugging | Lab Director, per-incident, with applicant consent |

---

## 9. The one-liner

> Every Lending Lab applicant uses Budget. The Lab gets a comparable, lender-ready model from every applicant. The applicant gets a model their banker will actually open. Underwriting gets back its time.
