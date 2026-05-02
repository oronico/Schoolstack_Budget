import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Verifies the saved-scenario "Compare decisions side-by-side" surface
// renders end-to-end: with two decision scenarios persisted, the section
// auto-fills both pickers, computes the comparison columns, and surfaces
// the binary-only Download-as-PDF action. Adding a third column should
// hide the PDF action; removing it should bring it back. Component tests
// cover the impact engine; only a real browser proves the picker → engine
// → ImpactSummary handoff plus the column-count gating.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_A_NAME = "E2E candidate site A";
const SCENARIO_A_CREATED_AT = "2026-03-06T09:00:00.000Z";
const SCENARIO_B_NAME = "E2E candidate site B";
const SCENARIO_B_CREATED_AT = "2026-03-06T10:00:00.000Z";
const SCENARIO_C_NAME = "E2E enrollment bump";
const SCENARIO_C_CREATED_AT = "2026-03-06T11:00:00.000Z";

interface SeededFixture {
  token: string;
  modelId: number;
  email: string;
}

async function seedScenarioFixture(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: {
      email,
      password: TEST_PASSWORD,
      name: "Playwright Founder",
    },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Compare Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Compare Academy",
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

  // Seed three decision scenarios so we can exercise the 2-col → 3-col
  // → 2-col gating on the Download-as-PDF affordance. Scenarios A and B
  // are different lease offers; C is an enrollment bump so the picker
  // labels show distinct decision-type prefixes.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: authHeaders,
    data: {
      name: "E2E Compare Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Compare Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        customScenarios: [
          {
            name: SCENARIO_A_NAME,
            createdAt: SCENARIO_A_CREATED_AT,
            overrides: { monthlyRent: 11000 },
            decisionType: "evaluate_site",
          },
          {
            name: SCENARIO_B_NAME,
            createdAt: SCENARIO_B_CREATED_AT,
            overrides: { monthlyRent: 13500 },
            decisionType: "evaluate_site",
          },
          {
            name: SCENARIO_C_NAME,
            createdAt: SCENARIO_C_CREATED_AT,
            overrides: { enrollmentDelta: [10, 5, 0, 0, 0] },
            decisionType: "change_enrollment",
          },
        ],
      },
    },
  });
  expect(
    updateRes.ok(),
    `update model failed: ${updateRes.status()} ${await updateRes.text()}`,
  ).toBeTruthy();

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// Stub navigator.clipboard.writeText so the share-link test works in
// headless Chromium without granting OS-level clipboard permissions, and
// so we can read back exactly what the share button tried to copy.
async function captureClipboardWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const captured: string[] = [];
    (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = captured;
    const stub = {
      writeText: async (value: string) => {
        captured.push(value);
      },
      readText: async () => captured[captured.length - 1] ?? "",
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: stub,
        configurable: true,
      });
    } catch {
      (navigator as unknown as { clipboard: typeof stub }).clipboard = stub;
    }
  });
}

