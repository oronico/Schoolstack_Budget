// Task #871 — Tests for the KEK-rotation failure alert dispatcher.
//
// Verifies:
//   1. A clean rotation (failed=0 across every table) dispatches
//      nothing — no error_logs row, no email, no console noise.
//   2. A failing rotation writes an error_logs row tagged
//      `key_rotation_failure` whose request_body carries per-table
//      failure counts AND the first few row id / error samples.
//   3. When ADMIN_EMAILS is set and an email provider is configured
//      (we force EMAIL_PROVIDER=console so no real send happens) the
//      alert is also delivered to every recipient.
//   4. When ADMIN_EMAILS is empty / unset, only the error_logs row is
//      written — no email is attempted.
//
// Each test wipes the rows it inserts before exiting.

import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { errorLogsTable } from "@workspace/db/schema";
import {
  alertOnKeyRotationFailure,
  KEY_ROTATION_FAILURE_ROUTE,
} from "../src/lib/key-rotation-alert.js";
import type { TableRotationSummary } from "../src/scripts/rotate-sensitive-encryption-key.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeCleanSummary() {
  const results: TableRotationSummary[] = [
    {
      table: "borrower_entities",
      scanned: 5,
      alreadyOnActive: 5,
      rewrapped: 0,
      failed: 0,
      failures: [],
    },
    {
      table: "founder_profiles",
      scanned: 3,
      alreadyOnActive: 3,
      rewrapped: 0,
      failed: 0,
      failures: [],
    },
  ];
  return { activeKekId: "kek-active", loadedKekIds: ["kek-active", "kek-prev"], results };
}

function makeFailingSummary() {
  const results: TableRotationSummary[] = [
    {
      table: "borrower_entities",
      scanned: 4,
      alreadyOnActive: 1,
      rewrapped: 1,
      failed: 2,
      failures: [
        { id: 101, error: "unparseable encrypted ref" },
        { id: 102, error: "kekId 'kek-old' not loaded" },
      ],
    },
    {
      table: "founder_profiles",
      scanned: 2,
      alreadyOnActive: 1,
      rewrapped: 1,
      failed: 0,
      failures: [],
    },
  ];
  return { activeKekId: "kek-active", loadedKekIds: ["kek-active", "kek-prev"], results };
}

async function deleteAlertRows(): Promise<void> {
  if (!db) return;
  await db.delete(errorLogsTable).where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
}

