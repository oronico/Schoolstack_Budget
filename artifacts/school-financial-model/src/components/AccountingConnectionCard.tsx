// Live accounting integration card shown on the scenarios page. Lets a
// founder connect QuickBooks Online or Xero to the model, see when the most
// recent sync ran, and trigger an on-demand sync. The cached snapshot then
// powers the "Suggest from latest data" affordance in the actuals editor.
//
// Connection state is per-(model, provider). We render both providers in the
// same card so the founder can pick whichever accounting system their school
// already uses, and we surface a clear "not configured" message when the
// server is missing OAuth credentials so the button never silently fails.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import {
  providerDisplayName,
  relativeTimeAgo,
  type AccountingSnapshotProvider,
  type AccountingSnapshotLike,
} from "@/lib/decision-flows";

interface ProviderConfig {
  provider: AccountingSnapshotProvider;
  displayName: string;
  configured: boolean;
}

interface AccountingConnection {
  provider: AccountingSnapshotProvider;
  status: string;
  realmDisplayName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  snapshot: (AccountingSnapshotLike & { realmDisplayName?: string }) | null;
  configured: boolean;
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
}

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Picks the most recently-synced connection across providers. The actuals
// editor only consumes one snapshot at a time; if a founder has connected
// both QuickBooks and Xero (rare but possible during a migration), the most
// recent sync wins.
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
  };
}

export function AccountingConnectionCard({
  modelId,
  onSnapshotChange,
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
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {synced
                          ? `Synced ${synced}${realmText}`
                          : `Connected — never synced${realmText}`}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
