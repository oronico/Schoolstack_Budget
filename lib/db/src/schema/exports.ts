import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { financialModelsTable } from "./financial-models";
import { sharedLinksTable } from "./shared-links";

export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id").notNull().references(() => financialModelsTable.id, { onDelete: "cascade" }),
  format: varchar("format", { length: 20 }).default("xlsx").notNull(),
  // Provenance for share-link-driven exports. Both NULL for the founder's own
  // direct exports; both populated when the row was recorded against the model
  // owner because a recipient downloaded via /shared/:token (e.g. a
  // co-founder, advisor, or board chair). We use SET NULL on shared-link
  // delete so revoking/cleaning up a link doesn't erase the historical
  // export — the founder still sees that someone downloaded a comparison PDF
  // even if the originating link is gone.
  sharedLinkId: integer("shared_link_id").references(() => sharedLinksTable.id, { onDelete: "set null" }),
  viewerLabel: text("viewer_label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("exports_user_id_idx").on(table.userId),
  index("exports_model_id_idx").on(table.modelId),
]);

export type InsertExport = typeof exportsTable.$inferInsert;
export type Export = typeof exportsTable.$inferSelect;
