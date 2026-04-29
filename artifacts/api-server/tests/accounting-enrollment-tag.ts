// Coverage for the enrollment-tag flow added in task #236:
//   * the QuickBooks Class parser groups sub-classes into parents
//   * the Xero TrackingCategories parser counts active options
//   * `syncAccountingConnection` writes `snapshot.enrollment` from the saved
//     tag's count (and *prefers* the live count over a stale prior-year one)
//   * a sync without a saved tag leaves `snapshot.enrollment` untouched
//
// Same shape as accounting-scheduler.ts: no real DB or HTTP, just an
// in-memory adapter + stub provider client wired through the dependency
// seams the production helper exposes.
import type {
  AccountingConnection,
  DiscoveredEnrollmentTag,
  EnrollmentTagRef,
} from "@workspace/db";
import {
  syncAccountingConnection,
  type AccountingDbAdapter,
} from "../src/lib/accounting/sync.js";
import {
  parseQuickBooksClasses,
  parseXeroTrackingCategories,
  type ProviderClient,
} from "../src/lib/accounting/providers.js";
import { encryptToken } from "../src/lib/accounting/crypto.js";

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

const FIXED_NOW = new Date("2026-04-29T12:00:00Z");

function makeAdapter(rows: AccountingConnection[]): {
  adapter: AccountingDbAdapter;
  rowMap: Map<number, AccountingConnection>;
} {
  const rowMap = new Map<number, AccountingConnection>();
  for (const r of rows) rowMap.set(r.id, { ...r });
  const adapter: AccountingDbAdapter = {
    async listConnections() {
      return Array.from(rowMap.values()).map((r) => ({ ...r }));
    },
    async updateConnection(id, values) {
      const existing = rowMap.get(id);
      if (!existing) return undefined;
      const merged = { ...existing, ...values } as AccountingConnection;
      rowMap.set(id, merged);
      return { ...merged };
    },
  };
  return { adapter, rowMap };
}

function makeConnection(
  overrides: Partial<AccountingConnection> = {},
): AccountingConnection {
  return {
    id: 1,
    modelId: 100,
    userId: 7,
    provider: "quickbooks",
    status: "connected",
    realmId: "realm-123",
    realmDisplayName: "Acme School - QBO",
    accessTokenEncrypted: encryptToken("access-tok"),
    refreshTokenEncrypted: encryptToken("refresh-tok"),
    tokenExpiresAt: new Date(FIXED_NOW.getTime() + 30 * 60 * 1000),
    lastSyncedAt: null,
    lastSyncError: null,
    snapshotJson: null,
    discoveredAccountsJson: null,
    accountMappingsJson: null,
    enrollmentTagJson: null,
    discoveredEnrollmentTagsJson: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  } as AccountingConnection;
}

interface ProviderStubOpts {
  enrollmentSources?: DiscoveredEnrollmentTag[];
  enrollmentSourcesError?: string;
  directCount?: number | undefined;
}

function makeProvider(opts: ProviderStubOpts = {}): ProviderClient {
  return {
    provider: "quickbooks",
    isConfigured: () => true,
    getAuthorizeUrl: () => "https://example.com/auth",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => ({
      accessToken: "x",
      refreshToken: "y",
      expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60 * 1000),
    }),
    fetchProfitAndLoss: async () => ({
      snapshot: {
        periodEnd: "2026-04-30",
        monthsCompleted: 4,
        revenue: 250_000,
        expenses: 230_000,
        monthlyRent: 5_000,
      },
      discoveredAccounts: [],
    }),
    fetchEnrollmentSources: async () => {
      if (opts.enrollmentSourcesError) throw new Error(opts.enrollmentSourcesError);
      return opts.enrollmentSources ?? [];
    },
    fetchEnrollmentCount: async () => opts.directCount,
  };
}

// ---- parser unit tests -----------------------------------------------------

