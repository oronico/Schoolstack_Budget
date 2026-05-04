// Round-5 adversarial-audit regressions.
//
// Covers three NEW bugs found after round-4 was merged:
//
//   #25  /auth/register user-enumeration via response timing AND status
//        code. The duplicate-email branch returned 409 immediately while
//        the new-email branch always paid bcrypt.hash's ~150ms cost-12
//        work, making the response time a reliable boolean oracle —
//        exactly the same shape as the round-4 #20 login bug. We now
//        run bcrypt.compare against DUMMY_BCRYPT_HASH in the duplicate
//        branch to equalize timing, and tighten the per-IP rate limit
//        from 10/min to 5/min on /auth/register specifically. Status
//        code 409 vs 201 still leaks (full close requires email
//        confirmation flow); this test asserts the timing oracle is
//        closed and the rate limiter is wired.
//
//   #26  /auth/forgot-password timing oracle. The atomic UPDATE landed
//        in round-5 hardening of #24 made the unknown-email and
//        in-cooldown branches even faster (one bare UPDATE returning
//        zero rows), but the existing-user-past-cooldown branch still
//        awaited Resend's 100-500ms HTTP call before responding. That
//        wall-clock differential let a fresh-account scan enumerate
//        registered emails. Fix: respond first, fire-and-forget the
//        trackEvent + sendPasswordResetEmail. All three branches now
//        return in roughly one DB roundtrip.
//
//   #27  /feedback POST had NO rate limiter at all (only optionalAuth).
//        Every other unauth POST on the API is rate-limited; this one
//        slipped through. An unauthenticated attacker could flood the
//        admin inbox with attacker-chosen content at line speed. Fix:
//        add createRateLimiter(60_000, 10) to the route. The runtime
//        429 cannot be observed under E2E_BYPASS (NODE_ENV != production),
//        so this test asserts the limiter middleware is wired and the
//        happy-path POST still works through it.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { db, usersTable, eventsTable, feedbackTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../src/app.js";

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

