import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Task #430 — Admin overrides for the Coaching tab "looks dead" badge.
//
// One row per surface key (see COACHING_FUNNEL_SURFACES on the server).
// `action` is either "snooze" or "retire":
//   - snooze: badge is suppressed until `snoozedUntil`. After that the
//     row is treated as expired and the badge can re-appear.
//   - retire: surface is hidden from the funnel entirely.
//
// We upsert on `surfaceKey` so admins can flip a surface from snoozed to
// retired (or extend a snooze) without accumulating history rows. Each
// upsert records the acting admin's id + email snapshot so the UI can
// render a "snoozed by <admin> until <date>" hint without a join, and
// so a later audit can attribute the decision even if the user is later
// renamed or deleted.
export const coachSurfaceOverridesTable = pgTable(
  "coach_surface_overrides",
  {
    id: serial("id").primaryKey(),
    surfaceKey: varchar("surface_key", { length: 120 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    // Set only when action = "snooze". Null for retire.
    snoozedUntil: timestamp("snoozed_until"),
    actorUserId: integer("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Snapshot of the admin's email at the time of the decision so the
    // hint stays attributable even if the user row is removed later.
    actorEmail: varchar("actor_email", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_surface_overrides_surface_key_uniq").on(table.surfaceKey),
    index("coach_surface_overrides_action_idx").on(table.action),
  ],
);

export type InsertCoachSurfaceOverride =
  typeof coachSurfaceOverridesTable.$inferInsert;
export type CoachSurfaceOverride =
  typeof coachSurfaceOverridesTable.$inferSelect;
