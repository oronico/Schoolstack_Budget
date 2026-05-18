/**
 * Task #987 — Sampled production math-integrity drift monitor.
 *
 * Real founder models have far more variety in inputs than the 12 named
 * persona fixtures the M5 CI harness exercises. A regression in a
 * calculation branch the fixtures don't cover (e.g. a school with a
 * multi-tier scholarship structure + a refinance loan) could ship to
 * production and stay invisible until a lender flags the wrong number
 * on a packet.
 *
 * This module sits between the packet builders (`buildLenderPacket`,
 * `buildBoardPacket`) and the HTTP response. For a configurable share
 * of production traffic it:
 *
 *   1. Recomputes the canonical value of every registered metric on
 *      the same `(modelData, consultantOutput)` the packet was built
 *      from (via {@link computeCanonicalValuesForModel}).
 *   2. Walks the rendered packet payload for numeric leaves
 *      (via {@link walkJsonForNumbers}).
 *   3. For every leaf whose label maps to a registry metric, compares
 *      the extracted value against the canonical value using the
 *      metric's registry tolerance.
 *   4. Persists drift events to {@link integrityDriftEventsTable} —
 *      one row per `(modelId, metricId, surface)` tuple that drifted,
 *      with the extracted value, canonical value, delta, and
 *      tolerance recorded for triage.
 *   5. Pages ADMIN_EMAILS (via the existing transactional email
 *      adapter) when any event in the batch has `severity = "high"`.
 *
 * Sample gate: `INTEGRITY_DRIFT_SAMPLE_RATE` env var. Default `0`
 * (off — keeps dev/test silent). Production launch sets `1.0` (every
 * request) for the first week, then ratchets down once the baseline
 * is established. Set `0` to fully disable.
 *
 * Read-only contract: this module NEVER mutates the packet payload.
 * Every error path is swallowed inside `runDriftCheckInBackground` so
 * the founder/lender response cannot regress because of a drift-check
 * bug. The check is dispatched via `setImmediate` so the request that
 * triggered it returns without waiting on the diff + DB write.
 *
 * Severity classification is registry-driven: a delta above the
 * metric's `tolerance.abs` (or its relative equivalent) is `low`; a
 * delta above `10 × tolerance.abs` (or `10 × relative`) is `high`.
 * This matches the M4 integrity report's tolerance contract.
 */
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@workspace/db";
import {
  eventsTable,
  integrityDriftEventsTable,
  type InsertIntegrityDriftEvent,
} from "@workspace/db/schema";
import {
  CANONICAL_METRICS,
  type CanonicalMetric,
} from "@workspace/finance";

import type { ConsultantOutput } from "../consultant-engine.js";
import type { ModelData } from "../workbook-helpers.js";
import {
  deliverTransactionalEmail,
  isEmailConfigured,
} from "../mailer.js";

import { computeCanonicalValuesForModel } from "./canonical/compute.js";
import { walkJsonForNumbers } from "./extract/walk-json.js";
import {
  M2_LABEL_TO_METRIC,
  PRODUCTION_DRIFT_EXCLUSIONS,
  type SurfaceValue,
} from "./label-mappings.js";

export type DriftSurface =
  | "lender-packet"
  | "lender-packet-pdf"
  | "board-packet"
  | "board-packet-pdf";

export type DriftSeverity = "low" | "high" | "missing";

export interface DriftCheckOptions {
  modelId: number;
  surface: DriftSurface;
  requestId?: string;
}

export interface DriftEventRecord {
  metricId: string;
  surface: DriftSurface;
  severity: DriftSeverity;
  extractedValue: number | null;
  canonicalValue: number | null;
  deltaAbs: number | null;
  toleranceAbs: number | null;
  location: string | null;
  note: string | null;
}

export interface DriftCheckResult {
  ran: boolean;
  events: DriftEventRecord[];
  metricsConsidered: number;
  metricsMatched: number;
  alertedAdmins: boolean;
}

// ── Sample gate ───────────────────────────────────────────────────────

/**
 * Read the configured sample rate. Clamps to [0, 1]; returns 0 for any
 * non-finite or negative value (the safe default — drift checks off).
 */
