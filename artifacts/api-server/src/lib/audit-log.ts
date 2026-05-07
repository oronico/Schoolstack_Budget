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
// Add new forbidden keys here — the test reads this list directly.

import { db } from "@workspace/db";
import { auditLogTable, type InsertAuditLog } from "@workspace/db/schema";

// Keys we never want to see in `before` / `after` JSON, regardless of
// nesting depth. Match is case-insensitive and also catches
// camelCase/snake_case variants of the same concept.
export const FORBIDDEN_AUDIT_KEYS: readonly string[] = [
  "storage_ref",
  "storageRef",
  "ein_encrypted_ref",
  "einEncryptedRef",
  "ssn_encrypted_ref",
  "ssnEncryptedRef",
  "password_hash",
  "passwordHash",
  "bank_account_token",
  "bankAccountToken",
  "bank_routing_token",
  "bankRoutingToken",
  "plaid_access_token",
  "plaidAccessToken",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "session_token",
  "sessionToken",
  "api_key",
  "apiKey",
  "secret",
  // The raw values themselves — callers occasionally hand us a record
  // keyed by `ein` / `ssn` rather than the encrypted-ref pointer.
  "ein",
  "ssn",
];

const FORBIDDEN_LOOKUP = new Set(FORBIDDEN_AUDIT_KEYS.map((k) => k.toLowerCase()));

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_LOOKUP.has(key.toLowerCase());
}

/**
 * Deep-clone the input, dropping any property whose key matches a
 * forbidden audit key (case-insensitive). Walks nested objects and
 * arrays. Returns `null` for `null` / `undefined` inputs so the
 * `before` / `after` columns stay properly nullable.
 */
export function redactAuditPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (payload === null || payload === undefined) return null;
  const cleaned = redactValue(payload);
  if (cleaned === null || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    return null;
  }
  return cleaned as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isForbiddenKey(k)) continue;
      out[k] = redactValue(v);
    }
    return out;
  }
  return value;
}

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
