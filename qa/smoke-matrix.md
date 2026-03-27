# Smoke Test Matrix

**Date:** March 27, 2026
**Model under test:** ID 65 (QA Test Academy)
**Test user:** qatest@schoolstack.test

## Browser Routes

| Feature/Route | Tested | Pass/Fail | Evidence | Notes |
|---------------|--------|-----------|----------|-------|
| Landing page `/` | Yes | PASS | `screenshots/01-landing-page.jpg` | Renders correctly, CTA buttons visible |
| Login page `/login` | Yes | PASS | `screenshots/02-login-page.jpg` | Form fields, forgot password link, create account link |
| Register page `/register` | Yes | PASS | `screenshots/03-register-page.jpg` | Name, email, password fields, ToS checkbox |
| Underwriting wizard `/underwriting` | Yes | PASS | `screenshots/04-underwriting-wizard.jpg` | 8-step stepper, Step 1 loads with form fields |
| Console errors (all routes) | Yes | PASS | Browser logs | Only React DevTools suggestion, no errors |

## API Health

| Endpoint | Tested | Pass/Fail | Evidence | Notes |
|----------|--------|-----------|----------|-------|
| `GET /api/health` | Yes | PASS | HTTP 200, `{"status":"ok"}` | |
| `GET /api/ready` | Yes | PASS | HTTP 200, DB connected | |
| Security headers (helmet) | Yes | PASS | 13 headers present | CSP, HSTS, X-Content-Type-Options, etc. |
| Compression middleware | Yes | PASS | Active | Skips small payloads as expected |

## Authentication

| Feature | Tested | Pass/Fail | Evidence | Notes |
|---------|--------|-----------|----------|-------|
| Register new user | Yes | PASS | HTTP 201, user ID 57 | |
| Login | Yes | PASS | HTTP 200, 167-char JWT | |
| Protected route (no token) | Yes | PASS | Error returned | |
| Protected route (bad token) | Yes | PASS | Error returned | |

## Model CRUD

| Feature | Tested | Pass/Fail | Evidence | Notes |
|---------|--------|-----------|----------|-------|
| Create model | Yes | PASS | Model ID 65 created | Full data with all row types |
| Read model | Yes | PASS | All fields returned | schoolProfile, revenueRows, staffingRows, expenseRows |
| Update model | Yes | PASS | Name change persisted | |
| List models | Yes | PASS | Model appears in list | |

## Authenticated XLSX Exports

| Export | Tested | Pass/Fail | Evidence | HTTP | Size | Sheets | NaN/Undefined |
|--------|--------|-----------|----------|------|------|--------|---------------|
| Underwriting V2 | Yes | PASS | `exports/underwriting-v2.xlsx` | 200 | 43,967B | 22 | 0 |
| Underwriting V1 | Yes | PASS | `exports/underwriting-v1.xlsx` | 200 | 43,967B | 22 | 0 |
| Lender Pro Forma | Yes | PASS | `exports/lender-proforma.xlsx` | 200 | 26,141B | 10 | 0 |
| Formula (default) | Yes | PASS | `exports/formula-default.xlsx` | 200 | 28,364B | 10 | 0 |
| Single Year | Yes | PASS | `exports/single-year.xlsx` | 200 | 13,800B | 5 | 0 |

## Authenticated PDF Exports

| Export | Tested | Pass/Fail | Evidence | HTTP | Size | Magic | Pages |
|--------|--------|-----------|----------|------|------|-------|-------|
| Pro Forma PDF | Yes | PASS | `exports/proforma.pdf` | 200 | 5,206B | %PDF- | ~3 |
| Lender Packet PDF | Yes | PASS | `exports/lender-packet.pdf` | 200 | 15,181B | %PDF- | ~7 |
| Board Packet PDF | Yes | PASS | `exports/board-packet.pdf` | 200 | 9,560B | %PDF- | ~5 |
| Loan Readiness PDF | Yes | PASS | `exports/loan-readiness.pdf` | 200 | 7,666B | %PDF- | ~4 |

## Authenticated JSON Exports

| Export | Tested | Pass/Fail | Evidence | HTTP | Size |
|--------|--------|-----------|----------|------|------|
| Lender Packet JSON | Yes | PASS | `exports/lender-packet.xlsx` (JSON) | 200 | 19,072B |
| Board Packet JSON | Yes | PASS | `exports/board-packet.xlsx` (JSON) | 200 | 14,859B |
| Consultant Analysis | Yes | PASS | `exports/consultant.json` | 200 | 14,445B |

## Public XLSX Exports (No Auth Required)

| Export | Tested | Pass/Fail | Evidence | HTTP | Size | Sheets | NaN/Undefined |
|--------|--------|-----------|----------|------|------|--------|---------------|
| Public Budget | Yes | PASS | `exports/public-budget.xlsx` | 200 | 20,261B | 5 | 0 |
| Public Underwriting | Yes | PASS | `exports/public-underwriting.xlsx` | 200 | 20,261B | 5 | 0 |
| Public Single-Year | Yes | PASS | `exports/public-single-year.xlsx` | 200 | 12,853B | 5 | 0 |

## Sheet Name Verification (Underwriting V2 — 22 Sheets)

```
Instructions, Cover, Assumptions, Program Profile, Enrollment Drivers,
Tuition & Funding, Staffing Drivers, OpEx Drivers, Capital Stack,
Enrollment Tuition Fcst, Staffing Costs Fcst, Budget Detail,
Budget Summary, Monthly Cash Flow Y1, 5-Year Operating Stmt,
Debt Schedule, Balance Sheet, DSCR & Covenants, Sources & Uses,
Scenarios, Underwriting Snapshot, Financial Health
```

## Automated Test Suites

| Suite | Tests | Result |
|-------|-------|--------|
| Frontend (Vitest) | 51 | ALL PASS |
| Excel QA | 30 | ALL PASS |
| Golden Assertions | 133 | ALL PASS |
| **Total** | **214** | **ALL PASS** |
