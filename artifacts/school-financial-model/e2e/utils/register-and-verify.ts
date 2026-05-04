// Task #527 / Task #534 — confirm-by-email signup.
//
// /api/auth/register no longer returns an auth token directly; it
// always responds 202 with the same body and (in non-production) a
// dev-only `_devToken` that points at /api/auth/verify-email. E2E
// tests don't have a real inbox, so this helper drives both legs and
// hands back the token a Playwright spec actually needs.
//
// `rateLimitBackoffsMs` retries the initial /auth/register POST when
// it returns 429 — a common condition when many specs run in
// parallel against the same per-IP rate limit. Defaults to the
// previously-inlined exponential schedule. Pass `[]` to disable.
//
// `retryOnce: true` mirrors the historical "if not ok, hit register
// again" guard a few specs use against rare 503/connection-reset
// noise from the dev server warmup.
import type { APIRequestContext, APIResponse } from "@playwright/test";

export type RegisterAndVerifyOptions = {
  email: string;
  password: string;
  name: string;
  retryOnce?: boolean;
  rateLimitBackoffsMs?: number[];
};

export type RegisterAndVerifyResult = {
  token: string;
  user: { id: number; email: string; name: string };
};

const DEFAULT_RATE_LIMIT_BACKOFFS_MS = [2000, 5000, 10000, 20000, 30000];

async function postRegister(request: APIRequestContext, body: Omit<RegisterAndVerifyOptions, "retryOnce" | "rateLimitBackoffsMs">): Promise<APIResponse> {
  return request.post("/api/auth/register", {
    data: { email: body.email, password: body.password, name: body.name },
  });
}

export async function registerAndVerifyE2E(
  request: APIRequestContext,
  opts: RegisterAndVerifyOptions,
): Promise<RegisterAndVerifyResult> {
  const backoffs = opts.rateLimitBackoffsMs ?? DEFAULT_RATE_LIMIT_BACKOFFS_MS;
  let regRes = await postRegister(request, opts);
  for (const wait of backoffs) {
    if (regRes.status() !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    regRes = await postRegister(request, opts);
  }
  if (!regRes.ok() && opts.retryOnce) {
    regRes = await postRegister(request, opts);
  }
  if (!regRes.ok()) {
    throw new Error(`register failed: ${regRes.status()} ${await regRes.text()}`);
  }
  const regJson = (await regRes.json()) as { _devToken?: string; _devBranch?: string };
  if (!regJson._devToken || regJson._devBranch !== "new") {
    throw new Error(
      `register did not return a fresh verification token (branch=${regJson._devBranch} token=${regJson._devToken ? "set" : "unset"}); is the email already used?`,
    );
  }
  const verifyRes = await request.post("/api/auth/verify-email", {
    data: { token: regJson._devToken },
  });
  if (!verifyRes.ok()) {
    throw new Error(`verify-email failed: ${verifyRes.status()} ${await verifyRes.text()}`);
  }
  return (await verifyRes.json()) as RegisterAndVerifyResult;
}
