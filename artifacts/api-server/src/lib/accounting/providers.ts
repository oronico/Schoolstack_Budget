// QuickBooks Online + Xero provider clients used by the accounting routes.
//
// Each provider exposes the same shape so the router can stay agnostic:
//   isConfigured()           — env credentials present?
//   getAuthorizeUrl(state)   — first leg of OAuth (browser redirect)
//   exchangeCode(code, ...)  — second leg, returns tokens + realm id
//   refreshAccessToken(rt)   — refresh on demand
//   fetchProfitAndLoss(...)  — pulls a P&L snapshot
//
// Real provider calls require OAuth client credentials in the environment;
// when those aren't configured the route layer returns a friendly 503 instead
// of attempting a request that would otherwise leak unauthenticated calls or
// crash the server.
//
// `fetchProfitAndLoss` returns both the auto-detected snapshot AND the raw
// per-account amounts ("discovered accounts") so the founder-facing mapping
// UI can re-classify accounts (e.g. "Facility Lease" → rent) without having
// to re-hit the provider. `applyAccountMappings` then recomputes the snapshot
// from those discovered amounts plus the founder's overrides.
import type {
  AccountingProvider,
  AccountingSyncSnapshot,
  AccountKind,
  DiscoveredAccount,
} from "@workspace/db";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  realmId: string;
  realmDisplayName?: string;
}

export interface SyncResult {
  snapshot: AccountingSyncSnapshot;
  discoveredAccounts: DiscoveredAccount[];
}

export interface ProviderClient {
  provider: AccountingProvider;
  isConfigured(): boolean;
  getAuthorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string, realmId?: string): Promise<ProviderTokens>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }>;
  fetchProfitAndLoss(
    accessToken: string,
    realmId: string,
  ): Promise<SyncResult>;
}

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com";
const QB_SCOPES = "com.intuit.quickbooks.accounting";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_SCOPES =
  "openid profile email accounting.reports.read accounting.transactions.read offline_access";

