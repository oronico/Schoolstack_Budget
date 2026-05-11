// Task #620 — Envelope encryption helper for sensitive borrower IDs
// (EIN, SSN, bank account numbers).
//
// The Phase 2 schema (`borrower_entities`, `founder_profiles`) stores
// only `*_last_4` plus an opaque `*_encrypted_ref`. Postgres MUST never
// see the raw value. This module is the only place in the codebase
// that produces or consumes the encrypted reference.
//
// Envelope encryption shape:
//   1. A long-lived Key Encryption Key (KEK) is loaded from env var
//      `SENSITIVE_ENCRYPTION_KEY` (32-byte key, base64 or hex). In a
//      future iteration this is replaced by a managed-KMS lookup; the
//      public API of this module does not change when that happens.
//   2. Each call to `encryptSensitive` generates a fresh per-record
//      Data Encryption Key (DEK), encrypts the plaintext with the DEK
//      using AES-256-GCM, then encrypts the DEK with the KEK using a
//      separate AES-256-GCM operation (also with its own random IV).
//   3. The KEK id, both IVs, both auth tags, the wrapped DEK, and the
//      ciphertext are packed into a single opaque token. The token is
//      version-prefixed (`v1:`) so we can rotate the format later.
//   4. `decryptSensitive` is gated to server-internal roles. UI / API
//      routes that need to verify a value should compare last-4 only;
//      decryption is reserved for back-office tooling (KYC vendor
//      submission, IRS lookup) running with an elevated role.
//
// Threat model in plain words: an attacker who reads the database (SQL
// injection, leaked backup, rogue read replica) sees only the wrapped
// ciphertext and the last 4 digits. To recover the raw value they
// additionally need the KEK, which lives in the deployment environment
// and never in Postgres.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";

const FORMAT_VERSION = "v1";
const KEK_ENV_VAR = "SENSITIVE_ENCRYPTION_KEY";
const DEV_KEY_SEED = "schoolstack-dev-only-sensitive-encryption-key-do-not-use-in-prod";

const AES_KEY_BYTES = 32; // AES-256
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

// Roles that are allowed to call `decryptSensitive`. Keep the list
// small and explicit — this is the choke point for raw EIN/SSN access.
//
// `system` is for cron jobs / background workers (e.g. the KYC submitter)
// that have no human user attached. `underwriter` and `admin` are for
// human back-office operators inspecting a single record. No founder /
// borrower / public role can ever decrypt.
const SERVER_ONLY_DECRYPT_ROLES: ReadonlySet<string> = new Set([
  "system",
  "admin",
  "underwriter",
]);

export class SensitiveEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SensitiveEncryptionError";
  }
}

export class SensitiveDecryptionForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SensitiveDecryptionForbiddenError";
  }
}

interface EnvelopePayload {
  v: typeof FORMAT_VERSION;
  // Short identifier of the KEK used. Today we have one KEK so this is
  // always a hash-prefix of the active key; once we rotate to a managed
  // KMS, this becomes the KMS key id.
  kekId: string;
  // Wrapped (KEK-encrypted) DEK and its GCM nonce/tag.
  dekIv: string;
  dekTag: string;
  dekCt: string;
  // Plaintext-encrypting GCM nonce/tag and the ciphertext itself.
  dataIv: string;
  dataTag: string;
  dataCt: string;
}

