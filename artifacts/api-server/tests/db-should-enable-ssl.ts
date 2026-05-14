// Task #851 — lock in the SSL-decision rules for the Postgres pool.
//
// Task #849 broadened `shouldEnableSsl` so that custom Railway/Neon domains
// (and other unknown production hosts) can't silently fall back to
// plaintext. This test exercises every branch of that decision so a future
// refactor can't quietly re-introduce the old bug.
//
// Branches covered:
//   1. URL `?sslmode=disable`   → off (overrides everything else)
//   2. URL `?sslmode=require`   → on
//   3. URL `?sslmode=verify-full` (any non-disable value) → on
//   4. `PGSSLMODE=disable` env  → off when URL has no sslmode
//   5. `PGSSLMODE=require` env  → on  when URL has no sslmode
//   6. URL sslmode wins over PGSSLMODE
//   7. Known managed-host substrings: railway.app, rlwy.net, neon.tech → on
//   8. Production-default-on for unknown public host
//   9. Loopback / helium / *.local / *.internal exemptions in production
//  10. Dev/test (NODE_ENV != production) against an unknown host stays off
//  11. Malformed URLs still consult env + substring + production rules

import assert from "node:assert/strict";
import { shouldEnableSsl } from "@workspace/db";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_PGSSLMODE = process.env.PGSSLMODE;

function withEnv(
  env: { NODE_ENV?: string; PGSSLMODE?: string },
  fn: () => void,
): void {
  const prevNode = process.env.NODE_ENV;
  const prevPg = process.env.PGSSLMODE;
  if ("NODE_ENV" in env) {
    if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env.NODE_ENV;
  }
  if ("PGSSLMODE" in env) {
    if (env.PGSSLMODE === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = env.PGSSLMODE;
  }
  try {
    fn();
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevPg === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = prevPg;
  }
}

// Always start each case from a clean env so cross-test pollution can't
// hide a regression.
delete process.env.PGSSLMODE;

let passed = 0;
function check(label: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log("\nshouldEnableSsl — branch coverage");

// 1. URL ?sslmode=disable wins over everything (even managed-host substrings
//    and production defaults).
check("?sslmode=disable forces SSL off", () => {
  withEnv({ NODE_ENV: "production", PGSSLMODE: "require" }, () => {
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@db.example.com/app?sslmode=disable",
      ),
      false,
    );
    // Managed-host substring must NOT override an explicit disable.
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@maglev.proxy.rlwy.net:1234/app?sslmode=disable",
      ),
      false,
    );
  });
});

// 2. URL ?sslmode=require turns SSL on.
check("?sslmode=require forces SSL on", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.example.com/app?sslmode=require"),
      true,
    );
  });
});

// 3. Any non-disable sslmode value (verify-full / verify-ca / prefer / allow)
//    is treated as "on" — we never want to silently downgrade.
check("?sslmode=verify-full turns SSL on", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@db.example.com/app?sslmode=verify-full",
      ),
      true,
    );
  });
});

// 4. PGSSLMODE=disable in env turns SSL off when URL has no sslmode.
check("PGSSLMODE=disable env forces SSL off", () => {
  withEnv({ NODE_ENV: "production", PGSSLMODE: "disable" }, () => {
    // Even against a managed host, an operator's explicit disable wins.
    assert.equal(
      shouldEnableSsl("postgres://u:p@host.railway.app/app"),
      false,
    );
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.example.com/app"),
      false,
    );
  });
});

// 5. PGSSLMODE=require in env turns SSL on for any host.
check("PGSSLMODE=require env forces SSL on", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: "require" }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.example.com/app"),
      true,
    );
    // Even loopback gets SSL when the operator explicitly asks for it.
    assert.equal(
      shouldEnableSsl("postgres://u:p@127.0.0.1:5432/app"),
      true,
    );
  });
});

