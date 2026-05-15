// Task #871 — Turn KEK rotation failures into an active notification.
//
// `runScheduledKeyRotation` (src/index.ts) runs the borrower-data
// re-wrap on a recurring tick and prints `[rotation-summary] {...}`
// for grep-based monitoring. That left a silent-regression hole: if a
// rotation tick reported `failed > 0` (e.g. an unparseable
// encrypted_ref, a dropped previous KEK), nobody noticed until
// somebody happened to grep deployment logs.
//
// `alertOnKeyRotationFailure` is the single chokepoint that turns a
// failing rotation result into an alert:
//   - always writes a tagged `error_logs` row (route =
//     `key_rotation_failure`) so the admin dashboard / 30-day error
//     log surfaces it
//   - additionally emails ADMIN_EMAILS via the existing transactional
//     email adapter when both the recipient list and the email
//     provider are configured
//   - returns immediately (no log row, no email) on a clean tick —
//     a healthy rotation must not produce noise
//
// Failure detail is intentionally bounded: we attach per-table
// failure counts and the first few row ids / error strings (capped by
// MAX_FAILURE_SAMPLES) so the alert is actionable without dumping
// every single row id into an email body or jsonb column.

import { recordErrorLog } from "./error-log.js";
import { deliverTransactionalEmail, isEmailConfigured } from "./mailer.js";
import type { TableRotationSummary } from "../scripts/rotate-sensitive-encryption-key.js";

export const KEY_ROTATION_FAILURE_ROUTE = "key_rotation_failure";
const MAX_FAILURE_SAMPLES = 5;

export interface KeyRotationAlertInput {
  activeKekId: string;
  loadedKekIds: string[];
  results: TableRotationSummary[];
}

interface PerTableFailure {
  table: string;
  failed: number;
  rewrapped: number;
  scanned: number;
  sampleFailures: Array<{ id: number; error: string }>;
}

export interface KeyRotationAlertOutcome {
  dispatched: boolean;
  totalFailed: number;
  loggedErrorRow: boolean;
  emailedAdmins: boolean;
  emailRecipients: string[];
}

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function summarizeFailures(results: TableRotationSummary[]): {
  totalFailed: number;
  perTable: PerTableFailure[];
} {
  let totalFailed = 0;
  const perTable: PerTableFailure[] = [];
  for (const r of results) {
    if (r.failed > 0) {
      totalFailed += r.failed;
      perTable.push({
        table: r.table,
        failed: r.failed,
        rewrapped: r.rewrapped,
        scanned: r.scanned,
        sampleFailures: r.failures.slice(0, MAX_FAILURE_SAMPLES),
      });
    }
  }
  return { totalFailed, perTable };
}

function buildEmailBodies(
  input: KeyRotationAlertInput,
  perTable: PerTableFailure[],
  totalFailed: number,
): { text: string; html: string } {
  const lines: string[] = [];
  lines.push(
    `Borrower-data KEK rotation reported ${totalFailed} failed row(s) on the most recent tick.`,
  );
  lines.push("");
  lines.push(`Active KEK: ${input.activeKekId}`);
  lines.push(`Loaded KEKs: [${input.loadedKekIds.join(", ")}]`);
  lines.push("");
  for (const t of perTable) {
    lines.push(
      `${t.table}: scanned=${t.scanned} rewrapped=${t.rewrapped} failed=${t.failed}`,
    );
    for (const f of t.sampleFailures) {
      lines.push(`  - id=${f.id}: ${f.error}`);
    }
    if (t.failed > t.sampleFailures.length) {
      lines.push(`  - …and ${t.failed - t.sampleFailures.length} more`);
    }
  }
  lines.push("");
  lines.push(
    "Investigate before the previous KEK is removed from the deployment env, " +
      "or those rows will become unreadable.",
  );
  const text = lines.join("\n");
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap">${escape(text)}</pre>`;
  return { text, html };
}

/**
 * Inspect a rotation result and dispatch alerts if any table reports
 * `failed > 0`. Returns synchronously-resolvable outcome metadata so
 * the caller can log what was sent. Never throws — alert dispatch
 * failures are logged to the workspace console and swallowed so a
 * mailer outage cannot crash the rotation scheduler.
 */
export async function alertOnKeyRotationFailure(
  input: KeyRotationAlertInput,
): Promise<KeyRotationAlertOutcome> {
  const { totalFailed, perTable } = summarizeFailures(input.results);
  if (totalFailed === 0) {
    return {
      dispatched: false,
      totalFailed: 0,
      loggedErrorRow: false,
      emailedAdmins: false,
      emailRecipients: [],
    };
  }

  let loggedErrorRow = false;
  try {
    await recordErrorLog({
      userId: null,
      errorMessage: `KEK rotation reported ${totalFailed} failed row(s) across ${perTable.length} table(s)`,
      errorStack: null,
      route: KEY_ROTATION_FAILURE_ROUTE,
      requestBody: {
        activeKekId: input.activeKekId,
        loadedKekIds: input.loadedKekIds,
        totalFailed,
        tables: perTable,
      },
    });
    loggedErrorRow = true;
  } catch (err) {
    console.error("[key-rotation-alert] failed to write error_logs row:", err);
  }

  const recipients = getAdminEmails();
  let emailedAdmins = false;
  const emailedRecipients: string[] = [];
  if (recipients.length > 0 && isEmailConfigured()) {
    const { text, html } = buildEmailBodies(input, perTable, totalFailed);
    const subject = `[ALERT] Borrower-data KEK rotation: ${totalFailed} failed row(s)`;
    for (const to of recipients) {
      try {
        const result = await deliverTransactionalEmail({
          kind: "key_rotation_failure_alert",
          to,
          subject,
          text,
          html,
        });
        if (result.success) {
          emailedAdmins = true;
          emailedRecipients.push(to);
        } else {
          console.error(
            `[key-rotation-alert] mailer reported failure for ${to}: ${result.error ?? "unknown"}`,
          );
        }
      } catch (err) {
        console.error(`[key-rotation-alert] email send threw for ${to}:`, err);
      }
    }
  }

  return {
    dispatched: true,
    totalFailed,
    loggedErrorRow,
    emailedAdmins,
    emailRecipients: emailedRecipients,
  };
}
