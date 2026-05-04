import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Verifies the Lender Language toggle (Task #299):
// 1. The dashboard surfaces the toggle on the Year-1 financial snapshot.
// 2. Toggling it relabels the four KPI tiles to their lender equivalents
//    (NOI, EBITDA, DSCR, Working Capital).
// 3. The preference is persisted server-side: a fresh page load keeps the
//    toggle in its last-set state.
// 4. The /resources/financial-statements-101 primer is reachable and renders
//    the three statement sections (P&L, Balance Sheet, Cash Flow Statement).

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

// Seed a registered user with a model that has enough revenue/expense rows
// for the dashboard's Financial Snapshot to render KPI tiles.
async function seedFounderWithModel(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-lender-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // The dashboard pops a "Choose your guidance level" modal whenever the
  // user has no guidanceLevel set, which intercepts pointer events on the
  // KPI toggle. Pre-set it so the test can interact with the snapshot.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  expect(
    guidanceRes.ok(),
    `set guidance level failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();

  // The dashboard's Financial Snapshot block renders the toggle + KPI tiles
  // as long as a model exists; we don't need full row data for the toggle's
  // label-translation contract (that's what this test asserts on).
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Lender Language Academy",
      currentStep: 0,
      data: {
        schoolProfile: {
          schoolName: "E2E Lender Language Academy",
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

test("lender language toggle relabels KPIs and persists across reloads", async ({
  page,
  request,
}) => {
  const { token } = await seedFounderWithModel(request);
  await primeAuthToken(page, token);

  await page.goto("/dashboard");

  // The Financial Snapshot block should mount with the toggle in its header.
  const snapshot = page.getByTestId("dashboard-financial-snapshot");
  await expect(snapshot).toBeVisible();

  const toggle = page.getByTestId("lender-language-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Founder-mode labels are the default.
  const opLabel = page.getByTestId("dashboard-kpi-label-operating-surplus");
  const niLabel = page.getByTestId("dashboard-kpi-label-net-income");
  const dscrLabel = page.getByTestId("dashboard-kpi-label-coverage-ratio");
  const wcLabel = page.getByTestId("dashboard-kpi-label-cash-reserve");

  await expect(opLabel).toContainText("Operating Surplus");
  await expect(niLabel).toContainText("Net Income");
  await expect(dscrLabel).toContainText("Coverage Ratio");
  await expect(wcLabel).toContainText("Cash Reserve");

  // Flip to lender mode.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(opLabel).toContainText("NOI");
  await expect(niLabel).toContainText("EBITDA");
  await expect(dscrLabel).toContainText("DSCR");
  await expect(wcLabel).toContainText("Working Capital");

  // Reload and confirm the server-side preference survived.
  await page.reload();
  const toggleAfter = page.getByTestId("lender-language-toggle");
  await expect(toggleAfter).toBeVisible();
  await expect(toggleAfter).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByTestId("dashboard-kpi-label-operating-surplus"),
  ).toContainText("NOI");
});

test("financial-statements-101 primer is reachable with all three statement sections", async ({
  page,
}) => {
  await page.goto("/resources/financial-statements-101");

  // The primer is a static article; assert its three top-level statement
  // sections render so the cross-link from "From budget to books" lands on
  // a meaningful page, not a 404 stub.
  await expect(
    page.getByRole("heading", { name: /Financial Statements 101/i }),
  ).toBeVisible();
  await expect(page.getByText(/Profit & Loss Statement/i).first()).toBeVisible();
  await expect(page.getByText(/Balance Sheet/i).first()).toBeVisible();
  await expect(page.getByText(/Cash Flow Statement/i).first()).toBeVisible();
});

