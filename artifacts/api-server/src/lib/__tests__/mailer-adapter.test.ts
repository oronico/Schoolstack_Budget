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
  pickWelcomeTrack,
  sendWelcomeEmail,
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
const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_PROVIDER", "NODE_ENV", "APP_URL", "REPLIT_DEV_DOMAIN"] as const;
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

  // --- 5. welcome email goes through the shared adapter -----------------
  // Task #552 — the new-user welcome email is fired fire-and-forget after
  // /auth/verify-email provisions the account. Pin the same dev-fallback
  // semantics as verify-email / password-reset so a future provider swap
  // is a one-file change and so a developer running locally without
  // RESEND_API_KEY sees the welcome template surface in workspace logs.
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    APP_URL: "https://app.example.com",
    REPLIT_DEV_DOMAIN: undefined,
  });
  {
    const { result, warn, error } = await capture(() =>
      sendWelcomeEmail("jane@school.example", "Jane Founder"),
    );
    check(
      "welcome/dev/no-provider: returns success:true (graceful fallback)",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "welcome/dev/no-provider: warns (not errors) so monitoring isn't poisoned",
      warn.length === 1 && error.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
    check(
      "welcome/dev/no-provider: log includes the welcome kind label",
      warn[0]?.includes("welcome") === true,
      `warn[0]=${warn[0]}`,
    );
    // Task #557 — the no-signal default branch points at /model/new
    // (the wizard duration picker) rather than the dashboard root, so
    // a founder who reads only the welcome knows what to click first.
    check(
      "welcome/dev/no-provider: log includes the default-branch deep link (/model/new)",
      warn[0]?.includes("https://app.example.com/model/new") === true,
      `warn[0]=${warn[0]}`,
    );
  }

  // --- 6. welcome email surfaces a real outage in production -----------
  setEnv({
    NODE_ENV: "production",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    APP_URL: "https://app.example.com",
    REPLIT_DEV_DOMAIN: undefined,
  });
  {
    const { result, warn, error } = await capture(() =>
      sendWelcomeEmail("jane@school.example", "Jane Founder"),
    );
    check(
      "welcome/prod/no-provider: returns success:false (real outage, surface it)",
      result.success === false,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "welcome/prod/no-provider: emits console.error (not a quiet warn)",
      error.length === 1 && warn.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
  }

  // --- 6b. welcome email branches on planningStage / profileRole -------
  // Task #557 — the welcome body should branch on the founder's
  // planningStage / profileRole so a "yet-to-launch" founder sees a
  // different first-action than a founder who is already running a
  // school. The deep-link CTA must point at the most relevant wizard
  // step (model wizard / actuals importer) instead of the dashboard
  // root. Capture the dev-fallback log so we can assert on the subject
  // and the embedded URL without rendering the HTML.
  function asWarnHaystack(warn: string[]): string {
    return warn.join("\n");
  }

  // pickWelcomeTrack: pure routing helper. Pin the buckets we care
  // about so a future copy edit can't accidentally reroute the CTA.
  check(
    "pickWelcomeTrack: 'planning' planningStage → yet-to-launch",
    pickWelcomeTrack("planning", "founder") === "yet-to-launch",
    `got ${pickWelcomeTrack("planning", "founder")}`,
  );
  check(
    "pickWelcomeTrack: 'exploring' planningStage → yet-to-launch",
    pickWelcomeTrack("exploring", null) === "yet-to-launch",
  );
  check(
    "pickWelcomeTrack: 'negotiating' planningStage → yet-to-launch",
    pickWelcomeTrack("Negotiating a lease", "founder") === "yet-to-launch",
  );
  check(
    "pickWelcomeTrack: 'operating' planningStage → operating",
    pickWelcomeTrack("operating", "founder") === "operating",
  );
  check(
    "pickWelcomeTrack: 'running for 3 years' planningStage → operating",
    pickWelcomeTrack("Running for 3 years", "founder") === "operating",
  );
  check(
    "pickWelcomeTrack: 'head of school' profileRole (no planningStage) → operating",
    pickWelcomeTrack(null, "Head of School") === "operating",
  );
  check(
    "pickWelcomeTrack: operating signal wins over a 'planning' role label",
    pickWelcomeTrack("operating", "planning to expand") === "operating",
  );
  check(
    "pickWelcomeTrack: nothing known → default",
    pickWelcomeTrack(null, null) === "default",
  );
  check(
    "pickWelcomeTrack: empty strings → default (treated as missing)",
    pickWelcomeTrack("", "") === "default",
  );

  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    APP_URL: "https://app.example.com",
    REPLIT_DEV_DOMAIN: undefined,
  });

  // yet-to-launch founder → "Build my Year-1 model"
  {
    const { result, warn } = await capture(() =>
      sendWelcomeEmail("jane@school.example", "Jane Founder", "planning", "founder"),
    );
    const hay = asWarnHaystack(warn);
    check(
      "welcome/yet-to-launch: returns success:true via dev fallback",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "welcome/yet-to-launch: deep-links to /model/new?stage=new_school",
      hay.includes("https://app.example.com/model/new?stage=new_school"),
      `warn=${hay}`,
    );
    check(
      "welcome/yet-to-launch: does NOT route through the operating-school CTA",
      !hay.includes("stage=operating_school"),
      `warn=${hay}`,
    );
    check(
      "welcome/yet-to-launch: dev log still tagged with the 'welcome' kind",
      hay.includes("welcome"),
    );
  }

  // operating-school founder → "Import my existing actuals"
  {
    const { result, warn } = await capture(() =>
      sendWelcomeEmail("ada@oldschool.example", "Ada Headmaster", "operating", "Head of School"),
    );
    const hay = asWarnHaystack(warn);
    check(
      "welcome/operating: returns success:true via dev fallback",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "welcome/operating: deep-links to /model/new?stage=operating_school",
      hay.includes("https://app.example.com/model/new?stage=operating_school"),
      `warn=${hay}`,
    );
    check(
      "welcome/operating: does NOT route through the new-school CTA",
      !hay.includes("stage=new_school"),
      `warn=${hay}`,
    );
  }

  // default founder (no signal) → /model/new (no stage)
  {
    const { result, warn } = await capture(() =>
      sendWelcomeEmail("zed@school.example", "Zed Founder", null, null),
    );
    const hay = asWarnHaystack(warn);
    check(
      "welcome/default: returns success:true via dev fallback",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "welcome/default: deep-links to /model/new (no stage hint)",
      hay.includes("https://app.example.com/model/new\n") ||
        hay.includes("https://app.example.com/model/new ") ||
        hay.includes("https://app.example.com/model/new)"),
      `warn=${hay}`,
    );
    check(
      "welcome/default: does NOT carry an operating/new stage hint",
      !hay.includes("stage=operating_school") && !hay.includes("stage=new_school"),
      `warn=${hay}`,
    );
    check(
      "welcome/default: does NOT point at the dashboard root (regression guard)",
      !hay.includes("https://app.example.com/\n") &&
        !hay.includes("https://app.example.com/ "),
      `warn=${hay}`,
    );
  }

  // --- 7. shared invariant: every public sender uses the adapter --------
  // This is the "every sender uses the adapter" assertion the task asks
  // for. It scans the mailer source for top-level `resend.emails.send`
  // call sites and confirms there's exactly one — the call inside
  // `deliverTransactionalEmail` itself. If somebody adds a new sender
  // that calls Resend directly (instead of routing through the adapter),
  // this check fails and points them at the adapter.
  {
    const { readFileSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname, resolve } = await import("path");
    const here = dirname(fileURLToPath(import.meta.url));
    const mailerPath = resolve(here, "../mailer.ts");
    const src = readFileSync(mailerPath, "utf8");
    // Strip line comments so a doc reference like `// resend.emails.send`
    // doesn't trip the count.
    const stripped = src
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    const matches = stripped.match(/resend\.emails\.send\s*\(/g) || [];
    check(
      "every sender uses the adapter: exactly one resend.emails.send(...) call (inside deliverTransactionalEmail)",
      matches.length === 1,
      `found ${matches.length} resend.emails.send(...) call sites in mailer.ts (expected 1)`,
    );

    // Same assertion across the rest of artifacts/api-server/src — no
    // route or helper outside the mailer should be calling Resend
    // directly. If somebody adds one, they should route it through
    // `deliverTransactionalEmail` instead (or add a code-comment
    // explaining why it can't route through the adapter yet).
    const { execSync } = await import("child_process");
    const apiSrc = resolve(here, "../..");
    let raw = "";
    try {
      // Match an actual call site: `resend.emails.send(`. The trailing
      // `(` filters out doc references / quoted strings that mention the
      // API name without invoking it.
      raw = execSync(
        `grep -rnE --include='*.ts' "resend\\.emails\\.send\\(" "${apiSrc}" || true`,
        { encoding: "utf8" },
      );
    } catch {
      raw = "";
    }
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      // Drop the lone allowed call site (mailer.ts) and any test files
      // that mention the API in error-message string literals.
      .filter((l) => !l.includes("/lib/mailer.ts:"))
      .filter((l) => !l.includes("/__tests__/"))
      .filter((l) => {
        // crude: drop hits where the match is preceded by `//` or `*`
        const m = l.match(/^[^:]+:\d+:\s*(.*)$/);
        const body = m?.[1] ?? l;
        return !body.startsWith("//") && !body.startsWith("*");
      });
    check(
      "every sender uses the adapter: no other api-server file calls resend.emails.send directly",
      lines.length === 0,
      `found unexpected direct Resend call sites:\n${lines.join("\n")}`,
    );
  }

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
