# Known FE/BE Parity Gaps

## escalationRateOverridden + escalationRate=0

**Backend behavior**: When `escalationRateOverridden=true` and `escalationRate=0`, backend
treats this as literally 0% escalation (no inflation applied).

**Frontend behavior**: Frontend `driverVal` does not check the `escalationRateOverridden` flag.
When `escalationRate=0`, it falls back to `costInflation` regardless of override status.

**Impact**: Low. Only affects expense rows where a user explicitly sets escalation to 0% and
overrides the default. None of the shared test fixtures contain this pattern, so cross-engine
parity tests pass at 1% tolerance for all 3 fixture payloads.

**Measured variance**: In isolated unit test with 3% costInflation and 5-year horizon:
- Backend: $10,000/yr (flat)
- Frontend: $10,000 * 1.03^y (grows to ~$10,609 by Y3)
- Max variance: ~6% by Y3 on affected rows only

**Resolution**: Frontend `driverVal` should check `escalationRateOverridden` before falling back.
Tracked as non-critical; no customer-facing impact since wizard does not currently expose this
combination.
