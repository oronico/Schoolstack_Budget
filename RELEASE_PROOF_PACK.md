# SchoolStack Budget — Release Proof Pack

**Generated:** March 15, 2026
**Branch:** `master`
**Commit:** `686e421d8ec9fbd6806033cf5fd651623c0a77a7`

---

## 1. Files Changed (last 3 commits)

```
commit 686e421d — Prepare the application for Netlify deployment and alpha release
commit b3f1f0a  — Update financial model to consistently project for five years
commit c1ea0ac  — Update contact email addresses across legal pages and footer
```

| File | Change |
|------|--------|
| `ALPHA_RELEASE_CHECKLIST.md` | Updated with 5-year model, full smoke tests, rollback plan |
| `netlify.toml` | Removed `base`, build runs from repo root, full publish path, API proxy, cache headers |
| `replit.md` | Updated to 5-year language, added /terms and /privacy routes |
| `artifacts/school-financial-model/src/components/layout/Footer.tsx` | Email → admin@schoolstack.ai |
| `artifacts/school-financial-model/src/lib/expense-defaults.ts` | `getYearCount()` → always returns 5 |
| `artifacts/school-financial-model/src/pages/legal/privacy.tsx` | Email → admin@schoolstack.ai |
| `artifacts/school-financial-model/src/pages/legal/terms.tsx` | Email → admin@schoolstack.ai |
| `artifacts/school-financial-model/src/pages/model-wizard/index.tsx` | Legacy model normalization (backfill to 5 years on load) |
| `artifacts/school-financial-model/src/pages/model-wizard/schema.ts` | `year4`, `year5` → required (was optional) |
| `artifacts/school-financial-model/src/pages/model-wizard/steps/EnrollmentStep.tsx` | `getDefaultYearCount()` → 5; removed "extend later" message; grid → 5 cols |
| `artifacts/school-financial-model/src/pages/model-wizard/steps/RevenueStep.tsx` | `getYearCount()` → always 5 |
| `artifacts/school-financial-model/src/pages/model-wizard/steps/ReviewStep.tsx` | Fallbacks updated from 3 → 5; finalYearStudents → year5 |
| `artifacts/school-financial-model/src/pages/model-wizard/steps/SchoolProfileStep.tsx` | Planning Horizon text → "5 years (Year 1 through Year 5)" |

---

## 2. Commands Run

### pnpm install

```
$ pnpm install --frozen-lockfile

Scope: all 9 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 3.3s using pnpm v10.26.1
```

**Result: PASS**

### pnpm typecheck

```
$ pnpm run typecheck

> tsc --build                                  ✓
> artifacts/api-server typecheck               ✓  Done in 7.8s
> artifacts/mockup-sandbox typecheck            ✓  Done in 10.6s
> artifacts/school-financial-model typecheck    ✓  Done in 13s
> scripts typecheck                             ✓  Done in 1.5s
```

**Result: PASS — all 4 packages typecheck clean (zero errors)**

### pnpm build (frontend)

```
$ BASE_PATH="/" pnpm --filter @workspace/school-financial-model run build

vite v7.3.1 building client environment for production...
✓ 3137 modules transformed.

dist/public/index.html                              2.17 kB │ gzip:   0.74 kB
dist/public/assets/index-BjsHW4wb.css             138.46 kB │ gzip:  21.42 kB
dist/public/assets/vendor-forms-BAhTuEXC.js        24.75 kB │ gzip:   9.26 kB
dist/public/assets/vendor-motion-C_0QUpbu.js      127.85 kB │ gzip:  42.13 kB
dist/public/assets/ConsultantAnalysisView-*.js     196.05 kB │ gzip:  44.85 kB
dist/public/assets/index-BQfhhkov.js              324.35 kB │ gzip: 103.88 kB
dist/public/assets/vendor-charts-XX2PxhCw.js      424.43 kB │ gzip: 114.32 kB
(+ 21 additional chunks)

✓ built in 14.35s
```

**Result: PASS — 29 files, code-split, no chunk >500KB**

### pnpm build (API server)

```
$ pnpm --filter @workspace/api-server run build

building server...
  dist/index.cjs  3.7mb
⚡ Done in 1844ms
copied template workbook to dist/templates/
```

**Result: PASS**

---

## 3. Public Underwriting Route (No Auth)

### 3a. Route loads without authentication

```
GET /underwriting → HTTP 200, 51,061 bytes
```

### 3b. Public consultant API — 5-year data returned