function testParseQuickBooksClasses(): void {
  console.log("\n— parseQuickBooksClasses groups active sub-classes —");
  const payload = {
    QueryResponse: {
      Class: [
        // Two parents: "Students FY26" (3 active children) and
        // "Students FY25" (1 active child + 1 inactive). One orphan child
        // whose parent is missing — should be ignored. One parent with no
        // children — also ignored.
        { Id: "10", Name: "Students FY26", Active: true },
        { Id: "11", Name: "Alice", Active: true, ParentRef: { value: "10" } },
        { Id: "12", Name: "Bob", Active: true, ParentRef: { value: "10" } },
        { Id: "13", Name: "Charlie", Active: true, ParentRef: { value: "10" } },
        { Id: "20", Name: "Students FY25", Active: true },
        { Id: "21", Name: "Dana", Active: true, ParentRef: { value: "20" } },
        { Id: "22", Name: "Old Student", Active: false, ParentRef: { value: "20" } },
        { Id: "30", Name: "Orphans", Active: true, ParentRef: { value: "999" } },
        { Id: "40", Name: "Empty Parent", Active: true },
      ],
    },
  };
  const out = parseQuickBooksClasses(payload);
  check("returned only parents with active children", out.length === 2, `got ${out.length}`);
  const fy26 = out.find((t) => t.id === "10");
  const fy25 = out.find((t) => t.id === "20");
  check("Students FY26 count is 3", fy26?.count === 3, `count=${fy26?.count}`);
  check("Students FY25 count excludes inactive", fy25?.count === 1, `count=${fy25?.count}`);
  check("each result tagged qbo_class", out.every((t) => t.kind === "qbo_class"));
  check(
    "results sorted by name",
    out[0]!.name.localeCompare(out[1]!.name) <= 0,
    `order=${out.map((t) => t.name).join(", ")}`,
  );
}

function testParseXeroTrackingCategories(): void {
  console.log("\n— parseXeroTrackingCategories counts active options —");
  const payload = {
    TrackingCategories: [
      {
        TrackingCategoryID: "cat-1",
        Name: "Students",
        Status: "ACTIVE",
        Options: [
          { TrackingOptionID: "o1", Name: "Alice", Status: "ACTIVE" },
          { TrackingOptionID: "o2", Name: "Bob", Status: "ACTIVE" },
          { TrackingOptionID: "o3", Name: "Old", Status: "DELETED" },
        ],
      },
      {
        TrackingCategoryID: "cat-2",
        Name: "Programs",
        Status: "ACTIVE",
        Options: [{ TrackingOptionID: "o4", Name: "After School", Status: "ACTIVE" }],
      },
      {
        TrackingCategoryID: "cat-3",
        Name: "Archived",
        Status: "DELETED",
        Options: [{ TrackingOptionID: "o5", Name: "Anything", Status: "ACTIVE" }],
      },
      {
        TrackingCategoryID: "cat-4",
        Name: "EmptyCategory",
        Status: "ACTIVE",
        Options: [],
      },
    ],
  };
  const out = parseXeroTrackingCategories(payload);
  check("returned only categories with active options", out.length === 2);
  const students = out.find((t) => t.id === "cat-1");
  check("Students count excludes deleted", students?.count === 2, `count=${students?.count}`);
  check("each result tagged xero_tracking", out.every((t) => t.kind === "xero_tracking"));
}

// ---- end-to-end sync behaviour --------------------------------------------

