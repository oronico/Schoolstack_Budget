import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";

const isProduction = process.env.NODE_ENV === "production";

function validateEnv() {
  const required: [string, string][] = [
    ["DATABASE_URL", "PostgreSQL connection string"],
    ["JWT_SECRET", "Secret key for signing JWT tokens"],
  ];

  const optional: [string, string][] = [
    ["ALLOWED_ORIGINS", "Comma-separated list of allowed CORS origins"],
    ["ADMIN_EMAILS", "Comma-separated list of admin email addresses"],
    ["RESEND_API_KEY", "Resend API key for transactional emails"],
    ["EMAIL_FROM", "Sender address for outgoing emails"],
    ["APP_URL", "Public URL of the frontend application"],
  ];

  let hasFatal = false;

  for (const [key, desc] of required) {
    if (!process.env[key]) {
      if (isProduction) {
        console.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
        hasFatal = true;
      } else {
        console.warn(`[startup] WARNING: ${key} not set — ${desc}. Using dev default.`);
      }
    }
  }

  for (const [key, desc] of optional) {
    if (!process.env[key]) {
      console.warn(`[startup] INFO: Optional env var ${key} not set — ${desc}`);
    }
  }

  if (hasFatal) {
    console.error("[startup] Server cannot start without required environment variables.");
    process.exit(1);
  }
}

validateEnv();

const port = Number(process.env["PORT"] || "3000");

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
  if (isProduction) {
    console.log(`[startup] Production mode — CORS origins: ${process.env.ALLOWED_ORIGINS || "(not set)"}`);
  }
});

setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
}, 300_000);
