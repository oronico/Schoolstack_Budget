// Round-3 adversarial-audit regressions.
//
// Covers three independent bugs that the round-2 fixes did NOT address
// because they lived on parallel surfaces (feedback / errors / public
// timing / forgot-password) that the round-2 tests didn't probe:
//
//   #15  Stale-token bypass on /api/feedback and /api/errors/report
//        — both routes had their *own* JWT decoders that skipped the
//        tokenVersion + DB-existence checks. Logging out (which bumps
//        usersTable.tokenVersion) did NOT revoke the user's ability to
//        post feedback / error reports under their identity, and a
//        legacy-shape token signed for a non-existent userId was
//        cheerfully accepted as "anonymous" attribution that any real
//        backfill would have de-anonymized.
//
//   #17  /auth/forgot-password user-enumeration oracle — when the
//        mailer was unconfigured the route returned 503 ONLY for
//        existing users (and 200 for unknown emails), turning every
//        outage into a public account-existence probe.
//
//   #19  /public/timing accepted unbounded strings into events.metadata
//        and silently let Infinity / NaN / negative durations into
//        analytics, where they corrupted aggregations and let an
//        unauth attacker inflate the events table.

import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { db, feedbackTable, errorLogsTable, usersTable, eventsTable } from "@workspace/db";
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

