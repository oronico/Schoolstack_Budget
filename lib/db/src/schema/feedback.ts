import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 50 }).notNull(),
  message: text("message").notNull(),
  score: integer("score"),
  pageUrl: text("page_url"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InsertFeedback = typeof feedbackTable.$inferInsert;
export type Feedback = typeof feedbackTable.$inferSelect;
