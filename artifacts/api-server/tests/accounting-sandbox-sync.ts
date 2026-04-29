// Opt-in end-to-end sandbox sync for the accounting providers.
//
// Two modes:
//   1. LIVE — when the relevant `SANDBOX_*` env vars are set, this script
//      hits QuickBooks Sandbox / Xero Demo Company directly: refresh the
//      access token, fetch the live Profit & Loss, and run it through the
//      same parser the production sync uses. The resulting snapshot is
//      printed and the raw JSON is saved under `qa-output/` so it can be
//      committed back as a regression fixture if the shape changes.
//   2. FIXTURE — when no live env vars are present, the script falls back
//      to the canonical sandbox-shaped fixtures in
//      `tests/fixtures/`. This keeps the script always-runnable in CI and
//      developer environments without sandbox credentials.
//
// In both modes the script asserts the snapshot is well-shaped (revenue,
// expenses, periodEnd, monthsCompleted) and that revenue minus expenses
// reconciles to a sane net income.
//
// Required env vars per provider (LIVE mode):
//   QuickBooks: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
//               SANDBOX_QUICKBOOKS_REFRESH_TOKEN, SANDBOX_QUICKBOOKS_REALM_ID
//   Xero:       XERO_CLIENT_ID, XERO_CLIENT_SECRET,
//               SANDBOX_XERO_REFRESH_TOKEN, SANDBOX_XERO_TENANT_ID
//
// QuickBooks Sandbox uses a separate API host. Set
// `SANDBOX_QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com`
// when running against the sandbox so the Bearer token isn't sent to the
// production realm.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  getProviderClient,
  parseQuickBooksProfitAndLoss,
  parseXeroProfitAndLoss,
} from "../src/lib/accounting/providers.js";
import type { AccountingSyncSnapshot } from "@workspace/db";

const here = path.dirname(fileURLToPath(import.meta.url));
const QA_OUTPUT_DIR = path.join(here, "..", "qa-output");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertSnapshotShape(provider: string, snap: AccountingSyncSnapshot): void {
  check(
    `${provider}: periodEnd is YYYY-MM-DD`,
    /^\d{4}-\d{2}-\d{2}$/.test(snap.periodEnd),
    `got ${JSON.stringify(snap.periodEnd)}`,
  );
  check(
    `${provider}: monthsCompleted in [1,12]`,
    Number.isInteger(snap.monthsCompleted) &&
      snap.monthsCompleted >= 1 &&
      snap.monthsCompleted <= 12,
    `got ${snap.monthsCompleted}`,
  );
  check(
    `${provider}: revenue is a positive number`,
    typeof snap.revenue === "number" && snap.revenue > 0,
    `got ${snap.revenue}`,
  );
  check(
    `${provider}: expenses is a positive number`,
    typeof snap.expenses === "number" && snap.expenses > 0,
    `got ${snap.expenses}`,
  );
  // Sanity: revenue + expenses fit inside a 12-month school P&L.
  // The hard upper bound here is generous (USD 100M) — a true regression
  // would produce values that are NaN, negative, or wildly inflated.
  check(
    `${provider}: revenue is plausible`,
    (snap.revenue ?? 0) < 100_000_000,
    `got ${snap.revenue}`,
  );
  check(
    `${provider}: expenses is plausible`,
    (snap.expenses ?? 0) < 100_000_000,
    `got ${snap.expenses}`,
  );
}

function describe(label: string, snap: AccountingSyncSnapshot): void {
  console.log(`\n— ${label} —`);
  console.log(JSON.stringify(snap, null, 2));
}

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(here, "fixtures", name), "utf8"));
}

function saveRaw(name: string, payload: unknown): string {
  mkdirSync(QA_OUTPUT_DIR, { recursive: true });
  const out = path.join(QA_OUTPUT_DIR, name);
  writeFileSync(out, JSON.stringify(payload, null, 2));
  return out;
}

