// Task #1000 — extracted from `src/index.ts` so the validator's exit
// behavior can be unit-tested without spawning the whole server.
//
// Contract (matches what `validateEnv()` used to do inline, with one
// surgical change called out below):
//
//   - DATABASE_URL  : required. In production a missing value is FATAL
//                     (we exit non-zero). In non-production we emit a
//                     loud WARN and keep booting — the @workspace/db
//                     layer already falls back to a null pool/db, and
//                     every consumer guards on `if (!db) return;`.
//                     This is the surgical change vs. the pre-task
//                     behavior, which treated DATABASE_URL as fatal in
//                     every NODE_ENV and killed the api-server before
//                     Playwright's webServer could come up in CI runs
//                     that omit the var (see
//                     `.github/workflows/playwright-cross-browser.yml`).
//   - JWT_SECRET    : required in EVERY NODE_ENV. Auth without a
//                     signer is a worse failure mode than degraded
//                     persistence — dev/e2e flows actually exercise
//                     auth, so a missing signer would surface as
//                     mysterious token-validation failures deep in
//                     the suite instead of a clean boot failure.
//   - APP_URL       : required in production only; warns + uses a dev
//                     fallback otherwise.
//   - Optional vars : every missing one logs an INFO line so operators
//                     can see what's not configured.

export interface ValidateEnvLogger {
  error: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface ValidateEnvOptions {
  // Defaults to `process.env`. Tests inject a synthetic object so the
  // real shell env can't pollute the assertion.
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  // Defaults to `env.NODE_ENV === "production"`. Tests pass an explicit
  // boolean so the production branch can be exercised under a normal
  // dev test runner.
  isProduction?: boolean;
  // Defaults to `console`. Tests inject a capturing logger so they can
  // assert on the exact lines emitted.
  logger?: ValidateEnvLogger;
  // Defaults to `process.exit`. Tests inject a recorder so they can
  // observe the exit code without actually killing the test process.
  exit?: (code: number) => void;
}

export interface ValidateEnvResult {
  // True iff at least one fatal-in-this-mode required var was missing.
  // When true, `exit(1)` has already been invoked.
  hasFatal: boolean;
  // Required keys (the always-required list) that were unset, regardless
  // of whether they were fatal in this mode.
  missingRequired: string[];
  // requiredInProduction keys that were unset.
  missingRequiredInProduction: string[];
  // optional keys that were unset.
  missingOptional: string[];
}

const REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ["DATABASE_URL", "PostgreSQL connection string"],
  ["JWT_SECRET", "Secret key for signing JWT tokens"],
];

// Required keys whose absence is tolerated in non-production (warn,
// don't exit). See the file header for rationale.
const NON_PRODUCTION_TOLERATED: ReadonlySet<string> = new Set([
  "DATABASE_URL",
]);

const REQUIRED_IN_PRODUCTION: ReadonlyArray<readonly [string, string]> = [
  ["APP_URL", "Public URL of the frontend application"],
];

const OPTIONAL: ReadonlyArray<readonly [string, string]> = [
  ["ALLOWED_ORIGINS", "Comma-separated list of allowed CORS origins"],
  ["ADMIN_EMAILS", "Comma-separated list of admin email addresses"],
  ["RESEND_API_KEY", "Resend API key for transactional emails"],
  [
    "POSTMARK_SERVER_TOKEN",
    "Postmark server token (failover provider for transactional emails)",
  ],
  ["EMAIL_FROM", "Sender address for outgoing emails"],
  [
    "EMAIL_PROVIDER",
    "Override email provider selection: resend | postmark | console",
  ],
];

export function validateEnv(
  options: ValidateEnvOptions = {},
): ValidateEnvResult {
  const env = options.env ?? process.env;
  const isProduction =
    options.isProduction ?? env["NODE_ENV"] === "production";
  const logger: ValidateEnvLogger = options.logger ?? {
    error: (msg) => console.error(msg),
    warn: (msg) => console.warn(msg),
  };
  const exit = options.exit ?? ((code: number) => process.exit(code));

  let hasFatal = false;
  const missingRequired: string[] = [];
  const missingRequiredInProduction: string[] = [];
  const missingOptional: string[] = [];

  for (const [key, desc] of REQUIRED) {
    if (env[key]) continue;
    missingRequired.push(key);
    if (isProduction) {
      logger.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
      hasFatal = true;
      continue;
    }
    if (NON_PRODUCTION_TOLERATED.has(key)) {
      // Loud but non-fatal: the @workspace/db layer also prints
      // "WARNING: DATABASE_URL is not set. Database features will be
      // unavailable." right above this, so an operator scrolling the
      // boot log sees both signals.
      logger.warn(
        `[startup] WARN: ${key} not set — ${desc}. ` +
          `Booting in non-production with degraded functionality ` +
          `(the @workspace/db layer will return a null pool; ` +
          `DB-backed routes will no-op).`,
      );
      continue;
    }
    logger.error(
      `[startup] FATAL: Missing required env var ${key} — ${desc} ` +
        `(required in every NODE_ENV).`,
    );
    hasFatal = true;
  }

  for (const [key, desc] of REQUIRED_IN_PRODUCTION) {
    if (env[key]) continue;
    missingRequiredInProduction.push(key);
    if (isProduction) {
      logger.error(`[startup] FATAL: Missing required env var ${key} — ${desc}`);
      hasFatal = true;
    } else {
      logger.warn(
        `[startup] INFO: ${key} not set — ${desc}. Will use dev fallback.`,
      );
    }
  }

  for (const [key, desc] of OPTIONAL) {
    if (env[key]) continue;
    missingOptional.push(key);
    logger.warn(`[startup] INFO: Optional env var ${key} not set — ${desc}`);
  }

  if (hasFatal) {
    logger.error(
      "[startup] Server cannot start without required environment variables.",
    );
    exit(1);
  }

  return {
    hasFatal,
    missingRequired,
    missingRequiredInProduction,
    missingOptional,
  };
}
