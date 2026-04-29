// Reusable per-connection sync logic shared by the on-demand "Sync now" route
// and the daily background scheduler. Both entry points need exactly the same
// token-refresh + P&L-fetch + row-update sequence, so factoring it out keeps
// the two flows in lockstep and lets us unit-test the happy/error paths
// without spinning an HTTP request.
import { eq } from "drizzle-orm";
import {
  db as defaultDb,
  accountingConnectionsTable,
  type AccountingConnection,
} from "@workspace/db";
import { encryptToken, decryptToken } from "./crypto";
import {
  applyAccountMappings,
  getProviderClient as defaultGetProviderClient,
  isAccountingProvider,
  type ProviderClient,
} from "./providers";
import type { AccountKind } from "@workspace/db";

export type AccountingSyncResult =
  | { ok: true; connection: AccountingConnection }
  | { ok: false; error: string; connection?: AccountingConnection };

// Thin database adapter used by the sync helper. Production wires it to
// drizzle via `defaultDbAdapter`; tests stub an in-memory implementation so
// the helper can be exercised without a real Postgres.
export interface AccountingDbAdapter {
  listConnections(): Promise<AccountingConnection[]>;
  updateConnection(
    id: number,
    values: Partial<AccountingConnection>,
  ): Promise<AccountingConnection | undefined>;
}

export interface SyncDeps {
  dbAdapter?: AccountingDbAdapter;
  getProviderClient?: typeof defaultGetProviderClient;
}

const REFRESH_LEAD_MS = 60_000;

// Drizzle-backed adapter used in production. Lazily instantiated via
// `getDefaultDbAdapter()` so importing this module never crashes when
// `DATABASE_URL` is unset (tests).
let cachedDefaultAdapter: AccountingDbAdapter | null = null;

export function getDefaultDbAdapter(): AccountingDbAdapter | null {
  if (cachedDefaultAdapter) return cachedDefaultAdapter;
  if (!defaultDb) return null;
  const db = defaultDb;
  cachedDefaultAdapter = {
    async listConnections() {
      return await db.select().from(accountingConnectionsTable);
    },
    async updateConnection(id, values) {
      const [row] = await db
        .update(accountingConnectionsTable)
        .set(values)
        .where(eq(accountingConnectionsTable.id, id))
        .returning();
      return row;
    },
  };
  return cachedDefaultAdapter;
}

export async function syncAccountingConnection(
  conn: AccountingConnection,
  deps: SyncDeps = {},
): Promise<AccountingSyncResult> {
  const dbAdapter = deps.dbAdapter ?? getDefaultDbAdapter();
  const getProviderClient = deps.getProviderClient ?? defaultGetProviderClient;

  if (!dbAdapter) {
    return { ok: false, error: "Database not configured" };
  }
  if (!isAccountingProvider(conn.provider)) {
    return { ok: false, error: `Unsupported provider: ${String(conn.provider)}` };
  }
  if (!conn.accessTokenEncrypted || !conn.refreshTokenEncrypted || !conn.realmId) {
    return { ok: false, error: "Connection is missing tokens or realm id" };
  }
  const client: ProviderClient = getProviderClient(conn.provider);
  if (!client.isConfigured()) {
    return { ok: false, error: `${conn.provider} provider not configured on this server` };
  }

  try {
    let accessToken = decryptToken(conn.accessTokenEncrypted);
    let refreshToken = decryptToken(conn.refreshTokenEncrypted);
    let tokenExpiresAt = conn.tokenExpiresAt ?? new Date(0);

    // Refresh proactively when the access token has less than a minute of
    // life. Daily background syncs almost always need this because access
    // tokens default to ~60 minutes; we also rotate the refresh token so
    // Xero's rolling-refresh policy doesn't silently expire the connection.
    if (tokenExpiresAt.getTime() - Date.now() < REFRESH_LEAD_MS) {
      const refreshed = await client.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      tokenExpiresAt = refreshed.expiresAt;
      await dbAdapter.updateConnection(conn.id, {
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: encryptToken(refreshToken),
        tokenExpiresAt,
        updatedAt: new Date(),
      });
    }

    const { snapshot: rawSnapshot, discoveredAccounts } =
      await client.fetchProfitAndLoss(accessToken, conn.realmId);

    // Drop any saved mapping entries that no longer have a matching account
    // in the latest sync — keeps the persisted mapping tidy when the chart
    // of accounts changes between syncs.
    const currentKeys = new Set(discoveredAccounts.map((a) => a.key));
    const prunedMappings: Record<string, AccountKind> = {};
    for (const [k, v] of Object.entries(conn.accountMappingsJson ?? {})) {
      if (currentKeys.has(k)) prunedMappings[k] = v;
    }
    // Apply the founder's mapping (if any) on top of the auto-detected
    // snapshot so a school whose chart of accounts uses non-standard names
    // still gets the right revenue/expense/rent totals.
    const snapshot = applyAccountMappings(
      rawSnapshot,
      discoveredAccounts,
      prunedMappings,
    );
    // Annotate the snapshot with the realm display name so the actuals
    // editor can show "From QuickBooks (Acme School - QBO)".
    if (conn.realmDisplayName && !snapshot.realmDisplayName) {
      snapshot.realmDisplayName = conn.realmDisplayName;
    }

    const now = new Date();
    const updated = await dbAdapter.updateConnection(conn.id, {
      snapshotJson: snapshot,
      discoveredAccountsJson: discoveredAccounts,
      accountMappingsJson: prunedMappings,
      lastSyncedAt: now,
      lastSyncError: null,
      status: "connected",
      updatedAt: now,
    });
    if (!updated) {
      return { ok: false, error: "Connection row was deleted mid-sync" };
    }
    return { ok: true, connection: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist the failure so the founder UI can show the reason on the next
    // page load. We deliberately do NOT touch `lastSyncedAt` — that field is
    // the contract for "last successful sync time" and lets the UI keep
    // surfacing the freshness of the cached snapshot even when a transient
    // provider failure or expired refresh token is also present.
    const updated = await dbAdapter.updateConnection(conn.id, {
      status: "error",
      lastSyncError: message.slice(0, 500),
      updatedAt: new Date(),
    });
    return { ok: false, error: message, connection: updated };
  }
}
