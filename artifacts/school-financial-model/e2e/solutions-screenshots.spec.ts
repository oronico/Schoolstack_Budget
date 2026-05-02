import { test, expect } from "@playwright/test";

// Task #314: the 5 /solutions/:slug capability pages embed real product
// screenshots from /images/solutions/*.png. There is no automated check
// that those files exist or that the marketing pages render them without
// 404s — if someone renames or deletes a screenshot, the pages will
// silently show broken images.
//
// This spec hits each /solutions/:slug URL and, for every <img> under the
// "A look at what you'll work with." section, asserts:
//   1. The expected number of screenshots is rendered (so the inline
//      <ScreenshotImage> fallback swap does not silently mask a 404).
//   2. The image actually loaded pixels (naturalWidth > 0).
//   3. No /images/solutions/* network response returned a >=400 status.
//
// Any of those failing means a screenshot file is missing, renamed, or
// otherwise broken — exactly the regression this test exists to catch.

const SOLUTION_SLUGS = [
  "single-year-pro-forma",
  "five-year-pro-forma",
  "scenario-planning",
  "debt-analysis",
  "budgeting-accounting-guidance",
] as const;

// Each capability page renders exactly two <ScreenshotFrame /> entries
// inside the "A look at what you'll work with." section (see
// SingleYearScreenshots, FiveYearScreenshots, ScenarioScreenshots,
// DebtScreenshots, GuidanceScreenshots in InsideTheProductVisuals.tsx).
const EXPECTED_IMGS_PER_PAGE = 2;

test.describe("Solutions detail screenshots", () => {
  for (const slug of SOLUTION_SLUGS) {
    test(`/solutions/${slug} renders every embedded screenshot without a broken image`, async ({
      page,
    }) => {
      // Track every /images/solutions/* response so a 404 fails the test
      // even if (in some hypothetical future refactor) the rendered <img>
      // still ends up with naturalWidth > 0 from a placeholder.
      const failedScreenshotResponses: string[] = [];
      page.on("response", (resp) => {
        const url = resp.url();
        if (url.includes("/images/solutions/") && resp.status() >= 400) {
          failedScreenshotResponses.push(`${resp.status()} ${url}`);
        }
      });

      await page.goto(`/solutions/${slug}`);

      // Scope to the "A look at what you'll work with." <section> so we
      // only look at embedded product screenshots, not the navbar logo,
      // hero artwork, or any other imagery elsewhere on the page.
      const section = page.locator("section", {
        has: page.getByRole("heading", {
          level: 2,
          name: /A look at what you'll work with/i,
        }),
      });
      await expect(section).toBeVisible();

      const imgs = section.locator("img");

      // ScreenshotImage swaps the <img> for a fallback <div> on error, so
      // a missing PNG would also drop this count below the expected
      // value. That makes the count check itself a meaningful regression
      // signal in addition to the naturalWidth assertion below.
      await expect(
        imgs,
        `expected ${EXPECTED_IMGS_PER_PAGE} embedded screenshots in "A look at what you'll work with." on /solutions/${slug}`,
      ).toHaveCount(EXPECTED_IMGS_PER_PAGE);

      const count = await imgs.count();
      for (let i = 0; i < count; i++) {
        const img = imgs.nth(i);
        // Lazy-loaded screenshots may not start fetching until they are
        // close to the viewport; scroll each one into view before waiting
        // on it so the test does not time out for an off-screen image.
        await img.scrollIntoViewIfNeeded();

        await expect
          .poll(
            async () =>
              img.evaluate((el: HTMLImageElement) => el.complete),
            { timeout: 10_000 },
          )
          .toBe(true);

        const { naturalWidth, src, alt } = await img.evaluate(
          (el: HTMLImageElement) => ({
            naturalWidth: el.naturalWidth,
            src: el.src,
            alt: el.alt,
          }),
        );
        expect(
          naturalWidth,
          `expected screenshot to have naturalWidth > 0 (slug=${slug}, src=${src}, alt=${alt})`,
        ).toBeGreaterThan(0);
      }

      expect(
        failedScreenshotResponses,
        `expected no failed /images/solutions/* responses on /solutions/${slug}, got: ${failedScreenshotResponses.join(", ")}`,
      ).toEqual([]);
    });
  }
});
