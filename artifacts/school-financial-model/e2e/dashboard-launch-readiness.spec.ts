import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #719 — end-to-end coverage for the dashboard launch-readiness card
// added in #711. The unit test in
// `src/components/dashboard/__tests__/LaunchReadinessCard.test.tsx`
// verifies the rolled-up count, the "still missing" copy, and that
// clicking the card calls `setLocation` with the canonical query string.
// What the unit test cannot prove is the deep-link contract end-to-end:
// that `?step=3&focus=launch-checklist` actually lands the founder on
// the Enrollment step with `LaunchAssumptionsChecklist` mounted in its
// focused (scrolled-into-view) state. This spec wires the whole flow:
// seed a yet_to_launch founder, create a new-school model with a
// partially-filled launch checklist, render the dashboard, assert the
// card's count, click it, and verify the wizard opens on the Enrollment
// step with `data-testid="launch-assumptions-checklist"` visible and
// flagged `data-focused="true"`.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
  modelName: string;
}

// Three of nine launch-checklist items are filled — matches the
// "3 of 9" arithmetic asserted below. Picking exactly three (and
// the same three the unit test uses) makes the count regression a
// loud "expected 3 of 9 / got X of 9" failure rather than a vague
// off-by-one.
const FILLED_FIELDS = 3;
const TOTAL_FIELDS = 9;

async function seedYetToLaunchFounderWithPartialChecklist(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-launch-readiness-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token, {
    stage: "yet_to_launch",
    comfort: "new_to_budgeting",
  });

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Pre-set the guidance level so the dashboard's "Choose your guidance
  // level" modal doesn't intercept clicks on the launch-readiness card.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: { guidanceLevel: "extra" },
  });
  expect(
    guidanceRes.ok(),
    `set guidance level failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();

  const modelName = "E2E Launch Readiness Academy";
  const createRes = await request.post("/api/models", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: {
      name: modelName,
      currentStep: 1,
      data: {
        schoolProfile: {
          schoolName: modelName,
          state: "MA",
          schoolType: "private_school",
          entityType: "nonprofit_501c3",
          // The card only renders for new_school models — this is the
          // exact gate we want to lock in.
          schoolStage: "new_school",
          fundingProfile: "tuition_based",
          plannedOpeningYear: "2027",
          openingYear: 2027,
          currentStudents: 0,
          longTermEnrollmentGoal: 100,
          maxCapacity: 120,
          fiscalYearStartMonth: 7,
          ownershipType: "rent",
          monthlyRent: 8000,
          accountingBasis: "accrual",
          // 3 of 9 launch-checklist items filled — the rest are
          // intentionally absent so the card surfaces "still missing".
          launchAssumptions: {
            projectedOpeningMonth: "Aug 2026",
            committedStudents: 12,
            signedEnrollmentAgreements: 5,
          },
        },
        enrollment: { year1: 60, year2: 70, year3: 80, year4: 90, year5: 100 },
        programs: [],
        revenueRows: [],
        staffingRows: [],
        expenseRows: [],
        capitalAndDebtRows: [],
        assumptionFlagResponses: [],
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId, modelName };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("dashboard launch-readiness card shows the partial count and deep-links to the focused checklist", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const { token, modelId, modelName } =
    await seedYetToLaunchFounderWithPartialChecklist(request);

  await primeAuthToken(page, token);

  await page.goto("/dashboard");

  // The persona is seeded, so no first-time prompt should block the
  // dashboard surfaces we're about to assert on.
  await expect(page.getByTestId("founder-persona-prompt")).toHaveCount(0);

  // The card itself — gated to new_school models, so its mere presence
  // already proves the schoolStage branch.
  const card = page.getByTestId("dashboard-launch-readiness");
  await expect(card).toBeVisible({ timeout: 20_000 });

  // The card should call out the model it's summarizing so a founder
  // with multiple models knows which one it's pointing at.
  await expect(card).toContainText(modelName);

  // 3 of 9 — the count is the heart of the regression we're guarding.
  // If the FIELDS array is reordered or a new field is added without
  // updating the unit test's "of N" wording, this assertion will fail
  // loudly rather than drift silently.
  await expect(page.getByTestId("launch-readiness-progress")).toContainText(
    `${FILLED_FIELDS} of ${TOTAL_FIELDS} launch-checklist items filled`,
  );

  // The first unfilled field in the canonical FIELDS order is
  // "Deposits collected" (the unit test pins the same expectation —
  // keeping the e2e in sync proves the order survives bundling).
  await expect(page.getByTestId("launch-readiness-missing")).toContainText(
    /Deposits collected/i,
  );

  // Click the card — this is what a founder actually does. The
  // deep-link query string contract (`?step=3&focus=launch-checklist`)
  // is what the wizard reads on mount, so verifying the URL after
  // navigation pins down both halves of the contract: the card emits
  // the right URL AND the wizard accepts it.
  await card.click();

  await expect(page).toHaveURL(/\/model\/\d+\?step=3&focus=launch-checklist/);

  // The Enrollment step's heading must render — proves
  // `?step=3` actually opened the right step rather than falling back
  // to the persisted "currentStep: 1" we seeded.
  await expect(
    page.getByRole("heading", { name: /Programs\s*&\s*Enrollment/i }).first(),
  ).toBeVisible({ timeout: 20_000 });

  // The launch checklist must be mounted (it's gated on
  // `schoolStage === "new_school"` inside the component) AND the
  // `focused` prop must have been forwarded from the deep-link parser
  // so the scroll-into-view effect ran. We assert via
  // `data-focused="true"` — an attribute the component only sets when
  // the prop is true — rather than trying to detect actual scroll
  // position, which is brittle under headless Chromium.
  const checklist = page.getByTestId("launch-assumptions-checklist");
  await expect(checklist).toBeVisible({ timeout: 10_000 });
  await expect(checklist).toHaveAttribute("data-focused", "true");

  // Finally, sanity-check that one of the inputs the founder actually
  // came here to fill (deposits collected — the "still missing" item
  // surfaced on the card) is present and reachable.
  await expect(
    page.locator(
      'input[name="schoolProfile.launchAssumptions.depositsCollected"]',
    ),
  ).toBeVisible();
});
