import { type Request, type RequestHandler, type Response } from "express";
import { pool } from "@workspace/db";
import { getMigrationError, getMigrationStatus } from "./server-state";

export type DbStatus = "not_configured" | "connected" | "unreachable";

export async function defaultCheckDb(): Promise<DbStatus> {
  try {
    if (!pool) return "not_configured";
    await pool.query("SELECT 1");
    return "connected";
  } catch {
    return "unreachable";
  }
}

export interface HealthHandlerOptions {
  // When true, the handler runs a live `SELECT 1` against the pool and adds
  // a `db` field to the response. Off for the lightweight platform-probe
  // paths so probes don't pay the cost of a DB query on every tick.
  includeDb: boolean;
  // Override the DB check, primarily for tests that want to pin down the
  // response shape across all three DbStatus values without depending on a
  // real Postgres connection.
  checkDb?: () => Promise<DbStatus>;
}

export function createHealthHandler(options: HealthHandlerOptions): RequestHandler {
  const dbCheck = options.checkDb ?? defaultCheckDb;
  return async (_req: Request, res: Response): Promise<void> => {
    const migrations = getMigrationStatus();
    const db = options.includeDb ? await dbCheck() : undefined;

    if (migrations === "failed") {
      const body: Record<string, unknown> = {
        status: "degraded",
        migrations: "failed",
        error: getMigrationError(),
      };
      if (options.includeDb) body.db = db;
      res.status(503).json(body);
      return;
    }

    const body: Record<string, unknown> = { status: "ok", migrations };
    if (options.includeDb) body.db = db;
    res.json(body);
  };
}

// The lightweight migration-only handler used by the platform probe paths
// (`/health` and `/healthz`). Kept cheap so probes don't hit the DB on every
// tick.
export const respondHealth: RequestHandler = createHealthHandler({ includeDb: false });

// The richer handler exposed under `/api/health*` for operators. Adds a live
// `SELECT 1` against the pool so a transient DB outage is visible even when
// startup migrations completed cleanly.
export const respondHealthWithDb: RequestHandler = createHealthHandler({ includeDb: true });
