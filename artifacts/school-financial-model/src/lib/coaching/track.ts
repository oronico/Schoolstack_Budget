import { customFetch } from "@workspace/api-client-react";

type CoachingEvent =
  | "guidance_mode_prompt_shown"
  | "guidance_mode_selected"
  | "guidance_mode_changed"
  | "explainer_opened"
  | "explainer_collapsed"
  | "explainer_dismissed"
  | "kpi_formula_opened"
  | "kpi_formula_closed"
  | "wizard_section_completed"
  | "analysis_view_opened"
  | "diagnostic_panel_shown"
  | "diagnostic_action_clicked"
  | "micro_lesson_shown"
  | "micro_lesson_dismissed"
  | "primer_card_viewed"
  | "primer_completed"
  | "primer_skipped"
  | "primer_opened"
  | "help_menu_opened"
  | "quick_lever_viewed"
  | "quick_levers_shown"
  | "wizard_prep_completed";

export function trackCoachingEvent(
  event: CoachingEvent,
  metadata?: Record<string, unknown>
): void {
  customFetch("/api/auth/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata: metadata ?? {} }),
  }).catch(() => {});
}
