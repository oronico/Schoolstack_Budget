// Task #531 — unit test for the preview-data auto-seed.
// Task #541 — extended to assert the third (charter) demo model.
// Task #540 — extended to assert PREVIEW_DEMO_PASSWORD override
//             (env-set) and the documented fallback (env-unset).
// Task #558 — extended to assert the fourth (Chesterton Academy) demo
//             model so the chesterton-preview branch deploy never
//             silently regresses to fewer than four demos.
// Task #551 — extended to assert in-place rotation of the demo
//             password on already-seeded previews when the
//             PREVIEW_DEMO_PASSWORD env var changes.
// Task #560 — extended to assert the fifth (Chesterton Academy CSN
//             Operating Manual View) demo, which uses
//             `schoolType: "chesterton_academy"` so the wizard
//             switches to the dedicated CHESTERTON_STEPS branch and
//             the CSN Operating Manual export tab gates on the moment
//             the reviewer opens the model.
//
// Validates the behaviors documented in seed-preview-data.ts:
//   1. SKIP_PREVIEW_SEED=true       → no inserts, no reads
//   2. database undefined           → no-op (no DB to seed)
//   3. users table not empty        → no inserts
//   4. users table empty            → 1 user + 5 financial_models inserted
//      with the documented credentials/shape, including at least one
//      model with fundingProfile === "charter_public_funded" so the
//      public-funding code path is exercised in one click, a
//      Chesterton Academy demo so the chesterton-preview branch deploy
//      always opens onto the CSN-shaped founding-class scenario, and
//      a fifth model with `schoolType: "chesterton_academy"` so the
//      dedicated wizard branch + CSN Operating Manual export are also
//      pre-staged.
//   5. PREVIEW_DEMO_PASSWORD unset  → seeded user's hash verifies the
//      documented default password.
//   6. PREVIEW_DEMO_PASSWORD set    → seeded user's hash verifies the
//      override (NOT the default), and the override is what's printed in
//      the operator-credentials log line.
//   7. Already-seeded preview + new PREVIEW_DEMO_PASSWORD → demo user's
//      passwordHash is updated in place so the new value verifies and
//      the old one does not.
//   8. Already-seeded preview + matching PREVIEW_DEMO_PASSWORD → demo
//      user's passwordHash is left alone (no spurious update).
//   9. Already-seeded preview but no `demo@schoolstack.ai` row (prod
//      shape) → no update issued (prod safety).
//
// Uses an in-memory fake of the drizzle query builder so this stays
// hermetic — no DATABASE_URL required, no migrations to run, runs in
// the same `pnpm test` step as the rest of the api-server suite.