async function main() {
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    console.error("JWT_SECRET must be set");
    process.exitCode = 1;
    return;
  }
  const { baseUrl, close } = await startServer();
  try {
    // ─── Setup: register a real user. ─────────────────────────────────
    // Task #527: /auth/register no longer returns a token directly — it's
    // now a confirm-by-email flow. Use the helper that drives both the
    // 202 register response and /auth/verify-email (via _devToken).
    const email = `round3-test-${Date.now()}@example.com`;
    const { token: validToken, user } = await registerAndVerify(baseUrl, {
      email, password: "Password123!", name: "Round3 Tester",
    });
    const userId = user.id;

    // ─── #15a  /api/feedback honors the strict auth decoder. ──────────
    // Bump tokenVersion in the DB to simulate "user logged out".
    await db.update(usersTable).set({ tokenVersion: 99 }).where(eq(usersTable.id, userId));

    const fbStale = await postJson(baseUrl, "/api/feedback", {
      category: "bug",
      message: "round3 stale-token feedback",
    }, validToken);
    check(
      "#15 /api/feedback accepts request with stale token",
      fbStale.status === 200 || fbStale.status === 201,
      `got ${fbStale.status}: ${fbStale.body.slice(0, 200)}`,
    );

    // The row should exist BUT must be attributed to NULL (anonymous),
    // not to the user whose token was already revoked.
    const fbRows = await db
      .select()
      .from(feedbackTable)
      .where(eq(feedbackTable.message, "round3 stale-token feedback"))
      .limit(1);
    check("#15 /api/feedback wrote a row", fbRows.length === 1);
    if (fbRows.length === 1) {
      check(
        "#15 /api/feedback row is NOT attributed to the revoked user",
        fbRows[0]!.userId === null,
        `userId was ${fbRows[0]!.userId}, expected null`,
      );
    }

    // Ghost-user legacy-shape token (no tokenVersion claim, fake userId).
    // Pre-fix: was accepted by feedback's optional decoder and would have
    // been written as userId=999_999_999.
    const ghostToken = jwt.sign({ userId: 999_999_999 }, SECRET, { expiresIn: "1d" });
    const fbGhost = await postJson(baseUrl, "/api/feedback", {
      category: "bug",
      message: "round3 ghost-token feedback",
    }, ghostToken);
    check(
      "#15 /api/feedback accepts request with ghost-user token",
      fbGhost.status === 200 || fbGhost.status === 201,
      `got ${fbGhost.status}`,
    );
    const fbGhostRows = await db
      .select()
      .from(feedbackTable)
      .where(eq(feedbackTable.message, "round3 ghost-token feedback"))
      .limit(1);
    check(
      "#15 /api/feedback ghost row is NOT attributed to the fake userId",
      fbGhostRows.length === 1 && fbGhostRows[0]!.userId === null,
      `userId was ${fbGhostRows[0]?.userId}`,
    );

    // ─── #15b  /api/errors/report honors the strict auth decoder. ─────
    const errStale = await postJson(baseUrl, "/api/errors/report", {
      message: "round3-stale-error-report",
      url: "https://example.test/page",
      userAgent: "test-agent",
    }, validToken);
    check(
      "#15 /api/errors/report accepts stale-token request",
      errStale.status === 200,
      `got ${errStale.status}: ${errStale.body.slice(0, 200)}`,
    );
    const errRows = await db
      .select()
      .from(errorLogsTable)
      .where(eq(errorLogsTable.errorMessage, "round3-stale-error-report"))
      .limit(1);
    check("#15 /api/errors/report wrote a row", errRows.length === 1);
    if (errRows.length === 1) {
      check(
        "#15 /api/errors/report row is NOT attributed to the revoked user",
        errRows[0]!.userId === null,
        `userId was ${errRows[0]!.userId}`,
      );
    }

    const errGhost = await postJson(baseUrl, "/api/errors/report", {
      message: "round3-ghost-error-report",
    }, ghostToken);
    check("#15 /api/errors/report accepts ghost-user request", errGhost.status === 200);
    const errGhostRows = await db
      .select()
      .from(errorLogsTable)
      .where(eq(errorLogsTable.errorMessage, "round3-ghost-error-report"))
      .limit(1);
    check(
      "#15 /api/errors/report ghost row is NOT attributed to fake userId",
      errGhostRows.length === 1 && errGhostRows[0]!.userId === null,
      `userId was ${errGhostRows[0]?.userId}`,
    );

    // ─── #17  /auth/forgot-password is no longer a user-enumeration oracle.
    // The api-server runs without EMAIL_FROM in the test env, so the
    // mailer returns success=false. Pre-fix this surfaced as a 503 ONLY
    // for the existing user, leaking account existence; post-fix BOTH
    // arms must return 200 with the same generic message.
    const fpExisting = await postJson(baseUrl, "/api/auth/forgot-password", { email });
    const fpUnknown  = await postJson(baseUrl, "/api/auth/forgot-password", {
      email: `nobody-${Date.now()}@example.invalid`,
    });
    check(
      "#17 forgot-password returns 200 for existing email even when mailer fails",
      fpExisting.status === 200,
      `got ${fpExisting.status}: ${fpExisting.body.slice(0, 200)}`,
    );
    check(
      "#17 forgot-password returns 200 for unknown email",
      fpUnknown.status === 200,
      `got ${fpUnknown.status}`,
    );
    check(
      "#17 forgot-password response body is identical for both arms (no oracle)",
      fpExisting.body === fpUnknown.body,
      `existing=${fpExisting.body.slice(0, 80)} unknown=${fpUnknown.body.slice(0, 80)}`,
    );

    // ─── #19  /public/timing bounds every field. ──────────────────────
    const big = "x".repeat(5000);
    const sessionId = `round3-timing-${Date.now()}`;
    const okResp = await postJson(baseUrl, "/api/public/timing", {
      step: 2,
      stepName: big,           // must be capped, not stored verbatim
      durationSeconds: 12.7,
      sessionId,
      wizard: big,
    });
    check("#19 timing accepts well-formed (oversized) payload", okResp.status === 200,
      `got ${okResp.status}: ${okResp.body.slice(0, 120)}`);

    const evRows = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventName, "wizard_step_timing"))
      .orderBy(desc(eventsTable.createdAt))
      .limit(20);
    const ours = evRows.find((r) => {
      const m = r.metadata as { sessionId?: unknown } | null;
      return typeof m?.sessionId === "string" && m.sessionId.startsWith("round3-timing-");
    });
    check("#19 timing event was recorded", !!ours);
    if (ours) {
      const m = ours.metadata as Record<string, unknown>;
      check("#19 stepName is capped to <=64 chars",
        typeof m.stepName === "string" && (m.stepName as string).length <= 64,
        `length was ${typeof m.stepName === "string" ? (m.stepName as string).length : "n/a"}`);
      check("#19 wizard is capped to <=64 chars",
        typeof m.wizard === "string" && (m.wizard as string).length <= 64,
        `length was ${typeof m.wizard === "string" ? (m.wizard as string).length : "n/a"}`);
      check("#19 durationSeconds is finite integer",
        typeof m.durationSeconds === "number" && Number.isFinite(m.durationSeconds),
        `got ${String(m.durationSeconds)}`);
    }

    // Reject Infinity / NaN / negative.
    for (const bad of [Infinity, -Infinity, NaN, -1, -0.0001]) {
      const r = await postJson(baseUrl, "/api/public/timing", {
        step: 1, stepName: "a", durationSeconds: bad, sessionId: "x", wizard: "p",
      });
      check(`#19 timing rejects durationSeconds=${String(bad)}`, r.status === 400,
        `got ${r.status}`);
    }
    for (const bad of [Infinity, NaN, -1, 1.5, 999, 2_000_000_000]) {
      const r = await postJson(baseUrl, "/api/public/timing", {
        step: bad, stepName: "a", durationSeconds: 1, sessionId: "x", wizard: "p",
      });
      check(`#19 timing rejects step=${String(bad)}`, r.status === 400,
        `got ${r.status}`);
    }

    // Reset the user's tokenVersion so we don't leave the row in a
    // weird state that could trip an unrelated test reading the same
    // user later.
    await db.update(usersTable).set({ tokenVersion: 0 }).where(eq(usersTable.id, userId));
  } finally {
    await close();
  }

  console.log(`Round-3 adversarial tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exitCode = 1;
  }
  // pg pool keeps the loop alive; allow flush then exit explicitly.
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 50).unref();
}

void main();
