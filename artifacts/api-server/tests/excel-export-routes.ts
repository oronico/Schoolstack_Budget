// Integration tests for the six Excel/XLSX export routes.
//
// Sibling to tests/lender-packet-pdf-route.ts. This test exists so a future
// refactor of any export handler in routes/models.ts cannot silently break
// the audit trail (an exports row + a named analytics event). Tasks #212
// and #220 covered the comparison/lender/board PDF download routes; this
// test extends the same end-to-end coverage to the XLSX siblings.
//
// Routes covered (all GET):
//   /api/models/:id/export                            -> "exported_xlsx"
//   /api/models/:id/export/lender-proforma            -> "exported_lender_proforma"
//   /api/models/:id/export/underwriting               -> "exported_underwriting"   (flag-checked)
//   /api/models/:id/export/underwriting-v2            -> "exported_underwriting_v2" (flag-checked)
//   /api/models/:id/export/chesterton-operating-manual -> "exported_chesterton_operating_manual"
//   /api/models/:id/export/single-year                -> "exported_single_year"
//
// For each route the happy path asserts:
//   - 200 with the openxml spreadsheet content-type
//   - response body starts with the ZIP magic bytes "PK"
//   - a new `exports` row with format="xlsx" + correct user/model ids
//   - a new `events` row with the matching event name + metadata.modelId
//
// 404 path (other user owns the model) is asserted for every route.
//
// 422 unresolved-flag path is asserted for the two routes that call
// checkUnresolvedFlags (underwriting + underwriting-v2). The other four
// routes do not gate on flags, so the flag-blocked case is N/A.

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

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// --- Fixtures ------------------------------------------------------------

// microschoolStartup raises a single warning flag (`enrollment_spike` on
// `enrollment.year2`). Routes that gate on flags need this resolved; the
// non-gated routes don't care either way, so we use the resolved variant
// everywhere except the explicit blocked-flag tests below.
function happyPathModelData() {
  return {
    ...(microschoolStartup as Record<string, unknown>),
    assumptionFlagResponses: [
      {
        field: "enrollment.year2",
        flagType: "enrollment_spike",
        reason: "Founders confirmed 18 family commitments via signed letters of intent.",
      },
    ],
  };
}

