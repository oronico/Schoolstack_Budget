/**
 * Coaching headlines for the `lenderReadiness` verdict — web-side mirror of
 * `artifacts/api-server/src/lib/lender-readiness-coaching.ts`.
 *
 * Task #753 — Task #751 swapped the bare verdict words ("Strong" / "Needs
 * Work" / "Not Yet Ready") for full coaching headlines on every export
 * surface (lender packet PDF, lender summary PDF, founder summary, narrative
 * commentary, and the review-feedback email). The on-screen readiness
 * widgets in the wizard / dashboard / share / admin / packet-preview were
 * still showing the bare verdict word, so a founder would see one phrasing
 * in the app and a different (longer, friendlier) one in the PDF or email
 * they shared. Re-using the same coaching helper closes that gap end to
 * end.
 *
 * Keep this file in sync with the api-server copy referenced above and
 * with the headline strings hard-coded in
 * `components/consultant/ConsultantAnalysisView.tsx` (Section 7).
 */

export type LenderReadinessVerdict = "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";

export const LENDER_READINESS_COACHING_HEADLINES: Record<LenderReadinessVerdict, string> = {
  Strong: "Ready to share — keep polishing the narrative.",
  // Task #929 — "Almost There" is the cap tier applied when 25–50% of
  // assumptions are tagged with evidence (between "Needs Work" and
  // "Strong"). Keep this list in sync with the api-server copy.
  "Almost There": "Almost there — anchor a few more assumptions to evidence and this is ready to share.",
  "Needs Work": "Almost there — a few targeted edits will tighten the story.",
  "Not Yet Ready": "Worth another pass before you send it out.",
};

/**
 * Task #929 — Render the confidence-gated cap callout from a
 * structured `lenderReadinessResult`. Mirrors the api-server
 * `formatCapCallout` helper so the in-app card matches the
 * already-rendered `callout` string the API ships. Falls back to
 * the pre-rendered string when present (preferred path); recomputes
 * locally only if the API hasn't shipped it (cached older response).
 */
export interface LenderReadinessResultLike {
  uncappedRating?: string;
  effectiveRating?: string;
  cap?: {
    applied?: boolean;
    reason?: string;
    pendingEvidenceCount?: number;
    totalAssumptionCount?: number;
  };
  callout?: string;
}

export function formatLenderReadinessCallout(
  result: LenderReadinessResultLike | null | undefined,
): string {
  if (!result || !result.cap?.applied) return "";
  if (result.callout && result.callout.length > 0) return result.callout;
  // Local fallback for legacy cached payloads — keep wording in sync with
  // api-server `formatCapCallout`.
  const eff = result.effectiveRating ?? "";
  const pending = result.cap.pendingEvidenceCount ?? 0;
  const total = result.cap.totalAssumptionCount ?? 0;
  const reason = result.cap.reason ?? "";
  return `Rating capped at ${eff} pending evidence tagging on ${pending} of ${total} assumptions. ${reason}`.trim();
}

export function lenderReadinessCoachingHeadline(verdict: string | undefined | null): string {
  if (!verdict) return "";
  if (verdict in LENDER_READINESS_COACHING_HEADLINES) {
    return LENDER_READINESS_COACHING_HEADLINES[verdict as LenderReadinessVerdict];
  }
  // Unknown / future verdict values fall back to the coaching framing
  // rather than leaking an unfamiliar raw label.
  return "Worth another pass before you send it out.";
}
