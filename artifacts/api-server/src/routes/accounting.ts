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
//   POST   /api/models/:id/accounting/:provider/apply-default — reuse saved default
//   DELETE /api/models/:id/accounting/:provider/default   — forget saved default
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
  type DiscoveredEnrollmentTag,
  type DroppedAccountMapping,
  type EnrollmentTagRef,
} from "@workspace/db";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import {
  applyAccountMappings,
  getProviderClient,
  isAccountKind,
  isAccountingProvider,
  isEnrollmentTagRef,
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
  // The currently-saved enrollment tag, or null when the founder hasn't
  // picked one. The UI uses this to show "Currently tracking: <name>" and to
  // pre-select the dropdown.
  enrollmentTag: EnrollmentTagRef | null;
  // Candidate tags from the most recent sync. Drives the picker dropdown
  // ("Students FY26 — 82 students"). Empty until the first sync runs.
  discoveredEnrollmentTags: DiscoveredEnrollmentTag[];
  // Mapping entries pruned by recent sync(s) because their keys vanished
  // from the latest P&L. The UI surfaces this as a "X mapped accounts no
  // longer appear in your books" warning.
  droppedMappings: DroppedAccountMapping[];
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
  enrollmentTagJson: EnrollmentTagRef | null;
  discoveredEnrollmentTagsJson: DiscoveredEnrollmentTag[] | null;
  droppedMappingsJson: DroppedAccountMapping[] | null;
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
    enrollmentTag: row.enrollmentTagJson,
    discoveredEnrollmentTags: row.discoveredEnrollmentTagsJson ?? [],
    droppedMappings: row.droppedMappingsJson ?? [],
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

// Column projection used by every read query that hydrates a PublicConnection.
// Keeps the SELECT list and the `toPublicConnection` row shape in lockstep so
// adding a new field only requires touching this object + the type above.
const publicConnectionColumns = {
  provider: accountingConnectionsTable.provider,
  status: accountingConnectionsTable.status,
  realmDisplayName: accountingConnectionsTable.realmDisplayName,
  lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
  lastSyncError: accountingConnectionsTable.lastSyncError,
  snapshotJson: accountingConnectionsTable.snapshotJson,
  discoveredAccountsJson: accountingConnectionsTable.discoveredAccountsJson,
  accountMappingsJson: accountingConnectionsTable.accountMappingsJson,
  enrollmentTagJson: accountingConnectionsTable.enrollmentTagJson,
  discoveredEnrollmentTagsJson:
    accountingConnectionsTable.discoveredEnrollmentTagsJson,
  droppedMappingsJson: accountingConnectionsTable.droppedMappingsJson,
} as const;

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
          ...publicConnectionColumns,
          // Needed for the per-row `loadAvailableDefault` lookup below; not
          // exposed in the public payload directly.
          realmId: accountingConnectionsTable.realmId,
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
    // and the daily background scheduler stay byte-for-byte equivalent. The
    // helper handles the dropped-mappings detection so any newly-renamed
    // accounts are surfaced to the founder via the connection card warning.
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

    // Saving the mapping is the founder's signal that they've reviewed the
    // current chart of accounts, so clear any outstanding "dropped mapping"
    // warning at the same time. Anything still missing will show up again
    // on the next sync if it's still missing then.
    const [updated] = await db
      .update(accountingConnectionsTable)
      .set({
        snapshotJson: snapshot,
        accountMappingsJson: cleaned,
        droppedMappingsJson: [],
        updatedAt: new Date(),
      })
      .where(eq(accountingConnectionsTable.id, conn.id))
      .returning(publicConnectionColumns);

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
      .returning(publicConnectionColumns);
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

// --- DELETE /api/models/:id/accounting/:provider/default ------------------
// Forgets the user's saved (provider, realm) mapping default. Used by the
// "Forget saved mapping" link on the reuse prompt so a founder whose chart
// of accounts has shifted can stop being prompted to reuse a stale default
// without database access. We scope by model so we can reuse the existing
// ownership check + look up the realm from the connection — the default
// row itself is keyed on (userId, provider, realmId).
router.delete(
  "/models/:id/accounting/:provider/default",
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

    // Look up the connection so we can resolve the realmId. We don't
    // require the connection to be in any particular state — a founder
    // should be able to forget the default even if the connection is
    // mid-error or hasn't synced yet.
    const [conn] = await db
      .select({ realmId: accountingConnectionsTable.realmId })
      .from(accountingConnectionsTable)
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      )
      .limit(1);
    if (!conn || !conn.realmId) {
      res.status(404).json({
        error: "No connection with a known company file for this provider.",
      });
      return;
    }

    const deleted = await db
      .delete(accountingMappingDefaultsTable)
      .where(
        and(
          eq(accountingMappingDefaultsTable.userId, req.userId!),
          eq(accountingMappingDefaultsTable.provider, provider),
          eq(accountingMappingDefaultsTable.realmId, conn.realmId),
        ),
      )
      .returning({ id: accountingMappingDefaultsTable.id });

    res.json({ success: true, removed: deleted.length });
  },
);

