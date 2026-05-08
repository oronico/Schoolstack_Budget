import { useOptionalAuth } from "@/lib/auth-context";

export type GuidanceLevel = "advanced" | "basics" | "extra";

/**
 * Single source of truth for the "show coach guidance" gate used across
 * the wizard, decision flow, launcher subtitles, and accounting-export
 * lesson surfaces. Centralising the rule (Task #499) means a future
 * guidance tier or rename only has to be updated here — every coach-gated
 * surface stays consistent.
 *
 * Falls back to "extra" when the user isn't loaded or no AuthProvider
 * is mounted (mirrors `useOptionalAuth`). Task #702 changed this default
 * from "basics" → "extra" so first-run founders land in Guided Builder
 * at full depth, matching the brief. `showCoach` is unaffected because
 * both "basics" and "extra" enable coaching.
 */
export function useShowCoach(): { guidanceLevel: GuidanceLevel; showCoach: boolean } {
  const user = useOptionalAuth()?.user ?? null;
  const guidanceLevel = (user?.guidanceLevel as GuidanceLevel) || "extra";
  return { guidanceLevel, showCoach: guidanceLevel !== "advanced" };
}