async function testSyncWritesEnrollmentFromTag(): Promise<void> {
  console.log("\n— sync writes snapshot.enrollment from the saved tag —");
  const tag: EnrollmentTagRef = {
    kind: "qbo_class",
    id: "10",
    name: "Students FY26",
  };
  const conn = makeConnection({ enrollmentTagJson: tag });
  const { adapter, rowMap } = makeAdapter([conn]);
  const client = makeProvider({
    enrollmentSources: [
      { kind: "qbo_class", id: "10", name: "Students FY26", count: 82 },
      { kind: "qbo_class", id: "20", name: "Students FY25", count: 75 },
    ],
  });

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });

  check("ok", result.ok === true);
  const row = rowMap.get(conn.id)!;
  check(
    "snapshot.enrollment is the live count",
    row.snapshotJson?.enrollment === 82,
    `enrollment=${row.snapshotJson?.enrollment}`,
  );
  check(
    "discovered tags persisted",
    Array.isArray(row.discoveredEnrollmentTagsJson) &&
      row.discoveredEnrollmentTagsJson!.length === 2,
    `tags=${JSON.stringify(row.discoveredEnrollmentTagsJson)}`,
  );
  check(
    "snapshot still carries P&L fields",
    row.snapshotJson?.revenue === 250_000 && row.snapshotJson?.expenses === 230_000,
  );
}

async function testSyncFallsBackToDirectCount(): Promise<void> {
  console.log("\n— sync falls back to fetchEnrollmentCount when missing from list —");
  const tag: EnrollmentTagRef = {
    kind: "qbo_class",
    id: "999",
    name: "Hidden Class",
  };
  const conn = makeConnection({ enrollmentTagJson: tag });
  const { adapter, rowMap } = makeAdapter([conn]);
  const client = makeProvider({
    enrollmentSources: [], // saved tag isn't in the list
    directCount: 42,
  });

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });

  check("ok", result.ok === true);
  const row = rowMap.get(conn.id)!;
  check(
    "snapshot.enrollment uses direct count",
    row.snapshotJson?.enrollment === 42,
    `enrollment=${row.snapshotJson?.enrollment}`,
  );
}

async function testSyncWithoutTagLeavesEnrollmentEmpty(): Promise<void> {
  console.log("\n— sync with no saved tag leaves snapshot.enrollment unset —");
  const conn = makeConnection({ enrollmentTagJson: null });
  const { adapter, rowMap } = makeAdapter([conn]);
  const client = makeProvider({
    enrollmentSources: [
      { kind: "qbo_class", id: "10", name: "Students FY26", count: 82 },
    ],
  });

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });

  check("ok", result.ok === true);
  const row = rowMap.get(conn.id)!;
  check(
    "snapshot.enrollment is undefined",
    row.snapshotJson?.enrollment === undefined,
    `enrollment=${row.snapshotJson?.enrollment}`,
  );
  check(
    "discovered tags still persisted (powers the picker)",
    Array.isArray(row.discoveredEnrollmentTagsJson) &&
      row.discoveredEnrollmentTagsJson!.length === 1,
  );
}

async function testEnrollmentSourcesFailureDoesNotFailSync(): Promise<void> {
  console.log("\n— enrollment list failure preserves previous discovered list —");
  const previousList: DiscoveredEnrollmentTag[] = [
    { kind: "qbo_class", id: "10", name: "Students FY26", count: 80 },
  ];
  const conn = makeConnection({
    enrollmentTagJson: null,
    discoveredEnrollmentTagsJson: previousList,
  });
  const { adapter, rowMap } = makeAdapter([conn]);
  const client = makeProvider({
    enrollmentSourcesError: "503 Service Unavailable",
  });

  const result = await syncAccountingConnection(conn, {
    dbAdapter: adapter,
    getProviderClient: () => client,
  });

  check("sync still succeeded", result.ok === true);
  const row = rowMap.get(conn.id)!;
  check(
    "previous discovered tags retained",
    row.discoveredEnrollmentTagsJson?.[0]?.id === "10",
    `tags=${JSON.stringify(row.discoveredEnrollmentTagsJson)}`,
  );
  check("status connected", row.status === "connected");
}

async function main(): Promise<void> {
  testParseQuickBooksClasses();
  testParseXeroTrackingCategories();
  await testSyncWritesEnrollmentFromTag();
  await testSyncFallsBackToDirectCount();
  await testSyncWithoutTagLeavesEnrollmentEmpty();
  await testEnrollmentSourcesFailureDoesNotFailSync();

  console.log("\n========================");
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
  console.log("All accounting enrollment-tag tests passed.");
}

void main();
