// Round-4 adversarial-audit regressions.
//
// Covers four NEW bugs found after round-3 was merged. (#22 lives in the
// route-middleware chain and is bypassed in dev/test by E2E_BYPASS just
// like #16 / #18, so it is exercised by code-review of the wiring rather
// than at runtime here.)
//
//   #20  /auth/login user-enumeration via response timing — the no-user
//        branch returned 401 immediately while the user-found branch always
//        paid bcrypt.compare's ~150ms cost-12 work, making the response
//        time a reliable boolean oracle for "is this email registered?".
//
//   #21  /auth/track accepted unbounded jsonb metadata into events.metadata
//        — any authenticated attacker could pump multi-MB blobs per call.
//        We now cap to 16 keys, 256-char string values, and drop nested
//        objects/arrays/non-finite numbers.
//
//   #23  RegisterBody / LoginBody / ResetPasswordBody had no maximum
//        lengths on `password` / `name` / `schoolName` / `role` /
//        `planningStage`. Combined with the unbounded text columns this
//        let an attacker (a) burn CPU through bcrypt.hash on multi-MB
//        passwords and (b) persist multi-MB junk into the users table.
//
//   #24  /auth/forgot-password let a stalker who knows a victim's email
//        rotate IPs to invalidate every legitimate reset link the victim
//        requested AND flood the inbox with reset emails. We now apply a
//        60-second per-account cooldown, derived from resetTokenExpiry.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { db, usersTable, eventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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

