import { pgTable, serial, varchar, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const rateLimitsTable = pgTable("rate_limit_hits", {
  id: serial("id").primaryKey(),
  ip: varchar("ip", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  hitCount: integer("hit_count").default(0).notNull(),
  windowStart: timestamp("window_start").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("rate_limit_ip_endpoint_idx").on(table.ip, table.endpoint),
]);
