import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #666: end-to-end coverage for the per-year founder-comp benchmark
// UI (Task #650). Unit tests in `founder-comp-normalization.test.ts`
// already pin the math behind `getFounderCompBenchmarkPerYear` and
// `getFounderCompBandTransitions`, but until now nothing asserted that
// the StaffingStep actually renders the per-year suggested cells, the
// band-transition callout, AND that "Use suggested market rate" fills
// the per-year normalized inputs with the per-year escalated benchmark
// values (not just the y1 amount broadcast forward).
//
// Scenario: a private_school in OH (medium COL, multiplier 1.0) with
// COLA=0 so the only thing changing year-over-year is the size band.
// Enrollment grows 100 → 130 → 160 → 190 → 220, which crosses the NAIS
// xs (under 150) → s (150–300) threshold at year 3. Expected per-year
// suggestions: 140k, 140k, 180k, 180k, 180k with a single band
// transition callout pointing at year 3.

const TEST_PASSWORD = "PlaywrightTest12345!";

async function seedModel(
  request: APIRequestContext,
): Promise<{ token: string; modelId: number }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-founder-peryear-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder PerYear",
  });
  await seedPersona(request, token);

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `E2E FounderPerYear ${stamp}`,
      currentStep: 5,
      data: {
        schoolProfile: {
          schoolName: `E2E FounderPerYear ${stamp}`,
          state: "OH",
          schoolType: "private_school",
          entityType: "nonprofit_501c3",
          schoolStage: "operating_school",
          fundingProfile: "tuition_based",
          operatingYear: "second_year_plus",
          openingYear: 2022,
          fiscalYearStartMonth: 7,
          currentStudents: 100,
          longTermEnrollmentGoal: 300,
          maxCapacity: 400,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
        },
        // Growth crosses the NAIS xs→s threshold (150 students) between
        // year 2 and year 3.
        enrollment: {
          year1: 100,
          year2: 130,
          year3: 160,
          year4: 190,
          year5: 220,
        },
        // Pin COLA to 0 so per-year suggested amounts are purely driven
        // by the size-band lookup. Avoids drift if the rounding logic
        // for COLA escalation is ever tweaked.
        facilities: {
          annualSalaryIncrease: 0,
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

async function gotoStaffingStep(page: Page, modelId: number): Promise<void> {
  await page.goto(`/model/${modelId}?step=5`);
  await expect(
    page.getByRole("heading", {
      name: /Tell Us About Your Leadership and Staff/i,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("founder-comp-panel")).toBeVisible({
    timeout: 15_000,
  });
}

test("per-year suggested cells, band-transition callout, and apply-suggested fill the normalized array", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request);
  await primeAuthToken(page, token);
  await gotoStaffingStep(page, modelId);

  // The per-year suggested grid renders one cell per modeled year.
  const perYearGrid = page.getByTestId("founder-suggested-per-year");
  await expect(perYearGrid).toBeVisible();

  // private_school NAIS bands at OH (medium COL ×1.0), experienced
  // tenure ×1.0, COLA=0% → xs=$140k, s=$180k. Enrollment 100,130,160,
  // 190,220 → bands xs,xs,s,s,s.
  await expect(page.getByTestId("founder-suggested-y1")).toContainText("$140,000");
  await expect(page.getByTestId("founder-suggested-y2")).toContainText("$140,000");
  await expect(page.getByTestId("founder-suggested-y3")).toContainText("$180,000");
  await expect(page.getByTestId("founder-suggested-y4")).toContainText("$180,000");
  await expect(page.getByTestId("founder-suggested-y5")).toContainText("$180,000");

  // The "↑ new band" inline marker fires only on the year that crosses
  // a band, so y3 has it and y1/y2/y4/y5 do not.
  await expect(page.getByTestId("founder-band-transition-y3")).toBeVisible();
  await expect(page.getByTestId("founder-band-transition-y2")).toHaveCount(0);
  await expect(page.getByTestId("founder-band-transition-y4")).toHaveCount(0);

  // The standalone band-transition callout summarizes each crossing in
  // plain language with the year and the new suggested rate.
  const callout = page.getByTestId("founder-band-transitions");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText(/crosses NAIS \/ NACSA size bands/i);
  const calloutMsg = page.getByTestId("founder-band-transition-msg-y3");
  await expect(calloutMsg).toBeVisible();
  await expect(calloutMsg).toContainText(/Year 3/i);
  await expect(calloutMsg).toContainText(/under 150 students/i);
  await expect(calloutMsg).toContainText(/150.?300 students/i);
  await expect(calloutMsg).toContainText("$180,000");

  // Clicking "Use suggested market rate" should populate every
  // normalized year input with the corresponding per-year escalated
  // benchmark — NOT broadcast the y1 value across all years.
  await page.getByTestId("founder-apply-suggested").click();
  await expect(page.getByTestId("founder-normalized-y1")).toHaveValue("140000");
  await expect(page.getByTestId("founder-normalized-y2")).toHaveValue("140000");
  await expect(page.getByTestId("founder-normalized-y3")).toHaveValue("180000");
  await expect(page.getByTestId("founder-normalized-y4")).toHaveValue("180000");
  await expect(page.getByTestId("founder-normalized-y5")).toHaveValue("180000");
});
