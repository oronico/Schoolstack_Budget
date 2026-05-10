/**
 * Task #753 — Guard test that asserts the in-app lender-readiness panels
 * render the same coaching headline shown on every export surface (lender
 * packet PDF, lender summary PDF, founder summary, narrative commentary,
 * and the review-feedback email) instead of the bare verdict word
 * ("Strong" / "Needs Work" / "Not Yet Ready").
 *
 * If a future regression brings the bare verdict noun back into any of
 * the rendered readiness widgets, this test will fail.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { LenderReadinessBadge } from "@/pages/shared/SharedModelPage";
import { LenderBadge } from "@/pages/admin";
import { NarrativeHeader } from "@/components/export/LenderPacketPreview";
import {
  LENDER_READINESS_COACHING_HEADLINES,
  type LenderReadinessVerdict,
} from "@/lib/coaching/lender-readiness-coaching";

const VERDICTS: LenderReadinessVerdict[] = ["Strong", "Needs Work", "Not Yet Ready"];

const narrativeFixture = {
  headline: "A steady early-stage plan",
  summary: "Enrollment ramp and cash buffer hold under the standard battery.",
  keyRisks: [],
  keyStrengths: [],
  recommendedFocus: "Tighten the Year 2 narrative.",
};

describe("In-app readiness panels render coaching headlines (Task #753)", () => {
  it.each(VERDICTS)(
    "SharedModelPage badge for %s shows the coaching headline, not the bare verdict noun",
    (verdict) => {
      const { container } = render(<LenderReadinessBadge readiness={verdict} />);
      const text = container.textContent ?? "";

      expect(text).toContain(LENDER_READINESS_COACHING_HEADLINES[verdict]);
      // The bare verdict noun must not stand on its own as the badge label.
      expect(text.trim()).not.toBe(verdict);
    },
  );

  it.each(VERDICTS)(
    "Admin LenderBadge for %s shows the coaching headline, not the bare verdict noun",
    (verdict) => {
      const { container } = render(<LenderBadge readiness={verdict} />);
      const text = container.textContent ?? "";

      expect(text).toContain(LENDER_READINESS_COACHING_HEADLINES[verdict]);
      expect(text.trim()).not.toBe(verdict);
    },
  );

  it.each(VERDICTS)(
    "LenderPacket NarrativeHeader for %s shows the coaching headline alongside the label",
    (verdict) => {
      const { container } = render(
        <NarrativeHeader
          narrative={narrativeFixture}
          readiness={{ status: verdict, explanation: "Sample explanation." }}
        />,
      );
      const text = container.textContent ?? "";

      expect(text).toContain(LENDER_READINESS_COACHING_HEADLINES[verdict]);
      // The bare-verdict legacy form ("Lender Readiness: Strong" etc.) must
      // no longer be present — we expect the coaching headline to follow the
      // colon instead.
      expect(text).not.toMatch(new RegExp(`Lender Readiness:\\s*${verdict}\\b(?!\\s*[—-])`));
    },
  );
});
