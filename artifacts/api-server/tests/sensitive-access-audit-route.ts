// Task #836 — End-to-end coverage for the back-office "sensitive-data
// access" panel.
//
// Every `decryptSensitiveAndAudit` call writes an `audit_log` row with
// action='decrypt', actor, role, and purpose. Without a UI surface
// that history is invisible. We added GET
// /api/admin/borrower-entities/:id/sensitive-access so a lead
// underwriter can spot-check who unsealed a borrower's EIN/SSN and
// why.
//
// This test pins the contract the admin UI relies on:
//   1. Route is admin-gated (401 unauth, 403 non-admin, 200 admin).
//   2. Returns rows pinned to the borrower (entityType +
//      entityId + action='decrypt') ordered newest-first, with actor
//      email/name/role + purpose surfaced for display.
//   3. NEVER returns plaintext or ciphertext — only metadata. The
//      response shape is asserted field-by-field so a future widening
//      of the SELECT can't sneak `einEncryptedRef` etc into the JSON.
//   4. Pagination via limit/offset is honoured and capped.
//   5. Unrelated decrypt rows (different borrower, different action)
//      do not leak across.
//   6. 404 for unknown borrowers, 400 for malformed ids.

const ADMIN_EMAIL = `sensitive-access-admin-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}@example.com`;
const NON_ADMIN_EMAIL = `sensitive-access-user-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}@example.com`;
const existingAdmins = process.env.ADMIN_EMAILS || "";
process.env.ADMIN_EMAILS = existingAdmins
  ? `${existingAdmins},${ADMIN_EMAIL}`
  : ADMIN_EMAIL;

import http from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  borrowerEntitiesTable,
  auditLogTable,
} from "@workspace/db/schema";
import app from "../src/app.js";
import { decryptSensitiveAndAudit } from "../src/lib/decrypt-sensitive-and-audit.js";
import { encryptSensitive } from "../src/lib/sensitive-encryption.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

async function startServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
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

interface SensitiveAccessResponse {
  borrower: { id: number; legalName: string; einLast4: string | null };
  total: number;
  limit: number;
  offset: number;
  entries: {
    id: number;
    actorUserId: number | null;
    actorEmail: string | null;
    actorName: string | null;
    actorRole: string | null;
    purpose: string | null;
    note: string | null;
    createdAt: string;
  }[];
}