// 6. URL sslmode is authoritative over PGSSLMODE — operators editing the URL
//    shouldn't be silently overruled by a stale env var.
check("URL sslmode wins over PGSSLMODE env", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: "disable" }, () => {
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@db.example.com/app?sslmode=require",
      ),
      true,
    );
  });
  withEnv({ NODE_ENV: "production", PGSSLMODE: "require" }, () => {
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@db.example.com/app?sslmode=disable",
      ),
      false,
    );
  });
});

// 7. The legacy managed-host substring shortcut still triggers SSL even
//    in development (so local tooling pointed at a Railway/Neon DB doesn't
//    silently downgrade).
check("railway / rlwy / neon substrings turn SSL on", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@containers.railway.app/app"),
      true,
    );
    assert.equal(
      shouldEnableSsl("postgres://u:p@maglev.proxy.rlwy.net:1234/app"),
      true,
    );
    assert.equal(
      shouldEnableSsl(
        "postgres://u:p@ep-cool-river-12345.us-east-2.aws.neon.tech/app",
      ),
      true,
    );
  });
});

// 8. Production default: any unknown non-loopback host turns SSL on,
//    even if it doesn't match the managed-host substrings (this is the
//    Task #849 fix for custom Railway domains).
check("production defaults SSL on for unknown public hosts", () => {
  withEnv({ NODE_ENV: "production", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.acme-school.com/app"),
      true,
    );
    assert.equal(
      shouldEnableSsl("postgres://u:p@10.20.30.40:5432/app"),
      true,
    );
  });
});

// 9. Loopback / helium / *.local / *.internal exemptions in production —
//    dev DBs and CI helium instances stay plaintext.
check("loopback / helium / *.local / *.internal exempt in production", () => {
  withEnv({ NODE_ENV: "production", PGSSLMODE: undefined }, () => {
    assert.equal(shouldEnableSsl("postgres://u:p@localhost:5432/app"), false);
    assert.equal(shouldEnableSsl("postgres://u:p@127.0.0.1:5432/app"), false);
    assert.equal(shouldEnableSsl("postgres://u:p@helium:5432/app"), false);
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.svc.local:5432/app"),
      false,
    );
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.svc.internal:5432/app"),
      false,
    );
  });
});

// 10. Dev/test against an unknown host stays off — we don't want CI runs
//     to suddenly require TLS against a throwaway Postgres container.
check("dev/test against unknown host stays plaintext", () => {
  withEnv({ NODE_ENV: "development", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.example.com/app"),
      false,
    );
    assert.equal(
      shouldEnableSsl("postgres://u:p@10.20.30.40:5432/app"),
      false,
    );
  });
  withEnv({ NODE_ENV: "test", PGSSLMODE: undefined }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@db.example.com/app"),
      false,
    );
  });
});

// 11. A malformed URL must still flow through env + substring + production
//     rules instead of throwing.
check("malformed URL still consults env + substring + production", () => {
  withEnv({ NODE_ENV: "production", PGSSLMODE: undefined }, () => {
    // No host parsable, but contains the railway.app substring → on.
    assert.equal(shouldEnableSsl("not a url but railway.app appears"), true);
    // No host, no substring, production → off (we need a host to apply
    // the production-default-on rule).
    assert.equal(shouldEnableSsl("totally bogus connection string"), false);
  });
  withEnv({ NODE_ENV: "production", PGSSLMODE: "require" }, () => {
    assert.equal(shouldEnableSsl("totally bogus connection string"), true);
  });
  withEnv({ NODE_ENV: "production", PGSSLMODE: "disable" }, () => {
    assert.equal(
      shouldEnableSsl("postgres://u:p@host.railway.app/app"),
      false,
    );
  });
});

// Restore env exactly as we found it.
if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
if (ORIGINAL_PGSSLMODE === undefined) delete process.env.PGSSLMODE;
else process.env.PGSSLMODE = ORIGINAL_PGSSLMODE;

console.log(`\nshouldEnableSsl: ${passed} cases passed`);
