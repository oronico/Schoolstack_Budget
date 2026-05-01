import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, Lightbulb, AlertTriangle, Users, TrendingUp, ShieldCheck, DollarSign, Search, X } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { RationaleField } from "@/components/coaching/RationaleField";
import { cn, formatCurrency } from "@/lib/utils";
import { formatPerStudent, formatPerFte } from "@/lib/per-student-lens";
import {
  DEFAULT_BENEFITS_RATE,
  DEFAULT_PAYROLL_TAX_RATE,
  computeEffectiveFte,
  buildCapInsightText,
  CAP_INSIGHT_MIN_SAVINGS,
} from "@workspace/finance";
import {
  getStatePayrollTaxEntry,
  getStatePayrollTaxRate,
  computePayrollTaxForSalary,
  computePayrollTaxCapSavings,
  type PayrollTaxCapInsight,
} from "@/lib/state-payroll-tax-data";
import { useAuth } from "@/lib/auth-context";
import { getFounderPersona } from "@/lib/coaching/founder-persona";
import type { FounderComfort } from "@/lib/coaching/founder-persona";
import {
  type StaffingRowData,
  type StaffingFunctionCategory,
  type EmploymentType,
  type SchoolStage,
  type FundingProfile,
  FUNCTION_CATEGORY_LABELS,
  FUNCTION_CATEGORY_ORDER,
  EMPLOYMENT_TYPE_LABELS,
  generateDefaultStaffingRows,
  createBlankStaffRow,
  calculatePersonnelCosts,
} from "@/lib/staffing-defaults";

const STAFFING_BENCHMARKS = {
  catholic_school: { ratio: "1:12–1:18", staff: "6–12 staff for 80–150 students" },
  microschool: { ratio: "1:8–1:12", staff: "2–4 staff for 15–25 students" },
  private_school: { ratio: "1:10–1:15", staff: "5–10 staff for 50–100 students" },
  charter_school: { ratio: "1:15–1:20", staff: "8–15 staff for 100–200 students" },
  learning_pod: { ratio: "1:5–1:8", staff: "1–2 staff for 5–12 students" },
  homeschool_coop: { ratio: "1:8–1:15", staff: "1–3 staff for 10–30 students" },
  tutoring_center: { ratio: "1:5–1:10", staff: "2–5 staff for 15–40 students" },
  other: { ratio: "1:10–1:15", staff: "varies by model" },
};

function CollapsibleCallout({
  icon: Icon,
  iconColor,
  borderColor,
  bgColor,
  summary,
  children,
}: {
  icon: typeof Lightbulb;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={cn("rounded-xl border overflow-hidden", borderColor, bgColor)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(!isOpen); } }}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/[0.02] transition-colors cursor-pointer"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
        <span className="text-sm flex-1">{summary}</span>
      </div>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2 ml-10">
          {children}
        </div>
      )}
    </div>
  );
}

