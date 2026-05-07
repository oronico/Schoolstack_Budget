import { test, expect } from "./utils/test";

// Task #600: when "Founder paid in Year 1" is No, the wizard used to hide the
// compensation amount and "Compensation begins Year" inputs entirely, so a
// founder who planned to defer their salary to Year 2+ had no way to enter
// it through the UI even though the payload builder already supported the
// case (`startYear > 1`). This spec is the regression contract:
//
//   1. The two compensation inputs are visible *both* when the toggle is on
//      and when it is off (the deferred case is the one this task fixes).
//   2. Toggling to "deferred" defaults `Compensation begins` to Year 2 and
//      offers Year 2..5 only (Year 1 is meaningless for deferred comp).
//   3. With founderIsPaidYear1=false + comp=$65,000 + begins Year 2, the
//      lender readiness snapshot on the review step calls out the deferred
//      compensation as a *caution* flag (not a "no founder comp planned"
//      hard concern).
//
// The page is the guest underwriting wizard at `/underwriting` — no auth,
// no API seeding, no persona; the only state lives in localStorage under
// `guest_underwriting_model_v1` and is wiped via the wizard's own reset.

const STORAGE_KEY = "guest_underwriting_model_v1";

test("deferred founder comp inputs are reachable and surface a caution flag", async ({ page }) => {
  // Guarantee a clean slate so prior test runs don't leak step / values into
  // this one. The wizard reads STORAGE_KEY on mount.
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // localStorage may be unavailable on the very first about:blank
      // navigation; addInitScript reruns on real navigations.
    }
  }, STORAGE_KEY);

  await page.goto("/underwriting");

  // Walk to the Staffing step (step 4 of 7). Each "Continue" advances one
  // step; the defaults seeded by GUEST_DEFAULTS pass every required field on
  // steps 1-3 so we don't have to fill anything to get there.
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("button-next").click();
  }

  // The toggle defaults to false (founderIsPaidYear1 = false in defaults).
  const toggle = page.getByTestId("toggle-founder-paid");
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();

  // The fix: comp amount + "Compensation begins" must be visible in the
  // deferred state. Pre-fix, both inputs were hidden behind the toggle.
  const compInput = page.getByTestId("input-founder-comp");
  const beginsSelect = page.getByTestId("select-founder-comp-year");
  await expect(compInput).toBeVisible();
  await expect(beginsSelect).toBeVisible();

  // Default for the deferred state is Year 2.
  await expect(beginsSelect).toHaveValue("2");

  // Year 1 is not a valid choice when comp is deferred — the option list is
  // narrowed to Years 2..5 so the founder can't pick a contradictory value.
  const yearOptionValues = await beginsSelect.locator("option").evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value),
  );
  expect(yearOptionValues).toEqual(["2", "3", "4", "5"]);

  // Enter the deferred-comp scenario from the task: $65k starting in Year 2.
  await compInput.fill("65000");
  // Already defaulted to "2"; reselect to be explicit and to exercise the
  // change handler.
  await beginsSelect.selectOption("2");

  // Toggling on → off should re-default begins-year to 2 (not stay on 1) so
  // the founder can't accidentally submit "deferred to Year 1" — that is the
  // contradictory state the option-list narrowing already prevents, but the
  // toggle handler is the second line of defence.
  await toggle.check();
  await expect(beginsSelect).toHaveValue("1");
  await toggle.uncheck();
  await expect(beginsSelect).toHaveValue("2");
  // Comp amount survives the toggle round-trip.
  await expect(compInput).toHaveValue("65000");

  // Steps 5 (Expenses & facility), 6 (Debt & cash), 7 (Review & export).
  await page.getByTestId("button-next").click();
  await page.getByTestId("button-next").click();
  await page.getByTestId("button-next").click();

  // Step 7 — the lender readiness snapshot.
  const snapshot = page.getByTestId("lender-readiness-snapshot");
  await expect(snapshot).toBeVisible();

  // Deferred + non-zero comp produces the caution flag (not the "no founder
  // compensation planned" high-severity flag we'd see if comp were $0).
  await expect(snapshot).toContainText("Founder compensation deferred to Year 2");
  await expect(snapshot).not.toContainText("No founder compensation planned");
});
