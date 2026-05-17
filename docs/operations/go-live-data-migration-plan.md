# Go-Live Production Data Migration Plan

**Status:** Drafted for Task #930-M6 (sibling of M7 go-live gate).
**Scope:** Every schema or data-classification change merged into the
`main` dev branch since the beta started (~2026-04-29, anchored by the
beta-smoke-test task) that could affect how a pre-existing production
founder record renders, computes, or saves after the cutover.
**Authoring assumption:** prod has been running the pre-beta code path
and has NOT received any of the migrations below. Dev runs against a
clean DB and so has never proven these migrations against legacy rows.

This document is the M7 go-live gate's data-side precondition. Every
row below must either be executed in the cutover window or have an
explicit "no action required" rationale, before M7 can flip the
switch.

---

## How to read this document

For each change, the table records:

- **What** — the change in one line.
- **Affected records** — the SQL or JSON-path query that scopes the
  blast radius. Run these against prod read-replica before the cutover
  window to get a real count.
- **Approach** — one of:
  - `one-shot SQL` — a Drizzle migration file already in
    `lib/db/drizzle/` that runs via `pnpm --filter @workspace/db run
    migrate` (the Drizzle migrator is the one wired into the API
    server's boot, per Task #283).
  - `one-shot script` — a separate node/tsx script that has to be run
    explicitly (typically because it has to talk to App Storage, not
    just the DB).
  - `loader-side default` — the read path (loader, engine, or render
    code) tolerates the missing/legacy shape and substitutes a
    documented default; no DB write needed.
  - `next-edit auto-upgrade` — the loader tolerates the legacy shape
    AND the next save by the founder writes the new shape, so the
    population drains itself over time.
  - `no action` — the change does not touch any pre-existing record.
- **Rollback** — how to undo if the cutover smoke test fails. For
  `ALTER TABLE ADD COLUMN` with `DEFAULT` and `NOT NULL`, rollback is
  `ALTER TABLE DROP COLUMN`; for backfills, rollback is the inverse
  UPDATE (and we keep a copy of the pre-migration `data` blob).
- **Window** — `inline` if it runs on the API process's own startup
  (zero coordination), `pre-cutover` if it must finish before the
  Netlify deploy of the new frontend, or `during-cutover` if it
  requires the app off.

---

## 1. Schema migrations (Drizzle, `lib/db/drizzle/000[3-7]*.sql`)

All five migrations below land via the standard
`pnpm --filter @workspace/db run migrate` chain (Task #283 wired the
Drizzle migrator into the API server boot). They use `IF NOT EXISTS`
guards and are idempotent — re-running is safe.

| # | File | What | Affected records | Approach | Rollback | Window |
|---|---|---|---|---|---|---|
| 1.1 | `0003_grey_kabuki.sql` | `ALTER TABLE financial_models ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1` for Task #479 mandatory optimistic concurrency. | All rows in `financial_models`. Count: `SELECT count(*) FROM financial_models;` — the DEFAULT 1 backfills every existing row in a single statement. | `one-shot SQL` (Drizzle migrator). | `ALTER TABLE financial_models DROP COLUMN version`. Pre-cutover code does not read or write `version`, so dropping is safe if M7 is rolled back. | `inline` — Drizzle migrator runs on API boot before the server accepts traffic. |
| 1.2 | `0004_pending_signups.sql` | New table `pending_signups` for confirm-by-email signup (Task #527). | No existing rows; legacy direct-register users keep their `users` row. | `one-shot SQL` (Drizzle migrator). | `DROP TABLE pending_signups`. No legacy data lives there. | `inline`. |
| 1.3 | `0005_simple_mysterio.sql` | New underwriting-side tables (`underwriting_applications`, `documents`, `evidence`, `metrics_snapshots`, `eligibility_gate_results`, `audit_log`) for Task #605 Phase 1. | No existing rows in any of the six new tables. | `one-shot SQL` (Drizzle migrator). | `DROP TABLE` each in dependency order. None of the founder-side flows depend on these tables. | `inline`. |
| 1.4 | `0006_coach_surface_overrides.sql` | New table `coach_surface_overrides` for admin snooze/retire (Task #430). | No existing rows. | `one-shot SQL` (Drizzle migrator). | `DROP TABLE coach_surface_overrides`. The coach-surface read path falls back to "no override" when the table is empty or missing — the Task #430 implementation was written that way precisely so the migration is reversible. | `inline`. |
| 1.5 | `0007_friendly_thunderbolt.sql` | New tables `borrower_entities` and `founder_profiles` for Task #620 Phase 2 underwriting / KYC. | No existing rows. | `one-shot SQL` (Drizzle migrator). | `DROP TABLE` in dependency order. Founder-side wizard does not reference these. | `inline`. |

**Notes:**

- The five migrations are independent of one another and of the JSON
  blob changes in §3. They are all `ADD`/`CREATE` operations — none
  drop or rename a column on an existing populated table, so there is
  no risk of data loss.
- 0003 is the only one that touches an existing populated table
  (`financial_models`). The `DEFAULT 1 NOT NULL` clause backfills
  every existing row in a single statement; no separate backfill is
  needed. Pre-cutover code paths that do not pass `If-Match` will
  begin getting `428 Precondition Required` after the API redeploy —
  the Vite frontend bundle already sends `If-Match` in autosave
  (Task #479), so any non-cutover client (an old tab) is the only
  source of 428s.

---

## 2. App Storage migration (Task #729 — drop legacy inline-base64 evidence)

This is the only change that requires a separate operator-run script
rather than a self-contained DB migration. It must finish BEFORE the
API redeploy that contains the dropped readers.

| Item | Value |
|---|---|
| **What** | Walk every `financial_models` row, find any `data.assumptionConfidence[*].evidenceFiles[*].dataBase64` payload, upload the bytes to App Storage via the Replit sidecar signed-PUT flow, and replace the inline payload with an `/objects/uploads/<uuid>` `objectPath`. Task #729 then dropped the back-compat reader from the lender packet, the wizard schema, the OpenAPI, and the assumption registry — so leaving inline payloads in place after the redeploy means those files become invisible. |
| **Script** | `scripts/src/migrate-inline-evidence.ts`, runnable as `pnpm --filter @workspace/scripts run migrate:inline-evidence`. |
| **Affected records** | The script has **no dry-run mode** (see "Coordination" below), so size the blast radius before invoking it with a read-only query against the prod read-replica: `SELECT count(*) FROM financial_models WHERE data::text LIKE '%"dataBase64":%';` (rough — uses the JSON marker rather than a structured path). The script itself only emits `scanned / migrated / skipped` totals at the end of a real execute run; there is no preview pass. |
| **Approach** | `one-shot script`. The script is idempotent on retries: rows with no inline payloads are skipped, rows already carrying both `objectPath` and a redundant inline copy just get the inline copy stripped, rows with only inline payloads get the bytes uploaded and the path swapped in. A failed individual file upload leaves that file untouched and the rest of the row continues. |
| **Rollback** | Two options. (a) If the redeploy has not yet happened, just don't run the script — the pre-redeploy code still reads inline. (b) If the redeploy is live and the script has run but evidence is now mis-rendering, restore the `financial_models` table from the most recent daily Railway snapshot per `docs/RUNBOOK_DB_RESTORE.md` (estimated 40–65 min RTO, ≤24h RPO). There is no in-place "re-inline" reverse migration — the bytes now live in the bucket. |
| **Window** | `pre-cutover` — run against prod within the cutover window but BEFORE the API redeploy that removes the inline readers. The script is safe to run live: it reads + writes one row at a time and never holds a long lock. Estimated runtime on prod is bounded by the bucket upload latency × number of evidence files; expect single-digit minutes for the current beta population. |
| **Coordination** | Operator must have App Storage write access (the Replit sidecar token, i.e. run from a Replit shell where `http://127.0.0.1:1106` is reachable and `PRIVATE_OBJECT_DIR` is set) and a `DATABASE_URL` pointing at prod. **The script writes immediately on every row that needs migrating — there are no `--dry-run` / `--execute` flags.** Verify the row count with the SQL query in "Affected records" first; if the count is wildly off expectations, stop and investigate before invoking the script. The orphan-uploads sweeper (`docs/operations/orphan-uploads-sweeper.md`) will pick up any uploads from a failed mid-script crash on its next 24h tick — no manual cleanup needed. If true dry-run behaviour is wanted before M7, add it as a follow-up to the script (a `--dry-run` flag that short-circuits the `db.update(...)` calls and just logs counters); this plan does not assume it exists. |

---

## 3. Persisted JSON shape changes (loader-side defaults, no DB writes)

These are changes to the shape of the JSON blob stored in
`financial_models.data`. None of them require a DB write: in every
case the read path (assumption registry, decision engine, packet
builder) tolerates the legacy shape and substitutes a documented
default. The population then drains itself via `next-edit
auto-upgrade` whenever a founder saves the model.

The reason this works without a migration is that
`financial_models.data` is an opaque `jsonb` blob to the DB — Drizzle
does not enforce a shape on it — so "adding a field" is a code-side
concern only.

| # | Task | Field(s) added/changed | Loader fallback | Risk if loader is buggy |
|---|---|---|---|---|
| 3.1 | #925 (scholarship/discount as percent vs raw value) | `RevenueRow.driverType = "percent_of_base"` with `percentBase`. The fix was that the renderer in `artifacts/api-server/src/lib/packets/build-packet-data.ts` now formats `percent_of_base` rows as `"8.0% of gross tuition"` instead of `"$8"`. The calculation engine already handled `driverType` correctly pre-beta. | Loader uses the row's existing `driverType` discriminator; the renderer branches on it. Rows without `driverType` (very old shape) fall through to USD rendering, which is the legacy behaviour — so the bug class only appears on rows whose `driverType` was already `percent_of_base` and whose renderer hadn't been updated. | Renders `$8` for any beta-era scholarship row that was saved with `driverType=percent_of_base` but never re-opened. Founder-visible cosmetic; no DSCR or engine impact (engine already computed correctly). |
| 3.2 | #927 (voucher / per-pupil reclassification) | **No persisted change.** Option 2 in `.local/tasks/task-927.md` shipped a Risk Framing PacketInsight rendered above the Revenue Quality table when Y1 policy-dependent revenue ≥ 50%. The bucket classification (`policy_dependent`) is computed at render-time from `category`, not stored. | N/A — pure rendering. | None. The framing is recomputed on every packet build. |
| 3.3 | #613 (Revenue Quality classification + rollup) | Optional `RevenueRow.revenueQuality?: RevenueQuality` enrichment field. | `inferRevenueQuality()` in `lib/finance/src/revenue-quality.ts` recomputes from `category` and `name` on every read. Missing field → standard inferred bucket. | None — inference is deterministic from existing fields. |
| 3.4 | #611 (founder-comp normalization) | New `reportedFounderComp: number[]` and `normalizedFounderComp: number[]` on the staffing block. | Legacy `founderSalary` scalar reader still works; `extractAssumptionValues` falls back through `normalized → reported → legacy founderSalary`. | None — fallback chain is exercised by `demo-math-smoke`. |
| 3.5 | #623 (split interest/principal on guest debt) | New `isLoan`, `loanPrincipal`, `loanRate`, `loanTermYears` on debt rows. | Engine continues to honour legacy `flatAnnualDebtService` rows (pre-beta shape). | None — legacy flat-service rows are still supported per the regression in `artifacts/api-server/tests/flat-debt-split.ts`. |
| 3.6 | #659 (Assumptions Confidence layer) | New `confidence`, `evidenceNote`, `evidenceFiles` on assumption registry entries. | Missing `confidence` → UI treats as `"estimate"` (the lowest tier). Missing `evidenceFiles` → empty array. | None visible — confidence-bar will simply show the lowest tier on legacy rows, which is the safer default. |
| 3.7 | #610 (restricted-cash exclusion from runway) | Optional `RevenueRow.isRestricted?: boolean`. | Engine infers restricted status from row-id prefix (`restricted_`) when undefined; legacy rows with no prefix are treated as unrestricted (the pre-beta default). | None — engines's inference matches pre-beta behaviour for unprefixed rows. |

**Cross-cutting verification query.** After the cutover the API can
be smoke-tested per-row by simply hitting `GET /api/models/:id` on a
handful of pre-beta-era IDs and confirming `/api/models/:id/consultant`
and `/api/models/:id/summary` both return without throwing. The
math-integrity harness from M5 (`api-server/tests/math-integrity-
harness.ts`) does this against the bundled persona fixtures on every
CI run, so as long as the M5 harness is green the loader fallback
matrix above is exercised.

---

## 4. Out-of-scope changes (intentional, listed for completeness)

The following were considered and explicitly require **no** action in
the go-live window:

- **Migrations 0000–0002** — baseline + pre-beta. Already live in
  prod.
- **API-spec changes** (Tasks #480, #707, #714, #745, #733, #660,
  #659, #616, #630, #623, #611, #613, #601, #527) — wire-shape only;
  none of these alter the on-disk DB or the persisted `data` blob in
  a way that would invalidate a pre-existing row. The OpenAPI codegen
  is consumed by the React Query client, not by the database, and the
  loader-side defaults in §3 cover the few cases where a previously-
  optional field became a tightened type.
- **Coach-tone / copy refreshes** (Tasks #148, #748, etc.) — strings
  only; no schema, no classification.
- **Account / accounting-tool integrations** (Tasks #230, #240, #299,
  the dropped Xero/QB live integration) — these touch the accounting-
  import flow, which is gated by founder action; no in-flight rows
  exist in prod for the new shape.

---

## 5. Cutover sequence (hand-off to M7)

The go-live gate (Task #930-M7) should execute this in order. Each
step has an explicit "stop and roll back" condition.

1. **Take a fresh Railway snapshot** of the prod Postgres add-on.
   This is the rollback floor — keep it for ≥7 days. RTO 40–65 min,
   RPO ≤24h, per `docs/RUNBOOK_DB_RESTORE.md`.
2. **Size §2's blast radius with the read-only count query**
   (`SELECT count(*) FROM financial_models WHERE data::text LIKE
   '%"dataBase64":%';` against the prod read-replica). The
   `migrate-inline-evidence.ts` script has no dry-run mode — every
   invocation writes — so this query is the only safe preview. Stop
   if the count is wildly different from the beta-era expectation;
   that's a sign the marker query misclassified rows or someone
   already ran the migration.
3. **Run §2 for real:** `pnpm --filter @workspace/scripts run
   migrate:inline-evidence` from a Replit shell with `DATABASE_URL`
   pointing at prod and `PRIVATE_OBJECT_DIR` set. Watch the final
   `scanned / migrated / skipped` summary line and any per-file
   upload error logs; failures leave the offending file untouched
   and the script continues, so a non-zero failure count means
   either the sidecar token expired or the bucket is misconfigured.
   Fix and re-run — the script is idempotent.
4. **Redeploy the API server.** §1 (Drizzle migrations 0003–0007)
   runs inline on boot before the server accepts traffic. The boot
   log will show each `IF NOT EXISTS` no-op or apply line; abort the
   redeploy and roll back via Railway if any migration errors.
5. **Redeploy the Netlify frontend.** The bundle now sends `If-Match`
   on autosave (per Task #479) so the new `version` column gate
   doesn't 428 founders.
6. **Smoke-test §3 loader fallbacks.** Pull three pre-beta model IDs
   (one per persona equivalent), hit `/api/models/:id`,
   `/api/models/:id/consultant`, `/api/models/:id/summary` and
   `/api/models/:id/export/lender-packet`. None should 5xx; the
   scholarship row from #925 should render as `"X.X% of gross tuition"`
   not `"$X"`.
7. **Announce in `#incidents`** and unfreeze writes. Keep the pre-
   cutover Railway snapshot for at least 7 days before deleting.

If any step 2–6 fails, roll back the API + frontend deploys via the
"Rollback Procedure" section of `docs/DEPLOYMENT_GUIDE.md` (Railway
Deployments → previous deploy → Rollback; Netlify Deploys → previous
deploy → Publish), then restore the DB from the step-1 snapshot per
`docs/RUNBOOK_DB_RESTORE.md`. No partial state is observable to
founders during steps 4–5 because the API does not accept traffic
until the migrations complete.

---

## 6. Founder-facing communication

None of the changes in this plan are user-visible breaking changes:

- §1 migrations are additive (new columns/tables); founders see no
  change.
- §2 inline-evidence migration is invisible to the founder — the
  evidence files still appear in the same place in the wizard and in
  packets; only the storage path changes.
- §3 loader fallbacks render legacy rows the same way they rendered
  pre-beta (the worst case is the #925 scholarship-PCT cosmetic, which
  is a fix, not a regression).

Therefore **no founder email or status-page notification is required**.
The cutover window can be quiet. If the cutover does require a brief
write-freeze (depends on the redeploy strategy at M7), a single
"maintenance for ~10 min" status-page line is sufficient.

---

## See also

- `docs/RUNBOOK_DB_RESTORE.md` — rollback procedure if any step fails.
- `docs/DEPLOYMENT_GUIDE.md` — Railway/Netlify redeploy and rollback
  topology.
- `docs/operations/orphan-uploads-sweeper.md` — picks up any uploads
  left behind by a mid-script crash in §2.
- `.local/tasks/task-925.md`, `.local/tasks/task-927.md` — original
  classification-change tasks called out by name in the M6 brief.
- `lib/db/drizzle/0000_baseline.sql` through `0007_friendly_thunderbolt.sql`
  — the full Drizzle migration history.
- `scripts/src/migrate-inline-evidence.ts` — the §2 script.