// --- PUT /api/models/:id/accounting/:provider/enrollment-tag ---------------
// Save (or clear) the founder-selected provider container that represents
// "students enrolled". Body shape:
//   { tag: { kind: "qbo_class"|"xero_tracking", id, name } }   — set
//   { tag: null }                                               — clear
// We don't try to refetch the count here on purpose: a sync runs immediately
// after the founder picks (or any time they hit "Sync now"), and that's the
// path that owns updating `snapshot.enrollment`. Keeping this endpoint a
// pure preference write avoids surfacing partial provider failures from the
// settings panel.
router.put(
  "/models/:id/accounting/:provider/enrollment-tag",
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
    const body = (req.body ?? {}) as { tag?: unknown };
    let nextTag: EnrollmentTagRef | null;
    if (body.tag === null) {
      nextTag = null;
    } else if (isEnrollmentTagRef(body.tag)) {
      // Reject mismatched tag kinds — a Xero tracking category can't be
      // saved against a QBO connection or vice versa. Catching it here keeps
      // the next sync from chasing an id the provider doesn't recognise.
      const expectedKind = provider === "quickbooks" ? "qbo_class" : "xero_tracking";
      if (body.tag.kind !== expectedKind) {
        res.status(400).json({
          error: `Tag kind "${body.tag.kind}" does not match the ${providerDisplayName(provider)} connection.`,
        });
        return;
      }
      nextTag = body.tag;
    } else {
      res
        .status(400)
        .json({ error: "Body must include `tag: null` or `tag: { kind, id, name }`." });
      return;
    }

    const [conn] = await db
      .select({
        id: accountingConnectionsTable.id,
        realmId: accountingConnectionsTable.realmId,
        discoveredAccountsJson: accountingConnectionsTable.discoveredAccountsJson,
      })
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

    const [updated] = await db
      .update(accountingConnectionsTable)
      .set({
        enrollmentTagJson: nextTag,
        updatedAt: new Date(),
      })
      .where(eq(accountingConnectionsTable.id, conn.id))
      .returning(publicConnectionColumns);
    // Surface the user-level "Reuse last mapping" default alongside the
    // updated connection so the UI keeps the same `availableDefault`
    // affordance after picking an enrollment tag (response shape mirrors
    // the other PUT/POST routes).
    const availableDefault = await loadAvailableDefault(
      req.userId!,
      provider,
      conn.realmId,
      conn.discoveredAccountsJson ?? [],
    );
    res.json({ connection: toPublicConnection(updated, availableDefault) });
  },
);

// --- POST /api/models/:id/accounting/:provider/dismiss-dropped ------------
// Acknowledges the "X mapped accounts no longer appear in your books" notice
// without re-saving the mapping. Used when the founder confirms they're aware
// that an account is gone (e.g. they truly deleted "Facility Lease" because
// the school stopped paying rent) and just wants the warning to go away.
router.post(
  "/models/:id/accounting/:provider/dismiss-dropped",
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
    const [updated] = await db
      .update(accountingConnectionsTable)
      .set({ droppedMappingsJson: [], updatedAt: new Date() })
      .where(
        and(
          eq(accountingConnectionsTable.modelId, modelId),
          eq(accountingConnectionsTable.provider, provider),
        ),
      )
      .returning(publicConnectionColumns);
    if (!updated) {
      res.status(404).json({ error: "No connection for this provider." });
      return;
    }
    res.json({ connection: toPublicConnection(updated) });
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
