import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { underwritingApplicationsTable } from "./underwriting-applications";
import { usersTable } from "./users";

// Task #605 — Phase 1 underwriting schema. A row per document the
// borrower (or pulled-data integration) has supplied for an application.
// We never store the document bytes inside Postgres; `storageRef` is an
// opaque pointer into App Storage / S3 (e.g. "appstorage://bucket/key").
//
// `documentType` and `verificationStatus` are varchar + check constraint
// rather than Postgres enums so we can add new values via a plain
// migration without recreating the column. Allowed values are documented
// in docs/FULL_UNDERWRITING_DATABASE_SCHEMA_PLAN.md.
//
// Common documentType values:
//   tax_return, financial_statement, bank_statement,
//   articles_of_incorporation, w9, charter_authorization,
//   facility_lease, organizational_chart, founder_resume, other
//
// verificationStatus values:
//   uploaded     – received, not yet reviewed
//   under_review – underwriter is examining
//   verified     – underwriter accepted as evidence
//   rejected     – rejected (see rejectionReason)
//   superseded   – replaced by a newer document
export const underwritingDocumentsTable = pgTable("underwriting_documents", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => underwritingApplicationsTable.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 60 }).notNull(),
  // Human label as displayed to the borrower in the upload UI ("FY24 Form
  // 990", "April 2026 operating bank statement"). Kept distinct from
  // documentType so the canonical type can be reclassified without
  // overwriting what the borrower called the file.
  displayName: text("display_name"),
  // Opaque storage reference. The application code resolves this to a
  // signed URL when surfacing the file; we never reconstruct or guess at
  // the format inside the DB.
  storageRef: text("storage_ref").notNull(),
  // SHA-256 of the bytes, hex-encoded. Lets us detect duplicate uploads
  // and pin evidence to a specific revision of the file.
  contentSha256: varchar("content_sha256", { length: 64 }),
  byteSize: integer("byte_size"),
  mimeType: varchar("mime_type", { length: 120 }),
  verificationStatus: varchar("verification_status", { length: 30 }).default("uploaded").notNull(),
  rejectionReason: text("rejection_reason"),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  // Misc structured properties extracted from the document (page count,
  // statement period start/end, etc). Free-form to avoid schema churn
  // while we learn the shape.
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("underwriting_documents_application_id_idx").on(table.applicationId),
  index("underwriting_documents_document_type_idx").on(table.documentType),
  index("underwriting_documents_verification_status_idx").on(table.verificationStatus),
]);

export type InsertUnderwritingDocument = typeof underwritingDocumentsTable.$inferInsert;
export type UnderwritingDocument = typeof underwritingDocumentsTable.$inferSelect;
