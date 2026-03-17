import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, DollarSign, Users, Building2, Monitor, BookOpen, Briefcase, Landmark, Lightbulb, AlertTriangle, CheckCircle2, Shield, Calculator, CreditCard, PiggyBank, Scale, Banknote, FolderPlus, Pencil, X, Tag } from "lucide-react";
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
  mergeCanonicalExpenseRows,
  mergeCanonicalCapitalRows,
  isCustomCategory,
  generateCustomCategoryKey,
} from "@/lib/expense-defaults";
import {
  type StaffingRowData,
  calculatePersonnelCosts,
} from "@/lib/staffing-defaults";

const CATEGORY_ICONS: Record<string, typeof DollarSign> = {
  personnel: Users,
  instructional_program: BookOpen,
  technology: Monitor,
  occupancy_facility: Building2,
  administrative_general: Briefcase,
  capital_financing: Landmark,
};

function getCategoryIcon(cat: string) {
  return CATEGORY_ICONS[cat] || Tag;
}

function getCategoryLabel(cat: string, customLabels: Record<string, string>): string {
  return customLabels[cat] || EXPENSE_CATEGORY_LABELS[cat] || cat;
}

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

function BusinessOperationsToggle({
  checked,
  onChange,
  icon: Icon,
  label,
  description,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: typeof DollarSign;
  label: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border-2 p-4 transition-all",
      checked ? "border-primary/30 bg-primary/5" : "border-border bg-card"
    )}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex items-center gap-3 w-full text-left"
      >
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
          checked ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon className={cn("h-4 w-4", checked ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn("font-semibold text-sm", checked ? "text-foreground" : "text-muted-foreground")}>{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <div className={cn(
          "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
          checked ? "border-primary bg-primary" : "border-border"
        )}>
          {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
        </div>
      </button>
      {checked && children && (
        <div className="mt-3 ml-12">{children}</div>
      )}
    </div>
  );
}

export function ExpenseStep() {
  const { watch, setValue } = useFormContext();
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const yearCount = getYearCount(schoolStage);

  const hasManagementFee = watch("schoolProfile.hasManagementFee") as boolean | undefined;
  const managementFeePercent = watch("schoolProfile.managementFeePercent") as number | undefined;

  const hasBookkeeper = watch("schoolProfile.hasBookkeeper") as boolean | undefined;
  const bookkeeperMonthlyCost = watch("schoolProfile.bookkeeperMonthlyCost") as number | undefined;
  const hasLawyer = watch("schoolProfile.hasLawyer") as boolean | undefined;
  const lawyerMonthlyCost = watch("schoolProfile.lawyerMonthlyCost") as number | undefined;
  const hasGeneralLiabilityInsurance = watch("schoolProfile.hasGeneralLiabilityInsurance") as boolean | undefined;
  const insuranceCost = watch("schoolProfile.insuranceCost") as number | undefined;
  const hasSavingsAccount = watch("schoolProfile.hasSavingsAccount") as boolean | undefined;
  const hasBusinessAccount = watch("schoolProfile.hasBusinessAccount") as boolean | undefined;
  const hasCreditCard = watch("schoolProfile.hasCreditCard") as boolean | undefined;
  const hasLoan = watch("schoolProfile.hasLoan") as boolean | undefined;
  const loanAmount = watch("schoolProfile.loanAmount") as number | undefined;
  const loanRate = watch("schoolProfile.loanRate") as number | undefined;
  const loanTermYears = watch("schoolProfile.loanTermYears") as number | undefined;

  const staffingRows = watch("staffingRows") as StaffingRowData[] | undefined;
  const formExpenseRows = watch("expenseRows") as ExpenseRowData[] | undefined;
  const formCapitalRows = watch("capitalAndDebtRows") as CapitalDebtRowData[] | undefined;

  const enrollment = watch("enrollment") as { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number } | undefined;
  const maxCapacity = watch("schoolProfile.maxCapacity") as number | undefined;
  const y1Students = enrollment?.year1 || 0;
  const y5Students = enrollment?.year5 || 0;

  const formCustomLabels = watch("customCategoryLabels") as Record<string, string> | undefined;

  const [expenseRows, setExpenseRows] = useState<ExpenseRowData[]>([]);
  const [capitalRows, setCapitalRows] = useState<CapitalDebtRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(
    new Set(["instructional_program", "technology", "occupancy_facility", "administrative_general"])
  );
  const [customCategoryLabels, setCustomCategoryLabels] = useState<Record<string, string>>(formCustomLabels || {});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  useEffect(() => {
    if (formCustomLabels && Object.keys(formCustomLabels).length > 0) {
      setCustomCategoryLabels(formCustomLabels);
    }
  }, [formCustomLabels]);

  const syncCustomLabels = useCallback((labels: Record<string, string>) => {
    setCustomCategoryLabels(labels);
    setValue("customCategoryLabels", labels, { shouldDirty: true });
  }, [setValue]);

  const customCategories = useMemo(() => {
    return Object.keys(customCategoryLabels);
  }, [customCategoryLabels]);

  const allOperatingCategories = useMemo(() => {
    return [...OPERATING_CATEGORIES, ...customCategories];
  }, [customCategories]);

  const addCustomCategory = useCallback((name: string) => {
    if (!name.trim()) return;
    const key = generateCustomCategoryKey();
    const newLabels = { ...customCategoryLabels, [key]: name.trim() };
    syncCustomLabels(newLabels);
    setEnabledCategories((prev) => new Set(prev).add(key));
    setExpandedCategories((prev) => new Set(prev).add(key));
    const newRow = createBlankExpenseRow(key, yearCount);
    syncExpenseRows([...expenseRows, newRow]);
    setNewCategoryName("");
    setShowAddCategory(false);
  }, [customCategoryLabels, yearCount, expenseRows, syncCustomLabels]);

  const renameCustomCategory = useCallback((key: string, newName: string) => {
    if (!newName.trim()) return;
    const newLabels = { ...customCategoryLabels, [key]: newName.trim() };
    syncCustomLabels(newLabels);
    setEditingCategoryKey(null);
    setEditingCategoryName("");
  }, [customCategoryLabels, syncCustomLabels]);

  const removeCustomCategory = useCallback((key: string) => {
    const newLabels = { ...customCategoryLabels };
    delete newLabels[key];
    syncCustomLabels(newLabels);
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    syncExpenseRows(expenseRows.filter((r) => r.category !== key));
  }, [customCategoryLabels, expenseRows, syncCustomLabels]);

  useEffect(() => {
    if (formExpenseRows !== undefined && formExpenseRows.length > 0) {
      const rawAdjusted = formExpenseRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      const adjusted = mergeCanonicalExpenseRows(rawAdjusted, yearCount);
      if (adjusted.length !== formExpenseRows.length) {
        setValue("expenseRows", adjusted, { shouldDirty: true });
      }
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

  useEffect(() => {
    if (!defaultsApplied || expenseRows.length === 0) return;
    let changed = false;
    const updated = expenseRows.map((row) => {
      if (row.lineItem === "Bookkeeper") {
        const shouldEnable = hasBookkeeper === true;
        const cost = bookkeeperMonthlyCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          return { ...row, enabled: shouldEnable, amounts: row.amounts.map(() => cost) };
        }
      }
      if (row.lineItem === "Lawyer / Legal Counsel") {
        const shouldEnable = hasLawyer === true;
        const cost = lawyerMonthlyCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          return { ...row, enabled: shouldEnable, amounts: row.amounts.map(() => cost) };
        }
      }
      if (row.lineItem === "General Liability Insurance") {
        const shouldEnable = hasGeneralLiabilityInsurance === true;
        const cost = insuranceCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          return { ...row, enabled: shouldEnable, amounts: row.amounts.map(() => cost) };
        }
      }
      return row;
    });
    if (changed) {
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
    }
    if (hasBookkeeper === true || hasLawyer === true) {
      if (!enabledCategories.has("administrative_general")) {
        setEnabledCategories((prev) => new Set(prev).add("administrative_general"));
        setExpandedCategories((prev) => new Set(prev).add("administrative_general"));
      }
    }
    if (hasGeneralLiabilityInsurance === true) {
      if (!enabledCategories.has("occupancy_facility")) {
        setEnabledCategories((prev) => new Set(prev).add("occupancy_facility"));
        setExpandedCategories((prev) => new Set(prev).add("occupancy_facility"));
      }
    }
  }, [hasBookkeeper, bookkeeperMonthlyCost, hasLawyer, lawyerMonthlyCost, hasGeneralLiabilityInsurance, insuranceCost, defaultsApplied, enabledCategories]);

  useEffect(() => {
    if (!defaultsApplied || capitalRows.length === 0) return;
    const debtRow = capitalRows.find((r) => r.lineItem === "Loan / Debt Service");
    if (!debtRow) return;

    if (hasLoan !== true) {
      if (debtRow.enabled) {
        const updated = capitalRows.map((r) =>
          r.lineItem === "Loan / Debt Service"
            ? { ...r, enabled: false, amounts: r.amounts.map(() => 0) }
            : r
        );
        setCapitalRows(updated);
        setValue("capitalAndDebtRows", updated, { shouldDirty: true });
      }
      return;
    }

    if (!enabledCategories.has("capital_financing")) {
      setEnabledCategories((prev) => new Set(prev).add("capital_financing"));
      setExpandedCategories((prev) => new Set(prev).add("capital_financing"));
    }

    const principal = loanAmount || 0;
    const rate = loanRate || 0;
    const term = loanTermYears || 0;
    const annualPayment = (principal > 0 && term > 0) ? calculateLoanPayment(principal, rate, term) : 0;
    const needsUpdate = !debtRow.enabled || debtRow.amounts[0] !== annualPayment || debtRow.loanPrincipal !== principal || debtRow.loanRate !== rate || debtRow.loanTermYears !== term;
    if (needsUpdate) {
      const updated = capitalRows.map((r) =>
        r.lineItem === "Loan / Debt Service"
          ? { ...r, enabled: true, isLoan: true, loanPrincipal: principal, loanRate: rate, loanTermYears: term, amounts: r.amounts.map(() => annualPayment) }
          : r
      );
      setCapitalRows(updated);
      setValue("capitalAndDebtRows", updated, { shouldDirty: true });
    }
  }, [hasLoan, loanAmount, loanRate, loanTermYears, defaultsApplied, capitalRows, enabledCategories]);

  const [capitalDefaultsApplied, setCapitalDefaultsApplied] = useState(false);
  useEffect(() => {
    if (formCapitalRows !== undefined && formCapitalRows.length > 0) {
      const rawAdjusted = formCapitalRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      const adjusted = mergeCanonicalCapitalRows(rawAdjusted, yearCount);
      if (adjusted.length !== formCapitalRows.length) {
        setValue("capitalAndDebtRows", adjusted, { shouldDirty: true });
      }
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
    for (const cat of allOperatingCategories) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      sums[cat] = catRows.reduce((acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType), 0);
    }
    const capitalEnabled = capitalRows.filter((r) => r.enabled);
    sums["capital_financing"] = capitalEnabled.reduce((acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType), 0);
    return sums;
  }, [expenseRows, capitalRows, allOperatingCategories]);

  const totalOperating = useMemo(() => {
    let total = (personnelCosts?.grandTotal || 0);
    for (const cat of allOperatingCategories) {
      total += categorySummaries[cat] || 0;
    }
    return total;
  }, [personnelCosts, categorySummaries, allOperatingCategories]);

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
            Check the categories that apply to your school. We'll show you just those sections with smart defaults filled in. You can always add or remove categories later. Best guesses are perfectly fine — budgeting is about practice, not perfection.
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
            const Icon = getCategoryIcon(cat);
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
                        {getCategoryLabel(cat, customCategoryLabels)}
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

          {customCategories.map((cat) => {
            const isEnabled = enabledCategories.has(cat);
            return (
              <div key={cat} className={cn(
                "w-full rounded-2xl border-2 p-5 text-left transition-all",
                isEnabled
                  ? "border-primary/40 bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-border/80"
              )}>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => toggleCategoryEnabled(cat)} className="flex items-center gap-4 flex-1 text-left">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                      isEnabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Tag className={cn("h-5 w-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={cn("font-bold text-lg", isEnabled ? "text-foreground" : "text-muted-foreground")}>
                        {customCategoryLabels[cat]}
                      </span>
                      <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ml-2">
                        Custom
                      </span>
                    </div>
                    <div className={cn(
                      "h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isEnabled ? "border-primary bg-primary" : "border-border"
                    )}>
                      {isEnabled && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomCategory(cat)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {showAddCategory ? (
            <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FolderPlus className="h-5 w-5 text-primary" />
                </div>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomCategory(newCategoryName); if (e.key === "Escape") { setShowAddCategory(false); setNewCategoryName(""); } }}
                  placeholder="e.g. Fundraising, Transportation, Food Service..."
                  className="flex-1 text-lg font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 placeholder:font-normal"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => addCustomCategory(newCategoryName)}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddCategory(false); setNewCategoryName(""); }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddCategory(true)}
              className="w-full rounded-2xl border-2 border-dashed border-border p-5 text-left hover:border-primary/30 hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <FolderPlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <span className="font-bold text-lg text-muted-foreground group-hover:text-foreground transition-colors">Add Custom Category</span>
                  <p className="text-sm text-muted-foreground mt-0.5">Create your own expense category for costs specific to your school</p>
                </div>
              </div>
            </button>
          )}
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
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Expenses & Operations</h2>
        <p className="text-muted-foreground text-lg">First, a few quick questions about your business operations. Then we'll review your expense details.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">Business Operations</h3>
          <p className="text-sm text-muted-foreground">Tell us about the services and accounts you have in place. Costs you enter here will automatically appear in your expense categories below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BusinessOperationsToggle
            checked={hasBookkeeper === true}
            onChange={(v) => setValue("schoolProfile.hasBookkeeper", v, { shouldDirty: true })}
            icon={Calculator}
            label="Bookkeeper"
            description="Monthly bookkeeping or accounting service"
          >
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Monthly cost</label>
              <div className="relative max-w-[140px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  value={bookkeeperMonthlyCost || ""}
                  onChange={(e) => setValue("schoolProfile.bookkeeperMonthlyCost", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                  className="w-full text-sm border border-border rounded-lg pl-6 pr-3 py-1.5 bg-background"
                  placeholder="500"
                />
              </div>
            </div>
          </BusinessOperationsToggle>

          <BusinessOperationsToggle
            checked={hasLawyer === true}
            onChange={(v) => setValue("schoolProfile.hasLawyer", v, { shouldDirty: true })}
            icon={Scale}
            label="Lawyer"
            description="Legal counsel on retainer or recurring basis"
          >
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Monthly cost</label>
              <div className="relative max-w-[140px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  value={lawyerMonthlyCost || ""}
                  onChange={(e) => setValue("schoolProfile.lawyerMonthlyCost", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                  className="w-full text-sm border border-border rounded-lg pl-6 pr-3 py-1.5 bg-background"
                  placeholder="500"
                />
              </div>
            </div>
          </BusinessOperationsToggle>

          <BusinessOperationsToggle
            checked={hasGeneralLiabilityInsurance === true}
            onChange={(v) => setValue("schoolProfile.hasGeneralLiabilityInsurance", v, { shouldDirty: true })}
            icon={Shield}
            label="General Liability Insurance"
            description="Coverage beyond property insurance"
          >
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Annual cost</label>
              <div className="relative max-w-[140px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  value={insuranceCost || ""}
                  onChange={(e) => setValue("schoolProfile.insuranceCost", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                  className="w-full text-sm border border-border rounded-lg pl-6 pr-3 py-1.5 bg-background"
                  placeholder="2000"
                />
              </div>
            </div>
          </BusinessOperationsToggle>

          <BusinessOperationsToggle
            checked={hasSavingsAccount === true}
            onChange={(v) => setValue("schoolProfile.hasSavingsAccount", v, { shouldDirty: true })}
            icon={PiggyBank}
            label="Savings Account"
            description="A dedicated savings account for the school"
          />

          <BusinessOperationsToggle
            checked={hasBusinessAccount === true}
            onChange={(v) => setValue("schoolProfile.hasBusinessAccount", v, { shouldDirty: true })}
            icon={Banknote}
            label="Business Account"
            description="A separate business checking account"
          />

          <BusinessOperationsToggle
            checked={hasCreditCard === true}
            onChange={(v) => setValue("schoolProfile.hasCreditCard", v, { shouldDirty: true })}
            icon={CreditCard}
            label="Credit Card"
            description="A business credit card for school expenses"
          />

          <BusinessOperationsToggle
            checked={hasLoan === true}
            onChange={(v) => setValue("schoolProfile.hasLoan", v, { shouldDirty: true })}
            icon={Landmark}
            label="Loan"
            description="A business loan or line of credit"
          >
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Amount ($)</label>
                  <input
                    type="number"
                    value={loanAmount || ""}
                    onChange={(e) => setValue("schoolProfile.loanAmount", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                    placeholder="50000"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Rate (%)</label>
                  <input
                    type="number"
                    value={loanRate || ""}
                    onChange={(e) => setValue("schoolProfile.loanRate", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                    placeholder="6"
                    step="0.25"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Term (yrs)</label>
                  <input
                    type="number"
                    value={loanTermYears || ""}
                    onChange={(e) => setValue("schoolProfile.loanTermYears", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                    placeholder="10"
                  />
                </div>
              </div>
              {(loanAmount || 0) > 0 && (loanTermYears || 0) > 0 && (
                <div className="text-xs text-muted-foreground bg-amber-50 rounded-lg px-3 py-2">
                  Annual debt service: <span className="font-semibold text-amber-700">{formatCurrency(calculateLoanPayment(loanAmount || 0, loanRate || 0, loanTermYears || 0))}</span>
                  <span className="text-muted-foreground"> — auto-added to Capital & Debt below</span>
                </div>
              )}
            </div>
          </BusinessOperationsToggle>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-lg font-bold text-foreground">Management Fee</h3>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={hasManagementFee === true}
            onChange={(e) => setValue("schoolProfile.hasManagementFee", e.target.checked, { shouldDirty: true })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
          />
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground">Does your school pay a management fee to a network or back-office organization?</label>
            <p className="text-xs text-muted-foreground mt-0.5">Common for schools that are part of a charter network or management organization</p>
          </div>
        </div>
        {hasManagementFee && (
          <div className="ml-7 max-w-xs">
            <label className="text-xs text-muted-foreground block mb-1">Management Fee (% of Revenue)</label>
            <input
              type="number"
              value={managementFeePercent || ""}
              onChange={(e) => setValue("schoolProfile.managementFeePercent", parseFloat(e.target.value) || 0, { shouldDirty: true })}
              className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
              placeholder="5"
              step="0.5"
            />
            <p className="text-xs text-muted-foreground mt-1">Auto-applied to Admin & Operations expenses</p>
          </div>
        )}
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
        {customCategories.filter(c => enabledCategories.has(c)).map((cat) => (
          <SummaryCard key={cat} label={customCategoryLabels[cat]} value={formatCurrency(categorySummaries[cat] || 0)} color="text-violet-600" />
        ))}
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

      {allOperatingCategories.map((cat) => {
        if (!enabledCategories.has(cat)) return null;
        const catRows = expenseRows.filter((r) => r.category === cat);
        const Icon = getCategoryIcon(cat);
        const isExpanded = expandedCategories.has(cat);
        const enabledCount = catRows.filter((r) => r.enabled).length;
        const guidance = CATEGORY_GUIDANCE[cat];
        const isCustom = isCustomCategory(cat);
        const label = getCategoryLabel(cat, customCategoryLabels);

        return (
          <div key={cat} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center p-5 hover:bg-muted/30 transition-colors">
              <button type="button" onClick={() => toggleCategory(cat)} className="flex items-center gap-3 flex-1 text-left">
                {isExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg text-foreground">{label}</span>
                {isCustom && (
                  <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">Custom</span>
                )}
                <span className="text-xs text-muted-foreground ml-2">({enabledCount} active)</span>
                <span className="ml-auto text-sm font-semibold text-primary">{formatCurrency(categorySummaries[cat] || 0)}</span>
              </button>
              {isCustom && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => { setEditingCategoryKey(cat); setEditingCategoryName(customCategoryLabels[cat] || ""); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Rename category"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomCategory(cat)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove category"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {editingCategoryKey === cat && (
              <div className="px-5 pb-3 flex items-center gap-2">
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renameCustomCategory(cat, editingCategoryName); if (e.key === "Escape") { setEditingCategoryKey(null); setEditingCategoryName(""); } }}
                  className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                  autoFocus
                />
                <button type="button" onClick={() => renameCustomCategory(cat, editingCategoryName)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
                  Save
                </button>
                <button type="button" onClick={() => { setEditingCategoryKey(null); setEditingCategoryName(""); }} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
              </div>
            )}

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

      {!showAddCategory ? (
        <button
          type="button"
          onClick={() => setShowAddCategory(true)}
          className="w-full rounded-2xl border-2 border-dashed border-border p-4 text-center hover:border-primary/30 hover:bg-primary/5 transition-all group"
        >
          <div className="flex items-center justify-center gap-2">
            <FolderPlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Add Custom Category</span>
          </div>
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderPlus className="h-5 w-5 text-primary" />
            </div>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomCategory(newCategoryName); if (e.key === "Escape") { setShowAddCategory(false); setNewCategoryName(""); } }}
              placeholder="e.g. Fundraising, Transportation, Food Service..."
              className="flex-1 text-sm font-medium bg-transparent border-b-2 border-primary/30 outline-none py-1.5 placeholder:text-muted-foreground/50"
              autoFocus
            />
            <button
              type="button"
              onClick={() => addCustomCategory(newCategoryName)}
              disabled={!newCategoryName.trim()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAddCategory(false); setNewCategoryName(""); }}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
