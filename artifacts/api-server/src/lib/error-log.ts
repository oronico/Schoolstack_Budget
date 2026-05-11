// Task #638 — Single chokepoint for writing to the `error_logs` table.
//
// `error_logs` (lib/db/src/schema/error-logs.ts) carries a free-form
// `request_body` jsonb column. Stack traces and request payloads can
// trivially contain the same sensitive keys (storage refs, EIN/SSN
// refs, password hashes, bank tokens) that Task #621 stripped from
// `audit_log`. The schema cannot enforce redaction; application code
// must.
//
// Every error-log write site MUST go through `recordErrorLog` so the
// shared redactor (`./redact-sensitive.ts`) is the only thing that
// ever produces the `request_body` JSON we persist. The companion
// test (`tests/error-log-redaction.ts`) statically scans `src/` and
// fails the build if a raw `db.insert(errorLogsTable)` appears
// outside this file.
//
// Add a new forbidden key? Add it to FORBIDDEN_SENSITIVE_KEYS in
// `./redact-sensitive.ts` — both redaction tests read that list
// directly.

import { db } from "@workspace/db";
import { errorLogsTable, type InsertErrorLog } from "@workspace/db/schema";
import { redactSensitivePayload, scrubSensitiveString } from "./redact-sensitive";

const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 5000;
const MAX_ROUTE_LEN = 500;

export interface RecordErrorLogInput {
  userId?: string | null;
  errorMessage: string;
  errorStack?: string | null;
  route?: string | null;
  requestBody?: Record<string, unknown> | null;
}

/**
 * The ONLY supported way to write an error_logs row from application
 * code. Redacts `requestBody` (deep, key-based) and trims oversized
 * string fields before persisting.
 *
 * Returns a Promise that resolves when the row is persisted. Callers
 * that want fire-and-forget semantics (the global crash handler, the
 * Express error middleware) should `.catch()` the returned promise.
 */
export async function recordErrorLog(input: RecordErrorLogInput): Promise<void> {
  if (!db) {
    throw new Error("recordErrorLog: database is not configured");
  }
  // Task #786 — Scrub sensitive substrings (JWTs, bcrypt hashes,
  // `appstorage://` refs, EIN/SSN, `btok_`/`Bearer` tokens) out of
  // the message and stack BEFORE we truncate, so a secret that
  // straddles a slice boundary still gets masked.
  const scrubbedMessage = scrubSensitiveString(String(input.errorMessage)) ?? "";
  const scrubbedStack = input.errorStack ? scrubSensitiveString(String(input.errorStack)) : null;
  const row: InsertErrorLog = {
    userId: input.userId ?? null,
    errorMessage: scrubbedMessage.slice(0, MAX_MESSAGE_LEN),
    errorStack: scrubbedStack ? scrubbedStack.slice(0, MAX_STACK_LEN) : null,
    route: input.route ? String(input.route).slice(0, MAX_ROUTE_LEN) : null,
    requestBody: redactSensitivePayload(input.requestBody),
  };
  await db.insert(errorLogsTable).values(row);
}
