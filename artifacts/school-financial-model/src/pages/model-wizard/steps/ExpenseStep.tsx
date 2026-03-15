import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, DollarSign, Users, Building2, Monitor, BookOpen, Briefcase, Landmark, Lightbulb, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ExpenseRowData,
  type CapitalDebtRowData,
  type ExpenseCategory,
  type ExpenseDriverType,
  type SchoolStage,
  type FundingProfile,
  EXPENSE_CATEGORY_LABELS,
  OPERATING_CATEGORIES,
  DRIVER_TYPE_LABELS,
  generateDefaultExpenseRows,
  generateDefaultCapitalDebtRows,
  createBlankExpenseRow,
  createBlankCapitalDebtRow,
  calculateLoanPayment,
  getYearCount,
} from "@/lib/expense-defaults";
import {
  type StaffingRowData,
  calculatePersonnelCosts,
} from "@/lib/staffing-defaults";

const CATEGORY_ICONS: Record<ExpenseCategory, typeof DollarSign> = {
  personnel: Users,
  instructional_program: BookOpen,
  technology: Monitor,
  occupancy_facility: Building2,
  administrative_general: Briefcase,
  capital_financing: Landmark,
};

const CATEGORY_GUIDANCE: Record<string, { tip: string; common: boolean }> = {
  instructional_program: {
    tip: "Curriculum, supplies, field trips. Most schools spend $300–$800 per student here.",
    common: true,
  },
  technology: {
    tip: "Devices, software, internet. Even small schools need SIS/LMS tools — budget $150–$300 per student.",
    common: true,
  },
  occupancy_facility: {
    tip: "Rent, utilities, insurance. This is often the biggest non-personnel expense — typically 15–25% of revenue.",
    common: true,
  },
  administrative_general: {
    tip: "Marketing, legal, accounting, office supplies. Don't forget bank processing fees (~2.5% of tuition revenue).",
    common: true,
  },
  capital_financing: {
    tip: "Furniture, equipment, buildout, and any loans. New schools often need $10–25K in startup equipment.",
    common: false,
  },
};

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function annualize(amount: number, driverType: ExpenseDriverType): number {
  if (driverType === "monthly") return amount * 12;
  return amount;
}

