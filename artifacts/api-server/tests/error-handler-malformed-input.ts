// Adversarial-input regression — these were uncovered during a post-merge
// audit ("try to break it every way you can"). The global Express error
// handler used to map BOTH malformed-JSON bodies AND oversized payloads to
// 500 "Internal server error", AND persist them to the error_logs table.
// That polluted operator triage with client-side input bugs and confused
// callers (a malformed payload looked like a server crash). The fix in
// app.ts maps body-parser errors to proper 4xx responses and skips the
// error_logs persistence path.
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";

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

function eq<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
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

interface PostResult {
  status: number;
  body: unknown;
  bodyText: string;
}

async function rawPost(
  baseUrl: string,
  path: string,
  body: string,
  contentType = "application/json",
  contentLengthOverride?: string,
): Promise<PostResult> {
  // Use raw http.request — node's fetch (undici) refuses to send a request
  // whose Content-Length header disagrees with the actual body length, but
  // the oversized-payload case specifically needs to LIE about the length
  // to trigger express's `entity.too.large` short-circuit without us
  // actually streaming 5MB across the loopback.
  const url = new URL(`${baseUrl}${path}`);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length":
      contentLengthOverride !== undefined
        ? contentLengthOverride
        : String(Buffer.byteLength(body)),
  };
  return new Promise<PostResult>((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "POST",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(bodyText);
          } catch {
            parsed = bodyText;
          }
          resolve({ status: res.statusCode || 0, body: parsed, bodyText });
        });
      },
    );
    req.on("error", reject);
    // Write the actual body bytes. If the caller lied about Content-Length
    // (oversized test), express body-parser inspects the header value and
    // rejects before reading any of the actual bytes.
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const { baseUrl, close } = await startServer();
  try {
    // 1) Malformed JSON on an auth endpoint → 400, not 500.
    const malformed = await rawPost(
      baseUrl,
      "/api/auth/login",
      '{"email":"x@y.com","password":"p',
    );
    eq("malformed JSON returns 400", malformed.status, 400);
    check(
      "malformed JSON body has a client-friendly error message",
      typeof (malformed.body as { error?: string }).error === "string" &&
        /malformed/i.test((malformed.body as { error: string }).error),
      `body=${malformed.bodyText.slice(0, 200)}`,
    );

    // 2) Malformed JSON on a different (non-auth) route → still 400.
    const malformed2 = await rawPost(baseUrl, "/api/models", "{not json at all");
    eq("malformed JSON on /api/models returns 400 too", malformed2.status, 400);

    // 3) Oversized payload (>5 MB) → 413, not 500.
    // Build a real ~6MB JSON body and send it across the loopback. We
    // can't lie about Content-Length and send fewer bytes — the server
    // would then block waiting for the remaining bytes that never arrive,
    // hanging the test. 6MB across loopback is still fast (<200ms).
    const padding = "x".repeat(6 * 1024 * 1024);
    const oversizedBody = JSON.stringify({ email: "x@y.com", password: padding });
    const big = await rawPost(baseUrl, "/api/auth/login", oversizedBody);
    eq("oversized request returns 413", big.status, 413);
    check(
      "oversized response mentions the size limit",
      typeof (big.body as { error?: string }).error === "string" &&
        /(too large|5 ?MB|limit)/i.test((big.body as { error: string }).error),
      `body=${big.bodyText.slice(0, 200)}`,
    );

    // 4) Empty body on a JSON endpoint → still routed to the handler
    // (returns 400 from the route's own zod validation, NOT a parser 500).
    const empty = await rawPost(baseUrl, "/api/auth/login", "");
    check(
      "empty body is a 4xx (not 500)",
      empty.status >= 400 && empty.status < 500,
      `got ${empty.status}`,
    );

    // 5) Well-formed JSON with bad credentials still flows through to the
    // route handler — confirms our middleware insertion didn't break the
    // happy path. We expect 401 (or 400 if validation is stricter).
    const goodJson = await rawPost(
      baseUrl,
      "/api/auth/login",
      JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
    );
    check(
      "well-formed JSON still reaches the route handler (4xx, not 500)",
      goodJson.status >= 400 && goodJson.status < 500,
      `got ${goodJson.status}`,
    );

    // 6) Unsupported charset → 415, not 500.
    const badCharset = await rawPost(
      baseUrl,
      "/api/auth/login",
      "{}",
      "application/json; charset=bogus-charset-xyz",
    );
    check(
      "unsupported charset returns 4xx (not 500)",
      badCharset.status >= 400 && badCharset.status < 500,
      `got ${badCharset.status}`,
    );
  } finally {
    await close();
  }

  console.log(`\nMalformed-input handler tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(f);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Test runner crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // app.ts opens a long-lived pg pool that keeps the event loop alive
    // even after our HTTP server closes. Force exit so `pnpm test` doesn't
    // hang waiting on it.
    setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
  });
