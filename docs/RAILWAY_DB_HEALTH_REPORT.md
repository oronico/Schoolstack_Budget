# Railway DB Health Report

_Generated: 2026-05-07 (Task #605, Phase 1 underwriting schema work)._

This is the snapshot we took before extending the schema for evidence-driven
underwriting. It is intentionally narrow: connection, tables, indexes,
backups, migration plumbing, PII surface area, and the residual risks the
upcoming Phase 1 migration must respect.

## 1. Connection

- `DATABASE_URL` is set on the API service in Railway (verified via the
  Railway dashboard environment editor; not echoed here).
- Pool: `lib/db/src/index.ts` constructs a single `pg.Pool` with
  `statement_timeout=120s`, `query_timeout=120s`, and
  `idle_in_transaction_session_timeout=30s`. SSL is enabled for hosts
  matching `railway.app`, `rlwy.net`, and `neon.tech`
  (`rejectUnauthorized: false`, matching Railway's managed cert chain).
- `/api/ready` returns `200 { status: "ok", db: "connected" }` against the
  current Postgres engine; `/api/health` and `/api/healthz` add the same
  live `SELECT 1` plus the migrations status.
- Local Postgres engine in this report: PostgreSQL 16.10 (the production
  Railway plan is the same major version; verify in dashboard before any
  prod migration).

## 2. Tables present (pre-Phase 1)

```
public | error_logs
public | events
public | exports
public | feedback
public | financial_models      -- 9242 rows
public | pending_signups
public | rate_limit_hits
public | schools
public | shared_links
public | users
```

All ten tables match the Drizzle definitions under `lib/db/src/schema/`.
No drift detected: `drizzle-kit generate` against the current schema
files only produced new objects (tables 11–16 introduced by Task #605),
no `ALTER` against any existing table.

## 3. Indexes present (pre-Phase 1)

- Primary keys on every table (serial `id`).
- `users_email_unique`, `pending_signups_email_unique`,
  `shared_links_token_unique` enforce uniqueness on the credentials and
  share-link columns we look up by.
- BTREE indexes covering the existing hot paths:
  `events_user_id_idx`, `events_event_name_idx`,
  `exports_user_id_idx`, `exports_model_id_idx`,
  `financial_models_user_id_idx`, `schools_user_id_idx`,
  `shared_links_model_id_idx`, `shared_links_token_idx`,
  `rate_limit_ip_endpoint_idx` (unique).
- No covering / partial / GIN indexes are in use yet.

Gaps worth tracking (out of scope for this task):
- `error_logs` has no index on `created_at`, which the retention sweeper
  scans. Acceptable while volume is low, flag for follow-up if it grows.
- `feedback` has no `user_id` index; current admin queries are bounded by
  `created_at DESC LIMIT 100`, so it's fine for now.

## 4. Backups

- Railway's managed Postgres plan ships daily snapshots with
  point-in-time-recovery on the standard tier — confirm the project is on
  that tier in the Railway dashboard. Dev / hobby tiers do **not**
  include PITR.
- Manual restore procedure is documented in `docs/RUNBOOK_DB_RESTORE.md`
  and exercised via the restore-validation account
  (`test:restore-validation-account`).

## 5. Migration strategy

- Source of truth: `lib/db/src/schema/*.ts`.
- Generated SQL lives in `lib/db/drizzle/` and is committed.
- Application order: `runMigrations()` in `lib/db/src/index.ts` is called
  at API boot before the HTTP server starts accepting traffic; failure
  flips the `/health` migrations status to `failed` and the readiness
  check returns 503.
- We never call `db:push --force` against production. Migrations are
  applied on startup via the bundled `drizzle/` folder copied next to
  the API CJS bundle.
- Existing 0001..0004 migrations are written to be idempotent
  (`IF NOT EXISTS` on `CREATE TABLE`, `ADD COLUMN IF NOT EXISTS` on
  `ALTER TABLE`). The new 0005 migration follows the same pattern.

## 6. PII surface area today

- `users.email`, `users.password_hash` (bcrypt), `users.reset_token`
  (sha-256 of raw token, raw never persisted).
- `pending_signups` mirrors `users` for email + bcrypt'd password.
- `shared_links.token` (random opaque token).
- No SSN, EIN, bank account, or routing number columns exist.
- `error_logs.request_body` is sanitized by `stripSensitive()` (see
  `artifacts/api-server/src/app.ts` line ~214) before persistence; the
  global error handler also strips `Authorization` and `Cookie` headers
  before logging. The `/errors` ingestion route writes only a UA string
  for browser-reported errors (`routes/errors.ts` line ~71).
- No public route exposes raw DB rows: every `/api/*` handler projects
  out specific fields and JSONB blobs are filtered at the route level.

## 7. Phase 1 schema additions (Task #605)

Six tables, all new, no changes to existing tables. Full design and
rationale: `docs/FULL_UNDERWRITING_DATABASE_SCHEMA_PLAN.md`.

| Table | Why it exists | Indexes |
| --- | --- | --- |
| `underwriting_applications` | Long-lived envelope around one loan ask. | `user_id`, `status`, `school_id` |
| `underwriting_documents` | Document metadata + opaque storage refs (no bytes in PG). | `application_id`, `document_type`, `verification_status` |
| `underwriting_evidence` | Structured claims extracted from documents or attestations. | `application_id`, `document_id`, `claim_key` |
| `underwriting_metrics_snapshots` | Frozen metric blobs that pin what the credit committee saw. | `application_id`, `snapshot_kind` |
| `eligibility_gate_results` | One row per gate evaluation, references the supporting evidence. | `application_id`, `gate_code` |
| `audit_log` | Append-only mutation history across underwriting entities. | `(entity_type, entity_id)`, `actor_user_id`, `created_at` |

FK delete behavior: child rows under `underwriting_applications` use
`ON DELETE CASCADE`; user references on documents/evidence/snapshots use
`SET NULL` (history must outlive a user deletion); `audit_log` carries
**no FK on `entity_id`** so history is decoupled from the entity's
lifecycle.

Smoke test: `pnpm --filter @workspace/api-server run test:underwriting-schema-smoke`
covers create + cascade + audit + legacy `financial_models` round-trip.

## 8. Risks to flag before promoting to production

- Confirm the Railway plan tier still includes PITR before applying any
  schema migration outside a maintenance window.
- The 0005 migration is additive only, so the rollback is a single
  `DROP TABLE` per new table (see runbook in the schema plan doc). No
  existing data is rewritten.
- `runMigrations()` runs on boot. A failure surfaces via
  `/api/health` (`status: degraded`, `migrations: failed`) and 503 on
  `/api/ready`. The platform probe path `/health` will also degrade,
  which can mark the service unhealthy in Railway. Verify the deploy
  guide reflects this so we don't get an automatic restart loop on a
  bad migration.
- `drizzle/__drizzle_migrations` is the single ledger of applied
  migrations. We never edit it by hand; if the production ledger
  disagrees with the on-disk migrations, halt and call out before
  retrying.
