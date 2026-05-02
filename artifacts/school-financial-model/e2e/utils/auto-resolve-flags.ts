import { detectUnusualAssumptions } from "../../../api-server/src/lib/assumption-flags";

// Task #451: replaces the per-persona hand-coded `flagResolutions` array in
// export-download-personas.spec.ts (and any future persona-coverage spec) with
// a single helper that runs the actual consultant engine over the persona
// payload and seeds a default explanation for every blocking flag it raises.
//
// Why this exists:
//   The export pipeline (lender / board / decision-comparison etc.) calls
//   checkUnresolvedFlags in api-server/src/routes/models.ts before producing
//   any artifact. That function blocks the export when any warning- or
//   critical-severity flag returned by the consultant lacks a non-empty
//   `reason`. Tests that drive the UI past the Export step therefore have to
//   pre-populate `assumptionFlagResponses` with a reason for every blocking
//   flag the persona triggers.
//
//   Hard-coding those reasons (the previous approach) means every change to
//   the consultant — a new warning rule, a renamed flagType / field, a new
//   persona shape — requires a manual fixture update. The preflight
//   assertion in seedPersonaModel catches the drift early, but updating the
//   fixture is still pure toil.
//
//   This helper imports `detectUnusualAssumptions` directly (it's the same
//   function `runConsultantEngine` calls under the hood — see
//   consultant-engine.ts line ~2938) and emits a `{flagType, field, reason}`
//   triple for every warning/critical flag, with a clearly-marked-as-test
//   reason string. Info-level flags are intentionally omitted because
//   checkUnresolvedFlags only blocks on warning + critical.
//
// Direct import vs HTTP wrapper:
//   The api-server library code has no DB or network side effects at import
//   time (it only pulls in workbook-helpers + a dynamic import of
//   consultant-engine, both pure compute). The e2e suite already imports
//   from `../../api-server/tests/sample-payloads` for its persona fixtures,
//   so cross-package relative imports are an established pattern here. A
//   direct import keeps the helper synchronous from the caller's point of
//   view (no extra round trip) and means the flag set is computed from
//   exactly the same code path the server will run a moment later when
//   /api/models/{id}/consultant is hit for the preflight check.

export interface AssumptionFlagResponse {
  flagType: string;
  field: string;
  reason: string;
}

const TEST_REASON =
  "Auto-resolved by e2e helper (autoResolveBlockingFlags) — explained for e2e coverage; not a real founder rationale.";

/**
 * Run the consultant engine's flag detector over a persona payload and emit
 * an `assumptionFlagResponses`-shaped array that explains every blocking
 * (warning- or critical-severity) flag with a clearly-marked-as-test reason.
 *
 * Info-level flags are omitted because the export pipeline does not block on
 * them (see checkUnresolvedFlags in api-server/src/routes/models.ts).
 *
 * The returned array is safe to fold into a model's `data.assumptionFlagResponses`
 * before POSTing to /api/models — the server-side preflight (and the spec's
 * own preflight assertion) will then see zero unresolved blocking flags.
 */
export async function autoResolveBlockingFlags(
  personaData: Record<string, unknown>,
): Promise<AssumptionFlagResponse[]> {
  const flags = await detectUnusualAssumptions(personaData);
  return flags
    .filter((f) => f.severity === "warning" || f.severity === "critical")
    .map((f) => ({
      flagType: f.flagType,
      field: f.field,
      reason: TEST_REASON,
    }));
}
