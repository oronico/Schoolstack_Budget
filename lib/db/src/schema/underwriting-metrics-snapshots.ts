import { pgTable, serial, integer, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { underwritingApplicationsTable } from "./underwriting-applications";
import { usersTable } from "./users";

// Task #605 — Phase 1 underwriting schema. A point-in-time freeze of
// every metric the underwriting engine cares about (DSCR, current ratio,
// days cash on hand, enrollment, ADA revenue, etc) for a given
// application. We snapshot rather than compute-on-read so a credit memo
// reproduces exactly what the committee saw on decision day, even if the
// borrower later updates their model.
//
// `metrics` is a wide jsonb blob keyed by metric code; it is the entire
// payload by design — we want one row per snapshot, not one row per
// metric. If a single metric needs to be queried across snapshots in
// future, we promote it to a column in a follow-up migration.
//
// `snapshotKind` varchar + check constraint. Allowed values:
//   intake          – initial pull when application opened
//   pre_committee   – frozen for the credit memo
//   post_decision   – snapshot at decision time, anchors the audit trail
//   monitoring      – periodic post-close monitoring
export const underwritingMetricsSnapshotsTable = pgTable("underwriting_metrics_snapshots", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => underwritingApplicationsTable.id, { onDelete: "cascade" }),
  snapshotKind: varchar("snapshot_kind", { length: 30 }).notNull(),
  // Pointer to the wizard model the snapshot was computed from, captured
  // by id + version so we can replay exactly that revision. Stored as
  // plain integers (no FK) because the financial_models row may be
  // deleted while the underwriting record must persist.
  sourceFinancialModelId: integer("source_financial_model_id"),
  sourceFinancialModelVersion: integer("source_financial_model_version"),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  // Free-text note from whoever cut the snapshot ("frozen for May
  // committee", "post-decline reconciliation", etc).
  notes: varchar("notes", { length: 500 }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("underwriting_metrics_snapshots_application_id_idx").on(table.applicationId),
  index("underwriting_metrics_snapshots_kind_idx").on(table.snapshotKind),
]);

export type InsertUnderwritingMetricsSnapshot = typeof underwritingMetricsSnapshotsTable.$inferInsert;
export type UnderwritingMetricsSnapshot = typeof underwritingMetricsSnapshotsTable.$inferSelect;
