import { describe, it, expect } from "vitest";
import { seedExtendedEnrollment } from "./use-model-duration";

describe("seedExtendedEnrollment", () => {
  it("preserves Y1 exactly when extending", () => {
    const out = seedExtendedEnrollment({ year1: 73 });
    expect(out.year1).toBe(73);
  });

  it("seeds Y2-Y5 from a Y1 ramp when missing", () => {
    const out = seedExtendedEnrollment({ year1: 100 });
    expect(out.year2).toBe(115);
    expect(out.year3).toBe(130);
    expect(out.year4).toBe(140);
    expect(out.year5).toBe(150);
  });

  it("preserves any non-zero Y2-Y5 the founder already entered", () => {
    const out = seedExtendedEnrollment({ year1: 100, year2: 200, year4: 400 });
    expect(out.year2).toBe(200);
    expect(out.year3).toBe(130);
    expect(out.year4).toBe(400);
    expect(out.year5).toBe(150);
  });

  it("emits zeros when there is no Y1 to ramp from", () => {
    const out = seedExtendedEnrollment({});
    expect(out).toEqual({ year1: 0, year2: 0, year3: 0, year4: 0, year5: 0 });
  });

  it("is idempotent: a second pass with the same input produces the same output", () => {
    const a = seedExtendedEnrollment({ year1: 80 });
    const b = seedExtendedEnrollment(a);
    expect(b).toEqual(a);
  });

  it("does not mutate the caller's input object", () => {
    const input = { year1: 50 };
    const before = { ...input };
    seedExtendedEnrollment(input);
    expect(input).toEqual(before);
  });

  it("treats undefined enrollment as empty", () => {
    const out = seedExtendedEnrollment(undefined);
    expect(out.year1).toBe(0);
    expect(out.year5).toBe(0);
  });
});
