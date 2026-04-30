import { db, rateLimitsTable } from "@workspace/db";
import { sql, lt } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const CLEANUP_RETENTION_MS = 5 * 60_000;

// When the Playwright e2e workflow boots the api-server it sets
// E2E_START_SERVERS=1. The e2e suite registers many users sequentially
// from a single IP (localhost), which exhausts the production rate-limit
// (5–10 requests/min/endpoint) and produces spurious 429 failures that
// have nothing to do with the code under test. We bypass the limiter
// only when that env flag is set so production behavior is untouched.
const E2E_BYPASS = process.env.E2E_START_SERVERS === "1";

export function createRateLimiter(windowMs = RATE_WINDOW_MS, maxRequests = RATE_MAX_REQUESTS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (E2E_BYPASS) {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const endpoint = req.path;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    try {
      const result = await db
        .insert(rateLimitsTable)
        .values({ ip, endpoint, hitCount: 1, windowStart: now })
        .onConflictDoUpdate({
          target: [rateLimitsTable.ip, rateLimitsTable.endpoint],
          set: {
            hitCount: sql`CASE
              WHEN ${rateLimitsTable.windowStart} < ${windowStart}
              THEN 1
              ELSE ${rateLimitsTable.hitCount} + 1
            END`,
            windowStart: sql`CASE
              WHEN ${rateLimitsTable.windowStart} < ${windowStart}
              THEN ${now}::timestamp
              ELSE ${rateLimitsTable.windowStart}
            END`,
          },
        })
        .returning({ hitCount: rateLimitsTable.hitCount });

      const hits = result[0]?.hitCount ?? 1;

      if (hits > maxRequests) {
        res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
        return;
      }

      next();
    } catch (err) {
      console.error("Rate limiter DB error, allowing request:", err);
      next();
    }
  };
}

export async function cleanupExpiredRateLimits() {
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
  try {
    await db.delete(rateLimitsTable).where(lt(rateLimitsTable.windowStart, cutoff));
  } catch (err) {
    console.error("Rate limit cleanup error:", err);
  }
}
