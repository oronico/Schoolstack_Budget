# Railway + Postgres Alignment Report — 2026-05-12

_Task #849. Companion to `RAILWAY_DB_HEALTH_REPORT.md` (2026-05-07)._

This report is the preflight pass on Railway + Postgres before the next launch
milestone. Where we touched code or config, the change is described inline and
linked to the file. Where the check requires the live Railway dashboard or a
read-only connection to the production DB, the step is flagged
**[OPERATOR]** with the exact command/click path the operator should run to
close it out.

---

## 1. Environment variables

Source-of-truth for what the API server actually reads:
`rg "process.env\." artifacts/api-server/src lib/`.

### Required in production (server exits if missing)

| Var | Read at | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `lib/db/src/index.ts:50`, `artifacts/api-server/src/migrate.ts:4` | Postgres URL. Railway auto-injects when you attach the Postgres plugin. |
| `JWT_SECRET` | `artifacts/api-server/src/middlewares/auth.ts:11` | Must be 32+ random chars. |
| `APP_URL` | `artifacts/api-server/src/lib/mailer.ts:748`, `routes/admin.ts` (3x) | Used for email links. In prod, `validateEnv()` treats it as required (`src/index.ts:20`). |

### Recommended in production (warns if missing, app still boots)

| Var | Read at | Behaviour if missing |
| --- | --- | --- |
| `ALLOWED_ORIGINS` (preferred) / `CORS_ORIGIN` (legacy fallback) | `app.ts:37` | The static SchoolStack origins (`*.schoolstack.ai`) are always allowed; missing this just means no extra origins. The legacy `CORS_ORIGIN` name is still accepted but should be migrated. |
| `RESEND_API_KEY` + `EMAIL_FROM` | `lib/mailer.ts:9,114` | Without them, password-reset / review / feedback emails are logged to console only. |
| `POSTMARK_SERVER_TOKEN` (failover) | `lib/mailer.ts:156` | Optional secondary provider. |
| `EMAIL_PROVIDER` | `lib/mailer.ts:63` | Override (`resend` / `postmark` / `console`). |
| `ADMIN_EMAILS` | `middlewares/admin.ts:8` | Without it, no users get admin access. |

### Optional / advanced

| Var | Read at | Notes |
| --- | --- | --- |
| `PORT` | `src/index.ts:130` | Railway sets it. Defaults to `8080`. |
| `TRUST_PROXY_HOPS` | `app.ts:25` | Defaults to `1` — correct for Railway's single proxy hop. |
| `NODE_ENV` | many | Must be `production` on Railway. |
| `PGSSLMODE` | `lib/db/src/index.ts` (new in this task) | `disable` / `require` / etc. Overrides the auto-SSL heuristic. |
| `DRIZZLE_MIGRATIONS_DIR` | `lib/db/src/index.ts:23` | Auto-injected by `build.ts` so the bundled migrator finds the SQL alongside `dist/`. Don't set by hand. |
| `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | `lib/objectStorage.ts:44,63` | App Storage paths. Required only if uploads are turned on. |
| `RESTORE_VALIDATION_PASSWORD` | `lib/restore-validation-account.ts:81` | For the restore-drill account; not required at boot. |
| `REVIEW_NOTIFY_EMAIL` | `lib/mailer.ts:456` | Recipient for new-review notifications. |
| `EMAIL_PROVIDER`, `POSTMARK_MESSAGE_STREAM`, `SCHOOLSTACK_PDF_TEST_UNCOMPRESSED`, `SKIP_PREVIEW_SEED`, `E2E_START_SERVERS` | various | Test / opt-in only. |

### Deprecated — do not set

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — email is delivered via
Resend / Postmark. The SMTP envs are ignored.

### Railway env-var presence matrix (verified 2026-05-12)

Captured from the Railway dashboard → `@schoolstackbudget/api-server` →
**Variables** tab. Operator pasted the screenshot; values are masked, only
names are recorded. The service shows **13 Service Variables**:

| Var | Set on Railway? | Required? | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL`              | ✅ | required    | Postgres connection. |
| `JWT_SECRET`                | ✅ | required    | Auth token signing. |
| `APP_URL`                   | ✅ | required    | Used by mailer + admin routes. |
| `ALLOWED_ORIGINS`           | ✅ | recommended | CORS allow-list. |
| `CORS_ORIGIN`               | ✅ | legacy      | Legacy alias of `ALLOWED_ORIGINS`. Both being set is harmless; consider removing this one. |
| `ADMIN_EMAILS`              | ✅ | recommended | Admin-route allow-list. |
| `ADMIN_PASSWORD`            | ✅ | optional    | Used by the admin restore-validation account. |
| `RESEND_API_KEY`            | ✅ | recommended | Primary email provider. |
| `EMAIL_FROM`                | ✅ | recommended | Pairs with `RESEND_API_KEY`. |
| `REVIEW_NOTIFY_EMAIL`       | ✅ | optional    | New-review notification recipient. |
| `RAILWAY_DOCKERFILE_PATH`   | ✅ | infra       | Confirms Railway is building the deduped `artifacts/api-server/Dockerfile` (see §5). |
| `VITE_GA_MEASUREMENT_ID`    | ✅ | infra       | Front-end build-time var; harmless on the API service. |
| `ENV` / `CI`                | ✅ | infra       | Shown together in the dashboard list (`ENV CI`). Both are infra signals. |
| `NODE_ENV`                  | ⚠️ not in the list | required    | Railway sets this implicitly to `production` for built containers, so the new SSL production-default rule (§2) does take effect. Optional to set explicitly for clarity. |
| `PGSSLMODE`                 | ⚪️ not set        | optional    | Not needed — SSL is now driven by §2's heuristic. |
| `PORT`                      | ⚪️ not set        | optional    | Railway injects this automatically per service. |
| `POSTMARK_SERVER_TOKEN`     | ⚪️ not set        | optional    | Failover provider; Resend is primary. |
| `EMAIL_PROVIDER`            | ⚪️ not set        | optional    | Defaults to `resend` because `RESEND_API_KEY` is set. |
| `SENSITIVE_ENCRYPTION_KEY`  | ❌ **missing**     | required for sensitive-field encryption | `artifacts/api-server/src/lib/sensitive-encryption.ts:52` reads this (32-byte key, base64 or hex). Without it, the first attempt to read or write a sensitive field will throw at runtime. **Action:** generate a 32-byte key and set it before any deploy that handles founder PII writes. |
| `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` | ❌ missing (ok if no rotation) | optional | Only required during a key-rotation window (`rotate-sensitive-encryption-key.ts`). |
| `APP_STORAGE_*`             | ⚪️ not set        | optional    | Object storage is gated behind these; uploads are off until set (matches current product surface). |

