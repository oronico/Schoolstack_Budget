import { test, expect, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #497 — Capability Page Section Engagement: Trend column.
//
// Task #421 added a "Trend" column with two stacked sparklines (impressions
// + clicks) per (capability, section) row to the admin dashboard, and the
// rendering branches on `data.bucketUnit`:
//   - bucketUnit = "day" | "week"  → MiniSparkline SVGs
//   - bucketUnit = null            → text dash fallback
// That fallback is the entire reason the column header switches between
// "Trend (daily)" / "Trend (weekly)" / "Trend (-)" — a regression that
// rendered an empty/zero sparkline for the "All time" case (where the
// route returns trend: []) would silently produce a flat horizontal line
// instead of the dash, and there's no unit coverage that catches that.
//
// We intercept /api/admin/cta-conversion and /api/admin/analytics with
// `page.route()` so the test doesn't depend on ADMIN_EMAILS being
// configured for our synthetic user — and so we can pin the trend data
// to exactly the shape the UI must handle. The contract under test is
// purely the UI: bucketUnit drives sparkline-vs-dash, and the per-row
// data-testid "section-engagement-trend-<source>-<section>" hook stays
// addressable for both branches.

const TEST_PASSWORD = "PlaywrightTest12345!";

const PAGE_SOURCE = "single-year-pro-forma";

// Minimal /api/admin/analytics response — the AdminPage only crashes if
// the response is missing required keys, so we hand it an empty-ish but
// well-formed AnalyticsData so the page renders the analytics tab.
const MOCK_ANALYTICS = {
  totalUsers: 0,
  totalModels: 0,
  totalExports: 0,
  recentSignups: [],
  recentExports: [],
  schoolTypeDistribution: [],
  schoolStageDistribution: [],
  fundingProfileDistribution: [],
  topRevenueLines: [],
  topExpenseCategories: [],
  exportRateByType: [],
  year5Adoption: { totalRowModels: 0, extendedTo5: 0, rate: 0 },
  funnel: {
    signedUp: 0,
    createdModel: 0,
    reachedReview: 0,
    exported: 0,
  },
};

function buildSectionEngagement(
  bucketUnit: "day" | "week" | null,
  bucketCount: number,
) {
  // For windowed ranges, hand back impression and click trends with
  // length === bucketCount and recognizable non-zero values so the
  // sparkline path is visibly drawn (and tomorrow we can sanity-check
  // the SVG path is non-empty). For range=all the route returns []
  // arrays — we mimic that here so the UI takes the dash branch.
  const impressionsTrend =
    bucketCount > 0
      ? Array.from({ length: bucketCount }, (_, i) => (i % 3) + 1)
      : [];
  const clicksTrend =
    bucketCount > 0
      ? Array.from({ length: bucketCount }, (_, i) => (i % 2) + 0)
      : [];
  const totalImp = impressionsTrend.reduce((a, b) => a + b, 0);
  const totalClk = clicksTrend.reduce((a, b) => a + b, 0);

  return [
    {
      source: PAGE_SOURCE,
      sections: [
        {
          section: "hero",
          impressions: Math.max(totalImp, 12),
          clicks: Math.max(totalClk, 4),
          signups: 1,
          clickRate: 0.25,
          impressionsTrend,
          clicksTrend,
        },
        {
          section: "inside_product",
          impressions: Math.max(totalImp, 8),
          clicks: Math.max(totalClk, 3),
          signups: 0,
          clickRate: 0.18,
          impressionsTrend,
          clicksTrend,
        },
      ],
      scrollDepth: { d25: 5, d50: 4, d75: 3, d100: 2 },
    },
  ];
}

function buildCtaResponse(range: "7d" | "30d" | "90d" | "all") {
  const bucketUnit: "day" | "week" | null =
    range === "all" ? null : range === "90d" ? "week" : "day";
  const bucketCount =
    range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 13 : 0;
  return {
    range,
    bucketUnit,
    bucketCount,
    rangeStart: range === "all" ? null : "2026-04-28T00:00:00.000Z",
    rangeEnd: range === "all" ? null : "2026-05-05T00:00:00.000Z",
    capability: { summary: [], byPosition: [] },
    audience: { summary: [] },
    crossLinks: [],
    sectionEngagement: buildSectionEngagement(bucketUnit, bucketCount),
  };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("admin section engagement trend column renders sparklines for windowed ranges and dash for All time", async ({
  page,
  request,
}) => {
  // Register a vanilla user — we don't need real admin access because
  // we're stubbing every /api/admin/* response below.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-trend-${stamp}@e2e.schoolstack.test`;
  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Trend",
  });
  await primeAuthToken(page, token);

  // Track which range the UI is currently asking for so the cta route
  // handler returns a matching response. The CtaConversionSection
  // component re-fetches whenever the range button is clicked.
  let lastRangeServed: "7d" | "30d" | "90d" | "all" = "30d";

  await page.route("**/api/admin/analytics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ANALYTICS),
    });
  });

  await page.route("**/api/admin/cta-conversion**", async (route) => {
    const url = new URL(route.request().url());
    const r = (url.searchParams.get("range") || "30d") as
      | "7d"
      | "30d"
      | "90d"
      | "all";
    lastRangeServed = r;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildCtaResponse(r)),
    });
  });

  // Stub every other /api/admin/* read so a stray fetch on tab change
  // can't 403 us into the AccessDenied screen. The shapes are minimal
  // — these endpoints' components only render when their tab is
  // active, so an empty/200 is enough to keep the page mounted.
  await page.route("**/api/admin/feedback**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
    });
  });
  await page.route("**/api/admin/errors", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/admin/reviews", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/admin/coach-downgrade-precursors", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ surfaces: [] }),
    });
  });
  await page.route("**/api/admin/coaching-funnel", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surfaces: [],
        lowEngagementThreshold: { minImpressions: 0, maxEngagementRate: 0 },
      }),
    });
  });

  await page.goto("/admin");

  // Section engagement card and our stubbed source row must surface.
  // We don't gate on the CTA capability table because the stub returns
  // empty summary — the section engagement card is the real subject.
  const card = page.getByTestId("capability-section-engagement-card");
  await expect(card).toBeVisible();

  const sourceBlock = page.getByTestId(`section-engagement-${PAGE_SOURCE}`);
  await expect(sourceBlock).toBeVisible();

  // --- 30d (default) ----------------------------------------------------
  // The component defaults to range=30d so the very first render uses
  // bucketUnit="day" and we should see the sparkline branch. We assert
  // both sections render an SVG inside the trend cell — the dash
  // fallback would render a <span>-</span> and contain no <svg> at all.
  const heroTrendCell = page.getByTestId(
    `section-engagement-trend-${PAGE_SOURCE}-hero`,
  );
  const insideTrendCell = page.getByTestId(
    `section-engagement-trend-${PAGE_SOURCE}-inside_product`,
  );
  await expect(heroTrendCell).toBeVisible();
  await expect(insideTrendCell).toBeVisible();

  // Two stacked MiniSparklines (impressions + clicks) per row when
  // bucketUnit is set. Anchor on the SVG nodes inside the trend cell —
  // the Trend column is the only one in this card that can contain an
  // <svg>, so this locator is unambiguous.
  await expect(heroTrendCell.locator("svg")).toHaveCount(2);
  await expect(insideTrendCell.locator("svg")).toHaveCount(2);

  // The path data must include drawn segments (M…L…) — a regression that
  // returned an empty values array would render the dash, not an SVG
  // with no <path>.
  const heroFirstPathD = await heroTrendCell
    .locator("svg path")
    .first()
    .getAttribute("d");
  expect(heroFirstPathD ?? "").toMatch(/M\s*[\d.]+/);
  expect(heroFirstPathD ?? "").toMatch(/L\s*[\d.]+/);

  // --- Flatline guard (Task #570) --------------------------------------
  // The previous SVG-presence + path-data assertions still pass when every
  // bucket value is zero: MiniSparkline divides by `range = max(values, 1)`
  // so a [0,0,0,…] series renders a path whose y-coordinate is the chart
  // height for every point — visually a flat line glued to the bottom
  // edge, structurally still a non-empty `M … L …` path. Walk the path's
  // y-values directly and require at least two distinct values, which is
  // the smallest possible signal that the sparkline actually rises or
  // falls. Do this for both the impressions (first <path>) and clicks
  // (second <path>) sparkline in each row.
  async function uniqueYCount(pathD: string | null): Promise<number> {
    if (!pathD) return 0;
    // Path commands are emitted as "M x y" / "L x y" with single-space
    // separators (see MiniSparkline in src/pages/admin.tsx).
    const ys = new Set<string>();
    const re = /[ML]\s+[\d.]+\s+([\d.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(pathD)) !== null) {
      ys.add(match[1]);
    }
    return ys.size;
  }
  for (const cell of [heroTrendCell, insideTrendCell]) {
    const paths = cell.locator("svg path");
    await expect(paths).toHaveCount(2);
    const impressionsD = await paths.nth(0).getAttribute("d");
    const clicksD = await paths.nth(1).getAttribute("d");
    expect(
      await uniqueYCount(impressionsD),
      `expected impressions sparkline to have multiple distinct y-values, got d=${impressionsD}`,
    ).toBeGreaterThan(1);
    expect(
      await uniqueYCount(clicksD),
      `expected clicks sparkline to have multiple distinct y-values, got d=${clicksD}`,
    ).toBeGreaterThan(1);
  }

  // Pixel-level baseline for the trend cell on the 30d range. We snapshot
  // the trend cell itself (not the whole card) so the sparkline area
  // dominates the diff: a flatlined sparkline changes ~30%+ of the cell's
  // pixels, well above `maxDiffPixelRatio` in playwright.config.ts, while
  // unrelated table churn elsewhere in the card cannot mask the failure.
  // Screenshot file lives next to the spec under
  // `admin-section-engagement-trend.spec.ts-snapshots/`.
  await expect(heroTrendCell).toHaveScreenshot(
    "section-engagement-trend-hero-30d.png",
  );

  // --- 7d (also windowed) ----------------------------------------------
  // Switching ranges re-fetches /api/admin/cta-conversion?range=7d, and
  // the stub returns bucketUnit="day". The sparkline branch must hold.
  await page.getByTestId("cta-range-7d").click();
  await expect.poll(() => lastRangeServed).toBe("7d");
  await expect(heroTrendCell.locator("svg")).toHaveCount(2);
  await expect(insideTrendCell.locator("svg")).toHaveCount(2);

  // --- All time (the dash fallback branch) -----------------------------
  // bucketUnit=null → the trend cell drops the MiniSparkline entirely and
  // renders a single text dash. No <svg> may be inside the trend cell;
  // the visible text inside the cell must be exactly "-".
  await page.getByTestId("cta-range-all").click();
  await expect.poll(() => lastRangeServed).toBe("all");

  await expect(heroTrendCell.locator("svg")).toHaveCount(0);
  await expect(insideTrendCell.locator("svg")).toHaveCount(0);
  await expect(heroTrendCell).toHaveText("-");
  await expect(insideTrendCell).toHaveText("-");

  // The card itself must remain rendered (the "All time" branch must
  // not collapse the section). We re-assert visibility so a future
  // regression that hides the entire card on bucketUnit=null fails
  // here with a clear "card not visible" message.
  await expect(card).toBeVisible();

  // --- Back to a windowed range to prove the sparkline returns ---------
  // Round-trip back to 30d to make sure switching out of "All time"
  // restores the SVG branch — protects against a stale-state bug where
  // the fallback would stick after the first dash render.
  await page.getByTestId("cta-range-30d").click();
  await expect.poll(() => lastRangeServed).toBe("30d");
  await expect(heroTrendCell.locator("svg")).toHaveCount(2);
  await expect(insideTrendCell.locator("svg")).toHaveCount(2);
});