function flagBlockedModelData() {
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

async function getXlsx(baseUrl: string, path: string, token: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// --- Route descriptors ---------------------------------------------------

interface ExportRouteSpec {
  label: string;
  // Path suffix appended after `/api/models/:id` — e.g. "" or "/lender-proforma".
  pathSuffix: string;
  // Optional query string (e.g. "?year=0").
  query?: string;
  eventName: string;
  // Substring expected in Content-Disposition filename.
  filenameContains: string;
  // True when the route calls checkUnresolvedFlags and gates with 422.
  flagGated: boolean;
}

const ROUTES: ExportRouteSpec[] = [
  {
    label: "/export (full 5-year workbook)",
    pathSuffix: "",
    eventName: "exported_xlsx",
    filenameContains: "Financial_Model.xlsx",
    flagGated: false,
  },
  {
    label: "/export/lender-proforma",
    pathSuffix: "/lender-proforma",
    eventName: "exported_lender_proforma",
    filenameContains: "Lender_Pro_Forma.xlsx",
    flagGated: false,
  },
  {
    label: "/export/underwriting",
    pathSuffix: "/underwriting",
    eventName: "exported_underwriting",
    filenameContains: "Lender_Pro_Forma.xlsx",
    flagGated: true,
  },
  {
    label: "/export/underwriting-v2",
    pathSuffix: "/underwriting-v2",
    eventName: "exported_underwriting_v2",
    filenameContains: "Founder_Planning_Workbook.xlsx",
    flagGated: true,
  },
  {
    label: "/export/chesterton-operating-manual",
    pathSuffix: "/chesterton-operating-manual",
    eventName: "exported_chesterton_operating_manual",
    filenameContains: "CSN_Operating_Manual.xlsx",
    flagGated: false,
  },
  {
    label: "/export/single-year",
    pathSuffix: "/single-year",
    query: "?year=0",
    eventName: "exported_single_year",
    filenameContains: "Year_1_Budget.xlsx",
    flagGated: false,
  },
];

function buildPath(modelId: number, spec: ExportRouteSpec): string {
  return `/api/models/${modelId}/export${spec.pathSuffix}${spec.query ?? ""}`;
}

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer, spec: ExportRouteSpec) {
  console.log(`\n— happy path: ${spec.label} —`);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await createUser(`xlsx-happy-${stamp}@example.com`);
  const modelId = await createModel(user.id, happyPathModelData());

  try {
    const res = await getXlsx(server.baseUrl, buildPath(modelId, spec), user.token);
    eq2("status is 200", res.status, 200);
    eq2("content-type is xlsx openxml", res.headers.get("content-type"), XLSX_CONTENT_TYPE);

    const cd = res.headers.get("content-disposition") || "";
    check(
      "content-disposition is an attachment with .xlsx filename",
      /attachment;\s*filename=.*\.xlsx/i.test(cd),
      `got ${JSON.stringify(cd)}`,
    );
    check(
      `filename contains ${JSON.stringify(spec.filenameContains)}`,
      cd.includes(spec.filenameContains),
      `got ${JSON.stringify(cd)}`,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    // .xlsx is a ZIP archive — bytes 0-1 are "PK" (0x50 0x4B).
    check(
      "response body looks like a zip/xlsx (starts with PK)",
      buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b,
      `got first bytes ${buf.subarray(0, 4).toString("hex")}`,
    );
    check("response body is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row userId matches", exportRow?.userId, user.id);
    eq2("exports row modelId matches", exportRow?.modelId, modelId);
    eq2("exports row format is 'xlsx'", exportRow?.format, "xlsx");

    const eventRow = await getLatestEvent(user.id, spec.eventName);
    check(`analytics event '${spec.eventName}' inserted`, !!eventRow);
    const meta = (eventRow?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId matches", meta.modelId, modelId);
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testOtherUsersModel(server: BootedServer, spec: ExportRouteSpec) {
  console.log(`\n— other user's model: ${spec.label} —`);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = await createUser(`xlsx-owner-${stamp}@example.com`);
  const intruder = await createUser(`xlsx-intruder-${stamp}@example.com`);
  const modelId = await createModel(owner.id, happyPathModelData());

  try {
    const res = await getXlsx(server.baseUrl, buildPath(modelId, spec), intruder.token);
    eq2("status is 404", res.status, 404);

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const intruderEvent = await getLatestEvent(intruder.id, spec.eventName);
    check("no analytics event for intruder", !intruderEvent);
    const ownerEvent = await getLatestEvent(owner.id, spec.eventName);
    check("no analytics event for owner either", !ownerEvent);
  } finally {
    await deleteUserCascade(owner.id);
    await deleteUserCascade(intruder.id);
  }
}

async function testFlagBlocked(server: BootedServer, spec: ExportRouteSpec) {
  console.log(`\n— unresolved warning flag: ${spec.label} —`);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await createUser(`xlsx-blocked-${stamp}@example.com`);
  const modelId = await createModel(user.id, flagBlockedModelData());

  try {
    const res = await getXlsx(server.baseUrl, buildPath(modelId, spec), user.token);
    eq2("status is 422 (unresolved flag)", res.status, 422);

    const json = (await res.json()) as { error?: string };
    check(
      "error mentions blocked export and flagged assumptions",
      typeof json.error === "string" && /Export blocked.*flagged assumption/i.test(json.error),
      `got ${JSON.stringify(json)}`,
    );

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const eventRow = await getLatestEvent(user.id, spec.eventName);
    check("no analytics event was inserted", !eventRow);
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

  console.log("=== Excel Export Routes Integration Tests ===");

  const server = await bootApp();
  try {
    for (const spec of ROUTES) {
      await testHappyPath(server, spec);
      await testOtherUsersModel(server, spec);
      if (spec.flagGated) {
        await testFlagBlocked(server, spec);
      }
    }
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
