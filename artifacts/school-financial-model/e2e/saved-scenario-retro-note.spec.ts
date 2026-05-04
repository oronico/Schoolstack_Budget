import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Verifies the saved-scenario retrospective note editor round-trips through
// the API. Component tests render the editor surface, but only a real browser
// proves the full loop: click "Add a retro note", type into the textarea,
// hit Save, refetch the model, and see the read-only `custom-scenario-retro-note-{idx}`
// button render the saved text. We also assert that Cancel discards the
// pending text without persisting — re-opening the editor must show the
// previously-saved value (empty in the add case, prior text in the edit case).

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E retro note";
const SCENARIO_CREATED_AT = "2026-03-04T12:00:00.000Z";
const SAVED_NOTE = "Signed the lease in March; enrollment came in 5 students under plan.";
const DISCARDED_NOTE = "This text should never be persisted.";
const FOLLOWUP_NOTE = "Updated after April board meeting.";

interface SeededFixture {
  token: string;
  modelId: number;
  email: string;
}

async function seedScenarioFixture(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: {
      email,
      password: TEST_PASSWORD,
      name: "Playwright Founder",
    },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Retro Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Retro Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId, version: createdVersion } = (await createRes.json()) as { id: number; version: number };

  // Seed a scenario without a `retrospective` so the card initially renders
  // the "Add a retro note" affordance instead of the read-only note button.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
    data: {
      name: "E2E Retro Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Retro Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        customScenarios: [
          {
            name: SCENARIO_NAME,
            createdAt: SCENARIO_CREATED_AT,
            overrides: { monthlyRent: 9500 },
            decisionType: "evaluate_site",
          },
        ],
      },
    },
  });
  expect(
    updateRes.ok(),
    `update model failed: ${updateRes.status()} ${await updateRes.text()}`,
  ).toBeTruthy();

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Retro note editor saves through to the read-only button and Cancel discards pending text", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  // Sanity check — no read-only note yet, just the "Add a retro note" CTA.
  await expect(card.getByTestId("custom-scenario-retro-note-0")).toHaveCount(0);
  const addBtn = card.getByTestId("custom-scenario-retro-add-0");
  await expect(addBtn).toBeVisible();

  // Cancel branch first — typing then clicking Cancel must NOT persist the
  // text. We verify by re-opening the editor and confirming the textarea is
  // empty (the original `retrospective` is undefined).
  await addBtn.click();
  const editor = card.getByTestId("custom-scenario-retro-editor-0");
  await expect(editor).toBeVisible();
  const textarea = card.getByTestId("custom-scenario-retro-textarea-0");
  await textarea.fill(DISCARDED_NOTE);
  await expect(textarea).toHaveValue(DISCARDED_NOTE);
  await card.getByTestId("custom-scenario-retro-cancel-0").click();
  await expect(editor).toHaveCount(0);

  // After cancel the read-only note must still not exist and the add CTA
  // should be back. Re-opening the editor should show an empty textarea —
  // proving the discarded text never round-tripped through state.
  await expect(card.getByTestId("custom-scenario-retro-note-0")).toHaveCount(0);
  await expect(card.getByTestId("custom-scenario-retro-add-0")).toBeVisible();
  await card.getByTestId("custom-scenario-retro-add-0").click();
  await expect(card.getByTestId("custom-scenario-retro-textarea-0")).toHaveValue("");

  // Save branch — type the real note, save, and assert the read-only button
  // renders with the persisted text. The mutation refetches the model, so
  // we wait on the read-only testid (which only appears once `cs.retrospective`
  // is truthy after the refetch) rather than racing the network.
  await card.getByTestId("custom-scenario-retro-textarea-0").fill(SAVED_NOTE);
  await card.getByTestId("custom-scenario-retro-save-0").click();
  const readOnly = card.getByTestId("custom-scenario-retro-note-0");
  await expect(readOnly).toBeVisible();
  await expect(readOnly).toContainText(SAVED_NOTE);
  // Editor is gone after save.
  await expect(card.getByTestId("custom-scenario-retro-editor-0")).toHaveCount(0);
  await expect(card.getByTestId("custom-scenario-retro-add-0")).toHaveCount(0);

  // Re-opening the editor on a saved note must hydrate the textarea with
  // the persisted text (proves the read-only → edit transition reads from
  // the refetched model, not stale local state).
  await readOnly.click();
  await expect(card.getByTestId("custom-scenario-retro-textarea-0")).toHaveValue(SAVED_NOTE);

  // Cancel on an existing note must restore the prior value, not blank it.
  await card.getByTestId("custom-scenario-retro-textarea-0").fill(FOLLOWUP_NOTE);
  await card.getByTestId("custom-scenario-retro-cancel-0").click();
  await expect(card.getByTestId("custom-scenario-retro-note-0")).toContainText(SAVED_NOTE);

  // Full reload — the saved note must survive a fresh fetch from the API,
  // not just the in-memory cache from the mutation's refetch.
  await page.reload();
  const reloadedCard = page.getByTestId("custom-scenario-card-0");
  await expect(reloadedCard.getByTestId("custom-scenario-retro-note-0")).toContainText(SAVED_NOTE);
});
