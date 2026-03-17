# Co-Pilot Phase 1 — Stabilization & Validation Memo

**Date:** 2026-03-17  
**Task:** #73 — Co-Pilot Phase 1 Stabilization & Validation  
**Status:** Complete

---

## 1. Event Tracking (T001)

### Backend
- `POST /api/auth/track` endpoint added to `auth.ts` (authenticated)
- Allowlisted events:
  - `guidance_mode_prompt_shown`
  - `guidance_mode_selected`
  - `guidance_mode_changed`
  - `explainer_opened`
  - `explainer_collapsed`
  - `kpi_formula_opened`
  - `kpi_formula_closed`
  - `wizard_section_completed`
  - `analysis_view_opened`
- Events logged server-side via `console.log` (structured JSON)

### Frontend
- `trackCoachingEvent(event, metadata?)` utility in `src/lib/coaching/track.ts`
- Fire-and-forget pattern — never blocks UI

### Instrumented Components

| Component | Events |
|---|---|
| GuidanceModePrompt | `guidance_mode_prompt_shown`, `guidance_mode_selected` |
| GuidanceModeSelector | `guidance_mode_changed` |
| InlineHelpCard | `explainer_opened`, `explainer_collapsed` |
| ExplainerDrawer | `explainer_opened` |
| KpiFormulaDrawer | `kpi_formula_opened`, `kpi_formula_closed` |
| ConsultantAnalysisView | `analysis_view_opened` |
| ModelWizardPage (handleNext) | `wizard_section_completed` |

### Sample Payloads

```json
// wizard_section_completed
{
  "event": "wizard_section_completed",
  "metadata": {
    "section": "enrollment",
    "step": 2,
    "modelId": 52,
    "guidanceLevel": "basics"
  }
}

// explainer_opened
{
  "event": "explainer_opened",
  "metadata": {
    "explainerId": "enrollment-growth",
    "section": "enrollment",
    "guidanceLevel": "extra"
  }
}

// kpi_formula_opened
{
  "event": "kpi_formula_opened",
  "metadata": {
    "kpiId": "dscr",
    "modelId": 52
  }
}

// analysis_view_opened
{
  "event": "analysis_view_opened",
  "metadata": {
    "modelId": 52
  }
}
```

### Wizard Section Tracking Rule
- `wizard_section_completed` fires **only on the first successful `handleNext` progression** from each step within a wizard session
- Uses a `completedSteps` ref (Set) to deduplicate
- Includes `guidanceLevel` from auth context for correlation analysis

---

## 2. UI/UX Polish (T002)

### Changes Made
- **Explainer auto-expansion redesigned**: Each explainer now has an explicit `autoExpandFor: GuidanceLevel[]` field instead of relying on section membership. `shouldAutoExpand()` checks `explainer.autoExpandFor.includes(level)`.
- **"basics" curated subset**: Only 3 high-friction explainers auto-expand: `enrollment_assumptions`, `revenue`, `payroll`. All other explainers stay collapsed.
- **"extra" mode**: All 13 explainers auto-expand. Reviewed for clutter — compact card design keeps this usable.
- **"advanced" mode**: No explainers auto-expand (no explainer includes "advanced" in `autoExpandFor`).
- **InlineHelpCard**: Tightened spacing (px-3 py-2.5, text-[13px] body, smaller chevron icon)
- **ExplainerDrawer**: Mobile-responsive width (max-w-sm on mobile, smaller padding, reduced font sizes)

### Mobile Notes
- ExplainerDrawer: max-w-sm on screens < 640px, px-4 py-4 padding
- InlineHelpCard: Works well at 375px viewport width
- KpiFormulaDrawer: Shares ExplainerDrawer responsive treatment

---

## 3. KPI Formula Trust Check (T003)

### Comparison vs. consultant-engine.ts

All 8 KPI formulas were compared against the actual calculations in `consultant-engine.ts` (lines ~855–1170).

