import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const rateLimitsTable = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  hits: integer("hits").default(0).notNull(),
  windowStart: timestamp("window_start").defaultNow().notNull(),
});
