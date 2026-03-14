import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const financialModelsTable = pgTable("financial_models", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currentStep: integer("current_step").default(0),
  data: jsonb("data").default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinancialModelSchema = createInsertSchema(financialModelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFinancialModel = z.infer<typeof insertFinancialModelSchema>;
export type FinancialModel = typeof financialModelsTable.$inferSelect;
