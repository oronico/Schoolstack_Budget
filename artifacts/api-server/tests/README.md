# API Server Safety-Check Tests

The `tests/` directory holds the api-server's safety-check / integration test
scripts. Each script is a standalone `tsx` entrypoint registered as a
`test:*` npm script in `artifacts/api-server/package.json` and aggregated by
the top-level `test` script.

The `test` script is wired up to the `api-tests` validation, which runs
automatically on every change. If any individual `test:*` script exits
non-zero, `pnpm --filter @workspace/api-server run test` short-circuits at
that point and the validation fails loudly so the regression is surfaced
immediately.

## Running locally

```bash
# Run the full safety-check suite (same command the validation runs):
pnpm --filter @workspace/api-server run test

# Run a single check while iterating on it:
pnpm --filter @workspace/api-server run test:health
```

`DATABASE_URL` and `JWT_SECRET` must be set in the environment — the
checks talk to a real Postgres database and import the auth-aware Express
app.

## Adding a new safety-check

1. Write the new script under `artifacts/api-server/tests/<name>.ts`. It
   should be self-contained: provision its own fixtures, exit non-zero on
   any failed assertion, and clean up after itself.
2. Register it in `artifacts/api-server/package.json` as a new entry under
   `scripts`:
   ```json
   "test:<name>": "tsx ./tests/<name>.ts"
   ```
3. Append it to the aggregate `test` script in the same `scripts` block so
   the `api-tests` validation picks it up. The aggregate uses `&&` chaining
   so the suite stops at the first failing check:
   ```json
   "test": "pnpm run test:health && ... && pnpm run test:<name>"
   ```
4. Run `pnpm --filter @workspace/api-server run test` once locally to
   confirm the new check passes alongside the existing ones.

That's it — no further wiring is needed. The `api-tests` validation
re-reads the aggregate `test` script on every run, so the new check will
execute on the next change.

## Excluded checks

Every `test:*` script in `package.json` is included in the aggregate
`test` script **except** the ones listed below. If you add a new
exclusion, document it here with the blocking reason so future
maintainers know why it isn't being enforced.

- `test:shared-decision-comparison-pdf-route` — the route at
  `src/routes/models.ts` was updated to record share-link PDF downloads
  on the model owner's exports history (so founders can see who
  downloaded via their share links), but the test still asserts "no
  exports-table row inserted". The assertion is stale and needs to be
  updated to match the new behaviour before the script can be folded
  back into the suite.
