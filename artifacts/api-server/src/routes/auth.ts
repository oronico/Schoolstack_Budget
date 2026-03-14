import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { authMiddleware, generateToken, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res) => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input. Email, password (min 8 chars), and name are required." });
      return;
    }
    const { email, password, name } = parsed.data;

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
    }).returning();

    const token = generateToken(user.id);
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

    const token = generateToken(user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.json({ message: "Logged out successfully." });
});

router.get("/auth/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error("Get me error:", err);
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
      console.log(`Password reset requested for ${email}. Token generated (use email service in production).`);
    }

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.json({ message: "If an account with that email exists, a reset link has been sent." });
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
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(usersTable).set({
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    res.json({ message: "Password has been reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
