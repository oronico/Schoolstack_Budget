import { test, expect, type Page } from "./utils/test";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, eventsTable } from "@workspace/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";

// Task #429 — end-to-end coverage for the "Looks dead" low-engagement
// badge added to the admin Coaching tab in Task #410.
//
// This is a real integration spec: it seeds raw *_shown / *_engaged
// rows directly into `events` for two coach surfaces, hits the live
// /api/admin/coaching-funnel route, and asserts the rendered Coaching
// tab. That means a regression in any of:
//   * the LOW_ENGAGEMENT_MIN_IMPRESSIONS / LOW_ENGAGEMENT_MAX_RATE
//     constants in artifacts/api-server/src/routes/admin.ts
//   * the COACHING_FUNNEL_SURFACES sourcePath wiring
//   * the server-side rate / lowEngagement classification in
//     /admin/coaching-funnel
//   * the sortCoachingSurfaces order or the LowEngagementBadge tooltip
//     wiring on the client
// will trip this test.
//
// Three behaviors under test:
//   1. A surface with >100 impressions and <5% engagement renders the
//      `low-engagement-badge-<key>` testid plus the
//      `data-low-engagement="true"` attribute on its container.
//   2. The flagged surface sorts above another (healthier) surface
//      that has 5x the impression count — proving sortCoachingSurfaces
//      puts low-engagement rows first regardless of impression order.
//   3. The tooltip body quotes the exact 5% / 100 thresholds and
//      surfaces the `sourcePath` of the file emitting *_shown.
//
// Admin gate: ADMIN_EMAILS is configured in `.replit` to allow exactly
// `aserafin@gmail.com`. We upsert that user directly through @workspace/db
// (so the spec doesn't need to know a password) and sign a JWT for them
// using the same JWT_SECRET the api-server reads — both are available
// in this process because the e2e workflow inherits the workspace env.
//
// The two surface keys the spec touches are scrubbed from `events`
// (within the rolling 30-day window the route reads) before we seed,
// so prior dev-DB events for those names can't pollute the assertion.
// We deliberately do NOT touch any other surfaces' events.

const ADMIN_EMAIL = "aserafin@gmail.com";

// Two surfaces from COACHING_FUNNEL_SURFACES in the api-server route:
//   - LOW must be one whose impressions, after seeding, sit above 100
//     while engagement stays under 5% so the route flags it.
//   - HEALTHY must out-impress LOW so the sort assertion is meaningful
//     (sortCoachingSurfaces falls back to shown-desc within each
//     low-engagement bucket — without that, "low first" could be
//     accidentally satisfied by raw impression order).
const LOW_KEY = "impact_kpi_nudge";
const LOW_LABEL = "Impact summary KPI nudge";
const LOW_SHOWN_EVENT = "impact_kpi_nudge_shown";
const LOW_ENGAGED_EVENT = "impact_kpi_nudge_engaged";
// Source path mirrored from COACHING_FUNNEL_SURFACES on the server. If
// the server-side path moves, the tooltip assertion below will fail
// loudly — which is the point.
const LOW_SOURCE_PATH =
  "artifacts/school-financial-model/src/components/decision-flow/ImpactSummary.tsx";

const HEALTHY_KEY = "dashboard_launcher_coach";
const HEALTHY_SHOWN_EVENT = "dashboard_launcher_coach_shown";
const HEALTHY_ENGAGED_EVENT = "dashboard_launcher_coach_engaged";

// Seed quantities. LOW: 200 shown / 4 engaged → 2.0% (under the 5%
// floor, above the 100 floor). HEALTHY: 1000 shown / 400 engaged →
// 40% (well above the 5% floor) and 5x LOW's impression count so the
// "low-engagement first" sort is non-trivial.
const LOW_SHOWN_COUNT = 200;
const LOW_ENGAGED_COUNT = 4;
const HEALTHY_SHOWN_COUNT = 1000;
const HEALTHY_ENGAGED_COUNT = 400;

const TOUCHED_EVENT_NAMES = [
  LOW_SHOWN_EVENT,
  LOW_ENGAGED_EVENT,
  HEALTHY_SHOWN_EVENT,
  HEALTHY_ENGAGED_EVENT,
];

async function upsertAdminUser(): Promise<{ id: number; tokenVersion: number }> {
  const [existing] = await db
    .select({ id: usersTable.id, tokenVersion: usersTable.tokenVersion })
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL))
    .limit(1);
  if (existing) {
    return existing;
  }
  // Bcrypt hash for an arbitrary unguessable password — we never
  // actually log in via /auth/login, we sign the JWT ourselves below.
  // Generated with `bcryptjs.hash("e2e-admin-placeholder", 10)`.
  const placeholderHash =
    "$2b$10$LNDDkaIyOjCXtHpL2.9I3.eJYrXmBVSkM6lbU.1rCY4BiTgM7qgIa";
  const [inserted] = await db
    .insert(usersTable)
    .values({
      email: ADMIN_EMAIL,
      name: "Playwright Admin",
      passwordHash: placeholderHash,
    })
    .returning({ id: usersTable.id, tokenVersion: usersTable.tokenVersion });
  return inserted;
}