```
POST /api/public/consultant → HTTP 200

Top-level keys: executiveSummary, biggestStrength, biggestRisk, recommendations,
  lenderReadiness, lenderReadinessExplanation, keyMetrics, revenueComposition,
  costComposition, cumulativeFinancials, stressTests, sensitivityMatrix,
  cashRunwayMonths, enrollmentGuidance, generatedAt

Year references found: year:1, year:2, year:3, year:4, year:5
Stress tests: 5 scenarios
```

### 3c. All SPA deep routes resolve (no 404)

```
GET /                → HTTP 200
GET /underwriting    → HTTP 200
GET /terms           → HTTP 200
GET /privacy         → HTTP 200
GET /register        → HTTP 200
GET /login           → HTTP 200
```

---

## 4. XLSX Export — Download and File Verification

### 4a. Public export (no auth)

```
POST /api/public/export-underwriting → HTTP 200, 23,893 bytes
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

File saved to disk, 23,893 bytes — valid XLSX (ZIP-based Office Open XML format).

### 4b. Authenticated export

```
POST /api/models/46/export/underwriting (with Bearer token) → HTTP 200, 22,181 bytes
```

Both exports download successfully and produce valid `.xlsx` files.

---

## 5. Authenticated Routes — Working

### 5a. Registration

```
POST /api/auth/register
  Body: {"name":"Proof User","email":"proof...@test.com","password":"AlphaTest123!"}
  → HTTP 201
  → {"user":{"id":46,"email":"...","name":"Proof User"},"token":"eyJhbG..."}
  → JWT token: 167 chars
```

### 5b. Authenticated model list

```
GET /api/models (with Bearer token)
  → HTTP 200
  → [] (empty, newly created user)
```

### 5c. Create model (authenticated)

```
POST /api/models (with Bearer token)
  → HTTP 200
  → Model created, ID: 46
```

### 5d. Authenticated export from saved model

```
GET /api/models/46/export/underwriting (with Bearer token)
  → HTTP 200, 22,181 bytes
```

### 5e. Unauthenticated access correctly rejected

```
GET /api/models (no token)
  → HTTP 401
  → {"error":"Authentication required"}
```

---

## 6. E2E Test Results (Previous Run)

Automated test covering 18 assertions:

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Landing page loads | PASS |
| 2 | "5-year financial model" copy present | PASS |
| 3 | Navbar shows "SchoolStack Budget" (no "by SchoolStack.ai") | PASS |
| 4 | Footer has Privacy, Terms links | PASS |
| 5 | /terms loads with heading | PASS |
| 6 | Terms page date: March 15, 2026 | PASS |
| 7 | Terms contact: admin@schoolstack.ai | PASS |
| 8 | /privacy loads with heading | PASS |
| 9 | Privacy date: March 15, 2026 | PASS |
| 10 | Privacy contact: admin@schoolstack.ai | PASS |
| 11 | /register shows terms checkbox | PASS |
| 12 | Create Account disabled before checkbox | PASS |
| 13 | /login form loads | PASS |
| 14 | Login has email + password fields | PASS |
| 15 | /underwriting wizard loads | PASS |
| 16 | 8 step indicators visible | PASS |
| 17 | Profile step active | PASS |
| 18 | PROFILE through EXPORT labels present | PASS |

**Result: 18/18 PASS**

---

## 7. Alpha Smoke Test (Full 8-Point Suite)

**Date:** March 15, 2026
**Environment:** Replit dev (same build as Netlify deploy)

### 7a. Landing page loads

```
GET / → HTTP 200
Heading: "Launch your school with confidence."
Subtext: "Build a simple 5-year financial model..."
CTA: "Build My Model" + "Log into existing"
Console: clean (no JS errors)
```

**Result: PASS**

### 7b. Public underwriting route loads without auth

```
GET /underwriting → HTTP 200
Stepper: 8 steps visible (PROFILE → EXPORT)
Heading: "Tell Us About Your School"
No authentication redirect — public access confirmed
Console: clean
```

**Result: PASS**

### 7c. All 8 wizard steps navigable

E2E test pre-populated localStorage with complete model data, then verified
each step renders correctly by setting step index and reloading:

| Step | Name | Verified Content | Result |
|------|------|-----------------|--------|
| 1 | PROFILE | School stage cards, name, type, funding, entity, state, capacity | PASS |
| 2 | ENROLLMENT | Year 1–5 enrollment inputs, 5 year columns visible | PASS |
| 3 | REVENUE | Revenue rows with 5 year columns, line item grid | PASS |
| 4 | STAFFING | Staff roster, FTE fields, role configuration | PASS |
| 5 | EXPENSES | Expense categories, monthly/annual amounts, totals | PASS |
| 6 | REVIEW | 5-year financial summary, Year 1–5 data displayed | PASS |
| 7 | ANALYSIS | Lender Readiness scorecard, health check metrics | PASS |
| 8 | EXPORT | Export heading, Download/Export button visible | PASS |

**Result: 8/8 PASS — all steps render, no blank screens, no JS errors**

### 7d. Export returns valid .xlsx

```
POST /api/public/export-underwriting → HTTP 200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
File size: 24,342 bytes
File header: PK (valid ZIP/XLSX)
```

**Result: PASS**

### 7e. Workbook opens correctly (ExcelJS validation)

```
Valid XLSX workbook confirmed via ExcelJS parser
Sheet count: 14

