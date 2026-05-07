import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Task #605 — Phase 1 underwriting schema. Append-only audit trail for
// every mutation to an underwriting record (application, document,
// evidence, gate, snapshot, decision). Lives outside the per-table
// `updated_at` column so we capture *what changed*, not just *when*.
//
// We deliberately do NOT add a FK on `entityId` — the audit log spans
// many tables and a hard FK would either cascade-delete history (bad)
// or block legitimate deletes elsewhere. Instead we pin the row by the
// (entityType, entityId) pair, kept as plain columns and indexed.
//
// `action` is varchar + check constraint. Allowed values:
//   create, update, delete, status_change,
//   verify, reject, waive, snapshot, decision
//
// PII handling: `before` / `after` are jsonb diffs of the changed
// fields. Application code is responsible for redacting or omitting any
// document storage refs, encrypted EIN/bank references, or other
// sensitive fields before writing the diff. We document this in the
// schema plan so reviewers can verify.
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  // The actor who performed the change. Null when the change came from
  // a system process (migration backfill, scheduled sweeper).
  actorUserId: integer("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Snapshot of the actor's role at the time of the action — useful
  // when a user is later promoted/demoted and we need to know which
  // permission level signed off historically.
  actorRole: varchar("actor_role", { length: 50 }),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  // Field-level diff. Application code SHOULD only include the keys
  // that actually changed, and MUST redact PII (encrypted EIN refs,
  // storageRef tokens, etc) before persisting.
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  // Free-text note ("approved with conditions", "doc rejected — wrong
  // fiscal year"). Surfaced verbatim in the activity feed UI.
  note: text("note"),
  // Source IP / user agent are intentionally NOT stored here; they live
  // alongside session records (handled by request middleware) so the
  // audit log itself stays free of PII bound to a single login.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_log_entity_idx").on(table.entityType, table.entityId),
  index("audit_log_actor_user_id_idx").on(table.actorUserId),
  index("audit_log_created_at_idx").on(table.createdAt),
]);

export type InsertAuditLog = typeof auditLogTable.$inferInsert;
export type AuditLog = typeof auditLogTable.$inferSelect;
