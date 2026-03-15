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
  → HTTP 200
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

## 6. E2E Test Results

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
