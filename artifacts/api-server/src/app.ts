import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { pool } from "@workspace/db";

const app: Express = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !allowedOrigins) {
  console.warn(
    "[cors] WARNING: ALLOWED_ORIGINS is not set in production. " +
    "CORS will reject all cross-origin requests. " +
    "Set ALLOWED_ORIGINS to a comma-separated list of allowed origins.",
  );
}

app.use(
  cors(
    allowedOrigins
      ? {
          origin: allowedOrigins.split(",").map((o) => o.trim()),
          credentials: true,
        }
      : isProduction
        ? { origin: false }
        : undefined,
  ),
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

async function handleHealthCheck(_req: express.Request, res: express.Response) {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0]?.ok === 1 ? "connected" : "unexpected" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Health check DB error:", message);
    res.status(503).json({ status: "error", db: "disconnected", error: message });
  }
}

app.get("/health", handleHealthCheck);
app.get("/api/health", handleHealthCheck);

app.use("/api", router);

export default app;
