import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getMigrationStatus, getMigrationError } from "../lib/server-state";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const migrations = getMigrationStatus();
  const migrationError = getMigrationError();

  let dbStatus: "not_configured" | "connected" | "unreachable";
  try {
    if (!pool) {
      dbStatus = "not_configured";
    } else {
      await pool.query("SELECT 1");
      dbStatus = "connected";
    }
  } catch {
    dbStatus = "unreachable";
  }

  if (migrations === "failed") {
    res.status(503).json({
      status: "degraded",
      db: dbStatus,
      migrations: "failed",
      error: migrationError,
    });
    return;
  }

  res.json({ status: "ok", db: dbStatus, migrations });
});

export default router;
