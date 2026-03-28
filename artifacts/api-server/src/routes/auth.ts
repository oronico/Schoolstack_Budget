import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { authMiddleware, generateToken, type AuthRequest } from "../middlewares/auth";
import { trackEvent } from "../lib/track-event";
import { sendPasswordResetEmail } from "../lib/mailer";

const router: IRouter = Router();

router.post("/auth/register", async (req, res) => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input. Email, password (min 8 chars), and name are required." });
      return;
    }
    const { email, password, name, schoolName, role, planningStage } = parsed.data;

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
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
    await trackEvent("signed_up", user.id, { email: user.email });
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
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
    res.json({ id: user.id, email: user.email, name: user.name, guidanceLevel: user.guidanceLevel ?? null });
  } catch (err) {
    console.error("Get me error:", err);
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
    res.json({ id: updated.id, email: updated.email, name: updated.name, guidanceLevel: updated.guidanceLevel ?? null });
  } catch (err) {
    console.error("Update guidance level error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const parsed = ForgotPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.json({ message: "If an account with that email exists, a reset link has been sent." });
      return;
    }
    const { email } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000);
      await db.update(usersTable).set({ resetToken, resetTokenExpiry }).where(eq(usersTable.id, user.id));
      await trackEvent("requested_password_reset", user.id);
      const result = await sendPasswordResetEmail(user.email, resetToken);
      if (!result.success) {
        res.status(503).json({ error: result.error || "Unable to send reset email. Please try again later." });
        return;
      }
    }

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
});

router.get("/auth/debug-reset-token", async (req, res) => {
  try {
    const email = req.query.email as string;
    if (!email) { res.status(400).json({ error: "email required" }); return; }
    const [user] = await db.select({
      id: usersTable.id,
      hasToken: sql<boolean>`reset_token IS NOT NULL`,
      expiry: usersTable.resetTokenExpiry,
      tokenLen: sql<number>`LENGTH(reset_token)`,
    }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) { res.json({ found: false }); return; }
    const now = new Date();
    res.json({
      found: true,
      userId: user.id,
      hasToken: user.hasToken,
      tokenLength: user.tokenLen,
      expiry: user.expiry?.toISOString() ?? null,
      serverNow: now.toISOString(),
      isExpired: user.expiry ? user.expiry < now : null,
      diffMs: user.expiry ? user.expiry.getTime() - now.getTime() : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const parsed = ResetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Token and new password (min 8 chars) are required." });
      return;
    }
    const { token, password } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);
    if (!user) {
      console.error("[reset-password] No user found for token (first 8 chars):", token.substring(0, 8));
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }
    if (!user.resetTokenExpiry) {
      console.error("[reset-password] Token found but no expiry set for user:", user.id);
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }
    const now = new Date();
    if (user.resetTokenExpiry < now) {
      console.error("[reset-password] Token expired for user:", user.id, "expiry:", user.resetTokenExpiry.toISOString(), "now:", now.toISOString());
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
]);

router.post("/auth/track", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { event, metadata } = req.body;
    if (!event || typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
      res.status(400).json({ error: "Invalid event name." });
      return;
    }
    const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
    await trackEvent(event, req.userId!, safeMetadata);
    res.json({ ok: true });
  } catch (err) {
    console.error("Track event error:", err);
    res.status(500).json({ error: "Failed to track event." });
  }
});

export default router;
