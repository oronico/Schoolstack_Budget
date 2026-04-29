// Per-(user, provider, realm) "last mapping" the founder used. We persist
// this so that connecting the same QuickBooks/Xero company file to a second
// what-if model can offer "Reuse last mapping" instead of forcing the
// founder to re-classify every account from scratch.
//
// The defaults are intentionally decoupled from any individual model —
// editing a mapping in Model B updates the default and Model B's connection,
// but never reaches back into Model A's stored mapping. That matches the
// task's "editable from the new model without touching the source"
// requirement: the source model keeps whatever mapping it had on disk.
//
// Mapping keys are the lowercased account names produced by the providers
// helper; the same keys we already use in
// `accounting_connections.account_mappings_json`. A founder override that
// references an account that doesn't exist in the new connection's chart is
// silently dropped at apply-time.
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
import type { AccountingProvider, AccountKind } from "./accounting-connections";

export const accountingMappingDefaultsTable = pgTable(
  "accounting_mapping_defaults",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 })
      .$type<AccountingProvider>()
      .notNull(),
    // Provider-side company file identifier (QuickBooks `realmId`, Xero
    // `tenantId`). Required — defaults at this level only make sense when
    // we know which company file the mapping was written for.
    realmId: text("realm_id").notNull(),
    // Friendly name for the company file. Displayed in the "Reuse last
    // mapping from Acme School - QBO" affordance so the founder can tell
    // which file they previously mapped against.
    realmDisplayName: text("realm_display_name"),
    // The mapping itself. Keys mirror DiscoveredAccount.key; missing keys
    // fall back to the auto-detected default at apply time.
    accountMappingsJson: jsonb("account_mappings_json")
      .$type<Record<string, AccountKind>>()
      .notNull(),
    // The model the mapping was last saved from. Useful for an "originally
    // configured on Model X" hint and for surfacing the relationship in
    // analytics. Nulled (rather than cascade-deleted) if that source model
    // is removed so the default itself survives.
    sourceModelId: integer("source_model_id").references(
      () => financialModelsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One default per (user, provider, realm). Saving a mapping anywhere
    // upserts onto this row so the most recent mapping wins.
    uniqueIndex("accounting_mapping_defaults_user_provider_realm_unq").on(
      table.userId,
      table.provider,
      table.realmId,
    ),
  ],
);

export type InsertAccountingMappingDefault =
  typeof accountingMappingDefaultsTable.$inferInsert;
export type AccountingMappingDefault =
  typeof accountingMappingDefaultsTable.$inferSelect;
