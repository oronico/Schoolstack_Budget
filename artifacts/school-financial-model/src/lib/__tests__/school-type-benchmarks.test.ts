import { describe, it, expect } from "vitest";
import {
  FACILITY_BENCHMARKS,
  STAFFING_BENCHMARKS,
  ENROLLMENT_BENCHMARKS,
  facilityBenchmarkFor,
  staffingBenchmarkFor,
  enrollmentBenchmarkFor,
} from "@/lib/school-type-benchmarks";

const FIRST_CLASS_TYPES = [
  "catholic_school",
  "chesterton_academy",
  "microschool",
  "learning_pod",
  "private_school",
  "charter_school",
  "homeschool_coop",
  "tutoring_center",
  "other",
] as const;

describe("school-type-benchmarks (Task #454 first-class personas)", () => {
  for (const t of FIRST_CLASS_TYPES) {
    it(`${t} has its own facility, staffing, and enrollment benchmark entries`, () => {
      expect(FACILITY_BENCHMARKS[t]).toBeTruthy();
      expect(STAFFING_BENCHMARKS[t]).toBeTruthy();
      expect(ENROLLMENT_BENCHMARKS[t]).toBeTruthy();
    });
  }

  it("learning_pod facility, staffing, and enrollment text are distinct from microschool", () => {
    expect(FACILITY_BENCHMARKS.learning_pod.monthly).not.toBe(FACILITY_BENCHMARKS.microschool.monthly);
    expect(STAFFING_BENCHMARKS.learning_pod.ratio).not.toBe(STAFFING_BENCHMARKS.microschool.ratio);
    expect(STAFFING_BENCHMARKS.learning_pod.staff).not.toBe(STAFFING_BENCHMARKS.microschool.staff);
    expect(ENROLLMENT_BENCHMARKS.learning_pod.label).not.toBe(ENROLLMENT_BENCHMARKS.microschool.label);
    expect(ENROLLMENT_BENCHMARKS.learning_pod.detail).not.toBe(ENROLLMENT_BENCHMARKS.microschool.detail);
  });

  it("tutoring_center facility, staffing, and enrollment text are distinct from microschool", () => {
    expect(FACILITY_BENCHMARKS.tutoring_center.monthly).not.toBe(FACILITY_BENCHMARKS.microschool.monthly);
    expect(STAFFING_BENCHMARKS.tutoring_center.ratio).not.toBe(STAFFING_BENCHMARKS.microschool.ratio);
    expect(STAFFING_BENCHMARKS.tutoring_center.staff).not.toBe(STAFFING_BENCHMARKS.microschool.staff);
    expect(ENROLLMENT_BENCHMARKS.tutoring_center.label).not.toBe(ENROLLMENT_BENCHMARKS.microschool.label);
    expect(ENROLLMENT_BENCHMARKS.tutoring_center.detail).not.toBe(ENROLLMENT_BENCHMARKS.microschool.detail);
  });

  it("learning_pod and tutoring_center enrollment copy do not group them with microschool", () => {
    // The pre-#454 EnrollmentStep used the literal phrase "Microschool/pod"
    // as the bullet label for both microschool and learning_pod. That
    // string must not appear in either persona's copy after the refactor.
    expect(ENROLLMENT_BENCHMARKS.learning_pod.label).not.toMatch(/microschool\/pod/i);
    expect(ENROLLMENT_BENCHMARKS.tutoring_center.label).not.toMatch(/microschool\/pod/i);
  });

  it("convenience lookups round-trip", () => {
    expect(facilityBenchmarkFor("learning_pod")).toBe(FACILITY_BENCHMARKS.learning_pod.monthly);
    expect(staffingBenchmarkFor("tutoring_center")).toEqual(STAFFING_BENCHMARKS.tutoring_center);
    expect(enrollmentBenchmarkFor("learning_pod")).toEqual(ENROLLMENT_BENCHMARKS.learning_pod);
    expect(facilityBenchmarkFor(undefined)).toBeNull();
    expect(staffingBenchmarkFor("not_a_real_type")).toBeNull();
    expect(enrollmentBenchmarkFor("not_a_real_type")).toBeNull();
  });

  // Frozen exact-string assertions for the two new first-class personas so
  // any benchmark drift fails CI loudly. If someone deliberately re-tunes
  // the numbers, they update this test in the same diff and the change is
  // visible in code review — exactly the regression-proofing the reviewer
  // asked for.
  it("freezes learning_pod benchmark copy", () => {
    expect(FACILITY_BENCHMARKS.learning_pod).toEqual({
      monthly: "$0–$1,500/mo (often shared / donated)",
    });
    expect(STAFFING_BENCHMARKS.learning_pod).toEqual({
      ratio: "1:5–1:8",
      staff: "1 facilitator + 1 part-time enrichment for 8–15 students",
    });
    expect(ENROLLMENT_BENCHMARKS.learning_pod).toEqual({
      label: "Learning pod: Premium small cohorts (≤15) need premium per-student revenue",
      detail:
        "Pods cap enrollment by design — usually 8–15 students with one facilitator. With a small base, tuition (and any ESA / micro-grant pass-through) needs to fully fund staffing and shared space.",
    });
  });

  it("freezes tutoring_center benchmark copy", () => {
    expect(FACILITY_BENCHMARKS.tutoring_center).toEqual({
      monthly: "$1,800–$5,000/mo (storefront)",
    });
    expect(STAFFING_BENCHMARKS.tutoring_center).toEqual({
      ratio: "1:1–1:6",
      staff: "1 director + 2–6 contract tutors for 20–60 students",
    });
    expect(ENROLLMENT_BENCHMARKS.tutoring_center).toEqual({
      label: "Tutoring center: Sessions-per-week, not seats, drives revenue",
      detail:
        "Storefront tutoring scales by booked session-hours across 20–60 active students. Track session utilization (1:1 to 1:6) instead of seat count to size enrollment realistically.",
    });
  });
});
