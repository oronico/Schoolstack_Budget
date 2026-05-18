/**
 * Task #987 — Production drift-monitor unit tests.
 *
 * Pure-function coverage for the diff + classify path. We do not boot
 * Postgres or Resend here — the harness in `runDriftCheckInBackground`
 * is fail-safe by contract (every error is logged + swallowed), so the
 * production safety check is enforced by the route-level wiring and
 * inspection rather than a runtime test.
 *
 * What this file pins:
 *   1. `getConfiguredSampleRate()` clamps `INTEGRITY_DRIFT_SAMPLE_RATE`
 *      to [0, 1] and treats malformed values as 0 (off by default).
 *   2. `shouldSampleDriftCheck()` honors `forceSample` overrides.
 *   3. `classifyDrift()` produces `ok` within tolerance, `low` between
 *      1×–10× tolerance, and `high` past 10× tolerance — matching the
 *      M4 integrity-report severity convention.
 *   4. `computeDriftEvents()` finds canonical-vs-rendered disagreements
 *      when a mutated packet drifts a metric past tolerance, and
 *      returns an empty event list when the packet matches canonical.
 */
import assert from "node:assert/strict";

import { getCanonicalMetric } from "@workspace/finance";

import {
  classifyDrift,
  computeDriftEvents,
  getAlertDigestWindowMs,
  getConfiguredSampleRate,
  planDigestPages,
  shouldSampleDriftCheck,
  type DigestItem,
} from "../src/lib/integrity/drift-monitor.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { CHARTER_SCHOOL_MODEL } from "../src/lib/seed-preview-data.js";

// ── 1. Sample-rate env parsing ────────────────────────────────────────

function withSampleRate(value: string | undefined, fn: () => void): void {
  const prior = process.env.INTEGRITY_DRIFT_SAMPLE_RATE;
  if (value === undefined) delete process.env.INTEGRITY_DRIFT_SAMPLE_RATE;
  else process.env.INTEGRITY_DRIFT_SAMPLE_RATE = value;
  try {
    fn();
  } finally {
    if (prior === undefined) delete process.env.INTEGRITY_DRIFT_SAMPLE_RATE;
    else process.env.INTEGRITY_DRIFT_SAMPLE_RATE = prior;
  }
}

withSampleRate(undefined, () => {
  assert.equal(getConfiguredSampleRate(), 0, "unset defaults to 0");
});
withSampleRate("not-a-number", () => {
  assert.equal(getConfiguredSampleRate(), 0, "malformed defaults to 0");
});
withSampleRate("-1", () => {
  assert.equal(getConfiguredSampleRate(), 0, "negative clamps to 0");
});
withSampleRate("0.25", () => {
  assert.equal(getConfiguredSampleRate(), 0.25);
});
withSampleRate("1", () => {
  assert.equal(getConfiguredSampleRate(), 1);
});
withSampleRate("2", () => {
  assert.equal(getConfiguredSampleRate(), 1, "above-1 clamps to 1");
});

// ── 2. shouldSampleDriftCheck honors forceSample ──────────────────────

withSampleRate("0", () => {
  assert.equal(shouldSampleDriftCheck(), false, "rate=0 → never sample");
  assert.equal(shouldSampleDriftCheck(true), true, "force=true overrides off");
});
withSampleRate("1", () => {
  assert.equal(shouldSampleDriftCheck(), true, "rate=1 → always sample");
  assert.equal(shouldSampleDriftCheck(false), false, "force=false overrides on");
});

// ── 3. classifyDrift severity bands ───────────────────────────────────

const runwayMetric = getCanonicalMetric("cash-runway-months");
// Pick a tolerance.abs we can reason about; runway tolerance is small.
const tolAbs = runwayMetric.tolerance.abs ?? 0;
assert.ok(tolAbs > 0, "cash-runway-months should declare an abs tolerance");

{
  const v = classifyDrift(10, 10, runwayMetric);
  assert.equal(v.severity, "ok", "identical values are within tolerance");
}
{
  // Just inside tolerance.
  const v = classifyDrift(10 + tolAbs * 0.5, 10, runwayMetric);
  assert.equal(v.severity, "ok", "delta below abs tolerance is ok");
}
{
  // Past abs tolerance but inside 10× → low.
  const v = classifyDrift(10 + tolAbs * 2, 10, runwayMetric);
  assert.equal(v.severity, "low", "2× tolerance → low severity");
}
{
  // Past 10× abs tolerance → high.
  const v = classifyDrift(10 + tolAbs * 50, 10, runwayMetric);
  assert.equal(v.severity, "high", "50× tolerance → high severity");
}

// ── 3b. planDigestPages — per-metric digest (task #993) ───────────────

function makeItem(modelId: number, metricId: string, surface: DriftSurface = "lender-packet"): DigestItem & { metricId: string } {
  return {
    metricId,
    modelId,
    surface,
    extractedValue: 1,
    canonicalValue: 0,
    deltaAbs: 1,
    toleranceAbs: 0.01,
    location: `path.${modelId}`,
    requestId: `req-${modelId}`,
  };
}

