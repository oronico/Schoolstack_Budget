import { pgTable, serial, integer, varchar, text, timestamp, char, date, index } from "drizzle-orm/pg-core";

// Task #620 — Phase 2 underwriting schema. The legal entity that
// carries the loan (a 501c3, an LLC, etc). One application points at
// zero or one borrower entity via
// `underwriting_applications.borrower_entity_id` (column already
// shipped in Phase 1; the FK will be added once this table is in use
// across the application flow).
//
// PII contract: the raw EIN is NEVER stored. Application code MUST
// route the raw value through
// `artifacts/api-server/src/lib/sensitive-encryption.ts::encryptSensitive`
// and persist only the resulting `last4` + opaque `encryptedRef`.
// Postgres has no way to enforce that contract, so the audit-log
// redactor (`FORBIDDEN_AUDIT_KEYS`) lists `ein` and `ein_encrypted_ref`
// to catch accidental leaks into history.
export const borrowerEntitiesTable = pgTable("borrower_entities", {
  id: serial("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  dbaName: text("dba_name"),
  // Allowed values: nonprofit_501c3, for_profit_llc, for_profit_corp,
  // public_charter, other.
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  stateOfFormation: varchar("state_of_formation", { length: 2 }),
  formationDate: date("formation_date"),
  // Last 4 digits of the EIN, for display ("EIN ending 6789") and for
  // founder confirmation. Safe to store; Postgres never sees the rest.
  einLast4: char("ein_last_4", { length: 4 }),
  // Opaque envelope-encrypted ref produced by `encryptSensitive`.
  // Treat as bytes; never log, never index, never include in audit
  // diffs (the audit redactor strips it by key name).
  einEncryptedRef: text("ein_encrypted_ref"),
  taxExemptVerifiedAt: timestamp("tax_exempt_verified_at"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: varchar("state", { length: 2 }),
  postalCode: varchar("postal_code", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("borrower_entities_entity_type_idx").on(table.entityType),
  index("borrower_entities_legal_name_idx").on(table.legalName),
]);

export type InsertBorrowerEntity = typeof borrowerEntitiesTable.$inferInsert;
export type BorrowerEntity = typeof borrowerEntitiesTable.$inferSelect;
