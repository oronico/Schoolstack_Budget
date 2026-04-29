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
  DiscoveredEnrollmentTag,
  DroppedAccountMapping,
  EnrollmentTagRef,
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
  // Lists candidate "students enrolled" containers the founder might pick.
  //   QBO  — every parent Class with at least one active sub-class. The count
  //          is the number of active sub-classes (each typically a student
  //          or family).
  //   Xero — every TrackingCategory. The count is the number of active
  //          options on that category.
  // Surface this every sync so the picker has a fresh list and the
  // previously-selected tag's count stays accurate. Returning an empty list
  // simply means nothing usable was found — not an error.
  fetchEnrollmentSources(
    accessToken: string,
    realmId: string,
  ): Promise<DiscoveredEnrollmentTag[]>;
  // Re-counts a specific selected tag. Used as a fallback when the broader
  // `fetchEnrollmentSources` list doesn't contain the saved tag (e.g. the
  // founder picked something with zero active children). Returning
  // `undefined` means the tag could not be found at all (the container was
  // deleted or renamed); the caller treats that as "leave enrollment empty
  // rather than overwrite with stale data".
  fetchEnrollmentCount(
    accessToken: string,
    realmId: string,
    tag: EnrollmentTagRef,
  ): Promise<number | undefined>;
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

// Compute the next prune state when a sync is about to overwrite the cached
// per-account list. Pure helper so the routes layer stays small and the
// behaviour is easy to unit-test.
//
// Inputs:
//   prevMappings    — founder overrides from the previous sync
//   prevDiscovered  — per-account list from the previous sync (gives names)
//   prevDropped     — drops accumulated from earlier sync(s) and not yet
//                     dismissed by the founder
//   currentKeys     — keys present in the latest P&L
//
// Returns:
//   prunedMappings  — overrides whose key still exists; safe to persist
//   droppedMappings — newly-pruned drops merged with carried-over ones,
//                     deduped by key (newer entries win), with any drop whose
//                     key reappeared in this sync removed.
export function computeMappingPrune(
  prevMappings: Record<string, AccountKind> | null | undefined,
  prevDiscovered: DiscoveredAccount[] | null | undefined,
  prevDropped: DroppedAccountMapping[] | null | undefined,
  currentKeys: ReadonlySet<string>,
): {
  prunedMappings: Record<string, AccountKind>;
  droppedMappings: DroppedAccountMapping[];
} {
  const prevByKey = new Map<string, DiscoveredAccount>();
  for (const a of prevDiscovered ?? []) prevByKey.set(a.key, a);

  const prunedMappings: Record<string, AccountKind> = {};
  const newlyDropped: DroppedAccountMapping[] = [];
  for (const [k, v] of Object.entries(prevMappings ?? {})) {
    if (currentKeys.has(k)) {
      prunedMappings[k] = v;
    } else {
      newlyDropped.push({
        key: k,
        name: prevByKey.get(k)?.name ?? k,
        kind: v,
      });
    }
  }

  const carriedDropped = (prevDropped ?? []).filter((d) => !currentKeys.has(d.key));

  const merged: DroppedAccountMapping[] = [];
  const seen = new Set<string>();
  for (const d of [...newlyDropped, ...carriedDropped]) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    merged.push(d);
  }
  return { prunedMappings, droppedMappings: merged };
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
  async fetchEnrollmentSources(accessToken, realmId) {
    // QuickBooks doesn't have a first-class "students" object. Schools
    // typically use the Class hierarchy: a parent class like
    // "Students FY26" with one active sub-class per enrolled student or
    // family. We fetch every active class in one call and group by
    // ParentRef so the picker can show "<parent name> — N students".
    const query = "select Id,Name,ParentRef,Active from Class MAXRESULTS 1000";
    const url =
      `${QB_API_BASE}/v3/company/${encodeURIComponent(realmId)}/query` +
      `?query=${encodeURIComponent(query)}&minorversion=70`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QuickBooks classes fetch failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return parseQuickBooksClasses(json);
  },
  async fetchEnrollmentCount(accessToken, realmId, tag) {
    if (tag.kind !== "qbo_class") return undefined;
    // Re-derive from the same Class list rather than a separate count
    // query: schools rarely have so many classes that this is wasteful, and
    // sharing the parser keeps a single source of truth for "what counts as
    // an active sub-class".
    const sources = await quickbooksClient.fetchEnrollmentSources(accessToken, realmId);
    const match = sources.find((s) => s.id === tag.id);
    return match?.count;
  },
};

