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
