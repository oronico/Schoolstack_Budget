import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #345: when the staffing roster grows past ~10 rows, the founder needs
// a fast way to find a single role without scrolling the whole list. We add
// a quick-finder (search input + "Jump to" category chips) gated on
// `rows.length > 10`. This test covers both sides of the gate:
//   1. A 50-row roster shows the quick-finder; typing narrows the list and
//      the per-category chips reflect the filtered counts; clicking a chip
//      scrolls to that category section.
//   2. A small roster (≤ 10 rows) does NOT render the quick-finder so the
//      smallest models stay visually unchanged (the task's explicit
//      "≤ ~10 rows — no new affordances" acceptance criterion).

const TEST_PASSWORD = "PlaywrightTest12345!";

type StaffRow = {
  id: string;
  roleName: string;
  functionCategory:
    | "instructional"
    | "school_leadership"
    | "student_support"
    | "operations"
    | "administrative"
    | "other";
  employmentType: "full_time" | "part_time" | "contract";
  staffingMode: "fixed" | "ratio";
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
};

function buildBigRoster(): StaffRow[] {
  const rows: StaffRow[] = [];
  // 30 instructional, 6 leadership, 6 student support, 4 operations, 4 admin
  // = 50 rows total — well past the >10 threshold and large enough that the
  // ergonomics problem this task is solving is real.
  for (let i = 1; i <= 30; i++) {
    rows.push({
      id: `inst-${i}`,
      roleName: i === 17 ? "Lead Math Teacher" : `Teacher ${i}`,
      functionCategory: "instructional",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 55_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    });
  }
  for (let i = 1; i <= 6; i++) {
    rows.push({
      id: `lead-${i}`,
      roleName: i === 1 ? "Head of School" : `Leadership Role ${i}`,
      functionCategory: "school_leadership",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 110_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    });
  }
  for (let i = 1; i <= 6; i++) {
    rows.push({
      id: `support-${i}`,
      roleName: `Counselor ${i}`,
      functionCategory: "student_support",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 60_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    });
  }
  for (let i = 1; i <= 4; i++) {
    rows.push({
      id: `ops-${i}`,
      roleName: `Operations Manager ${i}`,
      functionCategory: "operations",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 65_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    });
  }
  for (let i = 1; i <= 4; i++) {
    rows.push({
      id: `admin-${i}`,
      roleName: `Admin ${i}`,
      functionCategory: "administrative",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 50_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    });
  }
  return rows;
}

