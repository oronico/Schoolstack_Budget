/**
 * Task #930 / M2 — Render-based extractor smoke tests.
 *
 * Renders the in-app `ConsultantAnalysisView` and pieces of
 * `LenderPacketPreview` against fixture data, runs the DOM walker,
 * and asserts the rendered numeric record set is non-empty and
 * well-shaped. Together with the props-state walker in
 * `artifacts/api-server/src/lib/integrity/extract/component-state.ts`
 * this satisfies M2's "in-app state serializer" deliverable across
 * BOTH target components.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { extractRendered } from "../extract-rendered";

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { ConsultantAnalysisView } from "@/components/consultant/ConsultantAnalysisView";
import type { ConsultantOutput } from "@workspace/api-client-react";
import {
  NarrativeHeader,
  CommentaryBlock,
} from "@/components/export/LenderPacketPreview";

function makeConsultantFixture(): ConsultantOutput {
  return {
    executiveSummary: "Solid plan with one watch-area.",
    biggestStrength: "Tuition revenue is durable.",
    biggestRisk: "Year-2 cash thins if enrollment slips.",
    recommendations: [],
    lenderReadiness: "Needs Work",
    lenderReadinessExplanation: "Tighten reserves before lender intake.",
    keyMetrics: [
      { name: "Year 1 DSCR", value: "1.45x", status: "good" },
      { name: "Days Cash on Hand", value: "$125,000", status: "warning" },
      { name: "Year 1 Net Income", value: "$166K", status: "good" },
      { name: "Operating Margin", value: "12.5%", status: "good" },
    ],
    revenueComposition: [],
    revenueQuality: [],
    costComposition: [],
    cumulativeFinancials: [],
    stressTests: [],
    sensitivityMatrix: [],
    expenseSensitivityMatrix: [],
    cashRunwayMonths: 8.5,
    enrollmentGuidance: [],
    topIssues: [],
    healthSignals: [],
    assumptionFlags: [],
    generatedAt: new Date("2026-01-01").toISOString(),
    lenderReadinessResult: {
      uncappedRating: "Strong",
      effectiveRating: "Needs Work",
      callout: "Rating capped at Needs Work pending evidence tagging on 22 of 22 assumptions.",
      cap: {
        applied: true,
        capTier: {
          taggedFractionMin: 0,
          taggedFractionMax: 0.25,
          capAt: "Needs Work",
          rationale: "Below 25% evidence tagging.",
          source: "[citation pending]",
          lastValidated: "2026-05-17",
        },
        reason: "Below 25% evidence tagging.",
        pendingEvidenceCount: 22,
        totalAssumptionCount: 22,
        taggedCount: 0,
        taggedFraction: 0,
      },
    },
  } as unknown as ConsultantOutput;
}

function assertWellShaped(records: ReturnType<typeof extractRendered>): void {
  for (const r of records) {
    expect(r.surface).toBe("rendered");
    expect(typeof r.value).toBe("number");
    expect(Number.isFinite(r.value)).toBe(true);
    expect(typeof r.location).toBe("string");
    expect(r.location.length).toBeGreaterThan(0);
    expect(r.producer.length).toBeGreaterThan(0);
  }
}

describe("M2 render-based extractor — ConsultantAnalysisView", () => {
  it("emits numeric records for every value the founder sees on screen", () => {
    const { container } = render(
      <ConsultantAnalysisView
        data={makeConsultantFixture()}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
      />,
    );
    const records = extractRendered(container, {
      componentName: "ConsultantAnalysisView",
    });
    expect(records.length).toBeGreaterThan(0);
    assertWellShaped(records);

    // Every printed key-metric value should surface as an extracted
    // record. The fixture pins five tokens; the extractor MUST find
    // numeric matches for all of them.
    const values = records.map((r) => r.value);
    // 1.45x → 1.45
    expect(values).toContain(1.45);
    // 12.5% → 0.125
    expect(values).toContain(0.125);
    // $166K → 166000
    expect(values).toContain(166_000);
    // 8.5 (runway months, may render as "8.5 mo")
    expect(values.some((v) => Math.abs(v - 8.5) < 1e-6)).toBe(true);
    // 22 assumptions count appears in the cap callout.
    expect(values).toContain(22);

    // Locations must be unique within the document so M4 can key on
    // (producer, location) without collisions.
    const locs = records.map((r) => r.location);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe("M2 render-based extractor — LenderPacketPreview", () => {
  it("emits numeric records from the NarrativeHeader + CommentaryBlock subtrees", () => {
    const { container } = render(
      <div>
        <NarrativeHeader
          narrative={{
            headline: "Plan holds with 1.32x Y1 DSCR.",
            summary: "Reserves remain above 3 months across the projection.",
            keyRisks: ["Concentration on Tier-1 tuition (75%)."],
            keyStrengths: ["Surplus of $42,500 in Y2."],
            recommendedFocus: "Tighten Year-2 contingency by $20,000.",
          }}
          readiness={{
            status: "Almost There",
            explanation: "85% of assumptions tagged with supporting evidence.",
            result: {
              cap: { applied: true },
              callout:
                "Rating capped at Almost There pending evidence tagging on 3 of 22 assumptions.",
            },
          }}
        />
        <CommentaryBlock
          title="Lender Commentary"
          accent="lender"
          commentary={{
            paragraphs: [
              "Year 1 net income lands at $166,000 with a 12.5% operating margin.",
              "Cash trough of $48,500 in month 7 still clears the 1.20x DSCR covenant.",
            ],
            allowedFigures: ["$166,000", "12.5%", "$48,500", "1.20x"],
            generatedAt: new Date("2026-01-01").toISOString(),
          }}
          onRegenerate={() => {}}
          regenerating={false}
        />
      </div>,
    );
    const records = extractRendered(container, {
      componentName: "LenderPacketPreview",
    });
    expect(records.length).toBeGreaterThan(0);
    assertWellShaped(records);

    const values = records.map((r) => r.value);
    // Anchor values pinned in the fixture above MUST surface.
    expect(values).toContain(1.32);              // 1.32x DSCR
    expect(values).toContain(166_000);            // $166,000 net income
    expect(values).toContain(0.125);              // 12.5% margin
    expect(values).toContain(48_500);             // $48,500 cash trough
    expect(values).toContain(1.2);                // 1.20x covenant
    expect(values).toContain(22);                 // 22 assumptions in callout
  });
});
