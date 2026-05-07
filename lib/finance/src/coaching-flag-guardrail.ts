// Task #686 — Risk-flag next-step guardrail.
//
// Every coach-voice flag (DiagnosticFinding, DecisionIssue, HealthSignal,
// AssumptionFlag, NudgeItem, LenderFlag) shipped to founders must include
// a concrete, coaching-toned `nextStep`. This module is the single source
// of truth for that contract.
//
// Behavior:
//   * `validateNextStep(value, context)` throws if the string is empty,
//     too short, contains banned credit-verdict vocabulary, or matches a
//     generic "do something vague" phrasing. Returns the trimmed string
//     when valid.
//   * `assertEveryNextStep(items, kind)` runs the validator across an
//     array of flag-shaped objects and throws on the first failure.
//   * `BANNED_NEXT_STEP_PATTERNS` and `WEAK_NEXT_STEP_PATTERNS` are
//     exported so tests can pin the contract.
//
// We deliberately apply this at engine boundaries (the place each
// engine returns its array) rather than per-emit-site so adding a new
// rule cannot accidentally bypass the check.

export const BANNED_NEXT_STEP_PATTERNS: readonly RegExp[] = [
  /\bapproved\b/i,
  /\bdeclined\b/i,
  /\bfailed\b/i,
  /\brejected\b/i,
  /\brejection\b/i,
  /\bineligible\b/i,
  /loan\s+approval/i,
  /\b(you|your|the)\s+(model|plan|application)\s+(passed|failed)\b/i,
];

// A non-exhaustive sweep for vague, non-actionable phrasings. The goal is
// to catch nextSteps that state a problem without naming a lever — e.g.
// "Review this." or "Look into staffing." A coach-voice nextStep names a
// specific Step, lever, or cadence the founder can act on right now.
export const WEAK_NEXT_STEP_PATTERNS: readonly RegExp[] = [
  /^\s*(review|look at|look into|investigate|consider|check|update|fix|address|examine|reconsider|rethink)\s+(this|that|it)\b/i,
  /^\s*(do something|figure (this|it) out|sort (this|it) out|tbd)\b/i,
  /^\s*review\s*\.?\s*$/i,
  /^\s*tbd\s*\.?\s*$/i,
];

const MIN_NEXT_STEP_CHARS = 24;

export class NextStepGuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextStepGuardrailError";
  }
}

export function validateNextStep(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new NextStepGuardrailError(
      `${context}: nextStep must be a string (got ${typeof value}).`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new NextStepGuardrailError(`${context}: nextStep is empty.`);
  }
  if (trimmed.length < MIN_NEXT_STEP_CHARS) {
    throw new NextStepGuardrailError(
      `${context}: nextStep is too short to be actionable ("${trimmed}"). ` +
        `Coach-voice next steps name a specific Step or lever.`,
    );
  }
  // Banned credit-verdict vocabulary is checked against the literal
  // (with `${...}` placeholders dropped — already-rendered strings rarely
  // contain them, but be defensive).
  const flat = trimmed.replace(/\$\{[^}]*\}/g, " ");
  for (const re of BANNED_NEXT_STEP_PATTERNS) {
    if (re.test(flat)) {
      throw new NextStepGuardrailError(
        `${context}: nextStep contains banned credit-verdict pattern ${re}: "${trimmed}"`,
      );
    }
  }
  for (const re of WEAK_NEXT_STEP_PATTERNS) {
    if (re.test(trimmed)) {
      throw new NextStepGuardrailError(
        `${context}: nextStep is too generic (matches ${re}): "${trimmed}". ` +
          `Name a Step, lever, or cadence the founder can act on right now.`,
      );
    }
  }
  return trimmed;
}

export function assertEveryNextStep<T extends { nextStep?: unknown }>(
  items: readonly T[],
  kind: string,
): readonly T[] {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id =
      (item as Record<string, unknown>).id ??
      (item as Record<string, unknown>).flagType ??
      (item as Record<string, unknown>).dimension ??
      (item as Record<string, unknown>).label ??
      String(i);
    validateNextStep(item.nextStep, `${kind}[${String(id)}]`);
  }
  return items;
}
