# SchoolStack Budget — Underwriting Guest Wizard Proof Pack

**Date:** 2026-05-06
**Sprint:** Revenue-inflation fix + QA hardening (Task #598)
**Verdict:** **GO** — all validations pass; revenue math verified; readiness flags functional.

---

## 1. Bug Summary

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| $21M Y5 revenue for 30-student school | `per_student` tuition was pre-multiplied by enrollment in the payload builder, then multiplied again by the engine | Payload now emits raw per-student amount; engine does the multiplication |
| Collection rate ignored | Engine has no `collectionRate` field | Payload builder now multiplies `perStudentTuition × (collectionRate / 100)` before sending to engine |
| Deferred founder comp dropped | Founder staffing row only emitted when `founderIsPaidYear1 === true` | Row now emitted whenever `founderAnnualCompensation > 0`, with `startYear` clamped to [1,5] |
| DSCR always 0 for guest debt | Guest debt rows use `isLoan: false` (no amortization); engine only computes DSCR from `isLoan: true` rows | Lender readiness snapshot computes its own guest-estimated DSCR from user-entered debt service; UI labels it "Est. DSCR" |

---

## 2. Default Model Payload Snippet

The default `EMPTY_MODEL` values (from `underwriting.tsx` line 116):

```json
{
  "schoolName": "",
  "schoolType": "microschool",
  "schoolStage": "new_school",
  "fundingProfile": "tuition_based",
  "year1Students": 30,
  "annualGrowthPct": 15,
  "perStudentTuition": 12000,
  "perPupilPublicFunding": 0,
  "philanthropyAnnual": 0,
  "studentsPerTeacher": 12,
  "avgTeacherSalary": 55000,
  "numAdminStaff": 1,
  "avgAdminSalary": 65000,
  "monthlyRent": 4000,
  "annualUtilities": 12000,
  "annualInsurance": 8000,
  "annualCurriculum": 8000,
  "annualOtherOpex": 12000,
  "founderIsPaidYear1": false,
  "founderAnnualCompensation": 0,
  "founderCompensationBeginsYear": 2,
  "tuitionCollectionRate": 95,
  "retentionRate": 85,
  "facilityType": "commercial",
  "leaseSigned": false,
  "beginningCash": 0,
  "hasExistingDebt": false,
  "existingAnnualDebtService": 0,
  "requestedLoanAnnualDebtService": 0
}
```

After `buildModelDataPayload` processes this, the key revenue row becomes:

```json
{
  "id": "rev_tuition",
  "category": "tuition_and_fees",
  "lineItem": "Tuition revenue",
  "driverType": "per_student",
  "amounts": [11400, 11400, 11400, 11400, 11400],
  "escalationRate": 3
}
```

Note: `11400 = 12000 × (95 / 100)` — collection rate applied at payload level.

---

## 3. Worked Example — Default 30-Student Microschool (Y1 through Y5)

### Enrollment Projection
| Year | Y1 | Y2 | Y3 | Y4 | Y5 |
|------|----|----|----|----|-----|
| Students | 30 | 35 | 40 | 46 | 53 |
| Teachers (÷12, ceil) | 3 | 3 | 4 | 4 | 5 |

Growth: 15%/yr, `ceil(students / studentsPerTeacher)`.

### Revenue (Y1–Y5)

Effective per-student tuition: $12,000 × 0.95 = $11,400, escalating at 3%/yr.

| Year | Students | Eff. Tuition/Student | Total Revenue |
|------|----------|---------------------|---------------|
| Y1 | 30 | $11,400.00 | **$342,000** |
| Y2 | 35 | $11,742.00 | **$410,970** |
| Y3 | 40 | $12,094.26 | **$483,770** |
| Y4 | 46 | $12,457.09 | **$573,026** |
| Y5 | 53 | $12,830.80 | **$680,032** |

### Staffing (Y1–Y5)

Loaded multiplier: 1 + 0.20 (benefits) + 0.0765 (payroll tax) = 1.2765.
Salary escalation: 2.5%/yr default.

| Year | Teachers | Teacher Cost | Admin Cost | Founder | Total Staffing |
|------|----------|-------------|------------|---------|----------------|
| Y1 | 3 × $55,000 | $210,608 | $82,973 | $0 (not paid) | **$293,580** |
| Y2 | 3 × $56,375 | $215,873 | $85,047 | $0 (comp=0) | **$300,920** |
| Y3 | 4 × $57,784 | $295,125 | $87,173 | $0 | **$382,298** |
| Y4 | 4 × $59,229 | $302,503 | $89,353 | $0 | **$391,856** |
| Y5 | 5 × $60,709 | $387,458 | $91,587 | $0 | **$479,045** |

Note: Default model has `founderAnnualCompensation = 0`, so no founder row is emitted.

### Facility (Y1–Y5)

| Item | Y1 | Y2 | Y3 | Y4 | Y5 |
|------|----|----|----|----|-----|
| Rent ($4,000/mo) | $48,000 | $49,392 | $50,824 | $52,298 | $53,815 |
| Utilities | $12,000 | $12,348 | $12,706 | $13,075 | $13,454 |
| Insurance | $8,000 | $8,232 | $8,471 | $8,716 | $8,969 |
| **Total** | **$68,000** | **$69,972** | **$72,001** | **$74,089** | **$76,238** |

Facility escalation: 2.9% default.

### Operating Expenses (Y1–Y5)

| Item | Y1 | Y2 | Y3 | Y4 | Y5 |
|------|----|----|----|----|-----|
| Curriculum | $8,000 | $8,232 | $8,471 | $8,716 | $8,969 |
| Other OpEx | $12,000 | $12,348 | $12,706 | $13,075 | $13,454 |
| **Total** | **$20,000** | **$20,580** | **$21,177** | **$21,791** | **$22,423** |

### Summary P&L (Y1–Y5)

| | Y1 | Y2 | Y3 | Y4 | Y5 |
|---|----|----|----|----|-----|
| **Revenue** | $342,000 | $410,970 | $483,770 | $573,026 | $680,032 |
| Staffing | $293,580 | $300,920 | $382,298 | $391,856 | $479,045 |
| Facility | $68,000 | $69,972 | $72,001 | $74,089 | $76,238 |
| OpEx | $20,000 | $20,580 | $21,177 | $21,791 | $22,423 |
| **Total Expenses** | **$381,580** | **$391,472** | **$475,476** | **$487,736** | **$577,706** |
| **Net Income** | **-$39,580** | **$19,498** | **$8,294** | **$85,290** | **$102,326** |

Y1 shows a small deficit (typical for new microschool); profitability begins Y2. Y5 is ~$102K net — credible for 53 students, NOT $21M.

---

## 4. Debt Variant — $50K Existing Debt at $6K/yr Service

### Guest debt scenario (modified from default)
| Field | Value |
|-------|-------|
| Existing debt balance | $50,000 |
| Existing annual debt service | $6,000 |
| Requested loan annual debt service | $0 |
| Total annual debt service | $6,000 |

### Guest-estimated DSCR

Using the default model P&L from Section 3:

| Year | Net Income | Debt Service | Est. DSCR | Flag |
|------|-----------|-------------|-----------|------|
| Y1 | -$39,580 | $6,000 | **-6.60x** | critical (below 1.0x) |
| Y2 | $19,498 | $6,000 | **3.25x** | strong (above 1.25x) |
| Y5 | $102,326 | $6,000 | **17.05x** | strong (above 1.25x) |

Y1 shows negative DSCR due to startup deficit — correctly flags as critical.
Y2+ shows strong coverage once the school reaches profitability.

`computeLenderFlags` computes: `dscr = netIncome / totalDebtService` where
`totalDebtService = existingAnnualDebtService + requestedLoanAnnualDebtService`.

Engine DSCR sheet shows 0 for guest debt rows (by design — `isLoan: false`).
Lender readiness snapshot computes its own guest-estimated DSCR from user-entered
debt service amounts. UI labels this as "Est. DSCR" to distinguish from
engine-computed loan DSCR.

---

## 5. Top Readiness Flags for Default Model

The default model (`EMPTY_MODEL`) produces these flags:

| # | Severity | Flag |
|---|----------|------|
| 1 | **high** | No founder compensation planned — lenders may question sustainability |
| 2 | **high** | Fewer than 10 deposits or signed agreements for Year 1 |
| 3 | **high** | No signed lease |
| 4 | **high** | No occupancy documentation path |
| 5 | **high** | No insurance path |
| 6 | **high** | Staffing is 85.8% of revenue (above 65% threshold) |
| 7 | **critical** | Days cash on hand: 0 (critical — below 30 days) |
| 8 | **high** | Year 1 projected deficit: -$39,580 |

Default model correctly surfaces 1 critical + 7 high flags — a new school with zero cash, no lease, no insurance, and high staffing ratio is NOT lender-ready. This is the expected behavior.

---

## 6. Validation Results

### Required 6 validation commands (from task spec)

| # | Command | Result | Details |
|---|---------|--------|---------|
| 1 | `pnpm run typecheck` | **PASS** | All packages clean (scripts, api-server, school-financial-model, mockup-sandbox) |
| 2 | `pnpm --filter @workspace/school-financial-model run build` | **PASS** | Production build completed in 17.22s |
| 3 | `pnpm --filter @workspace/api-server run build` | **PASS** | Server bundle built (4.5MB), migrations copied |
| 4 | `pnpm --filter @workspace/api-server run qa:excel` | **PASS** | 30/30 exports passed (6 payloads × 5 export types) |
| 5 | `pnpm --filter @workspace/api-server run qa:formula-results` | **PASS** | Standard export + UW V2 cross-tab consistency verified |
| 6 | `pnpm --filter @workspace/api-server run qa:smoke-arithmetic` | **PASS** | 32/32 assertions (Private+ESA, Charter, HomeschoolCoop, row math) |

### Additional validation commands

| # | Command | Result | Details |
|---|---------|--------|---------|
| 7 | `pnpm --filter @workspace/school-financial-model run test` | **PASS** | 68 test files, 1096 tests passed |
| 8 | `pnpm --filter @workspace/api-server run test` | **PASS** | 37 tests passed |
| 9 | `pnpm --filter @workspace/school-financial-model run test:e2e:smoke` | **PASS** | 8/8 wizard smoke tests (charter, private, learning lab × operating/new) |

All 9 validation commands: **PASS**

---

## 7. Verdict

### GO

All validation suites pass. The revenue inflation bug ($21M → ~$680K Y5) is fixed and verified with hand-calculated examples matching the default model. Collection rate is correctly applied at the payload level. Deferred founder compensation emits properly with `startYear` support. Guest-estimated DSCR is clearly labeled "Est. DSCR" in the UI to distinguish from engine loan DSCR. Readiness flags fire correctly for the default model state.

### Follow-up items (not blockers)
1. **Task #599**: Engine-level `collectionRate` support (currently applied in payload builder)
2. **Task #600**: Expose deferred founder comp inputs in UI when founder is not paid Y1
3. **Task #601**: Engine-level guest debt DSCR so exported workbooks show real ratios
