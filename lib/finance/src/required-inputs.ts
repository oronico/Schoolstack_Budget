/**
 * Task #928 (4.4) — Required-input gates that block packet generation.
 *
 * A model can technically run with a missing Tuition Collection Rate
 * (the engine silently defaults to 100%), but the resulting packet
 * shows "Tuition collection rate: Not entered" in the appendix and the
 * lender / board reader has no way to tell whether the founder *chose*
 * 100% or just skipped the field. We refuse to ship a packet until the
 * field is set so the appendix never carries the silent default.
 *
 * Out of scope for this task: changing the engine's collection-rate math
 * or applying the gate outside of tuition-based / hybrid models.
 */
import type { FullModelData, RevenueRowLike } from "./decision-engine/model-shape.js";

export type RequiredInputCode = "tuition_collection_rate_missing";

export interface MissingRequiredInput {
  code: RequiredInputCode;
  /** Founder-facing label for the missing field. */
  label: string;
  /** Dot-path of the field that needs to be filled in. Used by the
   *  wizard to deep-link the founder to the right step / row. */
  field: string;
  /** Wizard step title the field lives on. */
  step: string;
  /** Founder-facing reason the packet was blocked. */
  message: string;
}

function isTuitionRevenueRow(r: RevenueRowLike): boolean {
  return r.enabled !== false && r.category === "tuition_and_fees";
}

/**
 * Returns the list of required inputs missing on the model. An empty
 * list means the model is ready for packet generation.
 */
export function findMissingRequiredInputs(data: FullModelData): MissingRequiredInput[] {
  const out: MissingRequiredInput[] = [];

  const sp = (data.schoolProfile || {}) as Record<string, unknown>;
  const fundingProfile = sp.fundingProfile as string | undefined;
  const requiresTuitionCollection =
    fundingProfile === "tuition_based" || fundingProfile === "hybrid_mixed";

  if (requiresTuitionCollection) {
    const rows = data.revenueRows || [];
    const tuitionRows = rows.filter(isTuitionRevenueRow);
    // Block when any enabled tuition row has not had its collection rate set.
    const missingRow = tuitionRows.find(
      (r) => r.collectionRate === undefined || r.collectionRate === null,
    );
    if (tuitionRows.length > 0 && missingRow) {
      out.push({
        code: "tuition_collection_rate_missing",
        label: "Tuition Collection Rate",
        field: `revenueRows[${missingRow.id}].collectionRate`,
        step: "Revenue",
        message:
          "Set the Tuition Collection Rate on the Revenue step before exporting. " +
          "Typical ranges: 95–100% for autopay, 88–95% for invoice-based billing. " +
          "Lenders read a blank field as a silent default — fill it in so your " +
          "appendix shows the assumption you actually intend to underwrite.",
      });
    }
  }

  return out;
}

/**
 * Wrap `findMissingRequiredInputs` for the export-route gate shape used
 * by `checkUnresolvedFlags`. Returns blocked + a single combined message
 * the route can return as a 422 body.
 */
export function checkRequiredInputs(
  data: FullModelData,
): { blocked: false } | { blocked: true; code: RequiredInputCode; message: string; missing: MissingRequiredInput[] } {
  const missing = findMissingRequiredInputs(data);
  if (missing.length === 0) return { blocked: false };
  const first = missing[0];
  return {
    blocked: true,
    code: first.code,
    message: first.message,
    missing,
  };
}
