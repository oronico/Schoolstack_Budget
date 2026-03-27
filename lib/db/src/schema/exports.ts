import { pgTable, serial, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { financialModelsTable } from "./financial-models";

export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id").notNull().references(() => financialModelsTable.id, { onDelete: "cascade" }),
  format: varchar("format", { length: 20 }).default("xlsx").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("exports_user_id_idx").on(table.userId),
  index("exports_model_id_idx").on(table.modelId),
]);

export type InsertExport = typeof exportsTable.$inferInsert;
export type Export = typeof exportsTable.$inferSelect;
