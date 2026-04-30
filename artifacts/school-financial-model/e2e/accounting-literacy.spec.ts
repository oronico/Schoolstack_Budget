import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Verifies the Accounting Literacy Core surfaces (Task #298):
// - The "What this means in your books" sidebar renders on the Revenue
//   wizard step in basics-mode and exposes its bookkeeping-line content.
// - The "From budget to books" micro-lesson renders at the bottom of the
//   Review step with the three accounting-statement blocks (P&L,
//   Balance Sheet, Cash Flow).
// Component tests cover content; only a real browser proves the wizard
// shell mounts the sidebar once and that step navigation surfaces the
// per-step bookkeeping registry entry to the user.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(
  request: APIRequestContext,
  currentStep: number,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-acctlit-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
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
      name: "E2E Accounting Literacy Academy",
      currentStep,
      data: {
        schoolProfile: {
          schoolName: "E2E Accounting Literacy Academy",
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
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Revenue step shows the bookkeeping-translation sidebar to basics-mode users", async ({
  page,
  request,
}) => {
  // The wizard applies a one-time +1 step migration (a "Story" step was
  // inserted at position 1), then a one-time reorderV2 remap (Capital &
  // Financing was split out, Assumptions moved to position 8). Seeding
  // currentStep=4 → storyMigration → 5 → reorderV2 map[5]=4 lands the
  // user on step 4 (the new Revenue position) on first load.
  const { token, modelId } = await seedModel(request, 4);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  const sidebar = page.getByTestId("bookkeeping-sidebar-step-4");
  await expect(sidebar).toBeVisible();
  // The sidebar header should be the literal "What this means in your books"
  // surface — not the diagnostic panel or any other coaching widget.
  await expect(sidebar).toContainText("What this means in your books");
});

test("Review step renders the From-budget-to-books micro-lesson with the three statement blocks", async ({
  page,
  request,
}) => {
  // The wizard's one-time +1 step migration shifts seeded currentStep forward
  // by one, so seeding 7 lands the user on step 8 (Review) on first load.
  const { token, modelId } = await seedModel(request, 7);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  const lesson = page.getByTestId("budget-to-books-lesson");
  await expect(lesson).toBeVisible();
  // The three accounting-statement blocks are the contract under test —
  // proves the structured-content rewrite (vs. a generic single-paragraph
  // micro-lesson body) shipped to users.
  await expect(lesson).toContainText("From budget to books");
  await expect(lesson).toContainText("P&L");
  await expect(lesson).toContainText("Balance Sheet");
  await expect(lesson).toContainText("Cash Flow");
});
