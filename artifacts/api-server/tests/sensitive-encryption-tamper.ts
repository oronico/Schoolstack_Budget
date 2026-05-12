// Task #846 — Dedicated unit test for AES-GCM auth-tag verification on
// the sensitive-borrower-id helper.
//
// The security scan flagged `sensitive-encryption.ts` as a potential
// "GCM without auth-tag verification" finding. The existing
// `sensitive-encryption-smoke.ts` already exercises one tampered-byte
// case, but only on the data ciphertext. This test extends coverage
// to every mutable field in the envelope (data ciphertext, data IV,
// data auth tag, wrapped DEK ciphertext, wrapped DEK IV, wrapped DEK
// auth tag), and pins the contract that mutation surfaces as a
// `SensitiveEncryptionError` rather than as undefined behavior or a
// silent garbage decrypt.

import {
  encryptSensitive,
  decryptSensitive,
  SensitiveEncryptionError,
} from "../src/lib/sensitive-encryption.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

interface Envelope {
  v: string;
  kekId: string;
  dekIv: string;
  dekTag: string;
  dekCt: string;
  dataIv: string;
  dataTag: string;
  dataCt: string;
}

function decode(ref: string): Envelope {
  const body = ref.slice(3);
  return JSON.parse(Buffer.from(body, "base64").toString("utf8")) as Envelope;
}

function encode(env: Envelope): string {
  return `v1:${Buffer.from(JSON.stringify(env), "utf8").toString("base64")}`;
}

function flipFirstByte(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) throw new Error("cannot flip an empty buffer");
  bytes[0] = bytes[0] ^ 0xff;
  return bytes.toString("base64");
}

function expectThrow(label: string, fn: () => unknown): void {
  try {
    const out = fn();
    check(label, false, `expected to throw, got ${JSON.stringify(out)}`);
  } catch (err) {
    check(
      label,
      err instanceof SensitiveEncryptionError,
      `wrong error: ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`,
    );
  }
}

const RAW = "987-65-4321";
const OPTS = { actorRole: "underwriter", purpose: "task #846 tamper unit test" };

console.log("\n— sensitive-encryption tamper coverage (task #846)");

// Sanity: untampered ref decrypts cleanly.
const ref = encryptSensitive(RAW).encryptedRef;
const recovered = decryptSensitive(ref, OPTS);
check("untampered ref round-trips", recovered === RAW, `got ${recovered}`);

const fields: Array<keyof Envelope> = [
  "dataCt",
  "dataIv",
  "dataTag",
  "dekCt",
  "dekIv",
  "dekTag",
];

for (const field of fields) {
  const env = decode(ref);
  env[field] = flipFirstByte(env[field]);
  const tampered = encode(env);
  expectThrow(
    `flipping a byte in '${field}' makes decryptSensitive throw SensitiveEncryptionError`,
    () => decryptSensitive(tampered, OPTS),
  );
}

// Truncating the auth tag is another classic GCM-bypass attempt —
// some implementations accept a short tag and effectively skip
// verification. We must reject it.
{
  const env = decode(ref);
  const tagBytes = Buffer.from(env.dataTag, "base64").subarray(0, 8);
  env.dataTag = tagBytes.toString("base64");
  expectThrow(
    "truncating the data auth tag is rejected (no short-tag bypass)",
    () => decryptSensitive(encode(env), OPTS),
  );
}

// Truncating the IV is a related shape attack — also must be rejected.
{
  const env = decode(ref);
  const ivBytes = Buffer.from(env.dataIv, "base64").subarray(0, 6);
  env.dataIv = ivBytes.toString("base64");
  expectThrow(
    "truncating the data IV is rejected (no short-IV bypass)",
    () => decryptSensitive(encode(env), OPTS),
  );
}

// Swapping the data tag with the DEK tag should also fail — the
// auth-tag-bound key/ct/iv combo no longer matches.
{
  const env = decode(ref);
  const swap = env.dataTag;
  env.dataTag = env.dekTag;
  env.dekTag = swap;
  expectThrow(
    "swapping data and DEK auth tags is rejected",
    () => decryptSensitive(encode(env), OPTS),
  );
}

console.log(`\nsensitive-encryption-tamper: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Failures:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
