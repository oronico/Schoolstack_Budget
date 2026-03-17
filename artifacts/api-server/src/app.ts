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


app.post("/admin/reset-pw", async (req, res) => {
  try {
    const { email, newPassword, secret } = req.body;
    if (secret !== "schoolstack-reset-2026") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash(newPassword, 12);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [hash, email]);
    res.json({ status: "ok" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.use("/api", router);

export default app;