// Parse the QuickBooks `query` response for `select * from Class` into the
// founder-facing list of candidate enrollment containers. Exported for unit
// coverage. We keep ONLY parents with at least one active child, so the
// picker doesn't get cluttered with one-off classes that aren't being used
// to track students.
export function parseQuickBooksClasses(
  payload: Record<string, unknown>,
): DiscoveredEnrollmentTag[] {
  const queryResponse = (payload.QueryResponse as Record<string, unknown>) || {};
  const classes = (queryResponse.Class as Array<Record<string, unknown>> | undefined) ?? [];
  type QboClass = { id: string; name: string; parentId: string | null; active: boolean };
  const parsed: QboClass[] = [];
  for (const c of classes) {
    const id = String(c.Id ?? "").trim();
    const name = String(c.Name ?? "").trim();
    if (!id || !name) continue;
    // QBO defaults `Active` to true when omitted from the response.
    const active = c.Active === undefined ? true : Boolean(c.Active);
    const parentRef = c.ParentRef as { value?: string } | undefined;
    const parentId = parentRef?.value ? String(parentRef.value) : null;
    parsed.push({ id, name, parentId, active });
  }
  // Group active children by parent id.
  const childrenByParent = new Map<string, number>();
  for (const c of parsed) {
    if (!c.active || !c.parentId) continue;
    childrenByParent.set(c.parentId, (childrenByParent.get(c.parentId) ?? 0) + 1);
  }
  const out: DiscoveredEnrollmentTag[] = [];
  for (const c of parsed) {
    if (!c.active) continue;
    const childCount = childrenByParent.get(c.id) ?? 0;
    if (childCount === 0) continue;
    out.push({
      kind: "qbo_class",
      id: c.id,
      name: c.name,
      count: childCount,
    });
  }
  // Stable, name-sorted order so the dropdown doesn't reshuffle between syncs.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Internal: extract { snapshot, discoveredAccounts } from the QuickBooks
// `ProfitAndLoss` JSON response. Exported for unit coverage.
//
// QuickBooks Online groups P&L sections by an opaque `group` token. We treat
// "Income" as the revenue line, and SUM across every expense-like group
// (`Expenses`, `COGS`, `OtherExpense` / `OtherExpenses`) to get a complete
// total — taking only `Expenses` would understate the founder's true outflows
// when COGS or other charges are present. Detail rows underneath each group
// are captured as `discoveredAccounts` (tagged with the right section) so
// the founder mapping UI can re-classify them later.
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

  // Groups whose Summary row counts toward "expenses". Sandbox + production
  // payloads use both `OtherExpense` (singular) and `OtherExpenses` (plural)
  // depending on the company file's preferences, so we accept either.
  const EXPENSE_GROUPS = new Set([
    "Expenses",
    "COGS",
    "OtherExpense",
    "OtherExpenses",
  ]);

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
      } else if (EXPENSE_GROUPS.has(group)) {
        // Sum because COGS / Operating / Other are siblings, not nested.
        // Use absolute value so a credit-balanced expense section (negative
        // refund) doesn't subtract from the total.
        expenses += Math.abs(totalValue);
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
  async fetchEnrollmentSources(accessToken, tenantId) {
    // Xero TrackingCategories carry their `Options` inline in the list
    // response, so a single call is enough to power the picker. We keep only
    // ACTIVE categories — archived ones would surface tags the founder can't
    // re-tag transactions with anyway.
    const url = `${XERO_API_BASE}/TrackingCategories`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Xero tracking categories fetch failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return parseXeroTrackingCategories(json);
  },
  async fetchEnrollmentCount(accessToken, tenantId, tag) {
    if (tag.kind !== "xero_tracking") return undefined;
    // Same single-endpoint trick: re-use the parser so "active option" means
    // the same thing here as in the picker list.
    const sources = await xeroClient.fetchEnrollmentSources(accessToken, tenantId);
    const match = sources.find((s) => s.id === tag.id);
    return match?.count;
  },
};