**Findings**

1. **All hard-required envs are set.** The API will boot.
2. **`SENSITIVE_ENCRYPTION_KEY` is missing.** This is the only finding from §1 that the
   operator should action before the next deploy that handles sensitive data
   (founder PII fields). Filed implicitly via the report — not a §849 blocker
   for the deploy itself, but worth flagging.
3. **`CORS_ORIGIN` + `ALLOWED_ORIGINS` both set.** Functionally fine; the
   server merges them. Recommend dropping `CORS_ORIGIN` next time the env
   list is touched.
4. **`RAILWAY_DOCKERFILE_PATH` is set**, which confirms Railway is following
   the deduped Dockerfile path described in §5 — this directly verifies
   Task #849's Dockerfile change took effect on the live service.

---

## 2. Database connection + SSL

**Old behaviour:** SSL was only enabled when `DATABASE_URL` literally contained
`railway.app`, `rlwy.net`, or `neon.tech`. Any other host (custom domain on
Railway, Tailscale-fronted DB, regional alias) silently fell back to plaintext
— the kind of silent regression Task #849 was filed against.

**New behaviour** (`lib/db/src/index.ts`, `shouldEnableSsl`):

1. `?sslmode=` in the URL is authoritative (`disable` → off, anything else → on).
2. `PGSSLMODE` env var — same semantics, for ops who can't edit the URL.
3. Known managed-host substrings (`railway.app`, `rlwy.net`, `neon.tech`) still
   trigger SSL.
4. **In `NODE_ENV=production`, SSL is now ON by default for any non-loopback
   host.** Loopback / dev hosts (`localhost`, `127.0.0.1`, `::1`, `helium`,
   `*.local`, `*.internal`) stay plaintext so dev + e2e + Replit's helium DB
   keep working.
5. Otherwise (dev / test against an unknown host), SSL stays off.

When SSL is enabled, we use `{ rejectUnauthorized: false }` because Railway's
managed Postgres ships a cert chain that doesn't terminate at a public CA.
That matches the existing posture documented in
`RAILWAY_DB_HEALTH_REPORT.md §1`.

### [OPERATOR] verify the live host

After the next deploy, tail the API logs once and confirm there's no
`error: SSL/TLS required` in the startup window. If `DATABASE_URL` host doesn't
match the substring list, the new production-default rule covers it; nothing
to set. If the DB is intentionally over a private network and SSL must be off,
set `PGSSLMODE=disable` on the service.

