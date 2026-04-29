// Verifies the account-mapping pipeline used by the accounting providers:
//   1. parseQuickBooksProfitAndLoss / parseXeroProfitAndLoss surface every
//      detail account they encounter, with sensible default classifications.
//   2. applyAccountMappings preserves the legacy heuristic when no overrides
//      are supplied (so unmapped connections behave identically to before).
//   3. Founder overrides actually move totals between buckets — including a
//      non-standard rent label like "Facility Lease".
//
// Run with: pnpm --filter @workspace/api-server exec tsx tests/accounting-account-mapping.ts

import {
  applyAccountMappings,
  computeMappingPrune,
  parseQuickBooksProfitAndLoss,
  parseXeroProfitAndLoss,
} from "../src/lib/accounting/providers.js";
import type { DiscoveredAccount } from "@workspace/db";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- QuickBooks payload (tiny but representative of the real shape) --------

const qbPayload = {
  Header: {
    StartPeriod: "2026-01-01",
    EndPeriod: "2026-12-31",
  },
  Rows: {
    Row: [
      {
        group: "Income",
        Header: { ColData: [{ value: "Income" }] },
        Rows: {
          Row: [
            { ColData: [{ value: "Tuition Income" }, { value: "240000" }] },
            { ColData: [{ value: "Donations" }, { value: "20000" }] },
          ],
        },
        Summary: { ColData: [{ value: "Total Income" }, { value: "260000" }] },
      },
      {
        group: "Expenses",
        Header: { ColData: [{ value: "Expenses" }] },
        Rows: {
          Row: [
            { ColData: [{ value: "Salaries" }, { value: "120000" }] },
            { ColData: [{ value: "Facility Lease" }, { value: "60000" }] },
            { ColData: [{ value: "Supplies" }, { value: "8000" }] },
          ],
        },
        Summary: { ColData: [{ value: "Total Expenses" }, { value: "188000" }] },
      },
    ],
  },
};

console.log("QuickBooks parser");
const qb = parseQuickBooksProfitAndLoss(qbPayload);
check(
  "discovers all detail accounts",
  qb.discoveredAccounts.length === 5,
  `got ${qb.discoveredAccounts.length}`,
);
check(
  "tuition income classified as revenue by default",
  qb.discoveredAccounts.find((a) => a.key === "tuition income")?.defaultKind === "revenue",
);
check(
  "donations classified as revenue by default",
  qb.discoveredAccounts.find((a) => a.key === "donations")?.defaultKind === "revenue",
);
check(
  "salaries classified as expense by default",
  qb.discoveredAccounts.find((a) => a.key === "salaries")?.defaultKind === "expense",
);
check(
  "Facility Lease detected as rent (lease keyword)",
  qb.discoveredAccounts.find((a) => a.key === "facility lease")?.defaultKind === "rent",
);
check(
  "auto snapshot revenue = 260000",
  qb.snapshot.revenue === 260000,
  String(qb.snapshot.revenue),
);
check(
  "auto snapshot expenses = 188000 (folds rent in)",
  qb.snapshot.expenses === 188000,
  String(qb.snapshot.expenses),
);
check(
  "auto monthly rent = 5000 (60000/12)",
  qb.snapshot.monthlyRent === 5000,
  String(qb.snapshot.monthlyRent),
);

// Founder mapping override: move "Donations" out of revenue, treat
// "Supplies" as the rent bucket (silly but proves the kind drives totals).
const overridden = applyAccountMappings(qb.snapshot, qb.discoveredAccounts, {
  donations: "ignore",
  supplies: "rent",
});
check(
  "override drops Donations from revenue",
  overridden.revenue === 240000,
  String(overridden.revenue),
);
check(
  "override re-routes Supplies into rent monthly",
  overridden.monthlyRent === Math.round((60000 + 8000) / 12),
  String(overridden.monthlyRent),
);
check(
  "override keeps total expenses including new rent",
  overridden.expenses === 120000 + 60000 + 8000,
  String(overridden.expenses),
);

// --- Xero payload (different field names but same idea) --------------------

const xeroPayload = {
  Reports: [
    {
      ReportTitles: ["Profit and Loss", "For 12 months ended 31 December 2026"],
      Rows: [
        {
          RowType: "Section",
          Title: "Income",
          Rows: [
            { Cells: [{ Value: "Tuition Revenue" }, { Value: "300000" }] },
            { Cells: [{ Value: "Workshop Income" }, { Value: "12000" }] },
            {
              RowType: "SummaryRow",
              Cells: [{ Value: "Total Income" }, { Value: "312000" }],
            },
          ],
        },
        {
          RowType: "Section",
          Title: "Operating Expenses",
          Rows: [
            { Cells: [{ Value: "Wages" }, { Value: "150000" }] },
            { Cells: [{ Value: "Building Costs" }, { Value: "48000" }] },
            {
              RowType: "SummaryRow",
              Cells: [{ Value: "Total Operating Expenses" }, { Value: "198000" }],
            },
          ],
        },
      ],
    },
  ],
};

console.log("Xero parser");
const xero = parseXeroProfitAndLoss(xeroPayload);
check(
  "discovers Income + Expense detail accounts",
  xero.discoveredAccounts.length === 4,
  `got ${xero.discoveredAccounts.length}`,
);
check(
  "auto snapshot revenue = 312000",
  xero.snapshot.revenue === 312000,
  String(xero.snapshot.revenue),
);
check(
  "auto monthly rent undefined when no rent/lease keyword matches",
  xero.snapshot.monthlyRent === undefined,
  String(xero.snapshot.monthlyRent),
);
check(
  "Building Costs auto-classified as expense (no rent keyword)",
  xero.discoveredAccounts.find((a) => a.key === "building costs")?.defaultKind === "expense",
);

