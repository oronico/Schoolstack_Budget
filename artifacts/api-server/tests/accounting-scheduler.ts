// Smoke test for the accounting background sync helper + scheduler sweep.
//
// We don't talk to a real Postgres or QuickBooks/Xero here. Instead the test
// passes an in-memory adapter and stub provider clients through the
// dependency seams exposed by `syncAccountingConnection` and `runSyncSweep`,
// then asserts the row updates we'd expect to see persisted in production.
import type { AccountingConnection, AccountingSyncSnapshot } from "@workspace/db";
import {
  syncAccountingConnection,
  type AccountingDbAdapter,
} from "../src/lib/accounting/sync.js";
import { runSyncSweep, decideRefresh } from "../src/lib/accounting/scheduler.js";
import type { ProviderClient } from "../src/lib/accounting/providers.js";
import { encryptToken } from "../src/lib/accounting/crypto.js";
import type { NotifyConnectionError } from "../src/lib/accounting/notify.js";

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

// ---- in-memory db stand-in -------------------------------------------------

function makeAdapter(rows: AccountingConnection[]): {
  adapter: AccountingDbAdapter;
  rowMap: Map<number, AccountingConnection>;
} {
  const rowMap = new Map<number, AccountingConnection>();
  for (const r of rows) rowMap.set(r.id, { ...r });
  const adapter: AccountingDbAdapter = {
    async listConnections() {
      // Preserve insertion order so the sweep iterates in a predictable order.
      return Array.from(rowMap.values()).map((r) => ({ ...r }));
    },
    async updateConnection(id, values) {
      const existing = rowMap.get(id);
      if (!existing) return undefined;
      const merged = { ...existing, ...values } as AccountingConnection;
      rowMap.set(id, merged);
      return { ...merged };
    },
  };
  return { adapter, rowMap };
}

// ---- fixtures --------------------------------------------------------------

const FIXED_NOW = new Date("2026-04-29T12:00:00Z");

function makeConnection(
  overrides: Partial<AccountingConnection> = {},
): AccountingConnection {
  return {
    id: 1,
    modelId: 100,
    userId: 7,
    provider: "quickbooks",
    status: "connected",
    realmId: "realm-123",
    realmDisplayName: "Acme School - QBO",
    accessTokenEncrypted: encryptToken("access-tok"),
    refreshTokenEncrypted: encryptToken("refresh-tok"),
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 30 * 60 * 1000),
    lastSyncedAt: null,
    lastSyncError: null,
    snapshotJson: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  } as AccountingConnection;
}

interface ProviderStub {
  client: ProviderClient;
  calls: { refresh: number; fetch: number };
}

function makeProvider(
  opts: {
    configured?: boolean;
    fetchSnapshot?: AccountingSyncSnapshot;
    fetchError?: string;
    refreshExpiresAt?: Date;
  } = {},
): ProviderStub {
  const calls = { refresh: 0, fetch: 0 };
  const client: ProviderClient = {
    provider: "quickbooks",
    isConfigured: () => opts.configured ?? true,
    getAuthorizeUrl: () => "https://example.com/auth",
    exchangeCode: async () => {
      throw new Error("not used in this test");
    },
    refreshAccessToken: async () => {
      calls.refresh++;
      return {
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
        expiresAt: opts.refreshExpiresAt ?? new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
      };
    },
    fetchProfitAndLoss: async () => {
      calls.fetch++;
      if (opts.fetchError) throw new Error(opts.fetchError);
      return (
        opts.fetchSnapshot ?? {
          periodEnd: "2026-04-30",
          monthsCompleted: 4,
          revenue: 250_000,
          expenses: 230_000,
          monthlyRent: 5_000,
        }
      );
    },
  };
  return { client, calls };
}

// ---- tests -----------------------------------------------------------------

async function testHappyPath(): Promise<void> {
  console.log("\n— sync: happy path updates lastSyncedAt and clears errors —");
  const conn = makeConnection({ lastSyncError: "stale failure" });
  const { adapter, rowMap } = makeAdapter([conn]);
  const { client } = makeProvider();

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });

  check("returns ok", result.ok === true);
  const row = rowMap.get(conn.id)!;
  check("lastSyncedAt populated", row.lastSyncedAt instanceof Date);
  check(
    "lastSyncError cleared",
    row.lastSyncError === null,
    `got ${JSON.stringify(row.lastSyncError)}`,
  );
  check("status set to connected", row.status === "connected");
  check(
    "snapshotJson stored",
    row.snapshotJson?.revenue === 250_000,
    `snapshot=${JSON.stringify(row.snapshotJson)}`,
  );
  check(
    "snapshot inherits realm display name",
    row.snapshotJson?.realmDisplayName === "Acme School - QBO",
  );
}

