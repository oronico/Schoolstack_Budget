# Production math-integrity drift monitor

**Task #987.** The math-integrity report (`pnpm --filter @workspace/api-server run math-integrity`) catches regressions against twelve persona fixtures. Real founder models have far more variety in inputs, so a regression in a calculation branch the fixtures don't cover could ship and stay invisible until a lender flags the wrong number on a packet.

The production drift monitor is the live counterpart to the CI harness. For a configurable share of production traffic, it recomputes the canonical value of every registered metric on the same `(modelData, consultantOutput)` the packet was built from, compares against the rendered packet, and persists any disagreement to `integrity_drift_events`.

## Code map

| File | Role |
| --- | --- |
| `lib/db/src/schema/integrity-drift-events.ts` | `integrity_drift_events` table definition. |
| `lib/db/drizzle/0008_integrity_drift_events.sql` | Migration (`CREATE TABLE IF NOT EXISTS`). |
| `artifacts/api-server/src/lib/integrity/drift-monitor.ts` | Sample gate, diff, persistence, email alert. |
| `artifacts/api-server/src/lib/integrity/canonical/compute.ts::computeCanonicalValuesForModel` | Production-traffic canonical compute (reuses the request's existing `ConsultantOutput`, skips the engine re-run). |
| `artifacts/api-server/src/routes/models.ts` | Wires `runDriftCheckInBackground(...)` into the 4 packet routes (lender JSON/PDF, board JSON/PDF). |
| `artifacts/api-server/tests/integrity-drift-monitor.ts` | Unit coverage for the sample gate, severity classifier, and end-to-end diff against a clean and a mutated lender packet. |

## How the check runs

1. Every `lender-packet` / `lender-packet-pdf` / `board-packet` / `board-packet-pdf` route ends with a `runDriftCheckInBackground(modelData, consultantOutput, packet, { modelId, surface, requestId })` call.
2. `runDriftCheckInBackground`:
   - reads `INTEGRITY_DRIFT_SAMPLE_RATE` (clamped to `[0, 1]`) and rolls a single `Math.random()` to decide whether to sample;
   - if sampled, dispatches `runDriftCheck` via `setImmediate` so the founder's HTTP response is NEVER delayed by the diff or the DB write;
   - wraps the dispatched call in `.catch(...)` — every error path logs and swallows. The check is observe-only; a bug in this code path cannot regress packet rendering.
3. `runDriftCheck` calls `computeCanonicalValuesForModel(modelData, consultantOutput)` to get the canonical value of every metric in the registry, walks the rendered packet with `walkJsonForNumbers`, matches numeric leaves to metrics via the shared `M2_LABEL_TO_METRIC` table in `src/lib/integrity/label-mappings.ts` (the same table the M4 CI integrity report imports), and classifies the delta against the metric's registry tolerance.
4. Every drifted leaf is persisted as one row in `integrity_drift_events`, and ADMIN_EMAILS are paged when any row has `severity = "high"`.

## Severity contract

Mirrors the M4 integrity-report tolerance convention:

| Delta vs. canonical | Severity |
| --- | --- |
| `delta ≤ tolerance.abs` *or* `delta/canonical ≤ tolerance.rel` | `ok` (not persisted) |
| `delta ≤ 10 × tolerance.abs` *or* `delta/canonical ≤ 10 × tolerance.rel` | `low` (persisted, no alert) |
| above 10× both | `high` (persisted, alerts admins) |
| canonical accessor returns a non-scalar / null for the model | `missing` (persisted as diagnostic; no alert) |

A `null` `tolerance.abs` is treated as `0`, so a metric with only a relative tolerance is still classified correctly.

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `INTEGRITY_DRIFT_SAMPLE_RATE` | `0` | Share of packet builds sampled. `0` disables the check; `1` samples every request. Set to `1.0` for the first week after rollout, then ratchet down once the baseline drift rate is understood. |
| `INTEGRITY_DRIFT_ALERT_DEDUPE_HOURS` | `24` | Skip ADMIN_EMAILS pages when an identical `(modelId, metricId, surface, severity=high)` event already fired within this window. Avoids alert fatigue when a single drifting model is re-rendered repeatedly. |
| `ADMIN_EMAILS` | (existing) | Comma-separated recipients for high-severity drift pages. Reuses the same env var the key-rotation alert (`lib/key-rotation-alert.ts`) reads. |

## Triage runbook

1. **Receive the page** — subject is `[integrity] N high-severity math drift event(s) on model #M`; body lists each `(metricId, surface, extracted, canonical, delta, tolerance, location)` row.
2. **Pull the rows** — `SELECT * FROM integrity_drift_events WHERE model_id = M AND severity = 'high' ORDER BY request_timestamp DESC LIMIT 50;`. Cross-reference `request_id` against deployment logs for the original packet request.
3. **Reproduce locally** — load the model into a dev DB (`SELECT data FROM financial_models WHERE id = M;`) and rebuild the offending surface (`POST /api/models/M/preview-lender-packet`). The drift monitor runs on dev too if `INTEGRITY_DRIFT_SAMPLE_RATE=1` is set.
4. **Patch + verify** — fix the canonical resolver or the rendered-packet builder, then re-run the M4 report and the `integrity-drift-monitor` test. Once green, leave the row in place as the historical record; downstream dashboards (#986) filter by `request_timestamp`.

## Adding a new metric to the production diff

The `M2_LABEL_TO_METRIC` table in `src/lib/integrity/label-mappings.ts` is the single source of truth shared by both the production drift monitor (`drift-monitor.ts`) and the M4 CI integrity report (`scripts/run-math-integrity-report.ts`). The companion `PRODUCTION_DRIFT_EXCLUSIONS` allowlist in the same module classifies every registry metric that is intentionally NOT compared on a packet leaf, with an auditable rationale. The `test:integrity-drift-monitor-coverage` test fails CI if any `CANONICAL_METRICS` id is in neither bucket.

To extend production coverage:

1. Pick the JSON leaf key that appears on the packet surface (e.g. `dscrY1Normalized`).
2. Add an entry pointing at a `CANONICAL_METRICS.id`. If the canonical shape is not directly the scalar the leaf carries (array, object, etc.), supply `pickCanonical` to project it.
3. If the same label is emitted on per-scenario stress-test rows or `deltaVsBase` deltas, supply `pathFilter: BASE_SCENARIO_ONLY` so the diff only fires against the base-scenario leaf.

The M4 integrity report and this production diff intentionally share the same mapping conventions so an entry that works for one will work for the other.
