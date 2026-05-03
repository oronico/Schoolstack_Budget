import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql, and, or, isNull, lt } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { authMiddleware, generateToken, type AuthRequest } from "../middlewares/auth";
import { trackEvent } from "../lib/track-event";
import { sendPasswordResetEmail } from "../lib/mailer";
import { createRateLimiter } from "../lib/rate-limiter";

const router: IRouter = Router();

const authRateLimiter = createRateLimiter(60_000, 10);
const strictRateLimiter = createRateLimiter(60_000, 5);
// Round-5 #25: dedicated rate limiter for /auth/register. Even with the
// timing-equalizing dummy bcrypt below, the 201 vs 409 status divergence
// remains an enumeration oracle for any caller willing to make N
// requests. Tightening the per-IP budget from 10/min (authRateLimiter)
// to 5/min cuts the practical scan rate in half without affecting any
// realistic legitimate signup flow (a human types one password). A full
// close requires moving signup to an email-confirmation flow that
// returns 202 from both branches; tracked for follow-up.
const registerRateLimiter = createRateLimiter(60_000, 5);

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

router.post("/auth/register", registerRateLimiter, async (req, res) => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input. Email, password (min 8 chars), and name are required." });
      return;
    }
    const { email, password, name, schoolName, role, planningStage } = parsed.data;

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      // Round-5 #25: equalize wall-clock cost across the
      // duplicate-email and new-email branches so response time can't
      // boolean-distinguish "is this email registered?" the way the
      // pre-fix login route could (round-4 #20). The new-email branch
      // pays bcrypt.hash(password, 12) (~150ms cost-12) PLUS a user
      // INSERT roundtrip; we mirror BOTH costs here:
      //   - bcrypt.hash (NOT compare — hash includes salt generation,
      //     which adds a small but measurable cost vs compare). Using
      //     hash here matches the new branch byte-for-byte on the CPU
      //     side. Result is discarded.
      //   - One no-op UPDATE that touches zero rows, matching the
      //     wall-clock cost of the user INSERT roundtrip.
      // The trackEvent INSERT was already moved out of the new
      // branch's critical path (see below), so we don't need to
      // simulate it here.
      // We then return 409 — the status code itself remains an
      // enumeration oracle for any caller willing to spend a request,
      // but the per-IP rate limit is tightened to 5/min and the
      // timing oracle is closed. Full disclosure: closing the
      // status-code oracle requires moving signup to an email-
      // confirmation flow (always return 202).
      await bcrypt.hash(password, 12);
      await db
        .update(usersTable)
        .set({ lastSeenAt: usersTable.lastSeenAt })
        .where(eq(usersTable.id, -1));
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      name,
      passwordHash,
      ...(schoolName !== undefined && { schoolName: schoolName || null }),
      ...(role !== undefined && { profileRole: role || null }),
      ...(planningStage !== undefined && { planningStage: planningStage || null }),
    }).returning();

    const token = generateToken(user.id, user.tokenVersion);
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
    // Round-5 #25: trackEvent moved AFTER res.json so the new-email
    // branch's critical-path cost matches the duplicate-email branch
    // (one bcrypt + one DB roundtrip each). The events row is still
    // recorded; just fire-and-forget.
    trackEvent("signed_up", user.id, { email: user.email }).catch((e) => {
      console.error(`[auth] register: trackEvent failed for user ${user.id}:`, e);
    });
  } catch (err) {
    console.error("Register error:", err);
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
