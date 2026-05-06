# Hands-on DB restore trial — Option A pair-live worksheet

Goal: produce real measured times for each phase of the Option A
(pg_dump + pg_restore into a fresh throwaway) restore so we can replace
the estimates in `docs/RUNBOOK_DB_RESTORE.md`.

You run the steps in order. Each step has a `t_start` and `t_end`
marker you'll capture with `date -u +%H:%M:%S`. At the end, paste the
filled-in "Results" block back to me and I'll update the runbook.

> Pre-flight: have `psql`, `pg_dump`, `pg_restore` on PATH (Postgres 16
> client recommended; matching the server major minimises warnings).
> Check: `pg_dump --version && pg_restore --version && psql --version`.
> Have the production `DATABASE_URL` ready in your shell as
> `PROD_DB_URL` (copy from Railway → API service → Variables → reveal,
> then `export PROD_DB_URL='postgres://...'`). Do **not** echo it.

---

## Phase 1 — Decide snapshot (timer: snapshot_decide)

For this trial the dump is "current prod", not a point-in-time snapshot,
so this phase is just confirming you have the right `PROD_DB_URL`.
Run:

```bash
SNAP_DECIDE_START=$(date -u +%H:%M:%S)
psql "$PROD_DB_URL" -c "select current_database(), now();"
SNAP_DECIDE_END=$(date -u +%H:%M:%S)
echo "snapshot_decide: $SNAP_DECIDE_START -> $SNAP_DECIDE_END"
```

Expected: shows the prod DB name and a current timestamp.

## Phase 2 — Provision throwaway Postgres (timer: provision)

In Railway canvas:

1. Note the wall-clock time **before** clicking, save as `PROVISION_START`
   (run `date -u +%H:%M:%S` in a terminal).
2. **+ New** → **Database** → **Add PostgreSQL**.
3. Wait for the new service tile to show `Online` (not "Deploying…").
4. Note the wall-clock time **after** Online appears: `PROVISION_END`.
5. Open the new service → **Variables** → copy `DATABASE_URL`.
6. In your shell:

```bash
export RESTORE_DB_URL='<paste>'
psql "$RESTORE_DB_URL" -c "select version();"   # should connect, empty DB
```

Record:
- `PROVISION_START` = ?
- `PROVISION_END`   = ?

## Phase 3 — pg_dump from prod (timer: dump)

```bash
DUMP_START=$(date -u +%s)
pg_dump --no-owner --no-acl --format=custom \
  "$PROD_DB_URL" > /tmp/prod.dump
DUMP_END=$(date -u +%s)
ls -lh /tmp/prod.dump
echo "dump seconds: $((DUMP_END - DUMP_START))"
```

Record:
- `dump_seconds` = ?
- `dump_size`    = ? (the human-readable size from `ls -lh`)

## Phase 4 — pg_restore into throwaway (timer: restore)

```bash
RESTORE_START=$(date -u +%s)
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname="$RESTORE_DB_URL" /tmp/prod.dump
RESTORE_END=$(date -u +%s)
echo "restore seconds: $((RESTORE_END - RESTORE_START))"
```

Expected: exits 0. A handful of `NOTICE` lines about non-existent
objects being skipped (because of `--if-exists`) is normal.

Record:
- `restore_seconds` = ?

## Phase 5 — Verify (timer: verify)

```bash
VERIFY_START=$(date -u +%s)

# 5a. Schema diff (table list)
psql "$RESTORE_DB_URL" -c "\dt" | sort > /tmp/restore-tables.txt
psql "$PROD_DB_URL"    -c "\dt" | sort > /tmp/prod-tables.txt
echo "--- schema diff (empty = identical) ---"
diff /tmp/prod-tables.txt /tmp/restore-tables.txt && echo "(identical)"

# 5b. Row counts on the restore
echo "--- row counts (restore) ---"
psql "$RESTORE_DB_URL" <<'SQL'
select 'users'            as t, count(*) from users
union all select 'schools',          count(*) from schools
union all select 'financial_models', count(*) from financial_models
union all select 'exports',          count(*) from exports
union all select 'shared_links',     count(*) from shared_links
union all select 'events',           count(*) from events
order by t;
SQL

VERIFY_END=$(date -u +%s)
echo "verify seconds: $((VERIFY_END - VERIFY_START))"
```

