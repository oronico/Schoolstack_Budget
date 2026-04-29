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
  | "wizard_prep_completed"
  | "decision_flow_diagnostic_shown"
  | "decision_why_explainer_shown"
  | "impact_kpi_nudge_shown"
  | "save_action_apply_reminder_shown"
  | "accounting_card_glossary_opened"
  | "accounting_mapping_explainer_shown"
  | "dropped_mappings_coach_shown"
  | "reuse_mapping_nudge_shown"
  | "actuals_variance_nudge_shown"
  | "actuals_editor_explainer_shown"
  | "actuals_coach_intro_shown"
  | "accounting_export_lesson_shown"
  | "accounting_export_post_upload_coach_shown"
  | "accounting_mapping_coach_shown"
  | "accounting_reuse_prompt_coach_shown"
  | "dashboard_launcher_coach_shown"
  | "things_changed_coach_shown"
  | "launcher_subtitle_shown"
  | "stale_banner_coach_shown"
  | "whatif_link_clicked"
  | "mapping_heuristic_suggested"
  | "mapping_heuristic_accepted"
  | "bookkeeping_sidebar_shown"
  | "budget_to_books_lesson_shown";

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
