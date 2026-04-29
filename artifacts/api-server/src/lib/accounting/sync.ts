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
  getProviderClient as defaultGetProviderClient,
  isAccountingProvider,
  type ProviderClient,
} from "./providers";

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

    const snapshot = await client.fetchProfitAndLoss(accessToken, conn.realmId);
    if (conn.realmDisplayName && !snapshot.realmDisplayName) {
      snapshot.realmDisplayName = conn.realmDisplayName;
    }

    const now = new Date();
    const updated = await dbAdapter.updateConnection(conn.id, {
      snapshotJson: snapshot,
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
