import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { underwritingApplicationsTable } from "./underwriting-applications";
import { underwritingDocumentsTable } from "./underwriting-documents";
import { usersTable } from "./users";

// Task #605 — Phase 1 underwriting schema. Evidence is the structured
// claim layer that sits on top of documents: "the FY24 990 shows
// $1.2M in revenue", "the April bank statement shows ending cash of
// $312k". Multiple evidence rows can point at the same document, and a
// single piece of evidence can support multiple metrics or gate results
// (the join from evidence to those is handled by `*_evidence_id` fields
// on the consuming tables, not a separate join table — see schema plan).
//
// `evidenceType` is varchar + check constraint. Common values:
//   financial_metric, attestation, third_party_verification,
//   bank_balance, enrollment_count, accreditation_status, other
//
// `value` is jsonb so we can carry the typed payload of the claim (a
// number for "ending cash", a date for "charter renewal expiry", an
// object for "{ count: 187, gradeLevel: 'K-5' }").
export const underwritingEvidenceTable = pgTable("underwriting_evidence", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => underwritingApplicationsTable.id, { onDelete: "cascade" }),
  // Optional source document. Some evidence (e.g. founder verbal
  // attestation) has no document; nullable + SET NULL keeps the evidence
  // row alive if the document is later replaced or removed.
  documentId: integer("document_id").references(() => underwritingDocumentsTable.id, { onDelete: "set null" }),
  evidenceType: varchar("evidence_type", { length: 60 }).notNull(),
  // Stable claim key ("ending_cash_q1", "fy24_total_revenue",
  // "charter_renewal_date") so multiple evidence rows on the same claim
  // can be compared (e.g. founder-stated vs document-extracted).
  claimKey: varchar("claim_key", { length: 120 }).notNull(),
  value: jsonb("value").$type<Record<string, unknown> | string | number | boolean | null>(),
  // Optional pointer into the source: page number, cell reference,
  // statement period, OCR bounding box, etc.
  sourceLocator: text("source_locator"),
  // "founder_attested" | "underwriter_extracted" | "ocr" | "integration"
  collectionMethod: varchar("collection_method", { length: 40 }),
  collectedByUserId: integer("collected_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Underwriter sign-off: nullable until reviewed.
  verifiedByUserId: integer("verified_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("underwriting_evidence_application_id_idx").on(table.applicationId),
  index("underwriting_evidence_document_id_idx").on(table.documentId),
  index("underwriting_evidence_claim_key_idx").on(table.claimKey),
]);

export type InsertUnderwritingEvidence = typeof underwritingEvidenceTable.$inferInsert;
export type UnderwritingEvidence = typeof underwritingEvidenceTable.$inferSelect;
