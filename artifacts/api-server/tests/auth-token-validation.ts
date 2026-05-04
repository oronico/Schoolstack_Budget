// Round-2 adversarial-audit regression — JWT auth-bypass surface.
//
// The original authMiddleware decoded the JWT, accepted whatever shape
// `userId` / `tokenVersion` happened to have, and only consulted the DB
// (for the user-existence + revocation check) when `tokenVersion` was a
// number. That left two real bypasses with a leaked JWT_SECRET:
//
//   1. Legacy-token revocation bypass: a token with no `tokenVersion`
//      claim authenticated as the user even after they logged out
//      (which bumps usersTable.tokenVersion).
//   2. Ghost-user auth: the same legacy-shape token signed with an
//      arbitrary userId (e.g. 999_999_999) authenticated as that
//      non-existent user — every downstream query just returned no
//      rows under that id, but `req.userId` was happily set.
//
// The fix in middlewares/auth.ts:
//   - Validates `decoded.userId` is a positive int32 (rejects strings,
//     NaN, fractional, overflow).
//   - Requires `decoded.tokenVersion` to be a non-negative integer —
//     legacy/forged tokens missing the claim are rejected.
//   - Always runs the user-existence + version check (no longer gated
//     on the presence of the claim).

import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { registerAndVerify } from "./helpers/register-and-verify.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function get(baseUrl: string, path: string, token?: string): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: await res.text() };
}

async function main(): Promise<void> {
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    console.error("JWT_SECRET must be set");
    process.exitCode = 1;
    return;
  }
  const { baseUrl, close } = await startServer();
  try {
    // --- Set up a real user we can use for the revocation tests. ---
    const email = `auth-token-test-${Date.now()}@example.com`;
    const { token: validToken, user } = await registerAndVerify(baseUrl, {
      email, password: "Password123!", name: "Auth Tester",
    });
    const userId = user.id;

    // --- 1. Sanity: a freshly-issued token is accepted. ---
    const baseline = await get(baseUrl, "/api/models", validToken);
    check("freshly-issued token is accepted on /api/models", baseline.status === 200,
      `got ${baseline.status}: ${baseline.body.slice(0, 120)}`);

    // --- 2. Legacy-shape token (no tokenVersion claim) → 401. ---
    // PRE-FIX this would return 200 even after the user's tokenVersion bumped.
    const legacyToken = jwt.sign({ userId }, SECRET, { expiresIn: "7d" });
    const legacyResp = await get(baseUrl, "/api/models", legacyToken);
    check("legacy-shape token (no tokenVersion claim) is rejected", legacyResp.status === 401,
      `got ${legacyResp.status}: ${legacyResp.body.slice(0, 120)}`);

    // --- 3. Ghost-user token (legacy-shape, userId points at no real user) → 401. ---
    // PRE-FIX this returned 200 (auth bypass for a userId that doesn't exist).
    const ghostLegacyToken = jwt.sign({ userId: 999_999_999 }, SECRET, { expiresIn: "7d" });
    const ghostLegacyResp = await get(baseUrl, "/api/models", ghostLegacyToken);
    check("ghost-user legacy-shape token is rejected (auth bypass closed)",
      ghostLegacyResp.status === 401,
      `got ${ghostLegacyResp.status}: ${ghostLegacyResp.body.slice(0, 120)}`);

    // --- 4. Ghost-user token WITH tokenVersion → 401 (user-existence check). ---
    const ghostFullToken = jwt.sign({ userId: 999_999_999, tokenVersion: 0 }, SECRET, { expiresIn: "7d" });
    const ghostFullResp = await get(baseUrl, "/api/models", ghostFullToken);
    check("ghost-user token with tokenVersion is rejected", ghostFullResp.status === 401,
      `got ${ghostFullResp.status}`);

    // --- 5. String userId (e.g. "1' OR 1=1--") → 401, NEVER reaches the DB. ---
    // PRE-FIX a string userId reached drizzle's eq() and either coerced
    // (returning 200 for stringy "3") or threw a 500 for the SQLi form.
    const stringIdToken = jwt.sign({ userId: String(userId), tokenVersion: 0 }, SECRET, { expiresIn: "1m" });
    const stringIdResp = await get(baseUrl, "/api/models", stringIdToken);
    check("string-coerced userId is rejected pre-DB", stringIdResp.status === 401,
      `got ${stringIdResp.status}: ${stringIdResp.body.slice(0, 120)}`);

    const sqliToken = jwt.sign({ userId: "1' OR 1=1--", tokenVersion: 0 }, SECRET, { expiresIn: "1m" });
    const sqliResp = await get(baseUrl, "/api/models", sqliToken);
    check("SQLi-shaped userId is rejected pre-DB (no 500 in error_logs)",
      sqliResp.status === 401,
      `got ${sqliResp.status}: ${sqliResp.body.slice(0, 120)}`);

    // --- 6. Fractional / NaN / negative / overflow userIds → 401. ---
    for (const bad of [1.5, NaN, 0, -1, 2_147_483_648, Number.MAX_SAFE_INTEGER]) {
      const t = jwt.sign({ userId: bad, tokenVersion: 0 }, SECRET, { expiresIn: "1m" });
      const r = await get(baseUrl, "/api/models", t);
      check(`bogus userId=${bad} is rejected`, r.status === 401, `got ${r.status}`);
    }

    // --- 7. Missing tokenVersion explicitly (e.g. forged via leaked secret) → 401. ---
    const noVersionToken = jwt.sign({ userId, tokenVersion: undefined }, SECRET, { expiresIn: "1m" });
    const noVersionResp = await get(baseUrl, "/api/models", noVersionToken);
    check("token missing tokenVersion claim is rejected", noVersionResp.status === 401,
      `got ${noVersionResp.status}`);

    // --- 8. Stale tokenVersion (user logged out → version bumped) → 401. ---
    // After logout, the original validToken's version is one behind. The
    // pre-fix legacy-token attack would let an attacker route around this
    // by stripping the tokenVersion claim; we already covered that above.
    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${validToken}` },
    });
    check("logout returns 200", logout.status === 200);
    const afterLogout = await get(baseUrl, "/api/models", validToken);
    check("token with stale tokenVersion is rejected after logout", afterLogout.status === 401,
      `got ${afterLogout.status}`);
    // And the legacy-shape token is STILL rejected (the bypass is closed
    // even when the user has just logged out).
    const legacyAfterLogout = await get(baseUrl, "/api/models", legacyToken);
    check("legacy-shape token does NOT bypass logout (the bypass we shipped to fix)",
      legacyAfterLogout.status === 401,
      `got ${legacyAfterLogout.status}: ${legacyAfterLogout.body.slice(0, 120)}`);

    // --- Cleanup. ---
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  } finally {
    await close();
  }

  console.log(`\nAuth token validation tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(f);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Test runner crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
  });