test("Side-by-side decision comparison auto-fills, gates the PDF button on 2 columns, and switches columns on user pick", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();

  // The component auto-seeds the first two decision scenarios into the
  // pickers when the user hasn't picked anything yet (the persisted
  // customScenarios list order is the input order). Asserting on the
  // selected option text is more durable than asserting on the composite
  // `${name}|${createdAt}` key, which is an internal contract.
  const pickerA = section.getByTestId("decision-compare-select-0");
  const pickerB = section.getByTestId("decision-compare-select-1");
  await expect(pickerA).toBeVisible();
  await expect(pickerB).toBeVisible();
  await expect(pickerA).toContainText(SCENARIO_A_NAME);
  await expect(pickerB).toContainText(SCENARIO_B_NAME);

  // The result block + Download-as-PDF button should both be live for the
  // binary case. The PDF button only renders when `columns.length === 2`,
  // so its visibility is the contract under test here.
  const result = section.getByTestId("decision-compare-result");
  await expect(result).toBeVisible();
  await expect(section.getByTestId("decision-compare-same-warning")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-error")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();

  // The ImpactSummary renders its multi-column comparison view (not the
  // single-scenario view) when `columns` has 2+ entries — assert on the
  // comparison-mode wrapper so we know the engine produced columns.
  await expect(page.getByTestId("decision-impact-comparison")).toBeVisible();

  // Add a third column — switches ImpactSummary to a 3-up grid and the
  // Download-as-PDF button should disappear because the backend PDF
  // generator is scoped to a binary A vs B comparison.
  await section.getByTestId("decision-compare-add").click();
  const pickerC = section.getByTestId("decision-compare-select-2");
  await expect(pickerC).toBeVisible();
  await expect(pickerC).toContainText(SCENARIO_C_NAME);
  await expect(section.getByTestId("decision-compare-download-pdf")).toHaveCount(0);

  // Removing the third column drops back to the binary case so the PDF
  // button must reappear — guards against a regression where the gating
  // condition flips inclusive/exclusive.
  await section.getByTestId("decision-compare-remove-2").click();
  await expect(section.getByTestId("decision-compare-select-2")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();

  // Switching picker B to scenario C (the enrollment bump) recomputes the
  // comparison columns from a different override family — proves the
  // engine re-runs on user interaction, not just on the auto-seeded keys.
  // The picker exposes a composite `${name}|${createdAt}` value; rather
  // than reconstruct it we discover it from the option's text label.
  const pickerBOptions = await pickerB.locator("option").all();
  let scenarioCValue = "";
  for (const opt of pickerBOptions) {
    const label = (await opt.textContent()) ?? "";
    if (label.includes(SCENARIO_C_NAME)) {
      scenarioCValue = (await opt.getAttribute("value")) ?? "";
      break;
    }
  }
  expect(scenarioCValue, "scenario C should appear in the picker").toBeTruthy();
  await pickerB.selectOption(scenarioCValue);
  await expect(pickerB).toContainText(SCENARIO_C_NAME);
  await expect(section.getByTestId("decision-compare-result")).toBeVisible();
  // Still 2 columns and no duplicates, so the PDF action stays available.
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();
});

// Verifies the decision-comparison picker selection survives a page
// refresh — Task #199. The founder picks a 3-column lineup (A + C + B in
// that order), reloads, and we expect the same lineup to come back rather
// than the default first-two-saved auto-seed.
test("Decision comparison picker persists the lineup across reloads", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);
  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();

  const pickerA = section.getByTestId("decision-compare-select-0");
  const pickerB = section.getByTestId("decision-compare-select-1");
  await expect(pickerA).toContainText(SCENARIO_A_NAME);
  await expect(pickerB).toContainText(SCENARIO_B_NAME);

  // Resolve the composite key for scenario C off the picker option list so
  // the test doesn't have to reconstruct the `${name}|${createdAt}` shape.
  const optionValueByName = async (
    locator: ReturnType<typeof section.getByTestId>,
    name: string,
  ): Promise<string> => {
    const opts = await locator.locator("option").all();
    for (const opt of opts) {
      const label = (await opt.textContent()) ?? "";
      if (label.includes(name)) {
        return (await opt.getAttribute("value")) ?? "";
      }
    }
    return "";
  };
  const scenarioCValue = await optionValueByName(pickerB, SCENARIO_C_NAME);
  expect(scenarioCValue, "scenario C should appear in the picker").toBeTruthy();

  // Swap picker B to C, then add a third column and select B. Resulting
  // lineup is [A, C, B] — distinct from the natural [A, B, C] auto-seed
  // order so a reload that just re-runs the auto-seed would visibly fail.
  await pickerB.selectOption(scenarioCValue);
  await expect(pickerB).toContainText(SCENARIO_C_NAME);

  await section.getByTestId("decision-compare-add").click();
  const pickerC = section.getByTestId("decision-compare-select-2");
  await expect(pickerC).toBeVisible();
  const scenarioBValue = await optionValueByName(pickerC, SCENARIO_B_NAME);
  expect(scenarioBValue, "scenario B should appear in the third picker").toBeTruthy();
  await pickerC.selectOption(scenarioBValue);
  await expect(pickerC).toContainText(SCENARIO_B_NAME);

  // Wait for the debounced persist to land. The model PUT runs ~800ms
  // after the last picker change; poll the model JSON until the persisted
  // selection matches what we just picked so the reload reads the new
  // value, not a stale cache.
  const expectedSelectionLength = 3;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/models/${modelId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok()) return -1;
        const body = (await res.json()) as { data?: { decisionComparisonSelection?: string[] } };
        return body.data?.decisionComparisonSelection?.length ?? 0;
      },
      { timeout: 5000, intervals: [200, 400, 800] },
    )
    .toBe(expectedSelectionLength);

  // Reload — without persistence, the picker would snap back to [A, B] and
  // drop the third column. With persistence, the [A, C, B] lineup we set
  // before the reload should restore exactly.
  await page.reload();
  const reloadedSection = page.getByTestId("decision-comparison-section");
  await expect(reloadedSection).toBeVisible();
  await expect(reloadedSection.getByTestId("decision-compare-select-0")).toContainText(SCENARIO_A_NAME);
  await expect(reloadedSection.getByTestId("decision-compare-select-1")).toContainText(SCENARIO_C_NAME);
  await expect(reloadedSection.getByTestId("decision-compare-select-2")).toContainText(SCENARIO_B_NAME);
});

