import { describe, it, expect } from "vitest";

import { findFigureDriftWarnings } from "../NarrativeStep";

describe("findFigureDriftWarnings (Task #746)", () => {
  const allowed = [
    "$50,000",
    "$1,200,000",
    "12",
    "28",
    "85%",
    "1.45x",
    "Year 1",
    "Year 5",
    "9 months",
  ];

  it("returns no warnings when the founder draft is empty", () => {
    expect(findFigureDriftWarnings("", allowed)).toEqual([]);
    expect(findFigureDriftWarnings("   \n  ", allowed)).toEqual([]);
  });

  it("returns no warnings when every figure matches the canonical allow-list", () => {
    const text =
      "We project 12 students in Year 1, growing to 28 by Year 5. " +
      "Reserves reach $1,200,000 (about 9 months) at retention of 85% with DSCR of 1.45x.";
    expect(findFigureDriftWarnings(text, allowed)).toEqual([]);
  });

  it("flags currency, percentage, ratio, year, months, and bare-number drift", () => {
    const text =
      "Our cash runway is $999,999 and DSCR is 2.10x. " +
      "Retention runs 90% with 50 students by Year 7 over 18 months.";
    const warnings = findFigureDriftWarnings(text, allowed);
    const founderTokens = warnings.map((w) => w.founderValue).sort();
    expect(founderTokens).toEqual(
      ["$999,999", "18 months", "2.10x", "50", "90%", "Year 7"].sort(),
    );
  });

  it("attaches canonical candidates of the matching shape to each warning", () => {
    const warnings = findFigureDriftWarnings(
      "Our cash runway is $999,999 and DSCR is 2.10x.",
      allowed,
    );
    const cash = warnings.find((w) => w.founderValue === "$999,999");
    expect(cash?.category).toBe("currency");
    expect(cash?.canonicalCandidates).toEqual(["$50,000", "$1,200,000"]);

    const ratio = warnings.find((w) => w.founderValue === "2.10x");
    expect(ratio?.category).toBe("ratio");
    expect(ratio?.canonicalCandidates).toEqual(["1.45x"]);
  });

  it("dedupes repeated unauthorized tokens", () => {
    const text = "$999,999 here and $999,999 there. Also 90% and 90%.";
    const warnings = findFigureDriftWarnings(text, allowed);
    expect(warnings.map((w) => w.founderValue).sort()).toEqual(
      ["$999,999", "90%"].sort(),
    );
  });

  it("returns empty candidate list when the engine has no figures of that shape", () => {
    const warnings = findFigureDriftWarnings(
      "DSCR is 2.10x.",
      ["$50,000", "Year 1"],
    );
    const ratio = warnings.find((w) => w.founderValue === "2.10x");
    expect(ratio?.canonicalCandidates).toEqual([]);
  });
});
