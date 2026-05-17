# Retired `/api/public/*` routes — Task #950 decisions

Three previously-mounted unauthenticated routes had no consumer in the
school-financial-model UI. They were instrumented with hit telemetry
(`retired_public_route_hit` events in `eventsTable`), observed for 14
days, and then triaged per the rubric in the task description.

The structured telemetry helper lives at
`src/lib/retired-route-telemetry.ts` and records one event per request
(route, method, timestamp, request id, user-agent, referer, origin,
IP class, and resolved auth state — `none` / `invalid` / `valid` based
on a full `verifyTokenStrict` check of any Bearer token). Records continue to flow after the
410 cutover so any straggler traffic stays visible.

| Route | Decision | Rationale | Supported alternative |
| --- | --- | --- | --- |
| `POST /api/public/export-underwriting` | **Delete (410)** | Generated `exportUnderwriting` client existed in `lib/api-client-react` but was never imported in the app. 14-day watch showed zero legitimate caller fingerprints. | `POST /api/public/export-budget` |
| `POST /api/public/request-review` | **Delete (410)** | The model-scoped `POST /api/models/:id/request-review` is the active path. Anonymous variant had zero UI callers and no legitimate external traffic during the watch window. | `POST /api/models/:id/request-review` |
| `POST /api/public/import-actuals` | **Delete (410)** | Added in Task #708 as a server-side P&L import path for a planned QuickBooks-OAuth importer that never shipped. The wizard parses actuals client-side. No legitimate callers during the watch window. | None — `parseAccountingExportCsv` in `@workspace/finance` is the only path. |

All three handlers return HTTP `410 Gone` with a JSON body of the form
`{ error, code: "route_retired", alternative }`. The routes remain
mounted (with telemetry) so external integrations see the 410 + the
pointer to the supported alternative, not a 404. Dropping the stub
itself is a separate future cleanup; the rule of thumb is "another
quiet observation window with the 410 in place."

The previously-flagged `export/*` routes (`/api/models/:id/export/lender-packet`,
`/api/models/:id/export/board-packet`, `POST /api/models/:id/export/decision-comparison-pdf`)
are in active use in the UI and were intentionally left untouched.
