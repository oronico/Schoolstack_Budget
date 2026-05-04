// Task #531 — unit test for the preview-data auto-seed.
// Task #541 — extended to assert the third (charter) demo model.
//
// Validates the four behaviors documented in seed-preview-data.ts:
//   1. SKIP_PREVIEW_SEED=true       → no inserts, no reads
//   2. database undefined           → no-op (no DB to seed)
//   3. users table not empty        → no inserts
//   4. users table empty            → 1 user + 3 financial_models inserted
//      with the documented credentials/shape, and at least one model
//      uses fundingProfile === "charter_public_funded" so reviewers can
//      smoke-test the public-funding code path in one click.
//
// Uses an in-memory fake of the drizzle query builder so this stays
// hermetic — no DATABASE_URL required, no migrations to run, runs in
// the same `pnpm test` step as the rest of the api-server suite.

import bcrypt from "bcryptjs";
import {
  seedPreviewDataIfEmpty,
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
} from "../src/lib/seed-preview-data.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

interface InsertedRow {
  table: string;
  values: Record<string, unknown>;
}

function makeFakeDb(opts: { existingUsers?: number } = {}) {
  const inserted: InsertedRow[] = [];
  let nextId = 1;

  const fakeDb = {
    select() {
      return {
        from(_table: unknown) {
          return {
            limit(_n: number) {
              const count = opts.existingUsers ?? 0;
              return Promise.resolve(
                Array.from({ length: count }, (_, i) => ({ id: i + 1 })),
              );
            },
          };
        },
      };
    },
    insert(table: { _: { name?: string } } & Record<string, unknown>) {
      // drizzle's pgTable carries Symbol(drizzle:Name) — extract via any.
      const tableName =
        (table as Record<symbol, unknown>)[
          Symbol.for("drizzle:Name")
        ] as string | undefined ?? "unknown";
      return {
        values(values: Record<string, unknown>) {
          const row = { id: nextId++, ...values };
          inserted.push({ table: tableName, values: row });
          return {
            returning(_proj?: unknown) {
              return Promise.resolve([row]);
            },
          };
        },
      };
    },
  };

  return { fakeDb, inserted };
}

async function run() {
  // Case 1: SKIP_PREVIEW_SEED short-circuits before any DB access.
  {
    const original = process.env.SKIP_PREVIEW_SEED;
    process.env.SKIP_PREVIEW_SEED = "true";
    const { fakeDb, inserted } = makeFakeDb({ existingUsers: 0 });
    const logs: unknown[][] = [];
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: (...a) => logs.push(a),
      logError: () => {},
    });
    check(
      "SKIP_PREVIEW_SEED=true → no inserts",
      inserted.length === 0,
      `inserted=${inserted.length}`,
    );
    check(
      "SKIP_PREVIEW_SEED=true → logs the skip reason",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" && arg.includes("SKIP_PREVIEW_SEED"),
      )),
    );
    if (original === undefined) delete process.env.SKIP_PREVIEW_SEED;
    else process.env.SKIP_PREVIEW_SEED = original;
  }

  // Case 2: missing database (e.g. DATABASE_URL not set) is a no-op.
  {
    const inserted: InsertedRow[] = [];
    await seedPreviewDataIfEmpty({
      database: undefined as never,
      log: () => {},
      logError: () => {},
    });
    check("missing database → no inserts", inserted.length === 0);
  }

  // Case 3: existing users → no inserts (idempotency / prod safety).
  {
    const { fakeDb, inserted } = makeFakeDb({ existingUsers: 1 });
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: () => {},
      logError: () => {},
    });
    check(
      "users table not empty → no inserts",
      inserted.length === 0,
      `inserted=${inserted.length}`,
    );
  }

  // Case 4: empty users table → 1 user + 3 models with the documented shape
  // (microschool + private school + charter — see task #541).
  {
    const { fakeDb, inserted } = makeFakeDb({ existingUsers: 0 });
    const logs: unknown[][] = [];
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: (...a) => logs.push(a),
      logError: () => {},
    });

    const userRows = inserted.filter((r) => r.table === "users");
    const modelRows = inserted.filter((r) => r.table === "financial_models");

    check(
      "empty DB → exactly 1 user inserted",
      userRows.length === 1,
      `users=${userRows.length}`,
    );
    check(
      "empty DB → exactly 3 financial_models inserted",
      modelRows.length === 3,
      `models=${modelRows.length}`,
    );

    // Task #541 — at least one demo model must exercise the
    // charter / public-funding code path (ADM grade-band funding,
    // public-funding revenue rows, charter consultant narrative).
    const charterRows = modelRows.filter(
      (r) =>
        (r.values as { fundingProfile?: string }).fundingProfile ===
        "charter_public_funded",
    );
    check(
      "empty DB → at least one model uses charter_public_funded",
      charterRows.length >= 1,
      `charter_models=${charterRows.length}`,
    );

    const user = userRows[0]?.values as
      | { email?: string; name?: string; passwordHash?: string; termsAcceptedAt?: Date }
      | undefined;

    check(
      "demo user uses the documented email",
      user?.email === DEMO_USER_EMAIL,
      `got=${user?.email}`,
    );
    check(
      "demo user has a name set",
      typeof user?.name === "string" && user!.name.length > 0,
    );
    check(
      "demo user has a bcrypt hash that verifies the documented password",
      typeof user?.passwordHash === "string" &&
        bcrypt.compareSync(DEMO_USER_PASSWORD, user!.passwordHash!),
    );
    check(
      "demo user has termsAcceptedAt set (verified login path)",
      user?.termsAcceptedAt instanceof Date,
    );

    for (const [i, modelRow] of modelRows.entries()) {
      const m = modelRow.values as {
        userId?: number;
        currentStep?: number;
        data?: Record<string, unknown>;
        schoolStage?: string;
        fundingProfile?: string;
      };
      check(
        `model[${i}] is owned by the seeded user`,
        m.userId === userRows[0]?.values.id,
      );
      check(
        `model[${i}] is at the Review/Export step`,
        m.currentStep === 7,
      );
      check(
        `model[${i}] has a populated data blob`,
        !!m.data && Object.keys(m.data).length > 5,
      );
      check(
        `model[${i}] sets schoolStage`,
        m.schoolStage === "new_school" || m.schoolStage === "operating_school",
      );
      check(
        `model[${i}] sets fundingProfile`,
        typeof m.fundingProfile === "string" && m.fundingProfile.length > 0,
      );
    }

    check(
      "empty DB → logs the demo credentials so operators can find them",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" && arg.includes(DEMO_USER_EMAIL),
      )),
    );
  }

  console.log(`\nseed-preview-data: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
