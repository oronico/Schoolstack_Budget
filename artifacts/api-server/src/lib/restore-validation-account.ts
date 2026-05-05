import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, financialModelsTable } from "@workspace/db";
import { MICROSCHOOL_DEMO } from "./demo-models/index.js";

// Task #581 — dedicated DB-restore validation account.
//
// The DB restore runbook (docs/RUNBOOK_DB_RESTORE.md, verification
// step 4d) tells the on-call engineer to log into the restored
// database as a known, no-human-owner account so the trial confirms
// `/auth/login` and `/auth/me` actually work end-to-end against the
// restored data — and that `/models` returns a non-empty list, which
// proves `financial_models` rows came across as well. Until this
// account existed, the trial was forced to fall back to a much weaker
// "schools count > 0 and /healthz returns 200" check that would not
// catch e.g. a corrupted users table or broken sessions.
//
// This module ensures the account exists on whichever database it is
// pointed at. It is intended to be run by an operator (against
// production) the first time, and then re-runnable any time after
// (idempotent: existing user → no-op or in-place password rotation
// when RESTORE_VALIDATION_PASSWORD changes; missing model → seeded;
// existing model → left alone).
//
// Credentials policy:
//   - Email is the well-known one referenced by the runbook
//     (`restore-validation@schoolstack.example`). The `.example` TLD
//     is reserved (RFC 2606) so the account can never collide with a
//     real founder mailbox and never receive real mail.
//   - Password is read from the RESTORE_VALIDATION_PASSWORD env var
//     so it never lives in the repo. The operator pulls it from the
//     "DB restore validation account" entry in 1Password (the same
//     name the runbook references) and exports it before running.
//   - The account is no-human-owned, has `role: "user"` (no admin
//     powers), and carries one realistic financial model so the
//     `/models` step in the runbook returns a non-empty list.

export const RESTORE_VALIDATION_EMAIL = "restore-validation@schoolstack.example";
export const RESTORE_VALIDATION_NAME = "DB Restore Validation";
export const RESTORE_VALIDATION_MODEL_NAME =
  "DB Restore Validation Model (do not edit)";

export interface EnsureRestoreValidationDeps {
  database?: typeof db;
  log?: (...args: unknown[]) => void;
  password?: string;
}

export type EnsureRestoreValidationResult =
  | { status: "skipped"; reason: string }
  | {
      status: "ok";
      userId: number;
      created: boolean;
      passwordRotated: boolean;
      modelCreated: boolean;
    };

/**
 * Idempotently ensure the dedicated restore-validation account (and
 * its single financial model) exist on the target database. Safe to
 * re-run; safe to run against any environment (dev, preview, prod).
 *
 * Returns a structured result so the CLI wrapper can print a useful
 * summary and tests can assert on each branch without parsing logs.
 */
export async function ensureRestoreValidationAccount(
  deps: EnsureRestoreValidationDeps = {},
): Promise<EnsureRestoreValidationResult> {
  const log = deps.log ?? console.log;
  // Use the caller's `database` whenever they passed the key (even if
  // they explicitly passed null/undefined to opt out for a test); only
  // fall back to the module-level singleton when the key is absent.
  const database =
    "database" in deps ? deps.database : db;

  if (!database) {
    return { status: "skipped", reason: "DATABASE_URL not configured" };
  }

  const password = deps.password ?? process.env.RESTORE_VALIDATION_PASSWORD;
  if (typeof password !== "string" || password.length < 8) {
    return {
      status: "skipped",
      reason:
        "RESTORE_VALIDATION_PASSWORD env var is missing or shorter than 8 chars",
    };
  }

  const [existing] = await database
    .select({
      id: usersTable.id,
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.email, RESTORE_VALIDATION_EMAIL))
    .limit(1);

  let userId: number;
  let created = false;
  let passwordRotated = false;

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    const [inserted] = await database
      .insert(usersTable)
      .values({
        email: RESTORE_VALIDATION_EMAIL,
        name: RESTORE_VALIDATION_NAME,
        passwordHash,
        schoolName: "Restore Validation",
        profileRole: "ops",
        planningStage: "planning",
        termsAcceptedAt: new Date(),
      })
      .returning({ id: usersTable.id });
    userId = inserted.id;
    created = true;
    log(
      `[restore-validation] Created user ${RESTORE_VALIDATION_EMAIL} (id=${userId}).`,
    );
  } else {
    userId = existing.id;
    const matches =
      typeof existing.passwordHash === "string" &&
      existing.passwordHash.length > 0 &&
      bcrypt.compareSync(password, existing.passwordHash);
    if (!matches) {
      const newHash = await bcrypt.hash(password, 12);
      await database
        .update(usersTable)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      passwordRotated = true;
      log(
        `[restore-validation] Rotated password for ${RESTORE_VALIDATION_EMAIL} (id=${userId}) to match RESTORE_VALIDATION_PASSWORD.`,
      );
    }
  }

  const [existingModel] = await database
    .select({ id: financialModelsTable.id })
    .from(financialModelsTable)
    .where(eq(financialModelsTable.userId, userId))
    .limit(1);

  let modelCreated = false;
  if (!existingModel) {
    const [insertedModel] = await database
      .insert(financialModelsTable)
      .values({
        userId,
        name: RESTORE_VALIDATION_MODEL_NAME,
        status: "complete",
        currentStep: 7,
        data: MICROSCHOOL_DEMO.data,
        schoolStage: MICROSCHOOL_DEMO.schoolStage,
        fundingProfile: MICROSCHOOL_DEMO.fundingProfile,
      })
      .returning({ id: financialModelsTable.id });
    modelCreated = true;
    log(
      `[restore-validation] Seeded validation model (id=${insertedModel.id}) for user ${userId}.`,
    );
  }

  return { status: "ok", userId, created, passwordRotated, modelCreated };
}
