import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable } from "@workspace/db";
import {
  CHARTER_SCHOOL_DEMO,
  CHESTERTON_ACADEMY_DEMO,
  MICROSCHOOL_DEMO,
  PRIVATE_SCHOOL_DEMO,
} from "./demo-models/index.js";

// Task #531 — Seed preview environments with realistic demo data.
//
// Per-PR Railway environments (see README "Preview environments" + the
// netlify.toml deploy-preview block) come up with a fresh, empty Postgres.
// Without seed data, a reviewer landing on the deploy-preview URL has to
// register a brand-new account and rebuild a model from scratch just to
// smoke-test a UI change — which kills the whole point of per-PR previews.
//
// This module inserts:
//   1. A single known demo user (`demo@schoolstack.ai` / `demo1234`) that
//      reviewers can log in with directly. It is a verified `users` row
//      (NOT a pending_signups row), so the standard /auth/login flow works
//      with no email round-trip.
//   2. Four complete `financial_models` rows owned by that user — a
//      tuition-based microschool, a tuition-based private school, a
//      charter school on per-pupil public funding (ADM / grade-band),
//      and a Chesterton-Schools-Network-shaped Catholic classical
//      academy (also tuition-based, but with the CSN single-freshman-
//      class founding pattern, classical subject specialists, and the
//      CSN-template philanthropy pyramid) — all at currentStep 7 (the
//      Review/Export step) so reviewers see populated charts, exports,
//      and the consultant engine immediately on opening the model. The
//      charter row exercises the `fundingProfile: charter_public_funded`
//      code path (public-funding revenue rows, ADM grade-band per-pupil
//      calc, charter consultant narrative) which is meaningfully
//      different from the tuition flow — see task #541. The Chesterton
//      Academy row is the founding-class demo used by the
//      `chesterton-preview` branch deploy (see docs/CHESTERTON_PREVIEW.md
//      and task #558).
//
// The seed is idempotent and self-gating: it runs only when the `users`
// table is empty. That single check is the safety net that prevents this
// from ever clobbering production (which always has users) — see the
// SKIP_PREVIEW_SEED escape hatch below for belt-and-suspenders.

export const DEMO_USER_EMAIL = "demo@schoolstack.ai";
// Default password used when PREVIEW_DEMO_PASSWORD is not set in the
// environment. Documented in README so reviewers know what to type on
// a default-config preview. Per task #540, individual environments can
// override this by setting PREVIEW_DEMO_PASSWORD on the Railway service
// (or any other env-var source) — the seed will use that value instead
// without any code changes.
export const DEMO_USER_PASSWORD_DEFAULT = "demo1234";
// Back-compat alias kept for existing imports/tests that referenced the
// hardcoded default before task #540 made it configurable.
export const DEMO_USER_PASSWORD = DEMO_USER_PASSWORD_DEFAULT;
const DEMO_USER_NAME = "Demo Reviewer";

/**
 * Resolve the demo-user password from the environment, falling back to
 * the documented default. Exported so tests can exercise both branches
 * without poking at module internals.
 */
export function resolveDemoPassword(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PREVIEW_DEMO_PASSWORD;
  if (typeof override === "string" && override.length > 0) {
    return override;
  }
  return DEMO_USER_PASSWORD_DEFAULT;
}

// The four demo financial models all come from the canonical
// demo-models/ directory so a tweak there is reflected in both the
// PR-preview seed and (where applicable) the legislator-samples
// script (see task #546). The seed only adds its own "(Demo …)" name
// suffix on top.
//
// All four are exported so the end-to-end smoke tests
// (tests/charter-demo-end-to-end.ts for the charter / public-funding
// path, tests/non-charter-demos-end-to-end.ts for the three tuition
// paths — task #547 and task #558) can run these exact payloads
// through the consultant engine, workbook export, and lender packet
// without re-declaring them.
export const MICROSCHOOL_MODEL = {
  name: `${MICROSCHOOL_DEMO.baseSchoolName} (Demo Microschool)`,
  schoolStage: MICROSCHOOL_DEMO.schoolStage,
  fundingProfile: MICROSCHOOL_DEMO.fundingProfile,
  data: MICROSCHOOL_DEMO.data,
};

export const PRIVATE_SCHOOL_MODEL = {
  name: `${PRIVATE_SCHOOL_DEMO.baseSchoolName} (Demo Private School)`,
  schoolStage: PRIVATE_SCHOOL_DEMO.schoolStage,
  fundingProfile: PRIVATE_SCHOOL_DEMO.fundingProfile,
  data: PRIVATE_SCHOOL_DEMO.data,
};

