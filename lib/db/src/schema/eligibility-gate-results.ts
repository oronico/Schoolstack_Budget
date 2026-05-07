import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { underwritingApplicationsTable } from "./underwriting-applications";
import { underwritingEvidenceTable } from "./underwriting-evidence";

// Task #605 — Phase 1 underwriting schema. Each row is the outcome of
// running one named eligibility gate against an application (e.g.
// "minimum_dscr", "open_for_two_years", "non_profit_status"). A gate
// either passes, fails, or is waived; the audit trail of why is what we
// store here.
//
// `gateCode` is the canonical machine name and is indexed because the
// most common query is "show me every application that failed gate X".
//
// `outcome` is varchar + check constraint. Allowed values: pass, fail,
// waived, not_evaluated.
//
// `policyRuleVersionId` is the future FK into policy_rule_versions
// (Phase 3). We store it as a plain int now so credit memos can carry
// the rule version that produced the outcome; the FK is added when the
// table ships.
export const eligibilityGateResultsTable = pgTable("eligibility_gate_results", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => underwritingApplicationsTable.id, { onDelete: "cascade" }),
  gateCode: varchar("gate_code", { length: 80 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull(),
  // Numeric or string thresholds the gate compared against, plus the
  // observed values, captured verbatim so we can reproduce the result.
  // E.g. { threshold: 1.2, observed: 0.91, period: "FY24" }.
  evaluationDetails: jsonb("evaluation_details").$type<Record<string, unknown>>(),
  // Optional pointer at the evidence row that proved/disproved the gate.
  // SET NULL because evidence rows can be replaced (superseded document)
  // and the gate result must remain readable for the audit log.
  evidenceId: integer("evidence_id").references(() => underwritingEvidenceTable.id, { onDelete: "set null" }),
  policyRuleVersionId: integer("policy_rule_version_id"),
  waivedReason: text("waived_reason"),
  evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("eligibility_gate_results_application_id_idx").on(table.applicationId),
  index("eligibility_gate_results_gate_code_idx").on(table.gateCode),
]);

export type InsertEligibilityGateResult = typeof eligibilityGateResultsTable.$inferInsert;
export type EligibilityGateResult = typeof eligibilityGateResultsTable.$inferSelect;
