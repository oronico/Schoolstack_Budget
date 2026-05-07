import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #652: end-to-end coverage for the founder-comp benchmark panel
// (Task #633's expanded NAIS / NACSA / BLS lookup with inline source
// citation). Unit tests already pin the math in
// `founder-comp-normalization.test.ts`, but until now nothing asserted
// that the StaffingStep actually *renders* the source pill, the
// explanation sentence, the citation footnote, and the fallback hint.
// Without this spec, an unrelated edit to the staffing step (e.g. a
// className change, a reshuffled wrapper, a stripped data-testid) could
// silently delete the suggestion UI and only the unit tests would still
// pass.
//
// Scenarios:
//   1. private_school + OH + y1=100  → NAIS pill, $140,000 suggestion.
//   2. charter_school + OH + y1=200  → NACSA pill, $120,000 suggestion.
//   3. catholic_school + OH + y1=100 → blended-fallback pill + the
//      "your school type isn't in NAIS or NACSA medians" hint.

const TEST_PASSWORD = "PlaywrightTest12345!";

type SeedSchoolType =
  | "private_school"
  | "charter_school"
  | "catholic_school";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(
  request: APIRequestContext,
  schoolType: SeedSchoolType,
  enrollmentY1: number,
  label: string,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-founder-bench-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token);

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `E2E FounderBench ${label}`,
      currentStep: 5,
      data: {
        schoolProfile: {
          schoolName: `E2E FounderBench ${label}`,
          // OH is medium COL → multiplier 1.0, so the rendered amount is
          // the unadjusted base median for the size band. Keeping this
          // fixed makes the assertions resilient to future tenure /
          // COL multiplier tweaks.
          state: "OH",
          schoolType,
          entityType: "nonprofit_501c3",
          schoolStage: "operating_school",
          fundingProfile:
            schoolType === "charter_school"
              ? "charter_public_funded"
              : "tuition_based",
          operatingYear: "second_year_plus",
          openingYear: 2022,
          fiscalYearStartMonth: 7,
          currentStudents: enrollmentY1,
          longTermEnrollmentGoal: enrollmentY1 + 100,
          maxCapacity: enrollmentY1 + 200,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
        },
        enrollment: {
          year1: enrollmentY1,
          year2: enrollmentY1 + 20,
          year3: enrollmentY1 + 40,
          year4: enrollmentY1 + 60,
          year5: enrollmentY1 + 80,
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

test("private school renders the NAIS source pill, citation, and suggested amount", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(
    request,
    "private_school",
    100,
    "NAIS",
  );
  await primeAuthToken(page, token);
  await gotoStaffingStep(page, modelId);

  // Source pill = NAIS 2023–24 (from BENCHMARKS_BY_SCHOOL_TYPE.private_school).
  const pill = page.getByTestId("founder-benchmark-source-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/NAIS 2023.?24/);

  // The full source-citation block carries the suggested amount, the
  // explanation sentence, and the long citation.
  const sourceBlock = page.getByTestId("founder-benchmark-source");
  // private_school xs band ($140k) × medium COL (1.0) × experienced (1.0).
  await expect(sourceBlock).toContainText("$140,000");
  await expect(sourceBlock).toContainText("OH");
  await expect(sourceBlock).toContainText(/under 150 students/i);
  await expect(sourceBlock).toContainText(
    /Head of School Compensation Report/i,
  );

  // The "Use suggested market rate" CTA is wired up — clicking it
  // populates the Year-1 normalized input with the suggested amount.
  await page.getByTestId("founder-apply-suggested").click();
  await expect(page.getByTestId("founder-normalized-y1")).toHaveValue("140000");
});

test("charter school renders the NACSA source pill at the right size band", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(
    request,
    "charter_school",
    200,
    "NACSA",
  );
  await primeAuthToken(page, token);
  await gotoStaffingStep(page, modelId);

  const pill = page.getByTestId("founder-benchmark-source-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/NACSA/);

  const sourceBlock = page.getByTestId("founder-benchmark-source");
  // charter_school s band (150–300 students) = $120k, OH medium COL = 1.0.
  await expect(sourceBlock).toContainText("$120,000");
  await expect(sourceBlock).toContainText(/150.?300 students/i);
  await expect(sourceBlock).toContainText(/charter authorizer/i);

  // No fallback hint should render for a covered school type.
  await expect(sourceBlock).not.toContainText(
    /isn't in NAIS or NACSA medians/i,
  );
});

test("uncovered school type renders the blended fallback pill and the fallback hint", async ({
  page,
  request,
}) => {
  // catholic_school is a valid wizard enum value but is intentionally
  // NOT in BENCHMARKS_BY_SCHOOL_TYPE — it should resolve to the blended
  // NAIS+NACSA fallback table and surface the explicit hint copy.
  const { token, modelId } = await seedModel(
    request,
    "catholic_school",
    100,
    "Fallback",
  );
  await primeAuthToken(page, token);
  await gotoStaffingStep(page, modelId);

  const pill = page.getByTestId("founder-benchmark-source-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/[Ff]allback/);

  const sourceBlock = page.getByTestId("founder-benchmark-source");
  // Fallback xs band = avg($140k NAIS, $95k NACSA) = $117,500 → rounded
  // to nearest $1k = $118,000 in OH (medium COL).
  await expect(sourceBlock).toContainText("$118,000");
  // The italic disclaimer that calls out the fallback path explicitly.
  await expect(sourceBlock).toContainText(/isn't in NAIS or NACSA medians/i);
  await expect(sourceBlock).toContainText(/Blended NAIS \+ NACSA median/i);
});