test("Share link round-trip: copying writes a #compare URL that re-selects the same decisions", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);
  await captureClipboardWrites(page);

  await page.goto(`/model/${modelId}/scenarios`);

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();

  // Build a non-default selection (A + C) so the share URL has to encode
  // distinct keys rather than echoing the auto-seeded first-two ordering.
  const pickerB = section.getByTestId("decision-compare-select-1");
  const pickerBOptions = await pickerB.locator("option").all();
  let scenarioCValue = "";
  for (const opt of pickerBOptions) {
    const label = (await opt.textContent()) ?? "";
    if (label.includes(SCENARIO_C_NAME)) {
      scenarioCValue = (await opt.getAttribute("value")) ?? "";
      break;
    }
  }
  expect(scenarioCValue, "scenario C should appear in the picker").toBeTruthy();
  await pickerB.selectOption(scenarioCValue);

  // The share button only renders inside the result block (which itself
  // requires 2+ valid columns and no duplicates).
  const result = section.getByTestId("decision-compare-result");
  await expect(result).toBeVisible();
  await result.getByTestId("decision-compare-share-link").click();

  await expect(
    page.getByRole("status").filter({ hasText: /Link copied/i }).first(),
  ).toBeVisible({ timeout: 5_000 });

  const sharedUrl = await page.evaluate(
    () =>
      (window as unknown as { __clipboardWrites?: string[] }).__clipboardWrites?.at(-1) ?? "",
  );
  expect(sharedUrl, "clipboard should contain the shareable URL").toBeTruthy();
  expect(sharedUrl).toContain("#compare=");
  expect(sharedUrl).toContain(`/model/${modelId}/scenarios`);
  // The encoded payload should carry both selected scenario names so a
  // recipient lands on the same A + C comparison the founder was looking
  // at, not the default A + B auto-seed.
  const decodedHash = decodeURIComponent(sharedUrl.split("#compare=")[1] ?? "");
  expect(decodedHash).toContain(SCENARIO_A_NAME);
  expect(decodedHash).toContain(SCENARIO_C_NAME);

  // Pull the path + hash and reopen as a fresh navigation. The hydration
  // effect should re-select the same A + C comparison with no manual picker
  // interaction — that's the recipient's experience.
  const parsed = new URL(sharedUrl);
  const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  await page.goto(relative);

  const rehydratedSection = page.getByTestId("decision-comparison-section");
  await expect(rehydratedSection).toBeVisible();
  await expect(
    rehydratedSection.getByTestId("decision-compare-select-0"),
  ).toContainText(SCENARIO_A_NAME);
  await expect(
    rehydratedSection.getByTestId("decision-compare-select-1"),
  ).toContainText(SCENARIO_C_NAME);
  await expect(rehydratedSection.getByTestId("decision-compare-result")).toBeVisible();
});

test("Share-link hash gracefully ignores keys for deleted scenarios", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  // Visit with a hash that pins one real scenario (A) and one bogus key
  // ("phantom|2099-…") that doesn't exist on the model. The picker should
  // honour the real key and silently top up the second column from the
  // remaining saved scenarios rather than rendering an empty / broken state.
  const realKey = `${SCENARIO_A_NAME}|${SCENARIO_A_CREATED_AT}`;
  const bogusKey = "phantom-deleted-scenario|2099-12-31T00:00:00.000Z";
  const hashPayload = [realKey, bogusKey]
    .map((k) => encodeURIComponent(k))
    .join(",");
  await page.goto(
    `/model/${modelId}/scenarios#compare=${hashPayload}`,
  );

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();

  // Real key survives, bogus key drops, and the IIFE tops up to a
  // 2-column minimum from the saved list (which gives us scenario B since
  // it's the next un-used decision).
  await expect(section.getByTestId("decision-compare-select-0")).toContainText(
    SCENARIO_A_NAME,
  );
  await expect(section.getByTestId("decision-compare-select-1")).toContainText(
    SCENARIO_B_NAME,
  );
  await expect(section.getByTestId("decision-compare-result")).toBeVisible();
  await expect(section.getByTestId("decision-compare-error")).toHaveCount(0);
});

