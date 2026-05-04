import { pgTable, text, serial, timestamp, varchar } from "drizzle-orm/pg-core";

// Task #527 — confirm-by-email signup. New signups are parked here until the
// founder clicks the verification link in their inbox; only then do we create
// a real `users` row. Storing the bcrypt'd password and profile fields up
// front means /auth/verify-email needs nothing from the client beyond the
// raw token, so the verification link itself is the entire confirmation.
//
// We dedupe by `email` so a founder who fat-fingers their address (or
// re-submits because the email got buried) just overwrites the prior pending
// row. The constraint also prevents an attacker from stuffing the table with
// thousands of entries for the same address.
export const pendingSignupsTable = pgTable("pending_signups", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  schoolName: text("school_name"),
  profileRole: text("profile_role"),
  planningStage: text("planning_stage"),
  // sha256 hash of the raw verification token (raw token never persisted),
  // mirroring the resetToken pattern on usersTable.
  verificationToken: varchar("verification_token", { length: 255 }).notNull(),
  verificationTokenExpiry: timestamp("verification_token_expiry").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InsertPendingSignup = typeof pendingSignupsTable.$inferInsert;
export type PendingSignup = typeof pendingSignupsTable.$inferSelect;