async function main(): Promise<void> {
  if (!db) {
    console.log("DATABASE_URL not configured — skipping key-rotation-alert test.");
    return;
  }

  // Snapshot env so we can restore between phases.
  const origAdmins = process.env.ADMIN_EMAILS;
  const origProvider = process.env.EMAIL_PROVIDER;
  const origFrom = process.env.EMAIL_FROM;
  const origResendKey = process.env.RESEND_API_KEY;
  // The alert helper short-circuits email when `isEmailConfigured()`
  // is false (i.e. neither Resend nor Postmark creds are set). Force
  // a Resend cred AND `EMAIL_PROVIDER=console` so we exercise the
  // delivery path without actually sending mail — this keeps the
  // test self-contained in CI envs that have no provider configured.
  process.env.RESEND_API_KEY = "test-resend-key-not-used";

  try {
    await deleteAlertRows();

    console.log("\n— phase 1: clean tick dispatches nothing");
    {
      process.env.ADMIN_EMAILS = "ops@example.com";
      process.env.EMAIL_PROVIDER = "console";
      process.env.EMAIL_FROM = "alerts@example.com";
      const outcome = await alertOnKeyRotationFailure(makeCleanSummary());
      check("clean tick: dispatched=false", outcome.dispatched === false);
      check("clean tick: totalFailed=0", outcome.totalFailed === 0);
      check("clean tick: no error log row written", outcome.loggedErrorRow === false);
      check("clean tick: no admins emailed", outcome.emailedAdmins === false);
      const rows = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
      check("clean tick: error_logs has 0 rows for this route", rows.length === 0);
    }

    console.log("\n— phase 2: failing tick writes error_logs + emails admins");
    {
      process.env.ADMIN_EMAILS = "ops@example.com, oncall@example.com";
      process.env.EMAIL_PROVIDER = "console";
      process.env.EMAIL_FROM = "alerts@example.com";
      const outcome = await alertOnKeyRotationFailure(makeFailingSummary());
      check("failing tick: dispatched=true", outcome.dispatched === true);
      check("failing tick: totalFailed=2", outcome.totalFailed === 2);
      check("failing tick: error log row written", outcome.loggedErrorRow === true);
      check("failing tick: admins emailed", outcome.emailedAdmins === true);
      check(
        "failing tick: emailed both recipients",
        outcome.emailRecipients.length === 2 &&
          outcome.emailRecipients.includes("ops@example.com") &&
          outcome.emailRecipients.includes("oncall@example.com"),
      );

      const rows = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
      check("failing tick: exactly one error_logs row inserted", rows.length === 1);
      const row = rows[0];
      check(
        "failing tick: error message names total failed count",
        !!row && row.errorMessage.includes("2 failed row(s)"),
      );
      const body = row?.requestBody as
        | {
            activeKekId?: string;
            totalFailed?: number;
            tables?: Array<{
              table: string;
              failed: number;
              sampleFailures: Array<{ id: number; error: string }>;
            }>;
          }
        | null
        | undefined;
      check("failing tick: request_body present", !!body);
      check(
        "failing tick: request_body.activeKekId carried through",
        body?.activeKekId === "kek-active",
      );
      check("failing tick: request_body.totalFailed=2", body?.totalFailed === 2);
      const tables = body?.tables ?? [];
      check(
        "failing tick: only failing tables included",
        tables.length === 1 && tables[0]?.table === "borrower_entities",
      );
      const samples = tables[0]?.sampleFailures ?? [];
      check(
        "failing tick: sample failures preserve row ids",
        samples.length === 2 && samples[0]?.id === 101 && samples[1]?.id === 102,
      );
      check(
        "failing tick: sample failures preserve error strings",
        samples[0]?.error === "unparseable encrypted ref" &&
          samples[1]?.error === "kekId 'kek-old' not loaded",
      );

      await deleteAlertRows();
    }

    console.log("\n— phase 3: ADMIN_EMAILS unset → log row, but no email");
    {
      delete process.env.ADMIN_EMAILS;
      process.env.EMAIL_PROVIDER = "console";
      process.env.EMAIL_FROM = "alerts@example.com";
      const outcome = await alertOnKeyRotationFailure(makeFailingSummary());
      check("no-recipients: dispatched=true", outcome.dispatched === true);
      check("no-recipients: error log row still written", outcome.loggedErrorRow === true);
      check("no-recipients: no admins emailed", outcome.emailedAdmins === false);
      check("no-recipients: empty recipient list", outcome.emailRecipients.length === 0);
      const rows = await db
        .select()
        .from(errorLogsTable)
        .where(
          and(
            eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE),
          ),
        );
      check("no-recipients: error_logs row exists", rows.length === 1);
      await deleteAlertRows();
    }

    console.log("\n— phase 4: repeat tick on same row set is throttled");
    {
      // Task #884 — Two consecutive ticks that fail on the same
      // `(table, row_ids)` set must produce one alert, not two. The
      // second tick should suppress both the email AND a fresh
      // error_logs row. A signature change (different row id, or a
      // newly-failing table) must page immediately on the next tick.
      process.env.ADMIN_EMAILS = "ops@example.com";
      process.env.EMAIL_PROVIDER = "console";
      process.env.EMAIL_FROM = "alerts@example.com";

      const first = await alertOnKeyRotationFailure(makeFailingSummary());
      check("throttle: first tick dispatched", first.dispatched === true);
      check("throttle: first tick wrote log row", first.loggedErrorRow === true);
      check("throttle: first tick emailed admins", first.emailedAdmins === true);
      check("throttle: first tick not flagged as duplicate", first.suppressedAsDuplicate === false);

      const second = await alertOnKeyRotationFailure(makeFailingSummary());
      check("throttle: repeat tick suppressed", second.dispatched === false);
      check("throttle: repeat tick flagged duplicate", second.suppressedAsDuplicate === true);
      check("throttle: repeat tick wrote NO log row", second.loggedErrorRow === false);
      check("throttle: repeat tick emailed NOBODY", second.emailedAdmins === false);
      check("throttle: repeat tick reports same totalFailed", second.totalFailed === 2);

      const rowsAfterRepeat = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
      check(
        "throttle: only one error_logs row after two identical ticks",
        rowsAfterRepeat.length === 1,
        `got ${rowsAfterRepeat.length}`,
      );

      // A new failure (different row id) must break the dedupe and
      // page immediately, even though it is the next tick after the
      // suppressed one.
      const newRowSummary = {
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active", "kek-prev"],
        results: [
          {
            table: "borrower_entities",
            scanned: 4,
            alreadyOnActive: 1,
            rewrapped: 1,
            failed: 1,
            failures: [{ id: 999, error: "brand new broken row" }],
          } satisfies TableRotationSummary,
        ],
      };
      const third = await alertOnKeyRotationFailure(newRowSummary);
      check("throttle: new row id pages again", third.dispatched === true);
      check("throttle: new row id NOT flagged duplicate", third.suppressedAsDuplicate === false);
      check("throttle: new row id wrote log row", third.loggedErrorRow === true);
      check("throttle: new row id emailed admins", third.emailedAdmins === true);

      const rowsAfterChange = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
      check(
        "throttle: signature change inserts a second log row (2 total)",
        rowsAfterChange.length === 2,
        `got ${rowsAfterChange.length}`,
      );

      // A new table failing alongside the most recent set is also a
      // signature change.
      const newTableSummary = {
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active", "kek-prev"],
        results: [
          {
            table: "borrower_entities",
            scanned: 4,
            alreadyOnActive: 1,
            rewrapped: 1,
            failed: 1,
            failures: [{ id: 999, error: "brand new broken row" }],
          } satisfies TableRotationSummary,
          {
            table: "founder_profiles",
            scanned: 2,
            alreadyOnActive: 1,
            rewrapped: 0,
            failed: 1,
            failures: [{ id: 50, error: "another table now broken too" }],
          } satisfies TableRotationSummary,
        ],
      };
      const fourth = await alertOnKeyRotationFailure(newTableSummary);
      check("throttle: new failing table pages again", fourth.dispatched === true);
      check("throttle: new failing table NOT duplicate", fourth.suppressedAsDuplicate === false);

      // And a tick that exactly repeats the most-recent (now
      // multi-table) signature is throttled again.
      const fifth = await alertOnKeyRotationFailure(newTableSummary);
      check("throttle: identical multi-table tick suppressed", fifth.dispatched === false);
      check("throttle: identical multi-table tick is duplicate", fifth.suppressedAsDuplicate === true);

      // A zero-window override must disable the throttle entirely:
      // an invalid value falls back to the default, so use a tiny
      // positive value and a sleep would be slow — instead, set the
      // env to a value larger than the test runtime to confirm the
      // window is honored, then back-date the row in-place to
      // simulate "outside the window" and verify a fresh page.
      const origDedupe = process.env.KEY_ROTATION_ALERT_DEDUPE_HOURS;
      try {
        await db
          .update(errorLogsTable)
          .set({ createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48) })
          .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
        process.env.KEY_ROTATION_ALERT_DEDUPE_HOURS = "1";
        const sixth = await alertOnKeyRotationFailure(newTableSummary);
        check(
          "throttle: identical tick OUTSIDE window pages again",
          sixth.dispatched === true && sixth.suppressedAsDuplicate === false,
        );
      } finally {
        if (origDedupe === undefined) delete process.env.KEY_ROTATION_ALERT_DEDUPE_HOURS;
        else process.env.KEY_ROTATION_ALERT_DEDUPE_HOURS = origDedupe;
      }

      // A change to an UNSAMPLED row id (i.e. beyond the first 5
      // entries we put in `sampleFailures`) must still break the
      // dedupe — otherwise a high-failure tick could swap rows
      // outside the sample window and we'd silently swallow the
      // change. Run two ticks with 12 failures each, where only the
      // 12th id differs between them, and assert the second pages.
      await deleteAlertRows();
      const makeManySummary = (lastId: number) => ({
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active"],
        results: [
          {
            table: "borrower_entities",
            scanned: 20,
            alreadyOnActive: 0,
            rewrapped: 0,
            failed: 12,
            failures: [
              ...Array.from({ length: 11 }, (_, i) => ({
                id: 300 + i,
                error: `boom-${i}`,
              })),
              { id: lastId, error: "tail-of-list" },
            ],
          } satisfies TableRotationSummary,
        ],
      });
      const seventh = await alertOnKeyRotationFailure(makeManySummary(900));
      check("throttle: unsampled-tail first tick pages", seventh.dispatched === true);
      const eighth = await alertOnKeyRotationFailure(makeManySummary(900));
      check(
        "throttle: unsampled-tail repeat (same ids) suppressed",
        eighth.suppressedAsDuplicate === true,
      );
      const ninth = await alertOnKeyRotationFailure(makeManySummary(901));
      check(
        "throttle: unsampled-tail change (id past MAX_FAILURE_SAMPLES) pages again",
        ninth.dispatched === true && ninth.suppressedAsDuplicate === false,
      );

      await deleteAlertRows();
    }

    console.log("\n— phase 5: failing tick with > MAX_FAILURE_SAMPLES failures truncates samples");
    {
      process.env.ADMIN_EMAILS = "ops@example.com";
      const many: TableRotationSummary = {
        table: "borrower_entities",
        scanned: 20,
        alreadyOnActive: 0,
        rewrapped: 0,
        failed: 12,
        failures: Array.from({ length: 12 }, (_, i) => ({
          id: 200 + i,
          error: `boom-${i}`,
        })),
      };
      const outcome = await alertOnKeyRotationFailure({
        activeKekId: "kek-active",
        loadedKekIds: ["kek-active"],
        results: [many],
      });
      check("many-failures: dispatched=true", outcome.dispatched === true);
      check("many-failures: totalFailed=12", outcome.totalFailed === 12);
      const rows = await db
        .select()
        .from(errorLogsTable)
        .where(eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE));
      const body = rows[0]?.requestBody as
        | { tables?: Array<{ sampleFailures: unknown[] }> }
        | null
        | undefined;
      const sampleCount = body?.tables?.[0]?.sampleFailures?.length ?? -1;
      check(
        "many-failures: sample failures capped at 5",
        sampleCount === 5,
        `got ${sampleCount}`,
      );
      await deleteAlertRows();
    }
  } finally {
    if (origAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = origAdmins;
    if (origProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = origProvider;
    if (origFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = origFrom;
    if (origResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origResendKey;
    await deleteAlertRows();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
