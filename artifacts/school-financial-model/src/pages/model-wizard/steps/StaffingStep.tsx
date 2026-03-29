import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, Lightbulb, AlertTriangle, Users, TrendingUp, ShieldCheck, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionExplainers } from "@/components/coaching/SectionExplainers";
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
  microschool: { ratio: "1:8–1:12", staff: "2–4 staff for 15–25 students" },
  private_school: { ratio: "1:10–1:15", staff: "5–10 staff for 50–100 students" },
  charter_school: { ratio: "1:15–1:20", staff: "8–15 staff for 100–200 students" },
  learning_pod: { ratio: "1:5–1:8", staff: "1–2 staff for 5–12 students" },
  homeschool_coop: { ratio: "1:8–1:15", staff: "1–3 staff for 10–30 students" },
  tutoring_center: { ratio: "1:5–1:10", staff: "2–5 staff for 15–40 students" },
  other: { ratio: "1:10–1:15", staff: "varies by model" },
};

export function StaffingStep() {
  const { watch, setValue } = useFormContext();
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolType = (watch("schoolProfile.schoolType") || "private_school") as string;

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
  const modelBenefitsRate = (watch("staffing.benefitsRate") as number) ?? 25;

  const formRows = watch("staffingRows") as StaffingRowData[] | undefined;
  const [rows, setRows] = useState<StaffingRowData[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);

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
      const defaults = generateDefaultStaffingRows(schoolStage, fundingProfile);
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
    const newRow = createBlankStaffRow();
    syncToForm([...rows, newRow]);
    setExpandedRows((prev) => new Set(prev).add(newRow.id));
  }, [rows, syncToForm]);

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

  const totalFTE = costs.totalFTE;
  const studentStaffRatio = y1Students > 0 && totalFTE > 0 ? Math.round(y1Students / totalFTE * 10) / 10 : 0;

  const benchmark = STAFFING_BENCHMARKS[schoolType as keyof typeof STAFFING_BENCHMARKS] || STAFFING_BENCHMARKS.other;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">
          Tell Us About Your Leadership and Staff
        </h2>
        <p className="text-muted-foreground text-lg">
          Add every person on your team — full-time, part-time, and contract. Include teachers, leaders, support staff, and contractors. We'll calculate total personnel costs automatically. It's okay to start small — many great schools launch with just a founder and one or two team members.
        </p>
        <SectionExplainers section="staffing" className="mt-4" />
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground space-y-2">
            <p>
              <span className="font-semibold">Think ahead.</span>{" "}
              This roster is your Year 1 team, but your enrollment grows from{" "}
              <span className="font-semibold">{y1Students || "?"}</span> to{" "}
              <span className="font-semibold">{y5Students || "?"} students</span> by Year 5.
              {y5Students > y1Students && " You'll likely need to hire more staff as you grow."}{" "}
              The COLA rate you set in Assumptions will increase these salaries automatically each year.
            </p>
            <p className="text-muted-foreground">
              Typical {schoolType.replace(/_/g, " ")} ratio: <span className="font-medium text-foreground">{benchmark.ratio}</span> (student-to-staff). Current staffing benchmark: {benchmark.staff}.
            </p>
          </div>
        </div>
      </div>

      {costs.totalSalariesWages > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 flex items-start gap-3">
          <DollarSign className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground space-y-1">
            <p>
              <span className="font-semibold">COLA — {colaRate}% Cost of Living Adjustment</span>{" "}
              applied annually. Schools that don't plan for COLA face teacher turnover — the #1 driver of quality loss.
            </p>
            <p className="text-xs text-muted-foreground">
              Y1 total salaries: <span className="font-semibold text-foreground">${costs.totalSalariesWages.toLocaleString()}</span> → Y5: <span className="font-semibold text-foreground">${Math.round(costs.totalSalariesWages * Math.pow(1 + colaRate / 100, 4)).toLocaleString()}</span> with {colaRate}% COLA.
              {" "}Adjust the COLA rate in the Assumptions step.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-foreground space-y-1">
          <p>
            <span className="font-semibold">Use a payroll provider.</span>{" "}
            Lenders and auditors expect to see a real payroll system in place. Services like{" "}
            <span className="font-semibold">Gusto</span>,{" "}
            <span className="font-semibold">ADP</span>, or{" "}
            <span className="font-semibold">Paychex</span>{" "}
            handle tax withholding, benefits, and compliance automatically.
          </p>
          <p className="text-muted-foreground">
            Paying staff through Venmo, Zelle, or Cash App creates serious tax and legal risk — and is a red flag for any lender reviewing your financials.
          </p>
        </div>
      </div>

      {maxCapacity && y1Students > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">Building capacity: {maxCapacity} students.</span>{" "}
            {y5Students > (maxCapacity || 0) ? (
              <span className="text-amber-700">Your Year 5 enrollment ({y5Students}) exceeds building capacity. Underwriters will need to see a facility expansion plan or revised enrollment targets.</span>
            ) : (
              <span>Your enrollment fits within your building ({Math.round((y5Students / maxCapacity) * 100)}% capacity by Year 5). Lenders want to see you can grow into your space.</span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Headcount"
          value={costs.headcount.toString()}
          sublabel={`${costs.totalFTE} FTE`}
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

      {FUNCTION_CATEGORY_ORDER.map((cat) => {
        const catRows = groupedRows[cat];
        if (catRows.length === 0) return null;

        return (
          <div key={cat}>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              {FUNCTION_CATEGORY_LABELS[cat]}
            </h3>
            <div className="space-y-3">
              {catRows.map((row) => (
                <StaffCard
                  key={row.id}
                  row={row}
                  isExpanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleExpand(row.id)}
                  onUpdate={(field, value) => updateRow(row.id, field, value)}
                  onRemove={() => removeRow(row.id)}
                  enrollmentArr={enrollmentArr}
                  colaRate={colaRate}
                />
              ))}
            </div>
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
  sublabel?: string;
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

function computeEffectiveFte(row: StaffingRowData, y: number, enrollment: number): number {
  if (row.startYear && (y + 1) < row.startYear) return 0;
  if (row.endYear && (y + 1) > row.endYear) return 0;
  if (row.staffingMode === "ratio" && row.studentRatio && row.studentRatio > 0) {
    let computed = enrollment / row.studentRatio;
    if (row.minFte !== undefined) computed = Math.max(computed, row.minFte);
    if (row.maxFte !== undefined) computed = Math.min(computed, row.maxFte);
    return Math.ceil(computed * 2) / 2;
  }
  return row.fte;
}

interface StaffCardProps {
  row: StaffingRowData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (field: keyof StaffingRowData, value: string | number | boolean) => void;
  onRemove: () => void;
  enrollmentArr: number[];
  colaRate: number;
}

function StaffCard({
  row,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  enrollmentArr,
  colaRate,
}: StaffCardProps) {
  const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
  const isRatio = row.staffingMode === "ratio";
  const displayFte = isRatio ? computeEffectiveFte(row, 0, enrollmentArr[0]) : row.fte;
  const salary = Math.round(displayFte * row.annualizedRate);
  const benefits = row.benefitsEligible && !isContractNotPayrollLike
    ? Math.round(salary * (row.benefitsRate / 100))
    : 0;
  const payrollTax = !isContractNotPayrollLike
    ? Math.round(salary * (row.payrollTaxRate / 100))
    : 0;
  const totalCost = salary + benefits + payrollTax;

  return (
    <div className="rounded-xl border-2 border-border bg-card overflow-hidden transition-all">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
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
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-sm font-semibold text-foreground">
            ${totalCost.toLocaleString()}
          </span>
          {colaRate > 0 && row.annualizedRate > 0 && (
            <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Y1: ${row.annualizedRate.toLocaleString()} → Y5: ${Math.round(row.annualizedRate * Math.pow(1 + colaRate / 100, 4)).toLocaleString()} ({colaRate}% COLA)
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldInput
              label="Role / Position"
              value={row.roleName}
              onChange={(v) => onUpdate("roleName", v)}
              placeholder="e.g., Lead Teacher"
            />
            <FieldSelect
              label="Function Category"
              value={row.functionCategory}
              options={FUNCTION_CATEGORY_ORDER.map((c) => ({
                value: c,
                label: FUNCTION_CATEGORY_LABELS[c],
              }))}
              onChange={(v) => onUpdate("functionCategory", v)}
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
            />
            <FieldSelect
              label="Staffing Mode"
              value={row.staffingMode || "fixed"}
              options={[
                { value: "fixed", label: "Fixed FTE" },
                { value: "ratio", label: "Student Ratio" },
              ]}
              onChange={(v) => onUpdate("staffingMode", v)}
            />
            {!isRatio ? (
              <FieldNumber
                label="FTE"
                value={row.fte}
                onChange={(v) => onUpdate("fte", v)}
                min={0}
                max={50}
                step={0.5}
              />
            ) : (
              <FieldNumber
                label="Students per Staff"
                value={row.studentRatio || 0}
                onChange={(v) => onUpdate("studentRatio", v)}
                min={1}
                max={100}
                step={1}
              />
            )}
            <FieldNumber
              label="Annual Rate"
              value={row.annualizedRate}
              onChange={(v) => onUpdate("annualizedRate", v)}
              prefix="$"
              min={0}
            />
          </div>

          {isRatio && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Ratio-Driven Staffing Ramp</span>
              </div>
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
            />
          </div>

          {row.employmentType === "contract" && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <FieldToggle
                label="Treat as Payroll"
                checked={row.payrollLike}
                onChange={(v) => onUpdate("payrollLike", v)}
              />
              <span className="text-xs text-amber-800">
                {row.payrollLike
                  ? "This contractor is treated like payroll (subject to benefits & payroll taxes)."
                  : "This contractor flows to contracted personnel, not wages."}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/30">
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
            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
              title="Remove staff member"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
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
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-border bg-card py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
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
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer appearance-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
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