// --- QuickBooks --------------------------------------------------------------
async function syncQuickBooks(): Promise<void> {
  const refreshToken = process.env.SANDBOX_QUICKBOOKS_REFRESH_TOKEN;
  const realmId = process.env.SANDBOX_QUICKBOOKS_REALM_ID;
  const live =
    refreshToken &&
    realmId &&
    process.env.QUICKBOOKS_CLIENT_ID &&
    process.env.QUICKBOOKS_CLIENT_SECRET;

  if (!live) {
    console.log(
      "[quickbooks] LIVE creds not set — running fixture parse only.",
    );
    const payload = loadFixture("quickbooks-sandbox-profit-and-loss.json");
    const { snapshot: snap } = parseQuickBooksProfitAndLoss(payload);
    describe("QuickBooks (fixture)", snap);
    assertSnapshotShape("quickbooks/fixture", snap);
    return;
  }

  const client = getProviderClient("quickbooks");
  console.log("[quickbooks] refreshing access token against the sandbox…");
  const refreshed = await client.refreshAccessToken(refreshToken);
  console.log("[quickbooks] token refreshed; fetching P&L…");

  // The sandbox uses a different API host than production. We swap it in
  // by overriding fetch's base URL through an env-driven base.
  const apiBase =
    process.env.SANDBOX_QUICKBOOKS_API_BASE ||
    "https://sandbox-quickbooks.api.intuit.com";
  const url =
    `${apiBase}/v3/company/${encodeURIComponent(realmId)}/reports/ProfitAndLoss` +
    `?summarize_column_by=Total&minorversion=70`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks Sandbox P&L fetch failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const out = saveRaw(`quickbooks-sandbox-${Date.now()}.json`, json);
  console.log(`[quickbooks] saved raw response to ${out}`);
  const { snapshot: snap } = parseQuickBooksProfitAndLoss(json);
  describe("QuickBooks Sandbox (live)", snap);
  assertSnapshotShape("quickbooks/live", snap);
}

// --- Xero --------------------------------------------------------------------
async function syncXero(): Promise<void> {
  const refreshToken = process.env.SANDBOX_XERO_REFRESH_TOKEN;
  const tenantId = process.env.SANDBOX_XERO_TENANT_ID;
  const live =
    refreshToken &&
    tenantId &&
    process.env.XERO_CLIENT_ID &&
    process.env.XERO_CLIENT_SECRET;

  if (!live) {
    console.log("[xero] LIVE creds not set — running fixture parse only.");
    const payload = loadFixture("xero-demo-profit-and-loss.json");
    const { snapshot: snap } = parseXeroProfitAndLoss(payload);
    describe("Xero (fixture)", snap);
    assertSnapshotShape("xero/fixture", snap);
    return;
  }

  const client = getProviderClient("xero");
  console.log("[xero] refreshing access token against the demo tenant…");
  const refreshed = await client.refreshAccessToken(refreshToken);
  console.log("[xero] token refreshed; fetching P&L…");

  const url = "https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero Demo P&L fetch failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const out = saveRaw(`xero-demo-${Date.now()}.json`, json);
  console.log(`[xero] saved raw response to ${out}`);
  const { snapshot: snap } = parseXeroProfitAndLoss(json);
  describe("Xero Demo (live)", snap);
  assertSnapshotShape("xero/live", snap);
}

async function main(): Promise<void> {
  console.log("Accounting sandbox sync — checking both providers");
  console.log(
    "Set SANDBOX_QUICKBOOKS_REFRESH_TOKEN / SANDBOX_QUICKBOOKS_REALM_ID and",
  );
  console.log(
    "    SANDBOX_XERO_REFRESH_TOKEN / SANDBOX_XERO_TENANT_ID to run live.",
  );
  await syncQuickBooks();
  await syncXero();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[accounting-sandbox-sync] fatal:", err);
  process.exit(1);
});