function basicAuth(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

// Compute months-completed in a fiscal year ending at `periodEnd`. We let the
// caller drive the fiscal-year window so a school with a July fiscal start
// gets a sensible "months completed" value when a partial-year P&L is pulled.
function monthsBetween(start: Date, end: Date): number {
  const m =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return Math.min(12, Math.max(1, m));
}

// Normalise an account name into a stable lookup key. We lowercase + trim so
// minor formatting drift in the chart of accounts doesn't orphan a saved
// mapping ("Facility Lease " === "facility lease").
export function accountKey(name: string): string {
  return name.trim().toLowerCase();
}

// Default heuristic: which bucket should an account fall into when the
// founder hasn't customised the mapping? Mirrors the legacy logic so an
// unmapped connection behaves identically to before.
function defaultKindFor(section: DiscoveredAccount["section"], name: string): AccountKind {
  const label = name.toLowerCase();
  if (section === "income") return "revenue";
  if (section === "expense") {
    if (label.includes("rent") || label.includes("lease")) return "rent";
    return "expense";
  }
  return "ignore";
}

// Recompute snapshot totals from per-account amounts + founder mappings.
// Falls back to `defaultKind` for any account the founder hasn't explicitly
// reclassified, so an empty mapping behaves identically to the auto-detected
// snapshot we built during the parse.
export function applyAccountMappings(
  base: AccountingSyncSnapshot,
  discovered: DiscoveredAccount[],
  mappings: Record<string, AccountKind> | null | undefined,
): AccountingSyncSnapshot {
  if (!discovered.length) return base;
  const months = base.monthsCompleted > 0 ? base.monthsCompleted : 12;
  let revenue = 0;
  let expenses = 0;
  let rentTotal = 0;
  for (const acc of discovered) {
    const kind = mappings?.[acc.key] ?? acc.defaultKind;
    if (kind === "revenue") revenue += acc.amount;
    else if (kind === "expense") expenses += acc.amount;
    else if (kind === "rent") {
      rentTotal += acc.amount;
      // Rent is still an operating expense — fold it into expenses so the
      // founder's "total expenses" suggestion stays apples-to-apples with
      // the prior-year snapshot.
      expenses += acc.amount;
    }
  }
  return {
    ...base,
    revenue: revenue > 0 ? Math.round(revenue) : undefined,
    expenses: expenses > 0 ? Math.round(expenses) : undefined,
    monthlyRent: rentTotal > 0 ? Math.round(rentTotal / months) : undefined,
  };
}

// --- QuickBooks --------------------------------------------------------------

const quickbooksClient: ProviderClient = {
  provider: "quickbooks",
  isConfigured() {
    return Boolean(
      process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET,
    );
  },
  getAuthorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.QUICKBOOKS_CLIENT_ID || "",
      response_type: "code",
      scope: QB_SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    return `${QB_AUTH_URL}?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri, realmId) {
    if (!realmId) {
      throw new Error("QuickBooks callback is missing realmId.");
    }
    const res = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(
          process.env.QUICKBOOKS_CLIENT_ID || "",
          process.env.QUICKBOOKS_CLIENT_SECRET || "",
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QuickBooks token exchange failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
      realmId,
    };
  },
  async refreshAccessToken(refreshToken) {
    const res = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(
          process.env.QUICKBOOKS_CLIENT_ID || "",
          process.env.QUICKBOOKS_CLIENT_SECRET || "",
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QuickBooks token refresh failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
    };
  },
  async fetchProfitAndLoss(accessToken, realmId) {
    // Pull a year-to-date Profit & Loss summary. The "Total" column gives a
    // single bottom-line set of values per row, which is what we need for the
    // founder-facing snapshot. We deliberately use server-side defaults for
    // the date range (fiscal YTD) so the report follows the founder's
    // accounting calendar rather than the calendar year.
    const url =
      `${QB_API_BASE}/v3/company/${encodeURIComponent(realmId)}/reports/ProfitAndLoss` +
      `?summarize_column_by=Total&minorversion=70`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QuickBooks P&L fetch failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return parseQuickBooksProfitAndLoss(json);
  },
};

// Internal: extract { snapshot, discoveredAccounts } from the QuickBooks
// `ProfitAndLoss` JSON response. Exported for unit coverage.
export function parseQuickBooksProfitAndLoss(
  payload: Record<string, unknown>,
): SyncResult {
  const header = (payload.Header as Record<string, unknown>) || {};
  const startStr = String(header.StartPeriod || "");
  const endStr = String(header.EndPeriod || "");
  const periodEnd = endStr || new Date().toISOString().slice(0, 10);
  const start = startStr ? new Date(`${startStr}T00:00:00Z`) : new Date(`${periodEnd}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const monthsCompleted = startStr ? monthsBetween(start, end) : 12;

  let revenue = 0;
  let expenses = 0;
  const discovered: DiscoveredAccount[] = [];
  const seen = new Set<string>();

  // Walk a tree of P&L rows. We pass the active section ("income" /
  // "expense" / "other") down to detail rows so the discovered accounts
  // know which bucket they sit in.
  const walkRows = (rows: unknown, section: DiscoveredAccount["section"]): void => {
    if (!rows || typeof rows !== "object") return;
    const list = (rows as { Row?: unknown[] }).Row;
    if (!Array.isArray(list)) return;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const group = String(r.group || "");
      const summary = r.Summary as Record<string, unknown> | undefined;
      const colData = (summary?.ColData as Array<Record<string, unknown>> | undefined) ?? [];
      const totalCell = colData[colData.length - 1];
      const totalValue = Number(totalCell?.value || 0);
      let nextSection: DiscoveredAccount["section"] = section;
      if (group === "Income") {
        revenue = Math.max(revenue, totalValue);
        nextSection = "income";
      } else if (group === "Expenses") {
        expenses = Math.max(expenses, totalValue);
        nextSection = "expense";
      }
      const rowsInner = r.Rows as Record<string, unknown> | undefined;
      if (rowsInner) walkRows(rowsInner, nextSection);
      const detailRow = (r.ColData as Array<Record<string, unknown>> | undefined) ?? [];
      if (detailRow.length > 0) {
        const name = String(detailRow[0]?.value || "").trim();
        if (!name) continue;
        const last = detailRow[detailRow.length - 1];
        const amount = Number(last?.value || 0);
        if (!isFinite(amount)) continue;
        const key = accountKey(name);
        if (seen.has(key)) continue;
        const absAmount = Math.abs(amount);
        if (absAmount === 0) continue;
        seen.add(key);
        discovered.push({
          key,
          name,
          section,
          amount: absAmount,
          defaultKind: defaultKindFor(section, name),
        });
      }
    }
  };
  walkRows(payload.Rows, "other");

  const baseSnapshot: AccountingSyncSnapshot = {
    periodEnd,
    monthsCompleted,
    revenue: revenue > 0 ? Math.round(revenue) : undefined,
    expenses: expenses > 0 ? Math.round(expenses) : undefined,
    monthlyRent: undefined,
  };
  // Re-derive the snapshot via the mapping helper with no overrides so that
  // the auto-detected monthlyRent (from rent-named accounts) is computed by
  // the same code path that founder mappings will later use. Keeps a single
  // source of truth for "rent → monthly rent" arithmetic.
  const snapshot = applyAccountMappings(baseSnapshot, discovered, null);
  return { snapshot, discoveredAccounts: discovered };
}

// --- Xero --------------------------------------------------------------------

