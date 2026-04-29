// Routes that wire founder-controlled accounting connections (QuickBooks /
// Xero) to a financial model. The OAuth flow follows the standard "redirect
// user to provider, accept code at callback, exchange for tokens" three-step
// dance. Tokens never leave the server in plaintext — see ./../lib/accounting/
// crypto.ts for the at-rest cipher.
//
// Endpoints (all scoped to a model the caller owns):
//   GET    /api/models/:id/accounting               — read connection state
//   POST   /api/models/:id/accounting/:provider/connect   — initiate OAuth
//   GET    /api/accounting/:provider/callback             — finalize OAuth
//   POST   /api/models/:id/accounting/:provider/sync      — pull latest snapshot
//   PUT    /api/models/:id/accounting/:provider/mapping   — save account mapping
//   DELETE /api/models/:id/accounting/:provider           — disconnect
import { Router, type IRouter, type Response } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  accountingConnectionsTable,
  accountingMappingDefaultsTable,
  financialModelsTable,
  type AccountingProvider,
  type AccountingSyncSnapshot,
  type AccountKind,
  type DiscoveredAccount,
} from "@workspace/db";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import {
  applyAccountMappings,
  getProviderClient,
  isAccountKind,
  isAccountingProvider,
  providerDisplayName,
} from "../lib/accounting/providers";
import { encryptToken } from "../lib/accounting/crypto";
import { syncAccountingConnection } from "../lib/accounting/sync";

const router: IRouter = Router();

// In-memory OAuth state store. The OAuth round-trip is short-lived (a couple
// of minutes); persisting state to the DB would add row churn for no real
// benefit. If the api-server restarts mid-flow the founder simply re-clicks
// "Connect" — no data loss.
type OAuthState = {
  modelId: number;
  userId: number;
  provider: AccountingProvider;
  redirectUri: string;
  expiresAt: number;
};
const oauthStates = new Map<string, OAuthState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates(): void {
  const now = Date.now();
  for (const [k, v] of oauthStates.entries()) {
    if (v.expiresAt < now) oauthStates.delete(k);
  }
}

// Builds the absolute URL the provider should redirect back to. We honour the
// configured `APP_URL` in production; locally we accept the API host directly
// so OAuth works in dev without extra env juggling.
function buildCallbackUrl(req: AuthRequest, provider: AccountingProvider): string {
  const explicit = process.env.ACCOUNTING_OAUTH_REDIRECT_URI;
  if (explicit) return `${explicit.replace(/\/$/, "")}/${provider}/callback`;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ||
    req.protocol ||
    "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/accounting/${provider}/callback`;
}

async function ownsModel(userId: number, modelId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: financialModelsTable.id })
    .from(financialModelsTable)
    .where(
      and(
        eq(financialModelsTable.id, modelId),
        eq(financialModelsTable.userId, userId),
      ),
    )
    .limit(1);
  return !!row;
}

// Public-facing connection summary (never includes tokens). We expose the
// snapshot, the per-account totals from the latest sync, and the founder's
// saved mapping so the UI can render the "Customize account mapping" panel
// without a second round-trip.
//
// `availableDefault` is the user's last-saved mapping for the same
// (provider, realm) — present when a *different* model previously mapped
// this same QuickBooks/Xero company file. The UI uses it to offer a
// "Reuse last mapping" affordance on a freshly-connected model so founders
// don't re-classify the same accounts twice.
type AvailableDefault = {
  realmDisplayName: string | null;
  // Number of overrides in the saved default that match an account in the
  // current connection's discovered chart. We compute this server-side so
  // the UI can show "Reuse 4 customizations" without re-running the match.
  matchedCount: number;
  // Total overrides in the saved default (may include keys that don't
  // exist in the current chart yet — e.g. if the founder hasn't synced).
  totalCount: number;
  updatedAt: string;
  // The model the default was last saved from. Null when that source
  // model has been deleted (the default itself survives via SET NULL).
  sourceModelId: number | null;
  // Human-readable name of the source model, resolved server-side via a
  // JOIN against financial_models. Null when the source model has been
  // deleted (mirrors `sourceModelId === null`) or — defensively — when
  // the JOIN otherwise turns up empty. The UI shows this alongside the
  // realm so founders running multiple what-if models against the same
  // QuickBooks file know which model last edited the saved mapping.
  sourceModelName: string | null;
};

