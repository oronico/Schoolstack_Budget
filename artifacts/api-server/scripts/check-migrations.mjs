#!/usr/bin/env node
// Boots a throwaway Postgres, runs the production `dist/migrate.cjs` bundle
// against it, and exits non-zero if any migration errors out. Designed to be
// invoked from CI (where DATABASE_URL is supplied by a postgres service
// container) as well as a developer's laptop (where we spin up a local
// Postgres cluster on the fly so it Just Works with `pnpm check:migrations`).
//
// Catches the same class of failures Railway would surface during a preview
// deploy — missing tables, syntax errors, ordering bugs in the journal — but
// does so in seconds on the PR check, before a Railway/Netlify build cycle is
// burned.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiServerDir = path.resolve(__dirname, "..");
const migrateBundle = path.resolve(apiServerDir, "dist", "migrate.cjs");
const migrationsDir = path.resolve(apiServerDir, "dist", "drizzle");

function log(msg) {
  console.log(`[check-migrations] ${msg}`);
}

function err(msg) {
  console.error(`[check-migrations] ${msg}`);
}

function which(bin) {
  const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
  const out = r.stdout.trim();
  return out || null;
}

async function pickFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ensureBuild() {
  if (existsSync(migrateBundle) && existsSync(path.join(migrationsDir, "meta", "_journal.json"))) {
    log(`reusing existing build: ${migrateBundle}`);
    return;
  }
  log("dist/migrate.cjs missing — building api-server bundle...");
  const r = spawnSync("pnpm", ["run", "build"], {
    cwd: apiServerDir,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    err("api-server build failed; cannot test migrations.");
    process.exit(r.status ?? 1);
  }
  if (!existsSync(migrateBundle)) {
    err(`build completed but ${migrateBundle} is still missing.`);
    process.exit(1);
  }
}

function runMigrate(databaseUrl, label) {
  log(`running ${label} against throwaway DB...`);
  const r = spawnSync(process.execPath, [migrateBundle], {
    cwd: apiServerDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (r.status !== 0) {
    err(`${label} FAILED with exit code ${r.status}.`);
    process.exit(r.status ?? 1);
  }
  log(`${label} succeeded.`);
}

async function startLocalPostgres() {
  const initdb = which("initdb");
  const pgCtl = which("pg_ctl");
  const postgresBin = which("postgres");
  if (!initdb || !pgCtl || !postgresBin) {
    err(
      "Local Postgres binaries (initdb/pg_ctl/postgres) are not on PATH.\n" +
        "Either install postgres locally, or set MIGRATIONS_TEST_DATABASE_URL\n" +
        "to a throwaway Postgres URL (CI typically does this via a postgres\n" +
        "service container).",
    );
    process.exit(1);
  }

  const dataDir = mkdtempSync(path.join(tmpdir(), "ssb-migcheck-"));
  const socketDir = mkdtempSync(path.join(tmpdir(), "ssb-migsock-"));
  const port = await pickFreePort();
  log(`provisioning Postgres cluster at ${dataDir} (port ${port})`);

  const init = spawnSync(
    initdb,
    ["-D", dataDir, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"],
    { stdio: "inherit" },
  );
  if (init.status !== 0) {
    err("initdb failed; cannot continue.");
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
    process.exit(init.status ?? 1);
  }

  // Start postgres directly (foreground) so we can supervise & SIGTERM it
  // ourselves instead of leaving a daemon orphaned by pg_ctl.
  const pg = spawn(
    postgresBin,
    [
      "-D", dataDir,
      "-p", String(port),
      "-k", socketDir,
      // Bind only to localhost; CI hosts may have ipv6 quirks.
      "-c", "listen_addresses=127.0.0.1",
      "-c", "fsync=off",
      "-c", "synchronous_commit=off",
      "-c", "full_page_writes=off",
      "-c", "logging_collector=off",
      "-c", "log_min_messages=warning",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try { pg.kill("SIGTERM"); } catch { /* noop */ }
    // Give postgres up to 5s to shut down before SIGKILL.
    const start = Date.now();
    const wait = () => {
      if (pg.exitCode !== null || Date.now() - start > 5000) {
        try { pg.kill("SIGKILL"); } catch { /* noop */ }
        rmSync(dataDir, { recursive: true, force: true });
        rmSync(socketDir, { recursive: true, force: true });
        return;
      }
      setTimeout(wait, 100);
    };
    wait();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });
  pg.on("exit", (code, signal) => {
    if (!stopped) {
      err(`postgres exited unexpectedly (code=${code}, signal=${signal}).`);
      process.exit(1);
    }
  });

  // Wait for the server to accept connections.
  const pgIsReady = which("pg_isready");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (pgIsReady) {
      const r = spawnSync(pgIsReady, ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres"], { stdio: "ignore" });
      if (r.status === 0) break;
    } else {
      // Fall back to a raw socket probe.
      const ok = await new Promise((resolve) => {
        const s = net.createConnection({ host: "127.0.0.1", port }, () => { s.end(); resolve(true); });
        s.on("error", () => resolve(false));
      });
      if (ok) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (Date.now() >= deadline) {
    err("postgres did not become ready within 15s.");
    cleanup();
    process.exit(1);
  }
  log(`postgres ready on 127.0.0.1:${port}`);

  return {
    url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    cleanup,
  };
}

async function main() {
  ensureBuild();

  const externalUrl = process.env.MIGRATIONS_TEST_DATABASE_URL;
  let url;
  let cleanup = () => {};

  if (externalUrl) {
    log("using MIGRATIONS_TEST_DATABASE_URL (CI mode).");
    url = externalUrl;
  } else {
    const started = await startLocalPostgres();
    url = started.url;
    cleanup = started.cleanup;
  }

  try {
    // First pass: clean DB. Catches missing tables, syntax errors, bad order.
    runMigrate(url, "migration pass 1 (fresh DB)");
    // Second pass: same DB, already migrated. Catches non-idempotent
    // migrations and proves drizzle's journal lookup works against the
    // schema this bundle just produced.
    runMigrate(url, "migration pass 2 (re-apply, must be no-op)");
    log("OK — production migration bundle applies cleanly to a fresh Postgres.");
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  err(`unexpected error: ${e?.stack || e}`);
  process.exit(1);
});