const xeroClient: ProviderClient = {
  provider: "xero",
  isConfigured() {
    return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
  },
  getAuthorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.XERO_CLIENT_ID || "",
      redirect_uri: redirectUri,
      scope: XERO_SCOPES,
      state,
    });
    return `${XERO_AUTH_URL}?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const res = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(
          process.env.XERO_CLIENT_ID || "",
          process.env.XERO_CLIENT_SECRET || "",
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Xero token exchange failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    // Xero requires a second call to discover the tenant the user just
    // granted access to. We pick the first tenant; the founder can re-connect
    // to switch tenants if they manage multiple Xero orgs.
    const conn = await fetch(XERO_CONNECTIONS_URL, {
      headers: {
        Authorization: `Bearer ${json.access_token}`,
        Accept: "application/json",
      },
    });
    if (!conn.ok) {
      const text = await conn.text().catch(() => "");
      throw new Error(`Xero connections lookup failed: ${conn.status} ${text}`);
    }
    const conns = (await conn.json()) as Array<{ tenantId: string; tenantName?: string }>;
    if (!Array.isArray(conns) || conns.length === 0) {
      throw new Error("Xero connection returned no tenants — re-authorise the connection.");
    }
    const tenant = conns[0];
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
      realmId: tenant.tenantId,
      realmDisplayName: tenant.tenantName,
    };
  },
  async refreshAccessToken(refreshToken) {
    const res = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(
          process.env.XERO_CLIENT_ID || "",
          process.env.XERO_CLIENT_SECRET || "",
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Xero token refresh failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
    };
  },
  async fetchProfitAndLoss(accessToken, tenantId) {
    const url = `${XERO_API_BASE}/Reports/ProfitAndLoss`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Xero P&L fetch failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return parseXeroProfitAndLoss(json);
  },
};

// Parse a Xero `ProfitAndLoss` report payload. Xero returns a `Reports` array
// whose `Rows` mirror the QuickBooks structure but with a different field
// naming convention. We collect Income / Expenses totals and capture every
// detail account so the founder mapping UI can re-classify them.
export function parseXeroProfitAndLoss(
  payload: Record<string, unknown>,
): SyncResult {
  const reports = (payload.Reports as Array<Record<string, unknown>> | undefined) ?? [];
  const report = reports[0] ?? {};
  const titles = (report.ReportTitles as string[] | undefined) ?? [];
  const periodEnd =
    extractIsoDate(titles[titles.length - 1]) ||
    new Date().toISOString().slice(0, 10);
  // Xero reports default to the current fiscal-YTD; assume 12 months unless
  // a date range narrower than a year is reflected in the title.
  const monthsCompleted = 12;

  let revenue = 0;
  let expenses = 0;
  const discovered: DiscoveredAccount[] = [];
  const seen = new Set<string>();

  const sections = (report.Rows as Array<Record<string, unknown>> | undefined) ?? [];
  for (const section of sections) {
    if ((section as { RowType?: string }).RowType !== "Section") continue;
    const titleVal = String((section as { Title?: string }).Title || "").toLowerCase();
    const rows = ((section as { Rows?: Array<Record<string, unknown>> }).Rows) ?? [];
    let summary = 0;
    const sectionKind: DiscoveredAccount["section"] =
      titleVal.includes("income") || titleVal.includes("revenue")
        ? "income"
        : titleVal.includes("expense")
          ? "expense"
          : "other";
    for (const row of rows) {
      const cells = ((row as { Cells?: Array<Record<string, unknown>> }).Cells) ?? [];
      if (cells.length === 0) continue;
      const name = String(cells[0]?.Value || "").trim();
      const lastCell = cells[cells.length - 1];
      const v = Number(lastCell?.Value || 0);
      if ((row as { RowType?: string }).RowType === "SummaryRow") {
        summary = Math.max(summary, Math.abs(v));
        continue;
      }
      if (!name || !isFinite(v)) continue;
      const key = accountKey(name);
      if (seen.has(key)) continue;
      const absAmount = Math.abs(v);
      if (absAmount === 0) continue;
      seen.add(key);
      discovered.push({
        key,
        name,
        section: sectionKind,
        amount: absAmount,
        defaultKind: defaultKindFor(sectionKind, name),
      });
    }
    if (sectionKind === "income") revenue = Math.max(revenue, summary);
    else if (sectionKind === "expense") expenses = Math.max(expenses, summary);
  }

  const baseSnapshot: AccountingSyncSnapshot = {
    periodEnd,
    monthsCompleted,
    revenue: revenue > 0 ? Math.round(revenue) : undefined,
    expenses: expenses > 0 ? Math.round(expenses) : undefined,
    monthlyRent: undefined,
  };
  const snapshot = applyAccountMappings(baseSnapshot, discovered, null);
  return { snapshot, discoveredAccounts: discovered };
}

function extractIsoDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const m = input.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return undefined;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mm = months[m[2].slice(0, 3).toLowerCase()];
  if (!mm) return undefined;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

// --- Registry ----------------------------------------------------------------

const REGISTRY: Record<AccountingProvider, ProviderClient> = {
  quickbooks: quickbooksClient,
  xero: xeroClient,
};

export function getProviderClient(provider: AccountingProvider): ProviderClient {
  return REGISTRY[provider];
}

export function isAccountingProvider(value: unknown): value is AccountingProvider {
  return value === "quickbooks" || value === "xero";
}

export function providerDisplayName(provider: AccountingProvider): string {
  return provider === "quickbooks" ? "QuickBooks" : "Xero";
}

export function isAccountKind(value: unknown): value is AccountKind {
  return (
    value === "revenue" ||
    value === "expense" ||
    value === "rent" ||
    value === "ignore"
  );
}
