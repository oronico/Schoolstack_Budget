import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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

export function StaffingStep() {
  const { watch, setValue } = useFormContext();
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;

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

  const syncToForm = useCallback(
    (updatedRows: StaffingRowData[]) => {
      setRows(updatedRows);
      setValue("staffingRows", updatedRows, { shouldDirty: true });
    },
    [setValue]
  );

  const updateRow = useCallback(
    (id: string, field: keyof StaffingRowData, value: string | number | boolean) => {
      const updated = rows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
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

  const costs = useMemo(() => calculatePersonnelCosts(rows), [rows]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">
          Staffing Plan
        </h2>
        <p className="text-muted-foreground text-lg">
          Add the people who help run the school. Include every role — full-time,
          part-time, and contracted.
        </p>
      </div>

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
        />
      </div>

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
        "rounded-xl border p-3 text-center",
        highlight
          ? "bg-primary/5 border-primary/20"
          : "bg-secondary/30 border-border/50"
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-bold mt-0.5",
          highlight ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground">{sublabel}</div>
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
}

function StaffCard({
  row,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
}: StaffCardProps) {
  const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
  const salary = Math.round(row.fte * row.annualizedRate);
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
            {EMPLOYMENT_TYPE_LABELS[row.employmentType]} · {row.fte} FTE
          </span>
        </div>
        <span className="text-sm font-semibold text-foreground flex-shrink-0 ml-2">
          ${totalCost.toLocaleString()}
        </span>
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
            <FieldNumber
              label="FTE"
              value={row.fte}
              onChange={(v) => onUpdate("fte", v)}
              min={0}
              max={1}
              step={0.05}
            />
            <FieldNumber
              label="Annual Rate"
              value={row.annualizedRate}
              onChange={(v) => onUpdate("annualizedRate", v)}
              prefix="$"
              min={0}
            />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Computed Salary
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
            <FieldNumber
              label="Benefits Rate"
              value={row.benefitsRate}
              onChange={(v) => onUpdate("benefitsRate", v)}
              suffix="%"
              min={0}
              max={100}
              disabled={!row.benefitsEligible || isContractNotPayrollLike}
            />
            <FieldNumber
              label="Payroll Tax Rate"
              value={row.payrollTaxRate}
              onChange={(v) => onUpdate("payrollTaxRate", v)}
              suffix="%"
              min={0}
              max={100}
              disabled={isContractNotPayrollLike}
            />
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
