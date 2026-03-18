# SchoolStack Budget — Alpha Release Checklist

**Version:** Alpha 1.0
**Target Date:** March 2026
**Product:** SchoolStack Budget (budget.schoolstack.ai)

---

## Pre-Launch Gates

### Infrastructure
- [x] Railway API server deployed and healthy (`/health` returns 200)
- [x] Netlify frontend deployed at budget.schoolstack.ai
- [x] Netlify `_redirects` proxies `/api/*` to Railway API
- [x] CORS configured via `ALLOWED_ORIGINS` environment variable
- [x] PostgreSQL database provisioned and connected
- [x] JWT_SECRET set in production environment
- [x] DATABASE_URL set in production environment
- [x] RESEND_API_KEY set for transactional emails

### Frontend Routes (All Return 200)
- [x] `/` — Landing page
- [x] `/login` — Sign-in form
- [x] `/register` — Account creation
- [x] `/forgot-password` — Password reset request
- [x] `/terms` — Terms of Service
- [x] `/privacy` — Privacy Policy
- [x] `/underwriting` — Public wizard (no auth required)
- [x] `/dashboard` — Authenticated model list
- [x] `/model/:id` — Authenticated wizard

### Mobile Responsive (375px)
- [x] Landing page renders correctly
- [x] Navigation collapses appropriately
- [x] CTA buttons are accessible

### API Auth Flows
- [x] POST `/api/auth/login` — correct credentials return 200 + JWT
- [x] POST `/api/auth/login` — wrong password returns 401
- [x] POST `/api/auth/register` — duplicate email returns 409
- [x] POST `/api/auth/forgot-password` — always returns 200 (no email leak)
- [x] GET `/api/models` — no token returns 401
- [x] GET `/api/models` — bad token returns 401

### Public Export Endpoints
- [x] POST `/api/public/export-budget` — returns valid XLSX
- [x] POST `/api/public/export-underwriting` — returns valid XLSX
- [x] POST `/api/public/export-single-year` — returns valid XLSX
- [x] POST `/api/public/consultant` — returns JSON analysis

### Wizard Flow (8 Steps)
- [x] Step 1 (Profile) — form validation works
- [x] Step 2 (Enrollment) — year-by-year input
- [x] Step 3 (Revenue) — source selection and amounts
- [x] Step 4 (Staffing) — position table
- [x] Step 5 (Expenses) — category-based entry
- [x] Step 6 (Review) — financial summary renders
- [x] Step 7 (Analysis) — consultant output renders
- [x] Step 8 (Export) — download and lending options

### Workbook Quality
- [x] Public budget/underwriting exports produce 3 tabs (Assumptions, 5-Year Model, Year 1 Pro Forma); operating schools may include a 4th "Actuals vs. Projections" tab
- [x] Single-year export produces 5 tabs (Assumptions, Revenue, Personnel, Operating Expenses, P&L Summary)
- [x] No #REF!, #DIV/0!, #VALUE!, NaN, or undefined in any cell
- [x] Revenue totals row present
- [x] Expense totals row present
- [x] Net income / surplus row present
- [x] DSCR row present (for models with debt service)
- [x] Formulas calculate correctly (86-107 formulas per workbook)

### Data Integrity
- [x] No "undefined" or "NaN" text visible on any page
- [x] No blocking JavaScript console errors
- [x] localStorage model persistence works across browser sessions

---

## Known Limitations (Alpha)

1. **Railway deployment**: New `/api/health` and `/api/ready` endpoints exist in code but Railway production still runs the old build. The legacy `/health` endpoint works. Requires Railway redeploy to enable new health endpoints.
2. **TypeScript warnings**: 38 non-blocking TS errors exist in the codebase (type mismatches in coaching/auth modules). These do not affect runtime behavior.
3. **Single user model**: No team/org support. Each user sees only their own models.
4. **No PDF export**: Alpha ships with Excel (XLSX) export only.
5. **Email delivery**: Password reset emails depend on Resend API key configuration.

---

## Launch Approval

| Role | Name | Approved | Date |
|------|------|----------|------|
| Product | | | |
| Engineering | | | |
| QA | Automated + Manual | Yes | March 2026 |
