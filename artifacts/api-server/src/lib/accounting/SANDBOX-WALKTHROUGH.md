# Live accounting sync — sandbox walkthrough

This walkthrough proves the QuickBooks Online and Xero sync paths still work
end-to-end against a real provider. It exercises OAuth, refresh-token
rotation, the live `Profit & Loss` fetch, and the parser that produces the
`AccountingSyncSnapshot` we cache in `accounting_connections.snapshot_json`.

There are two layers, both runnable from the api-server package:

| Layer | What it does | Requires sandbox creds? |
| --- | --- | --- |
| `pnpm --filter @workspace/api-server test:accounting-sandbox-parse` | Runs the canonical sandbox-shaped P&L fixtures through `parseQuickBooksProfitAndLoss` / `parseXeroProfitAndLoss` and asserts the snapshot equals the live totals. | No |
| `pnpm --filter @workspace/api-server test:accounting-sandbox-sync` | When `SANDBOX_*` env vars are present, refreshes the access token, pulls the live P&L from the sandbox, parses it, and saves the raw JSON under `qa-output/`. Without env vars it falls back to the fixture parse. | Optional |

The fixture-only path runs in CI and developer machines. The live path is
intentionally manual — Intuit and Xero refuse to issue long-lived sandbox
refresh tokens to shared CI runners, so we keep the live walkthrough as a
documented checklist that an engineer runs whenever the parser or HTTP
contract changes.

---

## QuickBooks Online Sandbox

Everything below runs against `sandbox-quickbooks.api.intuit.com`, not the
production realm.

### One-time setup (≈ 10 min)

1. Sign in to https://developer.intuit.com and go to **Dashboard → Apps →
   _your app_ → Keys & credentials**. Copy the **Development** Client ID and
   Client Secret into the api-server env:

   ```bash
   export QUICKBOOKS_CLIENT_ID=...
   export QUICKBOOKS_CLIENT_SECRET=...
   ```

2. In the same app, add a **Redirect URI** for whichever host you'll do the
   OAuth round-trip from. For local dev this is usually
   `http://localhost:5000/api/accounting/quickbooks/callback`. Save.

3. Open the **Sandbox** tab on the developer dashboard and create (or pick) a
   sandbox company. Note its `companyId` — that becomes our `realmId`.

### Run a full OAuth + sync round-trip

1. Start the api-server and the school-financial-model app locally, sign in
   as a founder, create or open a financial model, and click **Connect
   QuickBooks**. This hits `POST /api/models/:id/accounting/quickbooks/connect`
   and redirects to Intuit.
2. Authorize the sandbox company. Intuit redirects back to the callback,
   which upserts a row into `accounting_connections` and returns you to the
   model's scenarios page with `?accounting=connected`.
3. From the scenarios page, click **Sync now**. This calls
   `POST /api/models/:id/accounting/quickbooks/sync` and updates
   `snapshot_json`. Check the value:

   ```sql
   SELECT id, status, last_synced_at, snapshot_json
   FROM accounting_connections
   WHERE provider = 'quickbooks'
   ORDER BY id DESC LIMIT 1;
   ```

4. Open the QuickBooks Sandbox UI (https://sandbox.qbo.intuit.com/) and run
   **Reports → Profit and Loss** with the same date range. Confirm:
   - `revenue` matches `Total Income`
   - `expenses` matches `Total Expenses + Total Cost of Goods Sold + Total
     Other Expenses` (the parser sums these three groups so the snapshot
     reflects every cash outflow)
   - `monthlyRent` matches the **Rent or Lease** account divided by months
     elapsed in the period

If anything diverges, save the raw response (see next section) and add a
regression case to `tests/accounting-sandbox-parse.ts`.

### Run the live sync from the command line

If you'd rather skip the browser dance, grab the refresh token from the
`accounting_connections` row above (it's encrypted at rest — use the
`decryptToken` helper in a `tsx` REPL), then:

```bash
export QUICKBOOKS_CLIENT_ID=...
export QUICKBOOKS_CLIENT_SECRET=...
export SANDBOX_QUICKBOOKS_REFRESH_TOKEN=...
export SANDBOX_QUICKBOOKS_REALM_ID=...
# Sandbox uses a separate API host:
export SANDBOX_QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com

pnpm --filter @workspace/api-server test:accounting-sandbox-sync
```

The script will:
- refresh the access token (which also rotates the refresh token — overwrite
  your env var with the new one if you want to re-run later),
- fetch the live `Profit & Loss`,
- parse it into a snapshot and assert the shape,
- and save the raw response to `artifacts/api-server/qa-output/quickbooks-sandbox-<timestamp>.json`
  so you can diff it against the previous run or seed a new fixture.

---

## Xero Demo Company

Xero gives every developer a **Demo Company (US)** that resets every 28
days, which is what we use here.

### One-time setup (≈ 10 min)

1. Sign in to https://developer.xero.com and create an OAuth 2.0 app. Set the
   redirect URI to wherever the api-server will receive the callback (e.g.
   `http://localhost:5000/api/accounting/xero/callback`).

2. Copy the **Client ID** and **Client Secret** into the env:

   ```bash
   export XERO_CLIENT_ID=...
   export XERO_CLIENT_SECRET=...
   ```

3. From your Xero account, switch to the **Demo Company** organisation. The
   demo data already includes income, expense, and cost-of-sales accounts
   that exercise every branch of `parseXeroProfitAndLoss`.

### Run a full OAuth + sync round-trip

1. From the model's scenarios page click **Connect Xero** and authorise the
   Demo Company. Xero redirects to the callback, which calls
   `/connections` to discover the tenant and stores the `tenantId`.
2. Click **Sync now** to call the sync endpoint. Inspect the resulting row
   the same way as for QuickBooks.
3. Open Xero → **Accounting → Reports → Profit and Loss** for the same
   period. Confirm:
   - `revenue` matches **Total Income**
   - `expenses` matches **Total Operating Expenses + Total Cost of Sales +
     Total Other Expenses**. These are sibling sections in Xero's report;
     the parser sums them so the snapshot tracks the bottom-of-page total
     instead of just the operating-expenses subtotal.
   - `periodEnd` equals the end of the report's date range
   - `monthsCompleted` equals the number of completed months in the report
     (e.g. a "1 January 2024 to 30 September 2024" title yields 9)

### Run the live sync from the command line

```bash
export XERO_CLIENT_ID=...
export XERO_CLIENT_SECRET=...
export SANDBOX_XERO_REFRESH_TOKEN=...
export SANDBOX_XERO_TENANT_ID=...

pnpm --filter @workspace/api-server test:accounting-sandbox-sync
```

The script saves the raw JSON to
`artifacts/api-server/qa-output/xero-demo-<timestamp>.json` and asserts the
parsed snapshot is well-shaped.

---

## When something diverges

1. Save the raw provider response (the live sync script does this for you,
   under `qa-output/`).
2. Sanitise it (no real account names) and copy it into
   `artifacts/api-server/tests/fixtures/` as a new fixture.
3. Add expected totals to `tests/accounting-sandbox-parse.ts` so the
   regression is locked in.
4. Update `parseQuickBooksProfitAndLoss` / `parseXeroProfitAndLoss` until
   `pnpm --filter @workspace/api-server test:accounting-sandbox-parse`
   reports `0 failed`.
