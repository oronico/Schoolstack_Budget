# Primary Data Source Registry

**Owner:** Pre-Launch Math Integrity (Task #930, M1 #973)
**Single source of truth:** [`canonical-metrics.ts`](./canonical-metrics.ts)
**Reviewer-facing view:** [`docs/primary-data-source-registry.md`](../../../../docs/primary-data-source-registry.md)

## What this is

Every number that SchoolStack Budget shows to a founder, lender, or board
reviewer — DSCR, runway, revenue quality %, lender readiness, the cap
callout, every commentary figure — has exactly **one** canonical function
or field that defines its true value. Every other place that renders the
number is a **surface** that must reconcile to that canonical accessor.

This registry catalogs both sides:

- **`canonical`** — the one function/field path that owns the value.
- **`surfaces[]`** — every downstream place that renders it.

## Why it exists

M2–M5 (#974–#977) of the pre-launch math integrity gate all depend on
this registry:

- **M2 (#974)** extracts each canonical value and each surface value
  from a shared fixture set so they can be diffed.
- **M3 (#975)** is allowed to consolidate computation into the
  canonical module — but only if the registry says where the canonical
  lives.
- **M4 (#976)** produces the integrity report by iterating
  `CANONICAL_METRICS` and comparing canonical vs. surfaces.
- **M5 (#977)** runs the cross-surface harness in CI off the same
  table so a new mismatch fails the build.
- **M6 (#978)** lists every assumption-shape change (#925 / #927 /
  #929 cap fields) that needs a prod data migration.
- **M7 (#979)** is Lance Helming's go-live review — he uses the
  generated markdown view to sign off.

## How to add a new metric

1. Pick a stable kebab-case `id` (`break-even-students-y2`, not
   `breakEvenY2`).
2. Choose the right `category`.
3. Set `canonical.module` to the **non-render** module that owns the
   value (`@workspace/finance` or an `artifacts/api-server/src/lib/...`
   path). UI files must never appear in `canonical`.
4. List every render surface in `surfaces[]`. If a number appears in
   the UI, the PDF, the API JSON, and a coaching flag, all four go in.
5. Write `notes` for anything subtle — sign conventions, sentinel
   values, year-index semantics, composition rules.
6. Cite `relatedTasks` (issue numbers) for traceability.
7. Re-run `pnpm --filter @workspace/finance run test` — the lint test
   will fail if your entry is malformed or the markdown view is stale.
8. Re-generate the markdown view:

   ```
   pnpm --filter @workspace/finance exec tsx src/registry/generate-markdown.ts > ../../docs/primary-data-source-registry.md
   ```

## Maintenance rules (enforced)

- `id` must be unique and kebab-case.
- Every entry must have at least one surface.
- `canonical.module` must be `@workspace/finance` or an api-server lib
  path — never a UI / render file.
- The markdown view in `docs/` must be regenerated whenever the
  registry changes (the test asserts the file is current).
