import { FormInput } from "@/components/ui/form-inputs";

export function EnrollmentStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Enrollment Projections</h2>
        <p className="text-muted-foreground text-lg">Enter the total number of students you expect to serve each year.</p>
      </div>

      <div className="bg-secondary/50 rounded-2xl p-6 mb-8 border border-border">
        <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
          💡 <span className="text-foreground">Tip:</span> Be realistic but optimistic. Most microschools grow by 15-30% in years 2-3.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <FormInput name="enrollment.year1" label="Year 1 Students" type="number" placeholder="25" />
        <FormInput name="enrollment.year2" label="Year 2 Students" type="number" placeholder="40" />
        <FormInput name="enrollment.year3" label="Year 3 Students" type="number" placeholder="60" />
        <FormInput name="enrollment.year4" label="Year 4 Students" type="number" placeholder="80" />
        <FormInput name="enrollment.year5" label="Year 5 Students" type="number" placeholder="100" />
      </div>
    </div>
  );
}
