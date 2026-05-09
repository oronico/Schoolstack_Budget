import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { Plus, Trash2, ChevronDown, ChevronRight, DollarSign, Users, Building2, Monitor, BookOpen, Briefcase, Landmark, Lightbulb, AlertTriangle, CheckCircle2, Shield, Calculator, CreditCard, PiggyBank, Scale, Banknote, FolderPlus, Pencil, X, Tag, Hash, FileDown, BookOpenCheck, HelpCircle, MessageCircleQuestion, TrendingUp, RotateCcw, MapPin } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { RationaleField } from "@/components/coaching/RationaleField";
import { AssumptionConfidenceCard } from "@/components/wizard/AssumptionConfidenceCard";
import { facilityBurdenFractionOfRevenue } from "@workspace/finance";
import { ConceptExplainer } from "@/components/coaching/ConceptExplainer";
import { cn, formatCurrency } from "@/lib/utils";
import { formatPerStudent } from "@/lib/per-student-lens";
import {
  type ExpenseRowData,
  type CapitalDebtRowData,
  type ExpenseCategory,
  type ExpenseDriverType,
  type SchoolStage,
  type FundingProfile,
  type EscalationRates,
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
  COA_CATEGORY_RANGES,
  getEscalationRule,
  computeEscalatedAmounts,
  getExpenseRationale,
  STATE_ENTITY_FEE_LINE_ITEM,
  STATE_ENTITY_FEE_ROW_ID,
  LOCAL_BUSINESS_LICENSE_LINE_ITEM,
} from "@/lib/expense-defaults";
import { getStateEntityFeeProfile, buildEntityFeeAmounts } from "@/lib/state-entity-fees";
import { getLocalBusinessLicenseProfile } from "@/lib/local-business-license-data";
import type { EntityType } from "@/pages/model-wizard/schema";
import {
  type StaffingRowData,
  calculatePersonnelCosts,
} from "@/lib/staffing-defaults";
import { GUIDED_EXPENSE_QUESTIONS } from "@/lib/expense-guided-questions";
import { getSchoolTypeTrack } from "@/lib/coaching/explainers";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { useYearCount } from "@/lib/use-model-duration";

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

const CATEGORY_GUIDANCE_BASE: Record<string, { tip: string; common: boolean }> = {
  instructional_program: {
    tip: "Curriculum, supplies, field trips. Most schools spend $300–$800 per student here.",
    common: true,
  },
  technology: {
    tip: "Devices, software, internet. Even small schools need SIS/LMS tools - budget $150–$300 per student.",
    common: true,
  },
  occupancy_facility: {
    tip: "Rent, utilities, insurance. This is often the biggest non-personnel expense - typically 15–25% of revenue.",
    common: true,
  },
  administrative_general: {
    tip: "Marketing, legal, accounting, office supplies. Don't forget bank processing fees (~2.5% of tuition revenue).",
    common: true,
  },
  capital_financing: {
    tip: "FF\u0026E (furniture, fixtures \u0026 equipment), buildout, and any loans. New schools often need $10–25K in startup equipment.",
    common: false,
  },
};

const CATEGORY_GUIDANCE_BY_TRACK: Record<string, Record<string, Partial<{ tip: string }>>> = {
  charter: {
    instructional_program: { tip: "Curriculum, supplies, assessments. Charter schools typically spend $400–$900 per student. Check your charter agreement for any minimum spending requirements." },
    occupancy_facility: { tip: "Rent, utilities, insurance. Charter schools often lease commercial spaces - budget 12–20% of revenue for total occupancy." },
    administrative_general: { tip: "Marketing, legal, accounting, authorizer fees. Include any charter management organization (CMO) fees and compliance costs." },
  },
  private: {
    instructional_program: { tip: "Curriculum, textbooks, supplies, enrichment. Private schools typically spend $400–$1,000 per student. Program quality is part of your value proposition." },
    occupancy_facility: { tip: "Rent, utilities, insurance. If your space is parish- or congregation-provided, include comparable market rent for planning purposes." },
    administrative_general: { tip: "Marketing, enrollment outreach, legal, accounting. Include payment processing fees (~2.5% of tuition revenue) and financial aid administration costs." },
  },
  micro: {
    instructional_program: { tip: "Curriculum, supplies, enrichment. Micro programs often spend $200–$500 per student using creative and open-source resources." },
    technology: { tip: "Devices, software, internet. Smaller programs can often share devices - budget $100–$250 per student." },
    occupancy_facility: { tip: "Facility costs - which may be minimal for home-based or shared-space programs. Even if space is free, budget for utilities and a contingency." },
    administrative_general: { tip: "Marketing, legal, accounting. Keep it lean - many micro programs handle admin with simple tools and part-time bookkeeping." },
    capital_financing: { tip: "Furniture, equipment, and any setup costs. Micro programs typically need $3–10K in startup equipment." },
  },
};

function getCategoryGuidance(category: string, schoolTypeVal?: string): { tip: string; common: boolean } {
  const base = CATEGORY_GUIDANCE_BASE[category] || { tip: "", common: false };
  if (!schoolTypeVal) return base;
  const track = getSchoolTypeTrack(schoolTypeVal);
  const override = CATEGORY_GUIDANCE_BY_TRACK[track]?.[category];
  if (!override) return base;
  return { ...base, ...override };
}

