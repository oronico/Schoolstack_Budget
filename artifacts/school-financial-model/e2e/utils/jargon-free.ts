import type { Page } from "@playwright/test";

// Forbidden terms a yet_to_launch + new_to_budgeting founder must NEVER
// see anywhere in the app. Kept in one place so the wizard sweep
// (`persona-yet-to-launch-jargon-free.spec.ts`) and the dashboard sweep
// (Task #426) enforce the exact same product rule and cannot drift.
//
// We match "actuals" as a plural noun only (with word boundaries) — the
// adjective "actual" (e.g. "actual lease numbers", "actual costs") is
// plain English and is intentionally allowed. The forbidden form is the
// accounting-noun "actuals" as imported from QuickBooks/Xero, which is
// what the persona modal is shielding new founders from.
//
// Mirrors the runtime filter list in
// `src/components/coaching/SectionExplainers.tsx` (`YET_TO_LAUNCH_FORBIDDEN`).
export const FORBIDDEN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bactuals\b/i, label: "actuals" },
  { re: /prior[\s-]?year/i, label: "prior year" },
  { re: /quickbooks/i, label: "QuickBooks" },
  { re: /\bxero\b/i, label: "Xero" },
  { re: /\bvariance\b/i, label: "variance" },
  { re: /forecast accuracy/i, label: "forecast accuracy" },
];

export function expectNoForbiddenTerms(text: string, where: string): void {
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) {
      const idx = text.search(re);
      const window = text.slice(Math.max(0, idx - 60), idx + 80);
      throw new Error(
        `${where}: yet_to_launch founder unexpectedly saw "${label}". Context: …${window}…`,
      );
    }
  }
}

// Sweep the visible body text for forbidden terms. We use innerText (not
// textContent) so we only catch *rendered* copy — hidden helper nodes that
// happen to contain literal "actuals" strings (e.g. CSS-collapsed sections)
// won't trigger false positives.
export async function sweepPage(page: Page, where: string): Promise<void> {
  const text = await page.locator("body").innerText();
  expectNoForbiddenTerms(text, where);
}
