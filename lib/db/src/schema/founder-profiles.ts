import { pgTable, serial, integer, varchar, text, timestamp, char, date, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Task #620 — Phase 2 underwriting schema. Per-founder KYC data, kept
// deliberately separate from `users` so authentication identity and
// borrower KYC are never confused. Multiple founders can co-apply on
// one application — the join table that links profiles to applications
// is designed in a later phase.
//
// PII contract (mirrors `borrower_entities`): the raw SSN is NEVER
// stored. Use `encryptSensitive` from
// `artifacts/api-server/src/lib/sensitive-encryption.ts` and persist
// only `ssnLast4` + `ssnEncryptedRef`. Date of birth is stored as a
// plain `date` and intentionally NOT indexed, to discourage queries
// that pivot on it.
export const founderProfilesTable = pgTable("founder_profiles", {
  id: serial("id").primaryKey(),
  // Founders may exist as profiles before they create a login account
  // (e.g. underwriter pre-fills from intake). SET NULL keeps the
  // profile alive if the user record is later deleted.
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  legalFirstName: text("legal_first_name"),
  legalLastName: text("legal_last_name"),
  dateOfBirth: date("date_of_birth"),
  // Last 4 of SSN, for confirmation/display.
  ssnLast4: char("ssn_last_4", { length: 4 }),
  // Opaque envelope-encrypted ref produced by `encryptSensitive`.
  ssnEncryptedRef: text("ssn_encrypted_ref"),
  // Allowed values: not_started, pending, verified, failed.
  kycStatus: varchar("kyc_status", { length: 30 }),
  // Opaque ref into the KYC vendor (Persona / Alloy / etc).
  kycProviderRef: text("kyc_provider_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("founder_profiles_user_id_idx").on(table.userId),
  index("founder_profiles_kyc_status_idx").on(table.kycStatus),
]);

export type InsertFounderProfile = typeof founderProfilesTable.$inferInsert;
export type FounderProfile = typeof founderProfilesTable.$inferSelect;
