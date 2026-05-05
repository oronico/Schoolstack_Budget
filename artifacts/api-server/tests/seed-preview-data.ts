// Task #531 — unit test for the preview-data auto-seed.
// Task #541 — extended to assert the third (charter) demo model.
// Task #540 — extended to assert PREVIEW_DEMO_PASSWORD override
//             (env-set) and the documented fallback (env-unset).
// Task #558 — extended to assert the fourth (Chesterton Academy) demo
//             model so the chesterton-preview branch deploy never
//             silently regresses to three demos.
//
// Validates the behaviors documented in seed-preview-data.ts:
//   1. SKIP_PREVIEW_SEED=true       → no inserts, no reads
//   2. database undefined           → no-op (no DB to seed)
//   3. users table not empty        → no inserts
//   4. users table empty            → 1 user + 4 financial_models inserted
//      with the documented credentials/shape, including at least one
//      model with fundingProfile === "charter_public_funded" so the
//      public-funding code path is exercised in one click, and a
//      Chesterton Academy demo so the chesterton-preview branch deploy
//      always opens onto the CSN-shaped founding-class scenario.
//   5. PREVIEW_DEMO_PASSWORD unset  → seeded user's hash verifies the
//      documented default password.
//   6. PREVIEW_DEMO_PASSWORD set    → seeded user's hash verifies the
//      override (NOT the default), and the override is what's printed in
//      the operator-credentials log line.
//
// Uses an in-memory fake of the drizzle query builder so this stays
// hermetic — no DATABASE_URL required, no migrations to run, runs in
// the same `pnpm test` step as the rest of the api-server suite.

import bcrypt from "bcryptjs";
import {
  seedPreviewDataIfEmpty,
  resolveDemoPassword,
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
  DEMO_USER_PASSWORD_DEFAULT,
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
  // Task #540: this case also pins the env-unset branch — with no
  // PREVIEW_DEMO_PASSWORD in the environment, the seeded user's hash
  // must verify the documented default password.
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    delete process.env.PREVIEW_DEMO_PASSWORD;
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
      "empty DB → exactly 4 financial_models inserted",
      modelRows.length === 4,
      `models=${modelRows.length}`,
    );

    // Task #558 — at least one demo model must be the Chesterton
    // Academy founding-class demo (name suffix "(Demo Chesterton
    // Academy)"). Reviewers landing on the chesterton-preview branch
    // deploy must always see this scenario after logging in.
    const chestertonRows = modelRows.filter((r) =>
      typeof (r.values as { name?: string }).name === "string" &&
      (r.values as { name: string }).name.includes("Demo Chesterton Academy"),
    );
    check(
      "empty DB → at least one model is the Chesterton Academy demo",
      chestertonRows.length >= 1,
      `chesterton_models=${chestertonRows.length}`,
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

    // Task #540 — env-unset branch: hash must verify the documented
    // default password (NOT some other accidental value).
    check(
      "PREVIEW_DEMO_PASSWORD unset → hash verifies the documented default",
      typeof user?.passwordHash === "string" &&
        bcrypt.compareSync(
          DEMO_USER_PASSWORD_DEFAULT,
          user!.passwordHash!,
        ),
    );
    check(
      "PREVIEW_DEMO_PASSWORD unset → log line names the default source",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" && arg.includes("password source: default"),
      )),
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 5 (task #540): PREVIEW_DEMO_PASSWORD set → hash verifies the
  // override (NOT the default), and the operator-credentials log line
  // prints the override and tags the source as "override".
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    const overridePassword = "s3cret-preview-pw!";
    process.env.PREVIEW_DEMO_PASSWORD = overridePassword;
    const { fakeDb, inserted } = makeFakeDb({ existingUsers: 0 });
    const logs: unknown[][] = [];
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: (...a) => logs.push(a),
      logError: () => {},
    });

    const userRows = inserted.filter((r) => r.table === "users");
    const user = userRows[0]?.values as
      | { passwordHash?: string }
      | undefined;

    check(
      "PREVIEW_DEMO_PASSWORD set → hash verifies the override",
      typeof user?.passwordHash === "string" &&
        bcrypt.compareSync(overridePassword, user!.passwordHash!),
    );
    check(
      "PREVIEW_DEMO_PASSWORD set → hash does NOT verify the default",
      typeof user?.passwordHash === "string" &&
        !bcrypt.compareSync(
          DEMO_USER_PASSWORD_DEFAULT,
          user!.passwordHash!,
        ),
    );
    check(
      "PREVIEW_DEMO_PASSWORD set → log line prints the override password",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" && arg.includes(overridePassword),
      )),
    );
    check(
      "PREVIEW_DEMO_PASSWORD set → log line tags source as override",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" &&
        arg.includes("password source: PREVIEW_DEMO_PASSWORD override"),
      )),
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 6 (task #540): direct unit coverage of the resolver helper —
  // pin both branches independently of the seed flow so a regression
  // in the resolver itself can't be masked by the seed wiring.
  {
    check(
      "resolveDemoPassword({}) → default",
      resolveDemoPassword({} as NodeJS.ProcessEnv) === DEMO_USER_PASSWORD_DEFAULT,
    );
    check(
      "resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: '' }) → default (empty ignored)",
      resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: "" } as NodeJS.ProcessEnv) ===
        DEMO_USER_PASSWORD_DEFAULT,
    );
    check(
      "resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: 'foo' }) → 'foo'",
      resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: "foo" } as NodeJS.ProcessEnv) ===
        "foo",
    );
    check(
      "DEMO_USER_PASSWORD back-compat alias still equals the default",
      DEMO_USER_PASSWORD === DEMO_USER_PASSWORD_DEFAULT,
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
