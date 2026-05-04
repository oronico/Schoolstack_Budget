import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #464: end-to-end coverage for the single-year wizard step list.
//
// The pure-helper unit test (Task #461) asserts `computeVisibleSteps` filters
// out Lender Narrative when `modelDuration === "single_year"`. This spec
// exercises the full integration: seed a single-year model, open the wizard,
// confirm the rendered sidebar has 11 step labels with no Lender Narrative,
// then click the banner's "Extend to 5-year" CTA, confirm in the modal, and
// assert Lender Narrative reappears at sidebar position 11.

const TEST_PASSWORD = "PlaywrightTest12345!";

async function registerAndSeed(request: APIRequestContext): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-single-year-steplist-${stamp}@e2e.schoolstack.test`;
  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);
  const guidance = await request.patch("/api/auth/guidance-level", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  expect(guidance.ok(), `guidance failed: ${guidance.status()}`).toBeTruthy();
  return token;
}

async function createSingleYearModel(request: APIRequestContext, token: string): Promise<number> {
  const payload = {
    name: "E2E Single-Year Step List",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Single-Year Academy",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        modelDuration: "single_year",
        plannedOpeningYear: "2027",
        openingYear: 2027,
        currentStudents: 0,
        longTermEnrollmentGoal: 120,
        maxCapacity: 150,
        fiscalYearStartMonth: 7,
        ownershipType: "rent",
        monthlyRent: 8000,
        accountingBasis: "accrual",
      },
      enrollment: { year1: 60, year2: 0, year3: 0, year4: 0, year5: 0 },
      programs: [],
      revenueRows: [],
      staffingRows: [],
      expenseRows: [],
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
    },
  };
  const res = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: payload,
  });
  expect(res.ok(), `create model failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { id } = (await res.json()) as { id: number };
  return id;
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// All step titles rendered in the sidebar (mirrors STEP_DEFINITIONS in
// computeVisibleSteps). In single-year mode "Lender Narrative" is filtered
// out, leaving 11 entries.
const FIVE_YEAR_TITLES = [
  "Story",
  "School Details",
  "Enrollment",
  "Revenue",
  "Staffing",
  "Expenses",
  "Capital & Financing",
  "Assumptions & Sensitivity",
  "Review",
  "Consultant",
  "Lender Narrative",
  "Export",
];
const SINGLE_YEAR_TITLES = FIVE_YEAR_TITLES.filter((t) => t !== "Lender Narrative");

async function readSidebarTitles(page: Page): Promise<string[]> {
  // Each step in the rail renders its title inside an absolutely-positioned
  // span sibling of the numbered button. We read the textContent of all such
  // spans and trim. Filter out empty strings (Tailwind hidden classes don't
  // remove text content) so we get the canonical visible-step list.
  const titles = await page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLSpanElement>("span.uppercase.tracking-wider"),
    );
    return spans.map((s) => (s.textContent ?? "").trim()).filter(Boolean);
  });
  return titles;
}

test("wizard sidebar omits Lender Narrative in single-year mode and restores it after Extend to 5-Year", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const token = await registerAndSeed(request);
  const modelId = await createSingleYearModel(request, token);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  // Dismiss the wizard prep dialog if it appears.
  try {
    await page.getByRole("button", { name: /Let.?s get started/i }).click({ timeout: 8000 });
  } catch {
    // not shown — fine
  }

  // Wait for the wizard chrome to settle on Step 1.
  await expect(
    page.getByRole("heading", { name: /Let.?s start with your school.?s story/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // The single-year banner must be present — its existence is what tells us
  // the form picked up modelDuration: "single_year" from the server payload.
  await expect(page.getByTestId("banner-extend-to-five-year")).toBeVisible();

  // Sidebar should expose exactly the 11 single-year titles in order, with
  // no Lender Narrative entry.
  const singleTitles = await readSidebarTitles(page);
  expect(singleTitles).toEqual(SINGLE_YEAR_TITLES);
  expect(singleTitles).toHaveLength(11);
  expect(singleTitles).not.toContain("Lender Narrative");

  // Click the banner's "Extend to 5-year" button to open the confirmation
  // modal, then confirm.
  await page.getByTestId("banner-extend-to-five-year").click();
  const modal = page.getByRole("dialog", { name: /Extend to a 5-year projection/i });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /Extend to 5-Year/i }).click();

  // Modal should close and the banner should disappear once the form flips
  // to five_year mode.
  await expect(modal).toBeHidden();
  await expect(page.getByTestId("banner-extend-to-five-year")).toHaveCount(0);

  // Sidebar should now expose the full 12-entry list with Lender Narrative
  // at position 11 (1-indexed).
  await expect
    .poll(async () => (await readSidebarTitles(page)).length, { timeout: 10_000 })
    .toBe(12);
  const fiveTitles = await readSidebarTitles(page);
  expect(fiveTitles).toEqual(FIVE_YEAR_TITLES);
  expect(fiveTitles[10]).toBe("Lender Narrative");
});
