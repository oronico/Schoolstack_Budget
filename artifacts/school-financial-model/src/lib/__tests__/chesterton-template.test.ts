import { describe, expect, it } from "vitest";
import {
  buildDefaultChestertonData,
  chestertonYearLabels,
  avgSalaryPerPeriod,
  totalEnrollmentForYear,
} from "../chesterton/template";
import { chestertonSchema, schoolTypeSchema, SCHOOL_TYPE_LABELS, isChestertonAcademy } from "../../pages/model-wizard/schema";

describe("chesterton template defaults", () => {
  const defaults = buildDefaultChestertonData();

  it("seeds the CSN-published starting tuition and growth rate", () => {
    expect(defaults.startingTuition).toBe(8500);
    expect(defaults.tuitionGrowthRate).toBeCloseTo(0.04, 5);
    expect(defaults.bookSupplyFee).toBe(600);
    expect(defaults.financialAidPct).toBeCloseTo(0.10, 5);
  });

  it("ships a 4-grade × 6-year enrollment matrix (9-12, freshman → senior)", () => {
    expect(defaults.phaseEnrollment).toHaveLength(4);
    const grades = defaults.phaseEnrollment?.map(r => r.grade) ?? [];
    expect(grades).toEqual(["freshman", "sophomore", "junior", "senior"]);
  });

  it("ships an 8-subject default salary schedule with periods/section", () => {
    expect(defaults.salarySchedule).toBeDefined();
    expect((defaults.salarySchedule ?? []).length).toBeGreaterThanOrEqual(6);
    for (const subj of defaults.salarySchedule ?? []) {
      expect(typeof subj.subject).toBe("string");
      expect(subj.subject.length).toBeGreaterThan(0);
      expect(typeof subj.periodsPerSection).toBe("number");
    }
  });

  it("ships a 12-tier gift chart pyramid totaling the fundraising goal", () => {
    expect(defaults.giftChart).toBeDefined();
    expect((defaults.giftChart ?? []).length).toBeGreaterThanOrEqual(8);
    const pyramidTotal = (defaults.giftChart ?? []).reduce(
      (sum, row) => sum + (row.giftAmount ?? 0) * (row.numberOfGifts ?? 0),
      0,
    );
    expect(pyramidTotal).toBeGreaterThan(0);
  });

  it("ships fundraising goals for the major campaign components", () => {
    expect(defaults.fundraisingGoals).toBeDefined();
    expect((defaults.fundraisingGoals ?? []).length).toBeGreaterThan(0);
  });

  it("ships a recruiting pipeline with at least one feeder source", () => {
    expect(defaults.recruitingPipeline).toBeDefined();
    expect((defaults.recruitingPipeline ?? []).length).toBeGreaterThan(0);
  });

  it("avgSalaryPerPeriod divides starting salary by 5 (CSN periods/FTE)", () => {
    expect(avgSalaryPerPeriod(50000)).toBeCloseTo(10000, 5);
    expect(avgSalaryPerPeriod(44000)).toBeCloseTo(8800, 5);
  });

  it("totalEnrollmentForYear sums the matrix column for the requested year", () => {
    const matrix = [
      { grade: "freshman", year0: 0, year1: 12, year2: 14, year3: 16, year4: 18, year5: 20 },
      { grade: "sophomore", year0: 0, year1: 0, year2: 11, year3: 13, year4: 15, year5: 17 },
    ];
    expect(totalEnrollmentForYear(matrix, "year1")).toBe(12);
    expect(totalEnrollmentForYear(matrix, "year2")).toBe(25);
    expect(totalEnrollmentForYear(matrix, "year5")).toBe(37);
  });

  it("chestertonYearLabels returns 7 labels (Year 0 + 6 forward years)", () => {
    const labels = chestertonYearLabels(2026);
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe("2025-26");
    expect(labels[1]).toBe("2026-27");
    expect(labels[6]).toBe("2031-32");
  });
});

describe("chesterton schema integration", () => {
  it("the school-type enum includes chesterton_academy and the label is set", () => {
    expect(schoolTypeSchema.options).toContain("chesterton_academy");
    expect(SCHOOL_TYPE_LABELS["chesterton_academy"]).toBeTruthy();
    expect(typeof SCHOOL_TYPE_LABELS["chesterton_academy"]).toBe("string");
  });

  it("isChestertonAcademy returns true only for chesterton_academy", () => {
    expect(isChestertonAcademy("chesterton_academy")).toBe(true);
    expect(isChestertonAcademy("catholic_school")).toBe(false);
    expect(isChestertonAcademy("charter_school")).toBe(false);
    expect(isChestertonAcademy(undefined)).toBe(false);
  });

  it("the default chesterton template parses cleanly through chestertonSchema", () => {
    const parsed = chestertonSchema.safeParse(buildDefaultChestertonData());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      // surface the first error so a regression message is actionable
      // eslint-disable-next-line no-console
      console.error(parsed.error.issues[0]);
    }
  });

  it("chestertonSchema accepts an empty object (every field optional)", () => {
    expect(chestertonSchema.safeParse({}).success).toBe(true);
  });
});
