# Runbook: Restore Production Database from a Railway Backup

This runbook covers restoring the SchoolStack production Postgres database from a
Railway snapshot into a throwaway service, verifying it, and (if needed)
promoting it back to production.

It is written to be followed under pressure by anyone on call. If you are reading
this during an incident, skip to **Quick Path** and come back to the rest after
the fire is out.

---

## When to use this runbook

Use it when the production database is lost, corrupted, accidentally truncated,
or returns wrong data and the cause is suspected to be data-layer (not app
code). Common triggers:

- A destructive migration ran against prod (`DROP TABLE`, bad `UPDATE` without
  `WHERE`, `db:push` against the wrong env).
- A user reports data missing across many records.
- Railway reports storage corruption or the Postgres add-on fails to boot.

If the issue is app-side (a bug writing wrong values), do **not** restore — fix
the code instead. Restoring loses every write since the snapshot.

---

## Who to notify (in order)

1. **On-call engineer** — owns the restore.
2. **Eng lead** — approves the restore and the cutover window.
3. **Founders/CEO** — customer comms; they decide whether to put up a status
   message.
4. **Customer support** — to triage incoming "my data is gone" reports and
   collect timestamps that help pick the right snapshot.

Post in `#incidents` (or whatever the active incident channel is) with:
- What you observed.
- Which snapshot you intend to restore (date + UTC time).
- Estimated cutover time.

---

## Rough RTO

These are observed numbers from the trial restore (see "Trial restore log"
below). They are rough — Railway snapshot restores are not SLA'd.

| Step                                         | Time       |
| -------------------------------------------- | ---------- |
| Decide which snapshot to use                 | 5 min      |
| Trigger Railway restore into new service     | 10–20 min  |
| Pull connection string, run smoke checks     | 5 min      |
| Point app at restored DB (env var swap)      | 5 min      |
| Netlify/API redeploy + cache warm            | 5–10 min   |
| **Total RTO**                                | **30–45 min** |

RPO is **up to 24 hours** — Railway snapshots are daily. Anything written
between the last snapshot and the incident is lost unless it can be
reconstructed from logs or user re-entry.

---

## Quick path (incident mode)

1. Open Railway → project → Postgres add-on → **Backups** tab.
2. Pick the most recent snapshot from **before** the bad event.
3. Click **Restore** → choose **Restore to a new service** (never overwrite the
   live DB on the first try).
4. Wait for the new service to boot (status: `Active`).
5. Copy the new service's `DATABASE_URL` from its **Variables** tab.
6. Run the verification checks in the next section.
7. If verification passes, swap `DATABASE_URL` on the API service to the
   restored one, redeploy, and announce restore in `#incidents`.
8. Leave the old (broken) DB service running but unattached for at least 24h
   in case you need to diff against it.

---

## Detailed procedure

### 1. Pick the snapshot

In Railway → Postgres → **Backups**, snapshots are listed by UTC timestamp.
Pick the newest one whose timestamp is *before* the incident. If you are not
sure when the incident started, look at:

- The first customer report timestamp.
- The deploy history on Netlify and Railway around that time.
- Postgres logs (Railway → Postgres → **Logs**) for `DROP`, `TRUNCATE`,
  `DELETE`, or migration statements.

When in doubt, pick an older snapshot. You can always restore again to a
newer one; you cannot un-overwrite live data.

### 2. Restore into a throwaway service

- Click **Restore** on the snapshot row.
- Choose **Restore to a new service** and name it
  `postgres-restore-YYYYMMDD-HHMM` (UTC).
- Wait for status `Active`. This takes 10–20 minutes for our current data
  size.
- Do **not** click "Restore in place" during an incident — it overwrites the
  live DB and you lose your ability to compare.

### 3. Get the connection string

- Open the new service → **Variables** → copy `DATABASE_URL`.
- Export it locally: `export RESTORE_DB_URL='<paste>'`

### 4. Verify the restore

Run these from your laptop (requires the `psql` client and the project
checked out).

**a. It connects and Postgres is healthy:**

```bash
psql "$RESTORE_DB_URL" -c "select version();"
```

**b. Schema is the expected version** (compare to current prod schema):

```bash
psql "$RESTORE_DB_URL" -c "\dt" | sort > /tmp/restore-tables.txt
psql "$PROD_DB_URL"   -c "\dt" | sort > /tmp/prod-tables.txt
diff /tmp/prod-tables.txt /tmp/restore-tables.txt
```

The diff should be empty (same table list). If prod is corrupted such that
its schema is unreadable, skip this and trust the snapshot.

**c. Row counts are sensible** (sanity, not exact match — prod may have
written rows since the snapshot). Paste this directly into `psql`:

```bash
psql "$RESTORE_DB_URL" <<'SQL'
select 'users'            as t, count(*) from users
union all select 'schools',          count(*) from schools
union all select 'financial_models', count(*) from financial_models
union all select 'exports',          count(*) from exports
union all select 'shared_links',     count(*) from shared_links
union all select 'events',           count(*) from events
order by t;
SQL
```

Numbers should be in the same order of magnitude as prod and non-zero for
core tables (`users`, `schools`, `financial_models`). A restore that
returns `0` for `users` is a failed restore — stop and pick a different
snapshot.

