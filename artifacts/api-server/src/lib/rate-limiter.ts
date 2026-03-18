import { db, rateLimitsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { sql, lt } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const CLEANUP_RETENTION_MS = 5 * 60_000;

let tableVerified = false;

async function ensureTable(): Promise<void> {
  if (tableVerified) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        hits INTEGER NOT NULL DEFAULT 0,
        window_start TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    tableVerified = true;
  } catch (err) {
    console.error("Failed to ensure rate_limits table:", err);
  }
}

export function createRateLimiter(windowMs = RATE_WINDOW_MS, maxRequests = RATE_MAX_REQUESTS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `public:${ip}`;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    try {
      await ensureTable();

      const result = await db
        .insert(rateLimitsTable)
        .values({ key, hits: 1, windowStart: now })
        .onConflictDoUpdate({
          target: rateLimitsTable.key,
          set: {
            hits: sql`CASE
              WHEN ${rateLimitsTable.windowStart} < ${windowStart}
              THEN 1
              ELSE ${rateLimitsTable.hits} + 1
            END`,
            windowStart: sql`CASE
              WHEN ${rateLimitsTable.windowStart} < ${windowStart}
              THEN ${now}::timestamp
              ELSE ${rateLimitsTable.windowStart}
            END`,
          },
        })
        .returning({ hits: rateLimitsTable.hits });

      const hits = result[0]?.hits ?? 1;

      if (hits > maxRequests) {
        res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
        return;
      }

      next();
    } catch (err: any) {
      if (err?.cause?.code === "42P01") {
        tableVerified = false;
      }
      console.error("Rate limiter DB error, allowing request:", err);
      next();
    }
  };
}

export async function cleanupExpiredRateLimits() {
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
  try {
    await ensureTable();
    await db.delete(rateLimitsTable).where(lt(rateLimitsTable.windowStart, cutoff));
  } catch (err) {
    console.error("Rate limit cleanup error:", err);
  }
}