| KPI | Status | Changes |
|---|---|---|
| Revenue per Student | ✅ Correct | Minor label clarity |
| Staffing Cost % | ✅ Correct | Label: "salaries + benefits + payroll taxes" |
| Operating Cost % | ✅ Correct | No change |
| Net Margin | ✅ Correct | Clarified debt service inclusion |
| DSCR | ⚠️ Corrected | Formula updated from `NOI / Debt` to `(Net Income + Debt Payments) / Debt Payments` — matches engine's add-back calculation |
| Reserve Months | ⚠️ Corrected | Changed from "Ending Cash Balance" to "Cumulative Net Income" with proxy caveat |
| Revenue Growth | ✅ Corrected | Changed "Year 5" to "Final Year" for dynamic year count |
| Capacity Utilization | ✅ Correct | No change |

### Key Fix: DSCR Formula
The original formula showed `NOI / Debt Payments` but the engine calculates DSCR as `(Net Income + Debt Payments) / Debt Payments` — effectively adding back debt payments to get operating income before debt service. The interpretation text now explains this clearly.

### Key Fix: Reserve Months
The engine uses cumulative net income as a proxy for cash reserves, not an actual cash balance figure. The formula and interpretation now make this proxy relationship explicit.

---

## 4. Guidance Mode Behavior Validation (T004)

### E2E Test Results (all passing)

| Mode | Expected Behavior | Result |
|---|---|---|
| Compact (advanced) | All InlineHelpCards collapsed | ✅ Verified |
| Guided (basics) | Enrollment + Revenue cards expanded; others collapsed | ✅ Verified |
| Extra help (extra) | All InlineHelpCards expanded | ✅ Verified |
| null (no selection) | GuidanceModePrompt modal shown on dashboard | ✅ Verified |
| Navbar change | Immediate effect via PATCH + refetch | ✅ Verified |
| Prompt dismiss | Local dismiss (re-shows next session) | ✅ By design |
| Prompt save | Persists to DB, prompt never shows again | ✅ Verified |

---

## 5. Phase 2 Priorities

Based on stabilization findings, recommended Phase 2 priorities:

1. **Event Analytics Dashboard**: Surface coaching event data in admin view (event counts, funnel analysis per guidance level)
2. **Contextual Section Tips**: Add section-specific "Did you know?" tips that rotate based on what the user has already explored
3. **Guided Walkthrough Mode**: Optional step-by-step overlay for first-time users in "extra" mode
4. **A/B Guidance Defaults**: Test whether defaulting new users to "basics" vs. showing the prompt affects completion rates
5. **KPI Drill-Down**: Let users click into individual KPIs from the consultant view to see year-by-year breakdowns
6. **Persist Event Data to DB**: Move from console.log to a dedicated `coaching_events` table for long-term analytics
7. **React Max-Depth Warning**: Investigate intermittent `setState` max-depth warnings observed during rapid navigation (non-blocking but worth addressing)

---

## Files Modified in This Session

- `artifacts/api-server/src/routes/auth.ts` — POST /auth/track endpoint
- `artifacts/school-financial-model/src/lib/coaching/track.ts` — trackCoachingEvent utility
- `artifacts/school-financial-model/src/lib/coaching/kpi-formulas.ts` — formula corrections (DSCR, reserve months, revenue growth)
- `artifacts/school-financial-model/src/components/coaching/GuidanceModePrompt.tsx` — event instrumentation
- `artifacts/school-financial-model/src/components/coaching/GuidanceModeSelector.tsx` — event instrumentation
- `artifacts/school-financial-model/src/components/coaching/InlineHelpCard.tsx` — event instrumentation + spacing polish
- `artifacts/school-financial-model/src/components/coaching/ExplainerDrawer.tsx` — event instrumentation + mobile responsive
- `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx` — modelId pass-through + analysis_view_opened tracking
- `artifacts/school-financial-model/src/pages/model-wizard/steps/ConsultantStep.tsx` — modelId prop forwarding
- `artifacts/school-financial-model/src/pages/model-wizard/index.tsx` — wizard_section_completed tracking