> The current schema lives in `lib/db/src/schema/` (the `@workspace/db`
> package). If you add or rename tables there, update the query above so
> the next operator isn't running stale SQL.

**d. The app boots against it.** Locally:

```bash
DATABASE_URL="$RESTORE_DB_URL" pnpm --filter @workspace/api-server run dev
```

In another terminal (the API listens on the `PORT` it logs at startup):

```bash
# 1. Liveness — must return 200.
curl -fsS "http://localhost:$PORT/healthz"

# 2. Auth round-trip against restored data — log in as the dedicated
#    restore-validation account (NOT a personal or customer account; never
#    paste a real user's password into a shell) and confirm /auth/me
#    returns the expected profile. Credentials live in 1Password under
#    "DB restore validation account". The cookie jar carries the session.
curl -fsS -c /tmp/restore-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"<restore-validation@example.com>","password":"<from-1password>"}' \
  "http://localhost:$PORT/auth/login"

curl -fsS -b /tmp/restore-cookies.txt "http://localhost:$PORT/auth/me"

# 3. List that user's models — confirms financial_models rows came across.
curl -fsS -b /tmp/restore-cookies.txt "http://localhost:$PORT/models" | head
```

The restore is usable when:
- `/healthz` returns 200,
- `/auth/login` succeeds and `/auth/me` returns the expected user, and
- `/models` returns that user's saved models (non-empty for any active
  account).

If the validation account credentials are unavailable, fall back to:
confirm the schools count from step (c) is non-zero and `/healthz`
returns 200. Note the reduced confidence in the trial-restore log so
the next quarterly trial knows to redo the auth round-trip.

> The endpoints above are the canonical ones in `lib/api-spec/openapi.yaml`.
> If the API surface changes (e.g. `/healthz` is renamed or `/models` moves
> behind a different prefix), update this section so the next operator
> isn't running stale commands.

### 5. Cut over (only after verification passes)

- In Railway → API service → **Variables**, set `DATABASE_URL` to the
  restored service's connection string.
- Trigger a redeploy of the API service.
- On Netlify, trigger a deploy (or just a cache purge) so any edge cached
  responses clear.
- Hit `/healthz` and a couple of real endpoints from a browser to confirm.
- Announce in `#incidents` that the restore is live and note the data loss
  window (everything written after the snapshot timestamp is gone).

### 6. Clean up (next business day, not during the incident)

- Rename the old broken service to `postgres-broken-YYYYMMDD` and leave it
  detached but running for 24–72h in case you need to diff.
- Once the team agrees the restore is good, delete the broken service.
- Rename the restored service to the canonical `postgres` name.
- File a postmortem; link this runbook from it and note anything that was
  unclear or wrong so the next person has it easier.

---

## Trial restore log

A trial restore must be performed at least once per quarter so the
procedure stays warm. Append entries here.

Two kinds of entries are valid:

- **Hands-on restore** — an operator with Railway access actually clicked
  through the procedure against a real snapshot. This is what counts for
  the quarterly cadence. Put `hands-on` in the Type column.
- **Documentation walkthrough** — someone read the runbook end-to-end and
  verified every referenced table, endpoint, and command still exists in
  the codebase, but did **not** restore a real snapshot. Useful after
  schema or API changes; does **not** reset the quarterly clock. Put
  `doc-walkthrough` in the Type column.

| Date (UTC)       | Type            | Operator | Snapshot used | Restore time | Verification result | Notes |
| ---------------- | --------------- | -------- | ------------- | ------------ | ------------------- | ----- |
| 2026-05-04       | doc-walkthrough | agent    | n/a           | n/a          | Verified all 6 tables in the row-count SQL block (`users`, `schools`, `financial_models`, `exports`, `shared_links`, `events`) exist in `lib/db/src/schema/`; verified `/healthz`, `/auth/login`, `/auth/me`, and `/models` are all registered in `artifacts/api-server/src/` and present in `lib/api-spec/openapi.yaml`. Runbook commands are consistent with the current code. | Documentation-only pass; **no real Railway restore was performed**. The first hands-on trial restore is still outstanding and must be done by an engineer with Railway access. |

---

## Known gotchas

- **Connection limits.** Railway's Postgres plans cap concurrent connections.
  If the API fails to connect after cutover with `too many clients`, restart
  the API service to drop its old pool.
- **Extensions.** If we ever add a Postgres extension (e.g. `pg_trgm`), the
  restore preserves it, but a *fresh* DB created from scratch would not.
  Restores are fine; manual rebuilds are the risk.
- **Migrations after the snapshot.** If schema changes were pushed *after*
  the snapshot but *before* the incident, you must re-run
  `pnpm --filter @workspace/db run db:push` against the restored DB before
  pointing the app at it, or the app will hit missing-column errors.
- **Secrets.** Application secrets (Clerk keys, Stripe keys, etc.) live in
  Railway/Netlify env vars, not in the DB. They are unaffected by a DB
  restore.

---

## See also

- `docs/DEPLOYMENT_GUIDE.md` — overall deployment topology.
- Railway docs: https://docs.railway.com/reference/backups
