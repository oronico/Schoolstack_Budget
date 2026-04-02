import { Router } from "express";
import { db, errorLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";

const router = Router();

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "api_key",
  "resetToken",
  "creditCard",
  "ssn",
]);

function stripSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripSensitive);

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      cleaned[key] = "[REDACTED]";
    } else {
      cleaned[key] = stripSensitive(value);
    }
  }
  return cleaned;
}

router.post("/errors/report", async (req, res) => {
  try {
    const { message, stack, url, userAgent } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const jwt = await import("jsonwebtoken");
        const { getJwtSecret } = await import("../middlewares/auth");
        const decoded = jwt.default.verify(authHeader.slice(7), getJwtSecret()) as { userId?: number };
        if (decoded.userId) userId = String(decoded.userId);
      }
    } catch {
      // token extraction is best-effort
    }

    await db.insert(errorLogsTable).values({
      userId,
      errorMessage: String(message).slice(0, 2000),
      errorStack: stack ? String(stack).slice(0, 5000) : null,
      route: url ? String(url).slice(0, 500) : null,
      requestBody: userAgent ? { userAgent: String(userAgent).slice(0, 500), source: "frontend" } : null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to log client error:", err);
    res.status(500).json({ error: "Failed to log error" });
  }
});

router.get("/admin/errors", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const errors = await db
      .select()
      .from(errorLogsTable)
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(50);

    res.json({ items: errors });
  } catch (err) {
    console.error("Failed to fetch error logs:", err);
    res.status(500).json({ error: "Failed to fetch error logs" });
  }
});

export { stripSensitive };
export default router;
