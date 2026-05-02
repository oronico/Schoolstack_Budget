import { test, expect } from "./utils/test";

// Verifies the public /solutions hub page (Task #310):
// - The page renders all 5 expected capability cards via the
//   data-testid="solution-card-<slug>" hooks already present on each card.
// - Clicking a card navigates to the corresponding /solutions/<slug>
//   detail page and that page renders.
// - The "All capabilities" footer link from a detail page navigates back
//   to /solutions.
//
// The slugs and order are intentionally hard-coded here so the test acts
// as a contract: any rename or reordering of SOLUTION_PAGES will cause
// this test to fail loudly.

const EXPECTED_SOLUTIONS: { slug: string; detailHeadline: RegExp }[] = [
  {
    slug: "single-year-pro-forma",
    detailHeadline: /clear Year 1 budget/i,
  },
  {
    slug: "five-year-pro-forma",
    detailHeadline: /Five years of financial story/i,
  },
  {
    slug: "scenario-planning",
    detailHeadline: /Test the downside/i,
  },
  {
    slug: "debt-analysis",
    detailHeadline: /Know your debt service/i,
  },
  {
    slug: "budgeting-accounting-guidance",
    detailHeadline: /Coaching built into the model/i,
  },
];

test.describe("Solutions hub page", () => {
  test("renders all 5 capability cards in the expected order", async ({
    page,
  }) => {
    await page.goto("/solutions");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Everything SchoolStack Budget can do/i,
      }),
    ).toBeVisible();

    for (const { slug } of EXPECTED_SOLUTIONS) {
      await expect(
        page.getByTestId(`solution-card-${slug}`),
        `expected solution card for slug "${slug}" to be visible on /solutions`,
      ).toBeVisible();
    }

    // Lock in card ordering as a contract: a reorder of SOLUTION_PAGES
    // (the documented regression risk) must trip this test rather than
    // silently shipping. Read every rendered card test id from the DOM
    // and compare its sequence to the expected list.
    const renderedSlugs = await page
      .locator('[data-testid^="solution-card-"]')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => (n as HTMLElement).getAttribute("data-testid") ?? "")
          .map((id) => id.replace(/^solution-card-/, "")),
      );
    expect(renderedSlugs).toEqual(EXPECTED_SOLUTIONS.map((s) => s.slug));
  });

  test("clicking a card navigates to the matching detail page", async ({
    page,
  }) => {
    await page.goto("/solutions");

    // Pick a representative card (debt-analysis) to click; the contract we
    // are locking in is that the card href matches /solutions/<slug> and
    // that the detail page renders for that slug.
    const target = EXPECTED_SOLUTIONS.find((s) => s.slug === "debt-analysis");
    if (!target) {
      throw new Error("debt-analysis missing from EXPECTED_SOLUTIONS");
    }

    await page.getByTestId(`solution-card-${target.slug}`).click();

    await expect(page).toHaveURL(new RegExp(`/solutions/${target.slug}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: target.detailHeadline }),
    ).toBeVisible();
  });

  // Task #316: lock in that EVERY /solutions/<slug> detail page renders
  // without throwing. The hub-click test above only exercises one slug
  // (debt-analysis); if a slug is renamed in SOLUTION_PAGES but the
  // corresponding detail data or visuals component breaks, the regression
  // would only surface when a user clicked through. This parameterized
  // test visits each detail URL directly and asserts the expected H1
  // (composed of `headline` + `headlineAccent` in SolutionPageLayout) is
  // visible, which both proves the page rendered and that the slug still
  // resolves to the expected content.
  for (const { slug, detailHeadline } of EXPECTED_SOLUTIONS) {
    test(`renders /solutions/${slug} detail page without errors`, async ({
      page,
    }) => {
      const pageErrors: Error[] = [];
      page.on("pageerror", (err) => {
        pageErrors.push(err);
      });

      await page.goto(`/solutions/${slug}`);

      await expect(
        page.getByRole("heading", { level: 1, name: detailHeadline }),
        `expected detail page H1 for slug "${slug}" to match ${detailHeadline}`,
      ).toBeVisible();

      // The "Page not found" fallback in src/pages/solutions/index.tsx
      // also renders an h1, so explicitly assert we did not land on it.
      await expect(
        page.getByRole("heading", { level: 1, name: /Page not found/i }),
      ).toHaveCount(0);

      expect(
        pageErrors,
        `expected no uncaught page errors on /solutions/${slug}, got: ${pageErrors
          .map((e) => e.message)
          .join("; ")}`,
      ).toEqual([]);
    });
  }

  test("'All capabilities' footer link navigates back to /solutions", async ({
    page,
  }) => {
    // Start on a detail page so the footer link's navigation is meaningful.
    await page.goto("/solutions/debt-analysis");

    const footerLink = page
      .locator("footer")
      .getByRole("link", { name: /All capabilities/i });
    await expect(footerLink).toBeVisible();
    await footerLink.click();

    await expect(page).toHaveURL(/\/solutions$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Everything SchoolStack Budget can do/i,
      }),
    ).toBeVisible();
  });
});
