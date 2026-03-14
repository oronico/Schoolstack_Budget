import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, DollarSign, Users, Building2, Monitor, BookOpen, Briefcase, Landmark } from "lucide-react";
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

  const staffingRows = watch("staffingRows") as StaffingRowData[] | undefined;
  const formExpenseRows = watch("expenseRows") as ExpenseRowData[] | undefined;
  const formCapitalRows = watch("capitalAndDebtRows") as CapitalDebtRowData[] | undefined;

  const [expenseRows, setExpenseRows] = useState<ExpenseRowData[]>([]);
  const [capitalRows, setCapitalRows] = useState<CapitalDebtRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);

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
        setExpandedCategories(enabledCats);
        setDefaultsApplied(true);
      }
    } else if (formExpenseRows !== undefined && Array.isArray(formExpenseRows) && formExpenseRows.length === 0 && defaultsApplied) {
      setExpenseRows([]);
    } else if (!defaultsApplied) {
      const defaults = generateDefaultExpenseRows(fundingProfile, yearCount, schoolStage);
      setExpenseRows(defaults);
      const enabledCats = new Set<string>();
      defaults.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
      setValue("expenseRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formExpenseRows, fundingProfile, schoolStage, yearCount, defaultsApplied, setValue]);

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

  const yearLabels = Array.from({ length: yearCount }, (_, i) => `Y${i + 1}`);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Expenses by Category</h2>
        <p className="text-muted-foreground text-lg">Add your operating costs, facility expenses, and any loans or capital purchases.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="People" value={formatCurrency(personnelCosts?.grandTotal || 0)} color="text-blue-600" />
        <SummaryCard label="Program" value={formatCurrency(categorySummaries["instructional_program"] || 0)} color="text-emerald-600" />
        <SummaryCard label="Technology" value={formatCurrency(categorySummaries["technology"] || 0)} color="text-violet-600" />
        <SummaryCard label="Facility" value={formatCurrency(categorySummaries["occupancy_facility"] || 0)} color="text-amber-600" />
        <SummaryCard label="Admin & Operations" value={formatCurrency(categorySummaries["administrative_general"] || 0)} color="text-rose-600" />
        <SummaryCard label="Total Operating" value={formatCurrency(totalOperating)} color="text-foreground" bold />
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
        const catRows = expenseRows.filter((r) => r.category === cat);
        const Icon = CATEGORY_ICONS[cat];
        const isExpanded = expandedCategories.has(cat);
        const enabledCount = catRows.filter((r) => r.enabled).length;

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
                {catRows.map((row) => (
                  <ExpenseLineCard key={row.id} row={row} yearCount={yearCount} yearLabels={yearLabels} onUpdate={updateExpenseRow} onRemove={removeExpenseRow} />
                ))}
                <button type="button" onClick={() => addExpenseRow(cat)} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-2">
                  <Plus className="h-4 w-4" /> Add expense line
                </button>
              </div>
            )}
          </div>
        );
      })}

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
    </div>
  );
}

function SummaryCard({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3 text-center", bold && "bg-muted/50")}>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-lg font-bold", color)}>{value}</div>
    </div>
  );
}

function ExpenseLineCard({
  row,
  yearCount,
  yearLabels,
  onUpdate,
  onRemove,
}: {
  row: ExpenseRowData;
  yearCount: number;
  yearLabels: string[];
  onUpdate: (id: string, field: keyof ExpenseRowData, value: string | number | boolean | number[]) => void;
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
