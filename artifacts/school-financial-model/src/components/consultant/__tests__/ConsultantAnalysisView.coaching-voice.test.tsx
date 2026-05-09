import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { ConsultantAnalysisView } from "../ConsultantAnalysisView";
import type { ConsultantOutput } from "@workspace/api-client-react";

type Readiness = ConsultantOutput["lenderReadiness"];

const READINESS_LEVELS: Readiness[] = ["Strong", "Needs Work", "Not Yet Ready"];

const COACHING_HEADLINE_BY_READINESS: Record<Readiness, RegExp> = {
  Strong: /ready to share/i,
  "Needs Work": /almost there/i,
  "Not Yet Ready": /worth another pass/i,
};

const BRIEF_SECTION_TITLES = [
  "What your model says",
  "What looks strong",
  "What needs more clarity",
  "What could create cash pressure",
  "What to fix first",
  "What someone reviewing this may ask",
  "Suggested next steps before sharing externally",
];

// Verdict-style words that must never appear in the rendered Consultant view
// regardless of which readiness level the engine emits. Sourced from the
// founder-voice style guide (docs/FOUNDER_VOICE.md).
const BANNED_WORDS: Array<{ label: string; re: RegExp }> = [
  { label: "approved", re: /\bapproved\b/i },
  { label: "declined", re: /\bdeclined\b/i },
  { label: "failed", re: /\bfailed\b/i },
  { label: "pass/fail", re: /\bpass\s*\/\s*fail\b/i },
  { label: "ineligible", re: /\bineligible\b/i },
  { label: "rejected", re: /\brejected\b/i },
];

function makeFixture(readiness: Readiness): ConsultantOutput {
  const fixture = {
    executiveSummary:
      "Your model shows steady enrollment growth and a reasonable cost structure for an early-stage school.",
    biggestStrength:
      "Tuition revenue holds steady across the projection window.",
    biggestRisk:
      "Cash dips in Year 2 if your enrollment ramp slips by even a few seats.",
    recommendations: [
      {
        title: "Tighten the Year 2 enrollment narrative",
        description:
          "Walk a reviewer through how you fill the new seats and what you do if the ramp slips.",
        priority: "high",
      },
    ],
    lenderReadiness: readiness,
    lenderReadinessExplanation:
      "Here is how this would read against the Lending Lab benchmarks today.",
    keyMetrics: [
      {
        name: "Year 1 DSCR",
        value: "1.35x",
        status: "good",
        interpretation: "Comfortably above the 1.20x benchmark.",
      },
    ],
    revenueComposition: [],
    revenueQuality: [],
    costComposition: [],
    cumulativeFinancials: [],
    stressTests: [],
    sensitivityMatrix: [],
    expenseSensitivityMatrix: [],
    cashRunwayMonths: 24,
    enrollmentGuidance: [],
    topIssues: [],
    healthSignals: [],
    assumptionFlags: [],
    generatedAt: new Date("2026-01-01").toISOString(),
  } as unknown as ConsultantOutput;
  return fixture;
}

describe("ConsultantAnalysisView — coaching voice (Task #741)", () => {
  it.each(READINESS_LEVELS)(
    "renders the seven brief-section headings in order for readiness=%s",
    (readiness) => {
      const { container } = render(
        <ConsultantAnalysisView
          data={makeFixture(readiness)}
          niLabel="Net Income"
          cumNiLabel="Cumulative Net Income"
        />,
      );

      const headings = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-testid^='consultant-section-band-'] h3",
        ),
      ).map((el) => el.textContent?.trim() ?? "");

      expect(
        headings,
        `Expected the seven brief sections in order for readiness=${readiness}`,
      ).toEqual(BRIEF_SECTION_TITLES);
    },
  );

  it.each(READINESS_LEVELS)(
    "uses coaching phrasing — not a bare verdict noun — in the Section 7 headline for readiness=%s",
    (readiness) => {
      const { container } = render(
        <ConsultantAnalysisView
          data={makeFixture(readiness)}
          niLabel="Net Income"
          cumNiLabel="Cumulative Net Income"
        />,
      );

      const card = container.querySelector<HTMLElement>(
        "[data-testid='readiness-coaching-card']",
      );
      expect(card, "Section 7 readiness coaching card should be rendered").not.toBeNull();

      const headlineText = within(card!)
        .getByText(COACHING_HEADLINE_BY_READINESS[readiness])
        .textContent ?? "";

      // The literal verdict label ("Strong" / "Needs Work" / "Not Yet Ready")
      // must not appear as a bare headline noun. We assert the headline text
      // does not equal the raw label and does not start with it.
      const trimmed = headlineText.trim();
      expect(
        trimmed,
        `Section 7 headline must not be the bare verdict noun "${readiness}"`,
      ).not.toBe(readiness);
      expect(
        new RegExp(`^${readiness}\\b`, "i").test(trimmed),
        `Section 7 headline must not lead with the bare verdict noun "${readiness}" (got: "${trimmed}")`,
      ).toBe(false);
    },
  );

  it.each(READINESS_LEVELS)(
    "rendered output contains no banned verdict-style words for readiness=%s",
    (readiness) => {
      const { container } = render(
        <ConsultantAnalysisView
          data={makeFixture(readiness)}
          niLabel="Net Income"
          cumNiLabel="Cumulative Net Income"
        />,
      );

      const text = container.textContent ?? "";

      for (const { label, re } of BANNED_WORDS) {
        expect(
          re.test(text),
          `Consultant view must not contain the verdict word "${label}" ` +
            `for readiness=${readiness}. See docs/FOUNDER_VOICE.md.`,
        ).toBe(false);
      }
    },
  );
});
