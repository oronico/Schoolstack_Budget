# Encryption Key Management — SENSITIVE_ENCRYPTION_KEY

**Status:** Living document. Update whenever the storage location, access
roster, or rotation procedure changes.

**Scope:** Operational reference for the per-row KEK used by
`artifacts/api-server/src/lib/sensitive-encryption.ts`. This document
intentionally records **storage locations and access policy** only — the
key value itself must never appear in this file, in the repo, in chat,
in screenshots, in code reviews, or in any artifact tracked by source
control. If you suspect the key value has been pasted anywhere
checkpointed (commits, PRs, issue threads, attachments, log lines),
treat it as a compromise and follow §5 Rotation immediately.

Companion: §11 of `docs/operations/go-live-gate-checklist.md` gates
every future production-equivalent environment (staging, disaster
recovery, migration target) on the presence of this document being
current.

---

## 1. What the key does

`SENSITIVE_ENCRYPTION_KEY` is the key-encryption key (KEK) for the
sensitive-field encryption layer. Each protected row stores a
per-row data-encryption key (DEK) wrapped by the active KEK. Code
reference:

- `artifacts/api-server/src/lib/sensitive-encryption.ts` — read path,
  write path, KEK ID stamping (`kekId`).
- `artifacts/api-server/src/index.ts` — boot-time read of
  `SENSITIVE_ENCRYPTION_KEY` and the rotation scheduler.
- `artifacts/api-server/src/scripts/rotate-sensitive-encryption-key.ts`
  — operator-driven re-wrap of every existing row's DEK under a new KEK.

Behavior if the key is **missing or wrong**:
- Missing → the first attempt to read or write a sensitive field
  throws at runtime. (Today's production incident was an instance of
  this: the key was unset on the Railway environment, so the container
  crash-looped on the first encrypted read after boot.)
- Wrong (does not match the `kekId` stamped on existing rows) → the
  read path fails to unwrap the DEK and the request returns a 5xx;
  data is not lost, but the system is read-broken until either the
  correct key or the corresponding `SENSITIVE_ENCRYPTION_KEY_PREVIOUS`
  is restored.

---

## 2. Storage locations

The key is held in environment-variable stores ONLY. It is never
checked into the repo, never written to logs, and never embedded in
container images.

| Environment | Variable | Stored in | Notes |
|---|---|---|---|
| Production (Railway) | `SENSITIVE_ENCRYPTION_KEY` | Railway project → service → **Variables** tab | Active KEK. Required for boot; the api-server crash-loops without it (today's incident). |
| Production (Railway) | `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` | Same place | Optional. Required only during a rotation window (see §5). Remove when the rotator reports `failed=0` across every table. |
| Staging (Railway, when provisioned) | `SENSITIVE_ENCRYPTION_KEY` | Staging service → **Variables** tab | Must be **distinct** from production. Never share keys across environments. |
| Local dev (Replit workspace) | `SENSITIVE_ENCRYPTION_KEY` | Replit Secrets pane | Dev-only key. Distinct from production. Sensitive-field tests will skip or fail loudly if unset; do not paper over by reusing the production key. |
| CI (when enabled) | `SENSITIVE_ENCRYPTION_KEY` | CI provider's encrypted-secrets store | Per-CI-job ephemeral key for tests only. Never a production key. |

**Backup of record for the production key value:** _TBD — name a
single off-platform secret manager (1Password / Bitwarden / cloud KMS)
that holds the canonical copy, and the vault item ID. Until this row
is filled in, the production key has no recovery path if Railway loses
it._

---

## 3. Access roster

Two distinct access scopes — both are recorded here, not in private
DMs.

| Scope | Granted to | Mechanism | Review cadence |
|---|---|---|---|
| **Read** the production key value (e.g. to populate a new env, to debug a `kekId` mismatch) | _TBD — list named individuals, role-based access only_ | Railway project membership at the "Member" tier or above; off-platform vault membership (see §2 footer) | Quarterly — remove anyone no longer on the team within 7 days of role change |
| **Rotate** the production key (run the §5 procedure) | _TBD — list named individuals; should be a subset of the Read scope_ | Same as Read, plus a documented run-book walkthrough completed at least once | Quarterly |

Today's roster: _TBD — fill in named individuals before the §11
go-live gate is checked off._

**Off-boarding hook:** when anyone listed above leaves the team or
changes roles, the off-boarding checklist must (a) remove their
Railway membership, (b) remove their off-platform vault membership,
and (c) trigger a rotation per §5 if they had Read access in the
preceding 90 days. Track the off-boarding events here:

| Date | Person | Action taken | Rotation triggered? |
|---|---|---|---|
| _(none yet)_ | | | |

---

## 4. Generating a new key value

Use a cryptographically secure source. The encryption layer accepts
both base64 and hex encodings of a 32-byte (256-bit) key. One safe
generator, run locally and copied directly into the Railway variables
UI (never paste into chat or commit):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Discard the terminal scrollback after pasting. Do not save the value
to a file on disk.

---

## 5. Rotation procedure

Driven by `artifacts/api-server/src/scripts/rotate-sensitive-encryption-key.ts`.
The script re-wraps every existing row's DEK under a new KEK so old
rows become readable under the new active key and the previous key
can be retired.

Standard rotation window:

1. Generate a new key value per §4.
2. In Railway, set `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` to the
   **current** active key value, and set `SENSITIVE_ENCRYPTION_KEY`
   to the new value. Deploy. The api-server now reads under either
   key but writes new rows under the new key.
3. Run the rotator against production:
   ```
   pnpm --filter @workspace/api-server tsx src/scripts/rotate-sensitive-encryption-key.ts
   ```
   Watch the per-table progress output. Re-run on failure; the script
   is idempotent.
4. When the rotator reports `failed=0` across every table, remove
   `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` from the Railway variables and
   redeploy. The previous key is now retired.
5. Update §6 below with the rotation date, operator, and reason.

Triggers for an unscheduled rotation:
- A person with Read access leaves the team (see §3).
- The key value is suspected to have been written anywhere checkpointed.
- A `kekId` mismatch surfaces in production logs and the cause cannot
  be ruled out as benign within 60 minutes.
- Any incident-response playbook in `docs/RUNBOOK-engineering.md` §IR
  calls for credential rotation.

Recurring health signal: the key-rotation scheduler (see
`artifacts/api-server/src/index.ts:139` and Task #871/#883/#884)
auto-pages on rotation failure. Do not silence that alert without
filing a follow-up.

---

## 6. Rotation history

Append-only log. Each row records that a rotation occurred — never
the key values.

| Date | Operator | Reason | `failed=0` confirmed? | Previous-key removed? |
|---|---|---|---|---|
| _(none yet — initial production key set 2026-05-18 in response to the boot crash-loop incident)_ | | | | |

---

## 7. Cross-references

- Code: `artifacts/api-server/src/lib/sensitive-encryption.ts`,
  `artifacts/api-server/src/index.ts:139` (rotation scheduler),
  `artifacts/api-server/src/scripts/rotate-sensitive-encryption-key.ts`.
- Tests: `artifacts/api-server/tests/sensitive-encryption-*.ts`,
  `artifacts/api-server/tests/health-endpoints.ts` (rotation
  smoke).
- Runbook: `docs/RUNBOOK-engineering.md` §"Sensitive encryption" and
  the IR section's "rotate credentials" step.
- Go-live gate: `docs/operations/go-live-gate-checklist.md` §11
  (this doc must be current before any new production-equivalent
  environment is signed off).