export function StaffingStep() {
  const { watch, setValue, formState: { errors } } = useFormContext();
  const { user } = useAuth();
  const personaComfort = getFounderPersona(user).comfort;
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolType = (watch("schoolProfile.schoolType") || "private_school") as string;
  const stateCode = (watch("schoolProfile.state") || "") as string;

  const enrollment = watch("enrollment") as { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number } | undefined;
  const maxCapacity = watch("schoolProfile.maxCapacity") as number | undefined;
  const enrollmentArr = [
    enrollment?.year1 || 0,
    enrollment?.year2 || 0,
    enrollment?.year3 || 0,
    enrollment?.year4 || 0,
    enrollment?.year5 || 0,
  ];
  const y1Students = enrollmentArr[0];
  const y5Students = enrollmentArr[4];

  const colaRate = (watch("facilities.annualSalaryIncrease") as number) ?? 3;
  const modelBenefitsRate = (watch("staffing.benefitsRate") as number) ?? DEFAULT_BENEFITS_RATE;
  const modelPayrollTaxRate = (watch("staffing.payrollTaxRate") as number) ?? DEFAULT_PAYROLL_TAX_RATE;

  const formRows = watch("staffingRows") as StaffingRowData[] | undefined;
  const [rows, setRows] = useState<StaffingRowData[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (formRows !== undefined && formRows.length > 0) {
      setRows(formRows);
      if (!defaultsApplied) {
        setExpandedRows(new Set(formRows.map((r) => r.id)));
        setDefaultsApplied(true);
      }
    } else if (formRows !== undefined && Array.isArray(formRows) && formRows.length === 0 && defaultsApplied) {
      setRows([]);
    } else if (!defaultsApplied) {
      const defaults = generateDefaultStaffingRows(schoolStage, fundingProfile, stateCode);
      setRows(defaults);
      setExpandedRows(new Set(defaults.map((r) => r.id)));
      setValue("staffingRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formRows, schoolStage, fundingProfile, defaultsApplied, setValue]);

  useEffect(() => {
    if (!defaultsApplied || rows.length === 0) return;
    let changed = false;
    const updated = rows.map((r) => {
      if (!r.benefitsRateOverridden && r.benefitsRate !== modelBenefitsRate) {
        changed = true;
        return { ...r, benefitsRate: modelBenefitsRate };
      }
      return r;
    });
    if (changed) {
      setRows(updated);
      setValue("staffingRows", updated, { shouldDirty: true });
    }
  }, [modelBenefitsRate, defaultsApplied, rows]);

  useEffect(() => {
    if (!defaultsApplied || rows.length === 0) return;
    let changed = false;
    const updated = rows.map((r) => {
      if (!r.payrollTaxRateOverridden && r.payrollTaxRate !== modelPayrollTaxRate) {
        changed = true;
        return { ...r, payrollTaxRate: modelPayrollTaxRate };
      }
      return r;
    });
    if (changed) {
      setRows(updated);
      setValue("staffingRows", updated, { shouldDirty: true });
    }
  }, [modelPayrollTaxRate, defaultsApplied, rows]);

  // F1 reactive sync: when the founder picks a new state after the wizard is
  // already initialized, re-seed `payrollTaxComponents` (and the displayed
  // blended rate) for every row the user has *not* manually overridden. Rows
  // with `payrollTaxRateOverridden = true` are left alone — the user has
  // taken control of that row's tax rate. Tracked via a ref so we only run
  // on actual state changes, not on every `rows` mutation.
  const prevStateCodeRef = useRef<string>("");
  useEffect(() => {
    if (!defaultsApplied) return;
    if (prevStateCodeRef.current === stateCode) return;
    prevStateCodeRef.current = stateCode;
    if (rows.length === 0) return;

    const stateEntry = stateCode ? getStatePayrollTaxEntry(stateCode) : undefined;
    const blendedRate = stateCode ? getStatePayrollTaxRate(stateCode) : DEFAULT_PAYROLL_TAX_RATE;

    let changed = false;
    const updated = rows.map((r) => {
      if (r.payrollTaxRateOverridden) return r;
      changed = true;
      return {
        ...r,
        payrollTaxRate: blendedRate,
        payrollTaxComponents: stateEntry ? stateEntry.components.map(c => ({ ...c })) : undefined,
      };
    });
    if (changed) {
      setRows(updated);
      setValue("staffingRows", updated, { shouldDirty: true });
    }
  }, [stateCode, defaultsApplied, rows, setValue]);

  const syncToForm = useCallback(
    (updatedRows: StaffingRowData[]) => {
      setRows(updatedRows);
      setValue("staffingRows", updatedRows, { shouldDirty: true });
    },
    [setValue]
  );

  const updateRow = useCallback(
    (id: string, field: keyof StaffingRowData, value: string | number | boolean) => {
      const updated = rows.map((r) => {
        if (r.id !== id) return r;
        const patch: Partial<StaffingRowData> = { [field]: value };
        if (field === "benefitsRate") patch.benefitsRateOverridden = true;
        if (field === "payrollTaxRate") patch.payrollTaxRateOverridden = true;
        return { ...r, ...patch };
      });
      syncToForm(updated);
    },
    [rows, syncToForm]
  );

  const removeRow = useCallback(
    (id: string) => {
      syncToForm(rows.filter((r) => r.id !== id));
      setExpandedRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [rows, syncToForm]
  );

  const addRow = useCallback(() => {
    const newRow = createBlankStaffRow(stateCode);
    syncToForm([...rows, newRow]);
    setExpandedRows((prev) => new Set(prev).add(newRow.id));
  }, [rows, syncToForm, stateCode]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const costs = useMemo(() => calculatePersonnelCosts(rows, y1Students), [rows, y1Students]);

  const groupedRows = useMemo(() => {
    const groups: Record<StaffingFunctionCategory, StaffingRowData[]> = {
      instructional: [],
      school_leadership: [],
      student_support: [],
      operations: [],
      administrative: [],
      other: [],
    };
    rows.forEach((r) => {
      groups[r.functionCategory].push(r);
    });
    return groups;
  }, [rows]);

  // Quick-finder for large rosters (charter networks, multi-campus operators).
  // Hidden until the roster grows past ~10 rows so small models stay
  // unchanged. The filter narrows by role name OR category label so founders
  // can search for "Math Teacher" or "Operations" interchangeably; the jump
  // chips are an anchor index that scrolls to a category section.
  const QUICK_FINDER_THRESHOLD = 10;
  const showQuickFinder = rows.length > QUICK_FINDER_THRESHOLD;
  const filterText = filter.trim().toLowerCase();
  const isFiltering = showQuickFinder && filterText.length > 0;

  // If the founder shrinks the roster back under the threshold (e.g., bulk
  // delete), the finder hides — make sure a previously-typed filter doesn't
  // silently linger and re-engage if rows grow past 10 again later.
  useEffect(() => {
    if (!showQuickFinder && filter !== "") {
      setFilter("");
    }
  }, [showQuickFinder, filter]);

  const filteredGroups = useMemo(() => {
    if (!isFiltering) return groupedRows;
    const result: Record<StaffingFunctionCategory, StaffingRowData[]> = {
      instructional: [],
      school_leadership: [],
      student_support: [],
      operations: [],
      administrative: [],
      other: [],
    };
    for (const cat of FUNCTION_CATEGORY_ORDER) {
      const catLabel = FUNCTION_CATEGORY_LABELS[cat].toLowerCase();
      const catMatches = catLabel.includes(filterText);
      result[cat] = groupedRows[cat].filter((r) =>
        catMatches || (r.roleName || "").toLowerCase().includes(filterText)
      );
    }
    return result;
  }, [groupedRows, isFiltering, filterText]);

  const filteredCount = useMemo(
    () =>
      FUNCTION_CATEGORY_ORDER.reduce(
        (sum, cat) => sum + filteredGroups[cat].length,
        0,
      ),
    [filteredGroups],
  );

  const scrollToCategory = useCallback((cat: StaffingFunctionCategory) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`staffing-cat-${cat}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const totalFTE = costs.totalFTE;
  const studentStaffRatio = y1Students > 0 && totalFTE > 0 ? Math.round(y1Students / totalFTE * 10) / 10 : 0;

  const benchmark = STAFFING_BENCHMARKS[schoolType as keyof typeof STAFFING_BENCHMARKS] || STAFFING_BENCHMARKS.other;

  const hasLeaderWithNoSalary = useMemo(() => {
    return rows.some(
      (r) => r.functionCategory === "school_leadership" && (!r.annualizedRate || r.annualizedRate === 0)
    );
  }, [rows]);

  const hasAnyLeader = useMemo(() => {
    return rows.some((r) => r.functionCategory === "school_leadership");
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">
          Tell Us About Your Leadership and Staff
        </h2>
        <p className="text-muted-foreground text-lg">
          Add every person on your team - full-time, part-time, and contract. Include teachers, leaders, support staff, and contractors. We'll calculate total personnel costs automatically. It's okay to start small - many great schools launch with just a founder and one or two team members.
        </p>
      </div>

      <WhyThisMatters
        why="Salaries and benefits are typically the biggest line in a school budget — often 60–70% of expenses. We've pre-loaded a typical roster for your school type so you have a credible starting point even before you've made hires."
        revisit="Revisit each time you confirm a hire, change a role's hours, or update your benefits package."
      />

      <CollapsibleCallout
        icon={Lightbulb}
        iconColor="text-primary"
        borderColor="border-primary/20"
        bgColor="bg-primary/5"
        summary={<>
          <span className="font-semibold">Year 1 roster</span>
          <span className="text-muted-foreground"> — {y1Students || "?"} → {y5Students || "?"} students over 5 years. Typical ratio: {benchmark.ratio}.</span>
        </>}
      >
        <p className="text-sm text-foreground">
          This is your Year 1 team, but your enrollment grows to <span className="font-semibold">{y5Students || "?"} students</span> by Year 5.
          {y5Students > y1Students && " You'll likely need to hire more staff as you grow."}{" "}
          The COLA rate you set in Assumptions will increase these salaries automatically each year.
        </p>
        <p className="text-sm text-muted-foreground">
          Current staffing benchmark for {schoolType.replace(/_/g, " ")}: {benchmark.staff}.
        </p>
      </CollapsibleCallout>

      {costs.totalSalariesWages > 0 && (
        <CollapsibleCallout
          icon={DollarSign}
          iconColor="text-blue-600"
          borderColor="border-blue-200"
          bgColor="bg-blue-50/50"
          summary={<>
            <span className="font-semibold"><GlossaryTerm termKey="cola" schoolType={schoolType}>COLA</GlossaryTerm> {colaRate}%</span>
            <span className="text-muted-foreground"> — Y1 salaries: ${costs.totalSalariesWages.toLocaleString()} → Y5: ${Math.round(costs.totalSalariesWages * Math.pow(1 + colaRate / 100, 4)).toLocaleString()}</span>
          </>}
        >
          <p className="text-sm text-foreground">
            Keep COLA at or above your general inflation rate - if inflation outpaces COLA, your staff effectively takes a pay cut every year. Adjust the COLA rate in the Assumptions step.
          </p>
        </CollapsibleCallout>
      )}

      <CollapsibleCallout
        icon={ShieldCheck}
        iconColor="text-emerald-600"
        borderColor="border-emerald-200"
        bgColor="bg-emerald-50/50"
        summary={<>
          <span className="font-semibold">Use a payroll provider</span>
          <span className="text-muted-foreground"> — Gusto, ADP, or Paychex handle tax withholding and compliance automatically.</span>
        </>}
      >
        <p className="text-sm text-foreground">
          Paying staff through Venmo, Zelle, or Cash App creates serious tax and legal risk. A payroll provider handles tax withholding, benefits administration, and compliance automatically.
        </p>
      </CollapsibleCallout>

      {maxCapacity && y1Students > 0 && (
        <CollapsibleCallout
          icon={AlertTriangle}
          iconColor="text-amber-600"
          borderColor="border-amber-200"
          bgColor="bg-amber-50/50"
          summary={<>
            <span className="font-semibold">Building capacity: {maxCapacity} students.</span>
            <span className="text-muted-foreground">
              {" "}{y5Students > (maxCapacity || 0)
                ? `Year 5 enrollment (${y5Students}) exceeds capacity.`
                : `${Math.round((y5Students / maxCapacity) * 100)}% capacity by Year 5.`
              }
            </span>
          </>}
        >
          <p className="text-sm text-foreground">
            {y5Students > (maxCapacity || 0)
              ? "You'll want a facility expansion plan or revised enrollment targets before then."
              : "Growing into your space is a sign of smart planning."
            }
          </p>
        </CollapsibleCallout>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Headcount"
          value={costs.headcount.toString()}
          sublabel={<>{costs.totalFTE} <GlossaryTerm termKey="fte" schoolType={schoolType}>FTE</GlossaryTerm> <span className="text-[9px] text-muted-foreground">(Full-Time Equivalent - a part-time teacher working 2 days/week ≈ 0.4 FTE)</span></>}
        />
        <SummaryCard
          label="Salaries & Wages"
          value={`$${costs.totalSalariesWages.toLocaleString()}`}
        />
        <SummaryCard
          label="Benefits"
          value={`$${costs.totalBenefits.toLocaleString()}`}
        />
        <SummaryCard
          label="Payroll Taxes"
          value={`$${costs.totalPayrollTaxes.toLocaleString()}`}
          sublabel={<GlossaryTerm termKey="payroll_tax" schoolType={schoolType}>What's included?</GlossaryTerm>}
        />
        <SummaryCard
          label="Contracted Personnel"
          value={`$${costs.totalContractedPersonnel.toLocaleString()}`}
        />
        <SummaryCard
          label="Total Personnel"
          value={`$${costs.grandTotal.toLocaleString()}`}
          highlight
          sublabel={studentStaffRatio > 0 ? `${studentStaffRatio}:1 student-to-staff` : undefined}
        />
      </div>
      {studentStaffRatio > 0 && (
        <FinancingInsight text={`Your ${studentStaffRatio}:1 student-to-staff ratio is compared against industry benchmarks (${benchmark.ratio} is typical for your school type). If it's outside that range, it's worth having a clear reason why.`} />
      )}

      {hasLeaderWithNoSalary && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 px-4 py-3 flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-teal-800">
            <p>
              <span className="font-semibold">A note on founder compensation.</span>{" "}
              We notice a leadership role without a salary. If you're the head of school, pay yourself a real salary - you deserve it, and it makes your model more realistic. A budget that assumes the founder works for free isn't sustainable.
            </p>
          </div>
        </div>
      )}

      {!hasAnyLeader && rows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p>
              We don't see a school leadership role yet. Most models include a head of school or executive director - even if that's you as the founder. Adding one with a real salary makes your model more complete.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-start gap-3">
        <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Staffing guardrail:</span>{" "}
          Aim to keep total personnel costs at or below 60% of revenue. Above 65% starts to crowd out facility, program, and reserve needs. If you're above that, consider phasing roles in as enrollment grows.
        </p>
      </div>

      {y1Students > 0 && totalFTE > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Year 1:</span> {costs.headcount} staff for {y1Students} students ({studentStaffRatio}:1 ratio)
              {y5Students > y1Students && (
                <span>
                  {" · "}
                  <span className="font-medium text-foreground">Year 5:</span> You'll have{" "}
                  {y5Students} students - consider whether you'll need additional hires.
                  {y5Students / totalFTE > 15 && (
                    <span className="text-amber-600 font-medium"> Ratio would stretch to {Math.round(y5Students / totalFTE * 10) / 10}:1 without new hires.</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 && !!(errors as Record<string, unknown>)?.staffingRows && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 px-4 py-3 flex items-center gap-3" data-error="true">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          <p className="text-sm font-medium text-destructive">
            Add at least one staff member to build your financial model.
          </p>
        </div>
      )}

      {showQuickFinder && (
        <div
          className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 space-y-2.5"
          data-testid="staffing-quick-finder"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Find a staff role… (${rows.length} total)`}
                aria-label="Filter staff roles by name or category"
                data-testid="staffing-quick-finder-input"
                className="w-full rounded-lg border border-border bg-card pl-8 pr-8 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              {filter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {isFiltering && (
              <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                {filteredCount} of {rows.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mr-1">
              Jump to:
            </span>
            {FUNCTION_CATEGORY_ORDER.map((cat) => {
              const fullCount = groupedRows[cat].length;
              const visibleCount = isFiltering ? filteredGroups[cat].length : fullCount;
              if (fullCount === 0) return null;
              if (isFiltering && visibleCount === 0) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => scrollToCategory(cat)}
                  data-testid={`staffing-jump-${cat}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <span>{FUNCTION_CATEGORY_LABELS[cat]}</span>
                  <span className="text-muted-foreground">({visibleCount})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isFiltering && filteredCount === 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No staff roles match <span className="font-semibold text-foreground">"{filter.trim()}"</span>.
          {" "}
          <button
            type="button"
            onClick={() => setFilter("")}
            className="text-primary font-medium hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {FUNCTION_CATEGORY_ORDER.map((cat) => {
        const catRows = isFiltering ? filteredGroups[cat] : groupedRows[cat];
        if (catRows.length === 0) return null;

        // Per-category cost summary always reflects the full category, not
        // the filtered subset, so the founder sees the true category total
        // even while narrowing the visible row list.
        const fullCatRows = groupedRows[cat];
        const catCost = calculatePersonnelCosts(fullCatRows, y1Students);
        const catFte = fullCatRows.reduce(
          (sum, r) =>
            sum +
            (r.staffingMode === "ratio"
              ? computeEffectiveFte(r, 0, enrollmentArr[0])
              : r.fte),
          0,
        );

        return (
          <div key={cat} id={`staffing-cat-${cat}`} className="scroll-mt-4">
            <div className="flex items-baseline justify-between mb-2 gap-3">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                {FUNCTION_CATEGORY_LABELS[cat]}
                {isFiltering && (
                  <span className="ml-2 normal-case tracking-normal text-[10px] text-muted-foreground/80">
                    {catRows.length} of {groupedRows[cat].length} match
                  </span>
                )}
              </h3>
              {catCost.grandTotal > 0 && (
                <div className="text-right text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {formatCurrency(catCost.grandTotal)} Y1
                  </span>
                  {y1Students > 0 && (
                    <span> · {formatPerStudent(catCost.grandTotal, y1Students)}</span>
                  )}
                  {catFte > 0 && (
                    <span> · {formatPerFte(catCost.grandTotal, catFte)}</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {catRows.map((row) => {
                const rowIndex = rows.indexOf(row);
                const rowErrors = (errors as Record<string, unknown>)?.staffingRows as Record<string, Record<string, { message?: string }>> | undefined;
                const thisRowErrors = rowErrors?.[rowIndex] as Record<string, { message?: string }> | undefined;
                return (
                  <StaffCard
                    key={row.id}
                    row={row}
                    isExpanded={expandedRows.has(row.id)}
                    onToggleExpand={() => toggleExpand(row.id)}
                    onUpdate={(field, value) => updateRow(row.id, field, value)}
                    onRemove={() => removeRow(row.id)}
                    enrollmentArr={enrollmentArr}
                    colaRate={colaRate}
                    rowErrors={thisRowErrors}
                    schoolType={schoolType}
                    personaComfort={personaComfort}
                  />
                );
              })}
            </div>
            <RationaleField
              rationaleKey={`staffing:${cat}`}
              label={`Why this ${FUNCTION_CATEGORY_LABELS[cat].toLowerCase()} plan?`}
              placeholder={
                catCost.grandTotal > 0 && y1Students > 0
                  ? `${catCost.headcount} role${catCost.headcount === 1 ? "" : "s"} totaling ${formatCurrency(catCost.grandTotal)} Y1 (${formatPerStudent(catCost.grandTotal, y1Students)}). What anchors that — comp benchmarks, prior school experience, a hiring plan, or an org chart?`
                  : "How did you size this group — comp benchmarks, prior school experience, a hiring plan, or an org chart?"
              }
              helperText="Lenders look for a hiring plan that matches the ramp. Two sentences on the source of these roles and rates."
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm text-primary font-semibold hover:text-primary/80 transition-colors py-2"
      >
        <Plus className="h-4 w-4" /> Add Staff Member
      </button>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string;
  sublabel?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-center shadow-sm",
        highlight
          ? "bg-primary/5 border-primary/20"
          : "bg-white border-border/60"
      )}
    >
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-xl font-bold mt-1",
          highlight ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
      )}
    </div>
  );
}

interface StaffCardProps {
  row: StaffingRowData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (field: keyof StaffingRowData, value: string | number | boolean) => void;
  onRemove: () => void;
  enrollmentArr: number[];
  colaRate: number;
  rowErrors?: Record<string, { message?: string }>;
  schoolType?: string;
  personaComfort: FounderComfort | null;
}

// Per-row wage-base cap savings copy + the $1 sanity floor live in
// `@workspace/finance` (`buildCapInsightText`, `CAP_INSIGHT_MIN_SAVINGS`) so
// the wizard, the saved-scenario summary cards, and the lender / board PDFs
// all share a single source of truth (Task #322). Persona-tone snapshot
// coverage for `buildCapInsightText` lives in this artifact's vitest suite
// (Task #323) and now imports directly from `@workspace/finance`.

function StaffCard({
  row,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  enrollmentArr,
  colaRate,
  rowErrors,
  schoolType,
  personaComfort,
}: StaffCardProps) {
  const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
  const isRatio = row.staffingMode === "ratio";
  const displayFte = isRatio ? computeEffectiveFte(row, 0, enrollmentArr[0]) : row.fte;
  const salary = Math.round(displayFte * row.annualizedRate);
  const benefits = row.benefitsEligible && !isContractNotPayrollLike
    ? Math.round(salary * (row.benefitsRate / 100))
    : 0;
  // Use the same wage-base-aware math as the engine when components are
  // available and the user hasn't manually overridden the row's blended rate.
  // This keeps the per-row card total in lock-step with the personnel summary
  // and the scenario engine. Contract-not-payroll-like rows owe nothing.
  let payrollTax = 0;
  let capInsight: PayrollTaxCapInsight | null = null;
  if (!isContractNotPayrollLike) {
    if (row.payrollTaxComponents && row.payrollTaxComponents.length > 0 && !row.payrollTaxRateOverridden) {
      payrollTax = Math.round(computePayrollTaxForSalary(salary, row.payrollTaxComponents));
      // Only meaningful when the salary actually exceeds at least one wage
      // base — `computePayrollTaxCapSavings` returns null otherwise. The
      // founder shouldn't see the insight when they've manually overridden
      // the row's blended rate (the components don't drive the math then).
      capInsight = computePayrollTaxCapSavings(salary, row.payrollTaxComponents);
    } else {
      payrollTax = Math.round(salary * (row.payrollTaxRate / 100));
    }
  }
  const showCapInsight =
    capInsight !== null && Math.round(capInsight.savings) >= CAP_INSIGHT_MIN_SAVINGS;
  const totalCost = salary + benefits + payrollTax;

  const hasErrors = rowErrors && Object.keys(rowErrors).length > 0;
  const fieldId = (field: string) => `staff-${row.id}-${field}`;

  return (
    <div className={cn(
      "rounded-xl border-2 bg-card overflow-hidden transition-all",
      hasErrors ? "border-destructive" : "border-border"
    )} data-error={hasErrors ? "true" : undefined}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="font-medium text-sm text-foreground truncate">
              {row.roleName || "Untitled Role"}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {EMPLOYMENT_TYPE_LABELS[row.employmentType]} · {isRatio ? `${displayFte} FTE (ratio)` : `${row.fte} FTE`}
            </span>
            {hasErrors && !isExpanded && (
              <span className="text-xs text-destructive font-medium flex-shrink-0">Fix errors</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                ${totalCost.toLocaleString()}
              </span>
              {colaRate > 0 && row.annualizedRate > 0 && (
                <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  Y1: ${row.annualizedRate.toLocaleString()} → Y5: ${Math.round(row.annualizedRate * Math.pow(1 + colaRate / 100, 4)).toLocaleString()} ({colaRate}% COLA)
                </span>
              )}
            </div>
            {enrollmentArr[0] > 0 && totalCost > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatPerStudent(totalCost, enrollmentArr[0])}
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="px-3 py-3 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
          title="Remove staff member"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-in-out",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden" aria-hidden={!isExpanded} inert={!isExpanded || undefined}>
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldInput
              label="Role / Position"
              value={row.roleName}
              onChange={(v) => onUpdate("roleName", v)}
              placeholder="e.g., Lead Teacher"
              error={rowErrors?.roleName?.message}
              id={fieldId("roleName")}
            />
            <FieldSelect
              label="Function Category"
              value={row.functionCategory}
              options={FUNCTION_CATEGORY_ORDER.map((c) => ({
                value: c,
                label: FUNCTION_CATEGORY_LABELS[c],
              }))}
              onChange={(v) => onUpdate("functionCategory", v)}
              error={rowErrors?.functionCategory?.message}
              id={fieldId("functionCategory")}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FieldSelect
              label="Employment Type"
              value={row.employmentType}
              options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
              onChange={(v) => onUpdate("employmentType", v)}
              error={rowErrors?.employmentType?.message}
              id={fieldId("employmentType")}
            />
            <FieldSelect
              label="Staffing Mode"
              value={row.staffingMode || "fixed"}
              options={[
                { value: "fixed", label: "Fixed FTE" },
                { value: "ratio", label: "Student Ratio" },
              ]}
              onChange={(v) => onUpdate("staffingMode", v)}
              id={fieldId("staffingMode")}
              hint={row.staffingMode === "ratio" ? "Headcount adjusts with enrollment" : "Same headcount every year"}
            />
            {!isRatio ? (
              <FieldNumber
                label="FTE"
                value={row.fte}
                onChange={(v) => onUpdate("fte", v)}
                min={0}
                max={50}
                step={0.5}
                error={rowErrors?.fte?.message}
                id={fieldId("fte")}
              />
            ) : (
              <FieldNumber
                label="Students per Staff"
                value={row.studentRatio || 0}
                onChange={(v) => onUpdate("studentRatio", v)}
                min={1}
                max={100}
                step={1}
                id={fieldId("studentRatio")}
              />
            )}
            <FieldNumber
              label="Annual Rate"
              value={row.annualizedRate}
              onChange={(v) => onUpdate("annualizedRate", v)}
              prefix="$"
              min={0}
              error={rowErrors?.annualizedRate?.message}
              id={fieldId("annualizedRate")}
            />
          </div>

          {isRatio && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Ratio-Driven Staffing Ramp</span>
              </div>
              <p className="text-[11px] text-teal-700 leading-relaxed">
                This role scales automatically with enrollment. Set a student-to-staff ratio and the model will calculate <GlossaryTerm termKey="fte" schoolType={schoolType}>FTE</GlossaryTerm> for each year. As your enrollment grows in later years, this will automatically add staff to keep your ratio - which means costs go up too. That's realistic and expected.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FieldNumber
                  label="Min FTE"
                  value={row.minFte ?? 0}
                  onChange={(v) => onUpdate("minFte", v)}
                  min={0}
                  max={50}
                  step={0.5}
                />
                <FieldNumber
                  label="Max FTE"
                  value={row.maxFte ?? 50}
                  onChange={(v) => onUpdate("maxFte", v)}
                  min={0}
                  max={100}
                  step={0.5}
                />
                <FieldNumber
                  label="Start Year"
                  value={row.startYear ?? 1}
                  onChange={(v) => onUpdate("startYear", v)}
                  min={1}
                  max={5}
                  step={1}
                />
                <FieldNumber
                  label="End Year"
                  value={row.endYear ?? 5}
                  onChange={(v) => onUpdate("endYear", v)}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {enrollmentArr.map((enr, yi) => {
                  const fte = computeEffectiveFte(row, yi, enr);
                  return (
                    <div key={yi} className="text-center rounded-md bg-white border border-teal-100 py-1.5 px-1">
                      <div className="text-[10px] text-muted-foreground">Y{yi + 1}</div>
                      <div className="text-sm font-bold text-teal-700">{fte}</div>
                      <div className="text-[10px] text-muted-foreground">{enr} students</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {isRatio ? "Y1 Computed Salary" : "Computed Salary"}
              </span>
              <div className="flex items-center h-[38px] text-sm font-semibold text-foreground">
                ${salary.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <FieldToggle
              label="Benefits Eligible"
              checked={row.benefitsEligible}
              onChange={(v) => onUpdate("benefitsEligible", v)}
              disabled={isContractNotPayrollLike}
              id={fieldId("benefitsEligible")}
            />
            <div className="space-y-1">
              <FieldNumber
                label="Benefits Rate"
                value={row.benefitsRate}
                onChange={(v) => onUpdate("benefitsRate", v)}
                suffix="%"
                min={0}
                max={100}
                disabled={!row.benefitsEligible || isContractNotPayrollLike}
                error={rowErrors?.benefitsRate?.message}
                id={fieldId("benefitsRate")}
              />
              <span className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                row.benefitsRateOverridden ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
              )}>
                {row.benefitsRateOverridden ? "Custom" : "Model Default"}
              </span>
            </div>
            <div className="space-y-1">
              <FieldNumber
                label="Payroll Tax Rate"
                value={row.payrollTaxRate}
                onChange={(v) => onUpdate("payrollTaxRate", v)}
                suffix="%"
                min={0}
                max={100}
                disabled={isContractNotPayrollLike}
                error={rowErrors?.payrollTaxRate?.message}
                id={fieldId("payrollTaxRate")}
              />
              <span className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                row.payrollTaxRateOverridden ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
              )}>
                {row.payrollTaxRateOverridden ? "Custom" : "Model Default"}
              </span>
            </div>
            <FieldInput
              label="Notes"
              value={row.notes}
              onChange={(v) => onUpdate("notes", v)}
              placeholder="Optional"
              id={fieldId("notes")}
            />
          </div>

          {row.employmentType === "contract" && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <FieldToggle
                label="Treat as Payroll"
                checked={row.payrollLike}
                onChange={(v) => onUpdate("payrollLike", v)}
                id={fieldId("payrollLike")}
              />
              <span className="text-xs text-amber-800">
                {row.payrollLike
                  ? "This contractor is treated like payroll (subject to benefits & payroll taxes)."
                  : "This contractor flows to contracted personnel, not wages."}
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-border/30 space-y-1">
            <div className="flex gap-4 text-xs text-muted-foreground">
              {!isContractNotPayrollLike && (
                <>
                  <span>Benefits: ${benefits.toLocaleString()}</span>
                  <span>Payroll Taxes: ${payrollTax.toLocaleString()}</span>
                </>
              )}
              {isContractNotPayrollLike && (
                <span className="text-amber-600">Contracted (not on payroll)</span>
              )}
            </div>
            {showCapInsight && capInsight && (
              <FinancingInsight
                text={buildCapInsightText(capInsight, personaComfort)}
                className="mt-0"
              />
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "rounded-lg border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
          error ? "border-destructive" : "border-border"
        )}
      />
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step,
  disabled,
  error,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  error?: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={error ? "true" : undefined}
          className={cn(
            "w-full rounded-lg border bg-card py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
            error ? "border-destructive" : "border-border",
            prefix ? "pl-6 pr-2" : suffix ? "pl-3 pr-6" : "px-3",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  error,
  id,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  error?: string;
  id?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "rounded-lg border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer appearance-none",
          error ? "border-destructive" : "border-border"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>}
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function FieldToggle({
  label,
  checked,
  onChange,
  disabled,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "h-[38px] rounded-lg border text-sm font-medium px-3 transition-all",
          checked && !disabled
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-card border-border text-muted-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {checked ? "Yes" : "No"}
      </button>
    </div>
  );
}
