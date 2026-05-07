import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConceptExplainer } from "../ConceptExplainer";
import { CONCEPT_EXPLANATIONS } from "@/lib/coaching/concept-explanations";

describe("ConceptExplainer", () => {
  it("renders the title for every concept and reveals the body on click", () => {
    for (const id of Object.keys(CONCEPT_EXPLANATIONS) as Array<
      keyof typeof CONCEPT_EXPLANATIONS
    >) {
      const entry = CONCEPT_EXPLANATIONS[id];
      const { unmount } = render(<ConceptExplainer concept={id} />);
      expect(screen.getByText(entry.title)).toBeInTheDocument();
      // Body hidden by default
      expect(
        screen.queryByTestId(`concept-explainer-body-${id}`),
      ).toBeNull();
      fireEvent.click(
        screen.getByTestId(`concept-explainer-toggle-${id}`),
      );
      expect(
        screen.getByTestId(`concept-explainer-body-${id}`),
      ).toHaveTextContent(entry.body.slice(0, 40));
      unmount();
    }
  });

  it("supports defaultOpen for inline rendering", () => {
    render(<ConceptExplainer concept="revenue" defaultOpen />);
    expect(
      screen.getByTestId("concept-explainer-body-revenue"),
    ).toBeInTheDocument();
  });
});

describe("CONCEPT_EXPLANATIONS content guardrails", () => {
  const banned = [
    /\bapproved\b/i,
    /\bdeclined\b/i,
    /\bfailed\b/i,
    /\bineligible\b/i,
    /\bpass\s*\/\s*fail\b/i,
    /\bunderwriting\s+decision\b/i,
    /\bcredit\s+decision\b/i,
    /\blender\s+packets?\b/i,
    /\bboard\s+packets?\b/i,
    /\bboard\s+summar(?:y|ies)\b/i,
  ];
  for (const id of Object.keys(CONCEPT_EXPLANATIONS) as Array<
    keyof typeof CONCEPT_EXPLANATIONS
  >) {
    const entry = CONCEPT_EXPLANATIONS[id];
    it(`"${id}" copy avoids banned founder-voice phrases`, () => {
      for (const re of banned) {
        expect(entry.title + " " + entry.body).not.toMatch(re);
      }
    });
    it(`"${id}" body is 2-4 sentences`, () => {
      const sentences = entry.body
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(4);
    });
  }
});
