/**
 * Task #542 — advisor-review emails go through the same adapter as signups.
 *
 * `sendReviewRequestToTeam`, `sendReviewConfirmation`, and
 * `sendReviewFeedback` used to call Resend directly with their own ad-hoc
 * "is Resend configured?" guards. They now route through
 * `deliverTransactionalEmail` so the dev-fallback / prod-outage / explicit-
 * console-override semantics match the verify-email + password-reset path
 * pinned in `mailer-adapter.test.ts`.
 *
 * This test file mirrors that pattern for the team-notification sender —
 * the most distinctive of the three because it carries a Reply-To header
 * pointing at the founder's inbox.
 */
import {
  sendReviewRequestToTeam,
  sendReviewConfirmation,
  sendReviewFeedback,
  type ReviewRequestData,
  type ReviewFeedbackData,
} from "../mailer.js";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
  }
}

const ENV_KEYS = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
  "REVIEW_NOTIFY_EMAIL",
  "NODE_ENV",
] as const;
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

const sampleReview: ReviewRequestData = {
  requesterName: "Jane Founder",
  requesterEmail: "jane@school.example",
  message: "Please review before our board meeting.",
  schoolName: "Acme Academy",
  state: "TX",
  schoolType: "Charter",
  entityType: "Nonprofit",
  enrollment: [120, 180, 240, 300, 360],
  revenue: [1_200_000, 1_800_000, 2_400_000, 3_000_000, 3_600_000],
  expenses: [1_100_000, 1_650_000, 2_200_000, 2_750_000, 3_300_000],
  netIncome: [100_000, 150_000, 200_000, 250_000, 300_000],
  dscr: [1.2, 1.3, 1.4, 1.5, 1.6],
  reserveMonths: 3.5,
  cashRunwayMonths: 14,
  daysCashOnHand: 45,
  criticalFindings: [{ title: "Tight Y1 reserves", severity: "high" }],
  sharedViewUrl: "https://example.com/shared/abc123",
};

const sampleFeedback: ReviewFeedbackData = {
  recipientName: "Jane Founder",
  recipientEmail: "jane@school.example",
  schoolName: "Acme Academy",
  strengths: "Strong enrollment ramp.",
  watchItems: "Y1 reserves run thin.",
  recommendations: "Build 90-day reserve before opening.",
  metrics: {
    y1Revenue: 1_200_000,
    y1NetMargin: 0.083,
    dscr: 1.2,
    cashRunwayMonths: 14,
    lenderReadiness: "Bankable with conditions",
  },
  dashboardUrl: "https://example.com/dashboard",
};

async function main() {
  // --- 1. dev fallback (no provider) — review-request-team ---------------
  // The team-notification sender is the distinctive one: it carries a
  // Reply-To header pointing at the founder's inbox so a reviewer hitting
  // "Reply" lands in the right place. The dev-fallback log must surface
  // that Reply-To so a developer scanning workspace logs can tell who
  // would have been on the receiving end of a real reply.
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    REVIEW_NOTIFY_EMAIL: undefined,
  });
  {
    const { result, warn, error } = await capture(() => sendReviewRequestToTeam(sampleReview));
    check(
      "team/dev/no-provider: returns success:true (graceful fallback)",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "team/dev/no-provider: warns (not errors) so monitoring isn't poisoned",
      warn.length === 1 && error.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
    check(
      "team/dev/no-provider: log includes the review-request-team kind label",
      warn[0]?.includes("review-request-team") === true,
      `warn[0]=${warn[0]}`,
    );
    check(
      "team/dev/no-provider: log surfaces the founder's reply-to address",
      warn[0]?.includes(sampleReview.requesterEmail) === true,
      `warn[0]=${warn[0]}`,
    );
    check(
      "team/dev/no-provider: log includes the shared view link",
      warn[0]?.includes(sampleReview.sharedViewUrl!) === true,
      `warn[0]=${warn[0]}`,
    );
  }

  // --- 2. prod w/o provider — review-request-team -----------------------
  setEnv({
    NODE_ENV: "production",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    REVIEW_NOTIFY_EMAIL: undefined,
  });
  {
    const { result, warn, error } = await capture(() => sendReviewRequestToTeam(sampleReview));
    check(
      "team/prod/no-provider: returns success:false (real outage, surface it)",
      result.success === false,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "team/prod/no-provider: emits console.error (not a quiet warn)",
      error.length === 1 && warn.length === 0,
      `warn=${warn.length} error=${error.length}`,
    );
    check(
      "team/prod/no-provider: error names the missing env vars",
      error[0]?.includes("RESEND_API_KEY") === true && error[0]?.includes("EMAIL_FROM") === true,
    );
  }

  // --- 3. dev fallback — review-confirmation ----------------------------
  // The confirmation is the simplest of the three (no Reply-To, no link).
  // We just want to confirm it routes through the same adapter rather than
  // its old custom guard.
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    REVIEW_NOTIFY_EMAIL: undefined,
  });
  {
    const { result, warn } = await capture(() =>
      sendReviewConfirmation("jane@school.example", "Jane Founder", "Acme Academy"),
    );
    check(
      "confirmation/dev/no-provider: returns success:true (graceful fallback)",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "confirmation/dev/no-provider: log includes the review-confirmation kind label",
      warn[0]?.includes("review-confirmation") === true,
      `warn[0]=${warn[0]}`,
    );
  }

  // --- 4. dev fallback — review-feedback --------------------------------
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    EMAIL_PROVIDER: undefined,
    REVIEW_NOTIFY_EMAIL: undefined,
  });
  {
    const { result, warn } = await capture(() => sendReviewFeedback(sampleFeedback));
    check(
      "feedback/dev/no-provider: returns success:true (graceful fallback)",
      result.success === true,
      `got ${JSON.stringify(result)}`,
    );
    check(
      "feedback/dev/no-provider: log includes the review-feedback kind label",
      warn[0]?.includes("review-feedback") === true,
      `warn[0]=${warn[0]}`,
    );
    check(
      "feedback/dev/no-provider: log includes the dashboard link",
      warn[0]?.includes(sampleFeedback.dashboardUrl!) === true,
      `warn[0]=${warn[0]}`,
    );
  }

  // --- 5. EMAIL_PROVIDER=console override forces the dev logger ---------
  // Mirrors `mailer-adapter.test.ts` case #3: even with Resend creds set,
  // EMAIL_PROVIDER=console must short-circuit to the dev logger. This is
  // what staging / local-only test runs rely on to never email a real
  // inbox.
  setEnv({
    NODE_ENV: "development",
    RESEND_API_KEY: "re_dummy_for_test",
    EMAIL_FROM: "noreply@example.com",
    EMAIL_PROVIDER: "console",
    REVIEW_NOTIFY_EMAIL: "team@example.com",
  });
  {
    const { result, warn } = await capture(() => sendReviewRequestToTeam(sampleReview));
    check(
      "team/EMAIL_PROVIDER=console: routes to dev logger even with creds set",
      result.success === true && warn.length === 1,
      `result=${JSON.stringify(result)} warn=${warn.length}`,
    );
    check(
      "team/EMAIL_PROVIDER=console: log is addressed to REVIEW_NOTIFY_EMAIL",
      warn[0]?.includes("team@example.com") === true,
      `warn[0]=${warn[0]}`,
    );
  }

  restoreEnv();

  if (failures.length > 0) {
    console.error(`\n${failures.length} mailer-review-adapter check(s) failed:`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\nmailer-review-adapter: all checks passed`);
}

main().catch((e) => {
  restoreEnv();
  console.error("mailer-review-adapter test crashed:", e);
  process.exit(1);
});