type DriftSurface = "lender-packet" | "lender-packet-pdf" | "board-packet" | "board-packet-pdf";

{
  // Two different models drifting the SAME metric in the same window
  // must produce exactly ONE digest plan (one page) listing both
  // models — this is the core regression #993 was filed to prevent.
  const plans = planDigestPages(
    [makeItem(1, "cash-runway-months"), makeItem(2, "cash-runway-months")],
    new Set(),
  );
  assert.equal(plans.length, 1, "two models, one metric → one digest page");
  assert.equal(plans[0].metricId, "cash-runway-months");
  assert.equal(plans[0].items.length, 2, "digest body lists both affected models");
  const modelIds = plans[0].items.map((i) => i.modelId).sort();
  assert.deepEqual(modelIds, [1, 2], "both model ids appear in the digest");
}

{
  // If the metric was already paged in this window, skip entirely.
  const plans = planDigestPages(
    [makeItem(1, "cash-runway-months"), makeItem(2, "cash-runway-months")],
    new Set(["cash-runway-months"]),
  );
  assert.equal(plans.length, 0, "already-paged metric is fully suppressed");
}

{
  // Distinct metrics each get their own page.
  const plans = planDigestPages(
    [
      makeItem(1, "cash-runway-months"),
      makeItem(1, "dscr-y1"),
      makeItem(2, "dscr-y1"),
    ],
    new Set(),
  );
  assert.equal(plans.length, 2, "distinct metrics → distinct pages");
  const byId = new Map(plans.map((p) => [p.metricId, p.items.length]));
  assert.equal(byId.get("cash-runway-months"), 1);
  assert.equal(byId.get("dscr-y1"), 2);
}

// ── 3c. Digest window env parsing ─────────────────────────────────────

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const prior = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  }
}

withEnv("INTEGRITY_DRIFT_ALERT_DIGEST_MINUTES", undefined, () => {
  withEnv("INTEGRITY_DRIFT_ALERT_DEDUPE_HOURS", undefined, () => {
    assert.equal(getAlertDigestWindowMs(), 60 * 60 * 1000, "default is 60 minutes");
  });
});
withEnv("INTEGRITY_DRIFT_ALERT_DIGEST_MINUTES", "15", () => {
  assert.equal(getAlertDigestWindowMs(), 15 * 60 * 1000);
});
withEnv("INTEGRITY_DRIFT_ALERT_DIGEST_MINUTES", undefined, () => {
  withEnv("INTEGRITY_DRIFT_ALERT_DEDUPE_HOURS", "2", () => {
    assert.equal(
      getAlertDigestWindowMs(),
      2 * 60 * 60 * 1000,
      "legacy hours env still honored when minutes is unset",
    );
  });
});

// ── 4. computeDriftEvents end-to-end ──────────────────────────────────

async function main(): Promise<void> {
  const data = CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown>;
  const consultantOutput = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultantOutput,
    /* modelId */ 0,
    /* personaComfort */ undefined,
  );

  // Clean run: packet was built from the canonical engine output, so
  // no drift should be detected. (Allow per-metric "missing" rows for
  // resolvers that don't project to a scalar — these are diagnostic,
  // not failures.)
  const clean = computeDriftEvents(data, consultantOutput, packet, "lender-packet");
  const cleanDrifts = clean.events.filter(
    (e) => e.severity === "low" || e.severity === "high",
  );
  assert.equal(
    cleanDrifts.length,
    0,
    `expected zero drift on unmodified packet, got: ${JSON.stringify(cleanDrifts, null, 2)}`,
  );
  assert.ok(
    clean.metricsMatched > 0,
    "expected the lender packet to expose at least one mappable metric label",
  );

  // Drift injection: mutate every numeric leaf labeled `cashRunwayMonths`
  // to a value clearly past 10× tolerance. The diff should flag every
  // such leaf as high severity against `cash-runway-months`.
  const mutated = JSON.parse(JSON.stringify(packet)) as unknown;
  let mutatedAny = false;
  function mutate(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) mutate(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "cashRunwayMonths" && typeof v === "number" && Number.isFinite(v)) {
        obj[k] = v + tolAbs * 100 + 9999;
        mutatedAny = true;
      } else {
        mutate(v);
      }
    }
  }
  mutate(mutated);

  if (mutatedAny) {
    const drifted = computeDriftEvents(data, consultantOutput, mutated, "lender-packet");
    const highRunwayDrifts = drifted.events.filter(
      (e) => e.metricId === "cash-runway-months" && e.severity === "high",
    );
    assert.ok(
      highRunwayDrifts.length > 0,
      "expected mutated packet to produce at least one high-severity cash-runway-months drift",
    );
  }
}

main()
  .then(() => {
    console.log("integrity-drift-monitor: OK");
  })
  .catch((err) => {
    console.error("integrity-drift-monitor: FAIL", err);
    process.exit(1);
  });
