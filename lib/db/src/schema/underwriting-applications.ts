import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { schoolsTable } from "./schools";
import { financialModelsTable } from "./financial-models";

// Task #605 — Phase 1 underwriting schema. An `underwriting_applications`
// row is the long-lived envelope around one loan request. It is created
// when a founder graduates from the budgeting wizard into the loan
// application flow, and persists across document collection, evidence
// review, gate evaluation, risk rating, credit memo, and decision.
//
// We deliberately keep this table thin: structured underwriting data
// (documents, evidence, metric snapshots, gate results) lives in child
// tables so it can be queried, indexed, and audited independently.
//
// `status` is implemented as varchar + check constraint at the migration
// level rather than a Postgres enum, matching the existing project style
// (see financial_models.status, shared_links, etc). Allowed values:
//   draft            – created, founder still gathering inputs
//   submitted        – founder marked complete, awaiting reviewer pickup
//   in_review        – underwriter actively working the file
//   pending_info     – blocked on borrower deliverable
//   approved         – credit committee approved (see underwriting_decisions)
//   declined         – credit committee declined
//   withdrawn        – borrower withdrew before decision
export const underwritingApplicationsTable = pgTable("underwriting_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  schoolId: integer("school_id").references(() => schoolsTable.id, { onDelete: "set null" }),
  // Optional pointer at the budget model that seeded the application. We
  // keep the model row alive even if the application is deleted (RESTRICT
  // on the reverse direction would be wrong — a founder may delete a
  // draft model unrelated to underwriting). We use SET NULL so the
  // application keeps its identity if the model is later removed.
  financialModelId: integer("financial_model_id").references(() => financialModelsTable.id, { onDelete: "set null" }),
  status: varchar("status", { length: 30 }).default("draft").notNull(),
  // Free-text loan purpose ("facility acquisition", "working capital",
  // "bridge to charter renewal", etc) — captured verbatim so an
  // underwriter can read intent before the structured fields are filled.
  loanPurpose: text("loan_purpose"),
  requestedAmountCents: integer("requested_amount_cents"),
  requestedTermMonths: integer("requested_term_months"),
  // Pointer at the borrower entity (legal entity carrying the debt). Kept
  // as a nullable integer column for now — the borrower_entities table is
  // designed in the schema plan but lands in Phase 2. When that table
  // ships we'll add the FK in a follow-up migration.
  borrowerEntityId: integer("borrower_entity_id"),
  submittedAt: timestamp("submitted_at"),
  decisionedAt: timestamp("decisioned_at"),
  // Catch-all for application-level metadata that doesn't justify its own
  // column yet (e.g. preferred contact, intake source, referral code).
  // Kept narrow and never used for evidence/document/decision payloads —
  // those have first-class tables.
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("underwriting_applications_user_id_idx").on(table.userId),
  index("underwriting_applications_status_idx").on(table.status),
  index("underwriting_applications_school_id_idx").on(table.schoolId),
]);

export type InsertUnderwritingApplication = typeof underwritingApplicationsTable.$inferInsert;
export type UnderwritingApplication = typeof underwritingApplicationsTable.$inferSelect;
