// Task #454: single source of truth for the per-school-type benchmark
// strings shown in the wizard. Previously each step (SchoolProfileStep,
// StaffingStep, etc.) held its own hard-coded `Record<string, ...>` of
// benchmarks, which meant tutoring centers and learning pods quietly
// inherited microschool defaults whenever a step was updated without
// touching the others. Centralising them here forces every UI surface
// to share the same numbers and forces a deliberate update when a new
// school type is added.
//
// Numbers reflect the latest founder-research pass for each shape:
//
//   * tutoring_center — fee-per-session storefront with contract tutors
//     and lean facility (often a single suite + waiting room). Staff
//     ratios are tighter than a microschool because most sessions are
//     1:1 to 1:6, and rent runs higher per-student than a homeschool
//     co-op because the storefront model needs front-of-house presence.
//
//   * learning_pod — premium small-cohort model (≤15 students), often
//     in donated / home / micro-leased space, with a single full-time
//     facilitator and part-time enrichment support. Per-student revenue
//     needs to be high to cover staffing on a small base.

export interface FacilityBenchmark {
  /** Display string used by SchoolProfileStep facility cards. */
  monthly: string;
}

export interface StaffingBenchmark {
  /** Adult-to-student ratio range (display-only). */
  ratio: string;
  /** Plain-English staff sizing guidance. */
  staff: string;
}

export const FACILITY_BENCHMARKS: Record<string, FacilityBenchmark> = {
  catholic_school:   { monthly: "$5,000–$15,000/mo" },
  chesterton_academy:{ monthly: "$3,000–$12,000/mo" },
  microschool:       { monthly: "$1,500–$4,000/mo" },
  learning_pod:      { monthly: "$0–$1,500/mo (often shared / donated)" },
  private_school:    { monthly: "$5,000–$15,000/mo" },
  charter_school:    { monthly: "$8,000–$25,000/mo" },
  homeschool_coop:   { monthly: "$500–$2,000/mo" },
  tutoring_center:   { monthly: "$1,800–$5,000/mo (storefront)" },
  other:             { monthly: "$2,000–$8,000/mo" },
};

export const STAFFING_BENCHMARKS: Record<string, StaffingBenchmark> = {
  catholic_school:   { ratio: "1:12–1:18", staff: "6–12 staff for 80–150 students" },
  chesterton_academy:{ ratio: "1:12–1:16", staff: "5–10 staff for 60–120 students" },
  microschool:       { ratio: "1:8–1:12",  staff: "2–4 staff for 15–25 students" },
  private_school:    { ratio: "1:10–1:15", staff: "5–10 staff for 50–100 students" },
  charter_school:    { ratio: "1:15–1:20", staff: "8–15 staff for 100–200 students" },
  learning_pod:      { ratio: "1:5–1:8",   staff: "1 facilitator + 1 part-time enrichment for 8–15 students" },
  homeschool_coop:   { ratio: "1:8–1:15",  staff: "1–3 staff for 10–30 students" },
  tutoring_center:   { ratio: "1:1–1:6",   staff: "1 director + 2–6 contract tutors for 20–60 students" },
  other:             { ratio: "1:10–1:15", staff: "varies by model" },
};

/** Convenience lookup that returns the facility-monthly string or null. */
export function facilityBenchmarkFor(schoolType?: string): string | null {
  if (!schoolType) return null;
  return FACILITY_BENCHMARKS[schoolType]?.monthly ?? null;
}

/** Convenience lookup that returns the staffing benchmark or null. */
export function staffingBenchmarkFor(schoolType?: string): StaffingBenchmark | null {
  if (!schoolType) return null;
  return STAFFING_BENCHMARKS[schoolType] ?? null;
}

export interface EnrollmentBenchmark {
  /** Short, scannable headline shown as the bullet label. */
  label: string;
  /** Sentence-length detail under the label. */
  detail: string;
}

// Per-school-type enrollment guidance shown on the Enrollment step.
// Tutoring centers and learning pods are *first-class* — they each have
// distinct copy that does not piggyback on microschool. (Pre-#454 the
// EnrollmentStep grouped microschool + learning_pod under one branch and
// tutoring_center had no entry at all, so any future numerical change had
// to be made in 3+ files.)
export const ENROLLMENT_BENCHMARKS: Record<string, EnrollmentBenchmark> = {
  charter_school: {
    label: "Charter benchmark: 100+ students by Year 2 for financial viability",
    detail: "Per-pupil funding models typically need 100+ students to cover fixed costs. Plan your enrollment ramp accordingly.",
  },
  private_school: {
    label: "Private school: Tuition revenue is your primary driver",
    detail: "Aim for tuition to cover at least 60% of operating costs. Enrollment directly determines your financial health.",
  },
  catholic_school: {
    label: "Catholic / parish school: Parish + diocesan ties drive your enrollment funnel",
    detail: "Plan for tuition + parish subsidy + scholarship aid. Aim for tuition to cover 50–70% of operating costs once enrolled families' aid is layered in.",
  },
  chesterton_academy: {
    label: "Chesterton Academy: Cohort sizing is fixed by classical-program design",
    detail: "Aim for 12–16 students per grade per cohort. Enrollment growth comes from adding grades or sections, not over-loading existing cohorts.",
  },
  microschool: {
    label: "Microschool: Small cohorts mean each student matters more",
    detail: "With fewer students, per-student revenue needs to be higher. Make sure your tuition rates account for the smaller scale.",
  },
  learning_pod: {
    label: "Learning pod: Premium small cohorts (≤15) need premium per-student revenue",
    detail: "Pods cap enrollment by design - usually 8–15 students with one facilitator. With a small base, tuition (and any ESA / micro-grant pass-through) needs to fully fund staffing and shared space.",
  },
  homeschool_coop: {
    label: "Homeschool co-op: Member families share cost, so per-family fees stay low",
    detail: "Plan for 10–30 families paying modest membership/class fees. Enrollment grows through word-of-mouth and parent-led recruiting rather than marketing spend.",
  },
  tutoring_center: {
    label: "Tutoring center: Sessions-per-week, not seats, drives revenue",
    detail: "Storefront tutoring scales by booked session-hours across 20–60 active students. Track session utilization (1:1 to 1:6) instead of seat count to size enrollment realistically.",
  },
  other: {
    label: "Custom model: Anchor enrollment to a specific funding mechanism",
    detail: "If your model doesn't match a standard category, write down what each enrolled student is worth in dollars, and use that to back into a viable enrollment target.",
  },
};

/** Convenience lookup that returns the enrollment benchmark or null. */
export function enrollmentBenchmarkFor(schoolType?: string): EnrollmentBenchmark | null {
  if (!schoolType) return null;
  return ENROLLMENT_BENCHMARKS[schoolType] ?? null;
}
