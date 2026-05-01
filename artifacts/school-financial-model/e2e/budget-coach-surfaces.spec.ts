import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Task #286: regression coverage for the budget-coach surfaces shown to
// basics-mode founders.
//
// Three scenarios:
//   1. Basics-mode founder sees the launcher coach subtitles, the
//      WhyThisMatters callout on School Profile, the AccountingExport intro
//      lesson card, and at least one Impact-summary KPI nudge (driven by a
//      seeded model whose adjusted forecast trips runway<6mo + NI<0).
//   2. The same founder flipped to advanced loses the coach-only blocks
//      (decision-card coach subtitles, the export intro lesson) and the KPI
//      nudge text drops the "Coach:" prefix.
//   3. Uploading a fixture P&L CSV through the export uploader surfaces the
//      post-upload coach line with the totals copy ("we recognized a revenue
//      total, an expenses total, and a net income line").
//
// A future copy refactor or guidance-level wiring change could silently hide
// the coach for basics-mode founders (or leak it into advanced mode) without
// anyone noticing — these tests guard both directions.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
  email: string;
}

// Seeds a model whose year-1 adjusted forecast is engineered to fail at
// least one Impact-summary KPI threshold so `impact-coach-nudges` renders.
//   - Low enrollment + tuition revenue → ~$150k year-1 revenue.
//   - Heavy fixed rent line → ~$180k year-1 expenses.
//   - That delivers NI < 0 in year 1 → `ni` nudge.
//   - Tiny opening cash → cash runway < 6 months → `runway` nudge as backup.
async function seedFixture(
  request: APIRequestContext,
  guidanceLevel: "basics" | "advanced",
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-budget-coach-${guidanceLevel}-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Coach" },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };

  await seedPersona(request, token);

  // PATCH guidance-level explicitly so the test is robust to whatever
  // default `seedPersona` happens to produce. Basics is the persona-default
  // today, but we set it explicitly here to keep both branches symmetric.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { guidanceLevel },
  });
  expect(
    guidanceRes.ok(),
    `guidance-level patch failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "E2E Budget Coach Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Budget Coach Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
          debtIncluded: false,
        },
        // Low enrollment * modest tuition → tight revenue base.
        enrollment: { year1: 30, year2: 35, year3: 40, year4: 45, year5: 50, retentionRate: 88 },
        revenueRows: [
          {
            id: "rev1",
            category: "tuition_and_fees",
            lineItem: "Tuition",
            enabled: true,
            driverType: "per_student",
            amounts: [5000, 5000, 5000, 5000, 5000],
          },
        ],
        staffingRows: [],
        // Heavy rent line → expenses outrun revenue → NI<0 in year 1.
        expenseRows: [
          {
            id: "exp1",
            category: "occupancy_facility",
            lineItem: "Rent",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [180000, 185000, 190000, 195000, 200000],
          },
        ],
        capitalAndDebtRows: [],
        tuitionTiers: [],
        // Tiny opening cash → cash runway < 6 months as a second nudge trigger.
        openingBalances: { cash: 5000 },
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
    // Pre-decline the cookie banner so its bottom-of-viewport sheet does
    // not intercept clicks on decision-flow Continue buttons.
    window.localStorage.setItem("cookie_consent", "declined");
  }, token);
}

// Walks the change-enrollment flow from Why → Inputs → Impact and returns
// once the Impact step is visible. We only need to land on Impact — the
// adjusted forecast is what feeds `impact-coach-nudges`. We touch retention
// so `hasAnyChange` lets the Continue button advance.
async function walkToImpactStep(page: Page, modelId: number): Promise<void> {
  await page.goto(`/decisions/change-enrollment/${modelId}`);
  await expect(page.getByTestId("decision-flow-change_enrollment")).toBeVisible();
  await expect(page.getByTestId("why-step-change_enrollment")).toBeVisible();
  await page.getByTestId("decision-why-narrative").fill("Coach surface regression check.");
  await page.getByTestId("decision-flow-next").click();

  await expect(page.getByTestId("change-enrollment-inputs")).toBeVisible();
  await page.getByTestId("change-enrollment-retention").fill("85");
  await page.getByTestId("decision-flow-next").click();

  await expect(page.getByTestId("change-enrollment-impact")).toBeVisible();
  await expect(page.getByTestId("decision-impact-summary")).toBeVisible();
}

test("Budget-coach surfaces: basics-mode founder sees launcher subtitles, WhyThisMatters, accounting export intro, and Impact KPI nudge", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request, "basics");
  await primeAuthToken(page, token);

  // --- Dashboard launcher coach subtitles ---
  await page.goto("/dashboard");
  // All three decision cards expose a `${testid}-coach-subtitle` element when
  // the founder is not in advanced mode. They're rendered alongside the card,
  // not inside an expanded popover, so they're visible immediately.
  await expect(page.getByTestId("decision-card-add-program-coach-subtitle")).toBeVisible();
  await expect(page.getByTestId("decision-card-evaluate-site-coach-subtitle")).toBeVisible();
  await expect(page.getByTestId("decision-card-change-enrollment-coach-subtitle")).toBeVisible();

  // --- Wizard School Profile step: WhyThisMatters + accounting export intro ---
  // `?step=N` deep-links straight to the requested step on first wizard load,
  // bypassing storyMigration / reorderV2 mapping.
  await page.goto(`/model/${modelId}?step=2`);
  // The WhyThisMatters callout has no testid — locate by its sticky heading.
  await expect(page.getByText("Why this matters", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("accounting-export-lesson")).toBeVisible();
  // Sanity check: the intro card carries the lesson title copy.
  await expect(page.getByTestId("accounting-export-lesson")).toContainText(/Quick lesson/i);

  // --- Impact summary KPI nudge ---
  await walkToImpactStep(page, modelId);
  await expect(page.getByTestId("impact-coach-nudges")).toBeVisible();
  // Either NI<0 or runway<6mo (or both) trips on the seeded model. Use a
  // permissive `or` locator so the test isn't brittle to which threshold
  // the engine ends up reporting.
  const niNudge = page.getByTestId("impact-coach-nudge-ni");
  const runwayNudge = page.getByTestId("impact-coach-nudge-runway");
  await expect(niNudge.or(runwayNudge).first()).toBeVisible();
  // Basics mode adds the "Coach:" prefix to whichever nudges fire.
  await expect(page.getByTestId("impact-coach-nudges")).toContainText(/Coach:/);
});

test("Budget-coach surfaces: advanced founder loses the coach-only blocks", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request, "advanced");
  await primeAuthToken(page, token);

  // --- Dashboard: launcher coach subtitles must not render in advanced ---
  await page.goto("/dashboard");
  await expect(page.getByTestId("decision-card-add-program")).toBeVisible();
  await expect(page.getByTestId("decision-card-add-program-coach-subtitle")).toHaveCount(0);
  await expect(page.getByTestId("decision-card-evaluate-site-coach-subtitle")).toHaveCount(0);
  await expect(page.getByTestId("decision-card-change-enrollment-coach-subtitle")).toHaveCount(0);

  // --- Wizard School Profile step: accounting export intro lesson hidden ---
  await page.goto(`/model/${modelId}?step=2`);
  // Wait for the uploader itself so we know the step is mounted before
  // asserting the (absent) lesson card.
  await expect(page.getByTestId("accounting-export-uploader")).toBeVisible();
  await expect(page.getByTestId("accounting-export-lesson")).toHaveCount(0);

  // --- Impact summary: KPI nudge container still shows (it's not coach-gated
  //     by design — DSCR<1.20 / runway<6mo / NI<0 are surfaced to every user)
  //     but the verbose "Coach:" prefix is dropped for advanced founders. ---
  await walkToImpactStep(page, modelId);
  await expect(page.getByTestId("impact-coach-nudges")).toBeVisible();
  await expect(page.getByTestId("impact-coach-nudges")).not.toContainText(/Coach:/);
});

test("Budget-coach surfaces: post-upload coach line summarizes recognized totals", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request, "basics");
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=2&focus=accounting-export`);
  await expect(page.getByTestId("accounting-export-uploader")).toBeVisible();

  // Stripped-down QuickBooks-style P&L: explicit Total Revenue, Total
  // Expenses, and Net Income lines so all three category totals are
  // recognized by `parseAccountingExportCsv`. We use plain (unquoted)
  // amounts without thousands separators so the CSV survives a round-trip
  // through Playwright's setInputFiles → browser File → text() pipeline
  // without quote-escaping headaches.
  const csv = [
    "Account,Amount",
    "Income,",
    "Tuition,500000",
    "Total Revenue,500000",
    "Expenses,",
    "Salaries,300000",
    "Rent,120000",
    "Total Expenses,420000",
    "Net Income,80000",
  ].join("\n");

  await page.getByTestId("accounting-export-file-input").setInputFiles({
    name: "acme-pl-2026.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  // After parsing, the summary block + the post-upload coach line both render.
  await expect(page.getByTestId("accounting-export-summary")).toBeVisible();
  await expect(page.getByTestId("accounting-export-filename")).toHaveText("acme-pl-2026.csv");

  const coachLine = page.getByTestId("accounting-export-post-upload-coach");
  await expect(coachLine).toBeVisible();
  // Totals copy: with all three headline rows present the parser emits
  // "a revenue total, an expenses total, and a net income line".
  await expect(coachLine).toContainText("a revenue total");
  await expect(coachLine).toContainText("an expenses total");
  await expect(coachLine).toContainText("a net income line");
  // And the explicit "next step is where you map each account" cue.
  await expect(coachLine).toContainText(/map each account/i);
});