// Founder reclassifies "Building Costs" as rent — the "Facility Lease" /
// "Building Costs" non-standard naming is exactly the pain point this
// task addresses.
const xeroMapped = applyAccountMappings(xero.snapshot, xero.discoveredAccounts, {
  "building costs": "rent",
});
check(
  "override surfaces monthly rent for non-standard label",
  xeroMapped.monthlyRent === 4000,
  String(xeroMapped.monthlyRent),
);
check(
  "override keeps expenses total intact",
  xeroMapped.expenses === 150000 + 48000,
  String(xeroMapped.expenses),
);

// --- Edge cases ------------------------------------------------------------

console.log("Edge cases");
const empty = applyAccountMappings(
  { periodEnd: "2026-12-31", monthsCompleted: 12 },
  [],
  null,
);
check(
  "no discovered accounts returns the base snapshot unchanged",
  empty.revenue === undefined && empty.expenses === undefined && empty.monthlyRent === undefined,
);

const ignoreAll = applyAccountMappings(qb.snapshot, qb.discoveredAccounts, {
  "tuition income": "ignore",
  donations: "ignore",
  salaries: "ignore",
  "facility lease": "ignore",
  supplies: "ignore",
});
check(
  "mapping every account to ignore zeroes the totals",
  ignoreAll.revenue === undefined &&
    ignoreAll.expenses === undefined &&
    ignoreAll.monthlyRent === undefined,
);

// --- computeMappingPrune (drop tracking across syncs) ---------------------
// Mirrors the production scenario: the founder mapped "Facility Lease" as
// rent. The bookkeeper renames the account to "Building Lease" between
// syncs. The next sync should:
//  (a) prune the obsolete mapping entry from `accountMappingsJson`,
//  (b) record the dropped entry (with its old display name + saved kind) in
//      `droppedMappingsJson` so the UI can warn the founder.

console.log("computeMappingPrune");

const prevDiscovered: DiscoveredAccount[] = [
  {
    key: "tuition income",
    name: "Tuition Income",
    section: "income",
    amount: 240000,
    defaultKind: "revenue",
  },
  {
    key: "facility lease",
    name: "Facility Lease",
    section: "expense",
    amount: 60000,
    defaultKind: "rent",
  },
  {
    key: "salaries",
    name: "Salaries",
    section: "expense",
    amount: 120000,
    defaultKind: "expense",
  },
];
const prevMappings = {
  "facility lease": "rent" as const,
  "tuition income": "revenue" as const,
};

const renamedKeys = new Set(["tuition income", "salaries", "building lease"]);
const renamed = computeMappingPrune(
  prevMappings,
  prevDiscovered,
  null,
  renamedKeys,
);
check(
  "rename: tuition income mapping survives because key still present",
  renamed.prunedMappings["tuition income"] === "revenue",
);
check(
  "rename: facility lease mapping is pruned (key vanished)",
  renamed.prunedMappings["facility lease"] === undefined,
);
check(
  "rename: dropped list captures Facility Lease with previous name + kind",
  renamed.droppedMappings.length === 1 &&
    renamed.droppedMappings[0]?.key === "facility lease" &&
    renamed.droppedMappings[0]?.name === "Facility Lease" &&
    renamed.droppedMappings[0]?.kind === "rent",
  JSON.stringify(renamed.droppedMappings),
);

// A *second* sync where the founder hasn't dismissed the previous warning
// and the chart of accounts still doesn't have the renamed account: the
// previous drop should carry forward unchanged (no duplicates).
const secondSync = computeMappingPrune(
  renamed.prunedMappings, // pruned set is what would have been persisted
  [
    {
      key: "tuition income",
      name: "Tuition Income",
      section: "income",
      amount: 250000,
      defaultKind: "revenue",
    },
    {
      key: "salaries",
      name: "Salaries",
      section: "expense",
      amount: 130000,
      defaultKind: "expense",
    },
    {
      key: "building lease",
      name: "Building Lease",
      section: "expense",
      amount: 62000,
      defaultKind: "rent",
    },
  ],
  renamed.droppedMappings,
  renamedKeys,
);
check(
  "second sync: drop persists when key is still missing",
  secondSync.droppedMappings.length === 1 &&
    secondSync.droppedMappings[0]?.key === "facility lease",
  JSON.stringify(secondSync.droppedMappings),
);

// Bookkeeper restores the original account name. The drop should clear.
const restoredKeys = new Set(["tuition income", "salaries", "facility lease"]);
const restored = computeMappingPrune(
  renamed.prunedMappings,
  prevDiscovered,
  renamed.droppedMappings,
  restoredKeys,
);
check(
  "restore: drop clears once the missing key reappears in the sync",
  restored.droppedMappings.length === 0,
  JSON.stringify(restored.droppedMappings),
);

// Defensive: when the previous sync didn't have a discovered account list
// for some reason we still produce a dropped entry, falling back to the key
// itself for the display name.
const noPrevDiscovered = computeMappingPrune(
  { "missing key": "expense" },
  null,
  null,
  new Set(["something else"]),
);
check(
  "no previous discovered list: falls back to key as the display name",
  noPrevDiscovered.droppedMappings.length === 1 &&
    noPrevDiscovered.droppedMappings[0]?.name === "missing key",
);

// Defensive: empty mappings + empty drops + empty current keys returns
// empty results (no crashes, no spurious drops).
const empty2 = computeMappingPrune({}, [], [], new Set());
check(
  "empty inputs produce empty outputs",
  Object.keys(empty2.prunedMappings).length === 0 &&
    empty2.droppedMappings.length === 0,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Failures:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
