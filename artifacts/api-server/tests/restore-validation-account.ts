// Task #581 — unit tests for ensureRestoreValidationAccount.
//
// Validates the four behaviors documented in
// src/lib/restore-validation-account.ts:
//   1. No DATABASE → skipped with reason.
//   2. Missing/short RESTORE_VALIDATION_PASSWORD → skipped with reason.
//   3. User does not exist → user + model inserted with the documented
//      email and a verifiable password hash.
//   4. User exists with stale password → password rotated in place.
//   5. User exists with current password but no model → model inserted.
//   6. User exists with current password and a model → no inserts/updates.
//
// Uses an in-memory fake of the drizzle query builder so this stays
// hermetic — no DATABASE_URL required, no migrations to run.

import bcrypt from "bcryptjs";
import {
  ensureRestoreValidationAccount,
  RESTORE_VALIDATION_EMAIL,
  RESTORE_VALIDATION_MODEL_NAME,
} from "../src/lib/restore-validation-account.js";

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

interface FakeUser {
  id: number;
  email: string;
  passwordHash: string;
}

interface InsertedRow {
  table: "users" | "models";
  values: Record<string, unknown>;
}

interface UpdatedRow {
  table: "users" | "models";
  set: Record<string, unknown>;
}

function makeFakeDb(opts: {
  user?: FakeUser;
  hasModel?: boolean;
}) {
  const inserted: InsertedRow[] = [];
  const updated: UpdatedRow[] = [];
  let nextUserId = (opts.user?.id ?? 0) + 1;
  let nextModelId = 1000;

  // Track which "from" we're in so the where().limit() resolves to
  // the right fake rows. Drizzle calls .from(table) before .where,
  // and the module imports `usersTable` and `financialModelsTable`
  // by reference — we identify them by checking which call came
  // first in the chain via a small marker.
  let currentTable: "users" | "models" | null = null;

  function tableKind(table: unknown): "users" | "models" {
    // Drizzle stamps the table name on a Symbol-keyed property
    // (Symbol(drizzle:Name)). Find it by description so the fake
    // doesn't depend on importing drizzle-internals.
    const sym = Object.getOwnPropertySymbols(table as object).find(
      (s) => s.description === "drizzle:Name",
    );
    const name = sym ? String((table as Record<symbol, unknown>)[sym]) : "";
    return name.includes("financial_models") ? "models" : "users";
  }

  const fakeDb = {
    select(_proj?: unknown) {
      return {
        from(table: unknown) {
          currentTable = tableKind(table);
          return {
            where(_cond: unknown) {
              return {
                limit(n: number) {
                  if (currentTable === "users") {
                    return Promise.resolve(opts.user ? [opts.user].slice(0, n) : []);
                  }
                  return Promise.resolve(
                    opts.hasModel ? [{ id: 1 }].slice(0, n) : [],
                  );
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      const which = tableKind(table);
      return {
        values(values: Record<string, unknown>) {
          inserted.push({ table: which, values });
          return {
            returning(_proj?: unknown) {
              if (which === "users") {
                const id = nextUserId++;
                return Promise.resolve([{ id }]);
              }
              const id = nextModelId++;
              return Promise.resolve([{ id }]);
            },
          };
        },
      };
    },
    update(table: unknown) {
      const which = tableKind(table);
      return {
        set(set: Record<string, unknown>) {
          updated.push({ table: which, set });
          return {
            where(_cond: unknown) {
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  } as never;

  return { fakeDb, inserted, updated };
}

async function main(): Promise<void> {
  // 1. Missing DB. Pass an explicit null so the `?? db` fallback
  //    doesn't pick up the module-level `db` (which is truthy in the
  //    test env even without DATABASE_URL configured).
  {
    const r = await ensureRestoreValidationAccount({
      database: null as never,
      log: () => {},
      password: "supersecret123",
    });
    check(
      "1. skipped when database null",
      r.status === "skipped" && r.reason.includes("DATABASE_URL"),
    );
  }

  // 2. Missing/short password.
  {
    const { fakeDb } = makeFakeDb({});
    const r = await ensureRestoreValidationAccount({
      database: fakeDb,
      log: () => {},
      password: "short",
    });
    check(
      "2. skipped when password missing/short",
      r.status === "skipped" && r.reason.includes("RESTORE_VALIDATION_PASSWORD"),
    );
  }

  // 3. User does not exist → user + model inserted.
  {
    const { fakeDb, inserted } = makeFakeDb({});
    const r = await ensureRestoreValidationAccount({
      database: fakeDb,
      log: () => {},
      password: "supersecret123",
    });
    check(
      "3a. ok when user missing",
      r.status === "ok" && r.created && r.modelCreated && !r.passwordRotated,
    );
    const userInsert = inserted.find((i) => i.table === "users");
    const modelInsert = inserted.find((i) => i.table === "models");
    check("3b. inserted users row", !!userInsert);
    check(
      "3c. inserted user has documented email",
      userInsert?.values.email === RESTORE_VALIDATION_EMAIL,
    );
    check(
      "3d. inserted user has bcrypt hash that verifies the env password",
      typeof userInsert?.values.passwordHash === "string" &&
        bcrypt.compareSync(
          "supersecret123",
          userInsert.values.passwordHash as string,
        ),
    );
    check("3e. inserted models row", !!modelInsert);
    check(
      "3f. inserted model has documented name",
      modelInsert?.values.name === RESTORE_VALIDATION_MODEL_NAME,
    );
  }

  // 4. User exists with stale password → password rotated.
  {
    const staleHash = bcrypt.hashSync("old-password", 4);
    const { fakeDb, inserted, updated } = makeFakeDb({
      user: { id: 42, email: RESTORE_VALIDATION_EMAIL, passwordHash: staleHash },
      hasModel: true,
    });
    const r = await ensureRestoreValidationAccount({
      database: fakeDb,
      log: () => {},
      password: "new-password-123",
    });
    check(
      "4a. ok when user exists with stale password",
      r.status === "ok" && !r.created && r.passwordRotated && !r.modelCreated,
    );
    check(
      "4b. no inserts when user + model already exist",
      inserted.length === 0,
    );
    const userUpdate = updated.find((u) => u.table === "users");
    check("4c. issued users update", !!userUpdate);
    check(
      "4d. update set a hash that verifies the new password",
      typeof userUpdate?.set.passwordHash === "string" &&
        bcrypt.compareSync(
          "new-password-123",
          userUpdate.set.passwordHash as string,
        ),
    );
  }

  // 5. User exists with current password but no model → model inserted.
  {
    const goodHash = bcrypt.hashSync("supersecret123", 4);
    const { fakeDb, inserted, updated } = makeFakeDb({
      user: { id: 7, email: RESTORE_VALIDATION_EMAIL, passwordHash: goodHash },
      hasModel: false,
    });
    const r = await ensureRestoreValidationAccount({
      database: fakeDb,
      log: () => {},
      password: "supersecret123",
    });
    check(
      "5a. ok with model creation only",
      r.status === "ok" && !r.created && !r.passwordRotated && r.modelCreated,
    );
    check("5b. no users updates", updated.length === 0);
    check(
      "5c. exactly one models insert",
      inserted.length === 1 && inserted[0].table === "models",
    );
  }

  // 6. Fully present → no inserts, no updates.
  {
    const goodHash = bcrypt.hashSync("supersecret123", 4);
    const { fakeDb, inserted, updated } = makeFakeDb({
      user: { id: 7, email: RESTORE_VALIDATION_EMAIL, passwordHash: goodHash },
      hasModel: true,
    });
    const r = await ensureRestoreValidationAccount({
      database: fakeDb,
      log: () => {},
      password: "supersecret123",
    });
    check(
      "6a. ok no-op when fully present",
      r.status === "ok" && !r.created && !r.passwordRotated && !r.modelCreated,
    );
    check("6b. no inserts on no-op", inserted.length === 0);
    check("6c. no updates on no-op", updated.length === 0);
  }

  console.log(`\nrestore-validation-account: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