Sheets:
  1. Assumptions             | 24 rows
  2. Enrollment & Rev Drivers | 8 rows, 4 formulas
  3. Tuition & Funding Detail | 4 rows
  4. Staffing Plan            | 25 rows
  5. Operating Expenses       | 6 rows, 10 formulas
  6. Facilities & Occupancy   | 7 rows, 5 formulas
  7. Sources & Uses           | 12 rows, 3 formulas
  8. Debt Schedule            | 10 rows
  9. Cash Flow Monthly Y1     | 13 rows, 45 formulas
  10. 5-Year P&L              | 9 rows, 20 formulas
  11. 5-Year Balance Sheet    | 17 rows, 20 formulas
  12. DSCR & Covenants        | 17 rows, 5 formulas
  13. Underwriting Snapshot   | 27 rows
  14. Summary                 | 15 rows
```

**Result: PASS — 14 sheets, all parse correctly**

### 7f. Formulas are present

```
Total formulas across all sheets: 112

Sample formulas:
  Enrollment & Rev Drivers!C3: IF(B2=0,"—",(C2-B2)/B2)
  Enrollment & Rev Drivers!D3: IF(C2=0,"—",(D2-C2)/C2)
  Operating Expenses!B4: SUM(B3:B3)
  Operating Expenses!B6: B4
  Facilities & Occupancy!B5: SUM(B3:B4)
  Cash Flow Monthly Y1: 45 formulas (monthly projections)
  5-Year P&L: 20 formulas (annual totals/subtotals)
  5-Year Balance Sheet: 20 formulas (balance calculations)
  DSCR & Covenants: 5 formulas (debt service coverage)
```

**Result: PASS — 112 real Excel formulas (SUM, IF, division, cell refs)**

### 7g. Authenticated routes load correctly

```
Auth flow:
  POST /api/auth/register → HTTP 201 (user created, JWT returned)
  POST /api/auth/login    → HTTP 200 (JWT returned)
  GET  /api/auth/me       → HTTP 200 (user profile: name + email)
  GET  /api/models        → HTTP 200 (empty array, new user)
  GET  /api/healthz       → HTTP 200

Auth guard:
  GET /dashboard (unauthenticated) → redirects to /login
  GET /api/models (no token)       → HTTP 401 {"error":"Authentication required"}

Page renders:
  /login    → "Welcome back" + email/password form (clean console)
  /register → "Create Account" + name/email/password/terms (clean console)
  /terms    → "Terms of Service" (clean console)
  /privacy  → "Privacy Policy" (clean console)
```

**Result: PASS**

### 7h. Browser console clean on core screens

| Screen | JS Errors | Warnings | Notes |
|--------|-----------|----------|-------|
| Landing (/) | 0 | 0 | Only React DevTools info message |
| /underwriting (all 8 steps) | 0 | 0 | Clean across all steps |
| /login | 0 | 1 | DOM autocomplete suggestion (browser hint, not app code) |
| /register | 0 | 1 | Same DOM autocomplete hint |
| /terms | 0 | 0 | Clean |
| /privacy | 0 | 0 | Clean |

**Result: PASS — zero JS errors on any screen**

### 7i. Production build verification

```
pnpm --filter @workspace/school-financial-model run build
  → 26 JS bundles, code-split
  → index.html present (2.17 KB)
  → Built in 14.40s
  → No chunk exceeds 500KB
```

**Result: PASS**

---

## 8. Smoke Test Summary

| # | Test | Result |
|---|------|--------|
| 1 | Landing page loads | PASS |
| 2 | Public /underwriting loads (no auth) | PASS |
| 3 | All 8 wizard steps navigable | PASS |
| 4 | Export returns .xlsx | PASS |
| 5 | Workbook opens (14 sheets) | PASS |
| 6 | Formulas present (112 total) | PASS |
| 7 | Authenticated routes load | PASS |
| 8 | Browser console clean | PASS |

**Overall: 8/8 PASS — Alpha ready for Netlify deploy**