// Verifies the comparison view's responsive phone layout in a real browser
// — Task #385. Component tests in jsdom pin the responsive class hooks
// (sticky first column, swipe hint, single-column headline tiles) but
// can't tell us whether the resulting layout actually behaves at a
// 375px viewport: jsdom doesn't model `position: sticky`, viewport
// breakpoints, or font metrics, so a missing `bg-card` on a sticky cell
// or a broken `min-[480px]` hook only shows up here.
test("Decision comparison: phone (375x812) pins the metric column, stacks headline tile cells, and shows the swipe hint", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  // Set the viewport before navigating so the responsive Tailwind classes
  // (`sm:hidden`, `min-[480px]:grid-cols-2`, sticky `left-0`) all resolve
  // at the size a real iPhone-class device would report.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/model/${modelId}/scenarios`);

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("decision-impact-comparison")).toBeVisible();

  // Phone-only swipe affordance: the seven-column year table overflows on
  // phones, so the "Swipe →" hint must surface as a visual scroll cue.
  // The unit test asserts on `sm:hidden` in the class string; here we
  // assert on the actual computed visibility at 375px.
  const swipeHint = page.getByTestId("comparison-year-table-scroll-hint");
  await expect(swipeHint).toBeVisible();

  // Headline tiles must stack their inner cells into one column at <480px
  // (HEADLINE_INNER_GRID uses `grid-cols-1 min-[480px]:grid-cols-2`). At
  // 375px col-1 should sit *below* col-0, not next to it — the only way
  // to prove the responsive grid actually engaged in a real layout pass.
  const tileCol0 = page.getByTestId("cmp-y5-net-col-0");
  const tileCol1 = page.getByTestId("cmp-y5-net-col-1");
  await expect(tileCol0).toBeVisible();
  await expect(tileCol1).toBeVisible();
  const tileBox0 = await tileCol0.boundingBox();
  const tileBox1 = await tileCol1.boundingBox();
  expect(tileBox0, "headline tile col-0 should have a layout box").not.toBeNull();
  expect(tileBox1, "headline tile col-1 should have a layout box").not.toBeNull();
  // Stacked vertically: col-1's top is below col-0's bottom (allowing for
  // the grid `gap-2` spacing). If the grid ever regresses to two columns
  // at 375px, col-1 lands to the right of col-0 with the same y.
  expect(tileBox1!.y).toBeGreaterThanOrEqual(tileBox0!.y + tileBox0!.height - 1);

  // Sticky first column: scroll the year-table scroller all the way to
  // its right edge and verify the Metric header cell hasn't moved with
  // the scroll. If `position: sticky left-0` ever regresses, the cell
  // scrolls along with the year columns and `afterBox.x` shifts left.
  const scroller = page.getByTestId("comparison-year-table-scroller");
  await expect(scroller).toBeVisible();
  // Sanity-check the table actually overflows; otherwise the sticky
  // assertion below would silently pass for the wrong reason.
  const scrollMetrics = await scroller.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    scrollMetrics.scrollWidth,
    "the year table should overflow horizontally on a 375px viewport",
  ).toBeGreaterThan(scrollMetrics.clientWidth);

  const metricHeader = page
    .getByTestId("comparison-year-table")
    .locator("th.sticky")
    .first();
  await expect(metricHeader).toBeVisible();
  const beforeBox = await metricHeader.boundingBox();
  expect(beforeBox).not.toBeNull();

  await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth - el.clientWidth;
  });
  // Give the browser a frame to settle the scroll + sticky layout pass
  // before we re-measure.
  await page.waitForTimeout(100);

  const afterBox = await metricHeader.boundingBox();
  expect(afterBox).not.toBeNull();
  expect(
    Math.abs(afterBox!.x - beforeBox!.x),
    "metric header should remain pinned at the same x after horizontal scroll",
  ).toBeLessThanOrEqual(1);

  // The sticky cell must also keep an opaque background so year cells
  // scrolling under it don't bleed through. Both the header (`bg-slate-50`)
  // and the body label cells (`bg-card`) have to be opaque for the
  // scroll affordance to look right on iOS Safari.
  const headerBg = await metricHeader.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );
  expect(headerBg).not.toBe("rgba(0, 0, 0, 0)");
  expect(headerBg).not.toBe("transparent");

  const metricBodyCell = page
    .getByTestId("comparison-year-table")
    .locator("td.sticky")
    .first();
  const bodyBg = await metricBodyCell.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );
  expect(bodyBg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bodyBg).not.toBe("transparent");
});

// Companion to the phone layout test — guards the desktop affordance so
// a future "always show the swipe hint" change doesn't sneak through.
// At 1280px the hint must be hidden because there's no horizontal
// overflow, and a redundant "Swipe →" cue would be visual noise.
test("Decision comparison: desktop (1280x720) hides the phone-only swipe hint", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/model/${modelId}/scenarios`);

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("decision-impact-comparison")).toBeVisible();

  // The hint carries `sm:hidden`, so at desktop widths it's still in the
  // DOM but `display: none`. `toBeHidden` matches both DOM-removal and
  // display:none, so it correctly fails if either the responsive class
  // is dropped or the hint is rendered unconditionally.
  await expect(
    page.getByTestId("comparison-year-table-scroll-hint"),
  ).toBeHidden();
});
