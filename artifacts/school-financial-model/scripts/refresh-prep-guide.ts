/**
 * Task #933 — one-command Model Prep Guide refresh.
 *
 * Mirrors `refresh-screenshots.ts` but targets the prep guide:
 * boots ephemeral api-server + Vite dev server, runs
 * `capture-prep-guide-screenshots.ts` against them, then runs
 * `build-prep-guide.ts` so the PDF picks up the fresh PNGs, then tears
 * everything back down.
 *
 *     pnpm --filter @workspace/school-financial-model run refresh:prep-guide
 *
 * Wired into `.github/workflows/refresh-prep-guide.yml` (scheduled +
 * manual) so the printable guide stays in sync with the wizard UI
 * without anyone having to remember to run it locally.
 *
 * Servers already reachable on the target ports are reused and not
 * killed on exit. Anything we spawn ourselves is cleaned up via
 * SIGTERM (then SIGKILL after a grace window) even if a step throws
 * or the user hits Ctrl-C.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_ROOT = join(__dirname, "..");
const REPO_ROOT = join(ARTIFACT_ROOT, "..", "..");

const API_PORT = Number(process.env.REFRESH_API_PORT ?? 8080);
const WEB_PORT = Number(
  process.env.REFRESH_WEB_PORT ?? process.env.CAPTURE_WEB_PORT ?? 22094,
);
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

const READY_TIMEOUT_MS = Number(process.env.REFRESH_READY_TIMEOUT_MS ?? 90_000);
const POLL_INTERVAL_MS = 500;
const SHUTDOWN_GRACE_MS = 5_000;

interface ManagedServer {
  name: string;
  child: ChildProcess;
}

const managed: ManagedServer[] = [];
let shuttingDown = false;

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(
  label: string,
  url: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(url)) {
      console.log(`[refresh-prep-guide] ${label} ready at ${url}`);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `${label} did not become reachable at ${url} within ${timeoutMs}ms`,
  );
}

function prefixLines(tag: string, text: string): string {
  return text
    .split("\n")
    .map((line, idx, arr) =>
      idx === arr.length - 1 && line === "" ? "" : `${tag} ${line}\n`,
    )
    .join("");
}

function spawnServer(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    // Detached + setsid so we can kill the whole process group (pnpm
    // spawns grandchildren that would otherwise outlive the wrapper).
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const tag = `[${name}]`;
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(prefixLines(tag, chunk.toString("utf8")));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(prefixLines(tag, chunk.toString("utf8")));
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.warn(
        `[refresh-prep-guide] ${name} exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"})`,
      );
    }
  });

  managed.push({ name, child });
  return child;
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (managed.length === 0) return;

  console.log("[refresh-prep-guide] shutting down ephemeral servers…");
  for (const { name, child } of managed) {
    if (child.pid == null || child.exitCode != null) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (err) {
      console.warn(
        `[refresh-prep-guide] SIGTERM ${name} failed: ${(err as Error).message}`,
      );
    }
  }

  await new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS));

  for (const { name, child } of managed) {
    if (child.pid == null || child.exitCode != null) continue;
    try {
      process.kill(-child.pid, "SIGKILL");
      console.warn(
        `[refresh-prep-guide] SIGKILL ${name} (did not exit on SIGTERM)`,
      );
    } catch {
      // Group already gone — that's fine.
    }
  }
}

function runStep(
  label: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminated by signal ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${label} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function ensureApiServer(): Promise<void> {
  if (await isReachable(`${API_URL}/api/healthz`)) {
    console.log(`[refresh-prep-guide] reusing existing api-server at ${API_URL}`);
    return;
  }
  console.log(`[refresh-prep-guide] starting api-server on :${API_PORT}…`);
  spawnServer(
    "api",
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "dev"],
    { PORT: String(API_PORT) },
  );
  await waitFor("api-server", `${API_URL}/api/healthz`, READY_TIMEOUT_MS);
}

async function ensureWebServer(): Promise<void> {
  if (await isReachable(WEB_URL)) {
    console.log(`[refresh-prep-guide] reusing existing web server at ${WEB_URL}`);
    return;
  }
  console.log(
    `[refresh-prep-guide] starting school-financial-model dev on :${WEB_PORT}…`,
  );
  spawnServer(
    "web",
    "pnpm",
    ["--filter", "@workspace/school-financial-model", "run", "dev"],
    { PORT: String(WEB_PORT) },
  );
  await waitFor("web server", WEB_URL, READY_TIMEOUT_MS);
}

async function main(): Promise<void> {
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      shutdown().finally(() => process.exit(130));
    });
  }

  await ensureApiServer();
  await ensureWebServer();

  console.log("[refresh-prep-guide] capturing wizard screenshots…");
  await runStep(
    "capture:prep-guide",
    [
      "--filter",
      "@workspace/school-financial-model",
      "run",
      "capture:prep-guide",
    ],
    {
      CAPTURE_API_URL: API_URL,
      CAPTURE_BASE_URL: WEB_URL,
      CAPTURE_WEB_PORT: String(WEB_PORT),
    },
  );

  console.log("[refresh-prep-guide] rebuilding prep-guide.pdf…");
  await runStep("build:prep-guide", [
    "--filter",
    "@workspace/school-financial-model",
    "run",
    "build:prep-guide",
  ]);

  console.log("[refresh-prep-guide] done.");
}

main()
  .then(async () => {
    await shutdown();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      "[refresh-prep-guide] failed:",
      err instanceof Error ? err.message : err,
    );
    await shutdown();
    process.exit(1);
  });
