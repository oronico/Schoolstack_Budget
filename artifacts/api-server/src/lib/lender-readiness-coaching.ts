/**
 * Coaching headlines for the `lenderReadiness` verdict.
 *
 * Task #742 — the engine still emits the raw verdict words ("Strong",
 * "Needs Work", "Not Yet Ready") on `ConsultantOutput.lenderReadiness`,
 * but the in-app Consultant view (and now the lender-conversation Excel
 * and the loan-readiness PDF exports) must surface the same coaching
 * phrasing the founder sees on screen — not the bare enum value.
 *
 * Keep this list in sync with
 * `artifacts/school-financial-model/src/components/consultant/ConsultantAnalysisView.tsx`.
 */

export type LenderReadinessVerdict = "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";

export const LENDER_READINESS_COACHING_HEADLINES: Record<LenderReadinessVerdict, string> = {
  Strong: "Ready to share — keep polishing the narrative.",
  // Task #929 — "Almost There" is the cap tier applied when 25–50% of
  // assumptions are tagged with evidence. It sits between "Needs Work"
  // and "Strong" so a model with healthy headline metrics but mid-range
  // evidence coverage doesn't read as fully ready.
  "Almost There": "Almost there — anchor a few more assumptions to evidence and this is ready to share.",
  "Needs Work": "Almost there — a few targeted edits will tighten the story.",
  "Not Yet Ready": "Worth another pass before you send it out.",
};

export function lenderReadinessCoachingHeadline(verdict: string | undefined | null): string {
  if (!verdict) return "";
  if (verdict in LENDER_READINESS_COACHING_HEADLINES) {
    return LENDER_READINESS_COACHING_HEADLINES[verdict as LenderReadinessVerdict];
  }
  // Unknown / future verdict values fall back to the coaching framing
  // rather than leaking an unfamiliar raw label.
  return "Worth another pass before you send it out.";
}