export function ExpenseStep() {
  const { watch, setValue } = useFormContext();
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const yearCount = getYearCount(schoolStage);

  const hasManagementFee = watch("schoolProfile.hasManagementFee") as boolean | undefined;
  const managementFeePercent = watch("schoolProfile.managementFeePercent") as number | undefined;

  const staffingRows = watch("staffingRows") as StaffingRowData[] | undefined;
  const formExpenseRows = watch("expenseRows") as ExpenseRowData[] | undefined;
  const formCapitalRows = watch("capitalAndDebtRows") as CapitalDebtRowData[] | undefined;

  const enrollment = watch("enrollment") as { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number } | undefined;
  const maxCapacity = watch("schoolProfile.maxCapacity") as number | undefined;
  const y1Students = enrollment?.year1 || 0;
  const y5Students = enrollment?.year5 || 0;

  const [expenseRows, setExpenseRows] = useState<ExpenseRowData[]>([]);
  const [capitalRows, setCapitalRows] = useState<CapitalDebtRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(
    new Set(["instructional_program", "technology", "occupancy_facility", "administrative_general"])
  );

  useEffect(() => {
    if (formExpenseRows !== undefined && formExpenseRows.length > 0) {
      const adjusted = formExpenseRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      setExpenseRows(adjusted);
      if (!defaultsApplied) {
        const enabledCats = new Set<string>();
        adjusted.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
        if (formCapitalRows && formCapitalRows.some((r: CapitalDebtRowData) => r.enabled)) {
          enabledCats.add("capital_financing");
        }
        setExpandedCategories(enabledCats);
        setEnabledCategories(enabledCats);
        setShowCategoryPicker(false);
        setDefaultsApplied(true);
      } else {
        const enabledCats = new Set<string>();
        adjusted.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
        if (formCapitalRows && formCapitalRows.some((r: CapitalDebtRowData) => r.enabled)) {
          enabledCats.add("capital_financing");
        }
        setEnabledCategories(enabledCats);
      }
    } else if (formExpenseRows !== undefined && Array.isArray(formExpenseRows) && formExpenseRows.length === 0 && defaultsApplied) {
      setExpenseRows([]);
    } else if (!defaultsApplied) {
      const mgmtFee = hasManagementFee ? { enabled: true, percent: managementFeePercent || 5 } : undefined;
      const defaults = generateDefaultExpenseRows(fundingProfile, yearCount, schoolStage, mgmtFee);
      setExpenseRows(defaults);
      const enabledCats = new Set<string>();
      defaults.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
      setEnabledCategories(enabledCats);
      setValue("expenseRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formExpenseRows, fundingProfile, schoolStage, yearCount, defaultsApplied, setValue, hasManagementFee, managementFeePercent]);

  useEffect(() => {
    if (!defaultsApplied || expenseRows.length === 0) return;
    const updated = expenseRows.map((row) => {
      if (row.lineItem !== "Authorizer / Management Fee") return row;
      const shouldEnable = hasManagementFee === true;
      const pct = managementFeePercent || 5;
      return {
        ...row,
        enabled: shouldEnable,
        amounts: row.amounts.map(() => shouldEnable ? pct : row.amounts[0]),
      };
    });
    const changed = updated.some((r, i) => r.enabled !== expenseRows[i].enabled || r.amounts[0] !== expenseRows[i].amounts[0]);
    if (changed) {
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
    }
  }, [hasManagementFee, managementFeePercent, defaultsApplied]);

  const [capitalDefaultsApplied, setCapitalDefaultsApplied] = useState(false);
  useEffect(() => {
    if (formCapitalRows !== undefined && formCapitalRows.length > 0) {
      const adjusted = formCapitalRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      setCapitalRows(adjusted);
      if (!capitalDefaultsApplied) {
        setExpandedCategories((prev) => {
          const next = new Set(prev);
          if (adjusted.some((r) => r.enabled)) next.add("capital_financing");
          return next;
        });
        setCapitalDefaultsApplied(true);
      }
    } else if (formCapitalRows !== undefined && Array.isArray(formCapitalRows) && formCapitalRows.length === 0 && capitalDefaultsApplied) {
      setCapitalRows([]);
    } else if (!capitalDefaultsApplied) {
      const defaults = generateDefaultCapitalDebtRows(fundingProfile, yearCount, schoolStage);
      setCapitalRows(defaults);
      if (defaults.some((r) => r.enabled)) {
        setExpandedCategories((prev) => new Set(prev).add("capital_financing"));
      }
      setValue("capitalAndDebtRows", defaults, { shouldDirty: true });
      setCapitalDefaultsApplied(true);
    }
  }, [formCapitalRows, fundingProfile, schoolStage, yearCount, capitalDefaultsApplied, setValue]);

  const syncExpenseRows = useCallback((updated: ExpenseRowData[]) => {
    setExpenseRows(updated);
    setValue("expenseRows", updated, { shouldDirty: true });
  }, [setValue]);

  const syncCapitalRows = useCallback((updated: CapitalDebtRowData[]) => {
    setCapitalRows(updated);
    setValue("capitalAndDebtRows", updated, { shouldDirty: true });
  }, [setValue]);

  const updateExpenseRow = useCallback((id: string, field: keyof ExpenseRowData, value: string | number | boolean | number[]) => {
    const updated = expenseRows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    syncExpenseRows(updated);
  }, [expenseRows, syncExpenseRows]);

  const updateCapitalRow = useCallback((id: string, field: keyof CapitalDebtRowData, value: string | number | boolean | number[]) => {
    const updated = capitalRows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    syncCapitalRows(updated);
  }, [capitalRows, syncCapitalRows]);

  const removeExpenseRow = useCallback((id: string) => {
    syncExpenseRows(expenseRows.filter((r) => r.id !== id));
  }, [expenseRows, syncExpenseRows]);

  const removeCapitalRow = useCallback((id: string) => {
    syncCapitalRows(capitalRows.filter((r) => r.id !== id));
  }, [capitalRows, syncCapitalRows]);

  const addExpenseRow = useCallback((category: ExpenseCategory) => {
    const newRow = createBlankExpenseRow(category, yearCount);
    syncExpenseRows([...expenseRows, newRow]);
  }, [expenseRows, yearCount, syncExpenseRows]);

  const addCapitalRow = useCallback(() => {
    const newRow = createBlankCapitalDebtRow(yearCount);
    syncCapitalRows([...capitalRows, newRow]);
  }, [capitalRows, yearCount, syncCapitalRows]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleCategoryEnabled = useCallback((cat: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const applyCategories = useCallback(() => {
    const updated = expenseRows.map((row) => {
      if (enabledCategories.has(row.category)) {
        return row.enabled ? row : { ...row, enabled: true };
      }
      return row.enabled ? { ...row, enabled: false } : row;
    });
    syncExpenseRows(updated);

    const capitalEnabled = enabledCategories.has("capital_financing");
    const updatedCapital = capitalRows.map((row) => ({
      ...row,
      enabled: capitalEnabled ? true : false,
    }));
    syncCapitalRows(updatedCapital);

    setExpandedCategories(new Set(enabledCategories));
    setShowCategoryPicker(false);
  }, [expenseRows, capitalRows, enabledCategories, syncExpenseRows, syncCapitalRows]);

  const personnelCosts = useMemo(() => {
    if (!staffingRows || staffingRows.length === 0) return null;
    return calculatePersonnelCosts(staffingRows);
  }, [staffingRows]);

  const categorySummaries = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const cat of OPERATING_CATEGORIES) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      sums[cat] = catRows.reduce((acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType), 0);
    }
    const capitalEnabled = capitalRows.filter((r) => r.enabled);
    sums["capital_financing"] = capitalEnabled.reduce((acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType), 0);
    return sums;
  }, [expenseRows, capitalRows]);

  const totalOperating = useMemo(() => {
    let total = (personnelCosts?.grandTotal || 0);
    for (const cat of OPERATING_CATEGORIES) {
      total += categorySummaries[cat] || 0;
    }
    return total;
  }, [personnelCosts, categorySummaries]);

  const costPerStudent = y1Students > 0 ? Math.round(totalOperating / y1Students) : 0;

  const yearLabels = Array.from({ length: yearCount }, (_, i) => `Y${i + 1}`);

  if (showCategoryPicker) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            What Does Your School Spend On?
          </h2>
          <p className="text-muted-foreground text-lg">
            Check the categories that apply to your school. We'll show you just those sections with smart defaults filled in. You can always add or remove categories later.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">Don't overthink it.</span>{" "}
            Start with the categories you know about. Most small schools have costs in all four main areas — program, tech, facility, and admin. You can always come back and adjust.
          </div>
        </div>

        <div className="space-y-3">
          {([...OPERATING_CATEGORIES, "capital_financing" as ExpenseCategory]).map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            const guidance = CATEGORY_GUIDANCE[cat];
            const isEnabled = enabledCategories.has(cat);

            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategoryEnabled(cat)}
                className={cn(
                  "w-full rounded-2xl border-2 p-5 text-left transition-all",
                  isEnabled
                    ? "border-primary/40 bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-border/80"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                    isEnabled ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Icon className={cn("h-5 w-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-bold text-lg", isEnabled ? "text-foreground" : "text-muted-foreground")}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </span>
                      {guidance?.common && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          Most schools need this
                        </span>
                      )}
                    </div>
                    {guidance && (
                      <p className="text-sm text-muted-foreground mt-1">{guidance.tip}</p>
                    )}
                  </div>
                  <div className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                    isEnabled ? "border-primary bg-primary" : "border-border"
                  )}>
                    {isEnabled && <CheckCircle2 className="h-4 w-4 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={applyCategories}
          className="w-full rounded-2xl bg-primary text-white font-semibold py-4 text-lg hover:bg-primary/90 transition-colors shadow-md"
        >
          Continue with {enabledCategories.size} {enabledCategories.size === 1 ? "category" : "categories"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Expenses by Category</h2>
        <p className="text-muted-foreground text-lg">Review your operating costs. We've filled in typical amounts — adjust them to match your school.</p>
      </div>

      {maxCapacity && y1Students > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">Building capacity: {maxCapacity} students.</span>{" "}
            Your enrollment grows from {y1Students} to {y5Students} over 5 years
            {y5Students > (maxCapacity || 0) ? (
              <span className="text-amber-700 font-semibold"> — that exceeds your building capacity. Lenders will flag this.</span>
            ) : (
              <span> ({Math.round(((maxCapacity - y5Students) / maxCapacity) * 100)}% spare capacity by Year 5 — good for underwriting).</span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="People" value={formatCurrency(personnelCosts?.grandTotal || 0)} color="text-blue-600" />
        <SummaryCard label="Program" value={formatCurrency(categorySummaries["instructional_program"] || 0)} color="text-emerald-600" />
        <SummaryCard label="Technology" value={formatCurrency(categorySummaries["technology"] || 0)} color="text-violet-600" />
        <SummaryCard label="Facility" value={formatCurrency(categorySummaries["occupancy_facility"] || 0)} color="text-amber-600" />
        <SummaryCard label="Admin & Ops" value={formatCurrency(categorySummaries["administrative_general"] || 0)} color="text-rose-600" />
        <SummaryCard label="Total Operating" value={formatCurrency(totalOperating)} color="text-foreground" bold sublabel={costPerStudent > 0 ? `${formatCurrency(costPerStudent)} / student` : undefined} />
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          <span>Showing {enabledCategories.size} expense categories</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCategoryPicker(true)}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Change categories
        </button>
      </div>

      {personnelCosts && (
        <div className="rounded-2xl border border-border bg-blue-50/50 p-5">
          <button type="button" onClick={() => toggleCategory("personnel")} className="flex items-center gap-3 w-full text-left">
            {expandedCategories.has("personnel") ? <ChevronDown className="h-5 w-5 text-blue-600" /> : <ChevronRight className="h-5 w-5 text-blue-600" />}
            <Users className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-lg text-foreground">People</span>
            <span className="ml-auto text-sm font-semibold text-blue-600">{formatCurrency(personnelCosts.grandTotal)}</span>
          </button>
          {expandedCategories.has("personnel") && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Salaries & Wages</span><span className="font-medium">{formatCurrency(personnelCosts.totalSalariesWages)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Benefits</span><span className="font-medium">{formatCurrency(personnelCosts.totalBenefits)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payroll Taxes</span><span className="font-medium">{formatCurrency(personnelCosts.totalPayrollTaxes)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contracted Personnel</span><span className="font-medium">{formatCurrency(personnelCosts.totalContractedPersonnel)}</span></div>
              <div className="flex justify-between border-t border-blue-200 pt-2 mt-2"><span className="font-semibold">Total Headcount</span><span className="font-semibold">{personnelCosts.headcount}</span></div>
              <p className="text-xs text-muted-foreground italic mt-2">Auto-populated from the Staffing step. Go back to step 4 to edit.</p>
            </div>
          )}
        </div>
      )}

      {OPERATING_CATEGORIES.map((cat) => {
        if (!enabledCategories.has(cat)) return null;
        const catRows = expenseRows.filter((r) => r.category === cat);
        const Icon = CATEGORY_ICONS[cat];
        const isExpanded = expandedCategories.has(cat);
        const enabledCount = catRows.filter((r) => r.enabled).length;
        const guidance = CATEGORY_GUIDANCE[cat];

        return (
          <div key={cat} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button type="button" onClick={() => toggleCategory(cat)} className="flex items-center gap-3 w-full text-left p-5 hover:bg-muted/30 transition-colors">
              {isExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              <Icon className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg text-foreground">{EXPENSE_CATEGORY_LABELS[cat]}</span>
              <span className="text-xs text-muted-foreground ml-2">({enabledCount} active)</span>
              <span className="ml-auto text-sm font-semibold text-primary">{formatCurrency(categorySummaries[cat] || 0)}</span>
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 space-y-3">
                {guidance && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                    <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{guidance.tip}</span>
                  </div>
                )}
                {catRows.map((row) => (
                  <ExpenseLineCard key={row.id} row={row} yearCount={yearCount} yearLabels={yearLabels} onUpdate={updateExpenseRow} onRemove={removeExpenseRow} y1Students={y1Students} />
                ))}
                <button type="button" onClick={() => addExpenseRow(cat)} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-2">
                  <Plus className="h-4 w-4" /> Add expense line
                </button>
              </div>
            )}
          </div>
        );
      })}

      {enabledCategories.has("capital_financing") && (
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/30 overflow-hidden">
          <button type="button" onClick={() => toggleCategory("capital_financing")} className="flex items-center gap-3 w-full text-left p-5 hover:bg-amber-50/50 transition-colors">
            {expandedCategories.has("capital_financing") ? <ChevronDown className="h-5 w-5 text-amber-600" /> : <ChevronRight className="h-5 w-5 text-amber-600" />}
            <Landmark className="h-5 w-5 text-amber-600" />
            <span className="font-bold text-lg text-foreground">Capital & Debt</span>
            <span className="text-xs text-muted-foreground ml-2">({capitalRows.filter((r) => r.enabled).length} active)</span>
            <span className="ml-auto text-sm font-semibold text-amber-600">{formatCurrency(categorySummaries["capital_financing"] || 0)}</span>
          </button>
          <p className="px-5 text-xs text-muted-foreground -mt-2 mb-3">These items are separated from operating expenses on financial statements.</p>

          {expandedCategories.has("capital_financing") && (
            <div className="px-5 pb-5 space-y-3">
              {capitalRows.map((row) => (
                <CapitalLineCard key={row.id} row={row} yearCount={yearCount} yearLabels={yearLabels} onUpdate={updateCapitalRow} onRemove={removeCapitalRow} />
              ))}
              <button type="button" onClick={() => addCapitalRow()} className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors mt-2">
                <Plus className="h-4 w-4" /> Add capital / debt item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bold, sublabel }: { label: string; value: string; color: string; bold?: boolean; sublabel?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-white p-4 text-center shadow-sm", bold && "bg-primary/5 border-primary/20")}>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className={cn("font-display text-xl font-bold", color)}>{value}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  );
}

function ExpenseLineCard({
  row,
  yearCount,
  yearLabels,
  onUpdate,
  onRemove,
  y1Students,
}: {
  row: ExpenseRowData;
  yearCount: number;
  yearLabels: string[];
  onUpdate: (id: string, field: keyof ExpenseRowData, value: string | number | boolean | number[]) => void;
  onRemove: (id: string) => void;
  y1Students: number;
}) {
  const [isOpen, setIsOpen] = useState(row.enabled);

  const updateAmount = (yearIdx: number, val: number) => {
    const newAmounts = [...row.amounts];
    newAmounts[yearIdx] = val;
    onUpdate(row.id, "amounts", newAmounts);
  };

  const toggleEnabled = () => {
    onUpdate(row.id, "enabled", !row.enabled);
    if (!row.enabled) setIsOpen(true);
  };

  const perStudentHint = row.driverType === "per_student" && y1Students > 0
    ? `Y1 total: ${formatCurrency((row.amounts[0] || 0) * y1Students)}`
    : row.driverType === "annual_fixed" && y1Students > 0 && row.amounts[0] > 0
      ? `≈ ${formatCurrency(Math.round(row.amounts[0] / y1Students))} / student`
      : null;

  return (
    <div className={cn("rounded-xl border p-4 transition-all", row.enabled ? "border-border bg-white" : "border-border/50 bg-muted/30 opacity-60")}>
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={row.enabled} onChange={toggleEnabled} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <input
              type="text"
              value={row.lineItem}
              onChange={(e) => onUpdate(row.id, "lineItem", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm bg-transparent border-none focus:outline-none focus:ring-0 w-full"
              placeholder="Expense line item name"
            />
          </div>
        </button>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{DRIVER_TYPE_LABELS[row.driverType]}</span>
        <button type="button" onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isOpen && row.enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-xs text-muted-foreground w-24">Driver Type</label>
            <select
              value={row.driverType}
              onChange={(e) => onUpdate(row.id, "driverType", e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
            >
              {Object.entries(DRIVER_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
              {yearLabels.map((label, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
                  <div className="relative">
                    {row.driverType === "percent_of_revenue" ? (
                      <input
                        type="number"
                        value={row.amounts[i] ?? 0}
                        onChange={(e) => updateAmount(i, parseFloat(e.target.value) || 0)}
                        className="w-full text-sm text-center border border-border rounded-lg px-2 py-1.5 bg-background pr-6"
                        step="0.1"
                      />
                    ) : (
                      <input
                        type="number"
                        value={row.amounts[i] ?? 0}
                        onChange={(e) => updateAmount(i, parseFloat(e.target.value) || 0)}
                        className="w-full text-sm text-center border border-border rounded-lg px-2 py-1.5 bg-background"
                      />
                    )}
                    {row.driverType === "percent_of_revenue" && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {row.driverType === "monthly" && (
              <div className="text-[10px] text-muted-foreground text-center mt-1">
                Y1 annual: {formatCurrency((row.amounts[0] || 0) * 12)}
              </div>
            )}
            {perStudentHint && (
              <div className="text-[10px] text-muted-foreground text-center mt-1">
                {perStudentHint}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-24">Note</label>
            <input
              type="text"
              value={row.note || ""}
              onChange={(e) => onUpdate(row.id, "note", e.target.value)}
              className="flex-1 text-xs border border-border rounded-lg px-3 py-1.5 bg-background"
              placeholder="Optional note"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CapitalLineCard({
  row,
  yearCount,
  yearLabels,
  onUpdate,
  onRemove,
}: {
  row: CapitalDebtRowData;
  yearCount: number;
  yearLabels: string[];
  onUpdate: (id: string, field: keyof CapitalDebtRowData, value: string | number | boolean | number[]) => void;
  onRemove: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(row.enabled);

  const updateAmount = (yearIdx: number, val: number) => {
    const newAmounts = [...row.amounts];
    newAmounts[yearIdx] = val;
    onUpdate(row.id, "amounts", newAmounts);
  };

  const toggleEnabled = () => {
    onUpdate(row.id, "enabled", !row.enabled);
    if (!row.enabled) setIsOpen(true);
  };

  const computedPayment = useMemo(() => {
    if (!row.isLoan) return 0;
    return calculateLoanPayment(row.loanPrincipal || 0, row.loanRate || 0, row.loanTermYears || 0);
  }, [row.isLoan, row.loanPrincipal, row.loanRate, row.loanTermYears]);

  const applyLoanPayment = () => {
    if (computedPayment > 0) {
      const newAmounts = new Array(yearCount).fill(computedPayment);
      onUpdate(row.id, "amounts", newAmounts);
    }
  };

  return (
    <div className={cn("rounded-xl border p-4 transition-all", row.enabled ? "border-amber-200 bg-white" : "border-border/50 bg-muted/30 opacity-60")}>
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={row.enabled} onChange={toggleEnabled} className="h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500" />
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <input
              type="text"
              value={row.lineItem}
              onChange={(e) => onUpdate(row.id, "lineItem", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm bg-transparent border-none focus:outline-none focus:ring-0 w-full"
              placeholder="Capital / debt item name"
            />
          </div>
        </button>
        {row.isLoan && <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">Loan</span>}
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{DRIVER_TYPE_LABELS[row.driverType]}</span>
        <button type="button" onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isOpen && row.enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-xs text-muted-foreground w-16">Type</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={row.isLoan || false}
                onChange={(e) => onUpdate(row.id, "isLoan", e.target.checked)}
                className="h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500"
              />
              <span className="text-muted-foreground">This is a loan (calculate debt service)</span>
            </label>
          </div>

          {row.isLoan && (
            <div className="bg-amber-50 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Loan Calculator</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Principal ($)</label>
                  <input
                    type="number"
                    value={row.loanPrincipal || 0}
                    onChange={(e) => onUpdate(row.id, "loanPrincipal", parseFloat(e.target.value) || 0)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                    placeholder="100000"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Annual Rate (%)</label>
                  <input
                    type="number"
                    value={row.loanRate || 0}
                    onChange={(e) => onUpdate(row.id, "loanRate", parseFloat(e.target.value) || 0)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                    step="0.25"
                    placeholder="6"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Term (Years)</label>
                  <input
                    type="number"
                    value={row.loanTermYears || 0}
                    onChange={(e) => onUpdate(row.id, "loanTermYears", parseFloat(e.target.value) || 0)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                    placeholder="10"
                  />
                </div>
              </div>
              {computedPayment > 0 && (
                <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Annual debt service: </span>
                    <span className="font-bold text-amber-700">{formatCurrency(computedPayment)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={applyLoanPayment}
                    className="text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Apply to all years
                  </button>
                </div>
              )}
            </div>
          )}

          {!row.isLoan && (
            <div className="flex items-center gap-4">
              <label className="text-xs text-muted-foreground w-16">Driver</label>
              <select
                value={row.driverType}
                onChange={(e) => onUpdate(row.id, "driverType", e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
              >
                {Object.entries(DRIVER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
              {yearLabels.map((label, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
                  <input
                    type="number"
                    value={row.amounts[i] ?? 0}
                    onChange={(e) => updateAmount(i, parseFloat(e.target.value) || 0)}
                    className="w-full text-sm text-center border border-border rounded-lg px-2 py-1.5 bg-background"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-16">Note</label>
            <input
              type="text"
              value={row.note || ""}
              onChange={(e) => onUpdate(row.id, "note", e.target.value)}
              className="flex-1 text-xs border border-border rounded-lg px-3 py-1.5 bg-background"
              placeholder="Optional note"
            />
          </div>
        </div>
      )}
    </div>
  );
}