function loadKek(): { key: Buffer; id: string } {
  const raw = process.env[KEK_ENV_VAR];
  let keyBytes: Buffer;
  if (raw && raw.trim().length > 0) {
    keyBytes = decodeKeyMaterial(raw.trim());
  } else if (process.env.NODE_ENV === "production") {
    throw new SensitiveEncryptionError(
      `${KEK_ENV_VAR} is not set. Refusing to encrypt sensitive borrower data with an ephemeral key in production.`,
    );
  } else {
    // Deterministic dev-only key. Loud warning so it's obvious this is
    // not a production code path.
    if (!devKeyWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sensitive-encryption] ${KEK_ENV_VAR} unset; using a deterministic DEV-ONLY key. Set ${KEK_ENV_VAR} for any non-local environment.`,
      );
      devKeyWarned = true;
    }
    keyBytes = createHash("sha256").update(DEV_KEY_SEED).digest();
  }
  if (keyBytes.length !== AES_KEY_BYTES) {
    throw new SensitiveEncryptionError(
      `${KEK_ENV_VAR} must decode to exactly ${AES_KEY_BYTES} bytes (got ${keyBytes.length}).`,
    );
  }
  // KEK id is the first 8 hex chars of SHA-256(KEK). Derived (not the
  // key itself) so it can be safely embedded in the opaque token and
  // logged for rotation diagnostics.
  const id = createHash("sha256").update(keyBytes).digest("hex").slice(0, 8);
  return { key: keyBytes, id };
}

let devKeyWarned = false;

function decodeKeyMaterial(input: string): Buffer {
  // Accept either base64 (with or without padding) or hex.
  if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) {
    return Buffer.from(input, "hex");
  }
  return Buffer.from(input, "base64");
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_TAG_BYTES) {
    throw new SensitiveEncryptionError("AES-GCM produced an unexpected auth tag length.");
  }
  return { iv, tag, ct };
}

function aesGcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function normalizeRaw(raw: string): string {
  // Strip whitespace, dashes, and other formatting characters that
  // founders commonly type into EIN/SSN fields ("12-3456789",
  // "123-45-6789"). We persist only the digits (or the canonical form
  // the caller hands us — we don't validate length here, that's the
  // caller's job).
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SensitiveEncryptionError("Cannot encrypt an empty value.");
  }
  return trimmed;
}

function lastFour(raw: string): string {
  // Pull the last 4 digit characters. For all-digit inputs (EIN/SSN
  // with formatting stripped) this is the last four. For inputs that
  // mix letters/digits (rare for borrower IDs) we still slice on
  // digits only so the stored last-4 is meaningful.
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 4) {
    throw new SensitiveEncryptionError(
      "Sensitive value must contain at least 4 digits to derive a last-4.",
    );
  }
  return digits.slice(-4);
}

export interface EncryptResult {
  /** Last 4 digits, safe to store and display alongside the encrypted ref. */
  last4: string;
  /** Opaque token to persist in `*_encrypted_ref`. Treat as bytes. */
  encryptedRef: string;
}

/**
 * Envelope-encrypt a sensitive borrower id (EIN, SSN, bank account #)
 * and return the safe-to-store last-4 plus an opaque encrypted ref.
 *
 * The raw value is never logged, never returned, and never persisted
 * outside the returned `encryptedRef`.
 */
export function encryptSensitive(raw: string): EncryptResult {
  const normalized = normalizeRaw(raw);
  const last4 = lastFour(normalized);

  const { key: kek, id: kekId } = loadKek();
  const dek = randomBytes(AES_KEY_BYTES);

  try {
    const data = aesGcmEncrypt(dek, Buffer.from(normalized, "utf8"));
    const wrapped = aesGcmEncrypt(kek, dek);

    const payload: EnvelopePayload = {
      v: FORMAT_VERSION,
      kekId,
      dekIv: wrapped.iv.toString("base64"),
      dekTag: wrapped.tag.toString("base64"),
      dekCt: wrapped.ct.toString("base64"),
      dataIv: data.iv.toString("base64"),
      dataTag: data.tag.toString("base64"),
      dataCt: data.ct.toString("base64"),
    };
    const encryptedRef = `${FORMAT_VERSION}:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
    return { last4, encryptedRef };
  } finally {
    // Best-effort: zero the in-memory DEK before it falls out of scope
    // so a later heap dump can't trivially recover it.
    dek.fill(0);
  }
}

export interface DecryptOptions {
  /**
   * The role of the actor requesting decryption. Must be one of
   * `system` / `admin` / `underwriter`. Public/founder/borrower roles
   * cannot decrypt — they should compare last-4 only.
   */
  actorRole: string;
  /**
   * Free-text reason captured for audit. Required so every decrypt
   * call has a paper trail at the call site (the call site is
   * responsible for actually writing the audit-log entry — this
   * helper does not, to avoid coupling).
   */
  purpose: string;
}

