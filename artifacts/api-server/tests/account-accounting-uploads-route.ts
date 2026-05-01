// Integration test for the profile-page "Saved P&L uploads" panel:
//   GET    /api/account/accounting-uploads
//   DELETE /api/account/accounting-uploads/:modelId
//
// These two endpoints back the only place a founder can see every
// `data.accountingExport` they've saved across all their models, and the
// only place outside the per-model wizard where they can prune one. The
// tests boot the real express app on a random port, hit it over HTTP with
// a real JWT, and verify against the actual financial_models / events
// rows. Nothing about the storage shape (jsonb merge semantics, the
// untouched-sibling-keys requirement, the userId scoping) is covered by
// the per-model export route, so a regression here would silently leave
// the panel either showing other users' uploads or losing user data.

import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable, eventsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";

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

function eq2<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- Fixtures ------------------------------------------------------------

// A realistic stored upload: the schema declares totals + parseWarnings
// optional, and the route's filter is keyed off `filename` being a
// non-empty string, so we exercise both that filter and the warnings/
// totals passthrough in one fixture.
function sampleUpload(filename: string, uploadedAt: string) {
  return {
    filename,
    uploadedAt,
    sourceLabel: "QuickBooks P&L",
    totals: { revenue: 1_234_567, expenses: 1_000_000, netIncome: 234_567 },
    parseWarnings: ["Row 12 had a blank date — defaulted to month-end."],
  };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  return { id: row.id, token: generateToken(row.id) };
}

