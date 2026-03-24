import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const errorLogsTable = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  route: text("route"),
  requestBody: jsonb("request_body"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InsertErrorLog = typeof errorLogsTable.$inferInsert;
export type ErrorLog = typeof errorLogsTable.$inferSelect;