function exportChartOfAccounts(
  expenseRows: ExpenseRowData[],
  capitalRows: CapitalDebtRowData[],
  customCategoryLabels: Record<string, string>,
) {
  const lines: string[] = ["Account Code,Account Name,Category,Type"];
  const catLabel = (cat: string) =>
    customCategoryLabels[cat] || EXPENSE_CATEGORY_LABELS[cat] || cat;

  for (const row of expenseRows) {
    if (!row.lineItem) continue;
    const code = row.accountCode || "";
    const escaped = row.lineItem.includes(",") ? `"${row.lineItem}"` : row.lineItem;
    lines.push(`${code},${escaped},${catLabel(row.category)},Expense`);
  }
  for (const row of capitalRows) {
    if (!row.lineItem) continue;
    const code = row.accountCode || "";
    const escaped = row.lineItem.includes(",") ? `"${row.lineItem}"` : row.lineItem;
    lines.push(`${code},${escaped},Capital & Debt,${row.isLoan ? "Liability" : "Asset"}`);
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Chart_of_Accounts.csv";
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}


function CollapsibleInfoBox({
  icon: Icon,
  iconColor,
  borderColor,
  bgColor,
  summary,
  children,
}: {
  icon: typeof DollarSign;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  // CFO Mode (advanced) opens advanced/source callouts by default so
  // operators see the supporting notes without an extra click; Guided
  // modes keep the original collapsed-by-default behaviour.
  const { guidanceLevel } = useShowCoach();
  const [isOpen, setIsOpen] = useState(guidanceLevel === "advanced");
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

function annualize(amount: number, driverType: ExpenseDriverType, totalFTE?: number): number {
  if (driverType === "monthly") return amount * 12;
  if (driverType === "per_fte") return amount * (totalFTE || 0);
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

const FORGOTTEN_COSTS: {
  label: string;
  category: ExpenseCategory;
  defaultAmount: number;
  driverType: ExpenseDriverType;
}[] = [
  { label: "Background Checks & Fingerprinting", category: "administrative_general", defaultAmount: 75, driverType: "per_student" },
  { label: "Liability Insurance", category: "administrative_general", defaultAmount: 5000, driverType: "annual_fixed" },
  { label: "Marketing & Enrollment Outreach", category: "administrative_general", defaultAmount: 8000, driverType: "annual_fixed" },
  { label: "Technology (Devices + WiFi)", category: "technology", defaultAmount: 300, driverType: "per_student" },
  { label: "Professional Development", category: "instructional_program", defaultAmount: 1500, driverType: "per_fte" },
  { label: "Payment Processing Fees", category: "administrative_general", defaultAmount: 3000, driverType: "annual_fixed" },
];

function ForgottenCostsPrompt({
  expenseRows,
  yearCount,
  syncExpenseRows,
}: {
  expenseRows: ExpenseRowData[];
  yearCount: number;
  syncExpenseRows: (rows: ExpenseRowData[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  const existingLineItems = useMemo(() => {
    return new Set(expenseRows.map((r) => r.lineItem.toLowerCase().trim()));
  }, [expenseRows]);

  const handleQuickAdd = useCallback((item: typeof FORGOTTEN_COSTS[number]) => {
    const newRow: ExpenseRowData = {
      id: `forgotten_${item.label.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`,
      category: item.category,
      lineItem: item.label,
      enabled: true,
      driverType: item.driverType,
      amounts: new Array(yearCount).fill(item.defaultAmount),
      note: "",
      accountCode: "",
    };
    syncExpenseRows([...expenseRows, newRow]);
    setAddedItems((prev) => new Set(prev).add(item.label));
  }, [expenseRows, yearCount, syncExpenseRows]);

  return (
    <div className={cn("rounded-xl border overflow-hidden transition-colors", isOpen ? "border-amber-200 bg-amber-50/40" : "border-border bg-card")}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-50/40 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-amber-600 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <Lightbulb className={cn("h-4 w-4 flex-shrink-0", isOpen ? "text-amber-600" : "text-muted-foreground")} />
        <span className="text-sm">
          <span className="font-semibold">Common costs schools forget</span>
          {!isOpen && <span className="text-muted-foreground"> - quick-check items you may be missing</span>}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          {FORGOTTEN_COSTS.map((item) => {
            const alreadyExists = existingLineItems.has(item.label.toLowerCase()) || addedItems.has(item.label);
            return (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                  alreadyExists
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-amber-100 bg-white hover:border-amber-300"
                )}
              >
                <div className="flex items-center gap-2">
                  {alreadyExists ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-amber-300 flex-shrink-0" />
                  )}
                  <span className={cn("text-sm", alreadyExists ? "text-emerald-700" : "text-foreground")}>
                    {item.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({item.driverType === "per_student" ? `~$${item.defaultAmount}/student` : item.driverType === "per_fte" ? `~$${item.defaultAmount.toLocaleString()}/FTE` : `~$${item.defaultAmount.toLocaleString()}/yr`})
                  </span>
                </div>
                {!alreadyExists && (
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(item)}
                    className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                )}
                {alreadyExists && (
                  <span className="text-xs text-emerald-600 font-medium">Added</span>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
            Don't worry about getting every dollar perfect - the goal is to not be surprised. You can adjust amounts in the categories below.
          </p>
        </div>
      )}
    </div>
  );
}

export function ExpenseStep({ jumpToStep }: { jumpToStep?: (step: number) => void; modelId?: number | null }) {
  const { watch, setValue, getValues } = useFormContext();
  // Task #302 / #595: New-school models never see the QuickBooks/Xero
  // name-drop in the Chart of Accounts callout — the accounting-software
  // framing is gated on the model's schoolStage (not on founder persona)
  // at the callout site below (see ~line 1636/1643).
  // Task #416 / #499: shared coach-gate hook keeps every wizard step in sync.
  const { showCoach } = useShowCoach();
  const schoolStage = (watch("schoolProfile.schoolStage") || "new_school") as SchoolStage;
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolType = (watch("schoolProfile.schoolType") || "private_school") as string;
  const stateCode = (watch("schoolProfile.state") || "") as string;
  const entityType = (watch("schoolProfile.entityType") || "") as string;
  const cityName = (watch("schoolProfile.city") || "") as string;
  const yearCountBase = getYearCount(schoolStage);
  const singleYearOverride = useYearCount();
  const yearCount = singleYearOverride < yearCountBase ? singleYearOverride : yearCountBase;

  const generalCostInflation = (watch("facilities.generalCostInflation") as number) ?? 3;
  const annualRentIncrease = (watch("facilities.annualRentIncrease") as number) ?? 3;
  const annualSalaryIncrease = (watch("facilities.annualSalaryIncrease") as number) ?? 3;
  const escalationRates: EscalationRates = useMemo(
    () => ({ generalCostInflation, annualRentIncrease }),
    [generalCostInflation, annualRentIncrease]
  );

  const hasManagementFee = watch("schoolProfile.hasManagementFee") as boolean | undefined;
  const managementFeePercent = watch("schoolProfile.managementFeePercent") as number | undefined;
  const isDiocesan = watch("schoolProfile.isDiocesan") as boolean | undefined;
  const congregationAssessment = watch("schoolProfile.congregationAssessment") as boolean | undefined;
  const hasFiscalSponsor = watch("schoolProfile.hasFiscalSponsor") as boolean | undefined;

  const hasBookkeeper = watch("schoolProfile.hasBookkeeper") as boolean | undefined;
  const bookkeeperMonthlyCost = watch("schoolProfile.bookkeeperMonthlyCost") as number | undefined;
  const hasLawyer = watch("schoolProfile.hasLawyer") as boolean | undefined;
  const lawyerMonthlyCost = watch("schoolProfile.lawyerMonthlyCost") as number | undefined;
  const hasGeneralLiabilityInsurance = watch("schoolProfile.hasGeneralLiabilityInsurance") as boolean | undefined;
  const insuranceCost = watch("schoolProfile.insuranceCost") as number | undefined;
  const hasLocalBusinessLicense = watch("schoolProfile.hasLocalBusinessLicense") as boolean | undefined;
  const localBusinessLicenseAnnualCost = watch("schoolProfile.localBusinessLicenseAnnualCost") as number | undefined;
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
  const [guidedCategories, setGuidedCategories] = useState<Set<string>>(new Set());
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, "yes" | "no" | null>>({});

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
      const faithProfile = { isDiocesan, congregationAssessment, hasFiscalSponsor };
      const entityFeeContext = stateCode && entityType ? { stateCode, entityType } : undefined;
      const defaults = generateDefaultExpenseRows(fundingProfile, yearCount, schoolStage, mgmtFee, escalationRates, faithProfile, entityFeeContext);
      setExpenseRows(defaults);
      const enabledCats = new Set<string>();
      defaults.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
      setEnabledCategories(enabledCats);
      setValue("expenseRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formExpenseRows, fundingProfile, schoolStage, yearCount, defaultsApplied, setValue, hasManagementFee, managementFeePercent, isDiocesan, congregationAssessment, hasFiscalSponsor, stateCode, entityType]);

  // F3 reactive sync: when the founder's *state OR entity type* changes after
  // the wizard has been initialized, re-sync the State Entity Filing Fees row.
  // We track the previous (state, entityType) key in a ref so this effect
  // fires *only* on those changes — never on unrelated `expenseRows` mutations.
  // That preserves any user edits to the row (amounts, notes) until they
  // actually pick a different state or entity type, at which point the
  // previous numbers would be misleading and we re-seed.
  const prevEntityFeeKeyRef = useRef<string>("");
  useEffect(() => {
    if (!defaultsApplied) return;
    const key = `${stateCode}|${entityType}`;
    if (prevEntityFeeKeyRef.current === key) return;
    prevEntityFeeKeyRef.current = key;

    const profile = stateCode && entityType
      ? getStateEntityFeeProfile(stateCode, entityType as EntityType)
      : null;

    const current = (getValues("expenseRows") as typeof expenseRows | undefined) ?? expenseRows;
    const existingIdx = current.findIndex(r => r.id === STATE_ENTITY_FEE_ROW_ID || r.lineItem === STATE_ENTITY_FEE_LINE_ITEM);

    if (!profile) {
      if (existingIdx >= 0) {
        const updated = current.filter((_, i) => i !== existingIdx);
        setExpenseRows(updated);
        setValue("expenseRows", updated, { shouldDirty: true });
      }
      return;
    }

    const newAmounts = buildEntityFeeAmounts(profile, yearCount);
    if (existingIdx >= 0) {
      const updated = current.map((r, i) =>
        i === existingIdx ? { ...r, amounts: newAmounts, note: profile.notes, enabled: true } : r
      );
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
    } else {
      const newRow = {
        id: STATE_ENTITY_FEE_ROW_ID,
        category: "administrative_general",
        lineItem: STATE_ENTITY_FEE_LINE_ITEM,
        canonicalKey: STATE_ENTITY_FEE_LINE_ITEM,
        enabled: true,
        driverType: "annual_fixed" as const,
        amounts: newAmounts,
        note: profile.notes,
        accountCode: "",
      };
      const updated = [...current, newRow];
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
      setEnabledCategories(prev => {
        const next = new Set(prev);
        next.add("administrative_general");
        return next;
      });
    }
  }, [stateCode, entityType, defaultsApplied, yearCount, setValue, getValues]);

  // Task #325 — local/city business-license starter pre-fill.
  // When the founder toggles "Local / City Business License" ON and their
  // (state, city) pair matches a curated jurisdiction in
  // `local-business-license-data.ts`, seed the Annual cost with the
  // suggested starter (instead of $0). We track the last applied suggestion
  // in a ref so we *only* re-suggest when the value still matches the prior
  // suggestion or is unset — any manual edit wins and is preserved.
  const lastLocalLicenseSuggestionRef = useRef<number | null>(null);
  // Mirrors the override-protection logic for the row's `note` citation:
  // we only clear/replace the stamped citation if it still matches the last
  // value we wrote. Any user-edited note is preserved.
  const lastLocalLicenseNoteRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasLocalBusinessLicense !== true) {
      lastLocalLicenseSuggestionRef.current = null;
      return;
    }
    const profile = getLocalBusinessLicenseProfile(stateCode, cityName);
    const current = localBusinessLicenseAnnualCost ?? 0;
    const lastSuggested = lastLocalLicenseSuggestionRef.current;
    const isUnsetOrMatchesPrior =
      current === 0 || (lastSuggested !== null && current === lastSuggested);
    if (profile && isUnsetOrMatchesPrior && current !== profile.suggestedAnnual) {
      setValue(
        "schoolProfile.localBusinessLicenseAnnualCost",
        profile.suggestedAnnual,
        { shouldDirty: true },
      );
      lastLocalLicenseSuggestionRef.current = profile.suggestedAnnual;
    } else if (!profile && lastSuggested !== null && current === lastSuggested) {
      // City changed away from a curated jurisdiction — clear the seed so
      // it doesn't carry over a misleading number.
      setValue(
        "schoolProfile.localBusinessLicenseAnnualCost",
        0,
        { shouldDirty: true },
      );
      lastLocalLicenseSuggestionRef.current = null;
    }
  }, [hasLocalBusinessLicense, stateCode, cityName, localBusinessLicenseAnnualCost, setValue]);

  // Memoized matched profile so the row-note effect and the help blurb
  // both render the same citation.
  const localBusinessLicenseProfile = useMemo(
    () => getLocalBusinessLicenseProfile(stateCode, cityName),
    [stateCode, cityName],
  );

  useEffect(() => {
    if (!defaultsApplied) return;
    const current = (getValues("expenseRows") as ExpenseRowData[] | undefined) || [];
    if (current.length === 0) return;
    const updated = current.map((row) => {
      if (row.lineItem !== "Authorizer / Management Fee") return row;
      const shouldEnable = hasManagementFee === true;
      const pct = managementFeePercent || 5;
      return {
        ...row,
        enabled: shouldEnable,
        amounts: row.amounts.map(() => shouldEnable ? pct : row.amounts[0]),
      };
    });
    const changed = updated.some((r, i) => r.enabled !== current[i].enabled || r.amounts[0] !== current[i].amounts[0]);
    if (changed) {
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
    }
  }, [hasManagementFee, managementFeePercent, defaultsApplied, getValues, setValue]);

  useEffect(() => {
    if (!defaultsApplied) return;
    const current = (getValues("expenseRows") as ExpenseRowData[] | undefined) || [];
    if (current.length === 0) return;
    let changed = false;
    const updated = current.map((row) => {
      if (row.lineItem === "Bookkeeper") {
        const shouldEnable = hasBookkeeper === true;
        const cost = bookkeeperMonthlyCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          const rule = getEscalationRule(row, escalationRates);
          return { ...row, enabled: shouldEnable, amounts: computeEscalatedAmounts(cost, yearCount, rule.rate) };
        }
      }
      if (row.lineItem === "Lawyer / Legal Counsel") {
        const shouldEnable = hasLawyer === true;
        const cost = lawyerMonthlyCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          const rule = getEscalationRule(row, escalationRates);
          return { ...row, enabled: shouldEnable, amounts: computeEscalatedAmounts(cost, yearCount, rule.rate) };
        }
      }
      if (row.lineItem === "General Liability Insurance") {
        const shouldEnable = hasGeneralLiabilityInsurance === true;
        const cost = insuranceCost || 0;
        if (row.enabled !== shouldEnable || row.amounts[0] !== cost) {
          changed = true;
          const rule = getEscalationRule(row, escalationRates);
          return { ...row, enabled: shouldEnable, amounts: computeEscalatedAmounts(cost, yearCount, rule.rate) };
        }
      }
      if (row.lineItem === LOCAL_BUSINESS_LICENSE_LINE_ITEM) {
        const shouldEnable = hasLocalBusinessLicense === true;
        const cost = localBusinessLicenseAnnualCost || 0;
        // Task #325 — when a curated (state, city) match exists, stamp the
        // row note with a "From {city} business-tax rate" citation so the
        // source is visible alongside the dollar amount in the table. When
        // the match is lost (city changed away, toggle flipped off, etc.)
        // clear the previously stamped citation so we don't leave stale
        // provenance behind. Any user-edited note is preserved by checking
        // against `lastLocalLicenseNoteRef`.
        const stampedCitation =
          shouldEnable && localBusinessLicenseProfile
            ? `From ${localBusinessLicenseProfile.city} business-tax rate - ${localBusinessLicenseProfile.basisNote}`
            : null;
        const noteIsStaleStamp =
          lastLocalLicenseNoteRef.current !== null &&
          row.note === lastLocalLicenseNoteRef.current;
        let desiredNote = row.note;
        if (stampedCitation !== null) {
          if (row.note === "" || noteIsStaleStamp) {
            desiredNote = stampedCitation;
          }
        } else if (noteIsStaleStamp) {
          desiredNote = "";
        }
        if (
          row.enabled !== shouldEnable ||
          row.amounts[0] !== cost ||
          row.note !== desiredNote
        ) {
          changed = true;
          const rule = getEscalationRule(row, escalationRates);
          if (desiredNote !== row.note) {
            lastLocalLicenseNoteRef.current =
              stampedCitation !== null ? stampedCitation : null;
          }
          return {
            ...row,
            enabled: shouldEnable,
            amounts: computeEscalatedAmounts(cost, yearCount, rule.rate),
            note: desiredNote,
          };
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
    if (hasLocalBusinessLicense === true) {
      if (!enabledCategories.has("administrative_general")) {
        setEnabledCategories((prev) => new Set(prev).add("administrative_general"));
        setExpandedCategories((prev) => new Set(prev).add("administrative_general"));
      }
    }
  }, [hasBookkeeper, bookkeeperMonthlyCost, hasLawyer, lawyerMonthlyCost, hasGeneralLiabilityInsurance, insuranceCost, hasLocalBusinessLicense, localBusinessLicenseAnnualCost, localBusinessLicenseProfile, escalationRates, yearCount, defaultsApplied, enabledCategories, getValues, setValue]);

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

  const prevRatesRef = useRef(escalationRates);
  useEffect(() => {
    if (!defaultsApplied || expenseRows.length === 0) return;
    const prev = prevRatesRef.current;
    if (prev.generalCostInflation === escalationRates.generalCostInflation && prev.annualRentIncrease === escalationRates.annualRentIncrease) return;
    prevRatesRef.current = escalationRates;

    let changed = false;
    const updated = expenseRows.map((row) => {
      const oldRule = getEscalationRule(row, prev);
      const newRule = getEscalationRule(row, escalationRates);
      if (oldRule.rate === newRule.rate) return row;
      const isPerc = row.driverType === "percent_of_revenue";
      const oldEscalated = computeEscalatedAmounts(row.amounts[0] || 0, yearCount, oldRule.rate, isPerc);
      const newEscalated = computeEscalatedAmounts(row.amounts[0] || 0, yearCount, newRule.rate, isPerc);
      const newAmounts = row.amounts.map((amt, i) => {
        if (i === 0) return amt;
        return amt === oldEscalated[i] ? newEscalated[i] : amt;
      });
      if (newAmounts.some((a, i) => a !== row.amounts[i])) {
        changed = true;
        return { ...row, amounts: newAmounts };
      }
      return row;
    });
    if (changed) {
      setExpenseRows(updated);
      setValue("expenseRows", updated, { shouldDirty: true });
    }
  }, [escalationRates, defaultsApplied]);

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

  const toggleGuidedMode = useCallback((cat: string) => {
    setGuidedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const answerQuestion = useCallback((questionId: string, answer: "yes" | "no", relatedLineItems: string[]) => {
    setAnsweredQuestions((prev) => ({ ...prev, [questionId]: answer }));
    if (answer === "yes") {
      const updated = expenseRows.map((r) => {
        const matchKey = r.canonicalKey || r.lineItem;
        if (relatedLineItems.includes(matchKey) && !r.enabled) {
          return { ...r, enabled: true };
        }
        return r;
      });
      const changed = updated.some((r, i) => r.enabled !== expenseRows[i].enabled);
      if (changed) syncExpenseRows(updated);
    }
  }, [expenseRows, syncExpenseRows]);

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
    return calculatePersonnelCosts(staffingRows, y1Students || undefined);
  }, [staffingRows, y1Students]);

  const totalFTE = useMemo(() => {
    return personnelCosts?.totalFTE || 0;
  }, [personnelCosts]);

  const categorySummaries = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const cat of allOperatingCategories) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      sums[cat] = catRows.reduce((acc, r) => {
        let total = 0;
        for (let y = 0; y < yearCount; y++) {
          total += annualize(r.amounts[y] || 0, r.driverType, totalFTE);
        }
        return acc + total;
      }, 0);
    }
    const capitalEnabled = capitalRows.filter((r) => r.enabled);
    sums["capital_financing"] = capitalEnabled.reduce((acc, r) => {
      let total = 0;
      for (let y = 0; y < yearCount; y++) {
        total += annualize(r.amounts[y] || 0, r.driverType, totalFTE);
      }
      return acc + total;
    }, 0);
    return sums;
  }, [expenseRows, capitalRows, allOperatingCategories, yearCount, totalFTE]);

  const y1CategorySums = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const cat of allOperatingCategories) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      sums[cat] = catRows.reduce(
        (acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType, totalFTE),
        0,
      );
    }
    sums["capital_financing"] = capitalRows
      .filter((r) => r.enabled)
      .reduce(
        (acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType, totalFTE),
        0,
      );
    return sums;
  }, [expenseRows, capitalRows, allOperatingCategories, totalFTE]);

  const personnel5yrTotal = useMemo(() => {
    const y1 = personnelCosts?.grandTotal || 0;
    if (y1 === 0 || yearCount <= 1) return y1;
    let sum = y1;
    for (let i = 1; i < yearCount; i++) {
      sum += Math.round(y1 * Math.pow(1 + (annualSalaryIncrease || 0) / 100, i));
    }
    return sum;
  }, [personnelCosts, yearCount, annualSalaryIncrease]);

  const totalOperating = useMemo(() => {
    let total = personnel5yrTotal;
    for (const cat of allOperatingCategories) {
      total += categorySummaries[cat] || 0;
    }
    return total;
  }, [personnel5yrTotal, categorySummaries, allOperatingCategories]);

  const y1OperatingTotal = useMemo(() => {
    let total = (personnelCosts?.grandTotal || 0);
    for (const cat of allOperatingCategories) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      total += catRows.reduce((acc, r) => acc + annualize(r.amounts[0] || 0, r.driverType, totalFTE), 0);
    }
    return total;
  }, [personnelCosts, expenseRows, allOperatingCategories, totalFTE]);
  const costPerStudent = y1Students > 0 ? Math.round(y1OperatingTotal / y1Students) : 0;

  // Task #512: live Y1 → Year-N cost ramp preview shown above the 5yr
  // summary cards. Mirrors the Extend-to-5-Year modal preview, and uses
  // the same per-row escalation logic the seeder applies (see
  // `pickExpenseRowRate` in seed-five-year.ts): an explicit per-row
  // `escalationRate` is honored, otherwise we fall back to general cost
  // inflation. Capital & debt rows are held flat, matching the seeder.
  const rampYears = yearCount;
  const y1PayrollPreview = personnelCosts?.grandTotal || 0;
  const y5PayrollPreview = useMemo(() => {
    if (y1PayrollPreview <= 0 || rampYears <= 1) return y1PayrollPreview;
    return Math.round(
      y1PayrollPreview * Math.pow(1 + (annualSalaryIncrease || 0) / 100, rampYears - 1),
    );
  }, [y1PayrollPreview, rampYears, annualSalaryIncrease]);

  const { y1NonPayrollPreview, y5NonPayrollPreview } = useMemo(() => {
    let y1Sum = 0;
    let y5Sum = 0;
    const pickRowRate = (r: ExpenseRowData): number =>
      typeof r.escalationRate === "number" ? r.escalationRate : (generalCostInflation || 0);
    for (const cat of allOperatingCategories) {
      const catRows = expenseRows.filter((r) => r.category === cat && r.enabled);
      for (const r of catRows) {
        const y1 = annualize(r.amounts[0] || 0, r.driverType, totalFTE);
        y1Sum += y1;
        const rate = pickRowRate(r);
        const y5 = rampYears <= 1
          ? y1
          : Math.round(y1 * Math.pow(1 + rate / 100, rampYears - 1));
        y5Sum += y5;
      }
    }
    // Capital/debt is intentionally excluded so this preview matches the
    // Extend-to-5-Year modal's non-payroll preview (which is built from
    // expense rows only). Keeping the two surfaces in sync prevents
    // founders from seeing different Y5 numbers in the two places.
    return { y1NonPayrollPreview: y1Sum, y5NonPayrollPreview: y5Sum };
  }, [expenseRows, allOperatingCategories, totalFTE, generalCostInflation, rampYears]);

  const yearLabels = Array.from({ length: yearCount }, (_, i) => `Y${i + 1}`);

  if (showCategoryPicker) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            What Does Your School Spend On?
          </h2>
          <p className="text-muted-foreground text-lg">
            Check the categories that apply to your school. We'll show you just those sections with smart defaults filled in. You can always add or remove categories later. Best guesses are perfectly fine - budgeting is about practice, not perfection.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">Don't overthink it.</span>{" "}
            Start with the categories you know about. Most small schools have costs in all four main areas - program, tech, facility, and admin. You can always come back and adjust.
          </div>
        </div>

        <div className="space-y-3">
          {([...OPERATING_CATEGORIES, "capital_financing" as ExpenseCategory]).map((cat) => {
            const Icon = getCategoryIcon(cat);
            const guidance = getCategoryGuidance(cat, schoolType);
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
        <p className="text-sm text-muted-foreground mt-3" data-testid="help-expenses">Include costs you must pay even if enrollment is lower than expected, especially rent, insurance, software, payroll, and professional services.</p>
        <div className="mt-3 grid gap-2 max-w-2xl">
          <ConceptExplainer concept="expense" />
          <ConceptExplainer concept="net_income" />
          <ConceptExplainer concept="facility_cost_ratio" />
        </div>
      </div>

      {showCoach && (
        <WhyThisMatters
          why="Expenses are where most first-time budgets quietly break - small categories like insurance, technology, and curriculum add up fast. We'll surface the categories typical for your school type so nothing important slips through."
          revisit="Come back when you sign a lease, switch vendors, or adopt a new curriculum."
        />
      )}

      <CollapsibleInfoBox
        icon={TrendingUp}
        iconColor="text-teal-600"
        borderColor="border-teal-200"
        bgColor="bg-teal-50/50"
        summary={<>
          <span className="font-semibold">Smart <GlossaryTerm termKey="escalation_rate" schoolType={schoolType}>Escalation</GlossaryTerm> Applied</span>
          <span className="text-muted-foreground"> - Inflation {generalCostInflation}% · Rent {annualRentIncrease}%</span>
          {jumpToStep && <button type="button" onClick={(e) => { e.stopPropagation(); jumpToStep(2); }} className="ml-2 text-teal-600 font-medium underline underline-offset-2 hover:text-teal-800 transition-colors text-xs">Adjust →</button>}
        </>}
      >
        <p className="text-sm text-foreground">
          Costs escalate realistically: leases follow contract terms, vendor costs rise with inflation, per-student expenses scale with enrollment. You can override any year.
        </p>
        <FinancingInsight text="Keep facility costs between 15–25% of revenue. Above 30% can crowd out staffing and programs." />
      </CollapsibleInfoBox>

      <ForgottenCostsPrompt
        expenseRows={expenseRows}
        yearCount={yearCount}
        syncExpenseRows={syncExpenseRows}
      />

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

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2 ml-12 -mt-1 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs text-amber-800">
              <span className="font-semibold">Reminder:</span> Liability insurance typically $1,500–$4,000/yr. Payroll taxes (8–10% of wages) are already in the Staffing step.
            </span>
          </div>

          <BusinessOperationsToggle
            checked={hasLocalBusinessLicense === true}
            onChange={(v) => setValue("schoolProfile.hasLocalBusinessLicense", v, { shouldDirty: true })}
            icon={MapPin}
            label="Local / City Business License"
            description="City or county license, B&O tax, commercial rent tax, gross receipts"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Annual cost</label>
                <div className="relative max-w-[140px]">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={localBusinessLicenseAnnualCost || ""}
                    onChange={(e) => setValue("schoolProfile.localBusinessLicenseAnnualCost", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    className="w-full text-sm border border-border rounded-lg pl-6 pr-3 py-1.5 bg-background"
                    placeholder="500"
                  />
                </div>
                {localBusinessLicenseProfile && (
                  <span className="text-[11px] text-emerald-700 font-medium">
                    From {localBusinessLicenseProfile.city} business-tax rate
                  </span>
                )}
              </div>
              {localBusinessLicenseProfile ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <span className="font-medium">{localBusinessLicenseProfile.city}, {localBusinessLicenseProfile.state}:</span> {localBusinessLicenseProfile.basisNote} You can override the amount above at any time.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <span className="font-medium">Most US cities don't require a general business license for a small school</span> - leave this at $0 unless yours does. The handful that do require one for schools include <span className="font-medium">Washington DC</span> (Basic Business License), <span className="font-medium">Seattle</span> (Business License Tax Certificate), <span className="font-medium">San Francisco</span> (Business Registration Certificate), and <span className="font-medium">Los Angeles</span> (Business Tax Registration). Confirm with your city or county clerk if you're unsure.
                </p>
              )}
            </div>
          </BusinessOperationsToggle>

          <BusinessOperationsToggle
            checked={hasSavingsAccount === true}
            onChange={(v) => setValue("schoolProfile.hasSavingsAccount", v, { shouldDirty: true })}
            icon={PiggyBank}
            label="Savings Account"
            description="A dedicated savings account for the school"
          />
          <FinancingInsight text="Aim for 45-90 days of operating reserves. A dedicated savings account is a simple way to show you're managing cash well - and it protects your school from surprises." className="ml-12 -mt-2" />
          <ConceptExplainer concept="reserves" className="ml-12" />
          <ConceptExplainer concept="break_even" className="ml-12 mt-2" />

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
                  <span className="text-muted-foreground"> - auto-added to Capital & Debt below</span>
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
              <span className="text-amber-700 font-semibold"> - that exceeds your building capacity. You'll want to address this before finalizing your plan.</span>
            ) : (
              <span> ({Math.round(((maxCapacity - y5Students) / maxCapacity) * 100)}% spare capacity by Year 5 - room to grow).</span>
            )}
          </div>
        </div>
      )}

      {rampYears > 1 && (y1PayrollPreview > 0 || y1NonPayrollPreview > 0) && (
        <div
          data-testid="expense-ramp-preview"
          className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Year 1 → Year {rampYears} preview
            </span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              · updates live as you edit salaries and cost rates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {y1PayrollPreview > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Payroll</span>
                <span className="tabular-nums text-sm font-medium text-foreground">
                  <span data-testid="expense-ramp-payroll-y1">{formatCurrency(y1PayrollPreview)}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span data-testid="expense-ramp-payroll-y5">{formatCurrency(y5PayrollPreview)}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    @ {annualSalaryIncrease}%/yr
                  </span>
                </span>
              </div>
            )}
            {y1NonPayrollPreview > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Expenses (non-payroll)</span>
                <span className="tabular-nums text-sm font-medium text-foreground">
                  <span data-testid="expense-ramp-nonpayroll-y1">{formatCurrency(y1NonPayrollPreview)}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span data-testid="expense-ramp-nonpayroll-y5">{formatCurrency(y5NonPayrollPreview)}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    per-row escalation
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="People (5yr)" value={formatCurrency(personnel5yrTotal)} color="text-blue-600" />
        <SummaryCard label="Program (5yr)" value={formatCurrency(categorySummaries["instructional_program"] || 0)} color="text-emerald-600" />
        <SummaryCard label="Technology (5yr)" value={formatCurrency(categorySummaries["technology"] || 0)} color="text-violet-600" />
        <SummaryCard label="Facility (5yr)" value={formatCurrency(categorySummaries["occupancy_facility"] || 0)} color="text-amber-600" />
        <SummaryCard label="Admin & Ops (5yr)" value={formatCurrency(categorySummaries["administrative_general"] || 0)} color="text-rose-600" />
        {customCategories.filter(c => enabledCategories.has(c)).map((cat) => (
          <SummaryCard key={cat} label={`${customCategoryLabels[cat]} (5yr)`} value={formatCurrency(categorySummaries[cat] || 0)} color="text-violet-600" />
        ))}
        <SummaryCard label="Total Operating (5yr)" value={formatCurrency(totalOperating)} color="text-foreground" bold sublabel={costPerStudent > 0 ? `${formatCurrency(costPerStudent)} / student (Y1)` : undefined} />
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

      <CollapsibleInfoBox
        icon={BookOpenCheck}
        iconColor="text-indigo-600"
        borderColor="border-indigo-200"
        bgColor="bg-indigo-50/50"
        summary={<>
          <span className="font-semibold">Chart of Accounts</span>
          <span className="text-muted-foreground">
            {/* Task #595: bookkeeper/QuickBooks framing follows the model's
                schoolStage, not the founder persona. An operating-school
                model already has live books regardless of who's editing. */}
            {schoolStage === "new_school"
              ? " - Pre-filled account codes you can hand to a bookkeeper later"
              : " - Pre-filled account codes align with QuickBooks/Xero"}
          </span>
        </>}
      >
        <p className="text-sm text-foreground">
          {schoolStage === "new_school"
            ? <>Each expense line has an optional account code (<Hash className="h-3 w-3 inline text-muted-foreground" /> field). Once you're ready to start tracking the books, you can hand these codes to whoever is keeping your books so your budget and bookkeeping line up from day one.</>
            : <>Each expense line has an optional account code (<Hash className="h-3 w-3 inline text-muted-foreground" /> field). Customize codes to match your accounting software - your budget will align with bookkeeping from day one.</>}
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(COA_CATEGORY_RANGES).map(([, info]) => (
            <span key={info.range} className="text-[10px] font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
              {info.range}: {info.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => exportChartOfAccounts(expenseRows, capitalRows, customCategoryLabels)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <FileDown className="h-3.5 w-3.5" /> Export Chart of Accounts (CSV)
        </button>
      </CollapsibleInfoBox>

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
        const guidance = getCategoryGuidance(cat, schoolType);
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
                <div className="ml-auto text-right">
                  <span className="text-sm font-semibold text-primary">{formatCurrency(categorySummaries[cat] || 0)} <span className="text-[10px] font-normal text-muted-foreground">5yr</span></span>
                  {y1Students > 0 && y1CategorySums[cat] > 0 && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      Y1 {formatPerStudent(y1CategorySums[cat], y1Students)}
                    </div>
                  )}
                </div>
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
                {!isCustom && GUIDED_EXPENSE_QUESTIONS.some((cq) => cq.category === cat) && (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleGuidedMode(cat)}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors",
                        guidedCategories.has(cat)
                          ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      <MessageCircleQuestion className="h-3.5 w-3.5" />
                      {guidedCategories.has(cat) ? "Guided mode on" : "Help me think through this"}
                    </button>
                  </div>
                )}
                {guidedCategories.has(cat) && (
                  <GuidedQuestionPanel
                    category={cat}
                    answeredQuestions={answeredQuestions}
                    onAnswer={answerQuestion}
                  />
                )}
                {catRows.map((row) => (
                  <ExpenseLineCard key={row.id} row={row} yearCount={yearCount} yearLabels={yearLabels} onUpdate={updateExpenseRow} onRemove={removeExpenseRow} y1Students={y1Students} totalFTE={totalFTE} escalationRates={escalationRates} />
                ))}
                <button type="button" onClick={() => addExpenseRow(cat)} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-2">
                  <Plus className="h-4 w-4" /> Add expense line
                </button>
                <RationaleField
                  rationaleKey={`expenses:${cat}`}
                  label={`Why these ${label.toLowerCase()} numbers?`}
                  placeholder={
                    y1CategorySums[cat] > 0 && y1Students > 0
                      ? `${formatCurrency(y1CategorySums[cat])} in Y1 (${formatPerStudent(y1CategorySums[cat], y1Students)}). What anchors that - quotes, signed contracts, vendor bids, or comparable schools?`
                      : "Where did these numbers come from - quotes, signed contracts, vendor bids, or comparable school benchmarks?"
                  }
                  helperText="A reviewer should see your evidence - a recent quote, a vendor bid, or a defensible benchmark."
                />
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
            <div className="flex-1 min-w-0">
              <span className="font-bold text-lg text-foreground">Capital & Debt</span>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                <GlossaryTerm termKey="ffe" schoolType={schoolType}>FF&E</GlossaryTerm> (Furniture, Fixtures & Equipment - desks, chairs, whiteboards, etc.) · <GlossaryTerm termKey="leasehold_improvements" schoolType={schoolType}>Leasehold Improvements</GlossaryTerm> (Costs to build out or modify your space - painting, flooring, adding walls)
              </p>
            </div>
            <span className="text-xs text-muted-foreground ml-2">({capitalRows.filter((r) => r.enabled).length} active)</span>
            <span className="ml-auto text-sm font-semibold text-amber-600">{formatCurrency(categorySummaries["capital_financing"] || 0)}</span>
          </button>
          <p className="px-5 text-xs text-muted-foreground -mt-2 mb-1">These items are separated from operating expenses on financial statements.</p>
          <div className="mx-5 mb-3 rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
            <span>Include big one-time purchases here - desks, tech, playground equipment, and any buildout costs. If you're financing these with a loan, the model will calculate interest and repayment automatically.</span>
          </div>

          {expandedCategories.has("capital_financing") && (
            <div className="px-5 pb-5 space-y-3">
              {capitalRows.map((row) => (
                <CapitalLineCard key={row.id} row={row} yearCount={yearCount} yearLabels={yearLabels} onUpdate={updateCapitalRow} onRemove={removeCapitalRow} />
              ))}
              <button type="button" onClick={() => addCapitalRow()} className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors mt-2">
                <Plus className="h-4 w-4" /> Add capital / debt item
              </button>
              <RationaleField
                rationaleKey="expenses:capital_financing"
                label="Why these capital items?"
                placeholder={
                  y1CategorySums["capital_financing"] > 0
                    ? `${formatCurrency(y1CategorySums["capital_financing"])} in Y1 capital. What's behind those numbers - vendor quotes for furniture/equipment, a contractor estimate for buildout, or a financing plan?`
                    : "Capital purchases (furniture, equipment, buildout). What's the source of the estimates - vendor quotes, contractor bids, or comparable buildouts?"
                }
                helperText="Lenders look closely at startup capital. Cite the quotes or bids that back each line."
              />
            </div>
          )}
        </div>
      )}
      {/* Task #704 (Phase 9): facility-burden + fixed/variable/timing
          summary plus the brief's exact "rent does not shrink" coaching
          line. Surfaces facility cost as a % of revenue and groups the
          founder's expense rows by cost behavior so they can see fixed-
          cost pressure at a glance. */}
      <ExpenseBehaviorSummary />
      <AssumptionConfidenceCard stepTitle="Expenses" />
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

function GuidedQuestionPanel({
  category,
  answeredQuestions,
  onAnswer,
}: {
  category: string;
  answeredQuestions: Record<string, "yes" | "no" | null>;
  onAnswer: (questionId: string, answer: "yes" | "no", relatedLineItems: string[]) => void;
}) {
  const catQuestions = GUIDED_EXPENSE_QUESTIONS.find((cq) => cq.category === category);
  if (!catQuestions) return null;

  const totalQuestions = catQuestions.questions.length;
  const answeredCount = catQuestions.questions.filter((q) => answeredQuestions[q.id] != null).length;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <HelpCircle className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-violet-900">{catQuestions.intro}</p>
          <p className="text-xs text-violet-600 mt-0.5">
            {answeredCount} of {totalQuestions} answered - say "Yes" to auto-enable related expense lines
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {catQuestions.questions.map((q) => {
          const answer = answeredQuestions[q.id];
          return (
            <div key={q.id} className={cn(
              "rounded-lg border p-3 transition-all",
              answer === "yes" ? "border-green-200 bg-green-50/50" :
              answer === "no" ? "border-gray-200 bg-gray-50/50" :
              "border-violet-100 bg-white"
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{q.question}</p>
                  {q.hint && (
                    <p className="text-xs text-muted-foreground mt-1">{q.hint}</p>
                  )}
                  {answer === "yes" && (
                    <p className="text-[10px] text-green-700 mt-1 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Enabled: {q.relatedLineItems.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onAnswer(q.id, "yes", q.relatedLineItems)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                      answer === "yes"
                        ? "bg-green-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-green-100 hover:text-green-700"
                    )}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(q.id, "no", q.relatedLineItems)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                      answer === "no"
                        ? "bg-gray-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-gray-100 hover:text-gray-700"
                    )}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  totalFTE,
  escalationRates,
}: {
  row: ExpenseRowData;
  yearCount: number;
  yearLabels: string[];
  onUpdate: (id: string, field: keyof ExpenseRowData, value: string | number | boolean | number[]) => void;
  onRemove: (id: string) => void;
  y1Students: number;
  totalFTE: number;
  escalationRates: EscalationRates;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const rule = useMemo(() => getEscalationRule(row, escalationRates), [row.driverType, row.canonicalKey, escalationRates]);
  const isPercent = row.driverType === "percent_of_revenue";
  const escalatedAmounts = useMemo(
    () => computeEscalatedAmounts(row.amounts[0] || 0, yearCount, rule.rate, isPercent),
    [row.amounts[0], yearCount, rule.rate, isPercent]
  );

  const overriddenYears = useMemo(() => {
    return row.amounts.map((amt, i) => {
      if (i === 0) return false;
      return amt !== escalatedAmounts[i];
    });
  }, [row.amounts, escalatedAmounts]);

  const updateY1 = (val: number) => {
    const newEscalated = computeEscalatedAmounts(val, yearCount, rule.rate, isPercent);
    const newAmounts = newEscalated.map((auto, i) =>
      i === 0 ? val : (overriddenYears[i] ? row.amounts[i] : auto)
    );
    onUpdate(row.id, "amounts", newAmounts);
  };

  const updateYearN = (yearIdx: number, val: number) => {
    const newAmounts = [...row.amounts];
    newAmounts[yearIdx] = val;
    onUpdate(row.id, "amounts", newAmounts);
  };

  const resetYear = (yearIdx: number) => {
    const newAmounts = [...row.amounts];
    newAmounts[yearIdx] = escalatedAmounts[yearIdx];
    onUpdate(row.id, "amounts", newAmounts);
  };

  const toggleEnabled = () => {
    onUpdate(row.id, "enabled", !row.enabled);
    if (!row.enabled) setIsOpen(true);
  };

  const y1Raw = row.amounts[0] || 0;
  const y1Amount = row.driverType === "monthly" ? y1Raw * 12 : row.driverType === "per_fte" ? y1Raw * totalFTE : y1Raw;
  const rowTotal = row.amounts.reduce((s, a) => {
    const v = a || 0;
    return s + annualize(v, row.driverType, totalFTE);
  }, 0);

  const rationale = useMemo(() => getExpenseRationale(row.canonicalKey || row.lineItem), [row.canonicalKey, row.lineItem]);

  const driverHint = row.driverType === "per_student" && y1Students > 0
    ? `Y1 total: ${formatCurrency((row.amounts[0] || 0) * y1Students)}`
    : row.driverType === "per_new_student" && y1Students > 0
      ? `Y1 total: ${formatCurrency((row.amounts[0] || 0) * y1Students)} (all new in Y1)`
      : row.driverType === "per_returning_student"
        ? "Y1 total: $0 (no returning students in Y1)"
        : row.driverType === "per_fte" && totalFTE > 0
          ? `Y1 total: ${formatCurrency((row.amounts[0] || 0) * totalFTE)} for ${totalFTE} FTE`
          : row.driverType === "per_fte" && totalFTE === 0
            ? "Add staff in Staffing step to calculate"
            : null;

  if (!row.enabled) {
    return (
      <div data-testid={`expense-row-${row.id}`} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/20 opacity-50">
        <input type="checkbox" checked={false} onChange={toggleEnabled} className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary" />
        <span className="text-sm text-muted-foreground line-through flex-1">{row.lineItem || "Unnamed"}</span>
        <button type="button" onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div data-testid={`expense-row-${row.id}`} className="rounded-xl border border-border bg-white transition-all">
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={row.enabled} onChange={toggleEnabled} className="h-4 w-4 rounded border-border text-primary focus:ring-primary flex-shrink-0" />
          <button data-testid={`expand-row-${row.id}`} type="button" onClick={() => setIsOpen(!isOpen)} className="p-0.5 rounded-md hover:bg-muted transition-colors flex-shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          <input
            type="text"
            value={row.lineItem}
            onChange={(e) => onUpdate(row.id, "lineItem", e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className={cn("font-semibold text-sm bg-transparent border-none focus:outline-none focus:ring-0 flex-1 min-w-0", !row.lineItem && "border-b border-dashed border-red-300")}
            placeholder="Expense name *"
          />
          <button type="button" onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1 flex-shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3 ml-[52px] flex-wrap">
          <select
            value={row.driverType}
            onChange={(e) => onUpdate(row.id, "driverType", e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-muted-foreground"
          >
            {Object.entries(DRIVER_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Y1:</span>
            <div className="relative">
              <input
                type="number"
                value={row.amounts[0] ?? 0}
                onChange={(e) => updateY1(parseFloat(e.target.value) || 0)}
                className="w-24 text-sm font-bold text-center border border-border rounded-md px-2 py-1 bg-background"
                step={row.driverType === "percent_of_revenue" ? "0.1" : "1"}
              />
              {row.driverType === "percent_of_revenue" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
              )}
            </div>
          </div>
          {!isPercent && (
            <div className="text-xs text-muted-foreground">
              5yr: {formatCurrency(rowTotal)}
            </div>
          )}
          <span className="text-[9px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {rule.label}
          </span>
          {row.escalationRateSeeded && (
            <span
              data-testid={`expense-row-${row.id}-seeded-badge`}
              title={`Seeded from Extend-to-5-Year at ${rule.rate}%/yr cost inflation. Editing Y1 will re-project Y2-Y5 from this rate.`}
              className="text-[9px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full whitespace-nowrap cursor-help"
            >
              seeded from Extend-to-5-Year
            </span>
          )}
          {driverHint && (
            <span className="text-[11px] text-muted-foreground">{driverHint}</span>
          )}
          {y1Students > 0 && y1Amount > 0 && row.driverType !== "per_student" && row.driverType !== "per_new_student" && row.driverType !== "per_returning_student" && row.driverType !== "percent_of_revenue" && (
            <span className="text-[11px] text-muted-foreground">
              ≈ {formatPerStudent(y1Amount, y1Students)}
            </span>
          )}
        </div>

        <div className="ml-[52px]">
          <input
            type="text"
            value={row.note || ""}
            onChange={(e) => onUpdate(row.id, "note", e.target.value)}
            className="w-full text-xs border border-border rounded-md px-2.5 py-1.5 bg-background"
            placeholder="Note (optional)"
          />
        </div>

        {rationale && (
          <p className="text-[11px] text-muted-foreground/80 italic leading-snug ml-[52px]">{rationale}</p>
        )}
      </div>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={row.accountCode || ""}
              onChange={(e) => onUpdate(row.id, "accountCode", e.target.value)}
              className="w-20 text-xs text-center border border-border rounded-md px-1.5 py-1 bg-background font-mono"
              placeholder="Acct code"
            />
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
            {yearLabels.map((label, i) => {
              const isAutoFilled = i > 0 && !overriddenYears[i];
              const isOverridden = i > 0 && overriddenYears[i];
              return (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-medium">{label}</div>
                  <div className="relative">
                    <input
                      data-testid={`amount-y${i + 1}`}
                      type="number"
                      value={row.amounts[i] ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (i === 0) updateY1(val);
                        else updateYearN(i, val);
                      }}
                      className={cn(
                        "w-full text-sm text-center border rounded-md px-1 py-1.5",
                        isAutoFilled
                          ? "bg-teal-50/60 border-teal-200 italic text-teal-900"
                          : isOverridden
                            ? "bg-amber-50/60 border-amber-200 text-amber-900"
                            : "bg-background border-border"
                      )}
                      step={row.driverType === "percent_of_revenue" ? "0.1" : "1"}
                    />
                    {row.driverType === "percent_of_revenue" && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                    )}
                  </div>
                  {isAutoFilled && (
                    <div className="text-[8px] text-teal-600 mt-0.5 leading-tight">{rule.label}</div>
                  )}
                  {isOverridden && (
                    <button
                      type="button"
                      onClick={() => resetYear(i)}
                      className="inline-flex items-center gap-0.5 text-[8px] text-amber-600 hover:text-amber-700 mt-0.5"
                    >
                      <RotateCcw className="h-2 w-2" /> reset
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {row.driverType === "monthly" && (
            <div className="text-[11px] text-muted-foreground text-center">
              Y1 annual: {formatCurrency((row.amounts[0] || 0) * 12)}
            </div>
          )}
          {row.driverType !== "percent_of_revenue" && (
            <div className="text-[11px] text-muted-foreground text-right">
              5-year total: {formatCurrency(rowTotal)}
            </div>
          )}
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
        {row.accountCode && <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">#{row.accountCode}</span>}
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{DRIVER_TYPE_LABELS[row.driverType]}</span>
        <button type="button" onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isOpen && row.enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
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
            <div className="flex items-center gap-2 ml-auto">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={row.accountCode || ""}
                onChange={(e) => onUpdate(row.id, "accountCode", e.target.value)}
                className="w-20 text-sm text-center border border-border rounded-lg px-2 py-1.5 bg-background font-mono"
                placeholder="Code"
                title="Chart of accounts code"
              />
            </div>
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

/**
 * Task #704 (Phase 9): expense behavior summary card. Surfaces facility
 * burden as a % of Year-1 revenue plus the brief's exact "rent does not
 * shrink" coaching line. Reads expenseRows + revenueRows directly from the
 * form so it stays in sync with the founder's edits.
 */
function ExpenseBehaviorSummary() {
  const { watch } = useFormContext();
  const expenseRows = (watch("expenseRows") as ExpenseRowData[] | undefined) || [];
  const revenueRows = (watch("revenueRows") as Array<{ amounts?: number[] }> | undefined) || [];
  const { showCoach } = useShowCoach();

  const facilityY1 = useMemo(
    () =>
      expenseRows
        .filter((r) => r.category === "occupancy_facility")
        .reduce((sum, r) => sum + (r.amounts?.[0] ?? 0), 0),
    [expenseRows],
  );
  const revenueY1 = useMemo(
    () => revenueRows.reduce((sum, r) => sum + (r.amounts?.[0] ?? 0), 0),
    [revenueRows],
  );

  // Task #704 (Phase 9): group rows by cost behavior so the founder sees
  // their fixed-cost burden at a glance. Uses driverType as the proxy:
  //   • annual_fixed   → fixed (rent, insurance, software contracts)
  //   • per_student / per_new_student / per_returning_student / per_fte
  //                    → variable (scales with enrollment / staffing)
  //   • monthly + others with explicit timing → timing-sensitive
  const grouped = useMemo(() => {
    const out = { fixed: 0, variable: 0, timing: 0 };
    for (const r of expenseRows) {
      const y1 = r.amounts?.[0] ?? 0;
      const dt = (r as { driverType?: string }).driverType || "";
      if (dt === "annual_fixed") out.fixed += y1;
      else if (/per_student|per_new_student|per_returning_student|per_fte|percent_of_/.test(dt)) out.variable += y1;
      else out.timing += y1;
    }
    return out;
  }, [expenseRows]);

  const facilityFraction = facilityBurdenFractionOfRevenue(facilityY1, revenueY1);
  if (expenseRows.length === 0) return null;

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">Facility burden at a glance</h4>
      </div>
      <div className="rounded-lg border border-border/50 bg-background p-3 text-sm">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Facility cost as % of Year 1 revenue</div>
        <div className="font-semibold text-foreground">
          {facilityFraction === null
            ? "Add Year 1 revenue to see this"
            : `${Math.round(facilityFraction * 100)}% (${formatCurrency(facilityY1)})`}
        </div>
      </div>
      {/* Task #704 (Phase 9): fixed vs variable vs timing-sensitive grouping
          so founders see how much of Y1 expense is locked-in (rent,
          contracts) vs scaling with enrollment vs timing-driven. */}
      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-rose-800 mb-1">Fixed (won't shrink)</div>
          <div data-testid="expense-behavior-fixed" className="font-semibold text-rose-900">{formatCurrency(grouped.fixed)}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-800 mb-1">Variable (scales with enrollment / staff)</div>
          <div data-testid="expense-behavior-variable" className="font-semibold text-emerald-900">{formatCurrency(grouped.variable)}</div>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-sky-800 mb-1">Timing-sensitive</div>
          <div data-testid="expense-behavior-timing" className="font-semibold text-sky-900">{formatCurrency(grouped.timing)}</div>
        </div>
      </div>
      {showCoach && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <Lightbulb className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-900">
            Facility costs are usually fixed. If enrollment comes in lower than expected, rent does not shrink.
          </p>
        </div>
      )}
    </div>
  );
}