Record:
- `verify_seconds`  = ?
- `schema_diff`     = identical / differences (paste diff if non-empty)
- row counts: users=?, schools=?, financial_models=?, exports=?,
  shared_links=?, events=?

## Phase 6 — App boot + endpoint smoke (timer: appboot)

```bash
APPBOOT_START=$(date -u +%s)

# Terminal A — boot the API against the restore.
DATABASE_URL="$RESTORE_DB_URL" pnpm --filter @workspace/api-server run dev
# Note the PORT it logs at startup, e.g. "listening on :5050".
```

In **Terminal B** (substitute the port):

```bash
PORT=<port-from-terminal-A>

# 1. Liveness
curl -fsS "http://localhost:$PORT/healthz" && echo " OK"

# 2. Auth round-trip — only if the "DB restore validation account"
#    exists in 1Password. Otherwise skip (per runbook fallback) and
#    record below.
# curl -fsS -c /tmp/restore-cookies.txt \
#   -H 'content-type: application/json' \
#   -d '{"email":"<restore-validation@example.com>","password":"<from-1password>"}' \
#   "http://localhost:$PORT/auth/login"
# curl -fsS -b /tmp/restore-cookies.txt "http://localhost:$PORT/auth/me"
# curl -fsS -b /tmp/restore-cookies.txt "http://localhost:$PORT/models" | head

APPBOOT_END=$(date -u +%s)
echo "appboot seconds: $((APPBOOT_END - APPBOOT_START))"
```

Stop the dev server (Ctrl-C in Terminal A) once you've recorded the
numbers.

Record:
- `appboot_seconds`     = ? (from launching `pnpm dev` to /healthz 200)
- `healthz_status`      = 200 / other
- `auth_login_status`   = 200 / skipped (no validation account)
- `auth_me_email`       = <expected> / mismatch / skipped
- `models_nonempty`     = yes / no / skipped

## Phase 7 — Cleanup (timer: cleanup)

In Railway:

1. `CLEANUP_START` = `date -u +%H:%M:%S` (before clicking).
2. Open the throwaway Postgres service → **Settings** → **Delete
   service**. Confirm.
3. Verify it's gone from the canvas.
4. `CLEANUP_END` = `date -u +%H:%M:%S`.

Also locally:
```bash
rm -f /tmp/prod.dump /tmp/restore-cookies.txt /tmp/restore-tables.txt /tmp/prod-tables.txt
unset RESTORE_DB_URL PROD_DB_URL
```

Record:
- `CLEANUP_START` = ?
- `CLEANUP_END`   = ?

---

## Results — paste this filled-in block back to me

```
date_utc:                YYYY-MM-DD
operator:                <name>
prod_dump_size:          <e.g. 245 MB>

phase_times (mm:ss or seconds, your call):
  snapshot_decide:       <start -> end> total ?
  provision_throwaway:   <start -> end> total ?
  dump_seconds:          ?
  restore_seconds:       ?
  verify_seconds:        ?
  appboot_seconds:       ?
  cleanup:               <start -> end> total ?

verification:
  schema_diff:           identical / <paste diff>
  row_counts:            users=? schools=? financial_models=? exports=? shared_links=? events=?
  healthz_status:        200 / <other>
  auth_login_status:     200 / skipped (reason: ...)
  auth_me_email:         <expected> / mismatch / skipped
  models_nonempty:       yes / no / skipped

throwaway_deleted:       yes / no
notes:                   <anything weird, retries, surprises>
```

Once you paste that block back I will:
1. Replace the **Rough RTO** table in `docs/RUNBOOK_DB_RESTORE.md` with
   observed numbers (rolling the dump+restore+verify+appboot pieces into
   the matching runbook rows).
2. Append a new `hands-on` row to the **Trial restore log**.
3. Mark the task complete.
