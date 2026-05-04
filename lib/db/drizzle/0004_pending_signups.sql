-- Task #527 — confirm-by-email signup. New `pending_signups` table parks
-- a hashed password + profile fields until the founder clicks the
-- verification link in their inbox; only then does /auth/verify-email
-- promote the row into `users`. Closes the last enumeration oracle on
-- /auth/register (status code 201 vs 409) by making the response
-- identical for new and already-registered emails. Uses IF NOT EXISTS
-- so reapplying the migration against a DB that already has the table
-- (e.g. via `drizzle-kit push`) is a no-op, matching the pattern used
-- by 0001..0003.
CREATE TABLE IF NOT EXISTS "pending_signups" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "password_hash" text NOT NULL,
    "school_name" text,
    "profile_role" text,
    "planning_stage" text,
    "verification_token" varchar(255) NOT NULL,
    "verification_token_expiry" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "pending_signups_email_unique" UNIQUE("email")
);
