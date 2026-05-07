# Full Underwriting Database Schema Plan

_Owner: Task #605. This document covers all 13 tables proposed for the
evidence-driven underwriting flow, marks the six that ship in Phase 1,
and documents the rollout, runbook, and risks._

The shape we are aiming for: an underwriter can open an application,
see every document the borrower uploaded, every claim extracted from
those documents, every metric snapshot the engine took, every gate that
passed/failed/was-waived, the credit memo and risk rating that flowed
out of those, the closing conditions, the final decision, and a
mutation-by-mutation audit trail across all of it. Today, all of that
data is hiding inside `financial_models.data` and a handful of JSONB
columns that work great for budgeting but cannot answer the
"what evidence supported this decision?" question.

## Design principles

1. **JSONB stays for the budget wizard.** We do not migrate or rewrite
   any existing `financial_models` JSONB. Underwriting reads from those
   blobs but writes its own structured tables.
2. **Evidence is first-class.** Every numeric claim a credit memo
   references must trace back to a row in `underwriting_evidence` that
   in turn (usually) traces back to an `underwriting_documents` row
   with a content hash.
3. **Snapshots over recompute.** Metrics, gates, decisions, and risk
   ratings are pinned in time so a memo reproduces exactly what the
   committee saw.
4. **PII minimization.** No raw SSNs, EINs, bank account numbers, or
   bank routing numbers in the database. Last-4 digits and an opaque
   reference into a future encryption helper are the only forms we
   store. Document bytes live in App Storage, never in Postgres.
5. **Audit log decoupled.** The audit table has no FK on the entity it
   describes; history must outlive entity deletion.

## Phased rollout