function signToken(userId: number, tokenVersion: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET must be set in the e2e environment so the spec can sign a token the api-server's authMiddleware accepts.",
    );
  }
  return jwt.sign({ userId, tokenVersion }, secret, { expiresIn: "7d" });
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// Wipe events for the two surfaces this spec seeds, scoped to the
// 30-day window the /admin/coaching-funnel route reads. Older events
// are left alone (they don't affect the route's aggregation) and so
// are events for the other 7 surfaces we never touch.
async function clearTouchedEventsInWindow(): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db
    .delete(eventsTable)
    .where(
      and(
        inArray(eventsTable.eventName, TOUCHED_EVENT_NAMES),
        gte(eventsTable.createdAt, since),
      ),
    );
}

async function seedEvents(adminUserId: number): Promise<void> {
  // Stamp every row inside the current 30-day window. Spread the
  // createdAt timestamps over the last week so the rows visibly look
  // like real founder activity rather than one giant batch insert.
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  function stamp(i: number, n: number): Date {
    return new Date(now - Math.floor((SEVEN_DAYS_MS * i) / Math.max(n, 1)));
  }
  const rows: Array<{
    userId: number;
    eventName: string;
    createdAt: Date;
  }> = [];
  for (let i = 0; i < LOW_SHOWN_COUNT; i++) {
    rows.push({
      userId: adminUserId,
      eventName: LOW_SHOWN_EVENT,
      createdAt: stamp(i, LOW_SHOWN_COUNT),
    });
  }
  for (let i = 0; i < LOW_ENGAGED_COUNT; i++) {
    rows.push({
      userId: adminUserId,
      eventName: LOW_ENGAGED_EVENT,
      createdAt: stamp(i, LOW_ENGAGED_COUNT),
    });
  }
  for (let i = 0; i < HEALTHY_SHOWN_COUNT; i++) {
    rows.push({
      userId: adminUserId,
      eventName: HEALTHY_SHOWN_EVENT,
      createdAt: stamp(i, HEALTHY_SHOWN_COUNT),
    });
  }
  for (let i = 0; i < HEALTHY_ENGAGED_COUNT; i++) {
    rows.push({
      userId: adminUserId,
      eventName: HEALTHY_ENGAGED_EVENT,
      createdAt: stamp(i, HEALTHY_ENGAGED_COUNT),
    });
  }
  // Drizzle/pg's parameter ceiling is well above what a single insert
  // of ~1600 small rows needs, but chunk anyway to stay polite.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(eventsTable).values(rows.slice(i, i + CHUNK));
  }
}