function buildSmallRoster(): StaffRow[] {
  // 5 rows — well below the threshold; the quick-finder must NOT render.
  return [
    {
      id: "small-1",
      roleName: "Head of School",
      functionCategory: "school_leadership",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 110_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    },
    {
      id: "small-2",
      roleName: "Lead Teacher",
      functionCategory: "instructional",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 55_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    },
    {
      id: "small-3",
      roleName: "Assistant Teacher",
      functionCategory: "instructional",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 45_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    },
    {
      id: "small-4",
      roleName: "Counselor",
      functionCategory: "student_support",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 60_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    },
    {
      id: "small-5",
      roleName: "Office Manager",
      functionCategory: "administrative",
      employmentType: "full_time",
      staffingMode: "fixed",
      fte: 1,
      annualizedRate: 50_000,
      benefitsEligible: true,
      benefitsRate: 25,
      payrollTaxRate: 7.65,
      payrollLike: true,
    },
  ];
}

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(
  request: APIRequestContext,
  rows: StaffRow[],
  label: string,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-staffing-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `E2E Staffing ${label}`,
      currentStep: 5,
      data: {
        schoolProfile: {
          schoolName: `E2E Staffing ${label}`,
          state: "MA",
          schoolType: "private_school",
          entityType: "nonprofit_501c3",
          schoolStage: "operating_school",
          fundingProfile: "tuition_based",
          operatingYear: "second_year_plus",
          openingYear: 2022,
          fiscalYearStartMonth: 7,
          currentStudents: 200,
          longTermEnrollmentGoal: 320,
          maxCapacity: 400,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
        },
        enrollment: {
          year1: 200, year2: 230, year3: 260, year4: 290, year5: 320,
        },
        staffingRows: rows,
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

test("Quick-finder appears for large rosters and narrows the visible list", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request, buildBigRoster(), "Large");
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=5`);
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });

  // The quick-finder block renders for rosters > 10 rows.
  const finder = page.getByTestId("staffing-quick-finder");
  await expect(finder).toBeVisible({ timeout: 15_000 });

  const input = page.getByTestId("staffing-quick-finder-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", /50 total/);

  // All five non-empty categories should have a jump chip.
  for (const cat of [
    "instructional",
    "school_leadership",
    "student_support",
    "operations",
    "administrative",
  ]) {
    await expect(page.getByTestId(`staffing-jump-${cat}`)).toBeVisible();
  }

  // Type a role-name fragment unique to one row out of 50.
  await input.fill("Math");
  // The "X of Y" indicator should reflect the filtered count.
  await expect(finder).toContainText(/1 of 50/);

  // The matching row card is rendered; non-matching rows are not.
  const mathCard = page.getByRole("button", { name: /Lead Math Teacher/ });
  await expect(mathCard).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Counselor 1/ }),
  ).toHaveCount(0);

  // Task #346: the matched substring inside the role name is visually
  // emphasized via a <mark data-testid="match-highlight"> wrapper. The
  // highlight should only render inside the role-name span, the highlighted
  // text should preserve the source casing ("Math", not "math"), and the
  // surrounding role-name text ("Lead " / " Teacher") should remain
  // un-marked so the rest of the header still reads normally.
  const highlight = mathCard.getByTestId("match-highlight");
  await expect(highlight).toHaveCount(1);
  await expect(highlight).toHaveText("Math");

  // Filtering by a category label keyword shows the whole category.
  await input.fill("Operations");
  // Operations has 4 rows; "Operations Manager" also matches each role
  // name, so the visible count is the full operations group (4).
  await expect(finder).toContainText(/4 of 50/);
  const opsCard = page.getByRole("button", { name: /Operations Manager 1/ });
  await expect(opsCard).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Lead Math Teacher/ }),
  ).toHaveCount(0);
  // Each Operations row's name *also* contains "Operations", so every
  // visible card in this filter result should carry the highlight wrapper.
  await expect(
    page.getByTestId("match-highlight").filter({ hasText: "Operations" }),
  ).toHaveCount(4);

  // Counselor rows match the filter "Counselor" purely on role name
  // (their category label is "Student Support"). Confirm the highlight
  // still renders for that case so we know the helper is wired up to the
  // role name and not just to the category-driven match path.
  await input.fill("Counselor");
  await expect(finder).toContainText(/6 of 50/);
  await expect(
    page.getByTestId("match-highlight").filter({ hasText: "Counselor" }),
  ).toHaveCount(6);

  // When the founder's query matches *only* on the category label and not
  // on any role name, no highlight wrapper should render — the role-name
  // header degrades cleanly to plain text. "Student Support" is a category
  // label; none of the seeded role names contain that substring (the
  // counselors are literally just "Counselor 1".."Counselor 6"), so we
  // should see the 6 support rows without any highlight wrappers inside
  // those cards.
  await input.fill("Student Support");
  await expect(finder).toContainText(/6 of 50/);
  await expect(
    page.getByRole("button", { name: /Counselor 1/ }),
  ).toBeVisible();
  await expect(page.getByTestId("match-highlight")).toHaveCount(0);

  // Clearing the filter restores all rows.
  await page.getByRole("button", { name: /clear filter/i }).first().click();
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", { name: /Lead Math Teacher/ }),
  ).toBeVisible();

  // No-results state for a search with no matches.
  await input.fill("zzz-no-matching-role");
  await expect(page.getByText(/No staff roles match/i)).toBeVisible();

  // Clear so all categories render again, then verify a jump chip really
  // scrolls the target category section into view. With 50 rows of card
  // chrome above it, the "Administrative" section starts well below the
  // initial viewport — clicking the chip must bring it into view.
  await input.fill("");
  await expect(input).toHaveValue("");

  const adminHeading = page
    .locator("#staffing-cat-administrative h3")
    .filter({ hasText: /Administrative/i });
  // Force the page to a known scroll position so the assertion is meaningful.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  // Sanity check: before clicking the chip the heading is NOT in view (it sits
  // below 50+ row cards). Playwright's `isInViewport` returns false in that
  // case; we just don't assert false (transient layout would be flaky), we
  // assert the post-click state instead.
  await page.getByTestId("staffing-jump-administrative").click();
  await expect(adminHeading).toBeInViewport({ timeout: 5_000 });
});

test("Quick-finder is hidden for small rosters", async ({ page, request }) => {
  const { token, modelId } = await seedModel(request, buildSmallRoster(), "Small");
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=5`);
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });

  // The five seeded rows render…
  await expect(page.getByRole("button", { name: /Head of School/ })).toBeVisible();
  // …but the quick-finder must not appear for ≤10-row rosters.
  await expect(page.getByTestId("staffing-quick-finder")).toHaveCount(0);

  // Task #347: small rosters must not read or write the persisted-filter
  // sessionStorage slot. After landing on the staffing step there should be
  // no key for this model id, even though the page has fully rendered.
  const persistedKey = await page.evaluate((id) => {
    return window.sessionStorage.getItem(
      `staffing-quick-finder-filter:${id}`,
    );
  }, modelId);
  expect(persistedKey).toBeNull();
});

