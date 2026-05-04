import { describe, it, expect } from "vitest";
import { generateDefaultRevenueRows } from "./revenue-defaults";

describe("public per-pupil funding is charter-only", () => {
  it("does NOT seed state_local_perpupil for non-charter hybrid_mixed (e.g. private school with ESA)", () => {
    const rows = generateDefaultRevenueRows("hybrid_mixed", 5, undefined, {
      isCharter: false,
      perPupilMidpoint: 12000,
    });
    const ids = rows.map((r) => r.lineItem);
    expect(ids).not.toContain("State / Local Per-Pupil Revenue");
  });

  it("does NOT seed any public_funding category rows for non-charter hybrid_mixed", () => {
    const rows = generateDefaultRevenueRows("hybrid_mixed", 5, undefined, {
      isCharter: false,
      perPupilMidpoint: 12000,
    });
    const publicFundingRows = rows.filter((r) => r.category === "public_funding");
    expect(publicFundingRows).toEqual([]);
  });

  it("DOES seed state_local_perpupil for charter_public_funded with isCharter=true", () => {
    const rows = generateDefaultRevenueRows("charter_public_funded", 5, undefined, {
      isCharter: true,
      perPupilMidpoint: 12000,
    });
    const stateRow = rows.find((r) => r.lineItem === "State / Local Per-Pupil Revenue");
    expect(stateRow).toBeDefined();
    expect(stateRow?.amounts[0]).toBe(12000);
  });

  it("does NOT seed state_local_perpupil for tuition_based non-charter", () => {
    const rows = generateDefaultRevenueRows("tuition_based", 5, undefined, {
      isCharter: false,
    });
    const ids = rows.map((r) => r.lineItem);
    expect(ids).not.toContain("State / Local Per-Pupil Revenue");
  });
});
