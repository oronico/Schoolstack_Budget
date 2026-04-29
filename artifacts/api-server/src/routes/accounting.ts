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
//   DELETE /api/models/:id/accounting/:provider           — disconnect
import { Router, type IRouter, type Response } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  accountingConnectionsTable,
  financialModelsTable,
  type AccountingProvider,
  type AccountingSyncSnapshot,
} from "@workspace/db";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import {
  getProviderClient,
  isAccountingProvider,
  providerDisplayName,
} from "../lib/accounting/providers";
import {
  encryptToken,
  decryptToken,
} from "../lib/accounting/crypto";

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
// snapshot so the founder UI can render the "Suggest from latest data" badge
// without a second round-trip.
type PublicConnection = {
  provider: AccountingProvider;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  snapshot: AccountingSyncSnapshot | null;
  configured: boolean;
};

function toPublicConnection(row: {
  provider: string;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  snapshotJson: AccountingSyncSnapshot | null;
}): PublicConnection {
  const provider = row.provider as AccountingProvider;
  const client = getProviderClient(provider);
  return {
    provider,
    status: row.status,
    realmDisplayName: row.realmDisplayName,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastSyncError: row.lastSyncError,
    snapshot: row.snapshotJson,
    configured: client.isConfigured(),
  };
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
          realmDisplayName: accountingConnectionsTable.realmDisplayName,
          lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
          lastSyncError: accountingConnectionsTable.lastSyncError,
          snapshotJson: accountingConnectionsTable.snapshotJson,
        })
        .from(accountingConnectionsTable)
        .where(eq(accountingConnectionsTable.modelId, modelId));

      const connections = rows.map(toPublicConnection);
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

    const client = getProviderClient(provider);
    try {
      let accessToken = decryptToken(conn.accessTokenEncrypted);
      let refreshToken = decryptToken(conn.refreshTokenEncrypted);
      let tokenExpiresAt = conn.tokenExpiresAt ?? new Date(0);

      // Refresh proactively if the access token has less than a minute of
      // life — provider tokens default to ~60 minutes so this is rare but
      // saves a round-trip the next call.
      if (tokenExpiresAt.getTime() - Date.now() < 60_000) {
        const refreshed = await client.refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken;
        tokenExpiresAt = refreshed.expiresAt;
        await db
          .update(accountingConnectionsTable)
          .set({
            accessTokenEncrypted: encryptToken(accessToken),
            refreshTokenEncrypted: encryptToken(refreshToken),
            tokenExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(accountingConnectionsTable.id, conn.id));
      }

      const snapshot = await client.fetchProfitAndLoss(accessToken, conn.realmId);
      // Annotate the snapshot with the realm display name so the actuals
      // editor can show "From QuickBooks (Acme School - QBO)".
      if (conn.realmDisplayName && !snapshot.realmDisplayName) {
        snapshot.realmDisplayName = conn.realmDisplayName;
      }

      const now = new Date();
      const [updated] = await db
        .update(accountingConnectionsTable)
        .set({
          snapshotJson: snapshot,
          lastSyncedAt: now,
          lastSyncError: null,
          status: "connected",
          updatedAt: now,
        })
        .where(eq(accountingConnectionsTable.id, conn.id))
        .returning({
          provider: accountingConnectionsTable.provider,
          status: accountingConnectionsTable.status,
          realmDisplayName: accountingConnectionsTable.realmDisplayName,
          lastSyncedAt: accountingConnectionsTable.lastSyncedAt,
          lastSyncError: accountingConnectionsTable.lastSyncError,
          snapshotJson: accountingConnectionsTable.snapshotJson,
        });
      res.json({ connection: toPublicConnection(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[accounting] sync error:", message);
      await db
        .update(accountingConnectionsTable)
        .set({
          status: "error",
          lastSyncError: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(accountingConnectionsTable.id, conn.id));
      res.status(502).json({ error: `Sync failed: ${message}` });
    }
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