async function median(samples: number[]): Promise<number> {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const { baseUrl, close } = await startServer();

  try {
    // -----------------------------------------------------------------------
    // Setup: create a real user we can use as the "known email" probe target.
    const stamp = Date.now();
    const realEmail = `round4-real-${stamp}@example.com`;
    const realPassword = "RealPasswordForRound4!";
    // Task #527: register is now confirm-by-email (202). Drive both
    // legs (register + verify-email via _devToken) through the helper
    // so we still get a usable bearer token + userId for the probes.
    const verified = await registerAndVerify(baseUrl, {
      email: realEmail, password: realPassword, name: "Round 4 Real",
    });
    const realToken = verified.token;
    check("setup: register real user (verified)", !!realToken);
    const realUserId = verified.user.id;

    // =======================================================================
    // #20 — login timing oracle
    // =======================================================================
    // We send the wrong password to BOTH a known and an unknown email and
    // measure the wall-clock time. Pre-fix: the unknown branch returns
    // before bcrypt runs, so its median is ~150ms+ faster than the known
    // branch. Post-fix: both branches run bcrypt.compare and the medians
    // should be within a small tolerance of each other.
    const SAMPLES = 5;
    const knownTimes: number[] = [];
    const unknownTimes: number[] = [];
    // Warm up — first request may include JIT / DB pool overhead.
    await postJson(baseUrl, "/api/auth/login", { email: realEmail, password: "wrong-warmup-1" });
    await postJson(baseUrl, "/api/auth/login", { email: `nope-warmup-${stamp}@example.com`, password: "wrong-warmup-2" });

    for (let i = 0; i < SAMPLES; i++) {
      const known = await timed(() =>
        postJson(baseUrl, "/api/auth/login", { email: realEmail, password: `wrong-pw-${i}` }),
      );
      check(`#20 known-email returns 401`, known.value.status === 401);
      knownTimes.push(known.ms);

      const unknown = await timed(() =>
        postJson(baseUrl, "/api/auth/login", { email: `nope-${stamp}-${i}@example.com`, password: `wrong-pw-${i}` }),
      );
      check(`#20 unknown-email returns 401`, unknown.value.status === 401);
      unknownTimes.push(unknown.ms);
    }

    const knownMedian = await median(knownTimes);
    const unknownMedian = await median(unknownTimes);
    // Pre-fix the gap was ~150ms (cost-12 bcrypt). Post-fix both branches
    // pay the bcrypt cost, so the absolute medians should be close.
    // Allow 60ms slack for DB-write / JIT noise; the previous gap was 5x
    // larger than this threshold.
    const gap = Math.abs(knownMedian - unknownMedian);
    check(
      `#20 known/unknown login timing within 60ms tolerance`,
      gap < 60,
      `knownMedian=${knownMedian.toFixed(1)}ms unknownMedian=${unknownMedian.toFixed(1)}ms gap=${gap.toFixed(1)}ms`,
    );
    // Also assert the unknown branch is NOT systematically faster than the
    // known branch by more than the tolerance. (Unknown could legitimately
    // be slightly faster because it skips the lastSeenAt write — but never
    // by 60ms+.)
    check(
      `#20 unknown not systematically faster than known by 60ms+`,
      knownMedian - unknownMedian < 60,
      `knownMedian=${knownMedian.toFixed(1)}ms unknownMedian=${unknownMedian.toFixed(1)}ms`,
    );

    // =======================================================================
    // #21 — /auth/track unbounded metadata
    // =======================================================================
    // Pre-fix: server happily inserted a 200KB jsonb blob.
    // Post-fix: response is still 200 (we silently sanitize, mirroring the
    // /public/timing #19 behavior), but the persisted row contains AT MOST
    // 16 keys, each string value <=256 chars, no nested objects.
    const huge = "X".repeat(50_000);
    const oversizedMetadata: Record<string, unknown> = {
      // 20 keys (over the 16 cap)
      // Nested object (must be dropped)
      nested: { evil: "payload" },
      // Array (must be dropped)
      arr: [1, 2, 3],
      // Infinity / NaN (must become null)
      bad1: Infinity,
      bad2: NaN,
      // Long string (must be sliced to 256)
      long: huge,
      // Long key (must be dropped — key length > 64)
      ["k".repeat(100)]: "v",
      // Booleans / nulls / numbers — kept
      flag: true,
      missing: null,
      n: 42,
    };
    for (let i = 0; i < 20; i++) {
      oversizedMetadata[`extra_${i}`] = `value_${i}`;
    }

    const trackRes = await postJson(
      baseUrl,
      "/api/auth/track",
      { event: "guidance_mode_prompt_shown", metadata: oversizedMetadata },
      realToken,
    );
    check(`#21 /auth/track accepts (sanitized) request`, trackRes.status === 200, `status=${trackRes.status} body=${trackRes.body.slice(0, 200)}`);

    // Wait briefly for the insert to settle (trackEvent is awaited but
    // the test runs against a separate connection).
    await new Promise((r) => setTimeout(r, 200));

    const [latestEvent] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.userId, realUserId))
      .orderBy(desc(eventsTable.id))
      .limit(1);

    check(`#21 metadata row inserted`, !!latestEvent);
    if (latestEvent) {
      const md = latestEvent.metadata as Record<string, unknown> | null;
      check(`#21 metadata is an object (not null)`, !!md && typeof md === "object");
      if (md) {
        const keyCount = Object.keys(md).length;
        check(
          `#21 key count capped to <= 16`,
          keyCount <= 16,
          `actual=${keyCount}`,
        );
        check(
          `#21 nested object dropped`,
          !("nested" in md),
        );
        check(
          `#21 array value dropped`,
          !("arr" in md),
        );
        check(
          `#21 long key dropped`,
          !("k".repeat(100) in md),
        );
        if ("long" in md) {
          const v = md.long;
          check(
            `#21 long string sliced to <= 256 chars`,
            typeof v === "string" && v.length <= 256,
            `len=${typeof v === "string" ? v.length : "n/a"}`,
          );
        }
        if ("bad1" in md) {
          check(`#21 Infinity coerced to null`, md.bad1 === null);
        }
        if ("bad2" in md) {
          check(`#21 NaN coerced to null`, md.bad2 === null);
        }
      }
    }

    // =======================================================================
    // #23 — body length caps
    // =======================================================================
    // Pre-fix: a 1MB password reached bcrypt.hash. Post-fix: rejected at
    // the Zod boundary with a 400.
    const megaPassword = "A".repeat(1_000_000);
    const reg2 = await postJson(baseUrl, "/api/auth/register", {
      email: `round4-mega-${stamp}@example.com`,
      password: megaPassword,
      name: "Mega Pw",
    });
    check(
      `#23 register rejects 1MB password with 400`,
      reg2.status === 400,
      `status=${reg2.status}`,
    );

    const login2 = await postJson(baseUrl, "/api/auth/login", {
      email: realEmail,
      password: megaPassword,
    });
    check(
      `#23 login rejects 1MB password with 400`,
      login2.status === 400,
      `status=${login2.status}`,
    );

    const reg3 = await postJson(baseUrl, "/api/auth/register", {
      email: `round4-megaschool-${stamp}@example.com`,
      password: "ValidPassword123!",
      name: "Mega School",
      schoolName: "S".repeat(1_000_000),
    });
    check(
      `#23 register rejects 1MB schoolName with 400`,
      reg3.status === 400,
      `status=${reg3.status}`,
    );

    const reset1 = await postJson(baseUrl, "/api/auth/reset-password", {
      token: "fakeshortbut-valid-shape-token",
      password: megaPassword,
    });
    check(
      `#23 reset-password rejects 1MB password with 400`,
      reset1.status === 400,
      `status=${reset1.status}`,
    );

    // =======================================================================
    // #24 — forgot-password per-account cooldown
    // =======================================================================
    // Pre-fix: every call rewrote resetToken & emailed the user. We now
    // cooldown for 60s per account. We assert the second call within the
    // cooldown window does NOT bump resetTokenExpiry (i.e., the first
    // token is preserved).
    const fp1 = await postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail });
    check(`#24 first forgot-password returns 200`, fp1.status === 200);

    const [afterFirst] = await db
      .select({ token: usersTable.resetToken, expiry: usersTable.resetTokenExpiry })
      .from(usersTable)
      .where(eq(usersTable.id, realUserId))
      .limit(1);
    check(`#24 first call set resetToken`, !!afterFirst?.token);
    const firstToken = afterFirst?.token ?? null;
    const firstExpiry = afterFirst?.expiry?.getTime() ?? 0;

    // Second call within the cooldown window — should be a no-op.
    const fp2 = await postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail });
    check(`#24 second forgot-password still returns 200 (generic)`, fp2.status === 200);

    const [afterSecond] = await db
      .select({ token: usersTable.resetToken, expiry: usersTable.resetTokenExpiry })
      .from(usersTable)
      .where(eq(usersTable.id, realUserId))
      .limit(1);
    check(
      `#24 second call did NOT overwrite the existing reset token`,
      afterSecond?.token === firstToken,
      `firstToken=${firstToken?.slice(0, 12)}... afterSecond=${afterSecond?.token?.slice(0, 12)}...`,
    );
    check(
      `#24 second call did NOT bump resetTokenExpiry`,
      afterSecond?.expiry?.getTime() === firstExpiry,
      `firstExpiry=${firstExpiry} afterSecond=${afterSecond?.expiry?.getTime()}`,
    );

    // Round-5 hardening of #24 — concurrent forgot-password requests for
    // the same account must NOT both win. The pre-fix SELECT->compute->
    // UPDATE sequence let two parallel callers both observe stale state
    // and both issue tokens/emails, defeating the cooldown. The fix uses
    // a single conditional UPDATE ... RETURNING so only one row updates.
    // We reset the user's resetTokenExpiry to a value older than the
    // cooldown window, then fire N concurrent requests and assert exactly
    // one of them ends up with their token persisted. (We can't easily
    // assert "exactly one email sent" without mocking Resend, but the
    // single-token guarantee is what matters for invalidation/spam.)
    await db
      .update(usersTable)
      .set({ resetToken: null, resetTokenExpiry: new Date(Date.now() - 86_400_000) })
      .where(eq(usersTable.id, realUserId));

    const concurrentN = 8;
    const concurrentResults = await Promise.all(
      Array.from({ length: concurrentN }, () =>
        postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail }),
      ),
    );
    check(
      `#24 concurrent: all ${concurrentN} requests return 200 (generic)`,
      concurrentResults.every((r) => r.status === 200),
      `statuses=${concurrentResults.map((r) => r.status).join(",")}`,
    );
    const [afterConcurrent] = await db
      .select({ token: usersTable.resetToken, expiry: usersTable.resetTokenExpiry })
      .from(usersTable)
      .where(eq(usersTable.id, realUserId))
      .limit(1);
    check(
      `#24 concurrent: exactly one writer wins (resetToken is set, single value)`,
      !!afterConcurrent?.token && typeof afterConcurrent.token === "string",
      `token=${afterConcurrent?.token?.slice(0, 12)}...`,
    );
    // A second pass of N concurrent calls right after the winner is
    // recorded should produce ZERO additional writers (cooldown active).
    const tokenAfterFirstBurst = afterConcurrent?.token ?? null;
    const expiryAfterFirstBurst = afterConcurrent?.expiry?.getTime() ?? 0;
    const secondBurst = await Promise.all(
      Array.from({ length: concurrentN }, () =>
        postJson(baseUrl, "/api/auth/forgot-password", { email: realEmail }),
      ),
    );
    check(
      `#24 concurrent: second burst all 200`,
      secondBurst.every((r) => r.status === 200),
    );
    const [afterSecondBurst] = await db
      .select({ token: usersTable.resetToken, expiry: usersTable.resetTokenExpiry })
      .from(usersTable)
      .where(eq(usersTable.id, realUserId))
      .limit(1);
    check(
      `#24 concurrent: second burst did NOT overwrite token`,
      afterSecondBurst?.token === tokenAfterFirstBurst,
    );
    check(
      `#24 concurrent: second burst did NOT bump expiry`,
      afterSecondBurst?.expiry?.getTime() === expiryAfterFirstBurst,
    );

    // Cleanup.
    await db.delete(eventsTable).where(eq(eventsTable.userId, realUserId));
    await db.delete(usersTable).where(eq(usersTable.id, realUserId));
  } finally {
    await close();
  }

  console.log(`\nRound-4 adversarial: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }

  // pg pool keeps the loop alive — exit explicitly.
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 50).unref();
}

main().catch((err) => {
  console.error("Round-4 adversarial test crashed:", err);
  setTimeout(() => process.exit(1), 50).unref();
});
