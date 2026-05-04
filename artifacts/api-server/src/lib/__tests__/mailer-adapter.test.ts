/**
 * Task #533 — env-driven email adapter.
 *
 * The transactional senders (verify-email, account-already-exists,
 * password-reset) route through `deliverTransactionalEmail`, which is
 * the env-driven adapter that decides whether to call Resend or fall
 * back to the dev console logger. This file pins the three observable
 * behaviours that matter:
 *
 *   1. dev fallback (no provider)        → success:true, console.warn,
 *                                          URL printed so a developer
 *                                          can paste it into a browser
 *   2. production w/o provider            → success:false, console.error
 *                                          (so monitoring sees a real
 *                                          outage, not a silent drop)
 *   3. EMAIL_PROVIDER=console override   → forces the dev fallback even
 *                                          when Resend creds are present
 *                                          (useful for local-only test
 *                                          runs that should never email
 *                                          a real inbox)
 *
 * We exercise `deliverTransactionalEmail` directly so the assertions
 * don't depend on a network round-trip to Resend.
 */
import {
  deliverTransactionalEmail,
  getConfiguredEmailProvider,
  isEmailConfigured,
} from "../mailer.js";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
  }
}

// Stash + restore the env vars we mutate so the test is order-safe and
// doesn't bleed into sibling tests in the same `pnpm test` run.
const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_PROVIDER", "NODE_ENV"] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) originalEnv[k] = process.env[k];

function setEnv(over: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const k of ENV_KEYS) {
    if (k in over) {
      const v = over[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
}

// Capture stdio so we can assert the dev fallback actually printed the
// URL without polluting the test runner output.
function capture<T>(fn: () => Promise<T>): Promise<{ result: T; warn: string[]; error: string[]; log: string[] }> {
  const warn: string[] = [];
  const error: string[] = [];
  const log: string[] = [];
  const origWarn = console.warn;
  const origError = console.error;
  const origLog = console.log;
  console.warn = (...a: unknown[]) => { warn.push(a.map(String).join(" ")); };
  console.error = (...a: unknown[]) => { error.push(a.map(String).join(" ")); };
  console.log = (...a: unknown[]) => { log.push(a.map(String).join(" ")); };
  return fn().then((result) => {
    console.warn = origWarn;
    console.error = origError;
    console.log = origLog;
    return { result, warn, error, log };
  }).catch((e) => {
    console.warn = origWarn;
    console.error = origError;
    console.log = origLog;
    throw e;
  });
}

const sampleEmail = {
  to: "founder@example.com",
  subject: "Confirm your account",
  text: "Click https://example.com/verify?token=abc123",
  html: "<a href='https://example.com/verify?token=abc123'>Confirm</a>",
  kind: "verify-email",
  primaryUrl: "https://example.com/verify?token=abc123",
};

async function main() {
  // --- 1. dev fallback (no provider) -------------------------------------
  setEnv({ NODE_ENV: "development", RESEND_API_KEY: undefined, EMAIL_FROM: undefined, EMAIL_PROVIDER: undefined });
  check(
    "dev/no-provider: getConfiguredEmailProvider() === 'console'",
    getConfiguredEmailProvider() === "console",
    `got ${getConfiguredEmailProvider()}`,
  );
  check(
    "dev/no-provider: isEmailConfigured() === false",
    isEmailConfigured() === false,
  );
  {
    const { result, warn, error } = await capture(() => deliverTransactionalEmail(sampleEmail));
    check(
      "dev/no-provider: returns success:true (graceful fallback, not a failure)",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "dev/no-provider: provider tag is 'console'",
      result.provider === "console",
      `got ${result.provider}`,
    );
    check(
      "dev/no-provider: warns (not errors) so monitoring isn't poisoned",
      warn.length === 1 && error.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
    check(
      "dev/no-provider: the verify URL is printed so a developer can copy it",
      warn[0]?.includes(sampleEmail.primaryUrl) === true,
      `warn[0]=${warn[0]}`,
    );
    check(
      "dev/no-provider: log includes the email kind label",
      warn[0]?.includes("verify-email") === true,
    );
  }

  // --- 2. production w/o provider ----------------------------------------
  setEnv({ NODE_ENV: "production", RESEND_API_KEY: undefined, EMAIL_FROM: undefined, EMAIL_PROVIDER: undefined });
  {
    const { result, warn, error } = await capture(() => deliverTransactionalEmail(sampleEmail));
    check(
      "prod/no-provider: returns success:false (real outage, surface it)",
      result.success === false,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "prod/no-provider: emits console.error (not a quiet warn)",
      error.length === 1 && warn.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
    check(
      "prod/no-provider: error message names the missing env vars",
      error[0]?.includes("RESEND_API_KEY") === true && error[0]?.includes("EMAIL_FROM") === true,
    );
  }

  // --- 3. EMAIL_PROVIDER=console override -------------------------------
  // Force the dev fallback even when Resend creds are present. Useful for
  // staging environments / local-only test runs that must never email a
  // real inbox.
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: "re_dummy_for_test",
    EMAIL_FROM: "noreply@example.com",
    EMAIL_PROVIDER: "console",
  });
  check(
    "EMAIL_PROVIDER=console: explicit override wins over auto-detect",
    getConfiguredEmailProvider() === "console",
    `got ${getConfiguredEmailProvider()}`,
  );
  {
    const { result, warn } = await capture(() => deliverTransactionalEmail(sampleEmail));
    check(
      "EMAIL_PROVIDER=console: routes to dev logger even with creds set",
      result.success === true && result.provider === "console" && warn.length === 1,
      `result=${JSON.stringify(result)} warn=${warn.length}`,
    );
  }

  // --- 4. auto-detect picks Resend when creds are present ---------------
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: "re_dummy",
    EMAIL_FROM: "noreply@example.com",
    EMAIL_PROVIDER: undefined,
  });
  check(
    "auto-detect: getConfiguredEmailProvider() === 'resend' when creds are set",
    getConfiguredEmailProvider() === "resend",
    `got ${getConfiguredEmailProvider()}`,
  );

  restoreEnv();

  if (failures.length > 0) {
    console.error(`\n${failures.length} mailer-adapter check(s) failed:`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\nmailer-adapter: all checks passed`);
}

main().catch((e) => {
  restoreEnv();
  console.error("mailer-adapter test crashed:", e);
  process.exit(1);
});
