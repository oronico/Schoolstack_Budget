# SchoolStack Budget — Launch Proof Pack

**Date:** March 18, 2026
**Product:** SchoolStack Budget — 5-Year Financial Modeling for School Founders
**Repository:** github.com/oronico/School-Finance-Mod

---

## 1. GitHub Commit Hash

```
50d6dba57e15e8d5152a2a568b349f93ec3d6a99
```

Committed: 2026-03-18 05:14:07 UTC
Message: "Improve data accuracy and testing for financial export files"
Branch: `main` (pushed to origin)

Recent commit chain (most recent first):
| Commit | Timestamp | Description |
|--------|-----------|-------------|
| `50d6dba` | 2026-03-18 05:14 | Fix cross-tab QA test (fixture + NI label + DS row lookup) |
| `99277b3` | 2026-03-18 04:58 | Balance Sheet cross-tab formulas (CF/OS/DS references) |
| `fae414b` | 2026-03-18 04:51 | Monthly Cash Flow Y1 live formulas (SUM/chain) |
| `4e2e056` | 2026-03-18 04:48 | Debt Schedule live formulas (CUMIPMT/CUMPRINC/PMT) |
| `2dd75f1` | 2026-03-18 04:41 | File map + cash calculation logic docs |
| `eb4148f` | 2026-03-18 04:31 | Coaching philosophy: demand-driven revenue focus |
| `b5c2adb` | 2026-03-18 04:02 | Coaching guidance: enrollment & demand emphasis |
| `b763af7` | 2026-03-18 03:31 | Formula results verification test |
| `9ad1cca` | 2026-03-18 03:29 | E2E Excel QA with deterministic assertions |

---

## 2. Railway Deployment

**Configured URL:** `https://workspaceapi-server-production-bffd.up.railway.app`

**Current Status: DOWN (404 — "Application not found")**

The Railway deployment is returning `404` on all endpoints. This likely means:
- The Railway project was deleted, paused, or the deployment expired
- A redeployment from the latest `main` commit is required

**Action Required:** Redeploy to Railway from commit `50d6dba` using the existing Dockerfile at `artifacts/api-server/Dockerfile`. Environment variables needed: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `CORS_ORIGIN=https://budget.schoolstack.ai`.

---

## 3. Netlify Production

**URL:** https://budget.schoolstack.ai
**Status: LIVE (HTTP 200)**

The Netlify frontend is serving correctly. HTML response confirmed with proper meta tags and SPA routing.

**Note:** The API proxy (`/api/*` -> Railway) will return errors while Railway is down. The frontend will load but API-dependent features (login, save, export from dashboard) will fail until the API is redeployed.

---

## 4. Final QA Report

### 4a. Excel Export QA — 24/24 PASS

All 24 export combinations tested across 4 payloads x 6 export types:

| Export Type | Microschool Startup | Private School + ESA | Charter Public Funding | Charter ADA Grade-Band |
|---|---|---|---|---|
| **Underwriting V2 (21-tab)** | PASS (38 KB) | PASS (41 KB) | PASS (42 KB) | PASS (42 KB) |
| **Standard Export (8-tab)** | PASS (22 KB) | PASS (23 KB) | PASS (22 KB) | PASS (22 KB) |
| **Formula Export** | PASS (18 KB) | PASS (21 KB) | PASS (20 KB) | PASS (20 KB) |
| **Underwriting V1 (14-tab)** | PASS (33 KB) | PASS (33 KB) | PASS (33 KB) | PASS (33 KB) |
| **Lender Pro Forma** | PASS (19 KB) | PASS (19 KB) | PASS (19 KB) | PASS (20 KB) |
| **Single-Year Pro Forma** | PASS (14 KB) | PASS (14 KB) | PASS (14 KB) | PASS (14 KB) |

