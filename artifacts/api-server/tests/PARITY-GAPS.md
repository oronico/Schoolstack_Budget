# FE/BE Parity Status

## escalationRateOverridden + escalationRate=0 — RESOLVED

**Previous behavior**: Frontend `driverVal` did not check the `escalationRateOverridden` flag.
When `escalationRate=0`, it fell back to `costInflation` regardless of override status, causing
up to ~6% variance on affected rows by Y3.

**Fix**: Frontend `driverVal` and expense calculation in `scenario-engine.ts` now check
`escalationRateOverridden`. When the flag is `true`, the frontend uses `escalationRate` literally
(including 0%) and does not fall back to `costInflation`. This matches the backend
`workbook-helpers.ts` behavior exactly.

**Verification**: Unit test in `scenario-engine.test.ts` asserts
`escalationRateOverridden=true + escalationRate=0` produces flat $10,000/yr (no inflation applied),
matching backend behavior. Cross-engine parity test passes at 1% for all 3 fixtures.

No remaining known parity gaps.
