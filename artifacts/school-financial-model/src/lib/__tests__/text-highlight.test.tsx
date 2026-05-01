import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { highlightMatch } from "@/lib/text-highlight";

function renderHighlight(text: string, query: string) {
  const { container } = render(<span>{highlightMatch(text, query)}</span>);
  return container;
}

describe("highlightMatch", () => {
  it("returns plain text when the query is empty", () => {
    const c = renderHighlight("Lead Math Teacher", "");
    expect(c.querySelectorAll("mark")).toHaveLength(0);
    expect(c.textContent).toBe("Lead Math Teacher");
  });

  it("returns plain text when the query is whitespace", () => {
    const c = renderHighlight("Lead Math Teacher", "   ");
    expect(c.querySelectorAll("mark")).toHaveLength(0);
    expect(c.textContent).toBe("Lead Math Teacher");
  });

  it("returns plain text when the query is not present", () => {
    const c = renderHighlight("Lead Math Teacher", "zzz");
    expect(c.querySelectorAll("mark")).toHaveLength(0);
    expect(c.textContent).toBe("Lead Math Teacher");
  });

  it("wraps the matched substring in a <mark> with the testid", () => {
    const c = renderHighlight("Lead Math Teacher", "Math");
    const marks = c.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Math");
    expect(marks[0].getAttribute("data-testid")).toBe("match-highlight");
    // Surrounding text is preserved exactly so the role-name header still
    // reads naturally to the founder.
    expect(c.textContent).toBe("Lead Math Teacher");
  });

  it("matches case-insensitively but preserves the source casing inside the mark", () => {
    const c = renderHighlight("Lead Math Teacher", "math");
    const marks = c.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Math");
  });

  it("highlights every occurrence when the query repeats", () => {
    const c = renderHighlight("Operations Operations Lead", "operations");
    const marks = c.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(c.textContent).toBe("Operations Operations Lead");
  });

  it("ignores leading/trailing whitespace in the query", () => {
    const c = renderHighlight("Operations Manager 1", "  Manager  ");
    const marks = c.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Manager");
  });

  it("returns the original text untouched when text is empty", () => {
    const c = renderHighlight("", "anything");
    expect(c.querySelectorAll("mark")).toHaveLength(0);
    expect(c.textContent).toBe("");
  });
});
