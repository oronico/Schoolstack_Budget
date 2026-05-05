import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, pendingSignupsTable } from "@workspace/db/schema";
import { eq, sql, and, or, isNull, lt } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from "@workspace/api-zod";
import { authMiddleware, generateToken, type AuthRequest } from "../middlewares/auth";
import { trackEvent } from "../lib/track-event";
import {
  sendPasswordResetEmail,
  sendVerifyEmail,
  sendAccountAlreadyExistsEmail,
  sendWelcomeEmail,
} from "../lib/mailer";
import { createRateLimiter } from "../lib/rate-limiter";

const router: IRouter = Router();

const authRateLimiter = createRateLimiter(60_000, 10);
const strictRateLimiter = createRateLimiter(60_000, 5);
// Round-5 #25 / Task #527: dedicated rate limiter for /auth/register.
// The endpoint now returns 202 with the same body for both new and
// existing emails (confirm-by-email flow), closing the status-code
// enumeration oracle that the round-5 timing fix could not. The tight
// 5/min/IP budget is kept anyway — signups are a once-per-founder
// action so the limit costs no legitimate UX, and it caps how fast an
// attacker can pump verification / "account exists" emails to a
// victim's inbox.
const registerRateLimiter = createRateLimiter(60_000, 5);

// Task #527: verification tokens live for 1h, mirroring the password-
// reset TTL. Long enough for a founder to find the email in their
// inbox, short enough that an attacker who later compromises a stale
// inbox cannot resurrect a discarded signup intent.
const VERIFICATION_TOKEN_TTL_MS = 3_600_000;

// Task #535 — bound the growth of pending_signups. The table holds a
// bcrypt'd password hash for every register attempt that never made it
// through verify-email; without a sweeper it grows monotonically and
// lookups by verificationToken get slower over time. Verify-email and
// the dev-only synchronous-promotion path already DELETE the row on
// success, so this only catches the truly abandoned attempts (founder
// closed the tab, mistyped their email, etc.). Pruned on the same
// 5-minute interval as the rate-limiter / error-logs sweepers wired in
// src/index.ts.
export async function cleanupExpiredPendingSignups(): Promise<number> {
  try {
    const deleted = await db
      .delete(pendingSignupsTable)
      .where(lt(pendingSignupsTable.verificationTokenExpiry, new Date()))
      .returning({ id: pendingSignupsTable.id });
    return deleted.length;
  } catch (err) {
    console.error("Pending-signup cleanup error:", err);
    return 0;
  }
}

// Task #527: dev-only flag that returns the raw verification / reset
// token in the /auth/register response so test suites can drive the
// verify-email step without a real mailer. Strictly gated on
// NODE_ENV !== "production" so the field can never leak in prod even
// if a future change forgets to strip it.
const isNonProd = (): boolean => process.env.NODE_ENV !== "production";

// Round-4 #20: precomputed cost-12 bcrypt hash used for the constant-time
// dummy compare on /auth/login when the email is unknown. Generated once at
// module load (not per request) so the cost matches a real user lookup.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "round4-dummy-password-never-matches-anything",
  12,
);

// Round-4 #24: minimum interval between forgot-password emails for the same
// account. Prevents a stalker from rotating IPs to invalidate every
// legitimate reset link a victim requests and to spam the inbox.
const FORGOT_PASSWORD_COOLDOWN_MS = 60_000;
const RESET_TOKEN_TTL_MS = 3_600_000;

// Round-4 #21: bound the per-event metadata blob we persist into events.jsonb
// so an authenticated attacker can't pump multi-MB payloads through
// /auth/track. Mirrors the /public/timing limits established in #19.
const MAX_TRACK_METADATA_KEYS = 16;
const MAX_TRACK_METADATA_STRING = 256;
function sanitizeTrackMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_TRACK_METADATA_KEYS) break;
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v === "string") {
      out[k] = v.slice(0, MAX_TRACK_METADATA_STRING);
    } else if (typeof v === "number") {
      out[k] = Number.isFinite(v) ? v : null;
    } else if (typeof v === "boolean" || v === null) {
      out[k] = v;
    } else {
      // Drop nested objects/arrays — analytics events should be flat.
      continue;
    }
    count++;
  }
  return out;
}