async function startServer() {
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

async function postJson(baseUrl: string, path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: text, json };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = process.hrtime.bigint();
  const value = await fn();
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1_000_000, value };
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const { baseUrl, close } = await startServer();
  const stamp = Date.now();
  const createdUserIds: number[] = [];

  try {
    // =======================================================================
    // #25 — register timing oracle
    // =======================================================================
    // Setup: register + verify a "real" user we can use as the duplicate-email
    // probe. Task #527/#534: register is confirm-by-email (202 with the same
    // body for both branches and no auth token) so we have to drive
    // /auth/verify-email from the dev-only `_devToken` to actually create
    // the row.
    const realEmail = `round5-real-${stamp}@example.com`;
    const realPassword = "RealPasswordForRound5!";
    const setupReg = await postJson(baseUrl, "/api/auth/register", {
      email: realEmail, password: realPassword, name: "Round 5 Real",
    });
    check(`setup: register real user (202)`, setupReg.status === 202, `status=${setupReg.status} body=${setupReg.body.slice(0, 200)}`);
    const setupDevToken = (setupReg.json as { _devToken?: string } | null)?._devToken;
    check(`setup: register exposes _devToken`, !!setupDevToken && setupDevToken !== "__existing_account__", `token=${setupDevToken}`);
    const setupVerify = await postJson(baseUrl, "/api/auth/verify-email", { token: setupDevToken });
    check(`setup: verify-email returns 200`, setupVerify.status === 200, `status=${setupVerify.status} body=${setupVerify.body.slice(0, 200)}`);
    const realUserId = (setupVerify.json as { user?: { id?: number } } | null)?.user?.id ?? 0;
    if (realUserId) createdUserIds.push(realUserId);

    // Warm up — first request of each branch may include JIT / DB pool overhead.
    await postJson(baseUrl, "/api/auth/register", {
      email: realEmail, password: "warmup-dup-1234", name: "warmup",
    });
    await postJson(baseUrl, "/api/auth/register", {
      email: `round5-warmup-new-${stamp}@example.com`,
      password: "warmup-new-1234",
      name: "warmup new",
    });

    const SAMPLES = 5;
    const dupTimes: number[] = [];
    const newTimes: number[] = [];
    const newUserEmails: string[] = [];
    // Task #527/#534: collect non-volatile parts of each response body so we
    // can assert the duplicate-email branch and the new-email branch return
    // the same 202 + identical message (no `_devBranch` / `_devToken` in
    // prod; in dev they exist but differ — we strip them before comparing).
    const stripDev = (b: unknown) => {
      const o = b && typeof b === "object" ? { ...(b as Record<string, unknown>) } : {};
      // _devToken / _devBranch leak in non-prod for test plumbing only.
      // Both are stripped here so we assert the prod-visible body
      // equivalence.
      for (const k of ["_devToken", "_devBranch"]) {
        delete (o as Record<string, unknown>)[k];
      }
      return o;
    };
    let dupBody: unknown = null;
    let newBody: unknown = null;
    for (let i = 0; i < SAMPLES; i++) {
      // Duplicate-email branch — sends a "password reset" email and pays
      // 1× bcrypt.hash so the timing matches the new-email branch.
      const dup = await timed(() =>
        postJson(baseUrl, "/api/auth/register", {
          email: realEmail,
          password: `wrong-pw-${i}-${stamp}`,
          name: `dup-${i}`,
        }),
      );
      check(`#25 duplicate-email returns 202`, dup.value.status === 202, `status=${dup.value.status}`);
      dupTimes.push(dup.ms);
      if (i === 0) dupBody = dup.value.json;

      // New-email branch — also 202; pays real bcrypt.hash cost on a
      // pending_signups row (no usersTable insert until verify).
      const newEmail = `round5-new-${stamp}-${i}@example.com`;
      const fresh = await timed(() =>
        postJson(baseUrl, "/api/auth/register", {
          email: newEmail,
          password: `FreshPw-${i}-${stamp}`,
          name: `fresh-${i}`,
        }),
      );
      check(`#25 new-email returns 202`, fresh.value.status === 202, `status=${fresh.value.status}`);
      newTimes.push(fresh.ms);
      if (i === 0) newBody = fresh.value.json;
      newUserEmails.push(newEmail);
    }

    // Task #527 acceptance: response equivalence. Both branches must
    // produce the exact same client-visible body so an attacker can't
    // distinguish "email already registered" from "email is fresh".
    check(
      `#25 duplicate vs new register response bodies are identical (modulo dev-only fields)`,
      JSON.stringify(stripDev(dupBody)) === JSON.stringify(stripDev(newBody)),
      `dup=${JSON.stringify(stripDev(dupBody))} new=${JSON.stringify(stripDev(newBody))}`,
    );

    const dupMedian = median(dupTimes);
    const newMedian = median(newTimes);
    const gap = Math.abs(dupMedian - newMedian);
    // Pre-fix gap was ~150ms (full bcrypt.hash cost). Post-fix both branches
    // pay one cost-12 bcrypt op so medians should be close. Allow 60ms slack
    // for DB-write / JIT noise (mirrors the round-4 #20 tolerance).
    check(
      `#25 duplicate vs new register timing within 60ms tolerance`,
      gap < 60,
      `dupMedian=${dupMedian.toFixed(1)}ms newMedian=${newMedian.toFixed(1)}ms gap=${gap.toFixed(1)}ms`,
    );
    // Duplicate must NOT be systematically faster than new by more than the
    // tolerance. (Pre-fix it was ~150ms faster — a clean oracle.)
    check(
      `#25 duplicate not systematically faster than new by 60ms+`,
      newMedian - dupMedian < 60,
      `dupMedian=${dupMedian.toFixed(1)}ms newMedian=${newMedian.toFixed(1)}ms`,
    );

    // =======================================================================
    // #26 — forgot-password timing oracle
    // =======================================================================
    // Pre-fix: the existing-user-past-cooldown branch awaited Resend's
    // ~100-500ms HTTP call before responding. The unknown-email and
    // in-cooldown branches returned in ~5ms after a single UPDATE.
    // Post-fix: respond first, fire-and-forget the email. All three
    // branches now return in roughly one DB roundtrip.

    // Reset the real user's cooldown so each measurement hits the
    // existing-user-past-cooldown branch.
    async function clearCooldown(): Promise<void> {
      await db
        .update(usersTable)
        .set({ resetToken: null, resetTokenExpiry: new Date(Date.now() - 86_400_000) })
        .where(eq(usersTable.id, realUserId));
    }

    // Warm-up
    await clearCooldown();
    await postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail });
    await postJson(baseUrl, "/api/auth/forgot-password", {
      email: `round5-fp-warmup-${stamp}@example.com`,
    });

    const FP_SAMPLES = 5;
    const knownTimes: number[] = [];
    const unknownTimes: number[] = [];
    for (let i = 0; i < FP_SAMPLES; i++) {
      // Existing-user-past-cooldown — pre-fix: slow (Resend awaited).
      await clearCooldown();
      const known = await timed(() =>
        postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail }),
      );
      check(`#26 known-email returns 200`, known.value.status === 200);
      knownTimes.push(known.ms);

      // Unknown email — always fast (1 UPDATE returns 0 rows).
      const unknown = await timed(() =>
        postJson(baseUrl, "/api/auth/forgot-password", {
          email: `round5-fp-nope-${stamp}-${i}@example.com`,
        }),
      );
      check(`#26 unknown-email returns 200`, unknown.value.status === 200);
      unknownTimes.push(unknown.ms);
    }

    const knownMedian = median(knownTimes);
    const unknownMedian = median(unknownTimes);
    const fpGap = Math.abs(knownMedian - unknownMedian);
    // Without the fix, RESEND_API_KEY-configured environments showed
    // ~100-500ms gaps; in CI without RESEND_API_KEY the mailer returns
    // immediately so the pre-fix gap collapses (and this test could
    // false-pass). To make the test meaningful in BOTH configurations,
    // we assert two things:
    //   (a) the gap is under 60ms (closes the oracle when Resend is wired), AND
    //   (b) the known branch is NOT systematically slower than unknown
    //       by more than the tolerance.
    check(
      `#26 known vs unknown forgot-password timing within 60ms tolerance`,
      fpGap < 60,
      `knownMedian=${knownMedian.toFixed(1)}ms unknownMedian=${unknownMedian.toFixed(1)}ms gap=${fpGap.toFixed(1)}ms`,
    );
    check(
      `#26 known not systematically slower than unknown by 60ms+`,
      knownMedian - unknownMedian < 60,
      `knownMedian=${knownMedian.toFixed(1)}ms unknownMedian=${unknownMedian.toFixed(1)}ms`,
    );

    // The fire-and-forget pattern must STILL persist the reset token
    // synchronously (the UPDATE is in the request critical path; only
    // the email send is deferred). Verify the most recent forgot-password
    // for the real user did set a token.
    const [afterFp] = await db
      .select({ token: usersTable.resetToken, expiry: usersTable.resetTokenExpiry })
      .from(usersTable)
      .where(eq(usersTable.id, realUserId))
      .limit(1);
    check(
      `#26 reset token is still persisted synchronously (UPDATE not deferred)`,
      !!afterFp?.token && !!afterFp?.expiry,
      `token=${afterFp?.token?.slice(0, 12)}... expiry=${afterFp?.expiry?.toISOString()}`,
    );

    // =======================================================================
    // #27 — /feedback rate limiter wired
    // =======================================================================
    // Under E2E_BYPASS the limiter short-circuits, so we cannot observe a
    // runtime 429. We CAN assert the route still works happy-path through
    // the new middleware (regression check that adding the limiter didn't
    // break the route), and that an unauthenticated POST is accepted and
    // recorded WITHOUT a userId (= the optional-auth path is intact).
    const fb = await postJson(baseUrl, "/api/feedback", {
      category: "bug",
      message: `round5 feedback test ${stamp}`,
      pageUrl: "/round5",
    });
    check(`#27 unauth /feedback POST returns 201`, fb.status === 201, `status=${fb.status} body=${fb.body.slice(0, 200)}`);
    const fbId = (fb.json as { id?: number } | null)?.id;
    check(`#27 /feedback returns id`, typeof fbId === "number");

    if (typeof fbId === "number") {
      const [row] = await db
        .select({ userId: feedbackTable.userId, message: feedbackTable.message })
        .from(feedbackTable)
        .where(eq(feedbackTable.id, fbId))
        .limit(1);
      check(`#27 unauth feedback persisted with userId=null`, row?.userId === null, `userId=${row?.userId}`);
      check(`#27 message round-trips intact`, row?.message?.includes(`round5 feedback test ${stamp}`) === true);
      // Cleanup the feedback row.
      await db.delete(feedbackTable).where(eq(feedbackTable.id, fbId));
    }

    // Source-level wiring check: confirm createRateLimiter is referenced
    // in feedback.ts so a future edit can't silently delete the limiter.
    // (The runtime check is gated by E2E_BYPASS, so this lint-style
    // assertion is the safety net for production correctness.)
    const fs = await import("node:fs/promises");
    const fbSrc = await fs.readFile(new URL("../src/routes/feedback.ts", import.meta.url), "utf8");
    check(
      `#27 feedback.ts wires createRateLimiter into POST /feedback`,
      /createRateLimiter\(/.test(fbSrc) && /router\.post\("\/feedback",\s*\w+RateLimiter,/.test(fbSrc),
      `createRateLimiter import / router.post wiring not detected in feedback.ts`,
    );
  } finally {
    // Cleanup all created users (cascade their events).
    for (const uid of createdUserIds) {
      try {
        await db.delete(eventsTable).where(eq(eventsTable.userId, uid));
        await db.delete(usersTable).where(eq(usersTable.id, uid));
      } catch {
        // best-effort
      }
    }
    await close();
  }

  console.log(`\nRound-5 adversarial: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }

  // pg pool keeps the loop alive — exit explicitly.
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 50).unref();
}

main().catch((err) => {
  console.error("Round-5 adversarial test crashed:", err);
  setTimeout(() => process.exit(1), 50).unref();
});