test("admin Coaching tab flags low-engagement surfaces, sorts them first, and tooltip quotes the threshold + source path", async ({
  page,
  request,
}) => {
  // 1. Make sure the admin user exists in the DB.
  const admin = await upsertAdminUser();

  // 2. Wipe + seed events so the route's aggregation is deterministic.
  await clearTouchedEventsInWindow();
  await seedEvents(admin.id);

  // 3. Sanity-check the live route classifies LOW as low-engagement
  //    BEFORE we drive the UI. If this fails, the UI assertions
  //    would be a red herring — fail fast with a clear message.
  const token = signToken(admin.id, admin.tokenVersion);
  const apiRes = await request.get("/api/admin/coaching-funnel", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(
    apiRes.ok(),
    `coaching-funnel pre-check failed: ${apiRes.status()} ${await apiRes.text()}`,
  ).toBeTruthy();
  const apiBody = (await apiRes.json()) as {
    lowEngagementThreshold: { minImpressions: number; maxEngagementRate: number };
    surfaces: Array<{
      key: string;
      shown: number;
      engaged: number;
      lowEngagement: boolean;
      sourcePath: string;
    }>;
  };
  expect(apiBody.lowEngagementThreshold.minImpressions).toBe(100);
  expect(apiBody.lowEngagementThreshold.maxEngagementRate).toBe(0.05);
  const lowFromApi = apiBody.surfaces.find((s) => s.key === LOW_KEY);
  const healthyFromApi = apiBody.surfaces.find((s) => s.key === HEALTHY_KEY);
  expect(lowFromApi, `expected ${LOW_KEY} in funnel response`).toBeTruthy();
  expect(healthyFromApi, `expected ${HEALTHY_KEY} in funnel response`).toBeTruthy();
  expect(lowFromApi!.shown).toBe(LOW_SHOWN_COUNT);
  expect(lowFromApi!.engaged).toBe(LOW_ENGAGED_COUNT);
  expect(lowFromApi!.lowEngagement).toBe(true);
  expect(lowFromApi!.sourcePath).toBe(LOW_SOURCE_PATH);
  expect(healthyFromApi!.lowEngagement).toBe(false);

  // 4. Drive the UI with the same token.
  await primeAuthToken(page, token);
  await page.goto("/admin");

  // Switch to the Coaching tab — CoachingFunnelSection only mounts here.
  await page.getByRole("button", { name: "Coaching" }).click();

  // --- Badge: testid renders + container is flagged ---
  const lowSurface = page.getByTestId(`coaching-surface-${LOW_KEY}`);
  await expect(lowSurface).toBeVisible();
  await expect(lowSurface).toHaveAttribute("data-low-engagement", "true");
  const badge = page.getByTestId(`low-engagement-badge-${LOW_KEY}`);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/Looks dead/);

  // The healthy surface must NOT carry the badge.
  const healthySurface = page.getByTestId(`coaching-surface-${HEALTHY_KEY}`);
  await expect(healthySurface).toBeVisible();
  await expect(healthySurface).toHaveAttribute("data-low-engagement", "false");
  await expect(
    page.getByTestId(`low-engagement-badge-${HEALTHY_KEY}`),
  ).toHaveCount(0);

  // --- Sort: low-engagement surface renders above the higher-impression healthy one ---
  // Compare DOM order across all rendered coaching-surface rows. The
  // healthy row has 5x LOW's impressions, so without the
  // low-engagement-first rule it would render above LOW.
  const surfaceTestIds = await page
    .locator("[data-testid^='coaching-surface-']")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-testid") || ""),
    );
  const lowIdx = surfaceTestIds.indexOf(`coaching-surface-${LOW_KEY}`);
  const healthyIdx = surfaceTestIds.indexOf(`coaching-surface-${HEALTHY_KEY}`);
  expect(lowIdx).toBeGreaterThanOrEqual(0);
  expect(healthyIdx).toBeGreaterThanOrEqual(0);
  expect(
    lowIdx,
    `low-engagement surface (idx=${lowIdx}) must render above healthy surface (idx=${healthyIdx}); order=${surfaceTestIds.join(",")}`,
  ).toBeLessThan(healthyIdx);

  // --- Tooltip: focus the badge and assert body quotes 5% / 100 + source path ---
  // Radix Tooltip mounts the visible TooltipContent into a portal at
  // the document root with role="tooltip". It also mounts a
  // screen-reader-only duplicate referenced via aria-describedby on
  // the trigger, so unscoped getByTestId calls hit two nodes — scope
  // every lookup to the role="tooltip" container.
  await badge.focus();
  const tooltipBody = page.getByRole("tooltip");
  await expect(tooltipBody).toBeVisible();

  const sourceLink = tooltipBody.getByTestId(`low-engagement-source-${LOW_KEY}`);
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveText(LOW_SOURCE_PATH);
  const href = await sourceLink.getAttribute("href");
  expect(href ?? "").toContain(LOW_SOURCE_PATH);

  // Snapshot the tooltip text in one shot. Asserting each fragment via
  // a separate `await expect(tooltipBody).toContainText(...)` re-runs
  // the locator on every check, and Radix Tooltip can auto-close
  // between checks if focus drifts (the body has been observed to
  // disappear between assertions when the spec runs slowly), making
  // the run flaky. One textContent read avoids that race.
  const tooltipText = (await tooltipBody.textContent()) ?? "";
  expect(tooltipText).toContain("5%");
  expect(tooltipText).toContain("100");
  expect(tooltipText).toContain(LOW_SOURCE_PATH);
  // Human framing — not just numbers; the badge must announce that
  // this is the low-engagement floor.
  expect(tooltipText).toMatch(/Low engagement/i);

  // --- Cleanup so we don't leave 1600+ synthetic rows in the dev DB ---
  // Best-effort; not awaited inside an afterEach because the spec body
  // owns the seeding lifecycle.
  await clearTouchedEventsInWindow();
});

test.afterAll(async () => {
  // Defense in depth: if the test bails out mid-body before its inline
  // cleanup runs, scrub any leftover seeded events for the touched
  // surfaces inside the rolling window.
  try {
    await clearTouchedEventsInWindow();
  } catch {
    // The dev DB may have already been torn down by a parent runner;
    // swallow so a cleanup error doesn't mask the real test failure.
  }
});

