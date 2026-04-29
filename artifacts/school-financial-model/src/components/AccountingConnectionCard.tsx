// Live accounting integration card shown on the scenarios page. Lets a
// founder connect QuickBooks Online or Xero to the model, see when the most
// recent sync ran, and trigger an on-demand sync. The cached snapshot then
// powers the "Suggest from latest data" affordance in the actuals editor.
//
// Connection state is per-(model, provider). We render both providers in the
// same card so the founder can pick whichever accounting system their school
// already uses, and we surface a clear "not configured" message when the
// server is missing OAuth credentials so the button never silently fails.
//
// After a successful sync, founders can expand a "Customize account mapping"
// panel to confirm which accounts feed which suggestion bucket
// (revenue / expense / rent / ignore). Schools whose chart of accounts uses
// non-standard names like "Facility Lease" or "Building Costs" can fix the
// monthly-rent suggestion in one click without re-typing anything.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  GraduationCap,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Unplug,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  providerDisplayName,
  relativeTimeAgo,
  type AccountingSnapshotProvider,
  type AccountingSnapshotLike,
} from "@/lib/decision-flows";

// Mirrors the AccountKind / DiscoveredAccount types from @workspace/db. We
// duplicate them here (rather than importing) because the school-financial-
// model bundle should not pull in the server's drizzle dependency tree.
type AccountKind = "revenue" | "expense" | "rent" | "ignore";

interface DiscoveredAccount {
  key: string;
  name: string;
  section: "income" | "expense" | "other";
  amount: number;
  defaultKind: AccountKind;
}

// Mirrors `EnrollmentTagKind`/`EnrollmentTagRef`/`DiscoveredEnrollmentTag`
// from @workspace/db. Same reason as DiscoveredAccount: keep the bundle
// independent of the server's drizzle dependency tree.
type EnrollmentTagKind = "qbo_class" | "xero_tracking";

interface EnrollmentTagRef {
  kind: EnrollmentTagKind;
  id: string;
  name: string;
}

interface DiscoveredEnrollmentTag {
  kind: EnrollmentTagKind;
  id: string;
  name: string;
  count: number;
}

// Mirrors `DroppedAccountMapping` on the server. Surfaced when the most
// recent sync had to prune mapping entries because their account keys
// vanished from the latest P&L (e.g. the bookkeeper renamed an account).
interface DroppedAccountMapping {
  key: string;
  name: string;
  kind: AccountKind;
}

interface ProviderConfig {
  provider: AccountingSnapshotProvider;
  displayName: string;
  configured: boolean;
}

// Server-side summary of the user's saved (provider, realm) default — the
// last mapping they confirmed against this same QuickBooks/Xero company
// file in any model. Present when the founder previously mapped this realm
// in another model; null when this is their first mapping for the realm.
interface AvailableDefault {
  realmDisplayName: string | null;
  matchedCount: number;
  totalCount: number;
  updatedAt: string;
  sourceModelId: number | null;
  // Server-resolved name of the model that last edited the saved
  // mapping. Null when the source model has been deleted (the saved
  // mapping itself survives via SET NULL on `sourceModelId`).
  sourceModelName: string | null;
}

interface AccountingConnection {
  provider: AccountingSnapshotProvider;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  snapshot: (AccountingSnapshotLike & { realmDisplayName?: string }) | null;
  discoveredAccounts: DiscoveredAccount[];
  accountMappings: Record<string, AccountKind>;
  enrollmentTag: EnrollmentTagRef | null;
  discoveredEnrollmentTags: DiscoveredEnrollmentTag[];
  droppedMappings: DroppedAccountMapping[];
  configured: boolean;
  availableDefault: AvailableDefault | null;
}

interface AccountingState {
  connections: AccountingConnection[];
  providers: ProviderConfig[];
}

