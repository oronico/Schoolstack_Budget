// CI guard against the "Cannot find module" class of production crash.
//
// The Dockerfile's runtime stage copies ONLY `dist/index.cjs` (no
// `node_modules`). Every production dependency must therefore be
// inlined into the bundle by esbuild via the allowlist in `build.ts`.
// If a dep is `require()`d at runtime but missing from the allowlist,
// esbuild marks it `external` and `dist/index.cjs` crashes on boot
// with `Error: Cannot find module '<pkg>'`.
//
// Crucially, the rest of the api-server test chain executes the dev
// entry (`tsx ./src/index.ts`), which resolves every dep from the
// workspace's pnpm-linked node_modules — so allowlist gaps are
// invisible to CI. This test closes that gap by building the bundle
// and actually spawning `node dist/index.cjs` to catch any missing
// inlined dep before the deploy.
//
// Failure modes this test catches:
//   1. Static `import X from "y"` where `y` is not in build.ts allowlist.
//   2. Sibling/transitive require()s of non-allowlisted packages.
//   3. Banner injection breakage (e.g. import.meta.url shim regressing).
//
// Failure modes this test does NOT catch (acceptable — they need a
// real env to surface): runtime config errors (R2/DB credentials),
// lazy-loaded code paths not reached during boot.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiServerDir = resolve(__dirname, "..");
const bundlePath = resolve(apiServerDir, "dist", "index.cjs");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

console.log("=== Bundle boot smoke (catches missing-from-allowlist deps) ===");

// Step 1 — build the bundle. Don't skip this even if dist exists; we
// want to catch allowlist regressions, not stale-build false-passes.
console.log("\nBuilding production bundle…");
const buildResult = spawnSync("pnpm", ["run", "build"], {
  cwd: apiServerDir,
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
check(
  "production bundle builds cleanly",
  buildResult.status === 0,
  `exit=${buildResult.status} stderr=${buildResult.stderr?.slice(0, 400)}`,
);
check("dist/index.cjs exists after build", existsSync(bundlePath));

if (failed > 0) {
  console.error("\nBuild failed — cannot proceed to boot smoke.");
  for (const f of failures) console.error(f);
  process.exit(1);
}

// Step 2 — spawn the bundle with stub env and watch for module-resolution
// crashes. We give it a fake DATABASE_URL so the postgres pool config
// parses; the bundle should reach `app.listen()` without touching the DB
// (PG queries are lazy). If it exits with "Cannot find module" or any
// non-zero status within the grace window, fail.
console.log("\nSpawning bundle with stub env…");
const child = spawn(
  process.execPath,
  [bundlePath],
  {
    cwd: apiServerDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0", // ephemeral port — don't collide with the dev workflow
      DATABASE_URL: "postgres://smoke:smoke@127.0.0.1:1/smoke",
      JWT_SECRET: "smoke-test-secret-not-used",
      APP_URL: "http://smoke.invalid",
      // Required at module-load time by the sensitive-encryption module
      // (refuses ephemeral keys in NODE_ENV=production). Use a stable
      // non-secret 32-byte value — this test never touches real ciphertext.
      SENSITIVE_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      // Deliberately omit R2 env vars — lazy init means boot should
      // still succeed; R2 errors only surface on first storage request.
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdoutBuf = "";
let stderrBuf = "";
child.stdout.on("data", (c) => { stdoutBuf += c.toString(); });
child.stderr.on("data", (c) => { stderrBuf += c.toString(); });

const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res) => {
  child.on("exit", (code, signal) => res({ code, signal }));
});

const GRACE_MS = 6000;
const timeoutPromise = new Promise<"timeout">((res) =>
  setTimeout(() => res("timeout"), GRACE_MS),
);

const outcome = await Promise.race([exitPromise, timeoutPromise]);

// Cleanup: kill the child if still running.
if (outcome === "timeout") {
  child.kill("SIGTERM");
  await new Promise<void>((res) => {
    const t = setTimeout(() => { child.kill("SIGKILL"); res(); }, 2000);
    child.once("exit", () => { clearTimeout(t); res(); });
  });
}

const combined = stdoutBuf + stderrBuf;

// Primary assertion: NO `Cannot find module` ever appears. This is the
// exact bug class this smoke exists to catch — an externalized require
// at runtime in a bundle that ships without node_modules.
const missingModule = combined.match(/Cannot find module '([^']+)'/);
check(
  "bundle does NOT crash with 'Cannot find module'",
  missingModule === null,
  missingModule
    ? `MISSING DEP: '${missingModule[1]}' — add it to the allowlist in artifacts/api-server/build.ts`
    : "",
);

// Secondary: no banner/import.meta.url shim regression.
const topLevelTypeError = combined.match(/TypeError:[^\n]*is not a function[^\n]*/i);
check(
  "bundle does NOT throw 'is not a function' at top level (banner shim regression)",
  topLevelTypeError === null,
  topLevelTypeError ? `matched: ${topLevelTypeError[0]}` : "",
);

// Boot-progress check: we expect the process to reach AT LEAST the
// runtime-config / DB-connect phase. If it stays running past 6s OR
// it exits with a clear runtime error (ECONNREFUSED to the stub DB,
// a startup-config FATAL line), module loading succeeded. If it
// exits silently with no runtime markers, something failed earlier
// at module-load time and we want to know about it.
const reachedRuntime =
  outcome === "timeout" ||
  /ECONNREFUSED/i.test(combined) ||
  /\[startup\] (INFO|FATAL)/i.test(combined);
check(
  "bundle reaches runtime phase (module-load + env validation succeeded)",
  reachedRuntime,
  `outcome=${typeof outcome === "string" ? outcome : `exit code=${outcome.code} signal=${outcome.signal}`}\nlast stderr:\n${stderrBuf.slice(-600)}\nlast stdout:\n${stdoutBuf.slice(-600)}`,
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