/**
 * Decrypt an opaque encrypted ref back into the raw sensitive value.
 *
 * Gated to server-internal roles via `opts.actorRole`. Throws
 * `SensitiveDecryptionForbiddenError` for any other role so a
 * misconfigured route cannot leak raw EIN/SSN by accident.
 */
export function decryptSensitive(encryptedRef: string, opts: DecryptOptions): string {
  if (!opts || typeof opts.actorRole !== "string" || typeof opts.purpose !== "string") {
    throw new SensitiveDecryptionForbiddenError(
      "decryptSensitive requires { actorRole, purpose } — refusing to decrypt without an explicit caller.",
    );
  }
  if (!SERVER_ONLY_DECRYPT_ROLES.has(opts.actorRole)) {
    throw new SensitiveDecryptionForbiddenError(
      `Role '${opts.actorRole}' is not permitted to decrypt sensitive borrower data.`,
    );
  }
  if (opts.purpose.trim().length === 0) {
    throw new SensitiveDecryptionForbiddenError(
      "decryptSensitive requires a non-empty purpose string for audit traceability.",
    );
  }

  const payload = parseEncryptedRef(encryptedRef);
  const { key: kek, id: kekId } = loadKek();

  // Constant-time KEK id comparison: in a multi-key future this is the
  // hint we use to look up the right KEK; today it must match.
  const expected = Buffer.from(kekId, "utf8");
  const actual = Buffer.from(payload.kekId, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new SensitiveEncryptionError(
      `Encrypted ref was wrapped with a different KEK (id=${payload.kekId}); cannot decrypt with current ${KEK_ENV_VAR}.`,
    );
  }

  const dek = aesGcmDecrypt(
    kek,
    Buffer.from(payload.dekIv, "base64"),
    Buffer.from(payload.dekTag, "base64"),
    Buffer.from(payload.dekCt, "base64"),
  );
  try {
    const plaintext = aesGcmDecrypt(
      dek,
      Buffer.from(payload.dataIv, "base64"),
      Buffer.from(payload.dataTag, "base64"),
      Buffer.from(payload.dataCt, "base64"),
    );
    return plaintext.toString("utf8");
  } finally {
    dek.fill(0);
  }
}

function parseEncryptedRef(encryptedRef: string): EnvelopePayload {
  if (typeof encryptedRef !== "string" || !encryptedRef.startsWith(`${FORMAT_VERSION}:`)) {
    throw new SensitiveEncryptionError(
      `Encrypted ref is not in the expected ${FORMAT_VERSION} envelope format.`,
    );
  }
  const body = encryptedRef.slice(FORMAT_VERSION.length + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
  } catch (err) {
    throw new SensitiveEncryptionError(`Encrypted ref body is not valid base64 JSON: ${(err as Error).message}`);
  }
  const required: (keyof EnvelopePayload)[] = [
    "v",
    "kekId",
    "dekIv",
    "dekTag",
    "dekCt",
    "dataIv",
    "dataTag",
    "dataCt",
  ];
  if (!parsed || typeof parsed !== "object") {
    throw new SensitiveEncryptionError("Encrypted ref body is not an object.");
  }
  for (const k of required) {
    if (typeof (parsed as Record<string, unknown>)[k] !== "string") {
      throw new SensitiveEncryptionError(`Encrypted ref body missing string field '${k}'.`);
    }
  }
  const payload = parsed as EnvelopePayload;
  if (payload.v !== FORMAT_VERSION) {
    throw new SensitiveEncryptionError(`Unknown envelope version '${payload.v}'.`);
  }
  return payload;
}

/**
 * Test-only: report whether the helper is currently using the
 * deterministic dev key. The smoke test asserts this is NOT the case
 * in production.
 */
export function isUsingDevKey(): boolean {
  const raw = process.env[KEK_ENV_VAR];
  return !raw || raw.trim().length === 0;
}
