import { Router } from "express";
import { db, errorLogsTable } from "@workspace/db";
import { desc, lt } from "drizzle-orm";
import { authMiddleware, verifyTokenStrict } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";
import { createRateLimiter } from "../lib/rate-limiter";

const router = Router();

// /errors/report is unauthenticated (frontend calls it pre-login too) but
// it WRITES to error_logs, so without throttling a single attacker can
// fill the table indefinitely (round-3 #18). Cap at 30 reports/min/IP.
// Pair with cleanupOldErrorLogs() below for retention.
const errorReportRateLimiter = createRateLimiter(60_000, 30);

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

router.post("/errors/report", errorReportRateLimiter, async (req, res) => {
  try {
    const { message, stack, url, userAgent } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Optional attribution. Round-3 #15: must run the same strict
    // signature + claim shape + tokenVersion + DB-existence check as
    // authMiddleware — a bare jwt.verify here trusts revoked / logged-out
    // tokens and (worse) trusts whatever the JWT claims as `userId`,
    // re-introducing the round-2 ghost-user bypass on this surface.
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const result = await verifyTokenStrict(authHeader.slice(7));
      if (result.ok) userId = String(result.userId);
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

// Round-3 #18: bound the growth of error_logs. Without this the table
// grows monotonically — there's no admin UI to prune it and the
// rate-limiter cleanup task only sweeps rate_limits. 30 days is enough
// for triage; older rows are dropped on the same 5-minute interval as
// the rate-limit sweeper (wired in src/index.ts).
const ERROR_LOG_RETENTION_MS = 30 * 24 * 60 * 60_000;

export async function cleanupOldErrorLogs() {
  const cutoff = new Date(Date.now() - ERROR_LOG_RETENTION_MS);
  try {
    await db.delete(errorLogsTable).where(lt(errorLogsTable.createdAt, cutoff));
  } catch (err) {
    console.error("Error log cleanup error:", err);
  }
}

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
