# Orphan-uploads sweeper

## What it does

The sweeper finds evidence files in App Storage (under `<PRIVATE_OBJECT_DIR>/uploads/<uuid>`)
that no surviving financial model still references, and deletes them.
It exists to keep storage costs flat: founders detach files, delete
models, or hit the occasional failed inline-delete, and without a
recurring sweep those bytes would just accumulate forever.

The sweep logic lives in
`artifacts/api-server/src/scripts/cleanup-orphan-uploads.ts`
(originally added in task #736, exposed as a reusable
`runOrphanUploadsCleanup()` function in task #757).

## How it runs in production

The sweep runs **automatically, daily, in-process inside the API
Server deployment**. The schedule is wired up in
`artifacts/api-server/src/index.ts`:

- The first sweep fires ~10 minutes after the API process boots
  (so it doesn't compete with the startup health check).
- After that, the sweep runs every 24 hours for as long as the
  process stays up.
- In production (`NODE_ENV=production`) it runs with `--execute`
  semantics — orphans are actually deleted from the bucket.
- In every other environment (local dev, e2e, preview) it stays in
  dry-run mode so contributors and CI never touch a shared bucket.
- Concurrency guard: if a previous sweep is still running when the
  next tick fires, the new tick is skipped (no overlapping sweeps).

This piggybacks on the existing `setInterval` cleanup pattern that
already prunes rate limits, error logs, and pending signups. It
deliberately does **not** rely on a separately-configured Replit
Scheduled Deployment, so no operator can forget to set one up.

## Where to find the run summary

Every sweep emits one tagged JSON line into the deployment logs:

```
[orphan-uploads-summary] {"mode":"execute","scannedModels":123,"referencedPaths":456,"bucketObjects":789,"orphans":12,"considered":12,"deleted":12,"failed":0,"durationMs":1834}
```

Field meanings:

| Field             | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `mode`            | `"execute"` in production, `"dry-run"` everywhere else.                  |
| `scannedModels`   | How many `financial_models` rows we read.                                |
| `referencedPaths` | Distinct evidence `objectPath`s those rows currently reference.          |
| `bucketObjects`   | How many `uploads/*` objects exist in App Storage right now.             |
| `orphans`         | Bucket objects that no model references — i.e. deletion candidates.      |
| `considered`      | How many of those orphans this sweep actually attempted (limit-bounded). |
| `deleted`         | How many were successfully removed (always 0 in dry-run mode).           |
| `failed`          | How many delete attempts errored.                                        |
| `durationMs`      | End-to-end runtime of this sweep.                                        |

To check that the sweep ran today, fetch the API Server's deployment
logs and grep for `orphan-uploads-summary`. The progress lines are
prefixed with `[orphan-uploads-scheduler]` and the script's own
internal status lines start with `[cleanup-orphan-uploads]`.

## Tuning the schedule

If the cadence ever needs to change (e.g. twice-daily, or weekly),
edit the two constants near the top of
`artifacts/api-server/src/index.ts`:

- `ORPHAN_UPLOADS_INTERVAL_MS` — gap between sweeps. Default: 24h.
- `ORPHAN_UPLOADS_FIRST_RUN_DELAY_MS` — delay before the first sweep
  after boot. Default: 10 minutes.

Redeploying the API picks up the new cadence.

## Running it on demand

The CLI entry point is unchanged:

```sh
# Dry-run — prints what would be deleted, touches nothing.
pnpm --filter @workspace/api-server run cleanup:orphan-uploads

# Actually delete orphans.
pnpm --filter @workspace/api-server run cleanup:orphan-uploads -- --execute

# Limit how many orphans get processed in one run.
pnpm --filter @workspace/api-server run cleanup:orphan-uploads -- --execute --limit=50
```

On-demand runs are useful right after a large data migration, after
recovering from an outage that left orphans behind, or when
investigating why the daily summary line shows an unexpectedly large
`orphans` count.