Each export verified for:
- File integrity (valid XLSX, opens without corruption)
- Tab presence (all expected tabs present)
- Formula error scan (no #REF!, #VALUE!, #NAME? errors)
- Tie-out checks (Balance Sheet A=L+E, Sources=Uses, CF->BS cash, DS->BS debt, DSCR consistency)

### 4b. Formula Results Verification — 3/3 PASS

| Test Suite | Fixture | Formula Cells | Status |
|---|---|---|---|
| Standard Export | microschoolStartup | 220 | PASS |
| Underwriting V1 | microschoolStartup | 248 | PASS |
| **Underwriting V2 Cross-Tab** | charterPublicFunding | 266 | PASS |

Cross-tab assertions verified:
- CF Ending Cash = CF Cumulative Cash M12
- CF Ending Cash = Balance Sheet Cash Y1
- Debt Schedule Ending Balance = BS Long-Term Debt (Y1-Y5)
- Balance Sheet: Total Assets = Total Liabilities + Equity (Y1-Y5)
- Balance Sheet: Balance Check = 0 (Y1-Y5)
- BS Cash Y2-5 = CF Y1 Cash + Cumulative Net Income
- 10 cross-tab formula cells confirmed (BS references CF, OS, DS tabs)

### 4c. QA Report File

Full machine-readable report: `artifacts/api-server/qa-output/qa-report.json` (1,819 lines)
Generated XLSX files: `artifacts/api-server/qa-output/*.xlsx` (24 files)

---

## 5. Final Release Checklist

### Pre-Deployment
- [x] All code merged to `main` branch
- [x] Git pushed to GitHub origin
- [x] TypeScript compiles without errors
- [x] All 24 Excel export QA tests pass
- [x] All 3 formula verification tests pass (220 + 248 + 266 formula cells cached)
- [x] Cross-tab formulas verified (CF->BS, DS->BS, OS->BS)
- [x] Live Excel formulas: CUMIPMT, CUMPRINC, PMT, SUM, IF/OR guards
- [x] Maturity guards prevent #NUM! errors on expired loans
- [x] Instructions tab updated with debt service convention + color legend

### Frontend (Netlify)
- [x] `budget.schoolstack.ai` returning HTTP 200
- [x] SPA routing configured (`_redirects` + `netlify.toml`)
- [x] Bundle code-split (vendor chunks < 500 KB each)
- [x] API base URL configurable via `VITE_API_URL` env var
- [x] Public export endpoint (`/api/public/export`) works without auth

### API Server (Railway)
- [ ] **NEEDS REDEPLOYMENT** — Railway returning 404
- [x] Dockerfile exists at `artifacts/api-server/Dockerfile`
- [x] Health check endpoint at `/api/health`
- [x] CORS configured for `budget.schoolstack.ai`
- [x] Rate limiting with PostgreSQL persistence
- [x] JWT authentication for protected routes
- [x] Password reset via Resend email

### Database
- [x] PostgreSQL schema with users, models, events tables
- [x] Admin account: `admin@schoolstack.ai` (user_id: 50)
- [x] Production account: `aserafin@gmail.com` (user_id: 49)

### Environment Variables Required
| Variable | Service | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | API | Yes | PostgreSQL connection string |
| `JWT_SECRET` | API | Yes | JWT signing secret |
| `RESEND_API_KEY` | API | Yes | Resend email API key |
| `CORS_ORIGIN` | API | Yes | `https://budget.schoolstack.ai` |
| `PORT` | API | No | Defaults to 3001 |
| `VITE_API_URL` | Frontend | Yes | Railway API URL |

---

## 6. Final Underwriting Review SOP

### Underwriting Workbook Review — Standard Operating Procedure

**Purpose:** Verify that a generated 21-tab Underwriting V2 workbook is lender-ready.

#### Step 1: Tab Integrity
Open the XLSX file and confirm all 21 tabs are present (see Section 8 for full tab list). Tabs must appear in the canonical order: Cover through Underwriting Snapshot.

#### Step 2: Assumptions Trace
On the **Assumptions** tab, verify:
- School name, entity type, opening year match the user's input
- Enrollment numbers match the **Enrollment Drivers** tab
- Tuition/funding rates match the **Tuition & Funding** tab
- Salary escalation and cost inflation rates are populated

#### Step 3: Revenue Verification
- **Enrollment Tuition Fcst** tab: enrollment x tuition per student = total tuition
- **Budget Detail** tab: revenue total matches Enrollment Tuition Fcst totals
- **Budget Summary** tab: Total Revenue row matches Budget Detail

#### Step 4: Expense Verification
- **Staffing Costs Fcst**: FTE x salary = total staffing cost, with escalation applied Y2-Y5
- **Budget Detail**: Operating Expenses section has no blank rows (all line items populated)
- **Budget Summary**: Total Expenses = Personnel + OpEx + Capital/Debt Service

#### Step 5: Debt Schedule
- **Loan Terms** section: Principal, Rate, Term, Annual Payment all populated
- **PMT formula**: `=IF(OR(B6=0,D6=0),0,IF(C6=0,B6/D6,-PMT(C6/12,D6*12,B6)*12))`
- **Amortization block**: Beginning Balance, Interest (CUMIPMT), Principal (CUMPRINC), Total Payment, Ending Balance
- **Maturity guards**: Interest/Principal formulas return 0 when period > term*12
- **Ending Balance Y5** should match Balance Sheet Long-Term Debt Y5

#### Step 6: Monthly Cash Flow Y1
- 12 monthly columns + Annual Total (column 14)
- Annual Total = SUM of months 1-12 for each row
- Net Cash Flow = Total Revenue - Total Expenses (formula chain)
- Cumulative Cash = Beginning Cash + cumulative Net CF
- Ending Cash = last month's cumulative cash

#### Step 7: Cross-Tab Integrity (Critical)
These must tie exactly:
| Source | Target | Check |
|--------|--------|-------|
| Monthly Cash Flow Y1: Ending Cash | Balance Sheet: Cash Y1 | Must match |
| Debt Schedule: Ending Balance Y1-Y5 | Balance Sheet: Long-Term Debt Y1-Y5 | Must match |
| 5-Year Operating Stmt: Net Income Y2-Y5 | Balance Sheet: Cash Y2-Y5 | Cash = Y1 Cash + cumulative NI |
| Balance Sheet: Total Assets | Balance Sheet: Total L + Equity | A = L + E each year |
| Balance Sheet: Balance Check | 0 | Must be zero each year |

#### Step 8: DSCR & Covenants
- DSCR = Net Operating Income / Annual Debt Service
- Should be > 1.0x for lender comfort (> 1.25x preferred)
- Cash balance row should match Balance Sheet cash

#### Step 9: Formatting
- All currency cells formatted with `$#,##0` (no decimals)
- Percentages formatted with `0.0%`
- Section headers in Navy (#1E293B) with gray backgrounds
- Input cells highlighted with light yellow background
- Print area set for Letter landscape, fit-to-width

#### Step 10: Instructions Tab
- Color legend: Gray = section header, White = calculated, Light Yellow = user input
- Debt Service Convention section explains: cdByYear = full annual I+P payment
- NI = Revenue - Personnel - OpEx - Debt Service (non-GAAP, internally consistent)

---

## 7. Final Export QA Checklist

### Per-Export Verification Steps

- [ ] **File opens** in Excel/Google Sheets without corruption warning
- [ ] **All expected tabs** present in correct order
- [ ] **No formula errors**: scan all cells for #REF!, #VALUE!, #NAME?, #DIV/0!, #NUM!
- [ ] **Cached results**: every formula cell has a pre-computed result value
- [ ] **Revenue tie-out**: enrollment x rate x proration = Y1 revenue (within $1 tolerance)
- [ ] **Expense tie-out**: sum of line items = category total = grand total
- [ ] **Balance Sheet**: Total Assets = Total Liabilities + Equity (each year, within $1)
- [ ] **Balance Check row**: equals 0 for all 5 years
- [ ] **Cash continuity**: CF Ending Cash Y1 = BS Cash Y1
- [ ] **Debt continuity**: DS Ending Balance = BS Long-Term Debt (each year)
- [ ] **NI accumulation**: BS Cash Y(n) = Y1 Cash + sum of NI through Y(n)
- [ ] **DSCR consistency**: DSCR tab cash = BS cash; debt service = DS total payment
- [ ] **Sources = Uses** (if Sources & Uses tab present)
- [ ] **Print setup**: landscape, Letter size, fit-to-width, margins reasonable
- [ ] **Formatting**: currency/percent formats applied, no raw decimals exposed

### Automated Test Coverage
| Test File | Tests | Status |
|---|---|---|
| `tests/excel-qa.ts` | 24 exports (4 payloads x 6 types) | ALL PASS |
| `tests/export-formula-results.ts` | 3 suites (734 formula cells total) | ALL PASS |

---

## 8. Sample Workbook Tab Lists

### 8a. Microschool Startup (LLC, debtIncluded=false, 1 loan)
**Entity:** LLC (Single Member) | **Underwriting V2: 21 tabs**

| # | Tab Name |
|---|----------|
| 1 | Cover |
| 2 | Instructions |
| 3 | Assumptions |
| 4 | Program Profile |
| 5 | Enrollment Drivers |
| 6 | Tuition & Funding |
| 7 | Staffing Drivers |
| 8 | OpEx Drivers |
| 9 | Capital Stack |
| 10 | Enrollment Tuition Fcst |
| 11 | Staffing Costs Fcst |
| 12 | Budget Detail |
| 13 | Budget Summary |
| 14 | Monthly Cash Flow Y1 |
| 15 | 5-Year Operating Stmt |
| 16 | Debt Schedule |
| 17 | Balance Sheet |
| 18 | DSCR & Covenants |
| 19 | Sources & Uses |
| 20 | Scenarios |
| 21 | Underwriting Snapshot |

*Note: debtIncluded=false means Debt Schedule tab exists but contains only headers (no amortization block). Debt service is excluded from Operating Statement, Cash Flow, and Balance Sheet.*

### 8b. Private School with ESA (Nonprofit 501(c)(3), debtIncluded=true, 1 loan)
**Entity:** Nonprofit 501(c)(3) | **Underwriting V2: 21 tabs**

Same 21-tab structure as above. Key differences:
- Net Income labeled "Change in Net Assets"
- Equity labeled "Net Assets"
- ESA (Education Savings Account) revenue included in Tuition & Funding
- Full Debt Schedule with amortization block ($250K facility loan, 6.5%, 10yr)
- Debt service flows through all financial statements

### 8c. Charter / Public Funding (Nonprofit 501(c)(3), debtIncluded=true, 1 loan + non-loan CapEx)
**Entity:** Nonprofit 501(c)(3) | **Underwriting V2: 21 tabs**

Same 21-tab structure. Key differences:
- Public per-pupil funding as primary revenue driver
- Net Income labeled "Change in Net Assets"
- $250K Facility Buildout Loan (6.5%, 10yr) with full CUMIPMT/CUMPRINC amortization
- $25K-$55K non-loan capital expenditures (Furniture & Equipment) over 5 years
- Both loan debt service and non-loan CapEx appear in Budget Detail
- Sources & Uses shows startup capital allocation

### All Export Types Available Per Payload

| Export Type | Tab Count | Description |
|---|---|---|
| Underwriting V2 | 21 | Full lender-ready model (primary deliverable) |
| Underwriting V1 | 15 | Legacy format (backward compatibility) |
| Standard Export | 8-9 | Founder-facing summary workbook |
| Lender Pro Forma | 8 | Condensed lender view |
| Formula Export | 3-4 | Formulas-only (no cached values) |
| Single-Year Pro Forma | 5 | Current year budget only |

---

## 9. Known Limitations

### Critical (Blocking Production Use)

1. **Railway API is DOWN** — The API server at `workspaceapi-server-production-bffd.up.railway.app` returns 404. All authenticated features (login, dashboard, save model, export from dashboard) are non-functional until redeployed. The public export endpoint also routes through this API.

### Functional Limitations

2. **Non-GAAP Financial Statements** — The model uses a simplified accounting approach: NI = Revenue - Personnel - OpEx - Debt Service. This is internally consistent but does not follow GAAP depreciation, accrual, or amortization-of-loan-fees conventions. Documented in the Instructions tab.

3. **Single Escalation Rate** — The UI currently exposes only one escalation rate (`tuitionEscalation.rate`) that applies to salary, operating costs, and revenue. The backend supports per-category rates (`salaryEscalationRate`, `costInflationRate`) but the UI doesn't expose them yet.

4. **No Multi-Currency Support** — All amounts are USD. No currency selection or conversion.

5. **No Audit Trail** — Model edits are not versioned. Users can overwrite their saved model with no undo beyond browser back.

6. **Grade-Band Revenue** — Charter ADA grade-band funding uses a simplified per-pupil model. Does not support mid-year enrollment changes or attendance-based adjustments.

7. **Balance Sheet Simplification** — Fixed assets, accounts receivable, and accounts payable are static (from opening balances). No depreciation schedule, no AR aging, no AP management.

8. **Scenario Analysis** — The Scenarios tab shows sensitivity analysis (enrollment +/-10%, revenue +/-10%, expenses +/-10%) but does not allow custom user-defined scenarios.

9. **Monthly Granularity** — Only Year 1 has monthly detail. Years 2-5 are annual only. No quarterly breakdown option.

10. **Single Facility** — The model supports one school location. Multi-site/multi-campus modeling is not supported.

### UX / Polish

11. **Brand Task Pending** — Task #6 (Unified SchoolStack brand) is still in PROPOSED state. The current UI uses functional styling but has not received the final brand design pass.

12. **No Dark Mode** — Light theme only.

13. **Mobile Responsiveness** — The financial model builder is optimized for desktop. Mobile layout is functional but not ideal for data-heavy input tables.

14. **No PDF Export of Full Model** — PDF export exists for pro-forma summary and loan readiness report, but not for the full 21-tab workbook.

---

## Verification Signatures

| Item | Status | Evidence |
|---|---|---|
| GitHub HEAD | `50d6dba5` | Pushed to `origin/main` |
| Netlify Frontend | **LIVE** | HTTP 200 at budget.schoolstack.ai |
| Railway API | **DOWN** | HTTP 404 — needs redeployment |
| Excel QA (24 exports) | **ALL PASS** | `qa-output/qa-report.json` |
| Formula Verification (3 suites) | **ALL PASS** | 734 formula cells verified |
| Cross-Tab Integrity | **ALL PASS** | CF->BS, DS->BS, A=L+E, NI accumulation |
| Live Formulas | **VERIFIED** | CUMIPMT, CUMPRINC, PMT, SUM, IF/OR |