export function getConfiguredSampleRate(): number {
  const raw = Number(process.env.INTEGRITY_DRIFT_SAMPLE_RATE);
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

/**
 * Returns true when the current request should be sampled. Pure
 * function (modulo `Math.random()`), so callers can also seed their
 * own RNG in tests by passing `forceSample`.
 */
export function shouldSampleDriftCheck(forceSample?: boolean): boolean {
  if (forceSample === true) return true;
  if (forceSample === false) return false;
  const rate = getConfiguredSampleRate();
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

// ── Label → metric mapping ────────────────────────────────────────────
//
// The mapping table itself lives in `./label-mappings.ts`, which is
// imported by BOTH this production drift monitor and the M4 CI
// integrity report (`scripts/run-math-integrity-report.ts`). The two
// surfaces MUST share the same table — otherwise production drift
// coverage would silently fall behind CI as new metrics are added.
//
// `PRODUCTION_DRIFT_EXCLUSIONS` (re-exported below) lists every
// registry metric that is intentionally NOT directly comparable on a
// packet leaf, with an auditable rationale. The coverage test
// (`tests/integrity-drift-monitor-coverage.ts`) enforces parity
// between `CANONICAL_METRICS`, `M2_LABEL_TO_METRIC`, and this
// exclusion allowlist.

export { M2_LABEL_TO_METRIC, PRODUCTION_DRIFT_EXCLUSIONS };

/**
 * Coerce a `SurfaceValue` projection (string | number | boolean |
 * null) down to a `number | null` we can diff numerically. Booleans
 * and non-numeric strings collapse to `null` (treated as
 * "canonical-not-projectable" by the diff loop).
 */
function asNumber(v: SurfaceValue): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

// ── Severity ──────────────────────────────────────────────────────────

const HIGH_SEVERITY_TOLERANCE_MULTIPLIER = 10;

/**
 * Decide the severity of a numeric drift against the registry
 * tolerance. Mirrors the M4 integrity report's rule:
 *
 *   - delta ≤ tol.abs (or delta/canonical ≤ tol.rel) → no drift
 *   - delta ≤ 10× tol.abs (or 10× tol.rel) → "low"
 *   - otherwise → "high"
 *
 * A `null` tolerance.abs is treated as 0 so we still detect drift on
 * metrics whose only tolerance is relative.
 */
export function classifyDrift(
  extracted: number,
  canonical: number,
  metric: CanonicalMetric,
): { severity: DriftSeverity | "ok"; deltaAbs: number; toleranceAbs: number } {
  const delta = Math.abs(extracted - canonical);
  const tolAbs = metric.tolerance.abs ?? 0;
  const tolRel = metric.tolerance.rel ?? 0;
  const denom = Math.abs(canonical);
  const relDelta = denom > 0 ? delta / denom : Infinity;
  const withinAbs = delta <= tolAbs;
  const withinRel = tolRel > 0 && relDelta <= tolRel;
  if (withinAbs || withinRel) {
    return { severity: "ok", deltaAbs: delta, toleranceAbs: tolAbs };
  }
  const highAbs = tolAbs * HIGH_SEVERITY_TOLERANCE_MULTIPLIER;
  const highRel = tolRel * HIGH_SEVERITY_TOLERANCE_MULTIPLIER;
  const aboveHighAbs = delta > highAbs;
  const aboveHighRel =
    tolRel > 0 ? relDelta > highRel : true;
  const severity: DriftSeverity =
    aboveHighAbs && aboveHighRel ? "high" : "low";
  return { severity, deltaAbs: delta, toleranceAbs: tolAbs };
}

// ── Core diff ─────────────────────────────────────────────────────────

const METRIC_BY_ID = new Map<string, CanonicalMetric>(
  CANONICAL_METRICS.map((m) => [m.id, m]),
);

/**
 * Compute drift events for one (modelData × packet) pair. Pure
 * function — does not touch the DB, does not send email. Exposed for
 * unit tests; production callers go through {@link runDriftCheck}.
 */
export function computeDriftEvents(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  renderedPacket: unknown,
  surface: DriftSurface,
): { events: DriftEventRecord[]; metricsConsidered: number; metricsMatched: number } {
  const canonicalByMetric = computeCanonicalValuesForModel(
    modelData,
    consultantOutput,
  );
  const leaves = walkJsonForNumbers(renderedPacket);

  const events: DriftEventRecord[] = [];
  const matchedMetricIds = new Set<string>();
  let metricsConsidered = 0;

  for (const leaf of leaves) {
    if (!leaf.label) continue;
    const mapping = M2_LABEL_TO_METRIC[leaf.label];
    if (!mapping) continue;
    if (mapping.pathFilter && !mapping.pathFilter(leaf.path)) continue;
    const metric = METRIC_BY_ID.get(mapping.metricId);
    if (!metric) continue;
    metricsConsidered++;

    const rawCanonical = canonicalByMetric[mapping.metricId];
    const projectedSurface: SurfaceValue = mapping.pickCanonical
      ? mapping.pickCanonical(rawCanonical)
      : ((rawCanonical as SurfaceValue) ?? null);
    const projected = asNumber(projectedSurface);

    if (projected === null || !Number.isFinite(projected)) {
      // Canonical accessor returned a non-scalar / null for this
      // model — record as "missing" so the dashboard can show the
      // surface emitted a value the canonical layer cannot anchor.
      events.push({
        metricId: metric.id,
        surface,
        severity: "missing",
        extractedValue: leaf.value,
        canonicalValue: null,
        deltaAbs: null,
        toleranceAbs: metric.tolerance.abs ?? null,
        location: leaf.path,
        note: "canonical-not-projectable",
      });
      continue;
    }

    matchedMetricIds.add(metric.id);
    const verdict = classifyDrift(leaf.value, projected, metric);
    if (verdict.severity === "ok") continue;
    events.push({
      metricId: metric.id,
      surface,
      severity: verdict.severity,
      extractedValue: leaf.value,
      canonicalValue: projected,
      deltaAbs: verdict.deltaAbs,
      toleranceAbs: verdict.toleranceAbs,
      location: leaf.path,
      note: null,
    });
  }

  return {
    events,
    metricsConsidered,
    metricsMatched: matchedMetricIds.size,
  };
}

// ── Persistence + alerting ────────────────────────────────────────────

/**
 * Window during which a `(modelId, metricId, surface, severity=high)`
 * alert is treated as duplicate. Mirrors `key-rotation-alert.ts` ‒
 * tunable via env so an operator can dial the cadence without a code
 * change.
 */
const DEFAULT_ALERT_DEDUPE_HOURS = 24;
function getAlertDedupeWindowMs(): number {
  const raw = Number(process.env.INTEGRITY_DRIFT_ALERT_DEDUPE_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ALERT_DEDUPE_HOURS;
  return Math.floor(hours * 60 * 60 * 1000);
}

function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Persist drift events and (if any are `high`) email ADMIN_EMAILS.
 * Returns the persisted event count and whether an admin alert was
 * dispatched. Swallows nothing — callers are responsible for wrapping
 * this in their own try/catch (the background dispatcher below does).
 */
export async function persistAndAlert(
  events: DriftEventRecord[],
  opts: DriftCheckOptions,
): Promise<{ persistedCount: number; alertedAdmins: boolean }> {
  if (events.length === 0) {
    return { persistedCount: 0, alertedAdmins: false };
  }
  const rows: InsertIntegrityDriftEvent[] = events.map((e) => ({
    modelId: opts.modelId,
    metricId: e.metricId,
    surface: e.surface,
    severity: e.severity,
    extractedValue: e.extractedValue,
    canonicalValue: e.canonicalValue,
    deltaAbs: e.deltaAbs,
    toleranceAbs: e.toleranceAbs,
    location: e.location ?? null,
    note: e.note ?? null,
    requestId: opts.requestId ?? null,
    details: null,
  }));
  await db.insert(integrityDriftEventsTable).values(rows);

  const highEvents = events.filter((e) => e.severity === "high");
  if (highEvents.length === 0) {
    return { persistedCount: rows.length, alertedAdmins: false };
  }

  const recipients = parseAdminEmails();
  if (recipients.length === 0 || !isEmailConfigured()) {
    return { persistedCount: rows.length, alertedAdmins: false };
  }

  // Throttle: skip if an identical (modelId, metricId, surface, high)
  // alert already fired within the dedupe window. Avoids alert
  // fatigue when a single drifting model is re-rendered repeatedly.
  const windowStart = new Date(Date.now() - getAlertDedupeWindowMs());
  const recentHighIds = new Set<string>();
  for (const ev of highEvents) {
    const existing = await db
      .select({ id: integrityDriftEventsTable.id })
      .from(integrityDriftEventsTable)
      .where(
        and(
          eq(integrityDriftEventsTable.modelId, opts.modelId),
          eq(integrityDriftEventsTable.metricId, ev.metricId),
          eq(integrityDriftEventsTable.surface, ev.surface),
          eq(integrityDriftEventsTable.severity, "high"),
          gte(integrityDriftEventsTable.requestTimestamp, windowStart),
          // Exclude the just-inserted row itself.
          sql`${integrityDriftEventsTable.requestTimestamp} < now() - interval '1 second'`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      recentHighIds.add(`${ev.metricId}::${ev.surface}`);
    }
  }
  const freshHigh = highEvents.filter(
    (e) => !recentHighIds.has(`${e.metricId}::${e.surface}`),
  );
  if (freshHigh.length === 0) {
    return { persistedCount: rows.length, alertedAdmins: false };
  }

  const subject = `[integrity] ${freshHigh.length} high-severity math drift event(s) on model #${opts.modelId}`;
  const lines = freshHigh.map(
    (e) =>
      `- ${e.metricId} on ${e.surface}: extracted=${e.extractedValue} canonical=${e.canonicalValue} delta=${e.deltaAbs} (tol=${e.toleranceAbs}) @ ${e.location ?? "(no-location)"}`,
  );
  const body =
    `The production drift monitor detected ${freshHigh.length} ` +
    `metric value(s) on model #${opts.modelId} that drifted beyond ` +
    `10× the registry tolerance.\n\n` +
    lines.join("\n") +
    `\n\nRequest id: ${opts.requestId ?? "(none)"}\n` +
    `Sample rate: ${getConfiguredSampleRate()}\n\n` +
    `See docs/operations/production-drift-monitor.md for triage.`;

  let alerted = false;
  for (const to of recipients) {
    const result = await deliverTransactionalEmail({
      kind: "integrity-drift-alert",
      to,
      subject,
      text: body,
      html: `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap;">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`,
    });
    if (result.success) alerted = true;
  }

  return { persistedCount: rows.length, alertedAdmins: alerted };
}

/**
 * Synchronous entry point. Computes drift events, persists them, and
 * alerts admins on high-severity rows. Throws on failure — most
 * callers should use {@link runDriftCheckInBackground} which wraps
 * this with the read-only safety contract.
 */
export async function runDriftCheck(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  renderedPacket: unknown,
  opts: DriftCheckOptions,
): Promise<DriftCheckResult> {
  const { events, metricsConsidered, metricsMatched } = computeDriftEvents(
    modelData,
    consultantOutput,
    renderedPacket,
    opts.surface,
  );
  const { alertedAdmins } = await persistAndAlert(events, opts);
  return {
    ran: true,
    events,
    metricsConsidered,
    metricsMatched,
    alertedAdmins,
  };
}

/**
 * Fire-and-forget entry point used by the packet route handlers. Gated
 * by `INTEGRITY_DRIFT_SAMPLE_RATE`; dispatched via `setImmediate` so
 * the founder's HTTP response is never delayed by the diff or DB
 * write. Every failure is swallowed inside this function so a drift-
 * check bug can NEVER affect the user-facing response.
 */
export function runDriftCheckInBackground(
  modelData: ModelData,
  consultantOutput: ConsultantOutput,
  renderedPacket: unknown,
  opts: DriftCheckOptions,
  forceSample?: boolean,
): void {
  if (!shouldSampleDriftCheck(forceSample)) return;
  setImmediate(async () => {
    // Record that this packet was sampled (regardless of whether any
    // drift was found). Admin dashboard uses this as the denominator
    // for "drift events per 1k sampled packets".
    try {
      await db.insert(eventsTable).values({
        eventName: "integrity_drift_sampled",
        metadata: {
          surface: opts.surface,
          modelId: opts.modelId,
          requestId: opts.requestId ?? null,
        },
      });
    } catch (err) {
      console.error(
        "[integrity-drift] sample-event log failed:",
        err instanceof Error ? err.message : err,
      );
    }
    try {
      await runDriftCheck(modelData, consultantOutput, renderedPacket, opts);
    } catch (err) {
      // Log only — never propagate. Drift monitor is observe-only.
      console.error(
        "[integrity-drift] background check failed:",
        err instanceof Error ? err.message : err,
      );
    }
  });
}
