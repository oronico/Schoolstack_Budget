import { useCallback, useMemo, useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, TrendingUp, Info, School, ShieldCheck, Users, ClipboardList, Sparkles } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { IDontKnowYet } from "@/components/coaching/IDontKnowYet";
import { RationaleField } from "@/components/coaching/RationaleField";
import { cn, formatCurrency } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS } from "../schema";
import type { Program } from "../schema";
import {
  GRADE_BAND_LABELS,
  GRADE_BAND_KEYS,
  GRADE_KEYS,
  GRADE_LABELS,
  GRADE_TO_BAND,
  defaultGroupingModeForSchoolType,
  type GradeBandKey,
  type GradeKey,
  type StudentGroupingMode,
} from "@/lib/revenue-defaults";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch, getFounderPersona } from "@/lib/coaching/founder-persona";
import { enrollmentBenchmarkFor } from "@/lib/school-type-benchmarks";
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

// Programs are now framed as SCHEDULES (how/when families show
// up) — not as grade bands. Grade-band cohort sizes live in the grade/band
// matrix below. The new chip list intentionally drops Pre-K / Elementary /
// Middle / High School entries because those duplicate the grade-band UI
// and used to confuse founders into entering the same students twice.
const SUGGESTED_PROGRAMS = [
  "Full Day",
  "Half Day",
  "2-Day Program",
  "3-Day Program",
  "4-Day Program",
  "Drop-In",
  "After-School",
  "Summer Camp",
  "Enrichment",
  "Tutoring",
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
        detail: "Most new schools fill 40–65% of capacity in their opening year. Starting conservatively gives you a realistic baseline to build from.",
      });
    } else {
      benchmarks.push({
        label: "Year 1: Plan for 40–65% of your target capacity",
        detail: "Most new schools fill 40–65% of capacity in their opening year. Starting conservatively gives you a realistic baseline to build from.",
      });
    }
    benchmarks.push({
      label: "Growth: 15–25% per year is a strong, realistic ramp",
      detail: "Steady growth is achievable growth. Year-over-year increases above 25% require a concrete recruitment plan - make sure yours is in place before projecting it.",
    });
  }

  // Source of truth: lib/school-type-benchmarks.ts. Each school type has
  // its own entry; learning_pod and tutoring_center are first-class
  // (Task #454) rather than folded into microschool.
  const typeBenchmark = enrollmentBenchmarkFor(schoolType);
  if (typeBenchmark) {
    benchmarks.push(typeBenchmark);
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

function DemandConfidenceIndicator({ retentionRate, applicationsReceived, waitlistCount, year1Enrollment, isOperatingSchool }: {
  retentionRate?: number;
  applicationsReceived: number;
  waitlistCount: number;
  year1Enrollment: number;
  isOperatingSchool: boolean;
}) {
  const pipeline = applicationsReceived + waitlistCount;
  if (pipeline === 0 && (!retentionRate || retentionRate === 0)) return null;
  if (year1Enrollment <= 0) return null;

  const coveragePct = pipeline > 0 ? Math.round((pipeline / year1Enrollment) * 100) : 0;

  let level: "strong" | "moderate" | "weak" = "moderate";
  let message = "";

  if (pipeline > 0) {
    if (coveragePct >= 100) {
      level = "strong";
      message = `Strong demand - pipeline covers ${coveragePct}% of Year 1 seats`;
    } else if (coveragePct >= 60) {
      level = "moderate";
      message = `Moderate demand - pipeline covers ${coveragePct}% of Year 1 seats`;
    } else {
      level = "weak";
      message = `Building demand - pipeline covers ${coveragePct}% of Year 1 seats`;
    }
  }

  if (isOperatingSchool && retentionRate !== undefined && retentionRate > 0) {
    if (pipeline === 0) {
      if (retentionRate >= 85) {
        level = "strong";
        message = `Strong retention - ${retentionRate}% of students expected to re-enroll`;
      } else if (retentionRate >= 80) {
        level = "moderate";
        message = `Solid retention - ${retentionRate}% of students expected to re-enroll`;
      } else {
        level = "weak";
        message = `${retentionRate}% retention means you'll need a stronger recruitment plan to hit your targets`;
      }
    } else {
      if (retentionRate >= 85) {
        if (level !== "strong") level = coveragePct >= 60 ? "strong" : "moderate";
        message += ` with ${retentionRate}% retention`;
      } else if (retentionRate < 80) {
        if (level === "strong") level = "moderate";
        message += ` - but ${retentionRate}% retention is a concern`;
      }
    }
  }

  const colors = {
    strong: { bg: "from-emerald-50 to-green-50/50", border: "border-emerald-300", text: "text-emerald-800", icon: "text-emerald-600" },
    moderate: { bg: "from-blue-50 to-sky-50/50", border: "border-blue-300", text: "text-blue-800", icon: "text-blue-600" },
    weak: { bg: "from-amber-50 to-yellow-50/50", border: "border-amber-300", text: "text-amber-800", icon: "text-amber-600" },
  };

  const c = colors[level];

  return (
    <div className={`bg-gradient-to-br ${c.bg} border ${c.border} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-full p-2 bg-white/70 ${c.icon}`}>
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className={`text-sm font-bold ${c.text}`}>Demand Confidence</p>
          <p className={`text-sm ${c.text} opacity-80`}>{message}</p>
        </div>
      </div>
      {pipeline > 0 && (
        <div className="mt-3 flex gap-4 text-xs">
          {applicationsReceived > 0 && (
            <span className={c.text}>
              <strong>{applicationsReceived}</strong> applications
            </span>
          )}
          {waitlistCount > 0 && (
            <span className={c.text}>
              <strong>{waitlistCount}</strong> waitlisted
            </span>
          )}
          <span className={`${c.text} opacity-70`}>
            {year1Enrollment} Year 1 seats
          </span>
        </div>
      )}
    </div>
  );
}

function RetentionDemandSection({ isOperatingSchool, isSecondYearPlus }: { isOperatingSchool: boolean; isSecondYearPlus: boolean }) {
  const { watch, setValue } = useFormContext();
  const retentionRate = watch("enrollment.retentionRate");
  const applicationsReceived = watch("enrollment.applicationsReceived");
  const waitlistCount = watch("enrollment.waitlistCount");

  const showRetention = isOperatingSchool && isSecondYearPlus;

  return (
    <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-5">
      <div>
        <h4 className="font-display font-bold text-sm text-foreground mb-1 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Retention & Demand Signals
        </h4>
        <p className="text-xs text-muted-foreground">
          Strong projections start with real data. Knowing your retention rate, application pipeline, and waitlist helps you set realistic enrollment targets - and shows anyone reviewing your model that your numbers are grounded in evidence, not guesswork.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          These fields are optional. Adding real demand data turns your projections from estimates into evidence-backed targets.
        </p>
      </div>

      {showRetention && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Year-over-Year Student Retention Rate
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            What percentage of current students are expected to re-enroll next year?
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={retentionRate ?? ""}
              onChange={(e) => setValue("enrollment.retentionRate", e.target.value === "" ? undefined : parseFloat(e.target.value), { shouldDirty: true })}
              className="w-24 text-sm text-center border-2 border-border rounded-xl px-3 py-2 bg-card outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              placeholder="e.g. 85"
              min={0}
              max={100}
              step={1}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <div className="flex gap-1 ml-2">
              {[75, 80, 85, 90].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setValue("enrollment.retentionRate", rate, { shouldDirty: true })}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    retentionRate === rate
                      ? "bg-primary text-white"
                      : "bg-secondary text-foreground hover:bg-primary/10"
                  )}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>
          {retentionRate !== undefined && retentionRate < 80 && (
            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
              <span>&#9888;</span> Retention below 80% means you'll need a stronger recruitment pipeline to hit your enrollment targets. Consider what's driving attrition and how you'll address it.
            </p>
          )}

        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Applications Received (2026-27)
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            How many applications have you received for the upcoming year?
          </p>
          <input
            type="number"
            value={applicationsReceived ?? ""}
            onChange={(e) => setValue("enrollment.applicationsReceived", e.target.value === "" ? undefined : parseInt(e.target.value), { shouldDirty: true })}
            className="w-full text-sm border-2 border-border rounded-xl px-3 py-2 bg-card outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="0"
            min={0}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Waitlist Count (2026-27)
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            How many families are on your waitlist for the upcoming year?
          </p>
          <input
            type="number"
            value={waitlistCount ?? ""}
            onChange={(e) => setValue("enrollment.waitlistCount", e.target.value === "" ? undefined : parseInt(e.target.value), { shouldDirty: true })}
            className="w-full text-sm border-2 border-border rounded-xl px-3 py-2 bg-card outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="0"
            min={0}
          />
        </div>
      </div>
    </div>
  );
}

