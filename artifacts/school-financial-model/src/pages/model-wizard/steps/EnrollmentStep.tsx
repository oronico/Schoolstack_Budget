import { useFormContext } from "react-hook-form";
import { FormInput } from "@/components/ui/form-inputs";
import { SCHOOL_TYPE_LABELS } from "../schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
  ReferenceLine,
} from "recharts";

const GUIDANCE: Record<string, { y1Pct: string; growth: string; note: string }> = {
  charter_school: {
    y1Pct: "70-90%",
    growth: "10-15%",
    note: "Charter schools usually open near capacity due to pre-enrollment requirements. Growth comes from adding grade levels or expanding facilities.",
  },
  homeschool_coop: {
    y1Pct: "50-70%",
    growth: "15-25%",
    note: "Homeschool co-ops grow through community networks and word-of-mouth. Start with a core group of committed families and grow organically.",
  },
  learning_pod: {
    y1Pct: "70-90%",
    growth: "10-20%",
    note: "Learning pods are intentionally small. Most fill quickly through local networks. Growth usually means adding pods, not expanding a single one.",
  },
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
  tutoring_center: {
    y1Pct: "30-50%",
    growth: "20-30%",
    note: "Tutoring centers ramp up as local reputation builds. Expect 30-50% of capacity in Year 1, with steady growth as families refer others.",
  },
  other: {
    y1Pct: "50-70%",
    growth: "15-25%",
    note: "Most new schools enroll 50-70% of capacity in Year 1. Plan for steady, sustainable growth rather than aggressive targets.",
  },
};

function getDefaultYearCount(schoolStage: string | undefined): number {
  if (schoolStage === "operating_school") return 4;
  return 3;
}

function getYearLabel(index: number, schoolStage: string | undefined): string {
  if (schoolStage === "operating_school" && index === 0) return "Current Year";
  return `Year ${index + 1}`;
}

function EnrollmentChart({ enrollments, maxCapacity, schoolStage, yearCount }: { enrollments: number[]; maxCapacity: number; schoolStage: string | undefined; yearCount: number }) {
  const chartData = enrollments.slice(0, yearCount).map((val, i) => ({
    year: getYearLabel(i, schoolStage),
    students: val || 0,
    capacity: maxCapacity || 0,
  }));

  const hasData = chartData.some((d) => d.students > 0);
  if (!hasData) return null;

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.students, d.capacity)), 10);

  return (
    <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-display font-bold text-sm text-foreground">Enrollment Preview</h4>
        {maxCapacity > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-3 h-0.5 bg-amber-400 rounded-full inline-block" />
            Max Capacity: {maxCapacity}
          </div>
        )}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} domain={[0, Math.ceil(maxVal * 1.15)]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const students = payload[0]?.value as number;
                return (
                  <div className="bg-white rounded-lg border border-border/60 shadow-lg px-3 py-2 text-xs">
                    <p className="font-semibold text-foreground mb-1">{label}</p>
                    <p className="text-muted-foreground">{students} students</p>
                    {maxCapacity > 0 && (
                      <p className="text-muted-foreground">{Math.round((students / maxCapacity) * 100)}% of capacity</p>
                    )}
                  </div>
                );
              }}
            />
            {maxCapacity > 0 && (
              <ReferenceLine y={maxCapacity} stroke="#F59E0B" strokeDasharray="6 3" strokeWidth={2} label={{ value: `Capacity: ${maxCapacity}`, position: "insideTopRight", fill: "#92400E", fontSize: 10, fontWeight: 600 }} />
            )}
            <Bar dataKey="students" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={maxCapacity > 0 && entry.students > maxCapacity ? "#E11D48" : "#16A34A"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EnrollmentStep() {
  const { watch } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType") || "other";
  const schoolStage = watch("schoolProfile.schoolStage");
  const maxCapacity = watch("schoolProfile.maxCapacity") || 0;
  const enrollment = watch("enrollment") || {};
  const guide = GUIDANCE[schoolType] || GUIDANCE.other;

  const defaultYearCount = getDefaultYearCount(schoolStage);
  const yearKeys = ["year1", "year2", "year3", "year4", "year5"] as const;

  const enrollments = yearKeys.map(k => enrollment[k] || 0);

  const warnings: string[] = [];
  for (let i = 1; i < 5; i++) {
    if (enrollments[i - 1] > 0 && enrollments[i] > 0) {
      const growth = (enrollments[i] - enrollments[i - 1]) / enrollments[i - 1];
      if (growth > 0.25) {
        warnings.push(`${getYearLabel(i - 1, schoolStage)} to ${getYearLabel(i, schoolStage)} growth is ${Math.round(growth * 100)}% — over 25% year-over-year growth is aggressive and may concern lenders.`);
      }
    }
  }
  if (maxCapacity > 0) {
    for (let i = 0; i < 5; i++) {
      if (enrollments[i] > maxCapacity) {
        warnings.push(`${getYearLabel(i, schoolStage)} enrollment (${enrollments[i]}) exceeds your facility capacity of ${maxCapacity}.`);
      }
    }
  }

  const placeholders = ["25", "40", "60", "80", "100"];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">How Many Students Will You Serve?</h2>
        <p className="text-muted-foreground text-lg">Enter your expected enrollment for each year. This drives your revenue and per-student calculations.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-2">
          Enrollment Benchmarks for {SCHOOL_TYPE_LABELS[schoolType] ? `${SCHOOL_TYPE_LABELS[schoolType]}s` : "New Schools"}
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
        {yearKeys.slice(0, defaultYearCount).map((key, i) => (
          <FormInput
            key={key}
            name={`enrollment.${key}`}
            label={`${getYearLabel(i, schoolStage)} Students`}
            type="number"
            placeholder={placeholders[i]}
          />
        ))}
      </div>

      <EnrollmentChart enrollments={enrollments} maxCapacity={maxCapacity} schoolStage={schoolStage} yearCount={defaultYearCount} />

      {defaultYearCount < 5 && (
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
          <p className="text-sm text-muted-foreground">
            You can extend your projections to Year 5 later from the Review step. For now, we'll build your model with {defaultYearCount} years.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
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
