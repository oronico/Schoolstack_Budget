// Round-2 adversarial-audit regression — /api/models input fragility.
//
// Three classes of bugs were uncovered:
//   A. modelId path-param: zod.coerce.number() accepts "1.5", "1e10",
//      "9999999999999999999". Drizzle then bound those to an int4 column
//      and Postgres threw, so the route returned 500 + persisted to
//      error_logs. The fix adds an isValidModelId() guard at every
//      params.data.id site.
//   B. NUL byte in `name` field: Postgres TEXT columns reject \x00,
//      raising "invalid byte sequence for encoding UTF8" — caught by the
//      route's catch block as a 500 + error_logs noise. The fix
//      sanitizes control bytes from the name on POST/PUT.
//   C. Lost-update race on PUT /models/:id: simultaneous PUTs all
//      returned 200 and silently dropped all but one writer's data.
//      The fix adds an optimistic-concurrency check (existing.updatedAt
//      in the WHERE clause) that returns 409 on conflict.

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
    // Register a user to exercise the auth-required routes.
    const email = `model-input-test-${Date.now()}@example.com`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Password123!", name: "Input Tester" }),
    });
    if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
    const { token, user } = (await reg.json()) as { token: string; user: { id: number } };
    userId = user.id;
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // --- A. Bogus modelId path-params → 400, NOT 500. ---
    for (const id of ["1.5", "1e10", "9999999999999999999", "-1", "0", "0.0001"]) {
      const r = await fetch(`${baseUrl}/api/models/${id}`, { headers: auth });
      check(`GET /api/models/${id} → 400 (was 500 pre-fix)`, r.status === 400,
        `got ${r.status}`);
    }
    // Non-numeric still 400 (Zod rejects).
    const nonNumeric = await fetch(`${baseUrl}/api/models/abc`, { headers: auth });
    check("GET /api/models/abc → 400", nonNumeric.status === 400);

    // Same for PUT, DELETE, duplicate, archive — every modelId-bearing
    // route was patched at the same site.
    const putBogus = await fetch(`${baseUrl}/api/models/1.5`, {
      method: "PUT", headers: auth, body: JSON.stringify({ name: "x", data: {} }),
    });
    check("PUT /api/models/1.5 → 400", putBogus.status === 400, `got ${putBogus.status}`);
    const delBogus = await fetch(`${baseUrl}/api/models/9999999999999999999`, {
      method: "DELETE", headers: auth,
    });
    check("DELETE /api/models/<overflow> → 400", delBogus.status === 400, `got ${delBogus.status}`);

    // The PDF export route nested under POST /models/:id/export/... was
    // initially missed by the bulk-rewrite (different indentation form,
    // so the find/replace pattern didn't match). Cover every variant of
    // the export endpoints explicitly so a future regression at any one
    // of them surfaces here.
    const exportPaths = [
      "/api/models/1.5/export/decision-comparison-pdf",
      "/api/models/1e10/export/decision-comparison-pdf",
      "/api/models/9999999999999999999/export/decision-comparison-pdf",
      "/api/models/-1/export/decision-comparison-pdf",
    ];
    for (const p of exportPaths) {
      const r = await fetch(`${baseUrl}${p}`, { method: "POST", headers: auth, body: "{}" });
      check(`POST ${p} → 400 (was 500 pre-fix)`, r.status === 400, `got ${r.status}`);
    }

    // --- B. NUL byte in `name` → 201 with the NUL stripped, NOT 500. ---
    const nameWithNul = "Headquarters\x00\x01\x02 — Model A";
    const createNul = await fetch(`${baseUrl}/api/models`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ name: nameWithNul, data: {} }),
    });
    check("POST /api/models with NUL byte in name → 201 (was 500 pre-fix)",
      createNul.status === 201, `got ${createNul.status}: ${(await createNul.clone().text()).slice(0,200)}`);
    const createdNul = (await createNul.json()) as { id: number; name: string };
    check("control bytes are stripped from the stored name",
      !/[\u0000-\u001F\u007F]/.test(createdNul.name),
      `stored name=${JSON.stringify(createdNul.name)}`);
    check("non-control characters in the name survive sanitization",
      createdNul.name.includes("Headquarters") && createdNul.name.includes("Model A"),
      `stored name=${JSON.stringify(createdNul.name)}`);

    // Whitespace-only / all-control name → 400 (sanitized to empty).
    const allControl = await fetch(`${baseUrl}/api/models`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ name: "\x00\x01\x02   ", data: {} }),
    });
    check("name that sanitizes to empty → 400", allControl.status === 400,
      `got ${allControl.status}`);

    // --- C. Sequential PUTs against the same model all succeed.
    // (The optimistic-concurrency check originally added here was
    // reverted — see the NOTE in routes/models.ts. The frontend
    // legitimately fires rapid back-to-back PUTs as part of its
    // debounced-autosave-plus-explicit-save flow, and a 409 on the
    // second commit broke real user journeys covered by the e2e
    // suite. We still want to assert the route doesn't 500 or
    // silently drop sequential writes, and that the LAST commit wins.)
    const seed = await fetch(`${baseUrl}/api/models`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ name: "Race Seed", data: { counter: 0 } }),
    });
    const seedModel = (await seed.json()) as { id: number };
    const N = 5;
    const sequentialResults: number[] = [];
    for (let i = 0; i < N; i++) {
      const r = await fetch(`${baseUrl}/api/models/${seedModel.id}`, {
        method: "PUT", headers: auth,
        body: JSON.stringify({ name: `Sequential #${i}`, data: { counter: i, marker: `writer-${i}` } }),
      });
      sequentialResults.push(r.status);
    }
    check(`all ${N} sequential PUTs succeed`,
      sequentialResults.every((s) => s === 200),
      `statuses=${sequentialResults.join(",")}`);
    const final = await fetch(`${baseUrl}/api/models/${seedModel.id}`, { headers: auth });
    const finalJson = (await final.json()) as { data: { counter?: number; marker?: string } };
    check("the LAST sequential PUT's data is what's stored",
      finalJson.data?.counter === N - 1 && finalJson.data?.marker === `writer-${N - 1}`,
      `final.data=${JSON.stringify(finalJson.data)}`);
  } finally {
    if (userId !== null) {
      await db.delete(financialModelsTable).where(eq(financialModelsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
    await close();
  }

  console.log(`\nModel input validation tests: ${passed} passed, ${failed} failed`);
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