export interface AccountingConnectionCardProps {
  modelId: number;
  // Bubbles the freshest known snapshot up to the parent so it can be threaded
  // into the model data passed to `buildActualsSuggestion`. The card always
  // hands back the *Year-1* eligible snapshot (no-arg here means "give me the
  // best available snapshot").
  onSnapshotChange: (snapshot: AccountingSnapshotLike | null) => void;
  // Override the freshness threshold used to surface the "stale snapshot"
  // warning. Defaults to `DEFAULT_STALE_THRESHOLD_MS` (~36h). Tests pass a
  // smaller value so they don't have to fast-forward the clock by days.
  staleThresholdMs?: number;
}

const KIND_LABELS: Record<AccountKind, string> = {
  revenue: "Revenue",
  expense: "Expense",
  rent: "Rent",
  ignore: "Ignore",
};

const KIND_OPTIONS: AccountKind[] = ["revenue", "expense", "rent", "ignore"];

function formatCurrency(n: number): string {
  if (!isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

// Default freshness threshold for the snapshot. The daily scheduler runs every
// 24h, so 36h gives ~1.5x the cadence — enough to absorb a single missed tick
// (e.g. a deploy at the wrong moment) without spamming a warning, but tight
// enough that two missed days in a row are visible right away.
export const DEFAULT_STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000;

// Pure helper extracted so it can be unit-tested without rendering React.
// Returns null when the timestamp is missing or unparseable so the caller can
// fall back to existing "never synced" copy.
//
// `ageLabel` is phrased as a noun ("2 days", "40 hours") so the call site can
// drop it into "Snapshot is X old" without re-grammaring.
export function computeSnapshotStaleness(
  syncedAt: string | null | undefined,
  nowMs: number = Date.now(),
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): { stale: boolean; ageLabel: string } | null {
  if (!syncedAt) return null;
  const t = Date.parse(syncedAt);
  if (!isFinite(t)) return null;
  const diffMs = Math.max(0, nowMs - t);
  const stale = diffMs >= thresholdMs;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  const ageLabel =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${hours} hour${hours === 1 ? "" : "s"}`;
  return { stale, ageLabel };
}

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// True when we should surface the "Reuse last mapping" affordance for the
// given connection. We only nudge founders who haven't yet customized this
// model's mapping (an empty `accountMappings`) and whose saved default
// would actually move at least one account in their current chart — that
// avoids advertising a stale default for a chart of accounts that has
// since changed.
function shouldOfferReuse(conn: AccountingConnection): boolean {
  if (!conn.availableDefault) return false;
  if (Object.keys(conn.accountMappings).length > 0) return false;
  // matchedCount can be 0 when discoveredAccounts is empty (no sync yet)
  // *or* when the chart has fully changed. We still offer it pre-sync so
  // the founder sees the option immediately after connecting; the prompt
  // itself nudges them to sync first.
  if (conn.discoveredAccounts.length > 0 && conn.availableDefault.matchedCount === 0) {
    return false;
  }
  return true;
}

// Picks the most recently-synced connection across providers. The actuals
// editor only consumes one snapshot at a time; if a founder has connected
// both QuickBooks and Xero (rare but possible during a migration), the most
// recent sync wins.
//
// We also thread the per-account `discoveredAccounts` and the founder's
// saved `accountMappings` into the snapshot we emit upstream so the actuals
// editor can show a "Revenue = Tuition Income + Workshop Income" breakdown
// next to each suggestion. Bundling them with the snapshot keeps the page
// from caring about how the breakdown is computed; the engine derives it
// from `accountingSnapshot` like everything else.
function pickActiveSnapshot(
  connections: AccountingConnection[],
): AccountingSnapshotLike | null {
  let best: AccountingConnection | null = null;
  for (const c of connections) {
    if (!c.snapshot || !c.lastSyncedAt) continue;
    if (!best || (best.lastSyncedAt && c.lastSyncedAt > best.lastSyncedAt)) {
      best = c;
    }
  }
  if (!best || !best.snapshot || !best.lastSyncedAt) return null;
  return {
    provider: best.provider,
    syncedAt: best.lastSyncedAt,
    periodEnd: best.snapshot.periodEnd,
    monthsCompleted: best.snapshot.monthsCompleted,
    revenue: best.snapshot.revenue,
    expenses: best.snapshot.expenses,
    enrollment: best.snapshot.enrollment,
    monthlyRent: best.snapshot.monthlyRent,
    realmDisplayName: best.realmDisplayName ?? best.snapshot.realmDisplayName,
    discoveredAccounts: best.discoveredAccounts.length > 0 ? best.discoveredAccounts : undefined,
    accountMappings:
      Object.keys(best.accountMappings ?? {}).length > 0 ? best.accountMappings : undefined,
  };
}

export function AccountingConnectionCard({
  modelId,
  onSnapshotChange,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
}: AccountingConnectionCardProps) {
  const [state, setState] = useState<AccountingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // provider id while a request is in-flight

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting`, {
        headers: { ...authHeader() },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as AccountingState;
      setState(json);
      onSnapshotChange(pickActiveSnapshot(json.connections));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [modelId, onSnapshotChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Surface the connect/error result we may have been redirected back with.
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("accounting");
    const provider = params.get("provider");
    if (status === "connected" && provider) {
      setBanner(`${providerDisplayName(provider as AccountingSnapshotProvider)} connected. Run a sync to pull the latest actuals.`);
    } else if (status === "error" && provider) {
      setBanner(`Could not connect ${providerDisplayName(provider as AccountingSnapshotProvider)}. Try again or check the server logs.`);
    }
    if (status) {
      // Clean the URL so a refresh doesn't keep showing the banner.
      params.delete("accounting");
      params.delete("provider");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    }
  }, []);

  const connectionsByProvider = useMemo(() => {
    const m = new Map<AccountingSnapshotProvider, AccountingConnection>();
    for (const c of state?.connections ?? []) m.set(c.provider, c);
    return m;
  }, [state]);

  const providers: ProviderConfig[] = state?.providers ?? [
    { provider: "quickbooks", displayName: "QuickBooks", configured: false },
    { provider: "xero", displayName: "Xero", configured: false },
  ];

  async function handleConnect(provider: AccountingSnapshotProvider) {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting/${provider}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      const json = (await res.json().catch(() => ({}))) as { authorizeUrl?: string; error?: string };
      if (!res.ok) throw new Error(json.error || `Connect failed (${res.status})`);
      if (json.authorizeUrl) {
        window.location.href = json.authorizeUrl;
        return;
      }
      throw new Error("Server did not return an authorization URL.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSync(provider: AccountingSnapshotProvider) {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Sync failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(provider: AccountingSnapshotProvider) {
    if (!window.confirm(`Disconnect ${providerDisplayName(provider)} from this model?`)) return;
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting/${provider}`, {
        method: "DELETE",
        headers: { ...authHeader() },
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Disconnect failed (${res.status})`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveEnrollmentTag(
    provider: AccountingSnapshotProvider,
    tag: EnrollmentTagRef | null,
  ) {
    setBusy(`enrollment-${provider}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/models/${modelId}/accounting/${provider}/enrollment-tag`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ tag }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      // Auto-trigger a sync so the snapshot's enrollment field reflects the
      // new selection right away — without this the actuals editor would
      // wait for the next daily sync to start using the live count.
      if (tag) await handleSync(provider);
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveMapping(
    provider: AccountingSnapshotProvider,
    mappings: Record<string, AccountKind>,
  ) {
    setBusy(`mapping-${provider}`);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting/${provider}/mapping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ mappings }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  // Forgets the user's saved (provider, realm) mapping default. A founder
  // whose chart of accounts has shifted (or who simply doesn't want the
  // reuse prompt anymore) can prune the stale default in one click. We
  // confirm first since the action is silently destructive — there's no
  // undo, and the next mapping save will re-create a new default.
  async function handleForgetDefault(provider: AccountingSnapshotProvider) {
    if (
      !window.confirm(
        `Forget your saved ${providerDisplayName(provider)} mapping for this company file? You can always re-create it by saving a mapping in any model.`,
      )
    ) {
      return;
    }
    setBusy(`forget-${provider}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/models/${modelId}/accounting/${provider}/default`,
        {
          method: "DELETE",
          headers: { ...authHeader() },
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Forget failed (${res.status})`);
      setBanner(
        `Forgot the saved ${providerDisplayName(provider)} mapping. New models won't see the reuse prompt for this company file.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forget failed.");
    } finally {
      setBusy(null);
    }
  }

  // Dismisses the dropped-mapping warning for a provider. Clears the
  // accumulated `droppedMappingsJson` server-side so the amber notice
  // disappears across page loads.
  async function handleDismissDropped(provider: AccountingSnapshotProvider) {
    setBusy(`dismiss-${provider}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/models/${modelId}/accounting/${provider}/dismiss-dropped`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Dismiss failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed.");
    } finally {
      setBusy(null);
    }
  }

  // Copies the user's saved default for this (provider, realm) into the
  // current model's connection. The founder can still tweak any row
  // afterwards — a subsequent Save just upserts the default again so the
  // most recent edit wins. We surface a confirmation banner instead of an
  // alert so it matches the rest of the card's interaction style.
  async function handleApplyDefault(provider: AccountingSnapshotProvider) {
    setBusy(`default-${provider}`);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/accounting/${provider}/apply-default`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        appliedCount?: number;
      };
      if (!res.ok) throw new Error(json.error || `Reuse failed (${res.status})`);
      const n = json.appliedCount ?? 0;
      setBanner(
        n > 0
          ? `Reused ${n} mapping${n === 1 ? "" : "s"} from your saved default for ${providerDisplayName(provider)}.`
          : `Saved default for ${providerDisplayName(provider)} had no overrides that match this connection's chart of accounts.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reuse failed.");
    } finally {
      setBusy(null);
    }
  }

  // Tracks which providers' mapping panels are open. Lifted out of the
  // child so the dropped-mapping notice can programmatically expand the
  // panel via "Re-tag accounts".
  const [openMapping, setOpenMapping] = useState<
    Partial<Record<AccountingSnapshotProvider, boolean>>
  >({});
  const setMappingOpen = useCallback(
    (provider: AccountingSnapshotProvider, open: boolean) => {
      setOpenMapping((prev) => ({ ...prev, [provider]: open }));
    },
    [],
  );

  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      data-testid="accounting-connection-card"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold leading-tight">
            Pull actuals from your accounting system
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Connect QuickBooks or Xero so the actuals editor can suggest the most recent
            revenue, expenses, and rent without re-typing.
          </p>
        </div>
      </div>

      {banner && (
        <div
          className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          data-testid="accounting-banner"
        >
          {banner}
        </div>
      )}
      {error && (
        <div
          className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
          data-testid="accounting-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !state ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading connections…
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => {
            const conn = connectionsByProvider.get(p.provider);
            const isBusy = busy === p.provider;
            const synced = conn?.lastSyncedAt
              ? relativeTimeAgo(conn.lastSyncedAt)
              : null;
            const realmText = conn?.realmDisplayName ? ` · ${conn.realmDisplayName}` : "";
            // Suppress the freshness warning when `lastSyncError` is already
            // shown — that error is the more actionable signal (auth revoked,
            // provider down) and stacking an amber pill underneath it would
            // just be redundant noise.
            const staleness =
              conn && !conn.lastSyncError
                ? computeSnapshotStaleness(conn.lastSyncedAt, Date.now(), staleThresholdMs)
                : null;
            const showStaleWarning = staleness?.stale === true;
            return (
              <div
                key={p.provider}
                className="rounded-lg border border-border/70 bg-background/50 p-3"
                data-testid={`accounting-row-${p.provider}`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.displayName}</span>
                      {conn ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                          data-testid={`accounting-status-${p.provider}`}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Not connected
                        </span>
                      )}
                    </div>
                    {conn ? (
                      <div
                        className="text-[11px] text-muted-foreground mt-0.5"
                        data-testid={`accounting-last-sync-${p.provider}`}
                      >
                        {synced
                          ? `Last successful sync ${synced}${realmText}`
                          : `Connected — never synced${realmText}`}
                        <span className="ml-1 text-muted-foreground/70">
                          · Auto-refreshes daily
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.configured
                          ? "We'll redirect you to authorize."
                          : "Server is missing OAuth credentials for this provider."}
                      </div>
                    )}
                    {conn?.lastSyncError && (
                      <div className="text-[11px] text-rose-700 mt-0.5">
                        Last sync error: {conn.lastSyncError}
                      </div>
                    )}
                    {showStaleWarning && staleness && (
                      <div
                        className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
                        data-testid={`accounting-stale-warning-${p.provider}`}
                        role="status"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            Snapshot is {staleness.ageLabel} old
                          </div>
                          <div className="text-amber-800/80 leading-snug">
                            The daily auto-refresh hasn't run recently. Run a manual sync
                            to confirm the connection is still healthy.
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSync(p.provider)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                          data-testid={`accounting-stale-sync-${p.provider}`}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Sync now
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {conn ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSync(p.provider)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
                          data-testid={`accounting-sync-${p.provider}`}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Sync now
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDisconnect(p.provider)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-60"
                          data-testid={`accounting-disconnect-${p.provider}`}
                        >
                          <Unplug className="h-3 w-3" />
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!p.configured || isBusy}
                        onClick={() => handleConnect(p.provider)}
                        title={
                          p.configured
                            ? `Connect ${p.displayName}`
                            : `${p.displayName} integration is not configured on this server.`
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid={`accounting-connect-${p.provider}`}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Building2 className="h-3 w-3" />
                        )}
                        Connect {p.displayName}
                      </button>
                    )}
                  </div>
                </div>
                {conn && shouldOfferReuse(conn) && (
                  <ReuseLastMappingPrompt
                    provider={p.provider}
                    available={conn.availableDefault!}
                    busy={busy === `default-${p.provider}`}
                    forgetting={busy === `forget-${p.provider}`}
                    onApply={() => handleApplyDefault(p.provider)}
                    onForget={() => handleForgetDefault(p.provider)}
                    needsSync={conn.discoveredAccounts.length === 0}
                  />
                )}
                {conn && conn.droppedMappings.length > 0 && (
                  <DroppedMappingsNotice
                    provider={p.provider}
                    dropped={conn.droppedMappings}
                    dismissing={busy === `dismiss-${p.provider}`}
                    onDismiss={() => handleDismissDropped(p.provider)}
                    onReTag={() => {
                      setMappingOpen(p.provider, true);
                    }}
                  />
                )}
                {conn && conn.discoveredAccounts.length > 0 && (
                  <AccountMappingPanel
                    provider={p.provider}
                    accounts={conn.discoveredAccounts}
                    saved={conn.accountMappings}
                    saving={busy === `mapping-${p.provider}`}
                    onSave={(m) => handleSaveMapping(p.provider, m)}
                    open={openMapping[p.provider] ?? false}
                    onOpenChange={(v) => setMappingOpen(p.provider, v)}
                  />
                )}
                {conn && (
                  <EnrollmentTagPanel
                    provider={p.provider}
                    tags={conn.discoveredEnrollmentTags}
                    saved={conn.enrollmentTag}
                    saving={busy === `enrollment-${p.provider}`}
                    onSave={(t) => handleSaveEnrollmentTag(p.provider, t)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AccountMappingPanelProps {
  provider: AccountingSnapshotProvider;
  accounts: DiscoveredAccount[];
  saved: Record<string, AccountKind>;
  saving: boolean;
  onSave: (mappings: Record<string, AccountKind>) => void;
  // Open/close is controlled by the parent so the dropped-mappings notice
  // can programmatically expand the panel via "Re-tag accounts".
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Founder-facing override grid. We seed each row with the saved override
// (falling back to the auto-detection) so opening the panel shows the
// current behaviour rather than a blank slate. "Save mapping" is disabled
// until something actually changes — keeps accidental writes out of the DB.
function AccountMappingPanel({
  provider,
  accounts,
  saved,
  saving,
  onSave,
  open,
  onOpenChange,
}: AccountMappingPanelProps) {
  const initial = useMemo(() => {
    const m: Record<string, AccountKind> = {};
    for (const a of accounts) m[a.key] = saved[a.key] ?? a.defaultKind;
    return m;
  }, [accounts, saved]);
  const [draft, setDraft] = useState<Record<string, AccountKind>>(initial);
  // Re-seed the draft whenever the upstream accounts/saved data changes
  // (e.g. after a sync). Keeps the panel in sync without manual reset.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const dirty = useMemo(() => {
    for (const k of Object.keys(initial)) {
      if (initial[k] !== draft[k]) return true;
    }
    return false;
  }, [initial, draft]);

  const groups = useMemo(() => {
    const g: Record<DiscoveredAccount["section"], DiscoveredAccount[]> = {
      income: [],
      expense: [],
      other: [],
    };
    for (const a of accounts) g[a.section].push(a);
    return g;
  }, [accounts]);

  // Only count accounts whose saved bucket differs from the auto-detected
  // default — otherwise simply re-saving without changes would inflate the
  // "customized" count even though nothing was overridden.
  const customizedCount = useMemo(() => {
    let n = 0;
    for (const a of accounts) {
      const s = saved[a.key];
      if (s !== undefined && s !== a.defaultKind) n += 1;
    }
    return n;
  }, [accounts, saved]);

  // Only persist true overrides so the saved map mirrors what the founder
  // explicitly changed. Defaults stay implicit and continue to apply.
  const overridesOnly = useCallback(
    (m: Record<string, AccountKind>): Record<string, AccountKind> => {
      const out: Record<string, AccountKind> = {};
      for (const a of accounts) {
        const v = m[a.key];
        if (v !== undefined && v !== a.defaultKind) out[a.key] = v;
      }
      return out;
    },
    [accounts],
  );

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        data-testid={`accounting-mapping-toggle-${provider}`}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Customize account mapping
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
          ({accounts.length} account{accounts.length === 1 ? "" : "s"}
          {customizedCount > 0 ? ` · ${customizedCount} customized` : ""})
        </span>
      </button>
      {open && (
        <div
          className="mt-3 space-y-3"
          data-testid={`accounting-mapping-panel-${provider}`}
        >
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Choose which accounts feed each suggestion. Anything you don't change keeps
            the auto-detected default — schools that skip this step still get the
            standard heuristic.
          </p>
          {(["income", "expense", "other"] as const).map((section) => {
            const list = groups[section];
            if (list.length === 0) return null;
            const sectionLabel =
              section === "income"
                ? "Income accounts"
                : section === "expense"
                  ? "Expense accounts"
                  : "Other accounts";
            return (
              <div key={section}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {sectionLabel}
                </div>
                <div className="space-y-1">
                  {list.map((acc) => (
                    <div
                      key={acc.key}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                      data-testid={`accounting-mapping-row-${provider}-${acc.key}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" title={acc.name}>
                          {acc.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatCurrency(acc.amount)} this period
                        </div>
                      </div>
                      <select
                        value={draft[acc.key] ?? acc.defaultKind}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [acc.key]: e.target.value as AccountKind,
                          }))
                        }
                        className="text-xs rounded-md border border-border bg-background px-2 py-1 focus:border-primary focus:outline-none"
                        data-testid={`accounting-mapping-select-${provider}-${acc.key}`}
                      >
                        {KIND_OPTIONS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => onSave(overridesOnly(draft))}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`accounting-mapping-save-${provider}`}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Save mapping
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => setDraft(initial)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              data-testid={`accounting-mapping-reset-${provider}`}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReuseLastMappingPromptProps {
  provider: AccountingSnapshotProvider;
  available: AvailableDefault;
  busy: boolean;
  forgetting: boolean;
  needsSync: boolean;
  onApply: () => void;
  onForget: () => void;
}

// Inline prompt that appears on a freshly-connected model when the founder
// has previously mapped the same QuickBooks/Xero company file in another
// model. The "Reuse last mapping" button stays disabled until the founder
// runs a sync (we need the chart of accounts before we can re-apply the
// saved overrides). The "Forget" link, by contrast, is always available —
// pruning a stale default doesn't depend on having a fresh chart.
function ReuseLastMappingPrompt({
  provider,
  available,
  busy,
  forgetting,
  needsSync,
  onApply,
  onForget,
}: ReuseLastMappingPromptProps) {
  const realmText = available.realmDisplayName
    ? ` from ${available.realmDisplayName}`
    : "";
  const summary = needsSync
    ? `${available.totalCount} customization${available.totalCount === 1 ? "" : "s"} available`
    : `${available.matchedCount} of ${available.totalCount} match${available.totalCount === 1 ? "es" : ""} this connection's accounts`;
  // Format the last-edited date once so we can use it in both the
  // hover/tap tooltip and (when we know the source model name) the
  // visible source-model byline. We use a short date with a 4-digit year
  // — matches the rest of the card's date copy ("Apr 12, 2026").
  const updated = new Date(available.updatedAt);
  const updatedAbsolute = isFinite(updated.getTime())
    ? updated.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  // "Last edited in 'Annex Site Plan' on Apr 12, 2026" when we know the
  // source model. When the source model has been deleted (sourceModelId
  // is null OR the JOIN turned up nothing), we fall back to a name-less
  // "Last edited on Apr 12, 2026" so founders still see the recency hint.
  let sourceLine: string | null = null;
  if (available.sourceModelName) {
    sourceLine = updatedAbsolute
      ? `Last edited in “${available.sourceModelName}” on ${updatedAbsolute}`
      : `Last edited in “${available.sourceModelName}”`;
  } else if (updatedAbsolute) {
    sourceLine = `Last edited on ${updatedAbsolute}`;
  }
  // Hover/tap tooltip — surfaces the precise last-updated timestamp so a
  // founder can audit which save they're about to reuse without us
  // burning chrome on it inline. Falls back to just the source-line copy
  // when we can't parse the timestamp.
  const tooltip = updatedAbsolute
    ? available.sourceModelName
      ? `Last updated ${updatedAbsolute} (saved from “${available.sourceModelName}”)`
      : `Last updated ${updatedAbsolute}`
    : sourceLine ?? undefined;
  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
      data-testid={`accounting-reuse-prompt-${provider}`}
      title={tooltip}
    >
      <div className="flex items-start gap-2 min-w-0">
        <History className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-amber-900">
            Reuse your last mapping{realmText}
          </div>
          <div className="text-[11px] text-amber-800/90 leading-snug">
            {needsSync
              ? `Run a sync first, then apply ${summary} so you don't have to redo them.`
              : `${summary}. You can edit anything afterwards without affecting your other model.`}
          </div>
          {sourceLine && (
            <div
              className="mt-0.5 text-[11px] text-amber-800/80 leading-snug"
              data-testid={`accounting-reuse-source-${provider}`}
            >
              {sourceLine}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy || forgetting || needsSync}
          onClick={onApply}
          title={
            needsSync
              ? "Sync this connection first to detect the chart of accounts."
              : "Apply your saved mapping to this model."
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`accounting-reuse-apply-${provider}`}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <History className="h-3 w-3" />
          )}
          Reuse last mapping
        </button>
        <button
          type="button"
          disabled={busy || forgetting}
          onClick={onForget}
          title="Forget this saved mapping so the prompt stops appearing on new models."
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900/80 underline-offset-2 hover:text-amber-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`accounting-reuse-forget-${provider}`}
        >
          {forgetting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          Forget
        </button>
      </div>
    </div>
  );
}

interface EnrollmentTagPanelProps {
  provider: AccountingSnapshotProvider;
  // Candidate containers from the most recent sync. May be empty when the
  // school hasn't synced yet or has no usable parent classes / tracking
  // categories — we still render the panel and explain why.
  tags: DiscoveredEnrollmentTag[];
  saved: EnrollmentTagRef | null;
  saving: boolean;
  onSave: (tag: EnrollmentTagRef | null) => void;
}

// Founder-facing picker for the "students enrolled" source. Sits below the
// account-mapping panel so the same connection block surfaces every override
// the founder might want to make. The dropdown lists each candidate
// container with its current child/option count ("Students FY26 — 82
// students") so the founder can confidently pick the right one without
// hopping over to QuickBooks/Xero to check.
function EnrollmentTagPanel({
  provider,
  tags,
  saved,
  saving,
  onSave,
}: EnrollmentTagPanelProps) {
  const [open, setOpen] = useState(false);

  const providerLabel =
    provider === "quickbooks" ? "QuickBooks class" : "Xero tracking category";

  // The dropdown should always include the saved tag even if the most recent
  // sync didn't surface it (e.g. zero active children right now). That keeps
  // the founder from accidentally clearing their selection just by opening
  // the panel.
  const options = useMemo(() => {
    const merged = [...tags];
    if (saved && !tags.some((t) => t.id === saved.id && t.kind === saved.kind)) {
      merged.push({ ...saved, count: 0 });
    }
    merged.sort((a, b) => a.name.localeCompare(b.name));
    return merged;
  }, [tags, saved]);

  const summary = saved
    ? `Currently using "${saved.name}"`
    : "Not using a tag yet";

  return (
    <div
      className="mt-3 border-t border-border/60 pt-3"
      data-testid={`accounting-enrollment-panel-${provider}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        data-testid={`accounting-enrollment-toggle-${provider}`}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <GraduationCap className="h-3.5 w-3.5" />
        Students enrolled source
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
          ({summary})
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Pick the {providerLabel} whose active{" "}
            {provider === "quickbooks" ? "sub-classes" : "options"} represent
            enrolled students or families. The next sync will read it and the
            "Suggest from latest data" badge will use the live count instead of
            your prior-year number.
          </p>
          {options.length === 0 ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800"
              data-testid={`accounting-enrollment-empty-${provider}`}
            >
              We haven't found any usable {providerLabel.toLowerCase()}s yet.
              Add students under a parent {providerLabel.toLowerCase()} in
              {provider === "quickbooks" ? " QuickBooks" : " Xero"}, then run a
              sync.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                data-testid={`accounting-enrollment-select-${provider}`}
                value={saved ? saved.id : ""}
                disabled={saving}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    onSave(null);
                    return;
                  }
                  const next = options.find((o) => o.id === id);
                  if (!next) return;
                  onSave({ kind: next.kind, id: next.id, name: next.name });
                }}
              >
                <option value="">— None (use prior-year value) —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.count} student{o.count === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DroppedMappingsNoticeProps {
  provider: AccountingSnapshotProvider;
  dropped: DroppedAccountMapping[];
  dismissing: boolean;
  onDismiss: () => void;
  onReTag: () => void;
}

// Amber warning shown after a sync prunes mapping entries whose account keys
// no longer appear in the latest P&L. Without this notice a renamed rent
// account would silently revert to the auto-detection and the monthly-rent
// suggestion would shift without explanation. The founder can dismiss the
// notice (POST /dismiss-dropped) or click "Re-tag accounts" to expand the
// mapping panel below and pick the new name.
function DroppedMappingsNotice({
  provider,
  dropped,
  dismissing,
  onDismiss,
  onReTag,
}: DroppedMappingsNoticeProps) {
  const count = dropped.length;
  const summary = `${count} mapped account${count === 1 ? "" : "s"} no longer appear${count === 1 ? "s" : ""} in your books`;
  return (
    <div
      className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      data-testid={`accounting-dropped-notice-${provider}`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="font-medium" data-testid={`accounting-dropped-summary-${provider}`}>
            {summary}
          </div>
          <ul
            className="mt-1 list-disc pl-4 space-y-0.5 leading-snug"
            data-testid={`accounting-dropped-list-${provider}`}
          >
            {dropped.map((d) => (
              <li key={d.key}>
                <span className="font-medium">{d.name}</span>
                <span className="text-amber-800"> (was tagged as {KIND_LABELS[d.kind].toLowerCase()})</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-800 leading-snug">
            We auto-detected the rest of this sync, so totals like the monthly-rent
            suggestion may have shifted. Re-tag the renamed accounts or dismiss this
            notice if the changes are intentional.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReTag}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              data-testid={`accounting-dropped-retag-${provider}`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Re-tag accounts
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={dismissing}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs text-amber-800 hover:text-amber-900 disabled:opacity-60"
              data-testid={`accounting-dropped-dismiss-${provider}`}
            >
              {dismissing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