async function testFailurePreservesLastSync(): Promise<void> {
  console.log("\n— sync: provider failure records error but keeps last successful sync —");
  const lastGood = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000);
  const conn = makeConnection({
    lastSyncedAt: lastGood,
    snapshotJson: {
      periodEnd: "2026-03-31",
      monthsCompleted: 3,
      revenue: 100_000,
      expenses: 90_000,
    },
  });
  const { adapter, rowMap } = makeAdapter([conn]);
  const { client } = makeProvider({ fetchError: "QuickBooks 503" });

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });
  check("returns not ok", result.ok === false);
  const row = rowMap.get(conn.id)!;
  check(
    "lastSyncedAt preserved",
    row.lastSyncedAt?.getTime() === lastGood.getTime(),
    `got ${row.lastSyncedAt?.toISOString()}`,
  );
  check(
    "lastSyncError populated",
    typeof row.lastSyncError === "string" && row.lastSyncError!.includes("503"),
  );
  check("status set to error", row.status === "error");
  check(
    "snapshotJson preserved",
    row.snapshotJson?.revenue === 100_000,
    `snapshot=${JSON.stringify(row.snapshotJson)}`,
  );
}

async function testProactiveTokenRefresh(): Promise<void> {
  console.log("\n— sync: refreshes the access token when it's about to expire —");
  const conn = makeConnection({
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 5_000), // ~5s left
  });
  const { adapter } = makeAdapter([conn]);
  const { client, calls } = makeProvider();

  await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });
  check("refresh called", calls.refresh === 1, `refresh count=${calls.refresh}`);
  check("fetch called", calls.fetch === 1, `fetch count=${calls.fetch}`);
}

async function testSweepIteratesAllConnections(): Promise<void> {
  console.log("\n— scheduler: sweep iterates every eligible connection —");
  const okConn = makeConnection({ id: 1 });
  const errConn = makeConnection({ id: 2, modelId: 200 });
  const incomplete = makeConnection({
    id: 3,
    modelId: 300,
    accessTokenEncrypted: null,
  });
  const { adapter, rowMap } = makeAdapter([okConn, errConn, incomplete]);

  // A single shared provider client whose `fetchProfitAndLoss` succeeds for
  // the first eligible row and fails for the second. Sequencing relies on
  // the fact that the sweep iterates rows in insertion order.
  let fetchCount = 0;
  const sharedClient: ProviderClient = {
    provider: "quickbooks",
    isConfigured: () => true,
    getAuthorizeUrl: () => "https://example.com/auth",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => ({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
    }),
    fetchProfitAndLoss: async () => {
      fetchCount++;
      if (fetchCount === 1) {
        return {
          periodEnd: "2026-04-30",
          monthsCompleted: 4,
          revenue: 250_000,
          expenses: 230_000,
        };
      }
      throw new Error("boom");
    },
  };

  const summary = await runSyncSweep({
    dbAdapter: adapter,
    getProviderClient: () => sharedClient,
    notifyConnectionError: async () => {},
  });

  check(
    "attempted both eligible rows",
    summary.attempted === 2,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "skipped the row missing tokens",
    summary.skipped === 1,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "first row updated successfully",
    rowMap.get(okConn.id)!.snapshotJson?.revenue === 250_000,
  );
  check(
    "second row recorded failure",
    rowMap.get(errConn.id)!.status === "error" &&
      rowMap.get(errConn.id)!.lastSyncError?.includes("boom") === true,
    `row=${JSON.stringify(rowMap.get(errConn.id))}`,
  );
  check(
    "incomplete row left untouched",
    rowMap.get(incomplete.id)!.lastSyncedAt === null &&
      rowMap.get(incomplete.id)!.status === "connected",
  );
  check(
    "succeeded count matches",
    summary.succeeded === 1,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "failed count matches",
    summary.failed === 1,
    `summary=${JSON.stringify(summary)}`,
  );
}

