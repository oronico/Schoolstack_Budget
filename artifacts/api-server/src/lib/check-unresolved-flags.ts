import type { AssumptionFlag } from "./assumption-flags";

/**
 * Server-side gate that decides whether an export route should respond
 * with 422 instead of producing a packet. Extracted from models.ts so
 * it can be unit-tested directly.
 *
 * DATA MODEL: Assumption flags use a dual-source architecture:
 *   - `assumptionFlags` (computed): Engine-generated flags with field, flagType, severity,
 *     currentValue, benchmark, defaultPrompt. Recomputed on each consultant run.
 *   - `assumptionFlagResponses` (user input): User-provided reasons keyed by flagType:field.
 *     Stored separately since flags are recomputed but reasons persist.
 *
 * POLICY:
 *   - HARD-BLOCKING flag types (Task #860): structural data inconsistencies
 *     that *cannot* be cleared by an explanation reason. The founder must
 *     fix the underlying inputs so the engine stops emitting the flag.
 *     Currently: `funding_mix_inconsistent` (per-student ESA / voucher
 *     amounts exceed per-student tuition).
 *   - Otherwise warning + critical flags block until the founder supplies
 *     a non-empty reason via assumptionFlagResponses.
 *   - Info-level flags never block.
 *
 * This policy is enforced identically client-side in
 * `model-wizard/index.tsx` step 9.
 */
export const HARD_BLOCK_FLAG_TYPES = new Set<string>([
  "funding_mix_inconsistent",
  // Task #860 EXPANDED — legacy v1 models that haven't yet been
  // migrated to the funding-mix v2 stamp. The founder must open the
  // wizard once so the migration runs and the changelog entry is
  // recorded. An explanation reason can never clear this — only
  // re-saving the model bumps `revenueModelVersion` to 2.
  "funding_mix_unmigrated",
]);

export function checkUnresolvedFlags(
  flags: AssumptionFlag[],
  responses: Array<{ field: string; flagType: string; reason?: string }>,
): { blocked: boolean; message: string } {
  const responseMap = new Map<string, string>();
  for (const r of responses) {
    responseMap.set(`${r.flagType}:${r.field}`, r.reason || "");
  }

  const hardBlocked = flags.filter((f) => HARD_BLOCK_FLAG_TYPES.has(f.flagType));
  if (hardBlocked.length > 0) {
    return {
      blocked: true,
      message:
        `Export blocked: ${hardBlocked.length} structural inconsistency in your inputs ` +
        `must be fixed before exporting (e.g. per-student ESA / voucher / scholarship ` +
        `amounts that exceed per-student tuition). An explanation cannot resolve this — ` +
        `update the affected revenue rows so the engine stops flagging the model.`,
    };
  }

  const unresolved = flags.filter(
    (f) =>
      (f.severity === "critical" || f.severity === "warning") &&
      !responseMap.get(`${f.flagType}:${f.field}`)?.trim(),
  );
  if (unresolved.length === 0) return { blocked: false, message: "" };
  return {
    blocked: true,
    message: `Export blocked: ${unresolved.length} flagged assumption(s) require an explanation before exporting. Lenders should never see unexplained anomalies.`,
  };
}
