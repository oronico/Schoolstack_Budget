// Task #472 — Model API validation + concurrency hardening regression.
//
// Six classes of bugs were closed:
//   1. PUT /models/:id had no optimistic-concurrency check → two open
//      tabs could silently clobber each other. Now header-only If-Match
//      against the row's updatedAt ETag returns 409 on mismatch.
//   2. POST /models/:id/request-review accepted "not-an-email" with a
//      regex check; the mailer then 500'd. Now Zod email → clean 400.
//   3. POST /public/request-review same — Zod email → 400.
//   4. PATCH/PUT /models/:id let through maxCapacity=0, collectionRate
//      out of [0,100], and negative cash/revenue snapshot fields. Now
//      server-side hardening returns 400.
//   5. POST /public/export-single-year now gates on
//      schoolProfile.modelDuration === "single_year" → 400 otherwise.
//   6. Wizard schema caps revenueRowSchema.collectionRate to [0,100]
//      (asserted indirectly via the server hardening checks; the
//      schema-level cap protects the form before submit).

import http from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@workspace/db";
import { usersTable, financialModelsTable } from "@workspace/db/schema";
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

async function main(): Promise<void> {
  const { baseUrl, close } = await startServer();
  let userId: number | null = null;
  try {
    const email = `model-api-hardening-${Date.now()}@example.com`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Password123!", name: "Hardening Tester" }),
    });
    if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
    const { token, user } = (await reg.json()) as { token: string; user: { id: number } };
    userId = user.id;
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Seed a model we can mutate across all the hardening checks.
    const seed = await fetch(`${baseUrl}/api/models`, {
      method: "POST", headers: auth,
      body: JSON.stringify({
        name: "Hardening Seed",
        data: { schoolProfile: { schoolName: "Test", maxCapacity: 100, modelDuration: "five_year" } },
      }),
    });
    const seedModel = (await seed.json()) as { id: number };

    // === 1. Optimistic concurrency via If-Match. ===
    // Baseline GET emits an ETag the client can echo back.
    const getResp = await fetch(`${baseUrl}/api/models/${seedModel.id}`, { headers: auth });
    const etag = getResp.headers.get("etag");
    check("GET /api/models/:id sets ETag header", !!etag, `etag=${etag}`);

    // PUT without If-Match → still 200 (legacy autosave path).
    const putNoIfMatch = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ name: "No If-Match", data: { v: 1 } }),
    });
    check("PUT without If-Match still 200 (legacy compat)", putNoIfMatch.status === 200,
      `got ${putNoIfMatch.status}`);
    const newEtag = putNoIfMatch.headers.get("etag");
    check("PUT response sets ETag header", !!newEtag, `etag=${newEtag}`);

    // PUT with stale If-Match → 409.
    const putStale = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT",
      headers: { ...auth, "If-Match": etag! },
      body: JSON.stringify({ name: "Stale If-Match", data: { v: 2 } }),
    });
    check("PUT with stale If-Match → 409", putStale.status === 409, `got ${putStale.status}`);
    const conflictBody = (await putStale.json()) as { code?: string; currentVersion?: string };
    check("409 body has code=version_conflict", conflictBody.code === "version_conflict");
    check("409 body surfaces the current server version", !!conflictBody.currentVersion);

    // PUT with fresh If-Match → 200.
    const putFresh = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT",
      headers: { ...auth, "If-Match": newEtag! },
      body: JSON.stringify({ name: "Fresh If-Match", data: { v: 3 } }),
    });
    check("PUT with matching If-Match → 200", putFresh.status === 200, `got ${putFresh.status}`);

    // === 4. Server-side hardening rejects bogus values. ===
    const badCap = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Bad cap", data: { schoolProfile: { schoolName: "T", maxCapacity: 0 } },
      }),
    });
    check("PUT maxCapacity=0 → 400", badCap.status === 400, `got ${badCap.status}`);

    const badNegCap = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Neg cap", data: { schoolProfile: { schoolName: "T", maxCapacity: -5 } },
      }),
    });
    check("PUT maxCapacity=-5 → 400", badNegCap.status === 400, `got ${badNegCap.status}`);

    // Fully-formed revenueRow so the only thing the route can reject
    // is the out-of-range collectionRate (proves the hardening fires).
    const wellFormedRow = (rate: number) => ({
      id: "r1", category: "tuition_and_fees", lineItem: "Tuition",
      enabled: true, driverType: "annual_fixed" as const, amounts: [10000],
      collectionRate: rate,
    });
    const badRate = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ name: "Bad rate", data: { revenueRows: [wellFormedRow(150)] } }),
    });
    check("PUT revenueRows[].collectionRate=150 → 400 (hardening)",
      badRate.status === 400, `got ${badRate.status}`);

    const negRate = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ name: "Neg rate", data: { revenueRows: [wellFormedRow(-1)] } }),
    });
    check("PUT revenueRows[].collectionRate=-1 → 400 (hardening)",
      negRate.status === 400, `got ${negRate.status}`);

    const negCash = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Neg cash", data: { currentYearProjection: { currentCash: -100 } },
      }),
    });
    check("PUT currentYearProjection.currentCash=-100 → 400", negCash.status === 400,
      `got ${negCash.status}`);

    const negProjRev = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Neg rev", data: { currentYearProjection: { projectedRevenue: -1 } },
      }),
    });
    check("PUT currentYearProjection.projectedRevenue=-1 → 400", negProjRev.status === 400,
      `got ${negProjRev.status}`);

    const negSnapshot = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Neg snap", data: { priorYearSnapshot: { endingCash: -50 } },
      }),
    });
    check("PUT priorYearSnapshot.endingCash=-50 → 400", negSnapshot.status === 400,
      `got ${negSnapshot.status}`);

    // Valid edge values still pass.
    const okEdge = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "OK edge",
        data: {
          schoolProfile: { schoolName: "T", maxCapacity: 1, modelDuration: "five_year" },
          revenueRows: [
            { id: "r1", category: "tuition_and_fees", lineItem: "Tuition",
              enabled: true, driverType: "annual_fixed", amounts: [1000], collectionRate: 0 },
            { id: "r2", category: "philanthropy", lineItem: "Donations",
              enabled: true, driverType: "annual_fixed", amounts: [500], collectionRate: 100 },
          ],
          currentYearProjection: { currentCash: 0, projectedRevenue: 0 },
          priorYearSnapshot: { endingCash: 0 },
        },
      }),
    });
    check("PUT with edge-valid values → 200", okEdge.status === 200, `got ${okEdge.status}`);

    // === 4b. modelDuration is one-way: five_year → single_year is forbidden. ===
    // The seed model was created with modelDuration: five_year. Trying to
    // PUT it back to single_year must 400 with code=duration_downgrade_forbidden.
    const downgrade = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Downgrade attempt",
        data: { schoolProfile: { schoolName: "T", modelDuration: "single_year" } },
      }),
    });
    check("PUT five_year → single_year → 400", downgrade.status === 400,
      `got ${downgrade.status}`);
    if (downgrade.status === 400) {
      const body = (await downgrade.json()) as { code?: string };
      check("downgrade 400 body has code=duration_downgrade_forbidden",
        body.code === "duration_downgrade_forbidden", `code=${body.code}`);
    }

    // PUT that omits modelDuration entirely against a five_year row → 200
    // (the guard only fires when the incoming value is literally
    // "single_year", so legacy partial saves that don't carry the field
    // are unaffected).
    const omitDuration = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "No duration",
        data: { schoolProfile: { schoolName: "T" } },
      }),
    });
    check("PUT that omits modelDuration on a five_year row → 200",
      omitDuration.status === 200, `got ${omitDuration.status}`);

    // PUT five_year → five_year (no-op duration) → 200.
    const sameDuration = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Same duration",
        data: { schoolProfile: { schoolName: "T", modelDuration: "five_year" } },
      }),
    });
    check("PUT five_year → five_year → 200", sameDuration.status === 200,
      `got ${sameDuration.status}`);

    // Companion: a fresh single_year model should be allowed to PUT
    // modelDuration: five_year (the documented Extend-to-5-year flow).
    const singleSeed = await fetch(`${baseUrl}/api/models`, {
      method: "POST", headers: auth,
      body: JSON.stringify({
        name: "Single Seed",
        data: { schoolProfile: { schoolName: "T", maxCapacity: 100, modelDuration: "single_year" } },
      }),
    });
    const singleSeedModel = (await singleSeed.json()) as { id: number };
    const upgrade = await fetch(`${baseUrl}/api/models/${singleSeedModel.id}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({
        name: "Upgrade",
        data: { schoolProfile: { schoolName: "T", maxCapacity: 100, modelDuration: "five_year" } },
      }),
    });
    check("PUT single_year → five_year (Extend flow) → 200",
      upgrade.status === 200, `got ${upgrade.status}`);

    // === 2. Authenticated request-review email validation. ===
    // Note: returns 503 unless RESEND is configured. The validation
    // step runs before the mailer, so we still observe a 400 for bad
    // emails when email is configured. When it isn't, this assertion
    // is a no-op.
    const badEmailAuth = await fetch(`${baseUrl}/api/models/${seedModel.id}/request-review`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ name: "Test", email: "not-an-email", message: "hi" }),
    });
    check("POST /models/:id/request-review with bad email → 400 (validation runs before email-config gate)",
      badEmailAuth.status === 400, `got ${badEmailAuth.status}`);
    const badEmailAuthBody = (await badEmailAuth.json()) as { code?: string };
    check("auth review-request 400 body has code=invalid_email",
      badEmailAuthBody.code === "invalid_email", `code=${badEmailAuthBody.code}`);

    // === 3. Public request-review email validation. ===
    const badEmailPublic = await fetch(`${baseUrl}/api/public/request-review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test", email: "still-not-an-email",
        modelData: { schoolProfile: { schoolName: "T" } },
      }),
    });
    check("POST /public/request-review with bad email → 400 (validation runs before email-config gate)",
      badEmailPublic.status === 400, `got ${badEmailPublic.status}`);
    const badEmailPublicBody = (await badEmailPublic.json()) as { code?: string };
    check("public review-request 400 body has code=invalid_email",
      badEmailPublicBody.code === "invalid_email", `code=${badEmailPublicBody.code}`);

    // === 5. /public/export-single-year gated by modelDuration. ===
    const wrongDuration = await fetch(`${baseUrl}/api/public/export-single-year`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolProfile: { schoolName: "T", modelDuration: "five_year" },
      }),
    });
    check("POST /public/export-single-year with five_year → 400",
      wrongDuration.status === 400, `got ${wrongDuration.status}`);
    if (wrongDuration.status === 400) {
      const body = (await wrongDuration.json()) as { code?: string };
      check("wrong-duration 400 body has code=wrong_model_duration",
        body.code === "wrong_model_duration", `code=${body.code}`);
    }

    // Missing modelDuration also → 400 (defaults are not single_year).
    const missingDuration = await fetch(`${baseUrl}/api/public/export-single-year`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolProfile: { schoolName: "T" } }),
    });
    check("POST /public/export-single-year without modelDuration → 400",
      missingDuration.status === 400, `got ${missingDuration.status}`);
  } finally {
    if (userId !== null) {
      await db.delete(financialModelsTable).where(eq(financialModelsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
    await close();
  }

  console.log(`\nModel API hardening tests: ${passed} passed, ${failed} failed`);
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
