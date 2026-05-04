import { useOptionalAuth } from "@/lib/auth-context";

export type GuidanceLevel = "advanced" | "basics" | "extra";

/**
 * Single source of truth for the "show coach guidance" gate used across
 * the wizard, decision flow, launcher subtitles, and accounting-export
 * lesson surfaces. Centralising the rule (Task #499) means a future
 * guidance tier or rename only has to be updated here — every coach-gated
 * surface stays consistent.
 *
 * Falls back to "basics" when the user isn't loaded or no AuthProvider
 * is mounted (mirrors `useOptionalAuth`) so leaf components rendered in
 * isolation by unit tests keep working without the full provider stack.
 */
export function useShowCoach(): { guidanceLevel: GuidanceLevel; showCoach: boolean } {
  const user = useOptionalAuth()?.user ?? null;
  const guidanceLevel = (user?.guidanceLevel as GuidanceLevel) || "basics";
  return { guidanceLevel, showCoach: guidanceLevel !== "advanced" };
}
