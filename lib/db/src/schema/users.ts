import { pgTable, text, serial, timestamp, varchar, integer, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  tokenVersion: integer("token_version").default(0).notNull(),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  guidanceLevel: varchar("guidance_level", { length: 20 }),
  // Founder persona — see Task #302. `personaStage` tells us whether the
  // founder is planning a brand-new school ("yet_to_launch") or already
  // running one ("existing"). `personaComfort` captures how much budgeting
  // experience they have ("new_to_budgeting" vs "comfortable"). Both are
  // nullable so legacy users can backfill via the persona picker the next
  // time they sign in.
  personaStage: varchar("persona_stage", { length: 30 }),
  personaComfort: varchar("persona_comfort", { length: 30 }),
  lenderLanguageEnabled: boolean("lender_language_enabled").default(false).notNull(),
  schoolName: text("school_name"),
  profileRole: text("profile_role"),
  planningStage: text("planning_stage"),
  mailingListOptIn: boolean("mailing_list_opt_in").default(false).notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
