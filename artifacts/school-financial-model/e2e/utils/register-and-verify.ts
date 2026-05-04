// Task #527 — confirm-by-email signup.
//
// /api/auth/register no longer returns an auth token directly; it
// always responds 202 with the same body and (in non-production) a
// dev-only `_devToken` that points at /api/auth/verify-email. E2E
// tests don't have a real inbox, so this helper drives both legs and
// hands back the token a Playwright spec actually needs.
//
// Pass `retryOnce: true` to mirror the old "if not ok, hit register
// again" retry pattern several specs use as a flake guard against
// rare 503/connection-reset noise from the dev server warmup.
import type { APIRequestContext, APIResponse } from "@playwright/test";

export type RegisterAndVerifyOptions = {
  email: string;
  password: string;
  name: string;
  retryOnce?: boolean;
};

export type RegisterAndVerifyResult = {
  token: string;
  user: { id: number; email: string; name: string };
};

async function postRegister(request: APIRequestContext, body: Omit<RegisterAndVerifyOptions, "retryOnce">): Promise<APIResponse> {
  return request.post("/api/auth/register", {
    data: { email: body.email, password: body.password, name: body.name },
  });
}

export async function registerAndVerifyE2E(
  request: APIRequestContext,
  opts: RegisterAndVerifyOptions,
): Promise<RegisterAndVerifyResult> {
  let regRes = await postRegister(request, opts);
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
