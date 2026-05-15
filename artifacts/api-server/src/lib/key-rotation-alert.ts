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

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { errorLogsTable } from "@workspace/db/schema";
import { recordErrorLog } from "./error-log.js";
import { deliverTransactionalEmail, isEmailConfigured } from "./mailer.js";
import type { TableRotationSummary } from "../scripts/rotate-sensitive-encryption-key.js";

export const KEY_ROTATION_FAILURE_ROUTE = "key_rotation_failure";
const MAX_FAILURE_SAMPLES = 5;
// Task #884 — Throttle repeat alerts. If the same `(table, row_ids)`
// failure set has already been alerted within this window, the next
// tick is treated as a duplicate: no email, no new error_logs row.
// A new failure (different row id, different table) still pages
// immediately, regardless of window. Tunable via env so an operator
// can dial the cadence without a code change.
const DEFAULT_DEDUPE_HOURS = 24;
function getDedupeWindowMs(): number {
  const raw = Number(process.env.KEY_ROTATION_ALERT_DEDUPE_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DEDUPE_HOURS;
  return Math.floor(hours * 60 * 60 * 1000);
}

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
  // Task #884 — true when the failure set matched a recent
  // `key_rotation_failure` log row and we suppressed both the new log
  // row and the email to avoid alert fatigue.
  suppressedAsDuplicate: boolean;
}

interface FailureSignaturePart {
  table: string;
  rowIds: number[];
}

/**
 * Build a stable, comparable signature of the failing `(table,
 * row_ids)` set. Tables are sorted alphabetically; row ids within a
 * table are sorted numerically. Two ticks that fail on the exact same
 * rows produce identical signatures regardless of insertion order.
 */
function buildFailureSignature(
  perTable: PerTableFailure[],
  fullRowIdsByTable: Map<string, number[]>,
): {
  parts: FailureSignaturePart[];
  key: string;
} {
  const parts: FailureSignaturePart[] = perTable
    .map((t) => ({
      table: t.table,
      // Use the FULL failing row id set, not the capped sample, so a
      // change to an unsampled row id still breaks the dedupe.
      rowIds: [...new Set(fullRowIdsByTable.get(t.table) ?? [])].sort((a, b) => a - b),
    }))
    .sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
  const key = parts.map((p) => `${p.table}:${p.rowIds.join(",")}`).join("|");
  return { parts, key };
}

/**
 * Look up the most recent `key_rotation_failure` error_logs row
 * within the dedupe window and return its stored signature key, if
 * any. Returns null when nothing matches or when the previous row
 * pre-dates the throttling change (no signature stored).
 */
async function findRecentSignatureKey(): Promise<string | null> {
  if (!db) return null;
  const cutoff = new Date(Date.now() - getDedupeWindowMs());
  try {
    const rows = await db
      .select({ requestBody: errorLogsTable.requestBody })
      .from(errorLogsTable)
      .where(
        and(
          eq(errorLogsTable.route, KEY_ROTATION_FAILURE_ROUTE),
          gte(errorLogsTable.createdAt, cutoff),
        ),
      )
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(1);
    const body = rows[0]?.requestBody as { signatureKey?: unknown } | null | undefined;
    const key = body?.signatureKey;
    return typeof key === "string" ? key : null;
  } catch (err) {
    console.error("[key-rotation-alert] failed to read recent log row for dedupe:", err);
    return null;
  }
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
  // Task #884 — full row-id set per failing table, retained
  // separately from `sampleFailures` (which is capped to
  // MAX_FAILURE_SAMPLES for the human-readable email/log body) so the
  // dedupe signature reflects every failing row, not just the first
  // few. Without this, a tick that fails on rows [1..10] and a tick
  // that fails on rows [1..5,99] would produce the same signature
  // and the new row 99 would be silently swallowed.
  fullRowIdsByTable: Map<string, number[]>;
} {
  let totalFailed = 0;
  const perTable: PerTableFailure[] = [];
  const fullRowIdsByTable = new Map<string, number[]>();
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
      fullRowIdsByTable.set(
        r.table,
        r.failures.map((f) => f.id),
      );
    }
  }
  return { totalFailed, perTable, fullRowIdsByTable };
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
  const { totalFailed, perTable, fullRowIdsByTable } = summarizeFailures(input.results);
  if (totalFailed === 0) {
    return {
      dispatched: false,
      totalFailed: 0,
      loggedErrorRow: false,
      emailedAdmins: false,
      emailRecipients: [],
      suppressedAsDuplicate: false,
    };
  }

  // Task #884 — Suppress duplicate alerts. We compare a stable
  // signature of the failing `(table, row_ids)` set against the most
  // recent `key_rotation_failure` log row within the dedupe window.
  // When it matches, we skip BOTH the new error_logs row and the
  // email — the existing row is already the active alert, and the
  // dashboard / email already named the same rows. A signature change
  // (new row id, new table, or fewer rows because some were fixed)
  // breaks the match and we page immediately.
  const signature = buildFailureSignature(perTable, fullRowIdsByTable);
  const previousKey = await findRecentSignatureKey();
  if (previousKey !== null && previousKey === signature.key) {
    return {
      dispatched: false,
      totalFailed,
      loggedErrorRow: false,
      emailedAdmins: false,
      emailRecipients: [],
      suppressedAsDuplicate: true,
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
        signatureKey: signature.key,
        signatureParts: signature.parts,
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
    suppressedAsDuplicate: false,
  };
}
