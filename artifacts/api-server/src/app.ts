import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { tenantMiddleware } from "@workspace/tenant/express";
import router from "./routes";
import { pool, db, errorLogsTable } from "@workspace/db";
import { stripSensitive } from "./routes/errors";
import { respondHealth, respondHealthWithDb } from "./lib/health";

import { type RequestWithAbort } from "./lib/request-abort";
export { isRequestAborted, type RequestWithAbort } from "./lib/request-abort";

const app: Express = express();

// Trust the first proxy hop so `req.ip` reflects the *client* address
// rather than the load balancer's. Without this the rate limiter
// (which keys on req.ip) collapses every request behind any reverse
// proxy / CDN / Replit-style ingress into a single shared bucket per
// endpoint — an attacker doing credential stuffing on /auth/login then
// trivially locks every legitimate user out (round-3 #16). One hop is
// the safe default for Replit Deployments and most managed hosts; an
// operator behind a deeper chain can override via TRUST_PROXY_HOPS.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
app.set("trust proxy", Number.isFinite(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

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

// Task #571 (M1 of WHITE_LABEL_STRATEGY): attach `req.tenant` from
// hostname so M2+ refactors can read brand/colors/SEO/email config off
// the request instead of module-level constants. M1 itself wires up
// the resolver only — no downstream consumer reads `req.tenant` yet,
// so this middleware is observably a no-op. The X-Tenant header
// override is honoured outside production for dev/test.
app.use(tenantMiddleware());

const DEFAULT_TIMEOUT_MS = 30_000;
const EXPORT_TIMEOUT_MS = 120_000;

function isExportRoute(path: string): boolean {
  return /\/models\/\d+\/export/.test(path) ||
    /\/models\/\d+\/consultant/.test(path) ||
    /\/models\/\d+\/lender-packet/.test(path) ||
    /\/models\/\d+\/board-packet/.test(path) ||
    // Token-authed share counterpart for the decision-comparison PDF —
    // matches the founder-side /export/ timeout class so a slower PDF
    // render doesn't trip the default 30s window.
    /\/shared\/[^/]+\/export\//.test(path);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const timeout = isExportRoute(req.path) ? EXPORT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const abortController = new AbortController();
  (req as RequestWithAbort).abortSignal = abortController.signal;

  const timer = setTimeout(() => {
    console.error(`[timeout] ${req.method} ${req.originalUrl} exceeded ${timeout}ms`);
    abortController.abort();

    if (!res.headersSent) {
      res.status(503).json({ error: "Request timed out. Please try again." });
      res.once("finish", () => {
        if (req.socket && !req.socket.destroyed) {
          req.socket.destroy();
        }
      });
    } else if (req.socket && !req.socket.destroyed) {
      req.socket.destroy();
    }
  }, timeout);

  res.on("close", () => clearTimeout(timer));
  res.on("finish", () => clearTimeout(timer));

  next();
});

// Platform probe paths: lightweight migration-only check. Hot path for
// load balancers / uptime monitors, so we skip the live DB ping here.
app.get("/health", respondHealth);
app.get("/healthz", respondHealth);
// Operator-facing paths: include a live `SELECT 1` so a DB outage shows up
// even when startup migrations completed cleanly. Mounted directly on `app`
// (above `app.use("/api", router)`) so they take precedence over any
// catch-all 404 in the API router.
app.get("/api/health", respondHealthWithDb);
app.get("/api/healthz", respondHealthWithDb);

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

// Body-parser errors carry a `type` discriminator we can use to map the
// failure to a proper 4xx instead of a noisy 500. Without this mapping,
// every malformed JSON payload from a buggy client (or every >5MB upload)
// becomes "Internal server error" AND gets persisted to the error_logs
// table, drowning out real server-side faults.
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

function classifyClientError(
  err: BodyParserError,
): { status: number; message: string } | null {
  if (err.type === "entity.parse.failed") {
    return { status: 400, message: "Malformed JSON in request body." };
  }
  if (err.type === "entity.too.large") {
    return { status: 413, message: "Request body exceeds the 5 MB limit." };
  }
  if (err.type === "encoding.unsupported") {
    return { status: 415, message: "Unsupported request body encoding." };
  }
  if (err.type === "charset.unsupported") {
    return { status: 415, message: "Unsupported request body charset." };
  }
  // Catch-all for http-errors-style 4xx (e.g. body-parser's gzip
  // decompression failure: it wraps zlib's Z_DATA_ERROR as a 400 with
  // `expose: true` but no `.type` discriminator). Without this branch,
  // every "Content-Encoding: gzip" request whose body isn't actually
  // gzipped becomes a 500 + an entry in error_logs.
  const status = typeof err.status === "number" ? err.status : err.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500 && err.expose === true) {
    return { status, message: err.message || "Bad request." };
  }
  return null;
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const clientError = classifyClientError(err as BodyParserError);

  if (clientError) {
    // Client-side input bug — log a single line for observability but do
    // NOT persist to the error_logs table (that table is for server faults
    // an operator needs to triage).
    console.warn(
      `[Client Error] ${req.method} ${req.originalUrl} → ${clientError.status}: ${err.message}`,
    );
    if (!res.headersSent) {
      res.status(clientError.status).json({ error: clientError.message });
    }
    return;
  }

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
