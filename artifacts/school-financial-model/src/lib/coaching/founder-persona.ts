import type { UserResponse } from "@workspace/api-client-react";

// Founder persona types — see Task #302. The picker forces founders into one
// of these four buckets right after sign-in so the rest of the product can
// adapt language and surfaces accordingly.
export type FounderStage = "yet_to_launch" | "existing";
export type FounderComfort = "new_to_budgeting" | "comfortable";

export interface FounderPersona {
  stage: FounderStage | null;
  comfort: FounderComfort | null;
}

// Reads the founder persona from a UserResponse. Both fields are nullable
// because legacy users created before Task #302 will not have answered the
// picker yet — the dashboard prompts them on next sign-in.
export function getFounderPersona(user: UserResponse | null | undefined): FounderPersona {
  const stage = (user?.personaStage as FounderStage | undefined) ?? null;
  const comfort = (user?.personaComfort as FounderComfort | undefined) ?? null;
  return { stage, comfort };
}

// Convenience checks. We default to *showing* every surface when the persona
// is unknown so we never accidentally hide content from existing/legacy
// users; only an explicit `yet_to_launch` stage suppresses the
// actuals/QuickBooks/variance/forecast-accuracy affordances.
export function isYetToLaunch(user: UserResponse | null | undefined): boolean {
  return getFounderPersona(user).stage === "yet_to_launch";
}

// Task #302: a persona is only considered "complete" when *both* the stage
// and the comfort answers have been recorded. The picker writes them
// together, but if a partial-data record ever exists (e.g. an interrupted
// PATCH or future schema change) we still re-prompt the founder so we never
// fall back to the generic operator tone with stale state.
export function hasCompletePersona(user: UserResponse | null | undefined): boolean {
  const { stage, comfort } = getFounderPersona(user);
  return stage !== null && comfort !== null;
}

export function shouldShowActualsSurfaces(user: UserResponse | null | undefined): boolean {
  return !isYetToLaunch(user);
}

// Tone variants for copy that the picker affects.
export interface PersonaTone {
  greeting: (firstName: string) => string;
  emptyStateTitle: string;
  emptyStateBody: string;
  newModelCta: string;
}

export function getPersonaTone(user: UserResponse | null | undefined): PersonaTone {
  const { stage, comfort } = getFounderPersona(user);
  const newComfort = comfort === "new_to_budgeting";
  if (stage === "yet_to_launch") {
    return {
      greeting: (firstName: string) =>
        newComfort
          ? `Welcome, ${firstName} - let's plan your school together`
          : `Welcome, ${firstName}`,
      emptyStateTitle: newComfort
        ? "Let's plan your school in plain English"
        : "Let's build your opening-year plan",
      emptyStateBody: newComfort
        ? "We'll ask simple questions about your school and turn your answers into a budget. No spreadsheets or jargon required."
        : "Answer questions about your program, enrollment, and staffing - we'll assemble a 5-year projection you can take to a lender or board.",
      newModelCta: "Start planning",
    };
  }
  if (stage === "existing") {
    return {
      greeting: (firstName: string) =>
        newComfort
          ? `Welcome back, ${firstName} - let's keep your numbers steady`
          : `Welcome back, ${firstName}`,
      emptyStateTitle: newComfort
        ? "Let's get your school's numbers organized"
        : "Build your operating budget and forecast",
      emptyStateBody: newComfort
        ? "We'll walk you through it one section at a time. You can pull in last year's actuals when you're ready, but you don't have to start there."
        : "Bring in your prior-year numbers, run scenarios against your actuals, and produce a board-ready forecast.",
      newModelCta: "New model",
    };
  }
  return {
    greeting: (firstName: string) => `Welcome, ${firstName}`,
    emptyStateTitle: "Let's build your first financial model",
    emptyStateBody:
      "In about 30–45 minutes, you'll have a lender-ready 5-year projection. We'll walk you through it step by step.",
    newModelCta: "Start my model",
  };
}
