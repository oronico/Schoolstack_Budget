// Task #1004 — Adversarial unit tests for
// `ObjectStorageService.parseOwnerUserIdFromObjectPath`.
//
// This parser is consumed by `/storage/uploads/finalize`,
// `/storage/objects/*`, and `/storage/evidence-thumbnail/objects/*`
// as a defense-in-depth authorization fallback when no ACL policy
// has been written for an object yet (e.g. uploaded but never
// finalized). A loose match here is a privilege-escalation surface,
// not a UX bug — a path crafted with the caller's own `u-<self-id>`
// segment in front of a victim's segment could falsely satisfy the
// fallback owner check.
//
// An earlier revision parsed by scanning every segment for the first
// `startsWith("u-")` match. This file pins the now-stricter contract:
// the parser only resolves to a userId when the path matches the
// exact canonical shape produced by `getObjectEntityUploadURL`:
//
//     /objects/uploads/u-<userId>/<objectId>
//
// — three segments after `/objects/`, the first literal `uploads`,
// the second `u-<id>` with a URL-safe id, the third a non-empty
// single segment. Anything else returns `undefined` so the route
// falls through to ACL-only authorization (which is the safe
// default).

import { ObjectStorageService } from "../src/lib/objectStorage.js";

const svc = new ObjectStorageService();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

function expectOwner(label: string, path: string, expected: string): void {
  const actual = svc.parseOwnerUserIdFromObjectPath(path);
  check(label, actual === expected, `path=${JSON.stringify(path)} expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`);
}

function expectReject(label: string, path: string): void {
  const actual = svc.parseOwnerUserIdFromObjectPath(path);
  check(label, actual === undefined, `path=${JSON.stringify(path)} expected=undefined got=${JSON.stringify(actual)}`);
}

console.log("=== parseOwnerUserIdFromObjectPath Adversarial Tests (Task #1004) ===");

// ────────────────────────────────────────────────────────────────────
// 1. Canonical happy paths — parser MUST resolve the userId.
// ────────────────────────────────────────────────────────────────────
expectOwner(
  "canonical numeric userId resolves",
  "/objects/uploads/u-12345/0a4b6f3c-2c0a-4f47-b9a1-1e2f3a4b5c6d",
  "12345",
);
expectOwner(
  "canonical alphanumeric userId resolves",
  "/objects/uploads/u-alice/file123.pdf",
  "alice",
);
expectOwner(
  "canonical userId with underscore + dash resolves",
  "/objects/uploads/u-user_42-xyz/abc-def",
  "user_42-xyz",
);
expectOwner(
  "single-char userId resolves",
  "/objects/uploads/u-7/object",
  "7",
);
expectOwner(
  "objectId may contain extra characters (dots, dashes) without affecting owner",
  "/objects/uploads/u-alice/some.file.name-with-dashes.pdf",
  "alice",
);

// ────────────────────────────────────────────────────────────────────
// 2. The exact attack the architect flagged: an extra `u-<attacker>`
//    segment somewhere other than the canonical owner position must
//    NOT shift the parsed owner. The loose old parser returned the
//    first `u-*` segment it found, which would have let an attacker
//    craft a path resolving to their own id while pointing at someone
//    else's bytes.
// ────────────────────────────────────────────────────────────────────
expectReject(
  "extra u- segment in front of uploads/ rejects (old parser would return 'attacker')",
  "/objects/u-attacker/uploads/u-victim/file",
);
expectReject(
  "extra u- segment after the objectId rejects (4 segments — non-canonical)",
  "/objects/uploads/u-victim/file/u-attacker",
);
expectReject(
  "u-<id> as objectId with extra trailing segment rejects",
  "/objects/uploads/u-victim/u-attacker/file",
);
expectOwner(
  "u- prefix inside the objectId segment does NOT confuse the parser (objectId can legitimately start with u-)",
  "/objects/uploads/u-alice/u-attacker-file.pdf",
  "alice",
);

// ────────────────────────────────────────────────────────────────────
// 3. Path-traversal attempts. The parser receives the already-
//    constructed `/objects/<wildcard>` string; even though the
//    surrounding HTTP/HTTPS layers normalize `..` differently, we
//    treat `..` as a literal segment here, which means a traversal
//    attempt yields >3 segments after `/objects/` and is rejected.
// ────────────────────────────────────────────────────────────────────
expectReject(
  "traversal via .. inserts extra segments — rejected",
  "/objects/uploads/u-alice/../u-bob/file",
);
expectReject(
  "double traversal — rejected",
  "/objects/uploads/u-alice/../../u-bob/file",
);
expectReject(
  "traversal escaping uploads — rejected (parts[0] !== 'uploads')",
  "/objects/../uploads/u-alice/file",
);

// ────────────────────────────────────────────────────────────────────
// 4. Malformed / non-canonical paths — must all reject cleanly.
// ────────────────────────────────────────────────────────────────────
expectReject("empty string rejects", "");
expectReject("root rejects", "/");
expectReject("missing /objects/ prefix rejects", "/uploads/u-alice/file");
expectReject("relative path rejects", "objects/uploads/u-alice/file");
expectReject("only /objects/ prefix rejects", "/objects/");
expectReject("no uploads/ segment rejects", "/objects/u-alice/file");
expectReject(
  "wrong first segment (e.g. 'downloads') rejects",
  "/objects/downloads/u-alice/file",
);
expectReject(
  "owner segment missing u- prefix rejects",
  "/objects/uploads/alice/file",
);
expectReject(
  "empty userId after u- rejects",
  "/objects/uploads/u-/file",
);
expectReject(
  "userId with @ rejects (outside URL-safe charset)",
  "/objects/uploads/u-alice@evil/file",
);
expectReject(
  "userId with slash injection rejects (creates 4 segments)",
  "/objects/uploads/u-alice/extra/file",
);
expectReject(
  "userId with whitespace rejects",
  "/objects/uploads/u-alice bob/file",
);
expectReject(
  "userId with null byte rejects",
  "/objects/uploads/u-alice\u0000/file",
);
expectReject(
  "trailing slash creates empty 4th segment — rejects",
  "/objects/uploads/u-alice/file/",
);
expectReject(
  "missing objectId segment rejects",
  "/objects/uploads/u-alice",
);
expectReject(
  "missing objectId with trailing slash rejects",
  "/objects/uploads/u-alice/",
);
expectReject(
  "uppercase prefix mismatch rejects (case-sensitive)",
  "/objects/Uploads/u-alice/file",
);
expectReject(
  "public-objects path rejects (different surface entirely)",
  "/objects/public/uploads/u-alice/file",
);

// ────────────────────────────────────────────────────────────────────
// 5. Type / boundary safety.
// ────────────────────────────────────────────────────────────────────
expectReject(
  "deeply nested path rejects",
  "/objects/uploads/u-alice/a/b/c/d/e/f",
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
