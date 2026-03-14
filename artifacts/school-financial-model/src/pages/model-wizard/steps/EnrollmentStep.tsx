import { useFormContext } from "react-hook-form";
import { FormInput } from "@/components/ui/form-inputs";

const GUIDANCE: Record<string, { y1Pct: string; growth: string; note: string }> = {
  microschool: {
    y1Pct: "60-80%",
    growth: "10-20%",
    note: "Microschools typically start with a small, committed cohort and grow through word-of-mouth. Aim for 60-80% of capacity in Year 1.",
  },
  private_school: {
    y1Pct: "40-60%",
    growth: "15-25%",
    note: "New private schools often open at 40-60% of capacity and take 3-4 years to reach full enrollment. Marketing and community reputation drive growth.",
  },
  charter_school: {
    y1Pct: "70-90%",
    growth: "10-15%",
    note: "Charter schools usually open near capacity due to pre-enrollment requirements. Growth comes from adding grade levels or expanding facilities.",
  },
  other: {
    y1Pct: "50-70%",
    growth: "15-25%",
    note: "Most new schools enroll 50-70% of capacity in Year 1. Plan for steady, sustainable growth rather than aggressive targets.",
  },
};

export function EnrollmentStep() {
  const { watch } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType") || "other";
  const maxCapacity = watch("schoolProfile.maxCapacity") || 0;
  const enrollment = watch("enrollment") || {};
  const guide = GUIDANCE[schoolType] || GUIDANCE.other;

  const enrollments = [
    enrollment.year1 || 0,
    enrollment.year2 || 0,
    enrollment.year3 || 0,
    enrollment.year4 || 0,
    enrollment.year5 || 0,
  ];

  const warnings: string[] = [];
  for (let i = 1; i < 5; i++) {
    if (enrollments[i - 1] > 0 && enrollments[i] > 0) {
      const growth = (enrollments[i] - enrollments[i - 1]) / enrollments[i - 1];
      if (growth > 0.25) {
        warnings.push(`Year ${i} to Year ${i + 1} growth is ${Math.round(growth * 100)}% — over 25% year-over-year growth is aggressive and may concern lenders.`);
      }
    }
  }
  if (maxCapacity > 0) {
    for (let i = 0; i < 5; i++) {
      if (enrollments[i] > maxCapacity) {
        warnings.push(`Year ${i + 1} enrollment (${enrollments[i]}) exceeds your facility capacity of ${maxCapacity}.`);
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Enrollment Projections</h2>
        <p className="text-muted-foreground text-lg">Enter the total number of students you expect to serve each year.</p>
      </div>

      <div className="bg-secondary/50 rounded-2xl p-6 mb-8 border border-border">
        <p className="text-sm font-medium text-foreground mb-2">
          Enrollment Benchmarks for {schoolType === "private_school" ? "Private Schools" : schoolType === "charter_school" ? "Charter Schools" : schoolType === "microschool" ? "Microschools" : "New Schools"}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{guide.note}</p>
        <div className="flex gap-6 text-sm">
          <div>
            <span className="font-semibold text-foreground">Year 1 Target:</span>{" "}
            <span className="text-muted-foreground">{guide.y1Pct} of capacity{maxCapacity > 0 && ` (${Math.round(maxCapacity * 0.5)}-${Math.round(maxCapacity * 0.8)} students)`}</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Typical Growth:</span>{" "}
            <span className="text-muted-foreground">{guide.growth} per year</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <FormInput name="enrollment.year1" label="Year 1 Students" type="number" placeholder="25" />
        <FormInput name="enrollment.year2" label="Year 2 Students" type="number" placeholder="40" />
        <FormInput name="enrollment.year3" label="Year 3 Students" type="number" placeholder="60" />
        <FormInput name="enrollment.year4" label="Year 4 Students" type="number" placeholder="80" />
        <FormInput name="enrollment.year5" label="Year 5 Students" type="number" placeholder="100" />
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-amber-800 mb-2">Enrollment Alerts</p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5">&#9888;</span> {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
