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

These are still **estimates**, not observed numbers — the 2026-05-05
hands-on trial had to be discarded before the verification clock
could run end-to-end (see "Trial restore log" below for why). The
one observed data point: getting from "click Restore" to "staged
volume ready to apply" on a 234 MB snapshot took ~30 min, which is
longer than the 10–20 min previously assumed. The next hands-on
trial should follow Option A and replace the rest of these numbers
with real measurements.

| Step                                         | Time       |
| -------------------------------------------- | ---------- |
| Decide which snapshot to use                 | 5 min      |
| Get a side-by-side restored DB (Option A)    | 20–40 min  |
| Pull connection string, run smoke checks     | 5 min      |
| Point app at restored DB (env var swap)      | 5 min      |
| Netlify/API redeploy + cache warm            | 5–10 min   |
| **Total RTO (estimate)**                     | **40–65 min** |

RPO is **up to 24 hours** — Railway snapshots are daily. Anything written
between the last snapshot and the incident is lost unless it can be
reconstructed from logs or user re-entry.

---

## Quick path (incident mode)

> **Important — read before clicking Restore.** The 2026-05-05 hands-on
> trial proved that Railway's **Restore** button does **not** create a
> parallel throwaway service. Instead it creates a new *volume* and
> stages a swap on the existing Postgres service. If you then click the
> top-bar **Deploy / Apply changes** button, prod's volume is replaced
> with the snapshot — i.e. you overwrite production. Read the
> "Side-by-side restore" section below before using Restore in incident
> mode.

1. Open Railway → project → Postgres add-on → **Backups** tab.
2. Pick the most recent snapshot from **before** the bad event.
3. Decide which path you need:
   - **Side-by-side verification first** (preferred, safer): follow
     "Side-by-side restore via pg_dump/pg_restore" below. This is the
     only way confirmed to give you a parallel restored DB you can
     point the app at without touching prod.
   - **In-place rollback** (only if prod is already unusable and you
     accept losing everything written since the snapshot): click
     **Restore** on the snapshot row → review the staged changes → click
     **Deploy / Apply changes** at the top of the canvas. This swaps
     the live Postgres service's volume to the snapshot. There is no
     undo once Deploy is clicked.
4. Run the verification checks in the next section against whichever DB
   you ended up with.
5. If you used the side-by-side path and verification passes, swap
   `DATABASE_URL` on the API service to the restored one, redeploy, and
   announce restore in `#incidents`.
6. Leave the old (broken) DB service running but unattached for at
   least 24h in case you need to diff against it.

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

### 2. Get a side-by-side restored database

