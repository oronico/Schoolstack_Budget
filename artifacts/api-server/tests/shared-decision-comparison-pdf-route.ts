// Integration tests for the public share-link decision-comparison surfaces:
//
//   GET  /api/shared/:token
//   POST /api/shared/:token/export/decision-comparison-pdf
//
// These two routes are how a co-founder, advisor, or board chair who only has
// a /shared/<token> link (no account) reads a model and downloads the
// board-ready comparison PDF. They were validated end-to-end by hand and a
// one-off Playwright run, but there were no integration tests pinned in the
// repo — so changes to the share schema, decision-flow shape, or PDF
// validator could silently break the flow.
//
// Coverage:
//   GET  /shared/:token
//     - bad token format             → 400
//     - unknown token                → 404
//     - revoked token                → 410
//     - happy path                   → 200 with `decisionScenarios` (decision-typed only,
//                                       non-decision custom scenarios filtered out)
//                                       and the rendered model aggregates
//                                       (enrollment / revenue / netIncome / dscr / …)
//
//   POST /shared/:token/export/decision-comparison-pdf
//     - bad token format             → 400  (validator never runs)
//     - unknown token                → 404
//     - revoked token                → 410
//     - missing `compare`            → 400  + no analytics event
//     - happy path                   → 200 application/pdf + attachment filename
//                                       built from the two side labels;
//                                       analytics event attributed to the
//                                       model owner with primary/compare names
//
// The test exercises the real express app on a random port against a real
// Postgres + JWT environment (same setup decision-comparison-pdf-route.ts
// uses), so the assertions reflect production behaviour.

import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  financialModelsTable,
  sharedLinksTable,
  exportsTable,
  eventsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app.js";
import { microschoolStartup } from "./sample-payloads.js";

// --- Tiny test harness ---------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
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

function eqv<T>(label: string, actual: T, expected: T) {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// --- Fixtures ------------------------------------------------------------

// Five-year metric arrays whose values are recognisable in the rendered PDF
// stream — useful when a future regression silently produces a "PDF" that
// doesn't actually contain the comparison body.
const sampleMetrics = {
  revenue: [100_000, 200_000, 300_000, 400_000, 500_000],
  netIncome: [-20_000, 10_000, 40_000, 80_000, 120_000],
  netMargin: [-0.2, 0.05, 0.13, 0.2, 0.24],
  dscr: [0.1, 0.8, 1.2, 1.5, 1.8],
  breakEvenYear: 3,
  cashRunwayMonths: 18,
};

function makeSide(label: string) {
  return {
    label,
    decisionLabel: "Evaluate a site",
    narrative: `Notes for ${label}`,
    impact: {
      base: sampleMetrics,
      adjusted: {
        ...sampleMetrics,
        netIncome: sampleMetrics.netIncome.map((n) => n + 5_000),
      },
      deltas: {
        revenue: [0, 0, 0, 0, 0],
        netIncome: [5_000, 5_000, 5_000, 5_000, 5_000],
        breakEvenYearShift: 0,
        cashRunwayDeltaMonths: 0,
      },
      nudges: [
        { signal: "green", label: "Healthy DSCR", message: "DSCR clears 1.2 by Y3." },
      ],
    },
  };
}

function validBody() {
  return {
    schoolName: "Test Academy",
    primary: makeSide("Annex on Birch St."),
    compare: makeSide("Annex on Cedar Ave."),
  };
}

// Two decision-typed scenarios + one non-decision scenario. The GET endpoint
// must surface the decision-typed two and drop the third (the route filters
// by `decisionType` to avoid leaking arbitrary custom what-ifs over the
// public wire).
function modelDataWithDecisionScenarios() {
  return {
    ...microschoolStartup,
    customScenarios: [
      {
        name: "Annex on Birch St.",
        decisionType: "evaluate_site",
        createdAt: "2025-02-01T10:00:00Z",
        narrative: "Birch St. site visit notes.",
        overrides: {
          monthlyRent: 7500,
          rentEscalation: 3,
          sqftDelta: 1200,
          siteFitOutCost: 60_000,
        },
      },
      {
        name: "Hire Spanish lead",
        decisionType: "change_enrollment",
        createdAt: "2025-02-15T10:00:00Z",
        narrative: "Adds 4 students/yr through retention.",
        overrides: {
          enrollmentDelta: [3, 4, 5, 6, 7],
          retentionRate: 92,
        },
      },
      {
        // Plain custom scenario without a decisionType — the GET filter must
        // exclude this from `decisionScenarios`.
        name: "Aggressive tuition",
        createdAt: "2025-02-20T10:00:00Z",
        // No decisionType field on purpose.
        overrides: { tuitionAdjustment: 10 },
      },
    ],
  };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<number> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({
      email,
      name: "Test User",
      passwordHash,
    })
    .returning({ id: usersTable.id });
  return row.id;
}

async function createModel(userId: number, data: Record<string, unknown> = {}): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({
      userId,
      name: "Test Model",
      data,
    })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function createShareLink(modelId: number): Promise<{ id: number; token: string }> {
  // Mirror what POST /models/:id/share does so the token has the same
  // shape (64 hex chars) the route expects.
  const token = crypto.randomBytes(32).toString("hex");
  const [row] = await db
    .insert(sharedLinksTable)
    .values({ modelId, token })
    .returning({ id: sharedLinksTable.id, token: sharedLinksTable.token });
  return { id: row.id, token: row.token };
}

async function revokeShareLink(linkId: number) {
  await db
    .update(sharedLinksTable)
    .set({ revokedAt: new Date() })
    .where(eq(sharedLinksTable.id, linkId));
}

async function deleteUserCascade(userId: number) {
  // financial_models / exports / shared_links / events all cascade off users
  // (or set null on userId) so this drops the whole fixture in one call.
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

async function getLatestExport(modelId: number) {
  const rows = await db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.modelId, modelId))
    .orderBy(desc(exportsTable.id))
    .limit(1);
  return rows[0];
}