async function testSweepNotifiesOnConnectedToErrorTransition(): Promise<void> {
  console.log(
    "\n— scheduler: emails founder only when a connection flips connected → error —",
  );

  // Three rows exercise every relevant transition case in a single sweep:
  //   1. previously connected, this sync fails → MUST notify
  //   2. previously errored, this sync also fails → MUST NOT re-notify
  //      (satisfies "one notification per failure-onset" from the task spec)
  //   3. previously connected, this sync succeeds → MUST NOT notify
  const flippingConn = makeConnection({ id: 11, modelId: 110, status: "connected" });
  const stayingErrConn = makeConnection({
    id: 12,
    modelId: 120,
    status: "error",
    lastSyncError: "previous failure",
  });
  const recoveringConn = makeConnection({ id: 13, modelId: 130, status: "connected" });
  const { adapter, rowMap } = makeAdapter([
    flippingConn,
    stayingErrConn,
    recoveringConn,
  ]);

  let fetchCount = 0;
  const sharedClient: ProviderClient = {
    provider: "quickbooks",
    isConfigured: () => true,
    getAuthorizeUrl: () => "https://example.com/auth",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => ({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
    }),
    fetchProfitAndLoss: async () => {
      fetchCount++;
      // Fail on the first two rows (the connected→error and the error→error
      // cases), succeed on the third (the recovery case). Iteration order is
      // insertion order, so this aligns with the row layout above.
      if (fetchCount <= 2) throw new Error(`provider exploded: row ${fetchCount}`);
      return {
        periodEnd: "2026-04-30",
        monthsCompleted: 4,
        revenue: 100_000,
        expenses: 90_000,
      };
    },
  };

  const notified: { connectionId: number; errorMessage: string }[] = [];
  const notify: NotifyConnectionError = async (conn, errorMessage) => {
    notified.push({ connectionId: conn.id, errorMessage });
  };

  const summary = await runSyncSweep({
    dbAdapter: adapter,
    getProviderClient: () => sharedClient,
    notifyConnectionError: notify,
  });

  check(
    "summary reflects 2 failures + 1 success",
    summary.attempted === 3 && summary.failed === 2 && summary.succeeded === 1,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "exactly one notification fired",
    notified.length === 1,
    `notified=${JSON.stringify(notified)}`,
  );
  check(
    "notification targets the row that just flipped",
    notified[0]?.connectionId === flippingConn.id,
    `notified[0]=${JSON.stringify(notified[0])}`,
  );
  check(
    "notification carries the provider error message",
    notified[0]?.errorMessage.includes("provider exploded"),
    `errorMessage=${notified[0]?.errorMessage}`,
  );
  check(
    "previously-errored row stayed in error",
    rowMap.get(stayingErrConn.id)!.status === "error",
  );
  check(
    "recovered row is back to connected",
    rowMap.get(recoveringConn.id)!.status === "connected",
  );
}

