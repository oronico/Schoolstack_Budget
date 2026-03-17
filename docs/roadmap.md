# SchoolStack Budget — Product Roadmap

**Last updated:** 2026-03-17

---

## Epic 1: Trust Layer (COMPLETE)

Coaching foundation that earns founder trust through transparency.

**Delivered:**
- Guidance mode system (Advanced / Basics / Extra Guidance)
- 13 section explainers with structured coaching content
- KPI formula transparency drawers ("How is this calculated?")
- 10 coaching event types for analytics
- 115 golden-model regression tests
- Production deployment (budget.schoolstack.ai + Railway API)

**Carried forward to Epic 2 backlog:**
- 19 TypeScript strict-mode errors (build passes, `tsc --noEmit` does not)
- `RESEND_API_KEY` not configured on Railway; password reset emails not sending
- `EMAIL_FROM` / `APP_URL` env vars needed on Railway for production email delivery
- Verified domain in Resend for deliverability (currently using `onboarding@resend.dev`)

**Findings:** `docs/epic1-findings.md`

---

## Epic 2: Decision Engine

**Goal:** Tell founders what the numbers mean and what to fix next.

**Why it matters:** The trust layer shows how numbers are calculated. The decision engine tells founders which numbers are problems and what actions to take — turning a spreadsheet into an advisor.

### Draft Tickets

#### E2-01: Top 3 Issues Panel
- Surface the 3 most critical financial risks in the model
- Each issue: severity badge, plain-English description, affected metric, link to relevant wizard step
- Pulls from KPI engine (debt service coverage, cash runway, revenue concentration, etc.)
- **Depends on:** Epic 1 KPI formulas (complete)

#### E2-02: Ranked Recommendations Engine
- Prioritized list of actions a founder should take to improve their model
- Each recommendation: impact estimate, difficulty, affected line items
- Recommendations update live as the model changes
- **Depends on:** E2-01 (issues feed recommendations)

#### E2-03: Scenario Comparison
- Side-by-side comparison of 2–3 model variants (e.g., "What if enrollment is 20% lower?")
- Delta highlighting for changed KPIs
- Save/name scenarios
- **Depends on:** E2-01 (issues panel shows per-scenario)

#### E2-04: Annual vs Monthly Cash Distinction
- Separate annual cash flow summary from monthly cash flow detail
- Monthly view: show seasonality, enrollment ramp, tuition collection timing
- Annual view: show year-over-year trajectory
- **Depends on:** None (engine-level work)

#### E2-05: Founder-Facing Interpretations
- Replace raw metric labels with contextual, jargon-free copy
- Add "What does this mean for my school?" beneath every KPI
- Tone: confident advisor, not textbook
- **Depends on:** E2-01, E2-02 (interpretations reference issues + recommendations)

#### E2-06: TypeScript Strict Mode Cleanup
- Fix 19 carried-forward type errors
- Ensure `tsc --noEmit` passes clean
- **Depends on:** None (can run in parallel)

#### E2-07: Production Email Configuration
- Set `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` on Railway
- Verify `schoolstack.ai` domain in Resend dashboard
- Test password reset flow end-to-end in production
- **Depends on:** None (can run in parallel)

### Suggested Order
1. E2-06 + E2-07 (cleanup, parallel)
2. E2-04 (cash distinction — engine foundation)
3. E2-01 (top 3 issues)
4. E2-02 (recommendations)
5. E2-05 (interpretations)
6. E2-03 (scenario comparison — most complex)

---

## Epic 3: Output Productization

**Goal:** Generate professional, usable deliverables for lenders and boards.

**Why it matters:** A model is only useful if it produces documents that lenders will accept and boards will read. This epic turns the engine into a document factory.

**Depends on:** Epic 2 (recommendations + interpretations feed the narrative)

### Draft Tickets

#### E3-01: Lender-Ready Packet
- Single-download ZIP: cover page, 5-year projections, assumptions summary, KPI dashboard, debt service analysis
- Formatted for print (letter size, branded headers/footers)
- **Depends on:** E2-01, E2-04

#### E3-02: Board-Ready Packet
- Condensed executive summary: 3–5 pages max
- Key metrics, year-over-year trends, top risks, budget vs actuals placeholders
- Designed for non-financial board members
- **Depends on:** E2-01, E2-05

#### E3-03: Model-Generated Financial Narrative
- AI-generated prose that explains the model in plain English
- Covers: school profile, enrollment plan, revenue strategy, staffing plan, facilities, capital, 5-year outlook
- Founder can review and edit before export
- **Depends on:** E2-02, E2-05 (uses recommendations + interpretations as input)

#### E3-04: Show-Your-Work Traceability
- Every output number links back to its input assumptions
- "Where does this $1.2M come from?" → drill-down to enrollment × tuition × collection rate
- Audit trail for lender due diligence
- **Depends on:** E2-04

#### E3-05: Polished Export Packaging
- Branded cover pages with school logo, date, preparer name
- Table of contents, page numbers, professional typography
- XLSX formula workbook with locked structure + unlocked inputs
- PDF export option for final deliverables
- **Depends on:** E3-01, E3-02, E3-03, E3-04

### Suggested Order
1. E3-04 (traceability — foundational for all outputs)
2. E3-01 (lender packet — highest external value)
3. E3-02 (board packet)
4. E3-03 (narrative generation)
5. E3-05 (packaging polish — final mile)

---

## Dependency Map

```
Epic 1 (Trust Layer) ──── COMPLETE
  │
  ├── E2-06 (TS cleanup)         ← parallel
  ├── E2-07 (email config)       ← parallel
  ├── E2-04 (cash distinction)   ← parallel
  │
  └── E2-01 (top 3 issues)
        ├── E2-02 (recommendations)
        │     └── E2-05 (interpretations)
        │           ├── E3-02 (board packet)
        │           └── E3-03 (narrative)
        ├── E2-03 (scenario comparison)
        ├── E3-01 (lender packet)
        └── E3-04 (traceability)
              └── E3-05 (packaging)
```
