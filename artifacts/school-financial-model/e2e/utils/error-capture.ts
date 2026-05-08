import type { ConsoleMessage, Page } from "@playwright/test";

export function setupErrorCapture(page: Page) {
  const pageErrors: string[] = [];

  page.on("pageerror", (err) => {
    if (
      err.message.includes("error loading dynamically imported module") ||
      err.message.includes("Failed to fetch dynamically imported module")
    )
      return;
    pageErrors.push(`PAGE ERROR: ${err.message}`);
  });

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const isExpected =
      text.includes("ResizeObserver") ||
      text.includes("401 (Unauthorized)") ||
      text.includes("fonts.googleapis") ||
      text.includes("Failed to load resource") ||
      text.includes("[vite] Error") ||
      text.includes("error loading dynamically imported module") ||
      text.includes("recreate this component tree") ||
      text.includes("SchoolStack rendering error");
    if (!isExpected) {
      pageErrors.push(`CONSOLE ERROR: ${text}`);
    }
  });

  return pageErrors;
}
