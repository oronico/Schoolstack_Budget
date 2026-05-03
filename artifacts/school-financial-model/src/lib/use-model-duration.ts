import { useFormContext } from "react-hook-form";
import { getModelDuration, type ModelDuration } from "@/pages/model-wizard/schema";

/**
 * RHF-aware reader for the wizard's modelDuration toggle.
 *
 * Returns the current duration ("single_year" | "five_year") plus a boolean
 * convenience for the common single-year branch. Defaults to "five_year"
 * for any partial / legacy data so existing models keep their behaviour.
 *
 * Must be called from inside a <FormProvider>; throws otherwise (the same
 * contract every other wizard hook here follows).
 */
export function useModelDuration(): { duration: ModelDuration; isSingleYear: boolean } {
  const { watch } = useFormContext();
  const value = watch("schoolProfile.modelDuration") as string | undefined;
  const duration = getModelDuration({ schoolProfile: { modelDuration: value } });
  return { duration, isSingleYear: duration === "single_year" };
}

/**
 * Returns the effective number of forecast years to render in the wizard
 * UI. Single-year mode collapses every multi-year input grid to a single
 * Year 1 column; five-year keeps the full 5-column layout.
 *
 * The underlying schema is always 5 wide — this only governs *visible*
 * columns and the loop bounds the steps use to render them. Backfill of
 * Y2-Y5 happens via `seedExtendedEnrollment` when the founder extends.
 */
export function useYearCount(): number {
  return useModelDuration().isSingleYear ? 1 : 5;
}

/**
 * Pure helper used by the Extend-to-5-year flow.
 *
 * If the founder built their single-year budget without ever touching the
 * Y2-Y5 enrollment fields, those fields will be 0 / undefined when they
 * extend. Lender + board packets need *something* in years 2-5, so we apply
 * a deterministic ramp (1.15x / 1.30x / 1.40x / 1.50x of Y1) — the same
 * defaults the legacy `buildPrefillData` flow has always used.
 *
 * Idempotent: if Y2-Y5 already have non-zero values, they are preserved
 * (founder may have already entered them). Pure: returns a new object,
 * does not mutate the input.
 */
export interface EnrollmentLike {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

export function seedExtendedEnrollment(enrollment: EnrollmentLike | undefined): EnrollmentLike {
  const y1 = enrollment?.year1 ?? 0;
  const ramp = [1, 1.15, 1.3, 1.4, 1.5];
  const result: EnrollmentLike = { ...enrollment };
  const keys: (keyof EnrollmentLike)[] = ["year1", "year2", "year3", "year4", "year5"];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const existing = result[key] ?? 0;
    if (i === 0) {
      result[key] = existing;
    } else if (!existing || existing <= 0) {
      result[key] = y1 > 0 ? Math.round(y1 * ramp[i]) : 0;
    }
  }
  return result;
}
