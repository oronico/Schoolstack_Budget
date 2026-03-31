import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import router from "./routes";
import { pool, db, errorLogsTable } from "@workspace/db";
import { stripSensitive } from "./routes/errors";

const app: Express = express();

app.use(helmet());
app.use(compression());

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
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/ready", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0]?.ok === 1 ? "connected" : "unexpected" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Readiness check DB error:", message);
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api", router);

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Unhandled Error] ${req.method} ${req.originalUrl}:`, err.message);

  const sanitizedBody = req.body ? stripSensitive(req.body) : null;
  const headers = { ...req.headers };
  delete headers.authorization;
  delete headers.cookie;

  db.insert(errorLogsTable)
    .values({
      userId: (req as unknown as Record<string, unknown>).userId ? String((req as unknown as Record<string, unknown>).userId) : null,
      errorMessage: String(err.message).slice(0, 2000),
      errorStack: err.stack ? String(err.stack).slice(0, 5000) : null,
      route: `${req.method} ${req.originalUrl}`.slice(0, 500),
      requestBody: sanitizedBody as Record<string, unknown>,
    })
    .catch((logErr) => console.error("Failed to persist error log:", logErr));

  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
