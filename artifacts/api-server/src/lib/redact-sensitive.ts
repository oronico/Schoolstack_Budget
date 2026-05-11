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

// Task #786 — Key-based redaction can't catch secrets that show up as
// substrings inside `error_message` / `error_stack` (e.g. a Postgres
// error that echoes the offending row, or a stack frame whose locals
// were serialized into the message). The patterns below mask values
// that LOOK like one of the secret shapes we already strip by key.
//
// Each pattern is intentionally narrow — we'd rather leave a bit of
// context untouched than corrupt unrelated text. Order matters where
// patterns could overlap (Bearer before generic JWT, etc.).
const SENSITIVE_STRING_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp; replacement: string }> = [
  // `appstorage://bucket/path/to/file.pdf` — our object-storage refs.
  { name: "storage_ref", pattern: /appstorage:\/\/[^\s"'<>)]+/gi, replacement: "appstorage://[REDACTED]" },
  // `Bearer <token>` — Authorization header echoed into a stack frame.
  { name: "bearer", pattern: /Bearer\s+[A-Za-z0-9._\-+/=]+/g, replacement: "Bearer [REDACTED]" },
  // Stripe-style bank account tokens.
  { name: "btok", pattern: /\bbtok_[A-Za-z0-9]+/g, replacement: "btok_[REDACTED]" },
  // Plaid access tokens (access-sandbox-..., access-production-...).
  { name: "plaid", pattern: /\baccess-(?:sandbox|development|production)-[A-Za-z0-9-]+/g, replacement: "access-[REDACTED]" },
  // bcrypt hashes — `$2a$`, `$2b$`, `$2y$` followed by the cost + 53 base64-ish chars.
  { name: "bcrypt", pattern: /\$2[aby]\$\d{1,2}\$[./A-Za-z0-9]{53}/g, replacement: "$2a$[REDACTED]" },
  // JWTs: three base64url segments separated by dots. Constrain each
  // segment length so we don't eat ordinary `a.b.c` text.
  { name: "jwt", pattern: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: "[REDACTED_JWT]" },
  // SSN — `123-45-6789`.
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  // EIN — `12-3456789`.
  { name: "ein", pattern: /\b\d{2}-\d{7}\b/g, replacement: "[REDACTED_EIN]" },
];

/**
 * Mask substrings inside a free-form string that look like one of the
 * sensitive shapes we already strip by key (JWTs, bcrypt hashes,
 * `appstorage://` refs, EIN/SSN, `btok_`/`Bearer` tokens). Used by
 * `recordErrorLog` on `errorMessage` and `errorStack` so a Postgres
 * error that echoes the offending row, or a stack frame whose locals
 * were serialized into the message, doesn't smuggle a secret past the
 * key-based redactor.
 */
export function scrubSensitiveString(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  let out = String(input);
  for (const { pattern, replacement } of SENSITIVE_STRING_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