const ALLOWED_ENTRY_KEYS = new Set([
  "id",
  "actorUserId",
  "actorEmail",
  "actorName",
  "actorRole",
  "purpose",
  "note",
  "createdAt",
]);

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required to run this integration test.",
    );
    process.exit(2);
  }
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.SENSITIVE_ENCRYPTION_KEK) {
    console.warn(
      "SENSITIVE_ENCRYPTION_KEK is not set; skipping sensitive-access audit route test.",
    );
    return;
  }

  console.log("=== /admin/borrower-entities/:id/sensitive-access tests ===");

  const passwordHash = await bcrypt.hash(
    "sensitive-access-strong-password",
    4,
  );
  const [admin] = await db
    .insert(usersTable)
    .values({
      email: ADMIN_EMAIL,
      name: "Sensitive Access Admin",
      passwordHash,
      role: "user",
      tokenVersion: 0,
    })
    .returning({ id: usersTable.id, email: usersTable.email });
  const [nonAdmin] = await db
    .insert(usersTable)
    .values({
      email: NON_ADMIN_EMAIL,
      name: "Plain User",
      passwordHash,
      role: "user",
      tokenVersion: 0,
    })
    .returning({ id: usersTable.id });

  const adminToken = jwt.sign(
    { userId: admin.id, tokenVersion: 0 },
    SECRET,
    { expiresIn: "1h" },
  );
  const nonAdminToken = jwt.sign(
    { userId: nonAdmin.id, tokenVersion: 0 },
    SECRET,
    { expiresIn: "1h" },
  );

  const targetEnc = encryptSensitive("123456789");
  const otherEnc = encryptSensitive("987654321");

  const [target] = await db
    .insert(borrowerEntitiesTable)
    .values({
      legalName: "Acme Charter Inc",
      entityType: "nonprofit_501c3",
      einLast4: "6789",
      einEncryptedRef: targetEnc.encryptedRef,
    })
    .returning({ id: borrowerEntitiesTable.id });
  const [other] = await db
    .insert(borrowerEntitiesTable)
    .values({
      legalName: "Other Borrower LLC",
      entityType: "for_profit_llc",
      einLast4: "4321",
      einEncryptedRef: otherEnc.encryptedRef,
    })
    .returning({ id: borrowerEntitiesTable.id });

  const cleanupBorrowerIds = [target.id, other.id];
  const cleanupUserIds = [admin.id, nonAdmin.id];

  const server = await startServer();
  try {
    // Seed three audited decrypt events on the target borrower, plus
    // one on an unrelated borrower and one non-decrypt audit row to
    // make sure the route doesn't leak them.
    await decryptSensitiveAndAudit({
      encryptedRef: targetEnc.encryptedRef,
      actorUserId: admin.id,
      actorRole: "underwriter",
      purpose: "Lender packet — verify EIN matches IRS letter",
      entityType: "borrower_entities",
      entityId: target.id,
      note: "spot-check #1",
    });
    await new Promise((r) => setTimeout(r, 5));
    await decryptSensitiveAndAudit({
      encryptedRef: targetEnc.encryptedRef,
      actorUserId: null,
      actorRole: "system",
      purpose: "Automated KYC submission",
      entityType: "borrower_entities",
      entityId: target.id,
    });
    await new Promise((r) => setTimeout(r, 5));
    await decryptSensitiveAndAudit({
      encryptedRef: targetEnc.encryptedRef,
      actorUserId: admin.id,
      actorRole: "underwriter",
      purpose: "Re-check after IRS verification bounce",
      entityType: "borrower_entities",
      entityId: target.id,
    });
    // Unrelated borrower — must not appear in the target's response.
    await decryptSensitiveAndAudit({
      encryptedRef: otherEnc.encryptedRef,
      actorUserId: admin.id,
      actorRole: "underwriter",
      purpose: "Different borrower entirely",
      entityType: "borrower_entities",
      entityId: other.id,
    });

    // === 1. Auth gating ===
    const unauth = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access`,
    );
    check(
      "unauthenticated request is rejected",
      unauth.status === 401,
      `status=${unauth.status}`,
    );

    const forbidden = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access`,
      { headers: { Authorization: `Bearer ${nonAdminToken}` } },
    );
    check(
      "non-admin is forbidden",
      forbidden.status === 403,
      `status=${forbidden.status}`,
    );

    // === 2. Happy path: admin gets the three target rows newest-first ===
    const okRes = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check(
      "admin gets 200",
      okRes.ok,
      `status=${okRes.status} body=${(await okRes.clone().text()).slice(0, 200)}`,
    );
    const body = (await okRes.json()) as SensitiveAccessResponse;
    check(
      "borrower metadata is echoed back",
      body.borrower?.id === target.id &&
        body.borrower?.legalName === "Acme Charter Inc" &&
        body.borrower?.einLast4 === "6789",
      `got=${JSON.stringify(body.borrower)}`,
    );
    check(
      "total reflects 3 decrypt events for target",
      body.total === 3,
      `total=${body.total}`,
    );
    check(
      "entries returns 3 rows",
      body.entries.length === 3,
      `len=${body.entries.length}`,
    );
    const orderedDesc = body.entries.every((entry, i) => {
      if (i === 0) return true;
      return (
        new Date(body.entries[i - 1].createdAt).getTime() >=
        new Date(entry.createdAt).getTime()
      );
    });
    check("entries are ordered newest-first", orderedDesc);

    // === 3. Response shape — no plaintext, no ciphertext, no extra keys ===
    let shapeOk = true;
    let leakDetail = "";
    for (const entry of body.entries) {
      for (const k of Object.keys(entry)) {
        if (!ALLOWED_ENTRY_KEYS.has(k)) {
          shapeOk = false;
          leakDetail = `unexpected key '${k}'`;
          break;
        }
      }
      if (!shapeOk) break;
    }
    check(
      "entry shape is metadata-only (no leaky keys)",
      shapeOk,
      leakDetail,
    );
    const serialized = JSON.stringify(body);
    check(
      "response never contains the encrypted ref",
      !serialized.includes(targetEnc.encryptedRef),
    );
    check(
      "response never contains the EIN plaintext",
      !serialized.includes("123456789"),
    );

    // Actor data lookup landed an email + role for the admin row, and
    // null actor for the system_kyc entry.
    const adminEntry = body.entries.find(
      (e) => e.actorUserId === admin.id && e.purpose?.startsWith("Lender"),
    );
    check(
      "admin actor row has email + role + purpose",
      adminEntry?.actorEmail === ADMIN_EMAIL &&
        adminEntry?.actorRole === "underwriter" &&
        adminEntry?.actorName === "Sensitive Access Admin" &&
        typeof adminEntry?.purpose === "string",
      `got=${JSON.stringify(adminEntry)}`,
    );
    const systemEntry = body.entries.find(
      (e) => e.actorUserId === null && e.actorRole === "system",
    );
    check(
      "system actor row has null actorUserId/email but keeps role+purpose",
      !!systemEntry &&
        systemEntry.actorUserId === null &&
        systemEntry.actorEmail === null &&
        systemEntry.purpose === "Automated KYC submission",
      `got=${JSON.stringify(systemEntry)}`,
    );

    // === 4. Pagination ===
    const page1 = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access?limit=2&offset=0`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const page1Body = (await page1.json()) as SensitiveAccessResponse;
    check(
      "limit=2 returns 2 entries with total still 3",
      page1Body.entries.length === 2 &&
        page1Body.limit === 2 &&
        page1Body.offset === 0 &&
        page1Body.total === 3,
      `got len=${page1Body.entries.length} limit=${page1Body.limit} total=${page1Body.total}`,
    );
    const page2 = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access?limit=2&offset=2`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const page2Body = (await page2.json()) as SensitiveAccessResponse;
    check(
      "offset=2 returns the trailing 1 entry",
      page2Body.entries.length === 1 && page2Body.offset === 2,
      `got len=${page2Body.entries.length} offset=${page2Body.offset}`,
    );
    const page1Ids = new Set(page1Body.entries.map((e) => e.id));
    check(
      "page2 entry is not in page1",
      !page1Ids.has(page2Body.entries[0]?.id ?? -1),
    );

    // Limit cap (max 100).
    const overcap = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access?limit=9999`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const overcapBody = (await overcap.json()) as SensitiveAccessResponse;
    check(
      "limit is capped at 100",
      overcapBody.limit === 100,
      `got=${overcapBody.limit}`,
    );

    // === 5. 404 / 400 ===
    const notFound = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/9999999/sensitive-access`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check(
      "unknown borrower → 404",
      notFound.status === 404,
      `status=${notFound.status}`,
    );
    const badId = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/abc/sensitive-access`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check(
      "non-numeric id → 400",
      badId.status === 400,
      `status=${badId.status}`,
    );

    // === 6. CSV export (Task #881) ===
    // Same admin gate; pagination bypassed; metadata-only — no plaintext
    // and no ciphertext should ever appear in the file.
    const csvUrl = `${server.baseUrl}/api/admin/borrower-entities/${target.id}/sensitive-access.csv`;
    const csvUnauth = await fetch(csvUrl);
    check(
      "csv export rejects unauthenticated requests",
      csvUnauth.status === 401,
      `status=${csvUnauth.status}`,
    );
    const csvForbidden = await fetch(csvUrl, {
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    check(
      "csv export forbids non-admins",
      csvForbidden.status === 403,
      `status=${csvForbidden.status}`,
    );

    const csvOk = await fetch(csvUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    check(
      "admin gets 200 for csv export",
      csvOk.ok,
      `status=${csvOk.status}`,
    );
    check(
      "csv content-type is text/csv",
      (csvOk.headers.get("content-type") || "").startsWith("text/csv"),
      `ct=${csvOk.headers.get("content-type")}`,
    );
    check(
      "csv content-disposition is an attachment",
      (csvOk.headers.get("content-disposition") || "").includes("attachment"),
      `cd=${csvOk.headers.get("content-disposition")}`,
    );

    const csvText = await csvOk.text();
    const csvLines = csvText.replace(/\r\n$/, "").split("\r\n");
    check(
      "csv has header + all 3 rows (pagination bypassed)",
      csvLines.length === 4 &&
        csvLines[0] ===
          "timestamp,actor_email,actor_name,actor_role,purpose,note",
      `lines=${csvLines.length}, header='${csvLines[0]}'`,
    );
    check(
      "csv never contains the encrypted ref",
      !csvText.includes(targetEnc.encryptedRef),
    );
    check(
      "csv never contains the EIN plaintext",
      !csvText.includes("123456789"),
    );
    check(
      "csv contains the admin actor email and a purpose",
      csvText.includes(ADMIN_EMAIL) &&
        csvText.includes("Lender packet"),
    );
    check(
      "csv does not leak the unrelated borrower's purpose",
      !csvText.includes("Different borrower entirely"),
    );

    const csvNotFound = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/9999999/sensitive-access.csv`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check(
      "csv export → 404 for unknown borrower",
      csvNotFound.status === 404,
      `status=${csvNotFound.status}`,
    );
    const csvBadId = await fetch(
      `${server.baseUrl}/api/admin/borrower-entities/abc/sensitive-access.csv`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check(
      "csv export → 400 for non-numeric id",
      csvBadId.status === 400,
      `status=${csvBadId.status}`,
    );
  } finally {
    await server.close();
    // Clean up audit rows we created so reruns stay deterministic.
    await db
      .delete(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "borrower_entities"),
          inArray(auditLogTable.entityId, cleanupBorrowerIds),
        ),
      );
    await db
      .delete(borrowerEntitiesTable)
      .where(inArray(borrowerEntitiesTable.id, cleanupBorrowerIds));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, cleanupUserIds));
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
