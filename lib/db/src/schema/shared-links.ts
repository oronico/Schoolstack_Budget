import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { financialModelsTable } from "./financial-models";

export const sharedLinksTable = pgTable("shared_links", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => financialModelsTable.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  viewerLabel: text("viewer_label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("shared_links_model_id_idx").on(table.modelId),
  index("shared_links_token_idx").on(table.token),
]);

export type InsertSharedLink = typeof sharedLinksTable.$inferInsert;
export type SharedLink = typeof sharedLinksTable.$inferSelect;