async function createModel(
  userId: number,
  name: string,
  data: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name, data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function deleteUserCascade(userId: number) {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

async function getModel(modelId: number) {
  const [row] = await db
    .select()
    .from(financialModelsTable)
    .where(eq(financialModelsTable.id, modelId))
    .limit(1);
  return row;
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

async function getList(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/api/account/accounting-uploads`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function del(baseUrl: string, token: string, modelId: number | string) {
  return fetch(`${baseUrl}/api/account/accounting-uploads/${modelId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

interface ListEntry {
  modelId: number;
  modelName: string;
  modelStatus: string | null;
  filename: string;
  uploadedAt: string | null;
  modelUpdatedAt: string;
  parseWarningCount: number;
  totals: Record<string, unknown> | null;
}

// --- Tests ---------------------------------------------------------------

async function testRequiresAuth(server: BootedServer) {
  console.log("\n— unauthenticated requests are rejected —");
  const listRes = await fetch(`${server.baseUrl}/api/account/accounting-uploads`);
  eq2("GET without token returns 401", listRes.status, 401);
  const delRes = await fetch(`${server.baseUrl}/api/account/accounting-uploads/1`, {
    method: "DELETE",
  });
  eq2("DELETE without token returns 401", delRes.status, 401);
}

async function testListAndDelete(server: BootedServer) {
  console.log("\n— list returns only models with uploads, scoped to user —");

  const stamp = Date.now();
  const owner = await createUser(`uploads-${stamp}@example.com`);
  const stranger = await createUser(`stranger-${stamp}@example.com`);

  // Three models on the owner:
  //   - model A: has an upload, older
  //   - model B: has an upload, newer (should sort first)
  //   - model C: no upload at all (must be filtered out)
  // One model on the stranger with an upload (must NOT appear in owner's list).
  const olderUpload = sampleUpload("books-q1.csv", "2025-01-15T10:00:00.000Z");
  const newerUpload = sampleUpload("books-q3.xlsx", "2025-09-20T14:30:00.000Z");

  const modelA = await createModel(owner.id, "Spring cohort", {
    schoolProfile: { schoolName: "Spring Academy" },
    accountingExport: olderUpload,
  });
  const modelB = await createModel(owner.id, "Fall cohort", {
    schoolProfile: { schoolName: "Fall Academy" },
    accountingExport: newerUpload,
  });
  const modelC = await createModel(owner.id, "No upload model", {
    schoolProfile: { schoolName: "Bare Academy" },
  });
  const strangerModel = await createModel(stranger.id, "Strangers cohort", {
    accountingExport: sampleUpload("not-yours.csv", "2025-09-25T00:00:00.000Z"),
  });

  try {
    const res = await getList(server.baseUrl, owner.token);
    eq2("list status is 200", res.status, 200);
    const body = (await res.json()) as ListEntry[];
    check("response is a JSON array", Array.isArray(body));
    eq2("only models with uploads are returned", body.length, 2);

    const ids = body.map((e) => e.modelId);
    check("model A appears in list", ids.includes(modelA), `got ${JSON.stringify(ids)}`);
    check("model B appears in list", ids.includes(modelB), `got ${JSON.stringify(ids)}`);
    check(
      "model C (no upload) is filtered out",
      !ids.includes(modelC),
      `got ${JSON.stringify(ids)}`,
    );
    check(
      "stranger's model is not visible to owner",
      !ids.includes(strangerModel),
      `got ${JSON.stringify(ids)}`,
    );

    // Sort order: most-recently-uploaded first.
    eq2("first entry is the newer upload (model B)", body[0]?.modelId, modelB);
    eq2("second entry is the older upload (model A)", body[1]?.modelId, modelA);

    // Shape of the entry: filename, uploadedAt, totals + warning count
    // all need to round-trip exactly so the panel can render them.
    const newerEntry = body[0];
    eq2("newer entry filename", newerEntry?.filename, "books-q3.xlsx");
    eq2("newer entry uploadedAt", newerEntry?.uploadedAt, "2025-09-20T14:30:00.000Z");
    eq2("newer entry warning count", newerEntry?.parseWarningCount, 1);
    eq2("newer entry model name", newerEntry?.modelName, "Fall cohort");
    check(
      "newer entry totals.netIncome round-trips",
      newerEntry?.totals?.netIncome === 234_567,
      `got ${JSON.stringify(newerEntry?.totals)}`,
    );
    check(
      "modelUpdatedAt is an ISO string",
      typeof newerEntry?.modelUpdatedAt === "string" &&
        !Number.isNaN(Date.parse(newerEntry.modelUpdatedAt)),
    );

    console.log("\n— stranger sees only their own upload —");
    const strangerRes = await getList(server.baseUrl, stranger.token);
    const strangerBody = (await strangerRes.json()) as ListEntry[];
    eq2("stranger list length is 1", strangerBody.length, 1);
    eq2("stranger sees their own model", strangerBody[0]?.modelId, strangerModel);

    console.log("\n— delete strips just accountingExport, leaves siblings intact —");
    const delRes = await del(server.baseUrl, owner.token, modelA);
    eq2("delete status is 200", delRes.status, 200);

    const after = await getModel(modelA);
    const afterData = (after?.data as Record<string, unknown>) ?? {};
    check(
      "accountingExport key has been stripped from data jsonb",
      !("accountingExport" in afterData),
      `data still has keys ${Object.keys(afterData).join(",")}`,
    );
    check(
      "schoolProfile sibling key is preserved",
      typeof afterData.schoolProfile === "object" &&
        afterData.schoolProfile !== null &&
        (afterData.schoolProfile as Record<string, unknown>).schoolName ===
          "Spring Academy",
      `got ${JSON.stringify(afterData.schoolProfile)}`,
    );

    const evt = await getLatestEvent(owner.id, "forgot_accounting_upload");
    check("forgot_accounting_upload analytics event was recorded", !!evt);
    const meta = (evt?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId", meta.modelId, modelA);
    eq2("event metadata.filename", meta.filename, "books-q1.csv");

    console.log("\n— deleted upload disappears from list —");
    const afterList = (await (await getList(server.baseUrl, owner.token)).json()) as ListEntry[];
    eq2("list length drops to 1", afterList.length, 1);
    eq2("only model B remains", afterList[0]?.modelId, modelB);

    console.log("\n— deleting again 404s (already forgotten) —");
    const dupRes = await del(server.baseUrl, owner.token, modelA);
    eq2("second delete returns 404", dupRes.status, 404);

    console.log("\n— stranger cannot delete owner's remaining upload —");
    const crossRes = await del(server.baseUrl, stranger.token, modelB);
    eq2("cross-user delete returns 404", crossRes.status, 404);
    const stillThere = await getModel(modelB);
    const stillData = (stillThere?.data as Record<string, unknown>) ?? {};
    check(
      "owner's upload is still attached after cross-user attempt",
      !!stillData.accountingExport,
    );

    console.log("\n— invalid model id returns 400 —");
    const badRes = await del(server.baseUrl, owner.token, "not-a-number");
    eq2("non-numeric id returns 400", badRes.status, 400);

    console.log("\n— DELETE on a model with no upload returns 404 —");
    const noUploadRes = await del(server.baseUrl, owner.token, modelC);
    eq2("delete on no-upload model returns 404", noUploadRes.status, 404);
  } finally {
    await deleteUserCascade(owner.id);
    await deleteUserCascade(stranger.id);
  }
}

async function testEmptyList(server: BootedServer) {
  console.log("\n— a brand-new user with no models gets an empty list —");
  const stamp = Date.now();
  const newbie = await createUser(`newbie-${stamp}@example.com`);
  try {
    const res = await getList(server.baseUrl, newbie.token);
    eq2("status is 200", res.status, 200);
    const body = (await res.json()) as unknown[];
    check("response is an array", Array.isArray(body));
    eq2("length is 0", body.length, 0);
  } finally {
    await deleteUserCascade(newbie.id);
  }
}

async function testMalformedUploadFilteredOut(server: BootedServer) {
  console.log("\n— a model with a malformed accountingExport (no filename) is filtered out —");
  const stamp = Date.now();
  const user = await createUser(`malformed-${stamp}@example.com`);
  // Older models / partial saves can leave an `accountingExport` object
  // without a `filename` string — the panel can't render an actionable
  // row for those, so the route filters them out. If that filter were
  // removed, this test would surface the regression.
  const modelId = await createModel(user.id, "Malformed", {
    accountingExport: { totals: { revenue: 10 } },
  });
  try {
    const body = (await (await getList(server.baseUrl, user.token)).json()) as ListEntry[];
    eq2("list is empty when filename is missing", body.length, 0);
    // And DELETE should refuse to act on it (treats it as no-upload).
    const delRes = await del(server.baseUrl, user.token, modelId);
    eq2("delete on malformed upload returns 404", delRes.status, 404);
  } finally {
    await deleteUserCascade(user.id);
  }
}

// --- Entrypoint ----------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Account Accounting Uploads Route Integration Tests ===");
  const server = await bootApp();
  try {
    await testRequiresAuth(server);
    await testListAndDelete(server);
    await testEmptyList(server);
    await testMalformedUploadFilteredOut(server);
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
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
