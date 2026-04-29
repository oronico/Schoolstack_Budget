// AES-256-GCM at-rest encryption for accounting OAuth tokens. We never write
// plaintext tokens to the database — every persisted token round-trips through
// `encryptToken` / `decryptToken` here.
//
// Key derivation: prefer a dedicated `ACCOUNTING_TOKEN_SECRET`; fall back to
// `JWT_SECRET` so existing deployments keep working without a separate config.
// Both are HKDF'd into a 32-byte key so the GCM cipher always sees a clean key
// regardless of secret length.
import crypto from "crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = Buffer.from("schoolstack:accounting-token:v1");
const HKDF_SALT = Buffer.from("schoolstack:accounting-token:salt");

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret =
    process.env.ACCOUNTING_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ACCOUNTING_TOKEN_SECRET (or JWT_SECRET) must be set to encrypt accounting tokens.",
    );
  }
  // hkdfSync returns an ArrayBuffer in Node's typings; we wrap it so the
  // rest of the module can treat it as a regular Buffer (and use .slice etc).
  const derived = crypto.hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    HKDF_SALT,
    HKDF_INFO,
    KEY_BYTES,
  );
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

// Resets the cached key so unit tests can swap secrets between cases.
export function _resetEncryptionKeyForTests(): void {
  cachedKey = null;
}

// Returns base64 string `iv|ciphertext|tag`. Stored directly in the DB.
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string.");
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptToken(payload: string): string {
  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error("decryptToken: payload must be a non-empty string.");
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptToken: payload too short to be valid ciphertext.");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
