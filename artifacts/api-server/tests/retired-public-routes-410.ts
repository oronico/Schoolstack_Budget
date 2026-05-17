// Task #950 — Retired public route regression.
//
// Three formerly-unauthenticated routes were retired after a 14-day
// telemetry watch showed zero legitimate callers. Each must now answer
// HTTP 410 Gone with a JSON body that names the supported alternative
// (or null when none exists). The route must stay mounted so external
// stragglers hit the 410 + pointer, not Express's catch-all 404.
//
// We also assert the retirement helper does not throw when invoked
// against a request that carries no headers (defensive sanity check —
// the helper runs on every hit and a thrown error would mask the 410
// behind a 500).

import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { logRetiredPublicRouteHit } from "../src/lib/retired-route-telemetry.js";

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

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

type RetiredCase = {
  path: string;
  body: unknown;
  alternative: string | null;
};

const RETIRED_CASES: RetiredCase[] = [
  {
    path: "/api/public/export-underwriting",
    body: { schoolProfile: { schoolName: "x" } },
    alternative: "/api/public/export-budget",
  },
  {
    path: "/api/public/request-review",
    body: { name: "x", email: "x@example.com", modelData: {} },
    alternative: "/api/models/:id/request-review",
  },
  {
    path: "/api/public/import-actuals",
    body: { csv: "a,b\n1,2\n", source: "csv" },
    alternative: null,
  },
];

async function main(): Promise<void> {
  // Telemetry helper must resolve cleanly on a minimal request shape
  // (no headers → auth state "none") AND on a bogus Bearer token
  // (auth state "invalid" — never throws even if verifyTokenStrict
  // rejects the token signature).
  let helperRejected = false;
  try {
    await logRetiredPublicRouteHit(
      { headers: {}, ip: "127.0.0.1", method: "POST" } as unknown as Parameters<
        typeof logRetiredPublicRouteHit
      >[0],
      "/api/public/test",
    );
    await logRetiredPublicRouteHit(
      {
        headers: { authorization: "Bearer not-a-real-jwt" },
        ip: "127.0.0.1",
        method: "POST",
      } as unknown as Parameters<typeof logRetiredPublicRouteHit>[0],
      "/api/public/test",
    );
  } catch {
    helperRejected = true;
  }
  check("logRetiredPublicRouteHit() resolves cleanly on minimal + bogus-bearer requests", !helperRejected);

  const { baseUrl, close } = await startServer();
  try {
    for (const tc of RETIRED_CASES) {
      const res = await fetch(`${baseUrl}${tc.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.body),
      });
      check(`${tc.path} → 410`, res.status === 410, `got ${res.status}`);

      const json = (await res.json().catch(() => null)) as
        | { error?: unknown; code?: unknown; alternative?: unknown }
        | null;
      check(`${tc.path} body is JSON`, json !== null);
      if (json) {
        check(
          `${tc.path} body.code === "route_retired"`,
          json.code === "route_retired",
          `got ${JSON.stringify(json.code)}`,
        );
        check(
          `${tc.path} body.error is a string`,
          typeof json.error === "string" && (json.error as string).length > 0,
        );
        check(
          `${tc.path} body.alternative is ${JSON.stringify(tc.alternative)}`,
          json.alternative === tc.alternative,
          `got ${JSON.stringify(json.alternative)}`,
        );
      }
    }

    // Confirm the routes are still mounted — a GET (wrong method) should
    // produce the API router's 404, NOT a 410. This proves the 410 we
    // saw above came from our stub and not from a route-not-mounted
    // fallback.
    const wrongMethod = await fetch(`${baseUrl}/api/public/export-underwriting`, {
      method: "GET",
    });
    check(
      "GET /api/public/export-underwriting → 404 (only POST is mounted)",
      wrongMethod.status === 404,
      `got ${wrongMethod.status}`,
    );
  } finally {
    await close();
  }

  console.log(`\nretired-public-routes-410: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("retired-public-routes-410 crashed:", err);
  process.exit(1);
});
