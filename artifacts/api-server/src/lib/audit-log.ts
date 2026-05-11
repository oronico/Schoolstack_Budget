// Task #621 — Single chokepoint for writing to the `audit_log` table.
//
// The schema (lib/db/src/schema/audit-log.ts) cannot enforce that
// callers strip PII out of the `before` / `after` diffs. One careless
// `db.insert(auditLogTable)` call can park sensitive fields (document
// storage refs, encrypted EIN/SSN refs, password hashes, bank tokens)
// in the history forever.
//
// Every audit-log write site MUST go through `recordAuditLog` so the
// redactor below is the only thing that ever produces the JSON we
// persist. The companion test (`tests/audit-log-redaction.ts`)
// statically scans `src/` and fails the build if a raw insert appears
// outside this file.
//
// Task #638 — The redactor and the forbidden-key list now live in
// `./redact-sensitive.ts` and are shared with the error-log writer
// (which has the same exposure). Add a new forbidden key there — the
// audit-log AND error-log redaction tests both read the list directly.

import { db } from "@workspace/db";
import { auditLogTable, type InsertAuditLog } from "@workspace/db/schema";
import {
  FORBIDDEN_SENSITIVE_KEYS,
  redactSensitivePayload,
} from "./redact-sensitive";

// Re-exported under the original Task #621 names so existing callers
// and the audit-log redaction test keep working unchanged.
export const FORBIDDEN_AUDIT_KEYS: readonly string[] = FORBIDDEN_SENSITIVE_KEYS;
export const redactAuditPayload = redactSensitivePayload;

export interface RecordAuditLogInput {
  actorUserId?: number | null;
  actorRole?: string | null;
  entityType: string;
  entityId: number;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}

/**
 * The ONLY supported way to write an audit_log row from application
 * code. Redacts `before` / `after` before persisting.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  if (!db) {
    throw new Error("recordAuditLog: database is not configured");
  }
  const row: InsertAuditLog = {
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: redactAuditPayload(input.before),
    after: redactAuditPayload(input.after),
    note: input.note ?? null,
  };
  await db.insert(auditLogTable).values(row);
}
