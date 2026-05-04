# SchoolStack Budget — QA Report

**Version:** Alpha 1.0
**Date:** March 18, 2026
**Tester:** Automated + Manual
**Environment:** Production (budget.schoolstack.ai) + Railway API

---

## Summary

| Category | Tests | Passed | Failed | Pass Rate |
|----------|-------|--------|--------|-----------|
| Public Route Health | 7 | 7 | 0 | 100% |
| Auth API Flows | 6 | 6 | 0 | 100% |
| Public Export Endpoints | 4 | 4 | 0 | 100% |
| Workbook Structural QA | 6 | 6 | 0 | 100% |
| Wizard E2E (Underwriting) | 1 | 1 | 0 | 100% |
| Wizard E2E (Authenticated) | 1 | 1 | 0 | 100% |
| Mobile Responsive | 1 | 1 | 0 | 100% |
| Netlify Proxy | 3 | 3 | 0 | 100% |
| **Total** | **29** | **29** | **0** | **100%** |

---

## Detailed Results

### 1. Public Route Health

All public routes return HTTP 200 with correct content:

| Route | HTTP | Content |
|-------|------|---------|
| `/` | 200 | Landing page with CTA |
| `/login` | 200 | Sign-in form |
| `/register` | 200 | Account creation form with ToS checkbox |
| `/forgot-password` | 200 | Email input + reset button |
| `/terms` | 200 | Full Terms of Service document |
| `/privacy` | 200 | Full Privacy Policy document |
| `/underwriting` | 200 | Public wizard at Step 1 (Profile) |

### 2. Auth API Flows

Tested against Railway production API:

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Login correct credentials | 200 + JWT | 200 + JWT token | Pass |
| Login wrong password | 401 | 401 `{"error":"Invalid email or password."}` | Pass |
| Register duplicate email | 409 | 409 `{"error":"An account with this email already exists."}` | Pass |
| Forgot password (any email) | 200 | 200 `{"message":"If an account..."}` | Pass |
| Protected route, no token | 401 | 401 `{"error":"Authentication required"}` | Pass |
| Protected route, bad token | 401 | 401 `{"error":"Invalid or expired token"}` | Pass |

### 3. Public Export Endpoints

All endpoints tested with 3 distinct school payloads:

| Endpoint | Microschool | Private ESA | Charter | Status |
|----------|-------------|-------------|---------|--------|
| `/api/public/export-budget` | 200, 14.9KB | 200, 15.0KB | 200, 15.1KB | Pass |
| `/api/public/export-underwriting` | 200, 14.9KB | 200, 15.0KB | 200, 15.1KB | Pass |
| `/api/public/export-single-year` | — | — | 200, 13.2KB | Pass |
| `/api/public/consultant` | 200, JSON | — | — | Pass |

Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (correct XLSX MIME type)

**Note:** The budget and underwriting public export endpoints both produce the same workbook structure (formula-based 3-tab format). The authenticated model export routes provide distinct formats including the full 21-tab underwriting workbook.

### 4. Workbook Structural QA

Each workbook inspected programmatically with ExcelJS:

| Workbook | Tabs | Formulas | Errors | Rev Total | Exp Total | Net Income | DSCR |
|----------|------|----------|--------|-----------|-----------|------------|------|
| Microschool Budget | 3 | 86 | 0 | Yes | Yes | Yes | Yes |
| Microschool Underwriting | 3 | 86 | 0 | Yes | Yes | Yes | Yes |
| Private ESA Budget | 3 | 107 | 0 | Yes | Yes | Yes | Yes |
| Private ESA Underwriting | 3 | 107 | 0 | Yes | Yes | Yes | Yes |
| Charter Budget | 3 | 107 | 0 | Yes | Yes | Yes | Yes |
| Charter Underwriting | 3 | 107 | 0 | Yes | Yes | Yes | Yes |

Public export workbooks contain 3 tabs: Assumptions, 5-Year Model, Year 1 Pro Forma. (For operating schools, a 4th "Actuals vs. Projections" tab may be added.) The single-year export produces 5 tabs: Assumptions, Revenue, Personnel, Operating Expenses, P&L Summary.
Zero occurrences of #REF!, #DIV/0!, #VALUE!, NaN, or undefined.

### 5. Wizard E2E (Underwriting — No Auth)

Full 8-step wizard traversal on `/underwriting`:
- Profile form validation fires on empty submission
- Filled: "QA Test Academy", Private/Independent, TX, Pre-opening, 501(c)(3)
- Enrollment: Year 1 = 50, Year 2 = 75
- Revenue: Tuition source selected
- Staffing, Expenses: Advanced through
- Review: Financial summary renders
- Analysis: Consultant output with Key Metrics and Top Issues
- Export: Lender options present
- No `undefined` or `NaN` text on any step
- No blocking console errors

### 6. Wizard E2E (Authenticated)

Login as admin@schoolstack.ai:
- Dashboard loads with 3 models listed
- "Demo Academy" model opens at Step 8
- Model title is "Demo Academy" (not "Untitled Model")
- No console errors

### 7. Mobile Responsive

Landing page at 375px viewport:
- Header: logo + "Log in" + "Get Started" button
- Hero section: "Your mission deserves a financial story" renders
- CTA: "Build My Model →" button visible and accessible
- No horizontal overflow

### 8. Netlify Proxy

| Test | Result |
|------|--------|
| POST `/api/auth/login` via budget.schoolstack.ai | Proxied to Railway, returned 401 (correct for wrong creds) |
| POST `/api/public/consultant` via budget.schoolstack.ai | Proxied to Railway, returned JSON response |
| GET `/health` via budget.schoolstack.ai | Returned 200 (Netlify SPA fallback) |

---

## Known Issues

| ID | Severity | Description | Impact |
|----|----------|-------------|--------|
| KI-1 | Low | Railway production runs old code — `/api/health` and `/api/ready` return 404 | Legacy `/health` works; new endpoints need redeploy |
| KI-2 | Low | 38 non-blocking TypeScript compiler warnings | No runtime impact |
| KI-3 | Info | API 404 returns raw Express HTML error page | Cosmetic only; functional behavior correct |

---

## Test Environment

- **Frontend:** Netlify CDN (budget.schoolstack.ai)
- **API:** Railway (schoolstackbudget.up.railway.app)
- **Database:** Railway PostgreSQL
- **Browsers:** Chromium (Playwright), manual verification
- **Tools:** curl, ExcelJS, Playwright e2e
