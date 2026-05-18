// Task #1000 — lock in the boot-time env validator's exit contract so a
// future refactor can't quietly re-introduce the "api-server exits on a
// missing DATABASE_URL in non-production" failure mode that broke the
// `playwright-cross-browser` @smoke gate. See
// `artifacts/api-server/src/lib/validate-env.ts` for the contract.
//
// Cases covered:
//   1. non-production + missing DATABASE_URL → WARN, no exit
//   2. production     + missing DATABASE_URL → FATAL + exit(1)
//   3. non-production + missing JWT_SECRET   → FATAL + exit(1)
//   4. production     + missing JWT_SECRET   → FATAL + exit(1)
//   5. happy path (both set in production)   → no exit, no fatal
//   6. optional vars unset                   → reported as missingOptional

import assert from "node:assert/strict";

import { validateEnv } from "../src/lib/validate-env.js";

interface CapturingLogger {
  errors: string[];
  warns: string[];
  error: (msg: string) => void;
  warn: (msg: string) => void;
}

function makeLogger(): CapturingLogger {
  const errors: string[] = [];
  const warns: string[] = [];
  return {
    errors,
    warns,
    error: (m) => errors.push(m),
    warn: (m) => warns.push(m),
  };
}

interface ExitRecorder {
  code: number | null;
  exit: (code: number) => void;
}

function makeExit(): ExitRecorder {
  const recorder: ExitRecorder = {
    code: null,
    exit: () => undefined,
  };
  recorder.exit = (code: number) => {
    // Mirror process.exit's "first call wins" effect — a second call
    // would mask the contract we care about.
    if (recorder.code === null) recorder.code = code;
  };
  return recorder;
}

let passed = 0;
function check(label: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

// 1.
check(
  "non-production: missing DATABASE_URL warns, does NOT exit",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: { JWT_SECRET: "test-signer" },
      isProduction: false,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, null, "exit must NOT be called in non-production");
    assert.equal(result.hasFatal, false);
    assert.deepEqual(result.missingRequired, ["DATABASE_URL"]);
    assert.ok(
      logger.warns.some(
        (m) => m.includes("DATABASE_URL") && m.includes("WARN"),
      ),
      `expected a WARN line mentioning DATABASE_URL, got warns=${JSON.stringify(logger.warns)}`,
    );
    assert.ok(
      !logger.errors.some((m) => m.includes("FATAL")),
      `expected no FATAL line, got errors=${JSON.stringify(logger.errors)}`,
    );
  },
);

// 2.
check(
  "production: missing DATABASE_URL is FATAL and exits with code 1",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: { JWT_SECRET: "prod-signer" },
      isProduction: true,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, 1, "exit(1) expected");
    assert.equal(result.hasFatal, true);
    assert.deepEqual(result.missingRequired, ["DATABASE_URL"]);
    assert.ok(
      logger.errors.some(
        (m) => m.includes("FATAL") && m.includes("DATABASE_URL"),
      ),
    );
  },
);

// 3.
check(
  "non-production: missing JWT_SECRET is FATAL and exits with code 1",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: { DATABASE_URL: "postgres://localhost/x" },
      isProduction: false,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, 1, "JWT_SECRET must be fatal in every NODE_ENV");
    assert.equal(result.hasFatal, true);
    assert.deepEqual(result.missingRequired, ["JWT_SECRET"]);
    assert.ok(
      logger.errors.some(
        (m) => m.includes("FATAL") && m.includes("JWT_SECRET"),
      ),
    );
  },
);

// 4.
check(
  "production: missing JWT_SECRET is FATAL and exits with code 1",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: { DATABASE_URL: "postgres://localhost/x" },
      isProduction: true,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, 1);
    assert.equal(result.hasFatal, true);
  },
);

// 5.
check(
  "happy path: required vars set in production → no exit, no fatal",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: {
        DATABASE_URL: "postgres://localhost/x",
        JWT_SECRET: "prod-signer",
        APP_URL: "https://example.com",
      },
      isProduction: true,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, null);
    assert.equal(result.hasFatal, false);
    assert.deepEqual(result.missingRequired, []);
    assert.deepEqual(result.missingRequiredInProduction, []);
  },
);

// 6.
check(
  "optional vars unset are reported and never block boot",
  () => {
    const logger = makeLogger();
    const exit = makeExit();
    const result = validateEnv({
      env: {
        DATABASE_URL: "postgres://localhost/x",
        JWT_SECRET: "prod-signer",
        APP_URL: "https://example.com",
      },
      isProduction: true,
      logger,
      exit: exit.exit,
    });
    assert.equal(exit.code, null);
    assert.ok(
      result.missingOptional.includes("ALLOWED_ORIGINS"),
      `expected ALLOWED_ORIGINS in missingOptional, got ${JSON.stringify(result.missingOptional)}`,
    );
    assert.ok(
      result.missingOptional.includes("RESEND_API_KEY"),
    );
  },
);

console.log(`\nvalidate-env: ${passed}/6 checks passed`);
