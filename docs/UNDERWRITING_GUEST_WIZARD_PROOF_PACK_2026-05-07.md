# SchoolStack Budget — Underwriting Guest Wizard Proof Pack

**Date:** 2026-05-07
**Sprint:** Revenue-inflation fix + QA hardening (Task #598)
**Verdict:** **GO** — all validations pass; revenue math verified; readiness flags functional.

---

## 1. Bug Summary

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| $21M Y5 revenue for 30-student school | `per_student` tuition was pre-multiplied by enrollment in the payload builder, then multiplied again by the engine | Payload now emits raw per-student amount; engine does the multiplication |
| Collection rate ignored | Engine has no `collectionRate` field | Payload builder now multiplies `perStudentTuition × (collectionRate / 100)` before sending to engine |
| Deferred founder comp dropped | Founder staffing row only emitted when `founderIsPaidYear1 === true` | Row now emitted whenever `founderAnnualCompensation > 0`, with `startYear` set to deferred year |
| DSCR always 0 for guest debt | Guest debt rows use `isLoan: false` (no amortization); engine only computes DSCR from `isLoan: true` rows | Lender readiness snapshot computes its own guest-estimated DSCR from user-entered debt service amounts |

---

## 2. Worked Example — 30-Student Microschool

### Inputs
| Parameter | Value |
|-----------|-------|
| Enrollment Y1 | 30 students |
| Growth rate | 10% / year |
| Per-student tuition | $12,000 |
| Collection rate | 95% |
| Per-pupil public funding | $0 |
| Philanthropy | $0 |
| Students per teacher | 15 |
| Avg teacher salary | $48,000 |
| Admin staff | 1 |
| Avg admin salary | $42,000 |
| Founder comp | $65,000 (deferred to Year 2) |
| Monthly rent | $3,500 |
| Utilities | $6,000 / yr |
| Insurance | $4,800 / yr |

### Expected Revenue (hand-calculated)
| Year | Students | Effective Tuition | Revenue |
|------|----------|-------------------|---------|
| Y1 | 30 | $12,000 × 0.95 = $11,400 | $342,000 |
| Y2 | 33 | $11,400 × 1.03 = $11,742 | $387,486 |
| Y3 | 36 | $11,400 × 1.03² = $12,094 | $435,396 |
| Y4 | 40 | $11,400 × 1.03³ = $12,457 | $498,289 |
| Y5 | 44 | $11,400 × 1.03⁴ = $12,831 | $564,557 |

Revenue is now **credible** — Y5 is ~$565K for 44 students, not $21M.

### Staffing (Y1)
| Role | FTE | Rate | Loaded (×1.2565) | Active Y1? |
|------|-----|------|------------------|-----------|
| Teacher × 2 | 2.0 | $48,000 | $120,624 | Yes |
| Admin × 1 | 1.0 | $42,000 | $52,773 | Yes |
| Founder | 1.0 | $65,000 | $81,673 | **No** (startYear=2) |
| **Y1 Total** | | | **$173,397** | |
| **Y2 Total** | | | **~$261,000** (founder added) | |

### Facility (Y1)
| Item | Amount |
|------|--------|
| Rent | $42,000 |
| Utilities | $6,000 |
| Insurance | $4,800 |
| **Total** | **$52,800** |

### Net Income Estimate (Y1)
- Revenue: $342,000
- Staffing: $173,397
- Facility: $52,800
- Other OpEx: ~$10,000
- **Net Income: ~$106K** (positive Y1 with deferred founder comp)

---

## 3. Debt Variant

### Guest debt scenario
| Field | Value |
|-------|-------|
| Existing annual debt service | $18,000 |
| Requested loan annual debt service | $12,000 |
| Total debt service | $30,000 |

### Guest-estimated DSCR
- Net Income (Y1): ~$106K
- DSCR = $106K / $30K = **3.53x** (above 1.25x benchmark → "strong")

Engine DSCR sheet shows 0 for guest debt rows (by design — `isLoan: false`).
Lender readiness snapshot uses its own calculation from user-entered debt service.

---

## 4. Readiness Flags

| Flag | Severity | Condition |
|------|----------|-----------|
| Founder comp deferred | caution | `founderAnnualCompensation > 0 && !founderIsPaidYear1` |
| No founder comp planned | high | `founderAnnualCompensation === 0 && !founderIsPaidYear1` |
| Collection rate at 100% | caution | `tuitionCollectionRate >= 100` |
| Enrollment validation | high | New school with < 10 deposits/agreements |
| Facility ratio | strong/caution/high | < 15% / 15-22% / > 22% |
| Staffing ratio | strong/caution/high | < 55% / 55-65% / > 65% |
| Days cash on hand | critical/high/caution/strong | < 30 / 30-45 / 45-90 / 90+ |
| DSCR | critical/high/caution/strong | < 1.0 / 1.0-1.15 / 1.15-1.25 / 1.25+ |
| Net margin | strong/high | > 5% positive / negative |

---

## 5. Validation Results

### 5.1 Typecheck
```
✅ PASS — all packages (scripts, api-server, school-financial-model, mockup-sandbox)
```

### 5.2 Unit Tests
```
✅ school-financial-model: 1096 tests passed
✅ api-server: 37 tests passed
```

### 5.3 E2E Smoke Tests
```
✅ 8/8 wizard smoke tests passed (charter, private, learning lab — operating & new)
```

### 5.4 QA: Excel Export
```
✅ 30/30 exports passed (all payloads × all export types)
```

### 5.5 QA: Formula Results
```
✅ Standard Export — all formula cells cached, P&L/Revenue/Staff/Expense/CapDebt match expected
✅ Underwriting V2 Cross-Tab — CF↔BS cash, DS↔BS debt, BS A=L+E, NI accumulation verified
```

### 5.6 QA: Smoke Arithmetic
```
✅ Private+ESA: all assertions pass
✅ Charter: all assertions pass (debt service non-trivial, DSCR numeric)
✅ HomeschoolCoop: all assertions pass (zero-debt fixture)
✅ Non-trivial row arithmetic: percent_of_base and percent_of_revenue verified
✅ 32/32 passed
```

---

## 6. Verdict

### GO ✅

All six validation suites pass. The revenue inflation bug is fixed and verified with hand-calculated examples. Deferred founder compensation, collection rate application, and DSCR treatment are all functioning correctly. The guest wizard produces credible financial projections suitable for lender readiness assessment.

### Remaining items (follow-up, not blockers)
1. Engine-level `collectionRate` support (currently applied in payload builder — works but couples the logic to the wizard)
2. Engine-level guest debt DSCR computation (currently `isLoan: false` rows produce DSCR=0 in the engine; readiness snapshot has its own calculation)
3. Payroll tax component wage-base caps in the guest wizard (currently uses flat 7.65% rate)
