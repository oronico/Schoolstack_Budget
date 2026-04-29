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
  deriveEnrollmentFromTag,
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

    // Pull P&L. The provider returns BOTH the parsed snapshot and the
    // per-account amounts ("discovered accounts"). We persist the discovered
    // list so the founder-facing mapping UI can re-classify accounts later
    // without re-hitting the provider, and we re-apply any existing mapping
    // overrides on top of the freshly fetched amounts so this sync's
    // snapshot already reflects the founder's preferences.
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
    // Apply the founder's (pruned) mapping on top of the auto-detected
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

    // Refresh the candidate enrollment containers every sync so the picker UI
    // stays accurate as the school adds/removes student classes. If the
    // founder has already selected one, fold its current count into the
    // snapshot's `enrollment` field — that's what makes the actuals editor's
    // "Suggest from latest data" badge prefer the live count over the
    // prior-year typed-in number.
    //
    // We're intentionally lenient about provider failures here: a 4xx/5xx
    // from the enrollment endpoints should NOT roll back a successful P&L
    // sync. We log the failure into `lastSyncError` only when it's the
    // primary cause (i.e. when the P&L succeeded but enrollment failed in a
    // way the founder needs to act on, the mapping picker UI will still
    // show the prior list).
    let discoveredEnrollmentTags = conn.discoveredEnrollmentTagsJson ?? null;
    try {
      discoveredEnrollmentTags = await client.fetchEnrollmentSources(
        accessToken,
        conn.realmId,
      );
    } catch {
      // Keep the previously-cached list rather than wiping it; the founder's
      // selection is still meaningful even when this list call hiccups.
    }
    const enrollmentTag = conn.enrollmentTagJson ?? null;
    if (enrollmentTag) {
      let count = deriveEnrollmentFromTag(enrollmentTag, discoveredEnrollmentTags);
      // If the founder's saved tag isn't in the freshly-fetched list (e.g.
      // because the parent class no longer has any active children, or the
      // list call failed), do a targeted lookup. This guarantees a single
      // source of truth: the snapshot only carries enrollment when we can
      // ACTIVELY confirm the count from the provider, never a stale value
      // baked into another field.
      if (count === undefined) {
        try {
          const direct = await client.fetchEnrollmentCount(
            accessToken,
            conn.realmId,
            enrollmentTag,
          );
          if (direct !== undefined && direct > 0) count = direct;
        } catch {
          // Same lenient behaviour: leave snapshot.enrollment unset rather
          // than failing the whole sync.
        }
      }
      if (count !== undefined) snapshot.enrollment = count;
    }

    const now = new Date();
    const updated = await dbAdapter.updateConnection(conn.id, {
      snapshotJson: snapshot,
      discoveredAccountsJson: discoveredAccounts,
      accountMappingsJson: prunedMappings,
      discoveredEnrollmentTagsJson: discoveredEnrollmentTags,
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
