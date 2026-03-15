import { pgTable, serial, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const schoolsTable = pgTable("schools", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  state: varchar("state", { length: 100 }),
  schoolType: varchar("school_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InsertSchool = typeof schoolsTable.$inferInsert;
export type School = typeof schoolsTable.$inferSelect;
