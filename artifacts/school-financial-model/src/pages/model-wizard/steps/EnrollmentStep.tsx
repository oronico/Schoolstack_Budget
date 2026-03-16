import { useCallback, useMemo, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS } from "../schema";
import type { Program } from "../schema";
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

const SUGGESTED_PROGRAMS = [
  "Full Day",
  "Half Day",
  "Four-Day Program",
  "After School",
  "Drop-In",
  "Pre-K",
  "Elementary (K-5)",
  "Middle School (6-8)",
  "High School (9-12)",
  "Summer Program",
  "Tutoring",
  "Enrichment",
];

function EnrollmentChart({ enrollments, maxCapacity, yearLabels }: { enrollments: number[]; maxCapacity: number; yearLabels: string[] }) {
  const chartData = enrollments.map((val, i) => ({
    year: yearLabels[i] || `Y${i + 1}`,
    students: val || 0,
    capacity: maxCapacity || 0,
  }));

  const hasData = chartData.some((d) => d.students > 0);
  if (!hasData) return null;

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.students, d.capacity)), 10);

  return (
    <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-display font-bold text-sm text-foreground">Total Enrollment Projection</h4>
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
                  fill={maxCapacity > 0 && entry.students > maxCapacity ? "#E11D48" : "#328555"}
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

function EnrollmentBenchmark({ schoolType, maxCapacity, isNewSchool }: { schoolType: string; maxCapacity: number; isNewSchool: boolean }) {
  const benchmarks: { label: string; detail: string }[] = [];

  if (isNewSchool) {
    if (maxCapacity > 0) {
      const lowPct = 40;
      const highPct = 65;
      const lowEst = Math.round(maxCapacity * lowPct / 100);
      const highEst = Math.round(maxCapacity * highPct / 100);
      benchmarks.push({
        label: `Year 1: ${lowEst}–${highEst} students (${lowPct}–${highPct}% of your ${maxCapacity} capacity)`,
        detail: "Most new schools fill 40–65% of capacity in their opening year. Conservative projections build lender confidence.",
      });
    } else {
      benchmarks.push({
        label: "Year 1: Plan for 40–65% of your target capacity",
        detail: "Most new schools fill 40–65% of capacity in their opening year. Conservative projections build lender confidence.",
      });
    }
    benchmarks.push({
      label: "Growth: 15–25% per year is a strong, realistic ramp",
      detail: "Lenders expect steady growth, not hockey sticks. Year-over-year increases above 25% will need a clear explanation.",
    });
  }

  if (schoolType === "charter_school") {
    benchmarks.push({
      label: "Charter benchmark: 100+ students by Year 2 for financial viability",
      detail: "Per-pupil funding models typically need 100+ students to cover fixed costs. Plan your enrollment ramp accordingly.",
    });
  } else if (schoolType === "private_school") {
    benchmarks.push({
      label: "Private school: Tuition revenue is your primary driver",
      detail: "Aim for tuition to cover at least 60% of operating costs. Enrollment directly determines your financial health.",
    });
  } else if (schoolType === "microschool" || schoolType === "learning_pod") {
    benchmarks.push({
      label: "Microschool/pod: Small cohorts mean each student matters more",
      detail: "With fewer students, per-student revenue needs to be higher. Make sure your tuition rates account for the smaller scale.",
    });
  }

  if (maxCapacity > 0) {
    benchmarks.push({
      label: `Capacity target: Reach 80–95% utilization by Year 3–4`,
      detail: "Underutilized facilities are expensive. Plan to approach full capacity by mid-model to show financial sustainability.",
    });
  }

  if (benchmarks.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-teal-50/80 to-emerald-50/40 border border-teal-200/60 rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-start gap-2 mb-3">
        <Info className="h-4 w-4 text-teal-700 mt-0.5 flex-shrink-0" />
        <p className="text-sm font-bold text-teal-800">Enrollment benchmarks for your school type</p>
      </div>
      <div className="space-y-3">
        {benchmarks.map((b, i) => (
          <div key={i}>
            <p className="text-sm font-semibold text-teal-900">{b.label}</p>
            <p className="text-xs text-teal-700/80 mt-0.5">{b.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EnrollmentStep() {
  const { watch, setValue } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType") || "other";
  const schoolStage = watch("schoolProfile.schoolStage");
  const operatingYear = watch("schoolProfile.operatingYear");
  const maxCapacity = watch("schoolProfile.maxCapacity") || 0;
  const programs = (watch("programs") || []) as Program[];
  const escalationRate = watch("tuitionEscalation.rate") ?? 3;
  const plannedOpeningYear = watch("schoolProfile.plannedOpeningYear");

  const isNewSchool = schoolStage === "new_school";
  const isFirstYear = schoolStage === "operating_school" && operatingYear === "first_year";
  const isSecondYearPlus = schoolStage === "operating_school" && operatingYear === "second_year_plus";

  const showPriorYear = isSecondYearPlus;
  const showCurrentYear = isFirstYear || isSecondYearPlus;

  const openingYearLabel = plannedOpeningYear || "2026-27";
  const openingYearNum = parseInt(openingYearLabel.split("-")[0]) || 2026;

  const futureYearLabels = Array.from({ length: 5 }, (_, i) => {
    const start = openingYearNum + i;
    const end = (start + 1) % 100;
    return `${start}-${String(end).padStart(2, "0")}`;
  });

  const allColumnKeys: string[] = [];
  const allColumnLabels: string[] = [];

  if (showPriorYear) {
    allColumnKeys.push("priorYear");
    allColumnLabels.push(`${openingYearNum - 2}-${String((openingYearNum - 1) % 100).padStart(2, "0")} (Prior)`);
  }
  if (showCurrentYear) {
    allColumnKeys.push("currentYear");
    allColumnLabels.push(`${openingYearNum - 1}-${String(openingYearNum % 100).padStart(2, "0")} (Current)`);
  }
  for (let i = 0; i < 5; i++) {
    allColumnKeys.push(`year${i + 1}`);
    allColumnLabels.push(futureYearLabels[i]);
  }

  const addProgram = useCallback((name?: string) => {
    const newProgram: Program = {
      id: `prog_${Date.now()}`,
      name: name || "",
      annualTuition: 0,
      priorYear: 0,
      currentYear: 0,
      year1: 0,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: 0,
    };
    setValue("programs", [...programs, newProgram], { shouldDirty: true });
  }, [programs, setValue]);

  const updateProgram = useCallback((id: string, field: string, value: string | number) => {
    const updated = programs.map(p =>
      p.id === id ? { ...p, [field]: value } : p
    );
    setValue("programs", updated, { shouldDirty: true });
  }, [programs, setValue]);

  const removeProgram = useCallback((id: string) => {
    setValue("programs", programs.filter(p => p.id !== id), { shouldDirty: true });
  }, [programs, setValue]);

  const getTuitionForYear = useCallback((baseTuition: number, yearIndex: number): number => {
    if (yearIndex <= 0) return baseTuition;
    return Math.round(baseTuition * Math.pow(1 + (escalationRate / 100), yearIndex));
  }, [escalationRate]);

  const totalsByYear = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const key of allColumnKeys) {
      totals[key] = programs.reduce((sum, p) => sum + ((p as Record<string, unknown>)[key] as number || 0), 0);
    }
    return totals;
  }, [programs, allColumnKeys]);

  const revenueByYear = useMemo(() => {
    const rev: Record<string, number> = {};
    for (let i = 0; i < 5; i++) {
      const key = `year${i + 1}`;
      rev[key] = programs.reduce((sum, p) => {
        const students = (p as Record<string, unknown>)[key] as number || 0;
        const tuition = getTuitionForYear(p.annualTuition, i);
        return sum + (students * tuition);
      }, 0);
    }
    return rev;
  }, [programs, getTuitionForYear]);

  const chartEnrollments = Array.from({ length: 5 }, (_, i) => totalsByYear[`year${i + 1}`] || 0);
  const chartLabels = futureYearLabels;

  const hasYear1Data = programs.some(p => p.year1 > 0);

  const existingProgramNames = new Set(programs.map(p => p.name));
  const availableSuggestions = SUGGESTED_PROGRAMS.filter(s => !existingProgramNames.has(s));

  const formatCurrency = (val: number) =>
    val >= 1000 ? `$${Math.round(val).toLocaleString()}` : `$${val}`;

  useEffect(() => {
    const y1 = programs.reduce((s, p) => s + (p.year1 || 0), 0);
    const y2 = programs.reduce((s, p) => s + (p.year2 || 0), 0);
    const y3 = programs.reduce((s, p) => s + (p.year3 || 0), 0);
    const y4 = programs.reduce((s, p) => s + (p.year4 || 0), 0);
    const y5 = programs.reduce((s, p) => s + (p.year5 || 0), 0);
    setValue("enrollment.year1", y1, { shouldDirty: true });
    setValue("enrollment.year2", y2, { shouldDirty: true });
    setValue("enrollment.year3", y3, { shouldDirty: true });
    setValue("enrollment.year4", y4, { shouldDirty: true });
    setValue("enrollment.year5", y5, { shouldDirty: true });
  }, [programs, setValue]);

  const warnings: string[] = [];
  for (let i = 1; i < 5; i++) {
    const prev = totalsByYear[`year${i}`] || 0;
    const curr = totalsByYear[`year${i + 1}`] || 0;
    if (prev > 0 && curr > 0) {
      const growth = (curr - prev) / prev;
      if (growth > 0.25) {
        warnings.push(`${futureYearLabels[i - 1]} to ${futureYearLabels[i]} growth is ${Math.round(growth * 100)}% — over 25% year-over-year growth may concern lenders.`);
      }
    }
  }
  if (maxCapacity > 0) {
    for (let i = 0; i < 5; i++) {
      const total = totalsByYear[`year${i + 1}`] || 0;
      if (total > maxCapacity) {
        warnings.push(`${futureYearLabels[i]} enrollment (${total}) exceeds your facility capacity of ${maxCapacity}.`);
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Programs & Enrollment</h2>
        <p className="text-muted-foreground text-lg">
          Define every program you offer — each with its own tuition and enrollment. Full day, half day, drop-in, after school, four-day week — whatever you run. Don't worry about getting this perfect — your budget is a living document you'll refine over time.
        </p>
      </div>

      {programs.length === 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-3">
            What programs does your{" "}
            {SCHOOL_TYPE_LABELS[schoolType] ? SCHOOL_TYPE_LABELS[schoolType].toLowerCase() : "school"} offer?
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Every school is different. Add each program you run — they can be grade bands, schedule types, or specialty offerings. Each gets its own tuition rate and enrollment numbers.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {availableSuggestions.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => addProgram(name)}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-sm font-medium text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
              >
                + {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addProgram()}
            className="flex items-center gap-2 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add custom program
          </button>
        </div>
      )}

      {programs.length > 0 && (
        <>
          <div className="space-y-3">
            {programs.map((prog) => (
              <div key={prog.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={prog.name}
                    onChange={(e) => updateProgram(prog.id, "name", e.target.value)}
                    className="font-semibold text-sm bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary flex-1 min-w-0"
                    placeholder="Program name (e.g., Elementary K-5)"
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">Annual Tuition:</span>
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={prog.annualTuition || ""}
                      onChange={(e) => updateProgram(prog.id, "annualTuition", parseFloat(e.target.value) || 0)}
                      className="w-24 text-sm text-right border border-border rounded-lg px-2 py-1 bg-background"
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProgram(prog.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableSuggestions.length > 0 && availableSuggestions.slice(0, 4).map(name => (
              <button
                key={name}
                type="button"
                onClick={() => addProgram(name)}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
              >
                + {name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addProgram()}
              className="flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors py-1"
            >
              <Plus className="h-3.5 w-3.5" /> Custom
            </button>
          </div>
        </>
      )}

      {programs.length > 0 && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Enrollment by Program</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {isNewSchool
              ? `Enter your projected enrollment for each program starting ${openingYearLabel}.`
              : showPriorYear
                ? "Enter last year's actual enrollment, current year, and your projections going forward."
                : "Enter your current year enrollment and your projections going forward."}
          </p>

          <EnrollmentBenchmark schoolType={schoolType} maxCapacity={maxCapacity} isNewSchool={isNewSchool} />

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border w-40">
                    Program
                  </th>
                  {allColumnKeys.map((key, i) => (
                    <th
                      key={key}
                      className={cn(
                        "text-center py-2 px-2 text-xs font-semibold uppercase tracking-wider border-b border-border",
                        key === "priorYear" || key === "currentYear"
                          ? "text-muted-foreground bg-secondary/30"
                          : "text-foreground"
                      )}
                    >
                      {allColumnLabels[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {programs.map((prog) => (
                  <tr key={prog.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 px-3 font-medium text-foreground text-sm">
                      {prog.name || "Unnamed Program"}
                    </td>
                    {allColumnKeys.map((key) => (
                      <td key={key} className={cn("py-1.5 px-1.5", (key === "priorYear" || key === "currentYear") && "bg-secondary/20")}>
                        <input
                          type="number"
                          value={(prog as Record<string, unknown>)[key] as number || ""}
                          onChange={(e) => updateProgram(prog.id, key, parseInt(e.target.value) || 0)}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-center text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          placeholder="0"
                          min={0}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-secondary/40 font-semibold">
                  <td className="py-2 px-3 text-sm text-foreground">Total</td>
                  {allColumnKeys.map((key) => (
                    <td key={key} className="py-2 px-2 text-center text-sm text-foreground">
                      {totalsByYear[key] || 0}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasYear1Data && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tuition Escalation
            </span>
          </h3>

          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                We recommend a 3-5% annual tuition increase to keep pace with rising operating costs. This is standard across the industry and expected by lenders.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-semibold text-foreground whitespace-nowrap">
                Annual Tuition Increase:
              </label>
              <input
                type="number"
                value={escalationRate}
                onChange={(e) => setValue("tuitionEscalation.rate", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                className="w-20 text-sm text-center border-2 border-border rounded-xl px-3 py-2 bg-card outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                min={0}
                max={20}
                step={0.5}
              />
              <span className="text-sm text-muted-foreground">%</span>
              <div className="flex gap-1 ml-2">
                {[3, 4, 5].map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setValue("tuitionEscalation.rate", rate, { shouldDirty: true })}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                      escalationRate === rate
                        ? "bg-primary text-white"
                        : "bg-secondary text-foreground hover:bg-primary/10"
                    )}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            {programs.some(p => p.annualTuition > 0) && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                        Program
                      </th>
                      {futureYearLabels.map((label, i) => (
                        <th key={i} className="text-center py-2 px-2 text-xs font-semibold text-foreground uppercase tracking-wider border-b border-border">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programs.filter(p => p.annualTuition > 0).map((prog) => (
                      <tr key={prog.id} className="border-b border-border/50">
                        <td className="py-2 px-3 font-medium text-foreground text-sm">{prog.name || "Unnamed"}</td>
                        {futureYearLabels.map((_, i) => {
                          const tuition = getTuitionForYear(prog.annualTuition, i);
                          const students = (prog as Record<string, unknown>)[`year${i + 1}`] as number || 0;
                          return (
                            <td key={i} className="py-2 px-2 text-center">
                              <div className="text-sm font-medium text-foreground">{formatCurrency(tuition)}</div>
                              {students > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  {students} students = {formatCurrency(tuition * students)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="py-2 px-3 text-sm">Projected Tuition Revenue</td>
                      {futureYearLabels.map((_, i) => (
                        <td key={i} className="py-2 px-2 text-center text-sm text-primary">
                          {formatCurrency(revenueByYear[`year${i + 1}`] || 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <EnrollmentChart enrollments={chartEnrollments} maxCapacity={maxCapacity} yearLabels={chartLabels} />

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

      {programs.length > 0 && hasYear1Data && (
        <div className="bg-secondary/50 rounded-2xl p-5 border border-border">
          <p className="text-sm font-medium text-foreground mb-1">5-Year Revenue Summary</p>
          <div className="flex flex-wrap gap-4 mt-2">
            {futureYearLabels.map((label, i) => {
              const rev = revenueByYear[`year${i + 1}`] || 0;
              const students = totalsByYear[`year${i + 1}`] || 0;
              return (
                <div key={i} className="text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(rev)}</p>
                  <p className="text-[10px] text-muted-foreground">{students} students</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
