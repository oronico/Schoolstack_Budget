// Integration test for GET /api/models/:id/export/pro-forma-pdf.
//
// Sibling to tests/lender-packet-pdf-route.ts and
// tests/board-packet-pdf-route.ts. This test exists so a future refactor
// of the pro-forma PDF route cannot silently break the audit trail
// (an exports row + a named analytics event).
//
// What this test asserts end-to-end:
//   - real authed user (issued via generateToken)
//   - real model row owned by that user, seeded from microschoolStartup
//   - real HTTP request through the express app on a random port
//   - 200 application/pdf response with attachment Content-Disposition
//   - response body starts with "%PDF-" and is non-trivial in size
//   - one new row in `exports` with format="pdf" + correct user/model ids
//   - one new row in `events` with eventName="exported_proforma_pdf"
//     and metadata.modelId pointing back at the model
//   - 404 when a different user requests the model (no exports/events written)
//
// Note on flag handling: unlike the lender/board packet routes, the
// pro-forma PDF handler in routes/models.ts does NOT call
// checkUnresolvedFlags. There is therefore no 422 path to cover here.
// We assert against the real handler.

import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable, exportsTable, eventsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";
import { microschoolStartup } from "./sample-payloads.js";

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

// The pro-forma PDF route does not block on unresolved assumption flags,
// so we can use microschoolStartup as-is without seeding flag responses.
function modelData() {
  return { ...(microschoolStartup as Record<string, unknown>) };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  const token = generateToken(row.id);
  return { id: row.id, token };
}

async function createModel(userId: number, data: Record<string, unknown>): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name: "Test Model", data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function deleteUserCascade(userId: number) {
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

async function getPdf(baseUrl: string, modelId: number, token: string) {
  return fetch(`${baseUrl}/api/models/${modelId}/export/pro-forma-pdf`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer) {
  console.log("\n— happy path: 200 PDF + exports row + analytics event —");

  const stamp = Date.now();
  const user = await createUser(`proforma-happy-${stamp}@example.com`);
  const modelId = await createModel(user.id, modelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, user.token);
    eq2("status is 200", res.status, 200);
    eq2("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const cd = res.headers.get("content-disposition") || "";
    check(
      "content-disposition is an attachment with .pdf filename",
      /attachment;\s*filename=.*\.pdf/i.test(cd),
      `got ${JSON.stringify(cd)}`,
    );
    check(
      "filename is suffixed with _Pro_Forma.pdf (sanitised school name)",
      /_Pro_Forma\.pdf/.test(cd),
      `got ${JSON.stringify(cd)}`,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    check("response body looks like a PDF (starts with %PDF-)", buf.subarray(0, 5).toString() === "%PDF-");
    check("response body is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row userId matches", exportRow?.userId, user.id);
    eq2("exports row modelId matches", exportRow?.modelId, modelId);
    eq2("exports row format is 'pdf'", exportRow?.format, "pdf");

    const eventRow = await getLatestEvent(user.id, "exported_proforma_pdf");
    check("analytics event 'exported_proforma_pdf' inserted", !!eventRow);
    const meta = (eventRow?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId matches", meta.modelId, modelId);
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testOtherUsersModel(server: BootedServer) {
  console.log("\n— other user's model: 404, no exports row, no event —");

  const stamp = Date.now();
  const owner = await createUser(`proforma-owner-${stamp}@example.com`);
  const intruder = await createUser(`proforma-intruder-${stamp}@example.com`);
  const modelId = await createModel(owner.id, modelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, intruder.token);
    eq2("status is 404", res.status, 404);

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const intruderEvent = await getLatestEvent(intruder.id, "exported_proforma_pdf");
    check("no analytics event for intruder", !intruderEvent);
    const ownerEvent = await getLatestEvent(owner.id, "exported_proforma_pdf");
    check("no analytics event for owner either", !ownerEvent);
  } finally {
    await deleteUserCascade(owner.id);
    await deleteUserCascade(intruder.id);
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

  console.log("=== Pro Forma PDF Route Integration Tests ===");

  const server = await bootApp();
  try {
    await testHappyPath(server);
    await testOtherUsersModel(server);
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