function testDecideRefresh(): void {
  console.log("\n— scheduler: decideRefresh staleness rules —");
  // Token is far away AND snapshot is fresh — leave alone.
  const fresh = decideRefresh(
    {
      tokenExpiresAt: new Date(FIXED_NOW.getTime() + 48 * 60 * 60 * 1000),
      lastSyncedAt: new Date(FIXED_NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
    FIXED_NOW,
  );
  check("fresh row is skipped", fresh.refresh === false, `decision=${JSON.stringify(fresh)}`);

  // Token is within 24h of expiry — refresh to keep grant warm.
  const tokenSoon = decideRefresh(
    {
      tokenExpiresAt: new Date(FIXED_NOW.getTime() + 6 * 60 * 60 * 1000),
      lastSyncedAt: new Date(FIXED_NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
    FIXED_NOW,
  );
  check(
    "token-expiring row triggers refresh",
    tokenSoon.refresh === true && tokenSoon.reason === "token-expiring",
    `decision=${JSON.stringify(tokenSoon)}`,
  );

  // Snapshot is older than 7 days — refresh even if token is fine.
  const stale = decideRefresh(
    {
      tokenExpiresAt: new Date(FIXED_NOW.getTime() + 48 * 60 * 60 * 1000),
      lastSyncedAt: new Date(FIXED_NOW.getTime() - 8 * 24 * 60 * 60 * 1000),
    },
    FIXED_NOW,
  );
  check(
    "stale-snapshot row triggers refresh",
    stale.refresh === true && stale.reason === "snapshot-stale",
    `decision=${JSON.stringify(stale)}`,
  );

  // Never synced — refresh.
  const neverSynced = decideRefresh(
    {
      tokenExpiresAt: new Date(FIXED_NOW.getTime() + 48 * 60 * 60 * 1000),
      lastSyncedAt: null,
    },
    FIXED_NOW,
  );
  check(
    "never-synced row triggers refresh",
    neverSynced.refresh === true && neverSynced.reason === "never-synced",
    `decision=${JSON.stringify(neverSynced)}`,
  );

  // Missing token expiry is treated as "unknown / probably expired" — refresh.
  const noExpiry = decideRefresh(
    { tokenExpiresAt: null, lastSyncedAt: new Date(FIXED_NOW.getTime() - 60_000) },
    FIXED_NOW,
  );
  check(
    "missing tokenExpiresAt triggers refresh",
    noExpiry.refresh === true && noExpiry.reason === "token-expiring",
    `decision=${JSON.stringify(noExpiry)}`,
  );
}

async function testSweepSkipsFreshConnections(): Promise<void> {
  console.log("\n— scheduler: sweep skips fresh connections, refreshes stale ones —");
  const freshConn = makeConnection({
    id: 10,
    modelId: 500,
    // Token has 48h left, snapshot synced 1 day ago.
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 48 * 60 * 60 * 1000),
    lastSyncedAt: new Date(FIXED_NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
    snapshotJson: {
      periodEnd: "2026-04-28",
      monthsCompleted: 4,
      revenue: 100_000,
      expenses: 90_000,
    },
  });
  const staleConn = makeConnection({
    id: 11,
    modelId: 501,
    // Token has 48h left, but snapshot is 8 days old.
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 48 * 60 * 60 * 1000),
    lastSyncedAt: new Date(FIXED_NOW.getTime() - 8 * 24 * 60 * 60 * 1000),
    snapshotJson: {
      periodEnd: "2026-04-21",
      monthsCompleted: 3,
      revenue: 80_000,
      expenses: 70_000,
    },
  });
  const tokenSoonConn = makeConnection({
    id: 12,
    modelId: 502,
    // Token expires in 1h, snapshot synced 1h ago.
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
    lastSyncedAt: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000),
  });
  const { adapter, rowMap } = makeAdapter([freshConn, staleConn, tokenSoonConn]);

  let fetchCount = 0;
  const sharedClient: ProviderClient = {
    provider: "quickbooks",
    isConfigured: () => true,
    getAuthorizeUrl: () => "https://example.com/auth",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => ({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
    }),
    fetchProfitAndLoss: async () => {
      fetchCount++;
      return {
        periodEnd: "2026-04-30",
        monthsCompleted: 4,
        revenue: 999_000,
        expenses: 800_000,
      };
    },
  };

  const summary = await runSyncSweep({
    dbAdapter: adapter,
    getProviderClient: () => sharedClient,
    // Stub out the notifier so the sweep doesn't try to load the real mailer.
    notifyConnectionError: async () => {},
  });

  check(
    "fresh row was skipped",
    summary.skipped === 1,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "two stale rows were attempted",
    summary.attempted === 2,
    `summary=${JSON.stringify(summary)}`,
  );
  check(
    "fetchProfitAndLoss called only for stale rows",
    fetchCount === 2,
    `fetchCount=${fetchCount}`,
  );
  check(
    "fresh row's snapshot left untouched",
    rowMap.get(freshConn.id)!.snapshotJson?.revenue === 100_000,
  );
  check(
    "stale row's snapshot was updated",
    rowMap.get(staleConn.id)!.snapshotJson?.revenue === 999_000,
  );
}

async function main(): Promise<void> {
  await testHappyPath();
  await testFailurePreservesLastSync();
  await testProactiveTokenRefresh();
  await testSweepIteratesAllConnections();
  await testSweepNotifiesOnConnectedToErrorTransition();
  testDecideRefresh();
  await testSweepSkipsFreshConnections();

  console.log("\n========================");
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
  console.log("All accounting scheduler tests passed.");
}

void main();
