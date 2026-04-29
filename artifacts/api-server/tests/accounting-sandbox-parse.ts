// Sandbox-fixture parser test for the accounting providers.
//
// Goal: prove that the QuickBooks Sandbox / Xero Demo Company P&L payload
// shapes parse into the expected `AccountingSyncSnapshot`. The fixtures in
// ./fixtures/* mirror the actual sandbox response shape (multiple expense
// sections, COGS, gross/net summary rows, etc.), so a regression in the
// parser will fail this check without needing real OAuth credentials.
//
// The companion `accounting-sandbox-sync.ts` script can additionally pull
// real sandbox data when env vars are present; this file is the always-on
// piece of the walkthrough described in
// `src/lib/accounting/SANDBOX-WALKTHROUGH.md`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseQuickBooksProfitAndLoss,
  parseXeroProfitAndLoss,
} from "../src/lib/accounting/providers.js";
import type { AccountingSyncSnapshot } from "@workspace/db";

const here = path.dirname(fileURLToPath(import.meta.url));

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

function eq<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function loadFixture(name: string): Record<string, unknown> {
  const file = path.join(here, "fixtures", name);
  return JSON.parse(readFileSync(file, "utf8"));
}

function describe(snapshot: AccountingSyncSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ---------------------------------------------------------------------------
// QuickBooks Sandbox
// ---------------------------------------------------------------------------
function testQuickBooks(): void {
  console.log("\n— QuickBooks Sandbox P&L parser —");
  const payload = loadFixture("quickbooks-sandbox-profit-and-loss.json");
  const { snapshot: snap } = parseQuickBooksProfitAndLoss(payload);
  console.log(describe(snap));

  eq("periodEnd", snap.periodEnd, "2024-09-30");
  eq("monthsCompleted", snap.monthsCompleted, 9);
  eq("revenue (= Total Income)", snap.revenue, 192000);
  // Expense total must include Operating Expenses + COGS + Other Expenses
  // to match the live P&L. 153300 + 8000 + 450 = 161750.
  eq("expenses (= Operating + COGS + Other)", snap.expenses, 161750);
  // Rent or Lease = $27,000 over 9 months → $3,000/month.
  eq("monthlyRent", snap.monthlyRent, 3000);

  // Net income sanity check: revenue - expenses should equal $30,250.
  const net = (snap.revenue ?? 0) - (snap.expenses ?? 0);
  eq("net income reconciles to $30,250", net, 30250);
}

// ---------------------------------------------------------------------------
// Xero Demo Company
// ---------------------------------------------------------------------------
function testXero(): void {
  console.log("\n— Xero Demo Company P&L parser —");
  const payload = loadFixture("xero-demo-profit-and-loss.json");
  const { snapshot: snap } = parseXeroProfitAndLoss(payload);
  console.log(describe(snap));

  eq("periodEnd", snap.periodEnd, "2024-09-30");
  eq("monthsCompleted", snap.monthsCompleted, 9);
  eq("revenue (= Total Income)", snap.revenue, 192000);
  // Expense total must include Operating Expenses + Cost of Sales to match
  // the live P&L. 153300 + 8000 = 161300.
  eq("expenses (= Operating + Cost of Sales)", snap.expenses, 161300);
  // Rent = $27,000 over 9 months → $3,000/month.
  eq("monthlyRent", snap.monthlyRent, 3000);

  const net = (snap.revenue ?? 0) - (snap.expenses ?? 0);
  eq("net profit reconciles to $30,700", net, 30700);
}

testQuickBooks();
testXero();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
