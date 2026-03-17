import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { pool } from "@workspace/db";

const app: Express = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? {
          origin: corsOrigin.split(",").map((o) => o.trim()),
          credentials: true,
        }
      : undefined,
  ),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0]?.ok === 1 ? "connected" : "unexpected" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Health check DB error:", message);
    res.status(503).json({ status: "error", db: "disconnected", error: message });
  }
});

app.post("/admin/migrate-guidance", async (_req, res) => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guidance_level VARCHAR(20)`);
    res.json({ status: "ok", message: "guidance_level column added" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ status: "error", error: message });
  }
});

app.use("/api", router);

export default app;
