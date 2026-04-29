import type { APIRequestContext } from "@playwright/test";

// Task #302: every signed-in founder must have a persona before the dashboard
// or wizard renders normally. Tests that authenticate via /api/auth/register
// must seed a persona too — otherwise the FounderPersonaPrompt overlay covers
// the page they're trying to interact with.
export type SeedPersonaOptions = {
  stage?: "yet_to_launch" | "existing";
  comfort?: "new_to_budgeting" | "comfortable";
};

export async function seedPersona(
  request: APIRequestContext,
  token: string,
  opts: SeedPersonaOptions = {},
): Promise<void> {
  const stage = opts.stage ?? "existing";
  const comfort = opts.comfort ?? "comfortable";
  const res = await request.patch("/api/auth/persona", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { stage, comfort },
  });
  if (!res.ok()) {
    throw new Error(`seedPersona failed: ${res.status()} ${await res.text()}`);
  }
}
