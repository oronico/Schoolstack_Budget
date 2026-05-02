import { PERSONAS, primeAuthToken, seedPersonaModel } from "./utils/export-personas";
import { test, expect, type Page } from "./utils/test";

// Task #438 — UI regression coverage that the 5-Year Financial Projection
// callouts promoted in Task #362 actually render in the lender + board
// preview modals.
//
// Background:
//   * Task #362 moved the "Breakeven enrollment" + "Prior-year comparison"
//     sentences out of the section narrative and into structured
//     `PacketInsight` callouts surfaced via `<InsightCallout>` cards.
//   * `tests/lender-five-year-callouts.ts` (api-server) already pins:
//       - the section.insights[] payload shape, tones, and bodies, and
//       - that both labels survive the round trip into the rendered PDF.
//   * What's NOT covered today: a regression where the React preview
//     drops `section.insights[]` rendering (e.g. someone removes the
//     `{section.insights && ...}` block in LenderPacketPreview /
//     BoardPacketPreview). The PDF would still be correct, the modal
//     would still render and let you download, and the silent loss
//     would only be discoverable by visually inspecting the modal.
//
// We piggy-back on the existing persona seeding helper:
//   * `privateSchoolWithESA` (label: "private-high-school") is the
//     persona used by the api-server callouts test. It carries a
//     `priorYearSnapshot` (endingEnrollment: 85, totalRevenue: 1.2M),
//     which is what makes the prior-year insight surface; without a
//     prior-year snapshot, `buildFiveYearProjection` skips that
//     callout entirely. Picking the same persona keeps this UI test
//     in lockstep with the backend assertion — if the backend test
//     ever picks a different reference shape, this one should follow.
//
// Each spec opens the persona's model on the Export step, clicks the
// preview-modal trigger card, waits for the modal's cash-runway block
// to mount (proxy that the JSON preview fetch landed cleanly — same
// pattern as `export-download-personas.spec.ts`), and then asserts
// both `<InsightCallout>` labels appear inside the auto-expanded
// "5-Year Financial Projection" section card.
//
// We scope the label assertions to the section card (not the whole
// modal) so the test would fail loudly if a future refactor moved
// the callouts out of the five-year section into, say, the executive
// summary block.

const PRIVATE_HS = PERSONAS.find((p) => p.label === "private-high-school");
if (!PRIVATE_HS) {
  // Hard-fail at module load if the persona helper drops this fixture
  // — losing the priorYearSnapshot-bearing persona would silently
  // weaken the prior-year-callout assertion below.
  throw new Error(
    "lender-five-year-callouts.spec: expected PERSONAS to include 'private-high-school' (privateSchoolWithESA)",
  );
}

// Returns the locator for the auto-expanded "5-Year Financial Projection"
// section card inside the open packet modal. The SectionCard root is the
// nearest `div` ancestor of the section's toggle button; chaining the
// callout assertions through this locator guarantees we're looking at
// callouts rendered IN the five-year section, not anywhere else in the
// modal (e.g. an executive-summary insight that happens to share text).
function fiveYearSection(page: Page) {
  const sectionToggle = page.getByRole("button", {
    name: /^5-Year Financial Projection$/,
  });
  return page.locator("div.border.rounded-xl").filter({ has: sectionToggle });
}

async function openPreviewAndWaitForFiveYear(
  page: Page,
  cardName: RegExp,
  cashRunwayTestId:
    | "lender-packet-cash-runway"
    | "board-packet-cash-runway",
): Promise<void> {
  await page.getByRole("button", { name: cardName }).click();
  // The modal's data fetch settling is signalled by the cash-runway block
  // mounting (JSON preview returned 200). Mirrors the wait pattern used
  // by export-download-personas.spec.ts so this test fails fast on a
  // 500 from the preview endpoint instead of timing out on the section
  // toggle below.
  await expect(page.getByTestId(cashRunwayTestId)).toBeVisible({
    timeout: 30_000,
  });
  // The "5-Year Financial Projection" section is in the modal's default
  // `expandedSections` set for both LenderPacketPreview and
  // BoardPacketPreview, so the section's body (and its insights) should
  // already be rendered without an extra click.
  await expect(
    page.getByRole("button", { name: /^5-Year Financial Projection$/ }),
  ).toBeVisible({ timeout: 30_000 });
}

test("LenderPacketPreview renders 5-year breakeven + prior-year callouts", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedPersonaModel(request, PRIVATE_HS);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await expect(
    page.getByRole("heading", { name: /Ready to export your model/i }),
  ).toBeVisible({ timeout: 30_000 });

  await openPreviewAndWaitForFiveYear(
    page,
    /Lender-Ready Packet/i,
    "lender-packet-cash-runway",
  );

  const section = fiveYearSection(page);
  // Both callouts must render, scoped to the 5-Year section card so a
  // regression that drops `{section.insights && ...}` from the lender
  // preview fails this assertion immediately. The labels match the
  // backend contract pinned by tests/lender-five-year-callouts.ts.
  await expect(
    section.getByText("Breakeven enrollment", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText("Prior-year comparison", { exact: true }),
  ).toBeVisible();
  // Sanity check the body — the breakeven callout should always quote a
  // student count + a Year-1 cushion; the prior-year callout should
  // always quote a prior-year revenue figure. If a future refactor swaps
  // the InsightCallout `body` prop for the `label` prop or vice versa,
  // these regexes would catch it (a stray label wouldn't match either
  // body shape).
  await expect(
    section.getByText(/Breakeven enrollment is \d+ students/),
  ).toBeVisible();
  await expect(
    section.getByText(/Prior-year revenue was \$/),
  ).toBeVisible();
  // Structural guard: the original task #362 spec called for these to
  // render as bordered InsightCallout cards (the `card` variant uses a
  // `border-l-4 rounded-md` left border container). A future regression
  // that preserved the same text but demoted the callouts to plain
  // <p> paragraphs would still pass the text assertions above, so we
  // also assert at least two card-shaped containers exist inside the
  // section. The `border-l-4` class is unique to InsightCallout's card
  // variant inside the preview modal — neither the section narrative
  // nor the metric badges use it.
  await expect(section.locator(".border-l-4.rounded-md")).toHaveCount(2);
});

test("BoardPacketPreview renders 5-year breakeven + prior-year callouts", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedPersonaModel(request, PRIVATE_HS);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await expect(
    page.getByRole("heading", { name: /Ready to export your model/i }),
  ).toBeVisible({ timeout: 30_000 });

  await openPreviewAndWaitForFiveYear(
    page,
    /Board Summary/i,
    "board-packet-cash-runway",
  );

  const section = fiveYearSection(page);
  await expect(
    section.getByText("Breakeven enrollment", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText("Prior-year comparison", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText(/Breakeven enrollment is \d+ students/),
  ).toBeVisible();
  await expect(
    section.getByText(/Prior-year revenue was \$/),
  ).toBeVisible();
  // Structural guard: see the matching comment in the lender spec
  // above — same `border-l-4 rounded-md` shape produced by the
  // InsightCallout card variant.
  await expect(section.locator(".border-l-4.rounded-md")).toHaveCount(2);
});
