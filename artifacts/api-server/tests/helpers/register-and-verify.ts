// Task #527 / Task #534 — confirm-by-email signup. /auth/register no
// longer returns a token directly; the founder has to click a
// verification link in their inbox which POSTs to /auth/verify-email.
// Tests don't have a mailbox to read, so we surface the raw
// verification token via a dev-only `_devToken` field on the 202
// response (gated on NODE_ENV !== "production"). This helper chains
// the two requests and returns the same `{ token, user }` shape the
// old register endpoint used to return, so individual tests barely
// have to change.
export type RegisterAndVerifyResult = {
  token: string;
  user: { id: number; email: string; name: string };
};

export async function registerAndVerify(
  baseUrl: string,
  body: { email: string; password: string; name: string; schoolName?: string; role?: string; planningStage?: string },
): Promise<RegisterAndVerifyResult> {
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (reg.status !== 202) {
    throw new Error(`register failed: status=${reg.status} body=${(await reg.text()).slice(0, 300)}`);
  }
  const regJson = (await reg.json()) as {
    _devToken?: string;
    _devBranch?: string;
  };
  const devToken = regJson._devToken;
  const branch = regJson._devBranch;
  if (!devToken || branch !== "new") {
    throw new Error(`register did not return a fresh verification token (branch=${branch} devToken=${devToken ? "set" : "unset"})`);
  }
  const verify = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: devToken }),
  });
  if (!verify.ok) {
    throw new Error(`verify-email failed: status=${verify.status} body=${(await verify.text()).slice(0, 300)}`);
  }
  return (await verify.json()) as RegisterAndVerifyResult;
}