> **What the Railway UI actually does — verified 2026-05-05.** The
> Railway **Backups → Restore** button does not create a parallel
> Postgres service you can attach to independently. It creates a new
> *volume* (e.g. shown as `postgres-restore-YYYYMMDD-HHMM` in the
> canvas) and **stages a swap** on the existing Postgres service
> (visible as a "Restoring backup..." badge plus an "Apply N changes /
> Deploy" pill in the top bar). If you click Deploy/Apply, the live
> Postgres service's volume is replaced with the snapshot — i.e. you
> overwrite production. There is no undo. The new volume tile also has
> no Variables tab and no `DATABASE_URL` of its own; only services do.
>
> If you opened the Restore button by mistake, **discard the staged
> changes** before doing anything else: hover the Postgres service
> tile, find the small revert/discard arrow on it (or use the
> "Details" → revert option next to "Apply N changes"), and confirm
> the tile returns to plain "Online" with no "Changes" badge.

There are two ways to get a parallel restored DB you can verify
without touching prod:

**Option A — pg_dump from prod, pg_restore into a fresh service
(recommended, works today).**

1. In the Railway canvas, click **+ New** → **Database** → **Add
   PostgreSQL**. Wait until it shows `Online`. This is your throwaway.
2. Open the new service → **Variables** → copy `DATABASE_URL` →
   `export RESTORE_DB_URL='<paste>'`.
3. From your laptop:

   ```bash
   # Dump prod (read-only operation, but use a low-traffic window).
   pg_dump --no-owner --no-acl --format=custom \
     "$PROD_DB_URL" > /tmp/prod.dump

   # Restore into the throwaway. --clean drops conflicting objects in
   # the throwaway only — never run this against $PROD_DB_URL.
   pg_restore --no-owner --no-acl --clean --if-exists \
     --dbname="$RESTORE_DB_URL" /tmp/prod.dump
   ```

   This restores the *current* prod state, not a point-in-time
   snapshot. For point-in-time, ask Railway support to expose the
   snapshot file, or use Option B and accept the risk.

**Option B — Railway in-place restore (only when prod is already
unusable).**

1. On the Backups tab, click **Restore** on the chosen snapshot.
2. Review the staged changes carefully. The Postgres service should
   show "Changes" / "Restoring backup..." and the top bar should show
   "Apply N changes / Deploy".
3. Click **Apply changes / Deploy**. This swaps the live Postgres
   volume to the snapshot. Production is now the snapshot; everything
   written after the snapshot timestamp is lost.
4. Skip ahead to "Verify the restore" and run the checks against
   `$PROD_DB_URL` (since prod *is* the restore now).

> Naming note: in the current Railway UI you cannot freely rename the
> volume after it's created. Use whatever Railway assigns; the
> trial-restore log records the snapshot timestamp, which is what
> matters for traceability.

### 3. Get the connection string

- Open the throwaway Postgres **service** (not the volume tile) →
  **Variables** tab on the right-side detail panel → copy
  `DATABASE_URL`.
- Export it locally: `export RESTORE_DB_URL='<paste>'`
- If the only thing you can find is a volume tile with a Settings tab
  showing "Mount to service" and "Volume Size", you opened a volume,
  not a service. Volumes do not expose `DATABASE_URL`. Go back to the
  project canvas and open the *service* tile (the larger one with the
  Postgres logo and an Online/Active status).

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
#    "DB restore validation account" *if it has been created* — see the
#    fallback note below if it hasn't (the 2026-05-05 trial confirmed the
#    account does not yet exist). The cookie jar carries the session.
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

If the validation account credentials are unavailable (currently the
default — the dedicated 1Password account has not been created yet,
per the 2026-05-05 trial), fall back to: confirm the schools count
from step (c) is non-zero and `/healthz` returns 200. Note the
reduced confidence in the trial-restore log so the next quarterly
trial knows to redo the auth round-trip. Creating that 1Password
account is tracked as a follow-up so the next trial can do the full
round-trip.

> The endpoints above are the canonical ones in `lib/api-spec/openapi.yaml`.
> If the API surface changes (e.g. `/healthz` is renamed or `/models` moves
> behind a different prefix), update this section so the next operator
> isn't running stale commands.

### 5. Cut over (only after verification passes)

The exact steps depend on which path you took in step 2:

**If you used Option A (side-by-side via pg_dump/pg_restore):**

- In Railway → API service → **Variables**, set `DATABASE_URL` to the
  throwaway Postgres service's connection string.
- Trigger a redeploy of the API service.
- On Netlify, trigger a deploy (or just a cache purge) so any edge cached
  responses clear.
- Hit `/healthz` and a couple of real endpoints from a browser to confirm.
- Announce in `#incidents` that the restore is live and note the data loss
  window (everything written after the snapshot timestamp is gone).

**If you used Option B (Railway in-place restore):**

- The cutover already happened when you clicked Apply changes / Deploy
  on the Postgres service — prod is now serving the snapshot.
- Trigger a redeploy of the API service so its connection pool is
  fresh; on Netlify, purge the cache.
- Hit `/healthz` and a couple of real endpoints from a browser to
  confirm.
- Announce in `#incidents` that the in-place restore is live and note
  the data loss window.

### 6. Clean up (next business day, not during the incident)

**Option A cleanup:**

- Once the team agrees the restored data is good, you have two
  choices: keep using the throwaway Postgres service as the new prod
  (in which case rename it in Railway to something canonical and leave
  the original Postgres detached for 24–72h before deleting), or
  pg_dump the throwaway and pg_restore back into the original Postgres
  service so the canonical service keeps its name and connection
  string.
- Either way: keep the broken/original DB around (detached) for 24–72h
  so you can diff if anything looks wrong.

**Option B cleanup:**

- Delete the orphan `postgres-restore-YYYYMMDD-HHMM` volume tile that
  Railway leaves behind after the in-place restore. It is no longer
  attached to any service and just costs storage.
- File a postmortem; link this runbook from it and note anything that
  was unclear or wrong so the next person has it easier.

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
| 2026-05-05       | hands-on        | founder (with agent paired for verification) | 2026-05-05 17:17 UTC manual snapshot, 234 MB | ~30 min from click to "ready to apply" (staged but **not deployed**) | **Verification not completed.** The restore was discarded before a `DATABASE_URL` could be obtained, because the Railway UI's "Restore" path turned out to stage an in-place volume swap on the existing Postgres service rather than create a parallel throwaway service as the runbook described. Clicking Deploy/Apply would have overwritten production. No connection string, no schema diff, no row counts, no app-boot, no `/healthz`/`/auth/login`/`/auth/me`/`/models` were run. | **Trial succeeded at its real purpose: surfacing dangerous runbook gaps before an incident.** Findings, all fixed in this same edit: (1) Railway "Restore" stages a swap on the existing service, not a new service — runbook now warns about this and adds a discard-the-changes recovery step. (2) The throwaway service name is not freely settable in the current UI; use whatever Railway assigns. (3) Volume tiles do not expose `DATABASE_URL`; only service tiles do. (4) The "DB restore validation account" referenced in 1Password does not exist yet; runbook now flags this as the current default and points at the schools-count + `/healthz` fallback. (5) Added an Option A procedure (pg_dump from prod + pg_restore into a fresh Postgres service) as the safe side-by-side path; Option B (Railway in-place restore) is documented for last-resort use. RTO numbers in the table at the top remain estimates — the next hands-on trial should follow Option A end-to-end so they can be replaced with observed values. |

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