// Parse the Xero `TrackingCategories` response into the founder-facing list of
// candidate enrollment containers. Exported for unit coverage. We surface
// every ACTIVE category whose ACTIVE option count is at least 1 — categories
// with no options aren't usable as a headcount source.
export function parseXeroTrackingCategories(
  payload: Record<string, unknown>,
): DiscoveredEnrollmentTag[] {
  const categories = (payload.TrackingCategories as Array<Record<string, unknown>> | undefined) ?? [];
  const out: DiscoveredEnrollmentTag[] = [];
  for (const cat of categories) {
    const id = String(cat.TrackingCategoryID ?? "").trim();
    const name = String(cat.Name ?? "").trim();
    const status = String(cat.Status ?? "ACTIVE").toUpperCase();
    if (!id || !name) continue;
    if (status !== "ACTIVE") continue;
    const options = (cat.Options as Array<Record<string, unknown>> | undefined) ?? [];
    let count = 0;
    for (const opt of options) {
      const optStatus = String(opt.Status ?? "ACTIVE").toUpperCase();
      if (optStatus === "ACTIVE") count += 1;
    }
    if (count === 0) continue;
    out.push({
      kind: "xero_tracking",
      id,
      name,
      count,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Parse a Xero `ProfitAndLoss` report payload. Xero returns a `Reports` array
// whose `Rows` mirror the QuickBooks structure but with a different field
// naming convention. We:
//   * pull the period-end date from the report title (handles both single
//     "30 September 2024" titles and "1 January 2024 to 30 September 2024"
//     ranges, in which case we take the END date and compute the number of
//     months elapsed),
//   * sum every expense-like section (Operating Expenses + Cost of
//     Sales/Goods + Other Expenses) — taking only "Operating Expenses" would
//     understate the total when cost-of-sales rows are present,
//   * skip Gross Profit / Net Profit / Net Income summary sections (they're
//     subtotals, not real revenue or expenses), and
//   * capture every detail account as a `discoveredAccount` so the founder
//     mapping UI can re-classify them (and so rent → monthly rent is derived
//     by the same `applyAccountMappings` path used for QuickBooks).
export function parseXeroProfitAndLoss(
  payload: Record<string, unknown>,
): SyncResult {
  const reports = (payload.Reports as Array<Record<string, unknown>> | undefined) ?? [];
  const report = reports[0] ?? {};
  const titles = (report.ReportTitles as string[] | undefined) ?? [];
  const titleString = titles.join(" | ");
  const range = extractDateRange(titleString);
  const periodEnd =
    range?.end ||
    extractIsoDate(titles[titles.length - 1]) ||
    new Date().toISOString().slice(0, 10);
  // If the title carries an explicit date range we can compute the months
  // completed; otherwise fall back to a fiscal-YTD assumption of 12 months.
  const monthsCompleted = range
    ? monthsBetween(new Date(`${range.start}T00:00:00Z`), new Date(`${range.end}T00:00:00Z`))
    : 12;

  let revenue = 0;
  let expenses = 0;
  const discovered: DiscoveredAccount[] = [];
  const seen = new Set<string>();

  const sections = (report.Rows as Array<Record<string, unknown>> | undefined) ?? [];
  for (const section of sections) {
    if ((section as { RowType?: string }).RowType !== "Section") continue;
    const titleVal = String((section as { Title?: string }).Title || "").toLowerCase();
    const rows = ((section as { Rows?: Array<Record<string, unknown>> }).Rows) ?? [];
    const sectionKind = classifyXeroSection(titleVal);
    // Gross/Net subtotal sections (and sections we don't recognise) are not
    // real revenue/expense buckets — skip them so they don't double-count.
    if (sectionKind === "skip") continue;

    let summary = 0;
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
    if (sectionKind === "income") {
      revenue = Math.max(revenue, summary);
    } else if (sectionKind === "expense") {
      // Sum because operating, cost-of-sales, and other-expenses are sibling
      // sections in the report — taking the max would silently drop the
      // smaller buckets.
      expenses += summary;
    }
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

// Categorize a Xero section by its title. Xero localises section titles
// (e.g. "Less Operating Expenses", "Less Cost of Sales", "Plus Other
// Income") so we work off keyword rules rather than exact strings, and
// explicitly skip Gross/Net subtotal sections that would otherwise be
// double-counted.
function classifyXeroSection(title: string): "income" | "expense" | "skip" {
  const t = title.toLowerCase();
  if (!t) return "skip";
  // Gross Profit, Net Profit, Net Income, Net Loss — subtotals.
  if (t.includes("gross profit") || t.includes("gross loss")) return "skip";
  if (t.includes("net profit") || t.includes("net loss") || t.includes("net income")) {
    return "skip";
  }
  if (t.includes("expense") || t.includes("cost of sales") || t.includes("cost of goods")) {
    return "expense";
  }
  if (t.includes("income") || t.includes("revenue")) return "income";
  return "skip";
}

// Returns the LAST date found inside `input`. Useful when a Xero title is a
// single date string ("30 September 2024").
function extractIsoDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const re = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) last = m;
  if (!last) return undefined;
  const mm = months[last[2].slice(0, 3).toLowerCase()];
  if (!mm) return undefined;
  return `${last[3]}-${mm}-${last[1].padStart(2, "0")}`;
}

// Detects a "<start> to <end>" date range inside a title string and returns
// both endpoints in ISO form. Returns undefined when no two dates are
// present (e.g. a single-date title).
function extractDateRange(
  input: string | undefined,
): { start: string; end: string } | undefined {
  if (!input) return undefined;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const re = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (!mm) continue;
    dates.push(`${m[3]}-${mm}-${m[1].padStart(2, "0")}`);
  }
  if (dates.length < 2) return undefined;
  return { start: dates[0], end: dates[dates.length - 1] };
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

// Type-guard for the founder-supplied enrollment-tag payload. Used by the
// route layer to reject malformed `{ tag }` bodies before we persist them.
// Accepts only the two provider-specific kinds we actually know how to
// re-fetch from at sync time.
export function isEnrollmentTagRef(value: unknown): value is EnrollmentTagRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "qbo_class" && v.kind !== "xero_tracking") return false;
  if (typeof v.id !== "string" || v.id.trim() === "") return false;
  if (typeof v.name !== "string" || v.name.trim() === "") return false;
  return true;
}

// Returns the enrollment count for a saved tag using the most recent
// discovered list, or `undefined` when the tag is unset, missing from the
// list, or has a zero count. Centralised so the sync helper and (future)
// route handlers stay consistent on "what enrollment value should this
// snapshot carry?".
export function deriveEnrollmentFromTag(
  tag: EnrollmentTagRef | null | undefined,
  discovered: DiscoveredEnrollmentTag[] | null | undefined,
): number | undefined {
  if (!tag || !discovered) return undefined;
  const match = discovered.find(
    (d) => d.kind === tag.kind && d.id === tag.id,
  );
  if (!match || match.count <= 0) return undefined;
  return match.count;
}
