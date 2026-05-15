// Task #883 — Tests for the admin "key rotation alerts" route.
//
// Verifies the GET endpoint returns only `key_rotation_failure`
// rows with the parsed per-table failure detail and the unresolved
// count, and that POST .../acknowledge mutates `request_body` so
// the row stops counting as unresolved without leaving the table.

import { eq } from "drizzle-orm";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@workspace/db";
import { errorLogsTable, usersTable } from "@workspace/db/schema";
import errorsRouter from "../src/routes/errors";
import { recordErrorLog } from "../src/lib/error-log";
import { KEY_ROTATION_FAILURE_ROUTE } from "../src/lib/key-rotation-alert";
import { generateToken } from "../src/middlewares/auth";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use("/api", errorsRouter);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}/api`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function seedAdmin() {
  if (!db) throw new Error("db not configured");
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: "x",
      name: "Admin Test",
      verified: true,
    })
    .returning();
  process.env.ADMIN_EMAILS = email;
  const token = generateToken(user.id, user.tokenVersion);
  return { user, token };
}

async function deleteAlertRows() {
  if (!db) return;
  await db.delete(errorLogsTable).where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
}

async function main(): Promise<void> {
  if (!db) {
    console.log("DATABASE_URL not configured — skipping key-rotation-alerts route test.");
    return;
  }

  const origAdmins = process.env.ADMIN_EMAILS;
  let userId: string | undefined;
  const { base, close } = await startServer();
  try {
    await deleteAlertRows();
    const { user, token } = await seedAdmin();
    userId = String(user.id);
    const auth = { Authorization: `Bearer ${token}` };

    // Seed a non-rotation error_logs row that must NOT show up.
    await recordErrorLog({
      userId: null,
      errorMessage: "generic 500",
      errorStack: null,
      route: "/api/whatever",
      requestBody: { source: "server" },
    });

    // Seed two rotation failure rows.
    await recordErrorLog({
      userId: null,
      errorMessage: "KEK rotation reported 2 failed row(s) across 1 table(s)",
      errorStack: null,
      route: KEY_ROTATION_FAILURE_ROUTE,
      requestBody: {
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active", "kek-prev"],
        totalFailed: 2,
        tables: [
          {
            table: "borrower_entities",
            scanned: 4,
            rewrapped: 1,
            failed: 2,
            sampleFailures: [
              { id: 101, error: "unparseable encrypted ref" },
              { id: 102, error: "kekId 'kek-old' not loaded" },
            ],
          },
        ],
      },
    });
    await recordErrorLog({
      userId: null,
      errorMessage: "KEK rotation reported 1 failed row(s) across 1 table(s)",
      errorStack: null,
      route: KEY_ROTATION_FAILURE_ROUTE,
      requestBody: {
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active"],
        totalFailed: 1,
        tables: [
          {
            table: "founder_profiles",
            scanned: 3,
            rewrapped: 0,
            failed: 1,
            sampleFailures: [{ id: 7, error: "boom" }],
          },
        ],
      },
    });

    console.log("\n— phase 1: GET surfaces only rotation rows with detail");
    {
      const res = await fetch(`${base}/admin/key-rotation-alerts`, { headers: auth });
      check("GET 200", res.status === 200, `status=${res.status}`);
      const body = (await res.json()) as {
        items: Array<{
          totalFailed: number;
          tables: Array<{ table: string; sampleFailures: unknown[] }>;
          acknowledgedAt: string | null;
        }>;
        unresolvedCount: number;
        totalFailedRows: number;
      };
      check("returns 2 rotation rows", body.items.length === 2);
      check("unresolvedCount=2", body.unresolvedCount === 2);
      check("totalFailedRows=3", body.totalFailedRows === 3);
      check(
        "first row carries per-table detail",
        body.items[0].tables.length === 1 &&
          body.items[0].tables[0].sampleFailures.length >= 1,
      );
      check("nothing acknowledged yet", body.items.every((i) => !i.acknowledgedAt));
    }

    console.log("\n— phase 2: 401 without auth, 403 for non-admin");
    {
      const res = await fetch(`${base}/admin/key-rotation-alerts`);
      check("no token → 401", res.status === 401, `status=${res.status}`);
    }
    {
      const orig = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "someone-else@example.com";
      const res = await fetch(`${base}/admin/key-rotation-alerts`, { headers: auth });
      check("non-admin → 403", res.status === 403, `status=${res.status}`);
      process.env.ADMIN_EMAILS = orig;
    }

    console.log("\n— phase 3: POST acknowledge dismisses the row");
    let firstId: number;
    {
      const list = (await (
        await fetch(`${base}/admin/key-rotation-alerts`, { headers: auth })
      ).json()) as { items: Array<{ id: number }> };
      firstId = list.items[0].id;
      const ack = await fetch(
        `${base}/admin/key-rotation-alerts/${firstId}/acknowledge`,
        { method: "POST", headers: auth },
      );
      check("acknowledge 200", ack.status === 200, `status=${ack.status}`);
      const after = (await (
        await fetch(`${base}/admin/key-rotation-alerts`, { headers: auth })
      ).json()) as {
        items: Array<{ id: number; acknowledgedAt: string | null; acknowledgedBy: string | null }>;
        unresolvedCount: number;
        totalFailedRows: number;
      };
      check("row still listed", after.items.some((i) => i.id === firstId));
      const acked = after.items.find((i) => i.id === firstId)!;
      check("acknowledgedAt set", typeof acked.acknowledgedAt === "string");
      check(
        "acknowledgedBy = current admin user id",
        acked.acknowledgedBy === userId,
        `got ${acked.acknowledgedBy}`,
      );
      check("unresolvedCount drops to 1", after.unresolvedCount === 1);
      check("totalFailedRows drops accordingly", after.totalFailedRows >= 0 && after.totalFailedRows < 3);
    }

    console.log("\n— phase 4: re-acknowledging is a no-op success");
    {
      const ack = await fetch(
        `${base}/admin/key-rotation-alerts/${firstId}/acknowledge`,
        { method: "POST", headers: auth },
      );
      check("re-ack 200", ack.status === 200);
      const body = (await ack.json()) as { ok: boolean; alreadyAcknowledged?: boolean };
      check("ok flag set", body.ok === true);
    }

    console.log("\n— phase 5: 404 for unknown id, 400 for bad id");
    {
      const r1 = await fetch(`${base}/admin/key-rotation-alerts/999999999/acknowledge`, {
        method: "POST",
        headers: auth,
      });
      check("unknown id → 404", r1.status === 404);
      const r2 = await fetch(`${base}/admin/key-rotation-alerts/abc/acknowledge`, {
        method: "POST",
        headers: auth,
      });
      check("bad id → 400", r2.status === 400);
    }
  } finally {
    await close();
    if (userId) {
      try {
        await db.delete(usersTable).where(eq(usersTable.id, Number(userId)));
      } catch {
        /* ignore */
      }
    }
    await deleteAlertRows();
    if (db) {
      // Also wipe the generic seeded row from phase 1.
      try {
        await db.delete(errorLogsTable).where(eq(errorLogsTable.route, "/api/whatever"));
      } catch {
        /* ignore */
      }
    }
    if (origAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = origAdmins;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
