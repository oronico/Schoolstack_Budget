// Per-model connection to a school's accounting system (QuickBooks Online or
// Xero). One row per (model, provider). Tokens are stored encrypted-at-rest
// using AES-256-GCM via the api-server's `accounting/crypto` helper — never
// write a plaintext OAuth secret to this table.
//
// `snapshotJson` is the cached actuals snapshot pulled by the most recent
// sync. The scenarios actuals editor reads it (not the tokens) when
// constructing "Suggest from latest data" suggestions, so we deliberately
// keep the cached snapshot self-contained rather than re-querying the
// provider on each render.
//
// `discoveredAccountsJson` and `accountMappingsJson` power the founder-facing
// account-mapping UI: after a sync we cache the per-account totals from the
// provider's P&L so the founder can confirm which accounts feed which
// suggestion bucket (revenue / expense / rent / ignore). The mapping is then
// applied on the next sync (and immediately, when saved) to recompute the
// snapshot — so a school whose chart of accounts uses non-standard names
// like "Facility Lease" can still get the right monthly-rent suggestion.
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { financialModelsTable } from "./financial-models";

export type AccountingProvider = "quickbooks" | "xero";

// How a single account contributes to the snapshot. "rent" still rolls into
// total expenses but additionally drives the monthly-rent estimate; "ignore"
// drops the account from both totals (useful for non-operating items like
// owner draws or interest income that would distort the simple snapshot).
export type AccountKind = "revenue" | "expense" | "rent" | "ignore";

// One row per detail account discovered in the most recent P&L. We store the
// per-account amount (over the period covered by the snapshot) so the
// account-mapping UI can re-classify and recompute totals locally without
// hitting the provider again.
export type DiscoveredAccount = {
  // Stable, case-insensitive lookup key so the mapping survives small label
  // changes from the provider. We lowercase the account name on write.
  key: string;
  // Display name as it appears in the founder's chart of accounts.
  name: string;
  // Which P&L section the account was found under. Drives the default UI
  // grouping and the heuristic kind below.
  section: "income" | "expense" | "other";
  // Amount reported by the provider for this account over the snapshot
  // window (revenue is positive; expense is positive; we strip signs upstream).
  amount: number;
  // What the auto-detection would classify this account as if the founder
  // doesn't override it. Mirrored to the mapping when missing.
  defaultKind: AccountKind;
};

export type AccountingSyncSnapshot = {
  // ISO date string (YYYY-MM-DD) for the last day of the period summarized.
  periodEnd: string;
  // 1..12 — months covered by this snapshot. Used by the suggestion helper to
  // annualize partial-year P&L when needed.
  monthsCompleted: number;
  // Pulled from a Profit & Loss report. Currency = USD.
  revenue?: number;
  expenses?: number;
  // QB/Xero don't natively track student counts. We surface enrollment only
  // when the founder has tagged a class/department for it, so this stays
  // optional and the suggestion helper falls back to the prior-year snapshot
  // for enrollment when the live source is silent.
  enrollment?: number;
  // Detected from a "Rent" account so the evaluate_site decision can pull a
  // realized monthly rent without the founder retyping their lease.
  monthlyRent?: number;
  // Optional human label for the source company file ("Acme School - QBO").
  realmDisplayName?: string;
};

export const accountingConnectionsTable = pgTable(
  "accounting_connections",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id")
      .notNull()
      .references(() => financialModelsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).$type<AccountingProvider>().notNull(),
    // "connected" once OAuth completes; "error" when the most recent sync
    // failed (token revoked, provider 5xx, etc); "disconnected" rows are
    // hard-deleted, but the column exists in case we want soft-delete later.
    status: varchar("status", { length: 20 }).default("connected").notNull(),
    // Provider-side identifier of the company file: QuickBooks `realmId`,
    // Xero `tenantId`. We need it on every API call.
    realmId: text("realm_id"),
    realmDisplayName: text("realm_display_name"),
    // Encrypted (AES-256-GCM) base64 strings. Plaintext NEVER lives here.
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    snapshotJson: jsonb("snapshot_json").$type<AccountingSyncSnapshot>(),
    // Per-account amounts captured at the most recent sync. Null until the
    // first sync runs (the OAuth callback only stores tokens).
    discoveredAccountsJson: jsonb("discovered_accounts_json").$type<DiscoveredAccount[]>(),
    // Founder overrides keyed by `DiscoveredAccount.key`. Missing keys fall
    // back to `defaultKind`, so an empty mapping is equivalent to the
    // pre-mapping heuristic behaviour.
    accountMappingsJson: jsonb("account_mappings_json").$type<Record<string, AccountKind>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One row per (model, provider). A founder can only connect a single QB
    // company file per model; reconnecting upserts onto the same row so we
    // don't accumulate stale tokens.
    uniqueIndex("accounting_connections_model_provider_unq").on(
      table.modelId,
      table.provider,
    ),
  ],
);

export type InsertAccountingConnection =
  typeof accountingConnectionsTable.$inferInsert;
export type AccountingConnection =
  typeof accountingConnectionsTable.$inferSelect;
