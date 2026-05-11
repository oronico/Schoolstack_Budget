// Task #638 — Shared redactor for any JSON payload we persist where a
// careless caller could otherwise leak storage refs, EIN/SSN refs,
// password hashes, bank tokens, etc.
//
// Originally lived inline in `audit-log.ts` (Task #621) as
// `redactAuditPayload` / `FORBIDDEN_AUDIT_KEYS`. The `error_logs`
// table has the same exposure (stack traces and request payloads can
// trivially carry the same keys), so the redactor is now extracted
// here and reused by both the audit-log helper (`audit-log.ts`) and
// the error-log helper (`error-log.ts`).
//
// Add a new forbidden key here — the audit-log AND error-log
// redaction tests both read this list directly.

export const FORBIDDEN_SENSITIVE_KEYS: readonly string[] = [
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

const FORBIDDEN_LOOKUP = new Set(
  FORBIDDEN_SENSITIVE_KEYS.map((k) => k.toLowerCase()),
);

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_LOOKUP.has(key.toLowerCase());
}

/**
 * Deep-clone the input, dropping any property whose key matches a
 * forbidden key (case-insensitive). Walks nested objects and arrays.
 * Returns `null` for `null` / `undefined` inputs so nullable JSONB
 * columns stay properly nullable.
 */
export function redactSensitivePayload(
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