type PublicConnection = {
  provider: AccountingProvider;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  snapshot: AccountingSyncSnapshot | null;
  discoveredAccounts: DiscoveredAccount[];
  accountMappings: Record<string, AccountKind>;
  configured: boolean;
  availableDefault: AvailableDefault | null;
};

type ConnectionRowForPublic = {
  provider: string;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  snapshotJson: AccountingSyncSnapshot | null;
  discoveredAccountsJson: DiscoveredAccount[] | null;
  accountMappingsJson: Record<string, AccountKind> | null;
};

function toPublicConnection(
  row: ConnectionRowForPublic,
  availableDefault: AvailableDefault | null = null,
): PublicConnection {
  const provider = row.provider as AccountingProvider;
  const client = getProviderClient(provider);
  return {
    provider,
    status: row.status,
    realmDisplayName: row.realmDisplayName,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastSyncError: row.lastSyncError,
    snapshot: row.snapshotJson,
    discoveredAccounts: row.discoveredAccountsJson ?? [],
    accountMappings: row.accountMappingsJson ?? {},
    configured: client.isConfigured(),
    availableDefault,
  };
}

// Look up a saved (user, provider, realm) default and summarise it for the
// public connection payload. Returns null when no default exists (the UI
// hides the "Reuse last mapping" affordance in that case). Filtering
// against the current discovered chart happens here so the UI can show an
// honest "X customizations match your accounts" hint.
async function loadAvailableDefault(
  userId: number,
  provider: AccountingProvider,
  realmId: string | null,
  discovered: DiscoveredAccount[],
): Promise<AvailableDefault | null> {
  if (!realmId) return null;
  // LEFT JOIN financial_models so we can show the source model name in the
  // reuse prompt ("Last edited in 'Annex Site Plan'"). The defaults row's
  // sourceModelId column is ON DELETE SET NULL, so a deleted source model
  // simply yields a null on the join side — we surface that cleanly to the
  // UI rather than dropping the whole prompt.
  const [row] = await db
    .select({
      realmDisplayName: accountingMappingDefaultsTable.realmDisplayName,
      accountMappingsJson: accountingMappingDefaultsTable.accountMappingsJson,
      updatedAt: accountingMappingDefaultsTable.updatedAt,
      sourceModelId: accountingMappingDefaultsTable.sourceModelId,
      sourceModelName: financialModelsTable.name,
    })
    .from(accountingMappingDefaultsTable)
    .leftJoin(
      financialModelsTable,
      eq(financialModelsTable.id, accountingMappingDefaultsTable.sourceModelId),
    )
    .where(
      and(
        eq(accountingMappingDefaultsTable.userId, userId),
        eq(accountingMappingDefaultsTable.provider, provider),
        eq(accountingMappingDefaultsTable.realmId, realmId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const knownKeys = new Set(discovered.map((a) => a.key));
  const mapping = row.accountMappingsJson ?? {};
  let matched = 0;
  for (const k of Object.keys(mapping)) {
    if (knownKeys.has(k)) matched += 1;
  }
  return {
    realmDisplayName: row.realmDisplayName,
    matchedCount: matched,
    totalCount: Object.keys(mapping).length,
    updatedAt: row.updatedAt.toISOString(),
    sourceModelId: row.sourceModelId,
    sourceModelName: row.sourceModelName ?? null,
  };
}

// Persist the founder's mapping as the user-level default for this
// (provider, realm). Skipped silently when the connection isn't tied to a
// realm (defaults at this scope only make sense per company file). We
// always overwrite — the latest mapping wins, mirroring how the in-model
// mapping itself behaves on subsequent saves.
async function upsertMappingDefault(
  userId: number,
  provider: AccountingProvider,
  realmId: string | null,
  realmDisplayName: string | null,
  mappings: Record<string, AccountKind>,
  sourceModelId: number,
): Promise<void> {
  if (!realmId) return;
  const now = new Date();
  await db
    .insert(accountingMappingDefaultsTable)
    .values({
      userId,
      provider,
      realmId,
      realmDisplayName,
      accountMappingsJson: mappings,
      sourceModelId,
    })
    .onConflictDoUpdate({
      target: [
        accountingMappingDefaultsTable.userId,
        accountingMappingDefaultsTable.provider,
        accountingMappingDefaultsTable.realmId,
      ],
      set: {
        realmDisplayName,
        accountMappingsJson: mappings,
        sourceModelId,
        updatedAt: now,
      },
    });
}

// --- GET /api/models/:id/accounting ----------------------------------------
router.get(
  "/models/:id/accounting",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }
    try {
      const rows = await db
        .select({
          provider: accountingConnectionsTable.provider,
          status: accountingConnectionsTable.status,
          realmId: accountingConnectionsTable.realmId,
          realmDisplayName: accountingConnectionsTable.realmDisplayName,
          lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
          lastSyncError: accountingConnectionsTable.lastSyncError,
          snapshotJson: accountingConnectionsTable.snapshotJson,
          discoveredAccountsJson: accountingConnectionsTable.discoveredAccountsJson,
          accountMappingsJson: accountingConnectionsTable.accountMappingsJson,
        })
        .from(accountingConnectionsTable)
        .where(eq(accountingConnectionsTable.modelId, modelId));

      // Look up "Reuse last mapping" defaults in parallel — at most one per
      // connection (and there are at most two connections per model), so
      // the round-trip cost is negligible.
      const connections = await Promise.all(
        rows.map(async (row) => {
          const provider = row.provider as AccountingProvider;
          const discovered = row.discoveredAccountsJson ?? [];
          const availableDefault = await loadAvailableDefault(
            req.userId!,
            provider,
            row.realmId,
            discovered,
          );
          return toPublicConnection(row, availableDefault);
        }),
      );
      // Always advertise configured-ness for both providers so the UI can
      // disable a "Connect QuickBooks" button when the env var is missing,
      // even if the founder hasn't connected anything yet.
      const providers = (["quickbooks", "xero"] as AccountingProvider[]).map(
        (p) => ({
          provider: p,
          displayName: providerDisplayName(p),
          configured: getProviderClient(p).isConfigured(),
        }),
      );
      res.json({ connections, providers });
    } catch (err) {
      console.error("[accounting] list error:", err);
      res.status(500).json({ error: "Failed to load accounting connections." });
    }
  },
);

// --- POST /api/models/:id/accounting/:provider/connect ---------------------
router.post(
  "/models/:id/accounting/:provider/connect",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    const provider = req.params.provider;
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!isAccountingProvider(provider)) {
      res.status(400).json({ error: "Unsupported accounting provider." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }
    const client = getProviderClient(provider);
    if (!client.isConfigured()) {
      res.status(503).json({
        error: `${providerDisplayName(provider)} integration is not configured on this server. Add OAuth client credentials to enable it.`,
        configured: false,
      });
      return;
    }

    pruneExpiredStates();
    const state = crypto.randomBytes(24).toString("base64url");
    const redirectUri = buildCallbackUrl(req, provider);
    oauthStates.set(state, {
      modelId,
      userId: req.userId!,
      provider,
      redirectUri,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    const authorizeUrl = client.getAuthorizeUrl(state, redirectUri);
    res.json({ authorizeUrl, state });
  },
);

// --- GET /api/accounting/:provider/callback --------------------------------
// Public route — no auth header from the provider redirect; we authenticate
// the request by validating the opaque `state` we issued in /connect.
router.get(
  "/accounting/:provider/callback",
  async (req: AuthRequest, res: Response) => {
    const provider = req.params.provider;
    if (!isAccountingProvider(provider)) {
      res.status(400).send("Unsupported provider.");
      return;
    }
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const realmId = req.query.realmId ? String(req.query.realmId) : undefined;
    if (!code || !state) {
      res.status(400).send("Missing OAuth code or state.");
      return;
    }
    pruneExpiredStates();
    const stored = oauthStates.get(state);
    if (!stored || stored.provider !== provider) {
      res.status(400).send("OAuth state expired or invalid. Please retry from the model.");
      return;
    }
    oauthStates.delete(state);

    const client = getProviderClient(provider);
    try {
      const tokens = await client.exchangeCode(code, stored.redirectUri, realmId);
      await db
        .insert(accountingConnectionsTable)
        .values({
          modelId: stored.modelId,
          userId: stored.userId,
          provider,
          status: "connected",
          realmId: tokens.realmId,
          realmDisplayName: tokens.realmDisplayName ?? null,
          accessTokenEncrypted: encryptToken(tokens.accessToken),
          refreshTokenEncrypted: encryptToken(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            accountingConnectionsTable.modelId,
            accountingConnectionsTable.provider,
          ],
          set: {
            status: "connected",
            realmId: tokens.realmId,
            realmDisplayName: tokens.realmDisplayName ?? null,
            accessTokenEncrypted: encryptToken(tokens.accessToken),
            refreshTokenEncrypted: encryptToken(tokens.refreshToken),
            tokenExpiresAt: tokens.expiresAt,
            lastSyncError: null,
            updatedAt: new Date(),
          },
        });
      // Send the founder back to the scenarios page with a success flag so the
      // UI can show a confirmation banner.
      const appUrl = (process.env.APP_URL || "/").replace(/\/$/, "");
      res.redirect(
        `${appUrl}/model/${stored.modelId}/scenarios?accounting=connected&provider=${provider}`,
      );
    } catch (err) {
      console.error("[accounting] callback error:", err);
      const appUrl = (process.env.APP_URL || "/").replace(/\/$/, "");
      res.redirect(
        `${appUrl}/model/${stored.modelId}/scenarios?accounting=error&provider=${provider}`,
      );
    }
  },
);

// --- POST /api/models/:id/accounting/:provider/sync ------------------------
router.post(
  "/models/:id/accounting/:provider/sync",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    const provider = req.params.provider;
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!isAccountingProvider(provider)) {
      res.status(400).json({ error: "Unsupported accounting provider." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const [conn] = await db
      .select()
      .from(accountingConnectionsTable)
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      )
      .limit(1);
    if (!conn) {
      res.status(404).json({ error: "No connection for this provider." });
      return;
    }
    if (!conn.accessTokenEncrypted || !conn.refreshTokenEncrypted || !conn.realmId) {
      res.status(400).json({ error: "Connection is missing tokens. Reconnect to fix." });
      return;
    }

    // Delegate to the shared sync helper so the on-demand "Sync now" route
    // and the daily background scheduler stay byte-for-byte equivalent.
    const result = await syncAccountingConnection(conn);
    if (!result.ok) {
      console.error("[accounting] sync error:", result.error);
      res.status(502).json({ error: `Sync failed: ${result.error}` });
      return;
    }
    // Surface the user-level "Reuse last mapping" default alongside the
    // freshly synced connection so the UI can offer it without a second
    // round-trip. The matched-count is computed against whatever discovered
    // chart the helper persisted (may be empty if this is the first sync,
    // in which case the prompt still shows but with matchedCount=0).
    const availableDefault = await loadAvailableDefault(
      req.userId!,
      provider,
      result.connection.realmId,
      result.connection.discoveredAccountsJson ?? [],
    );
    res.json({
      connection: toPublicConnection(result.connection, availableDefault),
    });
  },
);

// --- PUT /api/models/:id/accounting/:provider/mapping ----------------------
// Save founder overrides for which accounts feed which suggestion bucket. We
// recompute the cached snapshot immediately from the discovered amounts so
// the actuals editor reflects the new mapping without waiting for the next
// sync. Body shape:  { mappings: { [accountKey]: "revenue"|"expense"|"rent"|"ignore" } }
router.put(
  "/models/:id/accounting/:provider/mapping",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    const provider = req.params.provider;
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!isAccountingProvider(provider)) {
      res.status(400).json({ error: "Unsupported accounting provider." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }
    const body = (req.body ?? {}) as { mappings?: unknown };
    if (!body.mappings || typeof body.mappings !== "object" || Array.isArray(body.mappings)) {
      res.status(400).json({ error: "Body must include a `mappings` object." });
      return;
    }

    const [conn] = await db
      .select()
      .from(accountingConnectionsTable)
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      )
      .limit(1);
    if (!conn) {
      res.status(404).json({ error: "No connection for this provider." });
      return;
    }
    const discovered = conn.discoveredAccountsJson ?? [];
    if (discovered.length === 0) {
      res.status(409).json({
        error:
          "Run a sync before customising the account mapping — there are no detected accounts yet.",
      });
      return;
    }

    // Validate + filter the incoming mapping. We silently drop unknown
    // account keys (defensive against stale UI state) and reject unknown
    // kinds so a typo can't quietly mis-classify a row.
    const validKeys = new Set(discovered.map((a) => a.key));
    const cleaned: Record<string, AccountKind> = {};
    for (const [k, v] of Object.entries(body.mappings as Record<string, unknown>)) {
      if (!validKeys.has(k)) continue;
      if (!isAccountKind(v)) {
        res.status(400).json({ error: `Invalid account kind for "${k}".` });
        return;
      }
      cleaned[k] = v;
    }

    // Recompute the cached snapshot in-place. Preserve the existing period /
    // months / enrollment / realm metadata since those came from the last
    // sync's report header.
    const baseSnapshot: AccountingSyncSnapshot = conn.snapshotJson ?? {
      periodEnd: new Date().toISOString().slice(0, 10),
      monthsCompleted: 12,
    };
    const snapshot = applyAccountMappings(baseSnapshot, discovered, cleaned);
    if (conn.realmDisplayName && !snapshot.realmDisplayName) {
      snapshot.realmDisplayName = conn.realmDisplayName;
    }

    const [updated] = await db
      .update(accountingConnectionsTable)
      .set({
        snapshotJson: snapshot,
        accountMappingsJson: cleaned,
        updatedAt: new Date(),
      })
      .where(eq(accountingConnectionsTable.id, conn.id))
      .returning({
        provider: accountingConnectionsTable.provider,
        status: accountingConnectionsTable.status,
        realmDisplayName: accountingConnectionsTable.realmDisplayName,
        lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
        lastSyncError: accountingConnectionsTable.lastSyncError,
        snapshotJson: accountingConnectionsTable.snapshotJson,
        discoveredAccountsJson: accountingConnectionsTable.discoveredAccountsJson,
        accountMappingsJson: accountingConnectionsTable.accountMappingsJson,
      });

    // Mirror the saved mapping into the user-level default so a *different*
    // model that connects the same QuickBooks/Xero realm later can offer
    // "Reuse last mapping". Best-effort: a default-write failure should
    // not leak through and look like the in-model save failed.
    try {
      await upsertMappingDefault(
        req.userId!,
        provider,
        conn.realmId,
        conn.realmDisplayName,
        cleaned,
        modelId,
      );
    } catch (err) {
      console.error("[accounting] failed to upsert mapping default:", err);
    }

    const availableDefault = await loadAvailableDefault(
      req.userId!,
      provider,
      conn.realmId,
      discovered,
    );
    res.json({ connection: toPublicConnection(updated, availableDefault) });
  },
);

// --- POST /api/models/:id/accounting/:provider/apply-default --------------
// Copies the user's saved (provider, realm) default into the current
// model's connection. Mirrors the PUT /mapping recompute path so the
// snapshot reflects the reused mapping immediately. Founders can edit the
// applied mapping freely afterwards — saving back through PUT /mapping
// updates this model's mapping AND refreshes the user-level default. The
// other model that originally produced the default keeps its own stored
// mapping unchanged (defaults live in their own table).
router.post(
  "/models/:id/accounting/:provider/apply-default",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    const provider = req.params.provider;
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!isAccountingProvider(provider)) {
      res.status(400).json({ error: "Unsupported accounting provider." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const [conn] = await db
      .select()
      .from(accountingConnectionsTable)
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      )
      .limit(1);
    if (!conn) {
      res.status(404).json({ error: "No connection for this provider." });
      return;
    }
    if (!conn.realmId) {
      res.status(409).json({
        error: "Connection is missing a realm id; reconnect to enable defaults.",
      });
      return;
    }
    const discovered = conn.discoveredAccountsJson ?? [];
    if (discovered.length === 0) {
      res.status(409).json({
        error:
          "Run a sync before reusing a saved mapping — there are no detected accounts yet.",
      });
      return;
    }

    const [defaultRow] = await db
      .select({
        accountMappingsJson: accountingMappingDefaultsTable.accountMappingsJson,
      })
      .from(accountingMappingDefaultsTable)
      .where(
        and(
          eq(accountingMappingDefaultsTable.userId, req.userId!),
          eq(accountingMappingDefaultsTable.provider, provider),
          eq(accountingMappingDefaultsTable.realmId, conn.realmId),
        ),
      )
      .limit(1);
    if (!defaultRow) {
      res.status(404).json({
        error: "No saved mapping found for this company file yet.",
      });
      return;
    }

    // Filter the saved mapping against the current chart so we never
    // persist references to accounts that aren't in this connection's
    // discovered set (the chart of accounts may have shifted between
    // models / since the default was first saved).
    const validKeys = new Set(discovered.map((a) => a.key));
    const reused: Record<string, AccountKind> = {};
    for (const [k, v] of Object.entries(defaultRow.accountMappingsJson ?? {})) {
      if (validKeys.has(k) && isAccountKind(v)) reused[k] = v;
    }

    const baseSnapshot: AccountingSyncSnapshot = conn.snapshotJson ?? {
      periodEnd: new Date().toISOString().slice(0, 10),
      monthsCompleted: 12,
    };
    const snapshot = applyAccountMappings(baseSnapshot, discovered, reused);
    if (conn.realmDisplayName && !snapshot.realmDisplayName) {
      snapshot.realmDisplayName = conn.realmDisplayName;
    }

    const [updated] = await db
      .update(accountingConnectionsTable)
      .set({
        snapshotJson: snapshot,
        accountMappingsJson: reused,
        updatedAt: new Date(),
      })
      .where(eq(accountingConnectionsTable.id, conn.id))
      .returning({
        provider: accountingConnectionsTable.provider,
        status: accountingConnectionsTable.status,
        realmDisplayName: accountingConnectionsTable.realmDisplayName,
        lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
        lastSyncError: accountingConnectionsTable.lastSyncError,
        snapshotJson: accountingConnectionsTable.snapshotJson,
        discoveredAccountsJson: accountingConnectionsTable.discoveredAccountsJson,
        accountMappingsJson: accountingConnectionsTable.accountMappingsJson,
      });
    const availableDefault = await loadAvailableDefault(
      req.userId!,
      provider,
      conn.realmId,
      discovered,
    );
    res.json({
      connection: toPublicConnection(updated, availableDefault),
      appliedCount: Object.keys(reused).length,
    });
  },
);

// --- DELETE /api/models/:id/accounting/:provider --------------------------
router.delete(
  "/models/:id/accounting/:provider",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const modelId = Number(req.params.id);
    const provider = req.params.provider;
    if (!Number.isFinite(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id." });
      return;
    }
    if (!isAccountingProvider(provider)) {
      res.status(400).json({ error: "Unsupported accounting provider." });
      return;
    }
    if (!(await ownsModel(req.userId!, modelId))) {
      res.status(404).json({ error: "Model not found." });
      return;
    }
    await db
      .delete(accountingConnectionsTable)
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      );
    res.json({ success: true });
  },
);

export default router;