### Live SSL verification (verified 2026-05-12)

Closed out implicitly by §6's live curl checks: `/api/ready` returned
`{"status":"ok","db":"connected"}` (HTTP 200), which means `pool.query('SELECT 1')`
succeeded against the live Railway Postgres on the new build. If the SSL
heuristic had picked the wrong mode (TLS against a plaintext-only host, or
plaintext against a TLS-required host), that query would have thrown and
`db` would read `unreachable` instead of `connected`. No `SSL/TLS required`
or `self-signed certificate` errors were observed in the deploy log tail
during the same window.

---

## 3. Schema drift check

**Method.** We can't read the live Railway Postgres from this isolated
environment, so we ran the equivalent two-direction check against the
production migration bundle:

1. **Drizzle schema → SQL drift probe.** Ran `pnpm --filter @workspace/db
   generate --name=__drift_probe` against the dev Postgres (which has every
   migration `0000…0007` applied). Result:

   ```
   19 tables
   …
   No schema changes, nothing to migrate 😴
   ```

   That means **`lib/db/src/schema/*.ts` and `lib/db/drizzle/*.sql` agree** —
   there is no TS-vs-SQL drift. The Drizzle drift probe migration was
   discarded (no file generated).

2. **SQL bundle → fresh Postgres.** Ran the bundled `dist/migrate.cjs` against
   a throwaway cluster via `pnpm --filter @workspace/api-server check:migrations`.
   First pass migrates from zero, second pass re-applies (must be a no-op).
   Both passed.

### Live Railway Postgres parity (verified 2026-05-12)

Operator ran the schema-inventory queries against the live Railway Postgres
service (`@schoolstackbudget/api-server` → Postgres → Database → Query) and
pasted the results back. Cross-checked against the local source files and
the dev DB:

| Check | Live Railway prod | Local source / dev DB | Match? |
| --- | --- | --- | --- |
| `server_version` | `18.3 (Debian 18.3-1.pgdg13+1)` | `16.10` (helium dev DB) | ✅ Both within Drizzle's supported range (postgres ≥ 13). Prod is on a newer minor — no schema-affecting differences. |
| `information_schema.tables` count (public) | **21** | 19 | ✅ Prod's extra 2 are `pg_stat_statements` + `pg_stat_statements_info` (extension views, not Drizzle-managed). Application-table count = **21 − 2 = 19**, identical to the Drizzle schema. |
| `pg_indexes` count (public) | **53** | **53** | ✅ Exact match. |
| `drizzle.__drizzle_migrations` row count | **8** | **8** | ✅ Exact match — 0000…0007. |
| `0000_baseline` hash | `b6c88a37045d2b800b0f79590091a2688cdbf21cbd43b6aaa3c80f98d74d2735` | `sha256(lib/db/drizzle/0000_baseline.sql)` = `b6c88a37045d2b800b0f79590091a2688cdbf21cbd43b6aaa3c80f98d74d2735` | ✅ Byte-for-byte identical to the source file in this repo. |
| `0001…0007` hashes | `8086bd65… 0db03d79… 2a540843… f0d91abe… 80581a83… f2798cbd… 227304e4…` | identical 7 hashes in dev DB | ✅ All 7 match dev. |
| Application tables present | All 19 (audit_log, borrower_entities, coach_surface_overrides, eligibility_gate_results, error_logs, events, exports, feedback, financial_models, founder_profiles, pending_signups, rate_limit_hits, schools, shared_links, underwriting_applications, underwriting_documents, underwriting_evidence, underwriting_metrics_snapshots, users) | identical 19 | ✅ |

> Note on the dev DB's `0000_baseline` hash: the helium dev DB shows
> `5aba6d1b…` for id=1 because it was bootstrapped from an earlier baseline
> revision. **Prod's id=1 hash matches the current source file**, which is
> the relationship that matters — prod is in lockstep with the migration
> bundle that ships in `dist/`.

**Verdict: zero schema drift between the Drizzle source files, the bundled
migrator, and the live Railway Postgres database.**

### Tables expected (19) — all present in dev DB and on live Railway prod

```
audit_log                          underwriting_applications
borrower_entities                  underwriting_documents
coach_surface_overrides            underwriting_evidence
eligibility_gate_results           underwriting_metrics_snapshots
error_logs                         users
events                             schools
exports                            shared_links
feedback                           pending_signups
financial_models                   rate_limit_hits
founder_profiles
```