// Task #527 — confirm-by-email signup. Both branches do exactly one
// bcrypt.hash + one DB UPSERT/UPDATE so wall-clock response time stays
// equalized (the round-5 #25 fix), AND both branches return the same
// 202 + body shape so the status code is no longer an enumeration
// oracle. The legitimate inbox owner sees the truth via which email
// actually arrives:
//   - new email → "verify your email" with a one-time link that
//     POSTs to /auth/verify-email and provisions the user.
//   - existing email → "you already have an account, here's a
//     password-reset link" so a confused founder can recover instead
//     of getting stuck staring at a generic confirmation.
// Mailer + trackEvent are fire-and-forget (after res.json) for the
// same timing-equalization reasons documented in round-5 #26.
//
// Task #534: dev/test no longer auto-promotes the pending signup to a
// real user. The only non-prod escape hatch on this response is
// `_devToken` (+ `_devBranch`) so test helpers can drive
// /auth/verify-email without a real mailer. Dev and production now
// share identical register → verify-email flows.
router.post("/auth/register", registerRateLimiter, async (req, res) => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input. Email, password (min 8 chars), and name are required." });
      return;
    }
    const { email, password, name, schoolName, role, planningStage } = parsed.data;
    const lowerEmail = email.toLowerCase();

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, lowerEmail)).limit(1);

    // Generate the appropriate raw token now (so both branches do the
    // same crypto work before bcrypt) and only use the one that matches
    // the branch we end up in.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    // bcrypt.hash runs in BOTH branches:
    //   - new branch:      hash is stored in pending_signups
    //   - existing branch: hash is discarded (mirrors round-5 #25 dummy cost)
    const passwordHash = await bcrypt.hash(password, 12);

    let branch: "new" | "existing";
    let devToken: string | undefined;

    if (existing.length > 0) {
      branch = "existing";
      // Mirror the new-branch DB cost: a single UPDATE roundtrip on the
      // existing user row (no observable mutation — we touch lastSeenAt
      // to its current value). The actual reset token is generated and
      // emailed below, fire-and-forget, AFTER we respond.
      await db
        .update(usersTable)
        .set({ lastSeenAt: usersTable.lastSeenAt })
        .where(eq(usersTable.id, existing[0].id));
      if (isNonProd()) {
        // For tests, the "existing email" branch is exercised separately;
        // we surface a flag (no token here — the reset link is emailed).
        devToken = "__existing_account__";
      }
    } else {
      branch = "new";
      // Upsert into pending_signups by email. Re-submitting the form
      // (or fat-fingering the address) overwrites the prior pending row
      // so the most recent verification link is the only valid one.
      await db
        .insert(pendingSignupsTable)
        .values({
          email: lowerEmail,
          name,
          passwordHash,
          ...(schoolName !== undefined ? { schoolName: schoolName || null } : {}),
          ...(role !== undefined ? { profileRole: role || null } : {}),
          ...(planningStage !== undefined ? { planningStage: planningStage || null } : {}),
          verificationToken: tokenHash,
          verificationTokenExpiry: tokenExpiry,
        })
        .onConflictDoUpdate({
          target: pendingSignupsTable.email,
          set: {
            name,
            passwordHash,
            schoolName: schoolName !== undefined ? (schoolName || null) : null,
            profileRole: role !== undefined ? (role || null) : null,
            planningStage: planningStage !== undefined ? (planningStage || null) : null,
            verificationToken: tokenHash,
            verificationTokenExpiry: tokenExpiry,
            updatedAt: new Date(),
          },
        });
      if (isNonProd()) {
        devToken = rawToken;
      }
    }

    // Identical 202 body for both branches. The dev-only `_devToken`
    // field is stripped in production by the isNonProd() gate; tests
    // (api-server tests + e2e helpers) read it to drive verify-email
    // without a real mailer.
    const responseBody: Record<string, unknown> = {
      message:
        "If that email isn't already registered, we've sent a verification link. Check your inbox to finish creating your account.",
    };
    if (devToken !== undefined) {
      responseBody._devToken = devToken;
      responseBody._devBranch = branch;
    }
    res.status(202).json(responseBody);

    // Fire-and-forget side effects (mailer + analytics) so neither
    // branch's wall-clock cost depends on Resend's network latency.
    if (branch === "new") {
      sendVerifyEmail(lowerEmail, rawToken).catch((e) => {
        console.error(`[auth] register: sendVerifyEmail failed for ${lowerEmail}:`, e);
      });
    } else {
      // For an existing account we issue a fresh password-reset token
      // (so the "here's how to log in" email can include a working
      // reset link) — but ONLY if no recent reset was issued, to avoid
      // letting the register endpoint be used to invalidate a victim's
      // legitimate in-flight reset link.
      const resetRaw = crypto.randomBytes(32).toString("hex");
      const resetHash = crypto.createHash("sha256").update(resetRaw).digest("hex");
      const now = Date.now();
      const cooldownThreshold = new Date(now + RESET_TOKEN_TTL_MS - FORGOT_PASSWORD_COOLDOWN_MS);
      db
        .update(usersTable)
        .set({ resetToken: resetHash, resetTokenExpiry: new Date(now + RESET_TOKEN_TTL_MS) })
        .where(
          and(
            eq(usersTable.email, lowerEmail),
            or(isNull(usersTable.resetTokenExpiry), lt(usersTable.resetTokenExpiry, cooldownThreshold)),
          ),
        )
        .returning({ id: usersTable.id })
        .then((rows) => {
          // If the cooldown blocked us we still send a "you have an
          // account" notice, just without an embedded reset link.
          const hasFreshToken = rows.length > 0;
          sendAccountAlreadyExistsEmail(lowerEmail, hasFreshToken ? resetRaw : null).catch((e) => {
            console.error(`[auth] register: sendAccountAlreadyExistsEmail failed for ${lowerEmail}:`, e);
          });
        })
        .catch((e) => {
          console.error(`[auth] register: reset-token UPDATE failed for ${lowerEmail}:`, e);
        });
      trackEvent("register_existing_email_collision", existing[0].id, { email: lowerEmail }).catch(
        (e) => console.error(`[auth] register: trackEvent existing failed:`, e),
      );
    }
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/verify-email", registerRateLimiter, async (req, res) => {
  try {
    const parsed = VerifyEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A verification token is required." });
      return;
    }
    const { token } = parsed.data;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [pending] = await db
      .select()
      .from(pendingSignupsTable)
      .where(eq(pendingSignupsTable.verificationToken, tokenHash))
      .limit(1);
    if (!pending || pending.verificationTokenExpiry < new Date()) {
      res.status(400).json({ error: "Invalid or expired verification link." });
      return;
    }

    // Race-safety: between when the verification email was sent and
    // when the user clicks, somebody might have completed a separate
    // confirm-by-email flow with the same address. If the users row
    // already exists, just delete the pending row and surface the same
    // generic error — we don't want to log a stranger into an account
    // they may not control.
    const [alreadyUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, pending.email))
      .limit(1);
    if (alreadyUser) {
      await db.delete(pendingSignupsTable).where(eq(pendingSignupsTable.id, pending.id));
      res.status(400).json({ error: "Invalid or expired verification link." });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        email: pending.email,
        name: pending.name,
        passwordHash: pending.passwordHash,
        ...(pending.schoolName !== null ? { schoolName: pending.schoolName } : {}),
        ...(pending.profileRole !== null ? { profileRole: pending.profileRole } : {}),
        ...(pending.planningStage !== null ? { planningStage: pending.planningStage } : {}),
      })
      .returning();

    await db.delete(pendingSignupsTable).where(eq(pendingSignupsTable.id, pending.id));

    const authToken = generateToken(user.id, user.tokenVersion);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token: authToken,
    });

    trackEvent("signed_up", user.id, { email: user.email }).catch((e) => {
      console.error(`[auth] verify-email: trackEvent failed for user ${user.id}:`, e);
    });

    // Task #552 — fire-and-forget welcome email after the account lands.
    // Mirrors the verify-email / password-reset pattern: never blocks the
    // response and never surfaces to the caller, but routes through the
    // shared `deliverTransactionalEmail` adapter so a future provider
    // swap (SendGrid / Postmark / SES) is a one-file change and so a
    // developer running locally without RESEND_API_KEY sees the welcome
    // template surface in the workspace logs alongside the other senders.
    sendWelcomeEmail(user.email, user.name).catch((e) => {
      console.error(`[auth] verify-email: sendWelcomeEmail failed for user ${user.id}:`, e);
    });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/login", authRateLimiter, async (req, res) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    // Round-4 #20: equalize timing across the existing-user / unknown-email
    // branches. Previously the no-user branch returned 401 immediately while
    // the user-found branch always paid bcrypt.compare's ~150ms cost-12 work,
    // making the response time a reliable boolean oracle for "is this email
    // registered?". We now run bcrypt against a dummy hash for unknown users
    // so the wall-clock cost is the same regardless. The dummy hash is a
    // valid bcryptjs cost-12 hash of an unrelated value; it will never match
    // any real password.
    const passwordHashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const valid = await bcrypt.compare(password, passwordHashToCompare);
    if (!user || !valid) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    await db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, user.id));

    const token = generateToken(user.id, user.tokenVersion);
    await trackEvent("logged_in", user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/logout", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.userId) {
      await db.update(usersTable)
        .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
        .where(eq(usersTable.id, req.userId));
    }
    res.json({ message: "Logged out successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    res.json({ message: "Logged out successfully." });
  }
});

