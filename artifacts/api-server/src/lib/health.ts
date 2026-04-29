import { type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getMigrationError, getMigrationStatus } from "./server-state";

type DbStatus = "not_configured" | "connected" | "unreachable";

async function checkDb(): Promise<DbStatus> {
  try {
    if (!pool) return "not_configured";
    await pool.query("SELECT 1");
    return "connected";
  } catch {
    return "unreachable";
  }
}

export async function respondHealth(_req: Request, res: Response): Promise<void> {
  const migrations = getMigrationStatus();
  const db = await checkDb();

  if (migrations === "failed") {
    res.status(503).json({
      status: "degraded",
      db,
      migrations: "failed",
      error: getMigrationError(),
    });
    return;
  }

  res.json({ status: "ok", db, migrations });
}
