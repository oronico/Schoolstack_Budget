// Task #787 — Audited wrapper around `decryptSensitive`.
//
// `decryptSensitive` (Task #620) is the only way to recover a raw
// EIN / SSN / bank account number from the Phase 2
// `borrower_entities` / `founder_profiles` tables. The helper requires
// `{ actorRole, purpose }` for traceability but deliberately does NOT
// write the audit trail itself — it leaves that to the call site.
//
// `decryptSensitiveAndAudit` is the chokepoint for application code:
// it writes an `audit_log` row (action: `decrypt`) BEFORE returning
// the plaintext, so we have a permanent record of who unsealed which
// borrower's data and why even if the caller crashes after decrypting.
//
// A static guard in `tests/decrypt-sensitive-audit-wrapper.ts` fails
// the build if any production code under `src/` calls `decryptSensitive`
// directly outside this wrapper file or `sensitive-encryption.ts`
// itself. Add a new decrypt site? Call `decryptSensitiveAndAudit`.

import { decryptSensitive } from "./sensitive-encryption.js";
import { recordAuditLog } from "./audit-log.js";

export interface DecryptSensitiveAndAuditInput {
  /** The opaque encrypted ref persisted in `*_encrypted_ref`. */
  encryptedRef: string;
  /**
   * The actor requesting decryption. `actorUserId` is null for system
   * jobs (KYC submitter, IRS lookup cron). `actorRole` is the snapshot
   * of the role at the time of the request — must be one of the
   * server-internal roles allowed by `decryptSensitive`.
   */
  actorUserId?: number | null;
  actorRole: string;
  /** Required free-text reason. Persisted in the audit row. */
  purpose: string;
  /**
   * The borrower-side entity that owns this encrypted value. We pin
   * the audit row to (entityType, entityId) so an auditor can list
   * every decrypt event for one borrower with a single index lookup.
   */
  entityType: string;
  entityId: number;
  /** Optional free-text note appended to the audit row. */
  note?: string | null;
}

export class DecryptAndAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptAndAuditError";
  }
}

/**
 * Audited wrapper around `decryptSensitive`. Writes an `audit_log`
 * row (action: `decrypt`) and then returns the plaintext.
 *
 * The audit row is written BEFORE decryption so we still have a
 * record of the attempt even if the underlying decrypt throws (e.g.
 * KEK rotation, ciphertext tampering). The caller's plaintext is
 * never passed to `recordAuditLog`; only the metadata (actor, purpose,
 * entity ref) is persisted.
 */
export async function decryptSensitiveAndAudit(
  input: DecryptSensitiveAndAuditInput,
): Promise<string> {
  if (!input || typeof input !== "object") {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires an input object.",
    );
  }
  if (typeof input.encryptedRef !== "string" || input.encryptedRef.length === 0) {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires a non-empty encryptedRef.",
    );
  }
  if (typeof input.actorRole !== "string" || input.actorRole.trim().length === 0) {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires a non-empty actorRole.",
    );
  }
  if (typeof input.purpose !== "string" || input.purpose.trim().length === 0) {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires a non-empty purpose for audit traceability.",
    );
  }
  if (typeof input.entityType !== "string" || input.entityType.trim().length === 0) {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires a non-empty entityType.",
    );
  }
  if (!Number.isInteger(input.entityId) || input.entityId <= 0) {
    throw new DecryptAndAuditError(
      "decryptSensitiveAndAudit requires a positive integer entityId.",
    );
  }

  // Audit FIRST. If we audited *after* decryption and the process
  // crashed in between, we'd have leaked plaintext with no record. The
  // payload deliberately contains only metadata; the redactor in
  // `recordAuditLog` would scrub the encrypted ref anyway, but we
  // never hand it the ciphertext or the plaintext to begin with.
  await recordAuditLog({
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "decrypt",
    after: { purpose: input.purpose.trim() },
    note: input.note ?? null,
  });

  return decryptSensitive(input.encryptedRef, {
    actorRole: input.actorRole,
    purpose: input.purpose,
  });
}
