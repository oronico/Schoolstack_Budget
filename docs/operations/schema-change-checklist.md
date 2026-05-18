# Canonical schema-change checklist

**Status:** authoritative as of Task #988. Every PR that adds a Drizzle
migration MUST follow this checklist. CI fails any PR that lands a new
`lib/db/drizzle/NNNN_*.sql` without the sibling files described below.

The rule exists because Task #978 (M6) had to assemble the prod data
migration plan by hand — reading every migration committed since the beta
started, working out which rows it touched, drafting the rollback path,
and naming the cutover window. That worked once. Going forward, every
schema change ships with its migration, rollback, and "affected records"
query as a single reviewable unit, and
`scripts/src/generate-go-live-plan.ts` builds the next go-live plan from
the repo rather than from a human's memory.

---

## 1. What every schema change must include

For each new Drizzle migration `NNNN_<tag>.sql`, you must also commit a
sibling directory `lib/db/drizzle/operations/NNNN_<tag>/` containing
three files:

| File | Purpose |
|---|---|
| `meta.json` | The structured row that feeds the go-live plan. See §3 for the schema. |
| `rollback.sql` | SQL that undoes this migration on a prod that has already applied it. Must use `IF EXISTS` / `DROP CONSTRAINT IF EXISTS` so re-running is safe. |
| `affected-records.sql` | A read-only `SELECT count(*) AS affected …` query that scopes the blast radius. The go-live plan generator runs this against the prod read-replica to inline live counts. |

These siblings live in `operations/` rather than alongside the `.sql`
file so the Drizzle migrator's directory scan ignores them.

---

## 2. The workflow

```bash
# 1. Edit lib/db/src/schema/*.ts as usual.

# 2. Generate the migration file:
pnpm --filter @workspace/db run generate

# 3. Scaffold the rollback + affected-records + meta siblings for the new tag:
pnpm --filter @workspace/scripts run schema-change:new
#    (defaults to the most recent migration that is missing siblings; pass
#     a tag explicitly to re-scaffold an older one.)

# 4. Edit the three sibling files to fill in the TODOs.

# 5. Verify the linter passes:
pnpm --filter @workspace/scripts run schema-change:lint

# 6. Verify the regression still matches the hand-written M6 plan:
pnpm --filter @workspace/scripts run schema-change:test
```

`schema-change:lint` is the CI gate. If your PR adds a migration and
forgets a sibling, it fails with a clear "missing operations/<tag>/<file>"
message and a pointer to `schema-change:new`.

---

## 3. `meta.json` schema

```jsonc
{
  "tag": "0008_my_change",            // matches the .sql filename stem
  "file": "0008_my_change.sql",
  "task": "#NNN",                      // task id this change implements
  "what": "One-line summary that appears in the plan's 'What' column.",
  "affectedRecords": "Human-readable scope. Embed the count SQL inline as `…`.",
  "approach": "`one-shot SQL` (Drizzle migrator).",
  "rollback": "Explain the rollback. Pair with rollback.sql; mention any operator caveats.",
  "window": "`inline` — Drizzle migrator runs on API boot before the server accepts traffic.",
  "appliedToProduction": false         // flip to true after the next go-live cutover
}
```

The five canonical `approach` values are:

- `` `one-shot SQL` `` — a Drizzle migration (the default).
- `` `one-shot script` `` — a separate node/tsx script that has to be run
  explicitly. Used when the change has to talk to App Storage etc.
- `` `loader-side default` `` — the read path tolerates the legacy shape;
  no DB write needed.
- `` `next-edit auto-upgrade` `` — loader tolerates legacy shape AND the
  next save by the founder writes the new shape.
- `` `no action` `` — the change does not touch any pre-existing record.

The five canonical `window` values are: `inline`, `pre-cutover`,
`during-cutover`, `next-cutover`, `already-applied`.

---

## 4. Generating the next go-live plan

```bash
# Dry render (no DB needed) — useful in PR review and CI:
pnpm --filter @workspace/scripts run go-live:plan > /tmp/plan-section-1.md

# Live render with read-replica counts (requires DATABASE_URL pointing at
# the prod read-replica):
DATABASE_URL=postgres://… pnpm --filter @workspace/scripts run go-live:plan -- --with-counts
```

Output is the §1 (schema migrations) section of the data migration plan
in the exact same shape as
`docs/operations/go-live-data-migration-plan.md` §1. The other sections
of that plan (§2 App Storage script, §3 JSON-shape changes, §4
out-of-scope, §5 cutover sequence, §6 comms) cover artefacts that do
not live in `lib/db/drizzle/`, so they remain hand-authored — but §1,
which is the largest and most error-prone section, is now generated.

---

## 5. After a go-live cutover

Once the migrations have been applied to prod, edit each affected
`operations/<tag>/meta.json` and set `"appliedToProduction": true`. The
next time `schema-change:test` or `go-live:plan` runs, those rows drop
out and the plan only lists migrations still pending against prod.

---

## See also

- `docs/operations/go-live-data-migration-plan.md` — the M6 hand-written
  plan that this tooling is the regression target for. §1 of that file
  is reproduced byte-for-byte by `schema-change:test`.
- `scripts/src/schema-change-lib.ts` — shared loader for the sibling
  files.
- `scripts/src/generate-go-live-plan.ts` — the plan generator.
- `scripts/src/lint-schema-changes.ts` — the CI gate.
- `scripts/src/new-schema-change.ts` — the scaffolder.
