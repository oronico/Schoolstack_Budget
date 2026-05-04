// Single source of truth for the set of valid decision types.
//
// Both the planner's Zod wizard schema (`decisionTypeSchema` in
// `artifacts/school-financial-model/src/pages/model-wizard/schema.ts`) and the
// shared bullet/label logic in `@workspace/finance` derive from this tuple.
// Adding a fourth decision type here automatically propagates to both
// surfaces (or fails to compile), so the schema validation and the
// decision-history rendering can never silently fall out of sync.
export const DECISION_TYPES = [
  "add_program",
  "evaluate_site",
  "change_enrollment",
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

// Single source of truth for the set of valid decision outcome statuses.
//
// Both the planner's Zod wizard schema (`outcomeStatusSchema` in
// `artifacts/school-financial-model/src/pages/model-wizard/schema.ts`) and the
// shared label / type-guard logic in `@workspace/finance` derive from this
// tuple, mirroring the `DECISION_TYPES` pattern above. Adding a fourth
// outcome status means editing exactly one tuple — the schema validation,
// the type guard, the label map, and the UI option list all stay in sync
// automatically (or fail to compile).
export const DECISION_OUTCOME_STATUSES = [
  "pursued",
  "declined",
  "on_hold",
] as const;

export type DecisionOutcomeStatus = (typeof DECISION_OUTCOME_STATUSES)[number];
