/**
 * Task #571 — integration check for the tenant middleware.
 *
 * Boots the real Express `app` and asserts that:
 *   1. A request with no special headers gets `req.tenant.slug ===
 *      "schoolstack"` (= the default — proves M1 is a no-op for legacy
 *      traffic).
 *   2. The `X-Tenant` override is honoured outside production.
 *   3. The `X-Tenant` override is *ignored* in production (so a hostile
 *      header on real traffic can't switch tenants).
 *   4. An unknown override slug falls through to the default rather
 *      than 500ing.
 *
 * We mount a tiny probe route on the live app and read `req.tenant`
 * back out as JSON; that's the same way M2+ consumers will read it.
 */
import http from "node:http";
import express, { type Request, type Response } from "express";
import { tenantMiddleware } from "@workspace/tenant/express";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else failures.push(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
}

interface ProbeBody {
  slug: string;
  source: string;
  hostname: string;
}

function buildApp(opts: Parameters<typeof tenantMiddleware>[0] = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(tenantMiddleware(opts));
  app.get("/__probe", (req: Request, res: Response) => {
    res.json({
      slug: req.tenant.slug,
      source: req.tenantSource,
      hostname: req.hostname,
    } satisfies ProbeBody);
  });
  return app;
}

async function fetchProbe(
  app: ReturnType<typeof buildApp>,
  init: { host?: string; tenantHeader?: string } = {},
): Promise<ProbeBody> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected AddressInfo");
    }
    // Use http.request rather than fetch — Node's undici fetch
    // overrides the `Host` header from the URL, which prevents us from
    // simulating an inbound request to a registered tenant hostname.
    const headers: Record<string, string> = {};
    if (init.host) headers["host"] = init.host;
    if (init.tenantHeader) headers["x-tenant"] = init.tenantHeader;
    return await new Promise<ProbeBody>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: address.port,
          method: "GET",
          path: "/__probe",
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              if ((res.statusCode ?? 500) >= 400) {
                reject(new Error(`probe HTTP ${res.statusCode}: ${body}`));
                return;
              }
              resolve(JSON.parse(body) as ProbeBody);
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main() {
  console.log("tenant-middleware:");

  // Capture & restore NODE_ENV so the prod-mode case doesn't leak.
  const originalNodeEnv = process.env.NODE_ENV;

  // --- 1. default tenant on unknown host (no-op for legacy traffic) ---
  {
    process.env.NODE_ENV = "test";
    const app = buildApp();
    const body = await fetchProbe(app, { host: "preview.example.com" });
    check(
      "unknown host → default tenant 'schoolstack'",
      body.slug === "schoolstack",
      `got ${JSON.stringify(body)}`,
    );
    check(
      "unknown host → source 'default'",
      body.source === "default",
      `got ${JSON.stringify(body)}`,
    );
  }

  // --- 2. registered host → host source ----------------------------------
  {
    process.env.NODE_ENV = "test";
    const app = buildApp();
    const body = await fetchProbe(app, { host: "budget.schoolstack.ai" });
    check(
      "registered host → source 'host'",
      body.slug === "schoolstack" && body.source === "host",
      `got ${JSON.stringify(body)}`,
    );
  }

  // --- 3. X-Tenant override honoured outside production ------------------
  {
    process.env.NODE_ENV = "development";
    const app = buildApp();
    const body = await fetchProbe(app, {
      host: "preview.example.com",
      tenantHeader: "schoolstack",
    });
    check(
      "X-Tenant override honoured in dev → source 'override'",
      body.slug === "schoolstack" && body.source === "override",
      `got ${JSON.stringify(body)}`,
    );
  }

  // --- 4. X-Tenant override ignored in production ------------------------
  {
    process.env.NODE_ENV = "production";
    const app = buildApp(); // resolves allowOverride from process.env at construction
    const body = await fetchProbe(app, {
      host: "budget.schoolstack.ai",
      tenantHeader: "does-not-exist",
    });
    check(
      "production: X-Tenant header is ignored, host wins",
      body.slug === "schoolstack" && body.source === "host",
      `got ${JSON.stringify(body)}`,
    );
  }

  // --- 5. unknown override slug falls through (does not 500) -------------
  {
    process.env.NODE_ENV = "development";
    const app = buildApp();
    const body = await fetchProbe(app, {
      host: "budget.schoolstack.ai",
      tenantHeader: "no-such-tenant",
    });
    check(
      "unknown override slug falls through to host (no 500)",
      body.slug === "schoolstack" && body.source === "host",
      `got ${JSON.stringify(body)}`,
    );
  }

  // --- 6. allowHeaderOverride: false explicit --------------------------------
  {
    process.env.NODE_ENV = "development";
    const app = buildApp({ allowHeaderOverride: false });
    const body = await fetchProbe(app, {
      host: "preview.example.com",
      tenantHeader: "schoolstack",
    });
    check(
      "allowHeaderOverride:false: header ignored even in dev",
      body.slug === "schoolstack" && body.source === "default",
      `got ${JSON.stringify(body)}`,
    );
  }

  // restore env
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (failures.length > 0) {
    console.error(`\n${failures.length} tenant-middleware check(s) failed:`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\ntenant-middleware: all checks passed`);
}

main().catch((e) => {
  console.error("tenant-middleware crashed:", e);
  process.exit(1);
});