// Task #347: the quick-finder filter is the founder's "view" of a 50+ row
// roster. We persist it per-model in sessionStorage so navigating to a
// different wizard step and back, or hard-refreshing the page, doesn't wipe
// the search the founder just typed. Clearing the input must also wipe the
// persisted slot so a stale filter doesn't silently re-engage on the next
// visit.
test("Quick-finder filter survives navigation and hard reload", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(
    request,
    buildBigRoster(),
    "Persist",
  );
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=5`);
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });

  const finder = page.getByTestId("staffing-quick-finder");
  const input = page.getByTestId("staffing-quick-finder-input");
  await expect(finder).toBeVisible({ timeout: 15_000 });

  // Type a unique fragment so we can prove the filter is in effect after
  // re-mounting the step.
  await input.fill("Math");
  await expect(finder).toContainText(/1 of 50/);

  // The persisted slot is keyed by model id and now holds "Math".
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          return window.sessionStorage.getItem(
            `staffing-quick-finder-filter:${id}`,
          );
        }, modelId),
      { timeout: 5_000 },
    )
    .toBe("Math");

  // Navigate to another wizard step and back. The staffing step component
  // unmounts, so the local `useState` filter is lost — only the persisted
  // slot can bring it back.
  await page.goto(`/model/${modelId}?step=4`);
  await page.waitForLoadState("networkidle");
  await page.goto(`/model/${modelId}?step=5`);
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(finder).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue("Math");
  await expect(finder).toContainText(/1 of 50/);
  await expect(
    page.getByRole("button", { name: /Lead Math Teacher/ }),
  ).toBeVisible();

  // Hard reload — sessionStorage must persist across this and re-hydrate
  // the input.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(finder).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue("Math");
  await expect(finder).toContainText(/1 of 50/);

  // Clearing the input clears the persisted slot too — no zombie filter on
  // the next visit.
  await input.fill("");
  await expect(input).toHaveValue("");
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          return window.sessionStorage.getItem(
            `staffing-quick-finder-filter:${id}`,
          );
        }, modelId),
      { timeout: 5_000 },
    )
    .toBeNull();

  // Reload one more time to confirm: with the slot cleared, the input
  // comes back empty and all 50 rows are visible.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your Leadership and Staff/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", /50 total/);
});