| Phase | Tables | Status |
| --- | --- | --- |
| **Phase 1 (this task)** | `underwriting_applications`, `underwriting_documents`, `underwriting_evidence`, `underwriting_metrics_snapshots`, `eligibility_gate_results`, `audit_log` | Drizzle + migration + smoke test landed (Task #605). |
| **Phase 2** | `borrower_entities`, `founder_profiles` | Design only. Needed before we can store legal-entity / KYC data. |
| **Phase 3** | `policy_rule_versions` | Design only. Versions the rule packs that produce gate results. |
| **Phase 4** | `underwriting_risk_ratings`, `credit_memos`, `closing_conditions`, `underwriting_decisions` | Design only. Decision-side tables; depend on Phase 1+2+3. |

After every phase: regenerate the migration, apply locally, run the
schema smoke test, and update this doc.

## Conventions used in every table

- `id serial primary key` (matches existing tables — easy to evolve to
  bigserial if volume demands it).
- `created_at timestamp default now() not null`; `updated_at` where
  mutation is expected. Per-table audit entries live in `audit_log`,
  not in side tables.
- Enums are `varchar(N) not null` with documented allowed values rather
  than Postgres `CREATE TYPE`. This matches the rest of the codebase
  (`financial_models.status`, `users.role`) and lets us add values via a
  plain ALTER without rewriting the column.
- Money is stored as `integer` cents. We deliberately avoid `numeric`
  to keep arithmetic identical between the SQL and TS layers; the
  budget wizard uses the same convention.
- Foreign keys: cascade on parent-child relationships **inside**
  underwriting; SET NULL when referencing users (so deleting a user
  does not erase history); RESTRICT when the row anchors money or
  decisions to a person.
- All `application_id` FKs on child tables use `ON DELETE CASCADE`.

---

# Phase 1 — implemented in this task

## 1. `underwriting_applications`

Long-lived envelope around one loan request.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `user_id` | `integer NOT NULL → users.id` | `ON DELETE RESTRICT` — applications anchor money decisions; do not silently drop on user delete. |
| `school_id` | `integer NULL → schools.id` | `ON DELETE SET NULL`. |
| `financial_model_id` | `integer NULL → financial_models.id` | `ON DELETE SET NULL` — keeps the application alive if the seed model is later removed. |
| `status` | `varchar(30) NOT NULL DEFAULT 'draft'` | Allowed: `draft`, `submitted`, `in_review`, `pending_info`, `approved`, `declined`, `withdrawn`. |
| `loan_purpose` | `text` | Free text from intake. |
| `requested_amount_cents` | `integer` | |
| `requested_term_months` | `integer` | |
| `borrower_entity_id` | `integer` | Phase 2 FK; column ships now so loan ask + borrower can be linked once `borrower_entities` lands. |
| `submitted_at` | `timestamp` | Set when status moves to `submitted`. |
| `decisioned_at` | `timestamp` | Set when status moves to `approved`/`declined`. |
| `metadata` | `jsonb` | Application-level catch-all (intake source, contact pref). Never used for evidence/decision data. |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `user_id`, `status`, `school_id`.

## 2. `underwriting_documents`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `document_type` | `varchar(60) NOT NULL` | Allowed: `tax_return`, `financial_statement`, `bank_statement`, `articles_of_incorporation`, `w9`, `charter_authorization`, `facility_lease`, `organizational_chart`, `founder_resume`, `other`. |
| `display_name` | `text` | Borrower-supplied label. |
| `storage_ref` | `text NOT NULL` | Opaque pointer (`appstorage://...`); bytes never in PG. |
| `content_sha256` | `varchar(64)` | Hex SHA-256 of the bytes. |
| `byte_size` | `integer` | |
| `mime_type` | `varchar(120)` | |
| `verification_status` | `varchar(30) NOT NULL DEFAULT 'uploaded'` | Allowed: `uploaded`, `under_review`, `verified`, `rejected`, `superseded`. |
| `rejection_reason` | `text` | |
| `uploaded_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `reviewed_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `reviewed_at` | `timestamp` | |
| `metadata` | `jsonb` | OCR/extracted metadata. |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `application_id`, `document_type`, `verification_status`.

PII: only an opaque `storage_ref` and the SHA-256 of the file. No
account numbers, no SSN/EIN inside the metadata blob — application
code is responsible for stripping those before persisting.

## 3. `underwriting_evidence`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `document_id` | `integer NULL → underwriting_documents.id` | `SET NULL` |
| `evidence_type` | `varchar(60) NOT NULL` | `financial_metric`, `attestation`, `third_party_verification`, `bank_balance`, `enrollment_count`, `accreditation_status`, `other`. |
| `claim_key` | `varchar(120) NOT NULL` | Stable name (`fy24_total_revenue`, `ending_cash_q1`). |
| `value` | `jsonb` | Typed payload. |
| `source_locator` | `text` | Page/line/cell reference. |
| `collection_method` | `varchar(40)` | `founder_attested` / `underwriter_extracted` / `ocr` / `integration`. |
| `collected_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `verified_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `verified_at` | `timestamp` | |
| `notes` | `text` | |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `application_id`, `document_id`, `claim_key`.

## 4. `underwriting_metrics_snapshots`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `snapshot_kind` | `varchar(30) NOT NULL` | `intake`, `pre_committee`, `post_decision`, `monitoring`. |
| `source_financial_model_id` | `integer` | Plain int (not FK) so the model can be deleted without losing the snapshot. |
| `source_financial_model_version` | `integer` | Pairs with the model id (cf. `financial_models.version`). |
| `metrics` | `jsonb NOT NULL` | Wide blob keyed by metric code. |
| `notes` | `varchar(500)` | |
| `created_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `created_at` | `timestamp` | |

Indexes: `application_id`, `snapshot_kind`.

## 5. `eligibility_gate_results`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `gate_code` | `varchar(80) NOT NULL` | Canonical machine name. |
| `outcome` | `varchar(20) NOT NULL` | `pass`, `fail`, `waived`, `not_evaluated`. |
| `evaluation_details` | `jsonb` | Threshold + observed values. |
| `evidence_id` | `integer NULL → underwriting_evidence.id` | `SET NULL` |
| `policy_rule_version_id` | `integer` | Phase 3 FK; column ships now so memo reproducibility is preserved. |
| `waived_reason` | `text` | |
| `evaluated_at` | `timestamp NOT NULL DEFAULT now()` | |
| `created_at` | `timestamp` | |

Indexes: `application_id`, `gate_code`.

## 6. `audit_log`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `actor_user_id` | `integer NULL → users.id` | `SET NULL` (system actions allowed). |
| `actor_role` | `varchar(50)` | Snapshot of role at action time. |
| `entity_type` | `varchar(60) NOT NULL` | `underwriting_application`, `underwriting_document`, ... |
| `entity_id` | `integer NOT NULL` | **No FK** — history outlives the entity. |
| `action` | `varchar(30) NOT NULL` | `create`, `update`, `delete`, `status_change`, `verify`, `reject`, `waive`, `snapshot`, `decision`. |
| `before` / `after` | `jsonb` | Field-level diff; **must** be redacted of PII (storage refs, encrypted EIN refs) by application code before insert. |
| `note` | `text` | |
| `created_at` | `timestamp` | |

Indexes: `(entity_type, entity_id)`, `actor_user_id`, `created_at`.

---

# Phase 2 — design only

## 7. `borrower_entities`

The legal entity that carries the loan. One application points at zero
or one borrower entity (set on `underwriting_applications.borrower_entity_id`,
which already exists as a column for forward compatibility).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `legal_name` | `text NOT NULL` | |
| `dba_name` | `text` | |
| `entity_type` | `varchar(40) NOT NULL` | `nonprofit_501c3`, `for_profit_llc`, `for_profit_corp`, `public_charter`, `other`. |
| `state_of_formation` | `varchar(2)` | |
| `formation_date` | `date` | |
| **`ein_last_4`** | `char(4)` | Only the last four digits; raw EIN never stored. |
| **`ein_encrypted_ref`** | `text` | Opaque token into a future encryption helper (KMS / sealed-secret), not a usable ciphertext on its own. The actual ciphertext lives outside Postgres. |
| `tax_exempt_verified_at` | `timestamp` | Last successful IRS lookup. |
| `address_line1` / `address_line2` / `city` / `state` / `postal_code` | `text` / `varchar` | Mailing address. |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `entity_type`, `legal_name`.

## 8. `founder_profiles`

Per-founder data attached to an application via a join table (designed
later) so multiple founders can co-apply. Stored separately from
`users` so we never mix authentication identity with KYC data.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `user_id` | `integer NULL → users.id` | `SET NULL`; founders may exist before they sign in. |
| `legal_first_name` / `legal_last_name` | `text` | |
| `date_of_birth` | `date` | Stored, **not** indexed. |
| **`ssn_last_4`** | `char(4)` | Only the last four digits; raw SSN never stored. |
| **`ssn_encrypted_ref`** | `text` | Opaque KMS token (same pattern as `ein_encrypted_ref`). |
| `kyc_status` | `varchar(30)` | `not_started`, `pending`, `verified`, `failed`. |
| `kyc_provider_ref` | `text` | Opaque ref into the KYC vendor. |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `user_id`, `kyc_status`.

## 9. `policy_rule_versions` (Phase 3)

Versions the rule pack that produced a `gate_code` evaluation. Lets us
re-run a memo years later and see exactly which thresholds were in
effect.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `version_label` | `varchar(40) NOT NULL UNIQUE` | E.g. `2026.05.01`. |
| `effective_from` | `timestamp NOT NULL` | |
| `effective_to` | `timestamp` | NULL = current. |
| `rules` | `jsonb NOT NULL` | The rule pack. |
| `published_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `created_at` | `timestamp` | |

Indexes: `version_label` (unique), `effective_from`.

## 10. `underwriting_risk_ratings` (Phase 4)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `model_version` | `varchar(40) NOT NULL` | Risk model rev (separate from `policy_rule_versions`). |
| `composite_score` | `integer` | 0-1000 scaled. |
| `rating_band` | `varchar(20)` | `low`, `moderate`, `elevated`, `high`. |
| `factor_breakdown` | `jsonb` | Per-factor sub-scores. |
| `metrics_snapshot_id` | `integer NULL → underwriting_metrics_snapshots.id` | `SET NULL` |
| `assigned_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `assigned_at` | `timestamp NOT NULL DEFAULT now()` | |

Indexes: `application_id`, `rating_band`.

## 11. `credit_memos` (Phase 4)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `memo_version` | `integer NOT NULL DEFAULT 1` | Bumped on each save (mirrors `financial_models.version`). |
| `narrative_md` | `text NOT NULL` | Markdown body. |
| `recommended_decision` | `varchar(20)` | `approve`, `decline`, `conditional_approve`. |
| `recommended_terms` | `jsonb` | Suggested rate / term / covenants. |
| `metrics_snapshot_id` | `integer NULL → underwriting_metrics_snapshots.id` | `SET NULL` |
| `risk_rating_id` | `integer NULL → underwriting_risk_ratings.id` | `SET NULL` |
| `authored_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `application_id`.

## 12. `closing_conditions` (Phase 4)

Per-condition checklist that gates funding.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `CASCADE` |
| `condition_code` | `varchar(80) NOT NULL` | |
| `description` | `text NOT NULL` | |
| `status` | `varchar(20) NOT NULL DEFAULT 'open'` | `open`, `satisfied`, `waived`, `failed`. |
| `evidence_id` | `integer NULL → underwriting_evidence.id` | `SET NULL` |
| `due_date` | `date` | |
| `cleared_by_user_id` | `integer NULL → users.id` | `SET NULL` |
| `cleared_at` | `timestamp` | |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `application_id`, `status`.

## 13. `underwriting_decisions` (Phase 4)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial PK` | |
| `application_id` | `integer NOT NULL → underwriting_applications.id` | `RESTRICT` — committee decisions must not silently disappear. |
| `decision` | `varchar(20) NOT NULL` | `approve`, `decline`, `conditional_approve`, `withdraw`. |
| `decision_terms` | `jsonb` | Final approved terms (rate, term, covenants, fee). |
| `memo_id` | `integer NULL → credit_memos.id` | `SET NULL` |
| `risk_rating_id` | `integer NULL → underwriting_risk_ratings.id` | `SET NULL` |
| `metrics_snapshot_id` | `integer NULL → underwriting_metrics_snapshots.id` | `SET NULL` |
| `policy_rule_version_id` | `integer NULL → policy_rule_versions.id` | `SET NULL` |
| `decided_by_user_id` | `integer NOT NULL → users.id` | `RESTRICT` |
| `decided_at` | `timestamp NOT NULL DEFAULT now()` | |

Indexes: `application_id`, `decision`, `decided_by_user_id`.

---

# PII handling — summary table

| Datum | Where | Form |
| --- | --- | --- |
| EIN | `borrower_entities` | `ein_last_4` (4 chars) + `ein_encrypted_ref` (opaque KMS token). Raw EIN never in PG. |
| SSN | `founder_profiles` | `ssn_last_4` + `ssn_encrypted_ref`. Raw SSN never in PG. |
| Bank account / routing | nowhere in PG | Held by the payments processor; we store an opaque processor token outside of these tables. |
| Document bytes | nowhere in PG | App Storage; PG keeps `storage_ref` + `content_sha256`. |
| Audit diffs | `audit_log.before/after` | App code MUST redact PII fields before persisting. |
| Sessions / IPs | not in audit log | Carried by request middleware, not persisted alongside underwriting history. |

---

# Phase 1 production migration runbook

The Phase 1 migration is **additive only** (six new tables, no changes
to existing tables, no data rewrites). The plan below is what we will
execute; this task does not touch production.

## Pre-flight (operator checklist)

1. Confirm Railway plan tier still includes daily backups + PITR.
2. Confirm the API service is healthy (`curl
   https://<api-host>/api/health` returns 200, `db: connected`).
3. Capture the current migration ledger:
   `psql "$DATABASE_URL_PROD" -c "SELECT * FROM drizzle.__drizzle_migrations
   ORDER BY id"` and save the output to the deploy ticket.
4. Verify the on-disk migrations folder bundled with the API contains
   `0000_baseline` through `0005_simple_mysterio`.

## Apply

The migration runs automatically on the next API deploy via
`runMigrations()` at boot. To apply explicitly without a code deploy:

```sh
DATABASE_URL=$DATABASE_URL_PROD pnpm --filter @workspace/db run migrate
```

A successful run appends one row to `drizzle.__drizzle_migrations` with
the `0005_simple_mysterio` tag and creates the six tables + their FKs +
indexes. The migration uses `IF NOT EXISTS` and `DO ... EXCEPTION WHEN
duplicate_object` blocks, so reapplying after a partial failure is
safe.

## Verify

```sql
-- All six new tables exist:
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('underwriting_applications','underwriting_documents',
                      'underwriting_evidence','underwriting_metrics_snapshots',
                      'eligibility_gate_results','audit_log')
 ORDER BY table_name;

-- Required indexes are present:
SELECT indexname FROM pg_indexes
 WHERE schemaname='public'
   AND tablename IN ('underwriting_applications','underwriting_documents',
                     'underwriting_evidence','underwriting_metrics_snapshots',
                     'eligibility_gate_results','audit_log')
 ORDER BY indexname;

-- Existing data is intact:
SELECT count(*) FROM financial_models;  -- should match pre-flight count
SELECT count(*) FROM users;              -- should match pre-flight count
```

Then run the app-side smoke against production via a one-off job:

```sh
DATABASE_URL=$DATABASE_URL_PROD pnpm --filter @workspace/api-server run test:underwriting-schema-smoke
```

(The smoke test cleans up everything it inserts.)

## Rollback

Because the migration is additive, rollback is a single SQL file and
takes seconds:

```sql
BEGIN;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS eligibility_gate_results;
DROP TABLE IF EXISTS underwriting_metrics_snapshots;
DROP TABLE IF EXISTS underwriting_evidence;
DROP TABLE IF EXISTS underwriting_documents;
DROP TABLE IF EXISTS underwriting_applications;
DELETE FROM drizzle.__drizzle_migrations
 WHERE tag = '0005_simple_mysterio';
COMMIT;
```

Then redeploy the previous API revision (which does not import the new
schema modules). No `financial_models` data is touched at any step.

# Pre-production risk list

1. **Bundled migrations folder must include 0005.** The api-server
   build script (`build.ts`) copies `lib/db/drizzle/` next to the CJS
   bundle. If the build is run before this task is merged, the bundled
   image will not contain the new SQL and `runMigrations()` will be a
   no-op. Mitigation: the on-boot migrator logs the migration list at
   info; verify in the deploy logs after the first new boot.
2. **`runMigrations()` failure marks the service degraded.** A bad
   migration returns `migrations: failed` from `/health`, which can
   trigger an automatic restart loop in Railway. Mitigation: this
   migration is additive + idempotent, so a partial-apply failure is
   recoverable on the next boot.
3. **Connection-pool saturation during DDL.** `CREATE INDEX` is fast
   here (all tables are empty on first apply) but operators should
   still watch the API error rate for the first minute after migration.
4. **Forward FK columns without targets.** `borrower_entity_id` and
   `policy_rule_version_id` are nullable plain-int columns that point
   at tables which do not yet exist. They MUST stay nullable until the
   target tables ship; do not promote them to NOT NULL in any future
   migration without first creating the parent rows.
5. **Audit log redaction is application-side.** The schema cannot stop
   a careless `audit_log` insert from carrying a storage ref or an
   encrypted EIN reference. Code review of every audit-write site is
   the only enforcement. The smoke test asserts shape, not
   redaction — add a redaction test alongside the audit-log writer when
   it lands.
6. **Cascade radius on `underwriting_applications`.** Deleting one
   application drops every document, evidence, snapshot, and gate
   result attached to it. The route handler that exposes a delete must
   gate on status (`draft` only) and require an explicit confirmation;
   the `audit_log` row is by design the only post-delete record.
