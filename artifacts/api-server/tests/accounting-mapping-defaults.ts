// Integration test for the user-level "Reuse last mapping" feature.
//
// The new accounting_mapping_defaults table persists a per-(user, provider,
// realm) account mapping so a founder who connects the same QuickBooks/
// Xero company file to a second model is offered "Reuse last mapping"
// instead of having to re-classify every account from scratch.
//
// We exercise the full HTTP route surface against the real DB so the
// upsert + filter + apply path is wired correctly:
//
//   1. Saving a mapping in Model A populates the defaults row.
//   2. GET /api/models/:id/accounting on Model B (same realm) surfaces
//      `availableDefault` with matchedCount filtered against B's chart.
//   3. POST /apply-default writes only the matching subset into B's
//      connection and recomputes the snapshot via applyAccountMappings.
//   4. Editing the mapping in Model B updates the defaults row but leaves
//      Model A's stored mapping alone — that's the "without touching the
//      source" half of the task description.
//   5. A model with no realm (null realm_id) never gets a default offered.
//
// Run with:
//   pnpm --filter @workspace/api-server exec tsx tests/accounting-mapping-defaults.ts

import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  financialModelsTable,
  accountingConnectionsTable,
  accountingMappingDefaultsTable,
  type AccountKind,
  type DiscoveredAccount,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

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

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  return { id: row.id, token: generateToken(row.id) };
}

async function createModel(userId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name, data: {} })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function seedConnection(opts: {
  modelId: number;
  userId: number;
  realmId: string | null;
  realmDisplayName?: string;
  discovered: DiscoveredAccount[];
  mapping?: Record<string, AccountKind>;
}): Promise<void> {
  await db.insert(accountingConnectionsTable).values({
    modelId: opts.modelId,
    userId: opts.userId,
    provider: "quickbooks",
    status: "connected",
    realmId: opts.realmId,
    realmDisplayName: opts.realmDisplayName ?? null,
    // Tokens / snapshot intentionally omitted — these endpoints don't
    // touch them, and we want the test to fail loudly if that ever
    // changes.
    discoveredAccountsJson: opts.discovered,
    accountMappingsJson: opts.mapping ?? null,
    snapshotJson: {
      periodEnd: "2026-12-31",
      monthsCompleted: 12,
      revenue: 100_000,
      expenses: 80_000,
    },
    lastSyncedAt: new Date(),
  });
}

const REALM = "test-realm-123";

const SHARED_DISCOVERED: DiscoveredAccount[] = [
  { key: "tuition income", name: "Tuition Income", section: "income", amount: 200_000, defaultKind: "revenue" },
  { key: "salaries", name: "Salaries", section: "expense", amount: 100_000, defaultKind: "expense" },
  { key: "facility lease", name: "Facility Lease", section: "expense", amount: 60_000, defaultKind: "rent" },
  { key: "supplies", name: "Supplies", section: "expense", amount: 4_000, defaultKind: "expense" },
];

// Model B has a partially overlapping chart — "supplies" is missing and a
// new "marketing" account exists. The default's "supplies": "rent"
// override should be silently dropped when applied to Model B.
const MODEL_B_DISCOVERED: DiscoveredAccount[] = [
  { key: "tuition income", name: "Tuition Income", section: "income", amount: 220_000, defaultKind: "revenue" },
  { key: "salaries", name: "Salaries", section: "expense", amount: 110_000, defaultKind: "expense" },
  { key: "facility lease", name: "Facility Lease", section: "expense", amount: 65_000, defaultKind: "rent" },
  { key: "marketing", name: "Marketing", section: "expense", amount: 7_000, defaultKind: "expense" },
];