// Exported so the end-to-end smoke test (tests/charter-demo-end-to-end.ts,
// task #545) can run this exact payload through the consultant engine,
// workbook export, and lender packet without re-declaring it.
export const CHARTER_SCHOOL_MODEL = {
  name: `${CHARTER_SCHOOL_DEMO.baseSchoolName} (Demo Charter School)`,
  schoolStage: CHARTER_SCHOOL_DEMO.schoolStage,
  fundingProfile: CHARTER_SCHOOL_DEMO.fundingProfile,
  data: CHARTER_SCHOOL_DEMO.data,
};

// Task #558 — fourth demo modeled on a CSN founding-class Catholic
// classical academy. Uses the standard `private_school` schoolType so
// it flows through the consultant engine, formula workbook, lender
// packet, and board packet identically to the other tuition demos.
// Re-export lets the non-charter demos end-to-end smoke test exercise
// it the same way it exercises the microschool and private-school
// payloads.
export const CHESTERTON_ACADEMY_MODEL = {
  name: `${CHESTERTON_ACADEMY_DEMO.baseSchoolName} (Demo Chesterton Academy)`,
  schoolStage: CHESTERTON_ACADEMY_DEMO.schoolStage,
  fundingProfile: CHESTERTON_ACADEMY_DEMO.fundingProfile,
  data: CHESTERTON_ACADEMY_DEMO.data,
};

export interface SeedPreviewDataDeps {
  database?: typeof db;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
}

/**
 * Seed the demo user + sample financial models, but only when the
 * `users` table is empty. Safe to call on every startup; a no-op once
 * the database has any user (real or seeded).
 *
 * Behavior:
 *   - SKIP_PREVIEW_SEED=true        → skip unconditionally (prod safety)
 *   - DATABASE_URL not configured   → skip with warning (no DB to seed)
 *   - any users already exist       → skip silently
 *   - users table empty             → insert demo user + 3 models
 *
 * Errors are logged but never thrown — a failed seed must not prevent
 * the API from starting up. The DB-emptiness check is the single
 * source of truth for "should we seed?", which keeps prod safe even
 * if SKIP_PREVIEW_SEED is forgotten.
 */
export async function seedPreviewDataIfEmpty(deps: SeedPreviewDataDeps = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const database = deps.database ?? db;

  if (process.env.SKIP_PREVIEW_SEED === "true") {
    log("[seed] SKIP_PREVIEW_SEED=true — skipping preview-data seed.");
    return;
  }

  if (!database) {
    log("[seed] DATABASE_URL not configured — skipping preview-data seed.");
    return;
  }

  try {
    const existingUsers = await database
      .select({ id: usersTable.id })
      .from(usersTable)
      .limit(1);

    if (existingUsers.length > 0) {
      // Database has at least one user — assume this is either
      // production or an already-seeded preview. Either way, nothing
      // to do.
      return;
    }

    log("[seed] Empty users table — seeding demo user and sample models...");

    const demoPassword = resolveDemoPassword();
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    const [demoUser] = await database
      .insert(usersTable)
      .values({
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_NAME,
        passwordHash,
        schoolName: "Demo School",
        profileRole: "founder",
        planningStage: "planning",
        termsAcceptedAt: new Date(),
      })
      .returning();

    log(`[seed] Created demo user: ${demoUser.email} (id=${demoUser.id})`);

    for (const sample of [
      MICROSCHOOL_MODEL,
      PRIVATE_SCHOOL_MODEL,
      CHARTER_SCHOOL_MODEL,
      CHESTERTON_ACADEMY_MODEL,
    ]) {
      const [model] = await database
        .insert(financialModelsTable)
        .values({
          userId: demoUser.id,
          name: sample.name,
          status: "complete",
          currentStep: 7,
          data: sample.data,
          schoolStage: sample.schoolStage,
          fundingProfile: sample.fundingProfile,
        })
        .returning({ id: financialModelsTable.id, name: financialModelsTable.name });
      log(`[seed]   + model: ${model.name} (id=${model.id})`);
    }

    const passwordSource =
      demoPassword === DEMO_USER_PASSWORD_DEFAULT
        ? "default"
        : "PREVIEW_DEMO_PASSWORD override";
    log(
      `[seed] Done. Reviewers can log in with ${DEMO_USER_EMAIL} / ${demoPassword} (password source: ${passwordSource}).`,
    );
  } catch (err) {
    // A failed seed must not prevent the server from starting. The
    // worst-case outcome is reviewers see an empty preview and have
    // to register manually — same as before this script existed.
    logError("[seed] Failed to seed preview data:", err);
  }
}
