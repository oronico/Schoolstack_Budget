import { Router } from "express";
import { db, errorLogsTable } from "@workspace/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { authMiddleware, verifyTokenStrict, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";
import { createRateLimiter } from "../lib/rate-limiter";
import { recordErrorLog } from "../lib/error-log";
import { KEY_ROTATION_FAILURE_ROUTE } from "../lib/key-rotation-alert";

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

    await recordErrorLog({
      userId,
      errorMessage: String(message),
      errorStack: stack ? String(stack) : null,
      route: url ? String(url) : null,
      requestBody: userAgent
        ? { userAgent: String(userAgent).slice(0, 500), source: "frontend" }
        : null,
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

// Task #883 — Surface key-rotation failures (Task #871 writes them
// to error_logs tagged `route: "key_rotation_failure"`) as a
// dedicated, dismissible admin alert. The vanilla /admin/errors
// surface buries them next to generic 500s; operators need to see
// the per-table failure counts and sample row ids without cracking
// open the raw `request_body` jsonb.
//
// Acknowledgement is stored on the same row by mutating
// `request_body.acknowledgedAt` / `acknowledgedBy`. We intentionally
// avoid a schema migration: the column is jsonb, the alert writer
// owns the shape, and "unresolved" is just "this key is missing".
// The row stays in the table for audit / 30-day retention; it just
// stops surfacing on the dashboard.

interface KeyRotationAlertSampleFailure {
  id: number;
  error: string;
}

interface KeyRotationAlertTable {
  table: string;
  scanned: number;
  rewrapped: number;
  failed: number;
  sampleFailures: KeyRotationAlertSampleFailure[];
}

interface KeyRotationAlertRequestBody {
  activeKekId?: string;
  loadedKekIds?: string[];
  totalFailed?: number;
  tables?: KeyRotationAlertTable[];
  acknowledgedAt?: string;
  acknowledgedBy?: string | null;
}

function asAlertBody(raw: unknown): KeyRotationAlertRequestBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as KeyRotationAlertRequestBody;
}

router.get(
  "/admin/key-rotation-alerts",
  authMiddleware,
  adminMiddleware,
  async (_req, res) => {
    try {
      // Pull every unresolved row (acknowledgedAt missing in
      // request_body jsonb) so the banner's count and totalFailedRows
      // reflect the real outstanding workload, not just whatever fits
      // in the most-recent-50 detail page below. We also fetch the
      // most recent 50 rows for the expanded detail view; in
      // practice unresolved volume should be small, but the two are
      // computed independently so neither caps the other.
      const allUnresolved = await db
        .select()
        .from(errorLogsTable)
        .where(
          and(
            eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE),
            sql`(${errorLogsTable.requestBody} ->> 'acknowledgedAt') IS NULL`,
          ),
        );

      const recent = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE))
        .orderBy(desc(errorLogsTable.createdAt))
        .limit(50);

      const toItem = (row: typeof recent[number]) => {
        const body = asAlertBody(row.requestBody);
        return {
          id: row.id,
          createdAt: row.createdAt,
          errorMessage: row.errorMessage,
          activeKekId: body?.activeKekId ?? null,
          loadedKekIds: body?.loadedKekIds ?? [],
          totalFailed: body?.totalFailed ?? 0,
          tables: body?.tables ?? [],
          acknowledgedAt: body?.acknowledgedAt ?? null,
          acknowledgedBy: body?.acknowledgedBy ?? null,
        };
      };

      const items = recent.map(toItem);
      const unresolvedCount = allUnresolved.length;
      const totalFailedRows = allUnresolved.reduce((s, row) => {
        const body = asAlertBody(row.requestBody);
        return s + (body?.totalFailed ?? 0);
      }, 0);

      res.json({
        items,
        unresolvedCount,
        totalFailedRows,
      });
    } catch (err) {
      console.error("Failed to fetch key-rotation alerts:", err);
      res.status(500).json({ error: "Failed to fetch key-rotation alerts" });
    }
  },
);

router.post(
  "/admin/key-rotation-alerts/:id/acknowledge",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid alert id" });
      return;
    }
    try {
      const [row] = await db
        .select()
        .from(errorLogsTable)
        .where(
          and(
            eq(errorLogsTable.id, id),
            eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      const body = asAlertBody(row.requestBody) ?? {};
      if (body.acknowledgedAt) {
        res.json({ ok: true, alreadyAcknowledged: true });
        return;
      }
      const next: KeyRotationAlertRequestBody = {
        ...body,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: req.userId ? String(req.userId) : null,
      };
      await db
        .update(errorLogsTable)
        .set({ requestBody: next })
        .where(eq(errorLogsTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to acknowledge key-rotation alert:", err);
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  },
);

export { stripSensitive };
export default router;
