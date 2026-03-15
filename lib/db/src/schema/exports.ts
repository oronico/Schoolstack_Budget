import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { financialModelsTable } from "./financial-models";

export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id").notNull().references(() => financialModelsTable.id, { onDelete: "cascade" }),
  format: varchar("format", { length: 20 }).default("xlsx").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExportSchema = createInsertSchema(exportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExport = z.infer<typeof insertExportSchema>;
export type Export = typeof exportsTable.$inferSelect;