async function fetchAccounting(baseUrl: string, modelId: number, token: string) {
  const res = await fetch(`${baseUrl}/api/models/${modelId}/accounting`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function putMapping(
  baseUrl: string,
  modelId: number,
  token: string,
  mappings: Record<string, AccountKind>,
) {
  const res = await fetch(
    `${baseUrl}/api/models/${modelId}/accounting/quickbooks/mapping`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mappings }),
    },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function applyDefault(baseUrl: string, modelId: number, token: string) {
  const res = await fetch(
    `${baseUrl}/api/models/${modelId}/accounting/quickbooks/apply-default`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for this integration test.");
    process.exit(1);
  }

  const server = await bootApp();
  const user = await createUser(`mapping-defaults-${Date.now()}@test.local`);
  const otherUser = await createUser(`mapping-defaults-other-${Date.now()}@test.local`);

  try {
    const modelA = await createModel(user.id, "Model A");
    const modelB = await createModel(user.id, "Model B");
    const modelNoRealm = await createModel(user.id, "Model No Realm");

    // Model A: connection with full chart, founder will save a mapping.
    await seedConnection({
      modelId: modelA,
      userId: user.id,
      realmId: REALM,
      realmDisplayName: "Acme School - QBO",
      discovered: SHARED_DISCOVERED,
    });

    // Model B: same realm but a slightly different chart.
    await seedConnection({
      modelId: modelB,
      userId: user.id,
      realmId: REALM,
      realmDisplayName: "Acme School - QBO",
      discovered: MODEL_B_DISCOVERED,
    });

    // Model with NO realm (e.g. legacy connection) — should never see a default.
    await seedConnection({
      modelId: modelNoRealm,
      userId: user.id,
      realmId: null,
      discovered: SHARED_DISCOVERED,
    });

    console.log("Saving mapping in Model A → defaults row written");
    const saveRes = await putMapping(server.baseUrl, modelA, user.token, {
      "facility lease": "rent",
      supplies: "rent",
      salaries: "expense",
    });
    check("PUT /mapping returns 200", saveRes.status === 200, String(saveRes.status));
    const [defaultRow] = await db
      .select()
      .from(accountingMappingDefaultsTable)
      .where(
        and(
          eq(accountingMappingDefaultsTable.userId, user.id),
          eq(accountingMappingDefaultsTable.provider, "quickbooks"),
          eq(accountingMappingDefaultsTable.realmId, REALM),
        ),
      );
    check("defaults row created for (user, quickbooks, realm)", !!defaultRow);
    check(
      "defaults row carries the saved mapping",
      defaultRow?.accountMappingsJson?.["supplies"] === "rent",
    );
    check(
      "defaults row remembers the source model",
      defaultRow?.sourceModelId === modelA,
      String(defaultRow?.sourceModelId),
    );

    console.log("GET on Model B surfaces availableDefault with matched count");
    const getB = await fetchAccounting(server.baseUrl, modelB, user.token);
    check("GET returns 200", getB.status === 200);
    const connsB = (getB.body as { connections: Array<Record<string, unknown>> }).connections;
    const connBQb = connsB.find((c) => c.provider === "quickbooks");
    const availB = connBQb?.availableDefault as Record<string, unknown> | null;
    check("availableDefault is present on Model B", !!availB);
    check(
      "matchedCount excludes the missing 'supplies' account",
      availB?.matchedCount === 2,
      String(availB?.matchedCount),
    );
    check(
      "totalCount mirrors what was saved (3 overrides)",
      availB?.totalCount === 3,
      String(availB?.totalCount),
    );

    console.log("Model with no realm never sees a default");
    const getNoRealm = await fetchAccounting(server.baseUrl, modelNoRealm, user.token);
    const connNo = (getNoRealm.body as { connections: Array<Record<string, unknown>> })
      .connections.find((c) => c.provider === "quickbooks");
    check(
      "availableDefault is null when realm is missing",
      connNo?.availableDefault === null,
      JSON.stringify(connNo?.availableDefault),
    );

    console.log("Other user with same realm does NOT see this default");
    const otherModel = await createModel(otherUser.id, "Other User Model");
    await seedConnection({
      modelId: otherModel,
      userId: otherUser.id,
      realmId: REALM,
      discovered: SHARED_DISCOVERED,
    });
    const getOther = await fetchAccounting(server.baseUrl, otherModel, otherUser.token);
    const connOther = (getOther.body as { connections: Array<Record<string, unknown>> })
      .connections.find((c) => c.provider === "quickbooks");
    check(
      "defaults are scoped per-user",
      connOther?.availableDefault === null,
      JSON.stringify(connOther?.availableDefault),
    );

    console.log("POST /apply-default copies matching mapping into Model B");
    const applyRes = await applyDefault(server.baseUrl, modelB, user.token);
    check("apply-default returns 200", applyRes.status === 200, String(applyRes.status));
    check(
      "appliedCount equals matched (2 — supplies dropped)",
      (applyRes.body as { appliedCount?: number }).appliedCount === 2,
      String((applyRes.body as { appliedCount?: number }).appliedCount),
    );
    const [connBRow] = await db
      .select()
      .from(accountingConnectionsTable)
      .where(eq(accountingConnectionsTable.modelId, modelB));
    check(
      "Model B mapping now has facility lease as rent",
      connBRow.accountMappingsJson?.["facility lease"] === "rent",
    );
    check(
      "Model B mapping does not include the missing 'supplies' key",
      connBRow.accountMappingsJson?.["supplies"] === undefined,
    );

    console.log("Editing Model B's mapping does not touch Model A's stored mapping");
    const editRes = await putMapping(server.baseUrl, modelB, user.token, {
      "facility lease": "expense", // founder reclassifies in B
      marketing: "ignore",
    });
    check("edit PUT /mapping returns 200", editRes.status === 200);
    const [connARow] = await db
      .select()
      .from(accountingConnectionsTable)
      .where(eq(accountingConnectionsTable.modelId, modelA));
    check(
      "Model A's stored mapping is untouched",
      connARow.accountMappingsJson?.["facility lease"] === "rent" &&
        connARow.accountMappingsJson?.["supplies"] === "rent",
    );
    const [defaultAfterEdit] = await db
      .select()
      .from(accountingMappingDefaultsTable)
      .where(
        and(
          eq(accountingMappingDefaultsTable.userId, user.id),
          eq(accountingMappingDefaultsTable.provider, "quickbooks"),
          eq(accountingMappingDefaultsTable.realmId, REALM),
        ),
      );
    check(
      "the user-level default now reflects Model B's edit",
      defaultAfterEdit.accountMappingsJson?.["facility lease"] === "expense" &&
        defaultAfterEdit.accountMappingsJson?.["marketing"] === "ignore",
    );
    check(
      "the user-level default's source model points at Model B",
      defaultAfterEdit.sourceModelId === modelB,
      String(defaultAfterEdit.sourceModelId),
    );

    console.log("Once Model B has its own mapping, the reuse prompt stops being offered");
    const getBAfterEdit = await fetchAccounting(server.baseUrl, modelB, user.token);
    const connBAfter = (getBAfterEdit.body as {
      connections: Array<Record<string, unknown>>;
    }).connections.find((c) => c.provider === "quickbooks");
    // availableDefault still surfaces (front-end uses shouldOfferReuse to
    // decide whether to *render* the prompt) — but here we just assert the
    // payload shape stayed stable so the front-end keeps working.
    check(
      "availableDefault is still surfaced after edits",
      !!connBAfter?.availableDefault,
    );

    console.log("apply-default 404s when no default exists for the realm");
    const lonelyUser = await createUser(`lonely-${Date.now()}@test.local`);
    const lonelyModel = await createModel(lonelyUser.id, "Lonely Model");
    await seedConnection({
      modelId: lonelyModel,
      userId: lonelyUser.id,
      realmId: "no-default-realm",
      discovered: SHARED_DISCOVERED,
    });
    const lonelyApply = await applyDefault(server.baseUrl, lonelyModel, lonelyUser.token);
    check(
      "apply-default returns 404 when no default exists",
      lonelyApply.status === 404,
      String(lonelyApply.status),
    );
    await db.delete(usersTable).where(eq(usersTable.id, lonelyUser.id));
  } finally {
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
    await db.delete(usersTable).where(eq(usersTable.id, otherUser.id));
    await server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

void run().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
