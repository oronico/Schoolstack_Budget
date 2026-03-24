import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { pool } from "@workspace/db";

const app: Express = express();

const SCHOOLSTACK_ORIGINS = [
  "https://space.schoolstack.ai",
  "https://budget.schoolstack.ai",
  "https://schoolstack.ai",
];

const extraOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const staticAllowed = new Set([...SCHOOLSTACK_ORIGINS, ...extraOrigins]);

function isLocalhost(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | undefined): string | false {
  if (!origin) return false;
  if (staticAllowed.has(origin)) return origin;
  if (isLocalhost(origin)) return origin;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = isAllowedOrigin(origin);
      if (!origin || allowed) {
        callback(null, allowed || true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/ready", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0]?.ok === 1 ? "connected" : "unexpected" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Readiness check DB error:", message);
    res.status(503).json({ status: "error", db: "disconnected", error: message });
  }
});

app.use("/api", router);

export default app;
