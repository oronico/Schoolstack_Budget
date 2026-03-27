import { pgTable, text, serial, integer, timestamp, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { schoolsTable } from "./schools";

export const financialModelsTable = pgTable("financial_models", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  name: text("name").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  currentStep: integer("current_step").default(0),
  data: jsonb("data").default({}).$type<Record<string, unknown>>(),
  schoolStage: varchar("school_stage", { length: 30 }).$type<"new_school" | "operating_school">(),
  fundingProfile: varchar("funding_profile", { length: 30 }).$type<"tuition_based" | "charter_public_funded" | "hybrid_mixed">(),
  priorYearSnapshotJson: jsonb("prior_year_snapshot_json").$type<Record<string, unknown>>(),
  staffingRowsJson: jsonb("staffing_rows_json").$type<Record<string, unknown>[]>(),
  revenueRowsJson: jsonb("revenue_rows_json").$type<Record<string, unknown>[]>(),
  expenseRowsJson: jsonb("expense_rows_json").$type<Record<string, unknown>[]>(),
  capitalAndDebtRowsJson: jsonb("capital_and_debt_rows_json").$type<Record<string, unknown>[]>(),
  lastExportedAt: timestamp("last_exported_at"),
  consultantSummaryJson: jsonb("consultant_summary_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("financial_models_user_id_idx").on(table.userId),
]);

export type InsertFinancialModel = typeof financialModelsTable.$inferInsert;
export type FinancialModel = typeof financialModelsTable.$inferSelect;
