import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    if (!pool) {
      res.json({ status: "ok", db: "not_configured" });
      return;
    }
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.json({ status: "ok", db: "unreachable" });
  }
});

export default router;
