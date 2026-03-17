# Epic 1 Findings Memo — Budget Co-Pilot Phase 1

**Date:** 2026-03-17
**Scope:** Coaching foundation, KPI formula transparency, event tracking, alpha QA

---

## 1. What Was Built

Epic 1 delivers the coaching foundation for SchoolStack Budget:

- **Guidance mode system** — three tiers (Advanced / Basics / Extra Guidance) that control explainer visibility, auto-expansion behavior, and inline help density
- **Section explainers** — contextual help cards for 13 budget concepts (enrollment, revenue, payroll, occupancy, etc.) with structured content: "What this means," "Why it matters," "Healthy vs. risky," and "What to do next"
- **KPI formula transparency** — "How is this calculated?" drawers on all consultant analysis metrics showing plain-English formulas with healthy-range benchmarks
- **Event tracking infrastructure** — 10 coaching event types persisted to the `events` table via `POST /api/auth/track`
- **115 golden-model regression tests** covering the financial engine

---

## 2. Coaching Behavior by Mode

### Guidance Mode Prompt
- **Behavior:** Non-dismissible full-screen modal. No X button, no "Skip for now."
- Users must select a guidance level and click "Continue" before proceeding.
- The prompt appears on dashboard whenever `user.guidanceLevel` is null.
- After selection, the level is saved via `PATCH /api/auth/guidance-level` and the prompt disappears on `refetchUser()`.

### Auto-Expand Rules
| Explainer | Advanced | Basics | Extra |
|-----------|----------|--------|-------|
| enrollment_assumptions | — | ✓ auto-expand | ✓ auto-expand |
| revenue | — | ✓ auto-expand | ✓ auto-expand |
| tuition_assumptions | — | — | ✓ auto-expand |
| payroll | — | — | ✓ auto-expand |
| All other explainers | — | — | ✓ auto-expand |

**Rationale:** Basics mode surfaces only the two highest-friction beginner concepts (enrollment and revenue). Payroll intentionally does NOT auto-expand in Basics mode — while important, it is less likely to confuse a founder who has some familiarity with school budgets.

### Visibility Rules
- **Advanced:** All explainers are collapsed by default. User can manually expand any explainer.
- **Basics:** `enrollment_assumptions` and `revenue` auto-expand. All others are collapsed but visible and expandable.
- **Extra:** Most explainers auto-expand. All are visible and expandable.

---

## 3. Event Tracking

### Implementation
Events are sent from the frontend via `trackCoachingEvent()` (defined in `src/lib/coaching/track.ts`), which calls `POST /api/auth/track` with `{ event, metadata }`. The backend validates against an allowlist of 11 event types and persists to the `events` table via `trackEvent()`. Failures are non-blocking (caught and discarded on the client).

Events are **not** logged via `console.log` — they go through the authenticated API route and are stored in the database.

### Allowlisted Event Types
```
guidance_mode_prompt_shown
guidance_mode_selected
guidance_mode_changed
explainer_opened
explainer_collapsed
explainer_dismissed
kpi_formula_opened
kpi_formula_closed
wizard_section_completed
analysis_view_opened
```

### Sample Event Payloads

**1. Guidance mode selected (first-time user picks a level)**
```json
{
  "event": "guidance_mode_selected",
  "metadata": {
    "guidanceLevel": "basics"
  }
}
```

**2. Guidance mode changed (user switches level in settings)**
```json
{
  "event": "guidance_mode_changed",
  "metadata": {
    "previousGuidanceLevel": "basics",
    "guidanceLevel": "extra"
  }
}
```

**3. Explainer opened (user expands an inline help card)**
```json
{
  "event": "explainer_opened",
  "metadata": {
    "explainerId": "enrollment_assumptions",
    "section": "enrollment",
    "guidanceLevel": "basics"
  }
}
```

**4. KPI formula opened (user clicks "How is this calculated?")**
```json
{
  "event": "kpi_formula_opened",
  "metadata": {
    "kpiId": "dscr",
    "modelId": 52
  }
}
```

**5. Wizard section completed (user advances past a wizard step)**
```json
{
  "event": "wizard_section_completed",
  "metadata": {
    "section": "enrollment",
    "step": 2,
    "modelId": 52,
    "guidanceLevel": "basics"
  }
}
```

---

## 4. Wizard Section Completion Dedupe

- **Mechanism:** Persistent, localStorage-backed, keyed by model ID.
- **Key format:** `wizard_completed_{modelId}` — stores a JSON array of completed step numbers.
- **Behavior:** On page load, the wizard reads the stored set from localStorage. When a user advances past a step for the first time (for that model), the event fires and the step number is added to the set and written back to localStorage.
- **Scope:** Dedupe survives page reloads and re-visits to the same model. It does NOT dedupe across browsers or devices — a user who opens the same model in a different browser will re-fire section completion events.
- **Future hardening (optional):** Server-side idempotency by `(userId, modelId, section)` would provide global dedupe if analytics precision requires it.

