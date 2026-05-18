/**
 * Task #987 — Production math-integrity drift events.
 *
 * Sampled production-traffic drift monitor (see
 * `artifacts/api-server/src/lib/integrity/drift-monitor.ts`) writes one
 * row per `(modelId, metricId, surface)` tuple where the rendered value
 * disagreed with the canonical value beyond the registry tolerance. The
 * dashboard (#986) reads this table to surface live drift trends; the
 * alerter emails ADMIN_EMAILS when `severity = "high"` (registry-driven
 * threshold).
 *
 * The harness is read-only against the founder/lender response — it
 * only records what it observed, so a write failure here MUST NEVER
 * propagate back into the request that triggered it.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  doublePrecision,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const integrityDriftEventsTable = pgTable(
  "integrity_drift_events",
  {
    id: serial("id").primaryKey(),
    /** Model whose render produced the drift. */
    modelId: integer("model_id").notNull(),
    /** Registry metric id (e.g. `cash-runway-months`). */
    metricId: varchar("metric_id", { length: 80 }).notNull(),
    /** Render surface that produced the drift (e.g. `lender-packet`,
     *  `lender-packet-pdf`, `board-packet`). */
    surface: varchar("surface", { length: 40 }).notNull(),
    /** Severity bucket: `low` (within 10× tolerance), `high` (above)
     *  or `missing` (the surface did not emit a comparable value). */
    severity: varchar("severity", { length: 16 }).notNull(),
    /** Numeric value extracted from the rendered surface. `null` when
     *  the surface did not emit a comparable value (severity=missing). */
    extractedValue: doublePrecision("extracted_value"),
    /** Numeric value the canonical accessor produced for the same
     *  metric on the same model. */
    canonicalValue: doublePrecision("canonical_value"),
    /** Absolute delta = abs(extracted - canonical). Null when missing. */
    deltaAbs: doublePrecision("delta_abs"),
    /** Registry tolerance applied for the diff (absolute or relative-equivalent). */
    toleranceAbs: doublePrecision("tolerance_abs"),
    /** Best-effort path/location string for the rendered leaf
     *  (e.g. `sections[0].linkedMetrics[1].value`). */
    location: text("location"),
    /** Free-form reviewer note (e.g. registry caveat from the resolver). */
    note: text("note"),
    /** Request id (if propagated) so the drift can be traced back to a
     *  specific request in deployment logs. */
    requestId: varchar("request_id", { length: 64 }),
    /** Captured request timestamp (server clock). */
    requestTimestamp: timestamp("request_timestamp").defaultNow().notNull(),
    /** Optional structured details (e.g. canonical shape, extracted leaves). */
    details: jsonb("details"),
  },
  (t) => ({
    modelMetricIdx: index("integrity_drift_events_model_metric_idx").on(
      t.modelId,
      t.metricId,
    ),
    severityIdx: index("integrity_drift_events_severity_idx").on(
      t.severity,
      t.requestTimestamp,
    ),
  }),
);

export type InsertIntegrityDriftEvent =
  typeof integrityDriftEventsTable.$inferInsert;
export type IntegrityDriftEvent =
  typeof integrityDriftEventsTable.$inferSelect;