async function getLatestEvent(userId: number, eventName: string) {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.userId, userId), eq(eventsTable.eventName, eventName)))
    .orderBy(desc(eventsTable.id))
    .limit(1);
  return rows[0];
}

// --- HTTP helpers --------------------------------------------------------

interface BootedServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function bootApp(): Promise<BootedServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error("Failed to bind test server"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
    server.on("error", reject);
  });
}

async function getShared(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/api/shared/${token}`);
}

async function postSharedPdf(baseUrl: string, token: string, body: unknown) {
  return fetch(`${baseUrl}/api/shared/${token}/export/decision-comparison-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- GET /shared/:token tests --------------------------------------------

async function testGetBadTokenFormat(server: BootedServer) {
  console.log("\n— GET /shared/:token: bad token format → 400 —");
  // 64 chars but contains a non-hex character ("Z") → fails the /^[a-f0-9]{64}$/ regex.
  const bad = "Z".repeat(64);
  const res = await getShared(server.baseUrl, bad);
  eqv("status is 400", res.status, 400);
  const body = (await res.json()) as { error?: string };
  check(
    "error mentions invalid share token",
    typeof body.error === "string" && /invalid share token/i.test(body.error),
    `got ${JSON.stringify(body)}`,
  );

  // Also cover wrong length explicitly.
  const short = "abc";
  const res2 = await getShared(server.baseUrl, short);
  eqv("status is 400 for too-short token", res2.status, 400);
}

async function testGetUnknownToken(server: BootedServer) {
  console.log("\n— GET /shared/:token: unknown but well-formed token → 404 —");
  const unknown = "0".repeat(64);
  const res = await getShared(server.baseUrl, unknown);
  eqv("status is 404", res.status, 404);
}

async function testGetRevokedToken(server: BootedServer) {
  console.log("\n— GET /shared/:token: revoked token → 410 —");
  const stamp = Date.now();
  const userId = await createUser(`get-revoked-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDecisionScenarios());
  const link = await createShareLink(modelId);
  await revokeShareLink(link.id);

  try {
    const res = await getShared(server.baseUrl, link.token);
    eqv("status is 410", res.status, 410);
    const body = (await res.json()) as { error?: string };
    check(
      "error mentions revoked",
      typeof body.error === "string" && /revoked/i.test(body.error),
      `got ${JSON.stringify(body)}`,
    );
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testGetHappyPath(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: happy path → 200 with decisionScenarios + model aggregates —",
  );
  const stamp = Date.now();
  const userId = await createUser(`get-happy-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDecisionScenarios());
  const link = await createShareLink(modelId);

  try {
    const res = await getShared(server.baseUrl, link.token);
    eqv("status is 200", res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;

    // The schoolProfile bits the route lifts onto the top of the payload.
    eqv("schoolName comes from the model profile", body.schoolName, "Bright Horizons Microschool");

    // The aggregated model data the SharedModelPage renders. We don't pin
    // exact numbers (the consultant engine churns a lot), but we assert the
    // shape and that arrays are populated — if any of these stop being
    // exposed, the share page breaks.
    const arrayFields = [
      "enrollment",
      "revenue",
      "expenses",
      "netIncome",
      "staffingCost",
      "facilityCost",
      "debtService",
      "netMargin",
      "dscr",
      "revenueBreakdown",
    ] as const;
    for (const f of arrayFields) {
      check(
        `payload.${f} is an array`,
        Array.isArray(body[f]),
        `got ${typeof body[f]}`,
      );
      check(
        `payload.${f} is non-empty`,
        Array.isArray(body[f]) && (body[f] as unknown[]).length > 0,
      );
    }
    check(
      "payload.cashRunwayMonths is a number",
      typeof body.cashRunwayMonths === "number",
      `got ${typeof body.cashRunwayMonths}`,
    );
    check(
      "payload.daysCashOnHand is a number",
      typeof body.daysCashOnHand === "number",
    );

    // decisionScenarios — the new bit. Two of the three custom scenarios
    // are decision-typed; the third must be filtered out.
    const ds = body.decisionScenarios as
      | Array<{ name: string; decisionType: string; impact: unknown; narrative?: string }>
      | undefined;
    check("decisionScenarios is an array", Array.isArray(ds));
    eqv("decisionScenarios has 2 entries (decision-typed only)", ds?.length, 2);

    const names = (ds ?? []).map((s) => s.name).sort();
    check(
      "decisionScenarios contains the evaluate_site entry",
      names.includes("Annex on Birch St."),
    );
    check(
      "decisionScenarios contains the change_enrollment entry",
      names.includes("Hire Spanish lead"),
    );
    check(
      "decisionScenarios drops the non-decision custom scenario",
      !names.includes("Aggressive tuition"),
    );

    // Each decision scenario surfaces its precomputed impact (used by the
    // shared comparison UI to render side-by-side without recomputing on
    // the client). A regression in computeDecisionImpactFromPersisted that
    // throws would land here as `impact: null`.
    const birch = (ds ?? []).find((s) => s.name === "Annex on Birch St.");
    check("birch scenario impact is non-null", !!birch?.impact);
    check(
      "birch scenario decisionType is evaluate_site",
      birch?.decisionType === "evaluate_site",
    );
    check(
      "birch scenario narrative is preserved",
      birch?.narrative === "Birch St. site visit notes.",
    );
  } finally {
    await deleteUserCascade(userId);
  }
}

// --- POST /shared/:token/export/decision-comparison-pdf tests -----------

async function testPostBadTokenFormat(server: BootedServer) {
  console.log("\n— POST /shared/:token/...: bad token format → 400 —");
  const bad = "Z".repeat(64);
  const res = await postSharedPdf(server.baseUrl, bad, validBody());
  eqv("status is 400", res.status, 400);
  const body = (await res.json()) as { error?: string };
  check(
    "error mentions invalid share token",
    typeof body.error === "string" && /invalid share token/i.test(body.error),
    `got ${JSON.stringify(body)}`,
  );
}

async function testPostUnknownToken(server: BootedServer) {
  console.log("\n— POST /shared/:token/...: unknown but well-formed token → 404 —");
  const unknown = "1".repeat(64);
  const res = await postSharedPdf(server.baseUrl, unknown, validBody());
  eqv("status is 404", res.status, 404);
}

async function testPostRevokedToken(server: BootedServer) {
  console.log("\n— POST /shared/:token/...: revoked token → 410 —");
  const stamp = Date.now();
  const userId = await createUser(`post-revoked-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDecisionScenarios());
  const link = await createShareLink(modelId);
  await revokeShareLink(link.id);

  try {
    const res = await postSharedPdf(server.baseUrl, link.token, validBody());
    eqv("status is 410", res.status, 410);
    const body = (await res.json()) as { error?: string };
    check(
      "error mentions revoked",
      typeof body.error === "string" && /revoked/i.test(body.error),
      `got ${JSON.stringify(body)}`,
    );

    // Revoked → no analytics event should have been logged against the owner.
    const ev = await getLatestEvent(userId, "exported_decision_comparison_pdf_via_share");
    check("no share-PDF analytics event for revoked token", !ev);
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testPostInvalidPayload(server: BootedServer) {
  console.log("\n— POST /shared/:token/...: missing compare → 400 + no analytics event —");
  const stamp = Date.now();
  const userId = await createUser(`post-bad-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDecisionScenarios());
  const link = await createShareLink(modelId);

  try {
    // Missing `compare` side entirely — the validator returns null → 400.
    const res = await postSharedPdf(server.baseUrl, link.token, {
      schoolName: "Test Academy",
      primary: makeSide("Only A"),
    });
    eqv("status is 400", res.status, 400);
    const body = (await res.json()) as { error?: string };
    check(
      "error mentions invalid comparison payload",
      typeof body.error === "string" && /invalid comparison payload/i.test(body.error),
      `got ${JSON.stringify(body)}`,
    );

    // The route bails before generatePDF / trackEvent — neither side effect
    // should fire.
    const ev = await getLatestEvent(userId, "exported_decision_comparison_pdf_via_share");
    check("no share-PDF analytics event after invalid payload", !ev);
    const exp = await getLatestExport(modelId);
    check("no exports row was inserted", !exp);
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testPostHappyPath(server: BootedServer) {
  console.log(
    "\n— POST /shared/:token/...: happy path → 200 PDF + attachment headers + analytics event —",
  );
  const stamp = Date.now();
  const userId = await createUser(`post-happy-${stamp}@example.com`);
  const modelId = await createModel(userId, modelDataWithDecisionScenarios());
  const link = await createShareLink(modelId);

  try {
    const res = await postSharedPdf(server.baseUrl, link.token, validBody());
    eqv("status is 200", res.status, 200);
    eqv("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const cd = res.headers.get("content-disposition") || "";
    check(
      "content-disposition is an attachment with .pdf filename",
      /attachment;\s*filename=.*\.pdf/i.test(cd),
      `got ${JSON.stringify(cd)}`,
    );
    check(
      "filename uses sanitised label tokens (Annex_on_Birch_St_vs_Annex_on_Cedar_Ave)",
      /Annex_on_Birch_St.*vs.*Annex_on_Cedar_Ave/.test(cd),
      `got ${JSON.stringify(cd)}`,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    check(
      "response body looks like a PDF (starts with %PDF-)",
      buf.subarray(0, 5).toString() === "%PDF-",
    );
    check(
      "response body is non-trivial in size (> 1KB)",
      buf.length > 1024,
      `got ${buf.length} bytes`,
    );

    // The route attributes the analytics event to the model owner so usage
    // rolls up with the founder's other exports. We deliberately don't assert
    // an exports-table row — the route documents that it skips exportsTable
    // for public share-link downloads (no userId on a public download).
    const ev = await getLatestEvent(userId, "exported_decision_comparison_pdf_via_share");
    check("share-PDF analytics event was inserted for the owner", !!ev);
    const meta = (ev?.metadata as Record<string, unknown> | null) || {};
    eqv("event metadata.modelId matches", meta.modelId, modelId);
    eqv("event metadata.sharedLinkId matches", meta.sharedLinkId, link.id);
    eqv("event metadata.primary matches the primary label", meta.primary, "Annex on Birch St.");
    eqv("event metadata.compare matches the compare label", meta.compare, "Annex on Cedar Ave.");

    const exp = await getLatestExport(modelId);
    check(
      "no exports-table row inserted (share downloads are intentionally untracked there)",
      !exp,
    );
  } finally {
    await deleteUserCascade(userId);
  }
}

// --- Entrypoint ----------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    // The shared route doesn't issue/verify JWTs, but app.ts wires the
    // auth middleware globally; importing it requires JWT_SECRET to be set.
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Shared Decision Comparison PDF Route Integration Tests ===");

  const server = await bootApp();
  try {
    // GET /shared/:token
    await testGetBadTokenFormat(server);
    await testGetUnknownToken(server);
    await testGetRevokedToken(server);
    await testGetHappyPath(server);

    // POST /shared/:token/export/decision-comparison-pdf
    await testPostBadTokenFormat(server);
    await testPostUnknownToken(server);
    await testPostRevokedToken(server);
    await testPostInvalidPayload(server);
    await testPostHappyPath(server);
  } finally {
    await server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(2);
  })
  .finally(() => {
    // The pg pool keeps idle connections alive; force-exit so the test
    // process terminates cleanly. Mirrors decision-comparison-pdf-route.ts.
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
