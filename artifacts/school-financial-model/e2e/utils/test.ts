import { test as base, expect } from "@playwright/test";
import type {
  APIRequestContext,
  ConsoleMessage,
  Locator,
  Page,
} from "@playwright/test";

// Task #381: every spec gets the cookie-consent banner auto-dismissed.
//
// `src/components/CookieConsent.tsx` renders a `position: fixed; bottom: 0`
// dialog whenever `localStorage.cookie_consent` is `null` (the founder has
// not chosen yet). On any wizard or decision-flow step where the primary
// CTA sits low in the viewport (e.g. the full-width "Continue" button on
// the Expenses category picker, or the decision-flow "Continue" button)
// the banner intercepts pointer events and breaks `.click()`.
//
// Each new spec used to seed `localStorage.cookie_consent = "declined"`
// inside its own `primeAuthToken` helper; that boilerplate is easy to
// forget and was the proximate cause of flaky failures whenever a new
// decision-flow spec was added. This shared fixture pre-seeds the
// declined choice via `page.addInitScript` so the banner never renders
// (CookieConsent treats any non-null consent value as already-decided
// and skips the show timer entirely). Spec authors get the protection
// for free just by importing `test` from this module instead of
// `@playwright/test`.
//
// Specs that need to *exercise* the banner can still call
// `localStorage.removeItem("cookie_consent")` themselves before reload.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cookie_consent", "declined");
      } catch {
        // localStorage may be unavailable on the very first about:blank
        // navigation in some browsers — falling through is safe because
        // addInitScript re-runs on every subsequent navigation, where
        // the API is available.
      }
    });
    await use(page);
  },
});

export { expect };
export type { APIRequestContext, ConsoleMessage, Locator, Page };