export function EnrollmentStep() {
  const { watch, setValue } = useFormContext();
  const { user } = useAuth();
  const persona = getFounderPersona(user);
  const yetToLaunch = isYetToLaunch(user);
  const newComfort = persona.comfort === "new_to_budgeting";
  const schoolType = watch("schoolProfile.schoolType") || "other";
  const schoolStage = watch("schoolProfile.schoolStage");
  const operatingYear = watch("schoolProfile.operatingYear");
  const maxCapacity = watch("schoolProfile.maxCapacity") || 0;
  const programs = (watch("programs") || []) as Program[];
  const escalationRate = watch("tuitionEscalation.rate") ?? 3;
  const plannedOpeningYear = watch("schoolProfile.plannedOpeningYear");

  const currentStudents = watch("schoolProfile.currentStudents") || 0;

  const isNewSchool = schoolStage === "new_school";
  const isFirstYear = schoolStage === "operating_school" && operatingYear === "first_year";
  const isSecondYearPlus = schoolStage === "operating_school" && operatingYear === "second_year_plus";
  const [prefillDismissed, setPrefillDismissed] = useState(false);

  // Hide actuals columns when the founder has not yet launched.
  const showPriorYear = isSecondYearPlus && !yetToLaunch;
  const showCurrentYear = (isFirstYear || isSecondYearPlus) && !yetToLaunch;

  // Resolve grouping mode from the form, falling back to the school-type default.
  const storedGrouping = watch("schoolProfile.studentGroupingMode") as StudentGroupingMode | undefined;
  const groupingMode: StudentGroupingMode = storedGrouping ?? defaultGroupingModeForSchoolType(schoolType);
  const gradeBandActive = (watch("schoolProfile.gradeBandActive") as string[] | undefined) ?? [];
  const gradeActive = (watch("schoolProfile.gradeActive") as string[] | undefined) ?? [];
  const gradeBandEnrollment = (watch("schoolProfile.gradeBandEnrollment") as
    | Partial<Record<GradeBandKey, (number | null)[]>>
    | undefined) ?? {};
  const otherBandLabel = (watch("schoolProfile.gradeBandOtherLabel") as string | undefined) || "Other";

  // For legacy models without explicit `gradeBandActive`, infer from existing enrollment.
  const activeBandKeys: GradeBandKey[] = useMemo(() => {
    if (Array.isArray(watch("schoolProfile.gradeBandActive"))) {
      return GRADE_BAND_KEYS.filter((k) => gradeBandActive.includes(k));
    }
    return GRADE_BAND_KEYS.filter((k) => {
      const arr = gradeBandEnrollment[k];
      return Array.isArray(arr) && arr.some((v) => typeof v === "number" && v > 0);
    });
  }, [watch, gradeBandActive, gradeBandEnrollment]);
  const activeGradeKeys: GradeKey[] = useMemo(() => {
    if (Array.isArray(watch("schoolProfile.gradeActive"))) {
      return GRADE_KEYS.filter((k) => gradeActive.includes(k));
    }
    return [];
  }, [watch, gradeActive]);

  const showBands = groupingMode === "age_bands" || groupingMode === "both";
  const showGrades = groupingMode === "grades" || groupingMode === "both";
  const matrixGroupKeys: string[] = [
    ...(showGrades ? activeGradeKeys : []),
    ...(showBands ? activeBandKeys : []),
  ];
  const matrixGroupLabels: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    activeGradeKeys.forEach((k) => { out[k] = GRADE_LABELS[k]; });
    activeBandKeys.forEach((k) => { out[k] = k === "other" ? otherBandLabel : GRADE_BAND_LABELS[k]; });
    return out;
  }, [activeGradeKeys, activeBandKeys, otherBandLabel]);
  const hasMatrix = matrixGroupKeys.length > 0;

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

  // matrix state. Keys are programId → yearKey → groupKey → number|null.
  // Null means "didn't offer" / N/A (only meaningful for actuals).
  type MatrixCell = number | null;
  type ProgramMatrix = Record<string, Record<string, Record<string, MatrixCell>>>;
  type NotOfferedMap = Record<string, Record<string, boolean>>;
  const matrix = (watch("programEnrollmentMatrix") as ProgramMatrix | undefined) ?? {};
  const notOffered = (watch("programNotOffered") as NotOfferedMap | undefined) ?? {};
  // Column-level "didn't offer" mask keyed by yearKey → groupKey. See
  // schema.ts:columnNotOfferedMaskSchema for why this lives in form state
  // separate from the cell values.
  type ColumnNotOfferedMap = Record<string, Record<string, boolean>>;
  const columnNotOffered = (watch("columnNotOffered") as ColumnNotOfferedMap | undefined) ?? {};

  const getCell = useCallback((programId: string, yearKey: string, groupKey: string): MatrixCell => {
    const v = matrix[programId]?.[yearKey]?.[groupKey];
    return v === undefined ? 0 : v;
  }, [matrix]);

  const setCell = useCallback((programId: string, yearKey: string, groupKey: string, value: MatrixCell) => {
    const next: ProgramMatrix = JSON.parse(JSON.stringify(matrix));
    if (!next[programId]) next[programId] = {};
    if (!next[programId][yearKey]) next[programId][yearKey] = {};
    next[programId][yearKey][groupKey] = value;
    setValue("programEnrollmentMatrix", next, { shouldDirty: true });
  }, [matrix, setValue]);

  const isRowNotOffered = useCallback((programId: string, yearKey: string): boolean => {
    return Boolean(notOffered[programId]?.[yearKey]);
  }, [notOffered]);

  const setRowNotOffered = useCallback((programId: string, yearKey: string, flag: boolean) => {
    const nextNO: NotOfferedMap = JSON.parse(JSON.stringify(notOffered));
    if (!nextNO[programId]) nextNO[programId] = {};
    nextNO[programId][yearKey] = flag;
    setValue("programNotOffered", nextNO, { shouldDirty: true });
    if (flag) {
      const next: ProgramMatrix = JSON.parse(JSON.stringify(matrix));
      if (!next[programId]) next[programId] = {};
      if (!next[programId][yearKey]) next[programId][yearKey] = {};
      for (const gk of matrixGroupKeys) {
        next[programId][yearKey][gk] = null;
      }
      setValue("programEnrollmentMatrix", next, { shouldDirty: true });
    }
  }, [notOffered, matrix, matrixGroupKeys, setValue]);

  // Column-level "didn't offer this <grade/band> in <year>" — record the
  // intent in the columnNotOffered mask AND null every program's cell for
  // (yearKey, groupKey). The mask is the source of truth for whether the
  // column shows as N/A; we cannot rely on cell content alone because a
  // single stray non-null value (e.g. via the — placeholder click) would
  // otherwise quietly clear the user's choice on reload.
  const setColumnNotOffered = useCallback((yearKey: string, groupKey: string) => {
    const nextMask: ColumnNotOfferedMap = JSON.parse(JSON.stringify(columnNotOffered));
    if (!nextMask[yearKey]) nextMask[yearKey] = {};
    nextMask[yearKey][groupKey] = true;
    setValue("columnNotOffered", nextMask, { shouldDirty: true });
    const next: ProgramMatrix = JSON.parse(JSON.stringify(matrix));
    for (const p of programs) {
      if (!next[p.id]) next[p.id] = {};
      if (!next[p.id][yearKey]) next[p.id][yearKey] = {};
      next[p.id][yearKey][groupKey] = null;
    }
    setValue("programEnrollmentMatrix", next, { shouldDirty: true });
  }, [columnNotOffered, matrix, programs, setValue]);

  const isColumnNotOffered = useCallback((yearKey: string, groupKey: string): boolean => {
    return Boolean(columnNotOffered[yearKey]?.[groupKey]);
  }, [columnNotOffered]);

  // "Restore" clears the mask so cells in the column are editable again.
  // Cells stay null (rendered as the — placeholder) so the founder can
  // click any one to enter a number, mirroring the row-level untoggle.
  const restoreColumn = useCallback((yearKey: string, groupKey: string) => {
    const nextMask: ColumnNotOfferedMap = JSON.parse(JSON.stringify(columnNotOffered));
    if (!nextMask[yearKey]) nextMask[yearKey] = {};
    nextMask[yearKey][groupKey] = false;
    setValue("columnNotOffered", nextMask, { shouldDirty: true });
  }, [columnNotOffered, setValue]);

  // Sum matrix row → program-year total, treating null as 0 (skipped).
  const sumProgramYear = useCallback((programId: string, yearKey: string): number => {
    if (!hasMatrix) return 0;
    let sum = 0;
    for (const gk of matrixGroupKeys) {
      const v = matrix[programId]?.[yearKey]?.[gk];
      if (typeof v === "number" && Number.isFinite(v)) sum += v;
    }
    return sum;
  }, [hasMatrix, matrix, matrixGroupKeys]);

  const totalsByYear = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const key of allColumnKeys) {
      if (hasMatrix) {
        // Sum across all programs from the matrix; the matrix is the source
        // of truth when grouping is active.
        totals[key] = programs.reduce((sum, p) => sum + sumProgramYear(p.id, key), 0);
      } else {
        totals[key] = programs.reduce((sum, p) => sum + ((p as Record<string, unknown>)[key] as number || 0), 0);
      }
    }
    return totals;
  }, [programs, allColumnKeys, hasMatrix, sumProgramYear]);

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

  const retentionRate = watch("enrollment.retentionRate");
  const applicationsReceived = watch("enrollment.applicationsReceived") || 0;
  const waitlistCount = watch("enrollment.waitlistCount") || 0;
  const year1Total = totalsByYear["year1"] || 0;
  const isOperatingSchool = !isNewSchool;

  const existingProgramNames = new Set(programs.map(p => p.name));
  const availableSuggestions = SUGGESTED_PROGRAMS.filter(s => !existingProgramNames.has(s));

  // Keep enrollment.yearN in sync with the sum of program.yearN. Primitive
  // sums in deps avoid reference churn from RHF's watch().
  const py1 = programs.reduce((s, p) => s + (p.year1 || 0), 0);
  const py2 = programs.reduce((s, p) => s + (p.year2 || 0), 0);
  const py3 = programs.reduce((s, p) => s + (p.year3 || 0), 0);
  const py4 = programs.reduce((s, p) => s + (p.year4 || 0), 0);
  const py5 = programs.reduce((s, p) => s + (p.year5 || 0), 0);
  useEffect(() => {
    setValue("enrollment.year1", py1, { shouldDirty: true });
    setValue("enrollment.year2", py2, { shouldDirty: true });
    setValue("enrollment.year3", py3, { shouldDirty: true });
    setValue("enrollment.year4", py4, { shouldDirty: true });
    setValue("enrollment.year5", py5, { shouldDirty: true });
  }, [py1, py2, py3, py4, py5, setValue]);

  // When the matrix is active, fan its sums into program.priorYear /
  // currentYear / yearN AND into gradeBandEnrollment so downstream revenue
  // and charter math keep working unchanged. String-hash deps protect
  // against reference churn from RHF watch().
  const matrixHash = hasMatrix ? JSON.stringify(matrix) : "";
  const activeGradesHash = activeGradeKeys.join(",");
  const matrixGroupHash = matrixGroupKeys.join(",");
  const allColumnKeysHash = allColumnKeys.join(",");
  useEffect(() => {
    if (!hasMatrix || programs.length === 0) return;

    let programDirty = false;
    const updated = programs.map((p) => {
      const next: Program = { ...p };
      for (const yk of allColumnKeys) {
        const summed = sumProgramYear(p.id, yk);
        const prev = ((next as Record<string, unknown>)[yk] as number | undefined) ?? 0;
        if (prev !== summed) {
          (next as Record<string, unknown>)[yk] = summed;
          programDirty = true;
        }
      }
      return next;
    });
    if (programDirty) {
      setValue("programs", updated, { shouldDirty: true });
    }

    const fan: Partial<Record<GradeBandKey, (number | null)[]>> = {};
    for (const band of GRADE_BAND_KEYS) {
      const arr: (number | null)[] = [0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) {
        const yk = `year${i + 1}`;
        let total = 0;
        let anyVal = false;
        for (const p of programs) {
          const direct = matrix[p.id]?.[yk]?.[band];
          if (typeof direct === "number") { total += direct; anyVal = true; }
          for (const gk of activeGradeKeys) {
            if (GRADE_TO_BAND[gk] !== band) continue;
            const v = matrix[p.id]?.[yk]?.[gk];
            if (typeof v === "number") { total += v; anyVal = true; }
          }
        }
        arr[i] = anyVal ? total : 0;
      }
      fan[band] = arr;
    }
    const current = gradeBandEnrollment;
    const same = GRADE_BAND_KEYS.every((b) => {
      const a = current[b] ?? [];
      const next = fan[b] ?? [];
      return a.length === next.length && a.every((v, idx) => (v ?? 0) === (next[idx] ?? 0));
    });
    if (!same) {
      setValue("schoolProfile.gradeBandEnrollment", fan, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMatrix, matrixHash, activeGradesHash, matrixGroupHash, allColumnKeysHash, programs.length, setValue]);

  const warnings: string[] = [];
  for (let i = 1; i < 5; i++) {
    const prev = totalsByYear[`year${i}`] || 0;
    const curr = totalsByYear[`year${i + 1}`] || 0;
    if (prev > 0 && curr > 0) {
      const growth = (curr - prev) / prev;
      if (growth > 0.25) {
        warnings.push(`${futureYearLabels[i - 1]} to ${futureYearLabels[i]} growth is ${Math.round(growth * 100)}% - over 25% year-over-year growth requires a concrete recruitment strategy to be achievable.`);
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
          {newComfort
            ? "List the schedules families can sign up for — Full Day, Half Day, 2-Day, after-school, and so on. Each one gets its own tuition. The matrix below lets you say how many students are in each grade or age band for that schedule. Don't sweat perfection — you can always come back and adjust."
            : "Add each schedule you offer with its own tuition. Use the matrix below to assign students per grade/band per program."}
        </p>
      </div>

      <WhyThisMatters
        why={newComfort
          ? "Enrollment is the engine of your model. Every other number — revenue, staffing, even rent per student — moves with it. We'd rather have your honest best guess today than a perfect number you don't have yet."
          : "Enrollment drives revenue, staffing ratios, and per-student costs. Best-guess numbers are fine; refine as data comes in."}
        revisit="Update this whenever you finish an enrollment cycle, sign a new lead family, or get a clearer sense of demand."
      />

      {programs.length === 0 && (
        <IDontKnowYet
          label="I don't have programs mapped out yet — start me with one"
          helperText="We'll add a single 'Full Day' program seeded for your school type. You can rename it, split it, or add more later."
          appliedMessage="One starter program added — rename or expand below."
          onApply={() => {
            const seeded = availableSuggestions[0] || "Full Day";
            const newProgram: Program = {
              id: `prog-${Date.now()}`,
              name: seeded,
              annualTuition: 0,
              year1: 0,
              year2: 0,
              year3: 0,
              year4: 0,
              year5: 0,
            };
            setValue("programs", [newProgram], { shouldDirty: true });
          }}
        />
      )}

      {!isNewSchool && currentStudents > 0 && programs.length > 0 && !prefillDismissed && programs.every(p => !p.year1 && !p.currentYear) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              You said you currently have {currentStudents} students enrolled.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Want to use that as a starting point? We'll set Year 1 enrollment to {currentStudents} across your first program.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  if (programs.length > 0) {
                    const updated = programs.map((p, i) =>
                      i === 0 ? { ...p, year1: currentStudents, currentYear: currentStudents } : p
                    );
                    setValue("programs", updated, { shouldDirty: true });
                  }
                  setPrefillDismissed(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                Pre-fill with {currentStudents} students
              </button>
              <button
                type="button"
                onClick={() => setPrefillDismissed(true)}
                className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
              >
                I'll enter manually
              </button>
            </div>
          </div>
        </div>
      )}

      {programs.length === 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-3">
            What programs does your{" "}
            {SCHOOL_TYPE_LABELS[schoolType] ? SCHOOL_TYPE_LABELS[schoolType].toLowerCase() : "school"} offer?
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Every school is different. Add each program you run - they can be grade bands, schedule types, or specialty offerings. Each gets its own tuition rate and enrollment numbers.
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
                    <span className="text-xs text-muted-foreground">{schoolType === "charter_school" ? "Per-Pupil Revenue:" : "Annual Tuition:"}</span>
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

      {programs.length > 0 && !hasMatrix && (
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

      {/* Per-year matrix: rows = programs, cols = active grades/bands. */}
      {programs.length > 0 && hasMatrix && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Enrollment Matrix</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {newComfort
              ? `For each year, fill in how many students you expect in each ${showGrades ? "grade" : "band"}, broken out by program (Full Day, Half Day, etc.). It's okay to leave cells blank — we'll only count what's there. If a program didn't run in an actuals year, hit "Didn't offer" instead of typing zeros.`
              : `Programs (rows) × ${showGrades && showBands ? "grades + bands" : showGrades ? "grades" : "age bands"} (cols), per year. Use "Didn't offer" for N/A in actuals.`}
          </p>

          <EnrollmentBenchmark schoolType={schoolType} maxCapacity={maxCapacity} isNewSchool={isNewSchool} />

          <div className="space-y-4">
            {allColumnKeys.map((yearKey, yearIdx) => {
              const isActuals = yearKey === "priorYear" || yearKey === "currentYear";
              const yearLabel = allColumnLabels[yearIdx];
              return (
                <div
                  key={yearKey}
                  className={cn(
                    "bg-white rounded-2xl p-4 border border-border/60 shadow-sm",
                    isActuals && "bg-secondary/10 border-secondary/40"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-display font-bold text-sm text-foreground">{yearLabel}</h4>
                    <span className="text-xs text-muted-foreground">
                      Total: <span className="font-semibold text-foreground">{totalsByYear[yearKey] || 0}</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border min-w-[140px]">
                            Program
                          </th>
                          {matrixGroupKeys.map((gk) => {
                            const colNa = isActuals && isColumnNotOffered(yearKey, gk);
                            return (
                              <th
                                key={gk}
                                className="text-center py-2 px-2 text-xs font-semibold text-foreground uppercase tracking-wider border-b border-border min-w-[72px]"
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span>{matrixGroupLabels[gk]}</span>
                                  {isActuals && (
                                    <button
                                      type="button"
                                      data-testid={`matrix-col-na-${yearKey}-${gk}`}
                                      onClick={() => (colNa ? restoreColumn(yearKey, gk) : setColumnNotOffered(yearKey, gk))}
                                      title={colNa ? "Restore this column" : "Didn't offer this in this year"}
                                      className={cn(
                                        "text-[10px] font-medium normal-case rounded px-1.5 py-0.5 border transition",
                                        colNa
                                          ? "border-primary/40 bg-primary/10 text-primary"
                                          : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                                      )}
                                    >
                                      {colNa ? "Restore" : "N/A"}
                                    </button>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                          <th className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border min-w-[64px]">
                            Row total
                          </th>
                          {isActuals && (
                            <th className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border min-w-[120px]">
                              N/A
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {programs.map((prog) => {
                          const rowNotOffered = isRowNotOffered(prog.id, yearKey);
                          return (
                            <tr key={prog.id} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="py-2 px-3 font-medium text-foreground text-sm">
                                {prog.name || "Unnamed Program"}
                              </td>
                              {matrixGroupKeys.map((gk) => {
                                const cell = getCell(prog.id, yearKey, gk);
                                const isNull = cell === null;
                                const colMasked = isActuals && isColumnNotOffered(yearKey, gk);
                                return (
                                  <td key={gk} className="py-1.5 px-1.5">
                                    {rowNotOffered || colMasked || isNull ? (
                                      <button
                                        type="button"
                                        data-testid={`matrix-cell-${prog.id}-${yearKey}-${gk}`}
                                        onClick={() => setCell(prog.id, yearKey, gk, 0)}
                                        title="Click to enter a number"
                                        className="w-full rounded-lg border border-dashed border-border bg-background px-2 py-1.5 text-sm text-center text-muted-foreground hover:border-primary hover:text-foreground"
                                      >
                                        —
                                      </button>
                                    ) : (
                                      <div className="flex items-stretch gap-1">
                                        <input
                                          type="number"
                                          data-testid={`matrix-cell-${prog.id}-${yearKey}-${gk}`}
                                          value={typeof cell === "number" ? (cell || "") : ""}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === "") {
                                              setCell(prog.id, yearKey, gk, 0);
                                            } else {
                                              setCell(prog.id, yearKey, gk, parseInt(raw) || 0);
                                            }
                                          }}
                                          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-center text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                                          placeholder="0"
                                          min={0}
                                        />
                                        {isActuals && (
                                          <button
                                            type="button"
                                            data-testid={`matrix-cell-na-${prog.id}-${yearKey}-${gk}`}
                                            onClick={() => setCell(prog.id, yearKey, gk, null)}
                                            title="Mark as N/A (didn't offer)"
                                            className="rounded-lg border border-border bg-background px-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                                          >
                                            N/A
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-3 text-center text-sm font-semibold text-foreground bg-secondary/20">
                                {sumProgramYear(prog.id, yearKey)}
                              </td>
                              {isActuals && (
                                <td className="py-2 px-3 text-center">
                                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      data-testid={`matrix-na-${prog.id}-${yearKey}`}
                                      checked={rowNotOffered}
                                      onChange={(e) => setRowNotOffered(prog.id, yearKey, e.target.checked)}
                                      className="rounded border-border"
                                    />
                                    <span>Didn't offer</span>
                                  </label>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        <tr className="bg-secondary/40 font-semibold">
                          <td className="py-2 px-3 text-sm text-foreground">Column total</td>
                          {matrixGroupKeys.map((gk) => {
                            const colTotal = programs.reduce((s, p) => {
                              const v = matrix[p.id]?.[yearKey]?.[gk];
                              return s + (typeof v === "number" ? v : 0);
                            }, 0);
                            return (
                              <td key={gk} className="py-2 px-2 text-center text-sm text-foreground">
                                {colTotal}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-center text-sm text-foreground bg-secondary/30">
                            {totalsByYear[yearKey] || 0}
                          </td>
                          {isActuals && <td />}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hide the legacy band-breakdown table when the matrix is
          already broken out by group — the matrix is the canonical view. */}
      {schoolType === "charter_school" && hasYear1Data && !hasMatrix && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">
            <span className="flex items-center gap-2">
              <School className="h-5 w-5 text-primary" />
              Grade-Band Enrollment Breakdown
            </span>
          </h3>
          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                Charter per-pupil funding often varies by grade band. Break down your enrollment by K-5, 6-8, and 9-12 so we can apply the correct per-pupil rates. Totals should match your program enrollment above.
              </p>

            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border w-40">
                      Grade Band
                    </th>
                    {futureYearLabels.map((label, i) => (
                      <th key={i} className="text-center py-2 px-2 text-xs font-semibold text-foreground uppercase tracking-wider border-b border-border">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRADE_BAND_KEYS.map((band) => {
                    const rawValues = watch(`schoolProfile.gradeBandEnrollment.${band}`) as number[] | undefined;
                    if ((band === "toddlers" || band === "preK" || band === "other") && (!rawValues || !rawValues.some((v) => (v ?? 0) > 0))) {
                      return null;
                    }
                    const bandValues = rawValues || [0, 0, 0, 0, 0];
                    const otherLabel = (watch("schoolProfile.gradeBandOtherLabel") as string | undefined) || "Other";
                    return (
                      <tr key={band} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-2 px-3 font-medium text-foreground text-sm">
                          {band === "other" ? otherLabel : GRADE_BAND_LABELS[band]}
                        </td>
                        {futureYearLabels.map((_, i) => (
                          <td key={i} className="py-1.5 px-1.5">
                            <input
                              type="number"
                              value={bandValues[i] || ""}
                              onChange={(e) => {
                                const newVals = [...bandValues];
                                newVals[i] = parseInt(e.target.value) || 0;
                                setValue(`schoolProfile.gradeBandEnrollment.${band}`, newVals, { shouldDirty: true });
                              }}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-center text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                              placeholder="0"
                              min={0}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="bg-secondary/40 font-semibold">
                    <td className="py-2 px-3 text-sm text-foreground">Band Total</td>
                    {futureYearLabels.map((_, i) => {
                      const gbe = (watch("schoolProfile.gradeBandEnrollment") as Partial<Record<GradeBandKey, number[]>> | undefined) ?? {};
                      const bandTotal = GRADE_BAND_KEYS.reduce((sum, k) => sum + (gbe[k]?.[i] ?? 0), 0);
                      const enrollTotal = totalsByYear[`year${i + 1}`] || 0;
                      const mismatch = bandTotal > 0 && enrollTotal > 0 && bandTotal !== enrollTotal;
                      return (
                        <td key={i} className={cn("py-2 px-2 text-center text-sm", mismatch ? "text-red-600" : "text-foreground")}>
                          {bandTotal}
                          {mismatch && (
                            <div className="text-[10px] text-red-500">≠ {enrollTotal}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {programs.length > 0 && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Retention & Demand
            </span>
          </h3>
          <RetentionDemandSection isOperatingSchool={isOperatingSchool} isSecondYearPlus={isSecondYearPlus} />
        </div>
      )}

      {hasYear1Data && (
        <DemandConfidenceIndicator
          retentionRate={retentionRate}
          applicationsReceived={applicationsReceived}
          waitlistCount={waitlistCount}
          year1Enrollment={year1Total}
          isOperatingSchool={isOperatingSchool}
        />
      )}
      {hasYear1Data && (
        <FinancingInsight text="Having evidence for your Year 1 enrollment - applications, waitlist data, letters of intent - strengthens your model whether you're seeking financing or not." />
      )}

      {hasYear1Data && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {schoolType === "charter_school" ? <><GlossaryTerm termKey="per_pupil" schoolType={schoolType}>Per-Pupil</GlossaryTerm> Revenue <GlossaryTerm termKey="escalation_rate" schoolType={schoolType}>Escalation</GlossaryTerm></> : <>Tuition <GlossaryTerm termKey="escalation_rate" schoolType={schoolType}>Escalation</GlossaryTerm></>}
            </span>
          </h3>

          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                {schoolType === "charter_school"
                  ? "Per-pupil funding typically increases 1-3% annually based on state funding formulas. Building this into your model ensures your revenue projections stay realistic over time."
                  : "A 3-5% annual tuition increase keeps pace with rising operating costs and is standard across the industry. Building this into your model ensures your revenue projections stay realistic over time."}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-semibold text-foreground whitespace-nowrap">
                {schoolType === "charter_school" ? "Annual Per-Pupil Increase:" : "Annual Tuition Increase:"}
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
                      <td className="py-2 px-3 text-sm">{schoolType === "charter_school" ? "Projected Per-Pupil Revenue" : "Projected Tuition Revenue"}</td>
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

      <RationaleField
        rationaleKey="enrollment:programs"
        label="Why these enrollment numbers?"
        placeholder={
          year1Total > 0
            ? `You're projecting ${year1Total} students in Year 1${
                applicationsReceived > 0
                  ? ` against ${applicationsReceived} applications`
                  : ""
              }${
                waitlistCount > 0 ? ` and a waitlist of ${waitlistCount}` : ""
              }. What anchors that — letters of intent, family interest list, current waitlist conversion, or comparable schools?`
            : "What gives you confidence in your Year 1 enrollment number — letters of intent, current waitlist, comparable launches, or community demand?"
        }
        helperText="A lender or board reviewer will read this next to your enrollment ramp. Be specific about your demand evidence."
      />
    </div>
  );
}
