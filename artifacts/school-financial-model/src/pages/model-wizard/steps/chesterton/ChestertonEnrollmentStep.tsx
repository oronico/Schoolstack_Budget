import { useEffect, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { GraduationCap, Users } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import {
  CHESTERTON_GRADES,
  buildDefaultChestertonData,
  totalEnrollmentForYear,
  chestertonYearLabels,
} from "@/lib/chesterton/template";
import type { ChestertonGradeRow } from "../../schema";

const YEAR_KEYS: Array<keyof Omit<ChestertonGradeRow, "grade">> = [
  "year0", "year1", "year2", "year3", "year4", "year5",
];

export function ChestertonEnrollmentStep() {
  const { watch, setValue } = useFormContext();
  // Task #416 / #499: shared coach-gate hook keeps every wizard step in sync.
  const { showCoach } = useShowCoach();
  const planningYear = (watch("chesterton.planningYear") as number | undefined) ?? new Date().getFullYear() + 1;
  const phaseEnrollment = watch("chesterton.phaseEnrollment") as ChestertonGradeRow[] | undefined;

  // Seed defaults the first time the founder lands on the step.
  useEffect(() => {
    if (!phaseEnrollment || phaseEnrollment.length < 4) {
      const defaults = buildDefaultChestertonData();
      setValue("chesterton.phaseEnrollment", defaults.phaseEnrollment, { shouldDirty: true });
      setValue("chesterton.classesPerGrade", defaults.classesPerGrade, { shouldDirty: true });
    }
  }, [phaseEnrollment, setValue]);

  const yearLabels = useMemo(() => chestertonYearLabels(planningYear).slice(1), [planningYear]); // drop "year -1"
  const totals = useMemo(
    () => YEAR_KEYS.map(key => totalEnrollmentForYear(phaseEnrollment, key)),
    [phaseEnrollment],
  );

  return (
    <div className="space-y-8" data-testid="chesterton-enrollment-step">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          Phased Enrollment Plan
        </h2>
        <p className="text-muted-foreground text-lg">
          The CSN Operating Manual lays out enrollment as a 4 grade × 6 year matrix. Year 0 is the launch year (one or two
          freshman classes); each subsequent year you add the next grade until grades 9–12 are full.
        </p>
      </div>

      {showCoach && (
        <WhyThisMatters
          why="Enrollment is the engine of every school financial model. The CSN matrix forces you to commit grade-by-grade so the financial projection (and your facility plan) match a real, ramp-able cohort."
          revisit="Re-confirm every February once you have a feel for the incoming freshman class."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormInput
          name="chesterton.planningYear"
          label="Planning Year (start)"
          type="number"
          helperText="The fall the school year begins."
        />
        <FormInput
          name="chesterton.attritionRate"
          label="Year-over-Year Attrition"
          type="number"
          step="0.01"
          helperText="Decimal (e.g. 0.10 = 10%)."
        />
        <div className="rounded-2xl border border-border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Year 6 Total Enrollment</div>
          <div className="text-2xl font-bold text-foreground mt-1">{totals[5]}</div>
          <div className="text-xs text-muted-foreground mt-1">All four grades, fully ramped</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" data-testid="chesterton-enrollment-grid">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-2 font-semibold sticky left-0 bg-muted">Grade</th>
              {yearLabels.map((label, idx) => (
                <th key={label} className="p-2 font-semibold text-center">
                  Yr {idx} <span className="block text-xs font-normal text-muted-foreground">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHESTERTON_GRADES.map((grade, gradeIdx) => (
              <tr key={grade.key} className="border-b border-border">
                <td className="p-2 font-medium sticky left-0 bg-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {grade.label}
                </td>
                {YEAR_KEYS.map(yearKey => (
                  <td key={yearKey} className="p-1">
                    <FormInput
                      name={`chesterton.phaseEnrollment.${gradeIdx}.${yearKey}`}
                      label=""
                      type="number"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className="p-2 sticky left-0 bg-muted/40">Total</td>
              {totals.map((t, i) => (
                <td key={i} className="p-2 text-center">{t}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