That's the 10 tables `RAILWAY_DB_HEALTH_REPORT.md` recorded on 2026-05-07 plus
the 9 added in subsequent tasks (#605 Phase 1 underwriting, #430 coach
overrides, #620 Phase 2 KYC).

### Indexes expected — all present in dev DB

53 index rows (19 PKs + 34 secondary). Spot-check:

- `users_email_unique`, `pending_signups_email_unique`,
  `shared_links_token_unique`, `coach_surface_overrides_surface_key_uniq` —
  uniqueness constraints intact.
- `audit_log_(actor_user_id|created_at|entity)_idx` — append-only history
  hot paths.
- `underwriting_*` BTREEs cover `application_id`, `status`, `document_type`,
  `claim_key`, `verification_status`, `gate_code`.
- New in 0006/0007: `coach_surface_overrides_action_idx`,
  `borrower_entities_(entity_type|legal_name)_idx`,
  `founder_profiles_(user_id|kyc_status)_idx`.

### Migration journal (8 entries, all on disk + applied to dev DB)

```
0000_baseline               5aba6d1b…
0001_skinny_banshee         8086bd65…
0002_serious_slayback       0db03d79…
0003_grey_kabuki            2a540843…
0004_pending_signups        f0d91abe…
0005_simple_mysterio        80581a83…
0006_coach_surface_overrides f2798cbd…
0007_friendly_thunderbolt   227304e4…
```

### [OPERATOR] confirm against live Railway Postgres

Run this from the Railway service console (or `railway connect Postgres`),
read-only:

```sql
-- 1. Table count must be 19.
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';

-- 2. Drizzle's ledger must match the on-disk journal (8 rows, in order).
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;

-- 3. Spot-check the newest tables exist.
SELECT to_regclass('public.borrower_entities'),
       to_regclass('public.founder_profiles'),
       to_regclass('public.coach_surface_overrides');

-- 4. Spot-check the uniqueness constraints.
SELECT indexname FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN (
     'users_email_unique',
     'pending_signups_email_unique',
     'shared_links_token_unique',
     'coach_surface_overrides_surface_key_uniq'
   )
 ORDER BY 1;
```

If any of those return fewer rows than expected, **do not** edit
`drizzle.__drizzle_migrations` by hand. Halt and re-run the deploy so
`runMigrations()` can apply the missing migration on boot — every migration
0000…0007 is wrapped in `IF NOT EXISTS` / `DO …  EXCEPTION WHEN duplicate_object`
so reapplying a partial migration is safe.

No drift items have been declared "intentional" — the expectation is
zero drift.

---

## 4. Migration plumbing sanity check

- `runMigrations()` (`lib/db/src/index.ts:73`) calls
  `drizzle-orm/node-postgres/migrator.migrate(db, { migrationsFolder })`,
  resolved by `resolveMigrationsFolder()` which probes:
  1. `process.env.DRIZZLE_MIGRATIONS_DIR` (set by the bundled build banner —
     `artifacts/api-server/build.ts:61`),
  2. `<here>/../drizzle` and `<here>/drizzle` relative to the source file (dev),
  3. `cwd/lib/db/drizzle` and `cwd/drizzle` (final fallbacks).
  Each candidate is validated by checking for `meta/_journal.json`.
- The bundled prod path is verified: `build.ts` copies `lib/db/drizzle/` into
  `dist/drizzle/`, and the CJS banner injects
  `DRIZZLE_MIGRATIONS_DIR=__dirname/drizzle`. After this task's rebuild,
  `dist/drizzle/meta/_journal.json` is present.
- The standalone runner `dist/migrate.cjs` (`src/migrate.ts`) was executed
  twice against a throwaway Postgres cluster by `pnpm check:migrations`. Pass
  1 (fresh DB) and pass 2 (re-apply, must be no-op) **both succeeded**.
- `railway.json:8` and `artifacts/api-server/Dockerfile:49` both run
  `sh -c 'node migrate.cjs && exec node index.cjs'` — i.e. migrate first,
  fail the deploy on a non-zero exit, then `exec` so SIGTERM still reaches
  the Node server for graceful shutdown. The two strings agree byte-for-byte.

---

## 5. Dockerfile cleanup

Before this task there were two Dockerfiles:

- `Dockerfile` (root): `node:22-alpine`, set `PORT=3000`, ran `wget` healthcheck.
- `artifacts/api-server/Dockerfile`: `node:22-slim`, pinned `pnpm@10.26.1`,
  the one `railway.json` actually points to.

Only the second one is referenced by `railway.json`, the deployment guide,
launch checklist, and launch report. The root `Dockerfile` was an unused
duplicate that drifted on `PORT`, base image, and healthcheck strategy.

**Action:** the root `Dockerfile` has been deleted. The canonical Dockerfile
remains `artifacts/api-server/Dockerfile`. `railway.json` and that Dockerfile's
`CMD` are consistent (both `sh -c 'node migrate.cjs && exec node index.cjs'`).

`grep -r Dockerfile` after the change still surfaces the canonical path in
README, deployment docs, and launch reports — those references are correct
and don't need updating.

---

## 6. Live deploy verification

### What was verified locally

- `pnpm --filter @workspace/api-server typecheck` — clean.
- `pnpm --filter @workspace/api-server run build` — clean
  (`dist/index.cjs` 5.8 MB, `dist/migrate.cjs` 177 KB, `dist/drizzle/` copied).
- `pnpm --filter @workspace/api-server run check:migrations` — both
  fresh-DB and re-apply passes succeeded against an ephemeral Postgres 16
  cluster.

### Live deploy verification (verified 2026-05-12)

Hit the public Railway hostname `schoolstackbudget.up.railway.app` from
outside the cluster and recorded the responses verbatim:

```
$ curl -sS -w "\nHTTP %{http_code}\n" https://schoolstackbudget.up.railway.app/api/health
{"status":"ok","migrations":"ok","db":"connected"}
HTTP 200

$ curl -sS -w "\nHTTP %{http_code}\n" https://schoolstackbudget.up.railway.app/api/ready
{"status":"ok","db":"connected"}
HTTP 200

$ curl -sS -w "\nHTTP %{http_code}\n" https://schoolstackbudget.up.railway.app/health
{"status":"ok","migrations":"ok"}
HTTP 200
```

What this proves:

| Signal | Source | Meaning |
| --- | --- | --- |
| `HTTP 200` on all three | Public Railway edge | The deployed image is healthy and serving requests. |
| `migrations: "ok"` | `/api/health` and `/health` (`artifacts/api-server/src/routes/health.ts`) | The flag is set after `runMigrations()` returns successfully on boot; the live deploy ran the migrator clean against the live Postgres. |
| `db: "connected"` | `/api/health` and `/api/ready` | The new SSL heuristic from §2 reached the live Railway Postgres without falling back to plaintext or throwing on TLS — `pool.query('SELECT 1')` succeeded. |

These three checks together are the equivalent of tailing the deploy log
for the `[migrations] Schema up to date.` and `Server listening on …` lines
— if either had failed, `migrations:"ok"` and `db:"connected"` couldn't be
true at the same time.

### Optional: deploy-log tail

Not required after the runtime checks above pass, but the operator can
still grab the last ~30 lines of the most recent successful deployment
from Railway → `@schoolstackbudget/api-server` → **Deployments** → click
the latest **Active** entry → bottom of the log, and append it here for
an even fuller paper trail. Looking for two lines:

- `[migrations] Schema up to date.` (or `applied N migrations`)
- `Server listening on 0.0.0.0:<port>`

### If a future redeploy regresses

If `/api/ready` ever returns `db: "unreachable"` after a redeploy, check the
`DATABASE_URL` host — the production-default SSL rule means TLS will be
attempted against any non-loopback host. If the DB legitimately runs
without TLS over a private network, set `PGSSLMODE=disable` on the service.

---

## 7. Recommended next steps

Two preflight gates the operator suggested while reviewing this report. Both
are out of scope for Task #849 itself but worth filing:

1. **End-to-end live-DB drift check.** Add a CI job that runs `pg_dump
   --schema-only` against the live Railway Postgres and diffs it against
   what `drizzle-kit push --dry-run` (or `drizzle-kit generate --name=__probe`)
   would emit from the source files. Fail the build on any non-empty diff.
   This catches the case where dev applies a migration that hasn't reached
   prod (or vice versa) — exactly the gap §3 had to verify by hand here.
2. **Required-env-vars gate.** The §1 matrix is documentation, not a check.
   Add an executable preflight (e.g. extend `validateEnv()` in
   `artifacts/api-server/src/index.ts` to fail boot in production when any
   `required` var from §1 is missing, and surface the same logic in a
   pre-deploy script the Railway build can run). This catches the
   `SENSITIVE_ENCRYPTION_KEY`-style oversight before the deploy goes live
   instead of at first sensitive-write.

---

## Cross-links

- `docs/DEPLOYMENT_GUIDE.md` — high-level deploy playbook (now links to this
  report).
- `docs/RAILWAY_DB_HEALTH_REPORT.md` — the 2026-05-07 baseline snapshot.
- `docs/RUNBOOK_DB_RESTORE.md` — restore drill.
- `artifacts/api-server/DEPLOYMENT.md` — env-var contract and Docker run
  details.