router.get("/auth/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }
    await db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      guidanceLevel: user.guidanceLevel ?? null,
      personaStage: user.personaStage ?? null,
      personaComfort: user.personaComfort ?? null,
      lenderLanguageEnabled: user.lenderLanguageEnabled ?? false,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

const VALID_PERSONA_STAGES = ["yet_to_launch", "existing"];
const VALID_PERSONA_COMFORTS = ["new_to_budgeting", "comfortable"];

// PATCH /auth/persona — sets the founder's stage + comfort. We also seed
// `guidanceLevel` here when it's not yet set so that picking a persona is
// the *single* onboarding choice for new users (Task #302). Comfort
// determines the seed: new-to-budgeting founders get the verbose "extra"
// guidance while comfortable founders default to the compact "advanced"
// view; either can be changed later from the user menu.
router.patch("/auth/persona", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { stage, comfort } = (req.body ?? {}) as { stage?: unknown; comfort?: unknown };
    if (typeof stage !== "string" || !VALID_PERSONA_STAGES.includes(stage)) {
      res.status(400).json({ error: "stage must be yet_to_launch or existing" });
      return;
    }
    if (typeof comfort !== "string" || !VALID_PERSONA_COMFORTS.includes(comfort)) {
      res.status(400).json({ error: "comfort must be new_to_budgeting or comfortable" });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const seededGuidance = existing.guidanceLevel
      ? existing.guidanceLevel
      : comfort === "new_to_budgeting"
        ? "extra"
        : "advanced";

    const [updated] = await db.update(usersTable)
      .set({
        personaStage: stage,
        personaComfort: comfort,
        guidanceLevel: seededGuidance,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.userId!))
      .returning();

    await trackEvent("founder_persona_selected", req.userId!, { stage, comfort });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      guidanceLevel: updated.guidanceLevel ?? null,
      personaStage: updated.personaStage ?? null,
      personaComfort: updated.personaComfort ?? null,
      lenderLanguageEnabled: updated.lenderLanguageEnabled ?? false,
    });
  } catch (err) {
    console.error("Update persona error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

const VALID_GUIDANCE_LEVELS = ["advanced", "basics", "extra"];

router.patch("/auth/guidance-level", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { guidanceLevel } = req.body;
    if (!guidanceLevel || !VALID_GUIDANCE_LEVELS.includes(guidanceLevel)) {
      res.status(400).json({ error: "guidanceLevel must be one of: advanced, basics, extra" });
      return;
    }
    const [updated] = await db.update(usersTable)
      .set({ guidanceLevel, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userId!))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      guidanceLevel: updated.guidanceLevel ?? null,
      personaStage: updated.personaStage ?? null,
      personaComfort: updated.personaComfort ?? null,
      lenderLanguageEnabled: updated.lenderLanguageEnabled ?? false,
    });
  } catch (err) {
    console.error("Update guidance level error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.patch("/auth/lender-language", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    const [updated] = await db.update(usersTable)
      .set({ lenderLanguageEnabled: enabled, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userId!))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      guidanceLevel: updated.guidanceLevel ?? null,
      personaStage: updated.personaStage ?? null,
      personaComfort: updated.personaComfort ?? null,
      lenderLanguageEnabled: updated.lenderLanguageEnabled ?? false,
    });
  } catch (err) {
    console.error("Update lender-language error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/auth/forgot-password", strictRateLimiter, async (req, res) => {
  try {
    const parsed = ForgotPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.json({ message: "If an account with that email exists, a reset link has been sent." });
      return;
    }
    const { email } = parsed.data;

    // Round-4 #24 (round-5 hardening): per-account cooldown enforced via a
    // single conditional UPDATE so two concurrent requests for the same
    // account cannot both observe a stale row, both pass the cooldown
    // check, and both issue tokens/emails. Earlier code did
    // SELECT -> compute -> UPDATE, which was TOCTOU-bypassable. The
    // conditional WHERE restricts the update to rows whose previously
    // recorded resetTokenExpiry is NULL or older than the cooldown
    // threshold (now + TTL - COOLDOWN, since lastIssuedAt = expiry - TTL).
    // Only the row(s) that actually pass the predicate come back via
    // RETURNING; the loser silently no-ops, preserving the generic 200.
    const now = Date.now();
    const resetTokenRaw = crypto.randomBytes(32).toString("hex");
    const resetToken = crypto.createHash("sha256").update(resetTokenRaw).digest("hex");
    const resetTokenExpiry = new Date(now + RESET_TOKEN_TTL_MS);
    const cooldownThreshold = new Date(now + RESET_TOKEN_TTL_MS - FORGOT_PASSWORD_COOLDOWN_MS);
    const updated = await db
      .update(usersTable)
      .set({ resetToken, resetTokenExpiry })
      .where(
        and(
          eq(usersTable.email, email.toLowerCase()),
          or(isNull(usersTable.resetTokenExpiry), lt(usersTable.resetTokenExpiry, cooldownThreshold)),
        ),
      )
      .returning({ id: usersTable.id, email: usersTable.email });
    const winner = updated[0];

    // Round-5 #26: respond FIRST, do the trackEvent + Resend network
    // call AFTER. Pre-fix the existing-user-past-cooldown branch paid
    // sendPasswordResetEmail's 100-500ms wall-clock cost in the response
    // critical path, while the unknown-email and in-cooldown branches
    // returned in ~5ms after a single UPDATE. That timing differential
    // was a reliable enumeration oracle for fresh accounts (round-5
    // hardening of #24 amplified it because the conditional UPDATE made
    // the no-op branches even faster). Moving the slow work behind the
    // response makes all three branches return in roughly one DB
    // roundtrip; the email still goes out, just fire-and-forget. Errors
    // are logged so operators still see Resend outages.
    res.json({ message: "If an account with that email exists, a reset link has been sent." });

    if (winner) {
      trackEvent("requested_password_reset", winner.id).catch((e) => {
        console.error(`[auth] forgot-password: trackEvent failed for user ${winner.id}:`, e);
      });
      sendPasswordResetEmail(winner.email, resetTokenRaw)
        .then((result) => {
          // Round-3 #17: never surface mailer-failure status to the
          // unauth client (already enforced by responding above before
          // we check the result here). Just log so operators notice.
          if (!result.success) {
            console.error(
              `[auth] forgot-password: mailer failed for user ${winner.id}: ${result.error || "unknown"}`,
            );
          }
        })
        .catch((e) => {
          console.error(
            `[auth] forgot-password: sendPasswordResetEmail crashed for user ${winner.id}:`,
            e,
          );
        });
    }
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
});


router.post("/auth/reset-password", strictRateLimiter, async (req, res) => {
  try {
    const parsed = ResetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Token and new password (min 8 chars) are required." });
      return;
    }
    const { token, password } = parsed.data;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, tokenHash)).limit(1);
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(usersTable).set({
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      tokenVersion: sql`${usersTable.tokenVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    await trackEvent("reset_password", user.id);
    res.json({ message: "Password has been reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

const ALLOWED_EVENTS = new Set([
  "guidance_mode_prompt_shown",
  "guidance_mode_selected",
  "guidance_mode_changed",
  "explainer_opened",
  "explainer_collapsed",
  "explainer_dismissed",
  "kpi_formula_opened",
  "kpi_formula_closed",
  "wizard_section_completed",
  "analysis_view_opened",
  "diagnostic_panel_shown",
  "diagnostic_action_clicked",
  "micro_lesson_shown",
  "micro_lesson_dismissed",
  "primer_card_viewed",
  "primer_completed",
  "primer_skipped",
  "primer_opened",
  "help_menu_opened",
  "lender_language_toggled",
  "founder_persona_selected",
  "founder_persona_prompt_shown",
  "founder_persona_changed",
  "cta_attributed_signup",
  // Coach surface *_shown events. The /admin/coaching-funnel route
  // pairs each of these with its *_engaged / *_dismissed counterpart
  // (Task #285) to render shown vs engaged vs dismissed totals over a
  // 30-day window. Advanced-mode founders never emit these.
  "dashboard_launcher_coach_shown",
  "dashboard_launcher_coach_engaged",
  "things_changed_coach_shown",
  "things_changed_coach_engaged",
  "decision_why_explainer_shown",
  "decision_why_explainer_engaged",
  "impact_kpi_nudge_shown",
  "impact_kpi_nudge_engaged",
  "save_action_apply_reminder_shown",
  "save_action_apply_reminder_engaged",
  "save_action_apply_reminder_dismissed",
  "accounting_export_lesson_shown",
  "accounting_export_lesson_engaged",
  "accounting_export_lesson_dismissed",
  "accounting_export_post_upload_coach_shown",
  "accounting_export_post_upload_coach_engaged",
  "accounting_export_post_upload_coach_dismissed",
  "actuals_coach_intro_shown",
  "actuals_coach_intro_engaged",
  "actuals_variance_nudge_shown",
  "actuals_variance_nudge_engaged",
  "whatif_link_clicked",
]);

router.post("/auth/track", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { event, metadata } = req.body;
    if (!event || typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
      res.status(400).json({ error: "Invalid event name." });
      return;
    }
    // Round-4 #21: bound the persisted metadata blob. The 5MB JSON body
    // limit is the only previous cap on `safeMetadata`, so any authed
    // attacker could pump multi-MB jsonb into events per request.
    const safeMetadata = sanitizeTrackMetadata(metadata);
    await trackEvent(event, req.userId!, safeMetadata);
    res.json({ ok: true });
  } catch (err) {
    console.error("Track event error:", err);
    res.status(500).json({ error: "Failed to track event." });
  }
});

export default router;