// Task #846 — pin NODE_ENV=test so the test runner sits inside the
// allow-list of "safe to fall back to the documented default password"
// environments. Production / staging / preview / unset are explicitly
// rejected by `resolveDemoPassword` and exercised in dedicated cases
// below.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import bcrypt from "bcryptjs";
import {
  seedPreviewDataIfEmpty,
  resolveDemoPassword,
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
  DEMO_USER_PASSWORD_DEFAULT,
  PreviewSeedConfigError,
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

interface UpdatedRow {
  table: string;
  set: Record<string, unknown>;
}

interface FakeUser {
  id: number;
  email: string;
  passwordHash: string;
}

function makeFakeDb(
  opts: { existingUsers?: number; demoUsers?: FakeUser[] } = {},
) {
  const inserted: InsertedRow[] = [];
  const updated: UpdatedRow[] = [];
  // The select pipeline is shaped to emulate the small slice of the
  // drizzle query builder this module actually uses:
  //   - select({...}).from(t).limit(n)            → existence probe
  //   - select({...}).from(t).where(c).limit(n)   → demo-user lookup
  // The probe is keyed on the absence of a `where` (returns the
  // synthetic existingUsers list); the lookup is keyed on the
  // presence of `where` (returns the configured demoUsers list,
  // defaulted to empty so prod-shaped DBs return no demo row).
  let nextId = 1;
  const demoUsers = opts.demoUsers ?? [];

  const fakeDb = {
    select(_proj?: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                limit(_n: number) {
                  return Promise.resolve(demoUsers.slice(0, _n));
                },
              };
            },
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
    update(table: { _: { name?: string } } & Record<string, unknown>) {
      const tableName =
        (table as Record<symbol, unknown>)[
          Symbol.for("drizzle:Name")
        ] as string | undefined ?? "unknown";
      return {
        set(values: Record<string, unknown>) {
          updated.push({ table: tableName, set: values });
          return {
            where(_cond: unknown) {
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  return { fakeDb, inserted, updated };
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

  // Case 3: existing users with no demo row → no inserts AND no
  // updates (this is the production shape — real users, no
  // `demo@schoolstack.ai` row — and we must never touch it).
  {
    const { fakeDb, inserted, updated } = makeFakeDb({
      existingUsers: 1,
      demoUsers: [],
    });
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
    check(
      "users table not empty + no demo row → no updates (prod safety)",
      updated.length === 0,
      `updated=${updated.length}`,
    );
  }

  // Case 4: empty users table → 1 user + 5 models with the documented shape
  // (microschool + private school + charter — see task #541 — plus the
  // CSN-shaped Chesterton academy added in task #558, plus the dedicated
  // chesterton_academy / CSN Operating Manual View demo added in task #560).
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
      "empty DB → exactly 5 financial_models inserted",
      modelRows.length === 5,
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

    // Task #560 — at least one demo model must use
    // `schoolType: "chesterton_academy"` so the dedicated wizard
    // branch (CHESTERTON_STEPS) and the CSN Operating Manual export
    // tab gate on the moment a reviewer opens the model. The shape
    // also requires a populated `data.chesterton.*` block, since
    // every Chesterton-branch step reads exclusively from there. We
    // pin both invariants here because either one missing breaks the
    // dedicated CSN reviewer experience.
    const csnWizardRows = modelRows.filter((r) => {
      const data = (r.values as { data?: Record<string, unknown> }).data;
      const profile = data?.schoolProfile as Record<string, unknown> | undefined;
      const chesterton = data?.chesterton as Record<string, unknown> | undefined;
      return (
        profile?.schoolType === "chesterton_academy" &&
        !!chesterton &&
        Array.isArray(chesterton.phaseEnrollment)
      );
    });
    check(
      "empty DB → at least one model uses schoolType=chesterton_academy with a chesterton.* block",
      csnWizardRows.length >= 1,
      `csn_wizard_models=${csnWizardRows.length}`,
    );
    check(
      "empty DB → CSN-wizard demo's chesterton.phaseEnrollment has all four grades",
      (() => {
        const data = (csnWizardRows[0]?.values as { data?: Record<string, unknown> })?.data;
        const phase = (data?.chesterton as { phaseEnrollment?: Array<{ grade?: string }> } | undefined)?.phaseEnrollment;
        if (!Array.isArray(phase)) return false;
        const grades = new Set(phase.map((r) => r?.grade));
        return ["freshman", "sophomore", "junior", "senior"].every((g) => grades.has(g));
      })(),
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

  // Case 7 (task #551): already-seeded preview + new
  // PREVIEW_DEMO_PASSWORD → demo user's stored hash is rotated in
  // place so the new value verifies and the old one no longer does.
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    const oldPassword = "old-demo-pw";
    const newPassword = "rotated-preview-pw!";
    process.env.PREVIEW_DEMO_PASSWORD = newPassword;
    const oldHash = bcrypt.hashSync(oldPassword, 4);
    const { fakeDb, inserted, updated } = makeFakeDb({
      existingUsers: 1,
      demoUsers: [
        { id: 42, email: DEMO_USER_EMAIL, passwordHash: oldHash },
      ],
    });
    const logs: unknown[][] = [];
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: (...a) => logs.push(a),
      logError: () => {},
    });

    check(
      "rotation: no inserts on already-seeded DB",
      inserted.length === 0,
      `inserted=${inserted.length}`,
    );
    check(
      "rotation: exactly one users update issued",
      updated.length === 1 && updated[0]?.table === "users",
      `updated=${JSON.stringify(updated.map((u) => u.table))}`,
    );

    const newHash = updated[0]?.set.passwordHash as string | undefined;
    check(
      "rotation: new hash verifies the new env value",
      typeof newHash === "string" && bcrypt.compareSync(newPassword, newHash),
    );
    check(
      "rotation: new hash does NOT verify the old password",
      typeof newHash === "string" && !bcrypt.compareSync(oldPassword, newHash),
    );
    check(
      "rotation: log line names the override source",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" &&
        arg.includes("Rotated demo password") &&
        arg.includes("PREVIEW_DEMO_PASSWORD override"),
      )),
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 8 (task #551): already-seeded preview + matching
  // PREVIEW_DEMO_PASSWORD → no spurious update (idempotent across
  // restarts so we don't churn bcrypt on every boot).
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    const currentPassword = "already-current-pw";
    process.env.PREVIEW_DEMO_PASSWORD = currentPassword;
    const currentHash = bcrypt.hashSync(currentPassword, 4);
    const { fakeDb, inserted, updated } = makeFakeDb({
      existingUsers: 1,
      demoUsers: [
        { id: 7, email: DEMO_USER_EMAIL, passwordHash: currentHash },
      ],
    });
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: () => {},
      logError: () => {},
    });

    check(
      "rotation no-op: no inserts when hash already verifies",
      inserted.length === 0,
    );
    check(
      "rotation no-op: no updates when hash already verifies",
      updated.length === 0,
      `updated=${updated.length}`,
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 9 (task #551): already-seeded preview + env-unset → if the
  // stored hash already verifies the documented default, the seed is
  // a no-op (no churn). This covers the common "operator never set
  // the override" preview shape.
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    delete process.env.PREVIEW_DEMO_PASSWORD;
    const defaultHash = bcrypt.hashSync(DEMO_USER_PASSWORD_DEFAULT, 4);
    const { fakeDb, updated } = makeFakeDb({
      existingUsers: 1,
      demoUsers: [
        { id: 11, email: DEMO_USER_EMAIL, passwordHash: defaultHash },
      ],
    });
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: () => {},
      logError: () => {},
    });

    check(
      "rotation env-unset: no updates when hash matches the default",
      updated.length === 0,
      `updated=${updated.length}`,
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 10 (task #551): already-seeded preview where the operator
  // CLEARED PREVIEW_DEMO_PASSWORD → demo user's hash gets rotated
  // back to the documented default (so resetting the override is also
  // a one-step "edit env var → restart" flow).
  {
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    delete process.env.PREVIEW_DEMO_PASSWORD;
    const stalePassword = "previously-overridden-pw";
    const staleHash = bcrypt.hashSync(stalePassword, 4);
    const { fakeDb, updated } = makeFakeDb({
      existingUsers: 1,
      demoUsers: [
        { id: 99, email: DEMO_USER_EMAIL, passwordHash: staleHash },
      ],
    });
    const logs: unknown[][] = [];
    await seedPreviewDataIfEmpty({
      database: fakeDb as never,
      log: (...a) => logs.push(a),
      logError: () => {},
    });

    const newHash = updated[0]?.set.passwordHash as string | undefined;
    check(
      "rotation env-cleared: exactly one users update issued",
      updated.length === 1 && updated[0]?.table === "users",
    );
    check(
      "rotation env-cleared: new hash verifies the documented default",
      typeof newHash === "string" &&
        bcrypt.compareSync(DEMO_USER_PASSWORD_DEFAULT, newHash),
    );
    check(
      "rotation env-cleared: log line tags source as default",
      logs.some((row) => row.some((arg) =>
        typeof arg === "string" &&
        arg.includes("Rotated demo password") &&
        arg.includes("password source: default"),
      )),
    );

    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
  }

  // Case 6 (task #540): direct unit coverage of the resolver helper —
  // pin both branches independently of the seed flow so a regression
  // in the resolver itself can't be masked by the seed wiring.
  {
    // Task #846 — env-unset (no NODE_ENV at all) is no longer
    // a safe fallback; the resolver now throws so a misconfigured
    // deploy can't silently use 'demo1234'.
    let threwUnset = false;
    try {
      resolveDemoPassword({} as NodeJS.ProcessEnv);
    } catch (err) {
      threwUnset = err instanceof PreviewSeedConfigError;
    }
    check(
      "resolveDemoPassword({}) → throws PreviewSeedConfigError (env-unset is not safe)",
      threwUnset,
    );
    check(
      "resolveDemoPassword({ NODE_ENV: 'test' }) → default (test runner allow-list)",
      resolveDemoPassword({ NODE_ENV: "test" } as NodeJS.ProcessEnv) ===
        DEMO_USER_PASSWORD_DEFAULT,
    );
    check(
      "resolveDemoPassword({ NODE_ENV: 'development' }) → default (dev allow-list)",
      resolveDemoPassword({ NODE_ENV: "development" } as NodeJS.ProcessEnv) ===
        DEMO_USER_PASSWORD_DEFAULT,
    );
    check(
      "resolveDemoPassword({ NODE_ENV: 'test', PREVIEW_DEMO_PASSWORD: '' }) → default (empty override ignored)",
      resolveDemoPassword({
        NODE_ENV: "test",
        PREVIEW_DEMO_PASSWORD: "",
      } as NodeJS.ProcessEnv) === DEMO_USER_PASSWORD_DEFAULT,
    );
    check(
      "resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: 'foo' }) → 'foo' (override wins regardless of NODE_ENV)",
      resolveDemoPassword({ PREVIEW_DEMO_PASSWORD: "foo" } as NodeJS.ProcessEnv) ===
        "foo",
    );

    // Task #846 — production / staging / preview / any custom value
    // MUST require an explicit override; the documented 'demo1234'
    // fallback may not silently land in those environments.
    for (const nodeEnv of ["production", "staging", "preview", "review-app", "ci"]) {
      let threw = false;
      let isConfig = false;
      try {
        resolveDemoPassword({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
      } catch (err) {
        threw = true;
        isConfig = err instanceof PreviewSeedConfigError;
      }
      check(
        `resolveDemoPassword({ NODE_ENV: '${nodeEnv}' }) without override → throws PreviewSeedConfigError`,
        threw && isConfig,
      );
      check(
        `resolveDemoPassword({ NODE_ENV: '${nodeEnv}', PREVIEW_DEMO_PASSWORD: 'set' }) → uses override`,
        resolveDemoPassword({
          NODE_ENV: nodeEnv,
          PREVIEW_DEMO_PASSWORD: "set",
        } as NodeJS.ProcessEnv) === "set",
      );
    }

    check(
      "DEMO_USER_PASSWORD back-compat alias still equals the default",
      DEMO_USER_PASSWORD === DEMO_USER_PASSWORD_DEFAULT,
    );
  }

  // Case 11 (task #846) — production-shaped seed call without
  // PREVIEW_DEMO_PASSWORD must fail loudly: the
  // `PreviewSeedConfigError` thrown by `resolveDemoPassword` escapes
  // `seedPreviewDataIfEmpty`'s outer try/catch instead of being
  // swallowed, so a misconfigured deploy is a visible startup
  // failure rather than a silent fall-back to 'demo1234'.
  {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPwd = process.env.PREVIEW_DEMO_PASSWORD;
    const originalSkip = process.env.SKIP_PREVIEW_SEED;
    process.env.NODE_ENV = "production";
    delete process.env.PREVIEW_DEMO_PASSWORD;
    delete process.env.SKIP_PREVIEW_SEED;
    const { fakeDb, inserted } = makeFakeDb({ existingUsers: 0 });
    const errors: unknown[][] = [];
    let escaped: unknown = null;
    try {
      await seedPreviewDataIfEmpty({
        database: fakeDb as never,
        log: () => {},
        logError: (...a) => errors.push(a),
      });
    } catch (err) {
      escaped = err;
    }
    check(
      "production + no PREVIEW_DEMO_PASSWORD → seed throws PreviewSeedConfigError (does not soft-fail)",
      escaped instanceof PreviewSeedConfigError,
      `escaped=${(escaped as Error)?.constructor?.name}`,
    );
    check(
      "production + no PREVIEW_DEMO_PASSWORD → no inserts (no demo user written)",
      inserted.length === 0,
      `inserted=${inserted.length}`,
    );
    check(
      "production + no PREVIEW_DEMO_PASSWORD → logs the refusal reason",
      errors.some((row) => row.some((arg) =>
        typeof arg === "string" && arg.includes("Refusing to seed"),
      )),
    );

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalPwd === undefined) delete process.env.PREVIEW_DEMO_PASSWORD;
    else process.env.PREVIEW_DEMO_PASSWORD = originalPwd;
    if (originalSkip === undefined) delete process.env.SKIP_PREVIEW_SEED;
    else process.env.SKIP_PREVIEW_SEED = originalSkip;
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