---

## 5. What Was Hardened During Epic 1

| Area | What changed |
|------|-------------|
| KPI formulas | DSCR renamed to "Capital & Debt Costs," reserve months clamped to `max(0, ...)`, revenue growth benchmark changed from "five years" to "forecast horizon" |
| Event metadata | All events normalized to `guidanceLevel` (not `level`); mode changes use `previousGuidanceLevel` + `guidanceLevel` |
| KpiFormulaDrawer | Close button (X) now fires `kpi_formula_closed` via centralized `handleClose()` |
| InlineHelpCard | Reacts to guidance-level changes in real time via `useEffect` + `useRef(prevLevel)` |
| GuidanceModePrompt | X and "Skip for now" removed; non-dismissible until selection saved |
| Mobile polish | KpiFormulaDrawer: `max-w-[calc(100vw-1rem)]`, responsive text sizes, larger close touch target (`p-2.5`, `h-5 w-5` icon) |
| Wizard dedupe | Changed from in-memory `Set` to persistent localStorage by model ID |
| Dashboard | Removed unused `useState` import; prompt visibility driven purely by `!user.guidanceLevel` |

---

## 6. Known Risks and Limitations

1. **Client-local dedupe only** — Wizard section completion events can re-fire if the user clears localStorage or uses a different browser. Acceptable for alpha; consider server-side idempotency for production analytics.
2. **Some explainer events omit `guidanceLevel`** — The `explainer_opened` event fired from the manual expand button in `InlineHelpCard` does not include `guidanceLevel` in metadata (only the `useEffect`-driven auto-open variant does). Not a blocker, but normalizing all explainer events would improve analytics quality.
3. **`analysis_view_opened` omits `guidanceLevel`** — Adding `useAuth` to `ConsultantAnalysisView` just for one metadata field was deferred. If needed, this can be threaded through props.
4. **~~No server-side validation of `guidanceLevel` values~~ (RESOLVED)** — The `PATCH /api/auth/guidance-level` endpoint now enforces an enum check (`advanced | basics | extra`) via `VALID_GUIDANCE_LEVELS` in `auth.ts`.

---

## 7. Regression Test Status

| Suite | Result |
|-------|--------|
| `qa:golden` — 115 financial model assertions | **All pass** |
| `qa:excel` — 24 export generation tests | **All pass** |
| Frontend build (`vite build`) | **Clean** (builds successfully, no runtime errors) |
| Frontend typecheck (`tsc --noEmit`) | **19 type errors** — mostly missing `guidanceLevel` on `UserResponse` type and `customFetch` export. These are type-definition gaps in the shared `api-client-react` package, not runtime errors. |
| E2E (Playwright) — login, wizard flow, consultant, KPI drawers | **All pass** |

### E2E Test Coverage (2026-03-17)
- Login as admin (user id:50) → dashboard loads
- Created new model (id:53) → wizard Step 1 loads
- Navigated forward through all 8 wizard steps (Profile → Export)
- Navigated backward with Back button; step indicator updated correctly
- Opened existing demo model (id:52), loaded Consultant Analysis view
- KPI "How is this calculated?" drawer opens correctly
- No JavaScript console errors observed throughout

### Evidence Locations
- Golden test output: `artifacts/api-server/qa-output/qa-report.json` (24 export suites)
- Golden model assertions: run `pnpm --filter @workspace/api-server run qa:golden` (115 assertions)
- Export file samples: `artifacts/api-server/qa-output/*.xlsx`

### Event Tracking Verification
15 distinct event types recorded in production DB:
`analysis_view_opened`, `created_model`, `exported_lender_proforma`, `exported_loan_readiness_pdf`, `exported_single_year`, `exported_underwriting`, `exported_xlsx`, `guidance_mode_changed`, `kpi_formula_opened`, `logged_in`, `requested_password_reset`, `signed_up`, `updated_model`, `wizard_section_completed`, `wizard_step_timing`

---

## 8. Top 3 Recommendations for Epic 2

1. **Decision engine / diagnostic layer** — The coaching foundation is in place. The next high-value addition is a rules engine that evaluates model health and surfaces specific, actionable recommendations (e.g., "Your staffing cost ratio is 72% — consider deferring one hire to Year 2").

2. **Micro-lessons tied to explainers** — Explainers currently provide static guidance. Linking them to short interactive lessons (e.g., "How to project enrollment") would deepen the coaching experience for Basics and Extra users.

3. **Server-side event aggregation** — With tracking infrastructure in place, build a simple analytics view showing coaching engagement: which explainers are opened most, which guidance level is most popular, and where users spend the most time. This will inform coaching content priorities.
