import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { ChevronDown, ChevronRight, Plus, Trash2, Clock, BarChart3, Lightbulb, GraduationCap, Building2, Landmark, Gift, HandCoins, Wallet, AlertTriangle, DollarSign, Vote, Info, Heart, MapPin, Users } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { RationaleField } from "@/components/coaching/RationaleField";
import { cn, formatCurrency } from "@/lib/utils";
import { formatPerStudent } from "@/lib/per-student-lens";
import { YEAR_COUNT, DEFAULT_COLLECTION_RATE_BY_METHOD, COLLECTION_RATE_BENCHMARK_COPY } from "@workspace/finance";
import {
  type RevenueRowData,
  type RevenueCategory,
  type RevenueDriverType,
  type FundingProfile,
  type CollectionMethod,
  type PaymentFrequency,
  type PaymentTiming,
  type DisbursementType,
  type GrantStatus,
  type EnrollmentRevenueMethod,
  type CharterDepositTiming,
  CATEGORY_LABELS,
  DRIVER_TYPE_LABELS,
  COLLECTION_METHOD_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_TIMING_LABELS,
  DISBURSEMENT_TYPE_LABELS,
  GRANT_STATUS_LABELS,
  ENROLLMENT_REVENUE_METHOD_LABELS,
  CHARTER_DEPOSIT_TIMING_LABELS,
  GRADE_BAND_LABELS,
  GRADE_BAND_KEYS,
  type GradeBandKey,
  generateDefaultRevenueRows,
  getCategoryOrder,
  getAvailableLineItems,
  getTimingDefaults,
  computeMonthlyCashInflow,
  migrateGrantsToPhilanthropy,
  generateSchoolChoiceRows,
} from "@/lib/revenue-defaults";
import { type TuitionTier, getDefaultTuitionTiers } from "@/pages/model-wizard/schema";
import { getStateFundingConfig, type StateFundingConfig, type SchoolType, type CharterPerPupilRange, type ProgramInfo } from "@/lib/state-funding-data";
import { detectFragileFunding, type FragileProgramMatch } from "@workspace/finance";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch } from "@/lib/coaching/founder-persona";
import { useYearCount } from "@/lib/use-model-duration";

const CATEGORY_ICONS: Record<RevenueCategory, React.ComponentType<{ className?: string }>> = {
  tuition_and_fees: GraduationCap,
  tuition_offsets: HandCoins,
  public_funding: Building2,
  school_choice: Landmark,
  philanthropy: Heart,
  other_revenue: Wallet,
};

interface CategoryGuidance {
  tip: string;
  common: boolean;
  fundingHint?: Record<FundingProfile, string>;
}

const CATEGORY_GUIDANCE: Record<RevenueCategory, CategoryGuidance> = {
  tuition_and_fees: {
    tip: "Your primary income: tuition, registration fees, activity fees, and other charges families pay.",
    common: true,
    fundingHint: {
      tuition_based: "This is typically your largest revenue source - 70-90% of total revenue for private and micro schools.",
      charter_public_funded: "Charter schools may charge fees for extracurriculars and materials, but tuition is not the main source.",
      hybrid_mixed: "Tuition supplements your public funding. Common for schools with both public per-pupil funding and family-paid tuition.",
    },
  },
  tuition_offsets: {
    tip: "Financial aid, sibling discounts, and staff discounts reduce gross tuition. Include these so your model reflects realistic net tuition.",
    common: true,
  },
  public_funding: {
    tip: "State per-pupil funding, Title I allocations, IDEA/special education funding, and other government funding sources.",
    common: false,
    fundingHint: {
      tuition_based: "Private schools may receive some public funding through Title I or special education allocations.",
      charter_public_funded: "This is your primary revenue source. Per-pupil state funding typically makes up 80%+ of charter revenue.",
      hybrid_mixed: "Per-pupil funding from the state plus any federal allocations your school receives.",
    },
  },
  school_choice: {
    tip: "ESA vouchers, tax-credit scholarships, and education savings accounts families use to pay tuition.",
    common: false,
    fundingHint: {
      tuition_based: "Growing revenue source - check if your state has an ESA or voucher program.",
      charter_public_funded: "Generally not applicable to charter schools receiving per-pupil funding.",
      hybrid_mixed: "A key supplemental source - ESA/voucher funds can bridge the gap between public funding and full cost.",
    },
  },
  philanthropy: {
    tip: "Grants, fundraising events, annual fund, board giving, and restricted gifts. It's helpful to distinguish between unrestricted funds (which support general operations) and restricted funds (which are earmarked for specific purposes).",
    common: false,
  },
  other_revenue: {
    tip: "Facility rental, before/after care, summer programs, merchandise, and any other earned revenue.",
    common: false,
  },
};

interface RevenueSourceCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

function RevenueSourceCheck({ checked, onChange, icon, title, description, disabled }: RevenueSourceCheckProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
        checked
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className={cn(
        "mt-0.5 flex h-5 w-5 items-center justify-center rounded border-2 transition-all flex-shrink-0",
        checked ? "border-primary bg-primary" : "border-border bg-background"
      )}>
        {checked && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-muted-foreground", checked && "text-primary")}>{icon}</span>
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

type RevenueSources = { tuition?: boolean; publicFunding?: boolean; schoolChoice?: boolean; philanthropy?: boolean };

function deriveFundingProfile(sources: RevenueSources): FundingProfile {
  const hasTuition = sources.tuition ?? false;
  const hasPublic = sources.publicFunding ?? false;
  const hasChoice = sources.schoolChoice ?? false;

  if (hasPublic && !hasTuition && !hasChoice) return "charter_public_funded";
  if ((hasTuition && hasPublic) || hasChoice) return "hybrid_mixed";
  if (hasTuition) return "tuition_based";
  if (hasPublic) return "charter_public_funded";
  return "hybrid_mixed";
}

function sourcesToCategories(sources: RevenueSources): Set<RevenueCategory> {
  const cats = new Set<RevenueCategory>();
  if (sources.tuition) { cats.add("tuition_and_fees"); cats.add("tuition_offsets"); }
  if (sources.publicFunding) cats.add("public_funding");
  if (sources.schoolChoice) cats.add("school_choice");
  if (sources.philanthropy) cats.add("philanthropy");
  cats.add("other_revenue");
  return cats;
}

function getYearCount(_schoolStage: string | undefined): number {
  return YEAR_COUNT;
}

// Wired in the component below — overrides getYearCount when single-year
// mode is active so the input grids collapse to a single Y1 column.

function getYearLabel(index: number, schoolStage: string | undefined): string {
  if (schoolStage === "operating_school" && index === 0) return "Current";
  return `Y${index + 1}`;
}

const MONTH_LABELS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export function RevenueStep({ jumpToStep }: { jumpToStep?: (step: number) => void; modelId?: number | null }) {
  const { watch, setValue, getValues, formState: { errors } } = useFormContext();
  const { user } = useAuth();
  const yetToLaunch = isYetToLaunch(user);
  // Task #416: hide the WhyThisMatters intro from advanced founders.
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const showCoach = guidanceLevel !== "advanced";
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolStage = watch("schoolProfile.schoolStage") as string | undefined;
  const schoolType = watch("schoolProfile.schoolType") as string | undefined;
  const stateCode = watch("schoolProfile.state") as string | undefined;
  const openingYear = watch("schoolProfile.openingYear") as number | undefined;
  const maxCapacity = watch("schoolProfile.maxCapacity") as number | undefined;
  const entityType = watch("schoolProfile.entityType") as string | undefined;
  const isDiocesan = watch("schoolProfile.isDiocesan") as boolean | undefined;
  const isFaithAffiliated = watch("schoolProfile.isFaithAffiliated") as boolean | undefined;
  const congregationSupport = watch("schoolProfile.congregationSupport") as boolean | undefined;
  const doesFundraise = watch("schoolProfile.doesFundraise") as boolean | undefined;
  const hasFiscalSponsor = watch("schoolProfile.hasFiscalSponsor") as boolean | undefined;
  const yearCountBase = getYearCount(schoolStage);
  const singleYearOverride = useYearCount();
  const yearCount = singleYearOverride < yearCountBase ? singleYearOverride : yearCountBase;

  const enrollment = watch("enrollment");
  const y1Students = enrollment?.year1 || 0;
  const y5Students = enrollment?.year5 || 0;

  const revenueSources = watch("revenueSources") as RevenueSources | undefined;

  const isCharterType = schoolType === "charter_school";

  const stateFundingConfig = useMemo<StateFundingConfig | null>(() => {
    if (!schoolType || !stateCode || stateCode.length < 2) return null;
    return getStateFundingConfig(schoolType as SchoolType, stateCode, openingYear);
  }, [schoolType, stateCode, openingYear]);

  const handleRevenueSourceChange = useCallback((source: string, checked: boolean) => {
    const updated = { ...revenueSources, [source]: checked };
    setValue("revenueSources", updated, { shouldDirty: true });
    const derived = deriveFundingProfile(updated);
    setValue("schoolProfile.fundingProfile", derived, { shouldDirty: true });
  }, [revenueSources, setValue]);

  useEffect(() => {
    if (isCharterType) {
      const needsUpdate = !revenueSources?.publicFunding || revenueSources?.tuition || revenueSources?.schoolChoice;
      if (needsUpdate) {
        setValue("revenueSources", {
          tuition: false,
          publicFunding: true,
          schoolChoice: false,
          philanthropy: revenueSources?.philanthropy ?? false,
        }, { shouldDirty: true });
      }
      if (fundingProfile !== "charter_public_funded") {
        setValue("schoolProfile.fundingProfile", "charter_public_funded", { shouldDirty: true });
      }
    }
  }, [isCharterType, revenueSources, fundingProfile, setValue]);

  const formRows = watch("revenueRows") as RevenueRowData[] | undefined;
  const [rows, setRows] = useState<RevenueRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<RevenueCategory>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [enabledCategories, setEnabledCategories] = useState<Set<RevenueCategory>>(() => {
    if (revenueSources && (revenueSources.tuition || revenueSources.publicFunding || revenueSources.schoolChoice || revenueSources.philanthropy)) {
      return sourcesToCategories(revenueSources);
    }
    if (fundingProfile === "charter_public_funded") {
      return new Set<RevenueCategory>(["public_funding", "philanthropy", "other_revenue"]);
    }
    return new Set<RevenueCategory>(["tuition_and_fees", "tuition_offsets", "other_revenue"]);
  });

  const deriveEnabledCategories = useCallback((rowList: RevenueRowData[]): Set<RevenueCategory> => {
    const cats = new Set<RevenueCategory>();
    rowList.forEach((r) => { if (r.enabled) cats.add(r.category); });
    return cats;
  }, []);

  useEffect(() => {
    if (formRows !== undefined && formRows.length > 0) {
      const migrated = migrateGrantsToPhilanthropy(formRows);
      const adjusted = migrated.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      setRows(adjusted);
      if (!defaultsApplied) {
        const enabledCats = deriveEnabledCategories(adjusted);
        setExpandedCategories(enabledCats);
        setEnabledCategories(enabledCats);
        setShowCategoryPicker(false);
        setDefaultsApplied(true);
      } else {
        const enabledCats = deriveEnabledCategories(adjusted);
        setEnabledCategories(enabledCats);
      }
    } else if (formRows !== undefined && Array.isArray(formRows) && formRows.length === 0 && defaultsApplied) {
      setRows([]);
    } else if (!defaultsApplied) {
      const depositTiming = watch("schoolProfile.charterDepositTiming") as CharterDepositTiming | undefined;
      const perPupilRange = stateFundingConfig?.charterBasePerPupil;
      const perPupilMidpoint = perPupilRange ? Math.round((perPupilRange.min + perPupilRange.max) / 2) : undefined;
      const defaults = generateDefaultRevenueRows(fundingProfile, yearCount, depositTiming, {
        isCharter: isCharterType,
        openingYear: openingYear ?? undefined,
        perPupilMidpoint,
        fundraising: {
          isCatholic: schoolType === "catholic_school",
          isDiocesan,
          isFaithAffiliated,
          congregationSupport,
          doesFundraise,
          hasFiscalSponsor,
          isNonprofit: entityType === "nonprofit_501c3",
        },
      });
      setRows(defaults);
      const enabledCats = deriveEnabledCategories(defaults);
      setExpandedCategories(enabledCats);
      setEnabledCategories(enabledCats);
      setValue("revenueRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formRows, fundingProfile, yearCount, defaultsApplied, setValue, deriveEnabledCategories, schoolType, entityType, isDiocesan, isFaithAffiliated, congregationSupport, doesFundraise, hasFiscalSponsor]);

  const CHARTER_HIDDEN_CATEGORIES: RevenueCategory[] = ["tuition_and_fees", "tuition_offsets", "school_choice"];
  useEffect(() => {
    if (!defaultsApplied) return;
    const isCharter = schoolType === "charter_school";
    if (!isCharter) return;
    if (rows.length === 0) return;
    const updated = rows.map((row) => {
      if (CHARTER_HIDDEN_CATEGORIES.includes(row.category) && row.enabled) {
        return { ...row, enabled: false };
      }
      return row;
    });
    const changed = updated.some((r, i) => r.enabled !== rows[i].enabled);
    if (!changed) return;
    setRows(updated);
    setValue("revenueRows", updated, { shouldDirty: true });
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      CHARTER_HIDDEN_CATEGORIES.forEach((c) => next.delete(c as RevenueCategory));
      return next;
    });
  }, [schoolType, defaultsApplied, setValue, rows]);

  const revDefaultBillingMonths = watch("revenueDefaults.billingMonths") as 9 | 10 | 12 | undefined;
  const revDefaultCollectionMethod = watch("revenueDefaults.collectionMethod") as CollectionMethod | undefined;
  const revDefaultCollectionRate = watch("revenueDefaults.collectionRate") as number | undefined;
  const revDefaultCollectionDelay = watch("revenueDefaults.collectionDelayDays") as number | undefined;

  useEffect(() => {
    if (!defaultsApplied) return;
    if (rows.length === 0) return;
    let changed = false;
    const updated = rows.map((row) => {
      if ((row.category === "tuition_and_fees" || row.category === "tuition_offsets") && !row.timingOverridden) {
        const newRow = { ...row };
        if (revDefaultBillingMonths !== undefined && newRow.billingMonths !== revDefaultBillingMonths) {
          newRow.billingMonths = revDefaultBillingMonths;
          changed = true;
        }
        if (row.category === "tuition_and_fees") {
          if (revDefaultCollectionMethod !== undefined && newRow.collectionMethod !== revDefaultCollectionMethod) {
            newRow.collectionMethod = revDefaultCollectionMethod;
            changed = true;
          }
          if (revDefaultCollectionRate !== undefined && newRow.collectionRate !== revDefaultCollectionRate) {
            newRow.collectionRate = revDefaultCollectionRate;
            changed = true;
          }
          if (revDefaultCollectionDelay !== undefined && newRow.collectionDelayDays !== revDefaultCollectionDelay) {
            newRow.collectionDelayDays = revDefaultCollectionDelay;
            changed = true;
          }
        }
        return newRow;
      }
      return row;
    });
    if (!changed) return;
    setRows(updated);
    setValue("revenueRows", updated, { shouldDirty: true });
  }, [revDefaultBillingMonths, revDefaultCollectionMethod, revDefaultCollectionRate, revDefaultCollectionDelay, defaultsApplied, setValue, rows]);

  // Task #455 — compute the fragility report once per render and look it up
  // by row id when rendering. Done at the parent so we don't reach into
  // STATE_FUNDING_MAP from inside every RevenueLineItem instance.
  const fragilityReport = useMemo(
    () => detectFragileFunding(rows, stateCode, schoolType as SchoolType | undefined),
    [rows, stateCode, schoolType],
  );
  const fragilityByRowId = useMemo(() => {
    const map = new Map<string, FragileProgramMatch>();
    for (const m of fragilityReport.all) map.set(m.rowId, m);
    return map;
  }, [fragilityReport]);

  const PROGRAM_TYPE_TO_ROW_ID: Record<string, string> = useMemo(() => ({
    esa: "esa_revenue", voucher: "voucher_revenue", tax_credit_scholarship: "scholarship_org",
    refundable_tax_credit: "refundable_tax_credit", individual_tax_credit: "individual_tax_credit",
    federal_tax_credit_sgo: "federal_tax_credit_sgo", correspondence_charter: "correspondence_charter",
    private_scholarship: "private_scholarship_revenue",
  }), []);

  const AUTO_GENERATED_IDS = useMemo(() => new Set(Object.values(PROGRAM_TYPE_TO_ROW_ID)), [PROGRAM_TYPE_TO_ROW_ID]);

  const lastStateFundingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!defaultsApplied) return;

    if (isCharterType && stateFundingConfig) {
      if (stateFundingConfig.enrollmentRevenueMethod) {
        setValue("schoolProfile.enrollmentRevenueMethod", stateFundingConfig.enrollmentRevenueMethod, { shouldDirty: true });
      } else {
        setValue("schoolProfile.enrollmentRevenueMethod", "adm", { shouldDirty: true });
      }
      if (stateFundingConfig.charterMethodology) {
        setValue("schoolProfile.stateFundingMethodology", stateFundingConfig.charterMethodology, { shouldDirty: true });
      } else {
        setValue("schoolProfile.stateFundingMethodology", "other", { shouldDirty: true });
      }

      if (stateFundingConfig.charterBasePerPupil) {
        const midpoint = Math.round((stateFundingConfig.charterBasePerPupil.min + stateFundingConfig.charterBasePerPupil.max) / 2);
        const perPupilRow = rows.find(r => r.id === "state_local_perpupil");
        if (perPupilRow) {
          const userHasEdited = perPupilRow.amounts.some(a => a !== 0 && a !== midpoint);
          if (!userHasEdited) {
            const updated = rows.map(r =>
              r.id === "state_local_perpupil"
                ? { ...r, amounts: new Array(yearCount).fill(midpoint) }
                : r
            );
            setRows(updated);
            setValue("revenueRows", updated, { shouldDirty: true });
          }
        }
      }
    }

    if (isCharterType) return;

    const configKey = `${schoolType}:${stateCode}:${openingYear || ""}`;
    if (lastStateFundingKeyRef.current === configKey) return;
    lastStateFundingKeyRef.current = configKey;

    if (!stateFundingConfig || !stateCode) return;

    const eligibleIds = new Set(
      (stateFundingConfig.availablePrograms || [])
        .filter(p => p.status !== "blocked")
        .map(p => PROGRAM_TYPE_TO_ROW_ID[p.type] || `sc_${p.type}`)
    );

    let changed = false;
    const reconciled = rows.filter(r => {
      if (!AUTO_GENERATED_IDS.has(r.id)) return true;
      if (eligibleIds.has(r.id)) return true;
      changed = true;
      return false;
    });

    const existingIds = new Set(reconciled.map(r => r.id));
    const newRows = stateFundingConfig
      ? generateSchoolChoiceRows(
          stateFundingConfig.availablePrograms,
          yearCount,
          fundingProfile,
        ).filter(r => !existingIds.has(r.id))
      : [];

    if (!changed && newRows.length === 0) return;

    const updated = [...reconciled, ...newRows];
    setRows(updated);
    setValue("revenueRows", updated, { shouldDirty: true });

    if (newRows.some(r => r.enabled)) {
      if (!revenueSources?.schoolChoice) {
        handleRevenueSourceChange("schoolChoice", true);
      }
      setEnabledCategories(prev => {
        const next = new Set(prev);
        next.add("school_choice");
        return next;
      });
      setExpandedCategories(prev => {
        const next = new Set(prev);
        next.add("school_choice");
        return next;
      });
    }
  }, [stateFundingConfig, defaultsApplied, isCharterType, schoolType, stateCode, openingYear, yearCount, fundingProfile, revenueSources, handleRevenueSourceChange]);

  const syncToForm = useCallback((updatedRows: RevenueRowData[]) => {
    setRows(updatedRows);
    setValue("revenueRows", updatedRows, { shouldDirty: true });
  }, [setValue]);

  const applyCategories = useCallback(() => {
    const catsFromSources = revenueSources ? sourcesToCategories(revenueSources) : enabledCategories;
    const updated = rows.map((row) => {
      if (catsFromSources.has(row.category)) {
        return row.enabled ? row : { ...row, enabled: true };
      }
      return row.enabled ? { ...row, enabled: false } : row;
    });
    setEnabledCategories(catsFromSources);
    syncToForm(updated);
    setExpandedCategories(new Set(catsFromSources));
    setShowCategoryPicker(false);
  }, [rows, enabledCategories, revenueSources, syncToForm]);

  const toggleCategory = (cat: RevenueCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleRow = (id: string) => {
    const updated = rows.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
    syncToForm(updated);
  };

  const updateDriver = (id: string, driverType: RevenueDriverType) => {
    const updated = rows.map((r) => r.id === id ? { ...r, driverType } : r);
    syncToForm(updated);
  };

  const updateAmount = (id: string, yearIndex: number, value: number) => {
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      const newAmounts = [...r.amounts];
      newAmounts[yearIndex] = value;
      return { ...r, amounts: newAmounts };
    });
    syncToForm(updated);
  };

  const updateTimingField = (id: string, field: string, value: unknown) => {
    const updated = rows.map((r) => {
      if (r.id !== id) return r;
      const patch: Record<string, unknown> = { [field]: value };
      if (field !== "timingOverridden") {
        patch.timingOverridden = true;
      }
      return { ...r, ...patch };
    });
    syncToForm(updated);
  };

  const removeRow = (id: string) => {
    const updated = rows.filter((r) => r.id !== id);
    syncToForm(updated);
  };

  const addLineItem = (category: RevenueCategory, itemId: string) => {
    const available = getAvailableLineItems(category, rows.map((r) => r.id));
    let item = available.find((a) => a.id === itemId);
    // F2: when adding a state school-choice program (ESA / voucher / etc.),
    // resolve the program metadata so we can both label the row correctly AND
    // pre-fill the per-student amount with the state-program midpoint. Without
    // this, the user got a row with $0/student and had to look up the number
    // from the side panel — easy to miss, and wrong-by-default math.
    let matchedProgram: ProgramInfo | null = null;
    if (category === "school_choice" && stateFundingConfig) {
      const prog = stateFundingConfig.availablePrograms.find(p => {
        const mappedId = PROGRAM_TYPE_TO_ROW_ID[p.type] || `sc_${p.type}`;
        return mappedId === itemId;
      });
      if (prog) {
        matchedProgram = prog;
        if (!item) {
          item = { id: itemId, category: "school_choice", lineItem: prog.label, driverType: "per_student" };
        }
      }
    }
    if (!item) return;
    let initialAmounts = new Array(yearCount).fill(0);
    let note: string | undefined;
    if (matchedProgram) {
      const min = matchedProgram.minPerStudent ?? 0;
      const max = matchedProgram.maxPerStudent ?? 0;
      if (min > 0 || max > 0) {
        const midpoint = Math.round((min + max) / 2);
        initialAmounts = new Array(yearCount).fill(midpoint);
        note = `From ${stateCode || "your state"} program data — typical $${min.toLocaleString()}–$${max.toLocaleString()}/student${matchedProgram.notes ? `. ${matchedProgram.notes}` : ""}`;
      }
    }
    const newRow: RevenueRowData = {
      id: item.id,
      category: item.category,
      lineItem: item.lineItem,
      enabled: true,
      driverType: item.driverType,
      amounts: initialAmounts,
      ...(note ? { note } : {}),
      ...getTimingDefaults(item.category, fundingProfile, item.id),
    };
    const updated = [...rows, newRow];
    syncToForm(updated);
    setExpandedCategories((prev) => new Set(prev).add(category));
  };

  const categoryOrder = getCategoryOrder(fundingProfile, schoolType);


  const monthlyCashInflow = useMemo(
    () => computeMonthlyCashInflow(rows, 0, y1Students),
    [rows, y1Students]
  );

  const gradeBandEnrollment = watch("schoolProfile.gradeBandEnrollment");
  const gradeBandPerPupil = watch("schoolProfile.gradeBandPerPupil");
  const enrollmentRevenueMethod = watch("schoolProfile.enrollmentRevenueMethod") as string | undefined;
  const priorYearADM = watch("schoolProfile.priorYearADM") as number | undefined;
  const priorYearADA = watch("schoolProfile.priorYearADA") as number | undefined;

  const gradeBandActive = useMemo(() => {
    const gbe = gradeBandEnrollment as Partial<Record<GradeBandKey, number[]>> | undefined;
    const gbp = gradeBandPerPupil as Partial<Record<GradeBandKey, number>> | undefined;
    if (!gbe || !gbp) return false;
    const hasEnrollment = GRADE_BAND_KEYS.some((k) => {
      const arr = gbe[k];
      return Array.isArray(arr) && arr.some((v) => (v ?? 0) > 0);
    });
    const hasRates = GRADE_BAND_KEYS.some((k) => (gbp[k] ?? 0) > 0);
    return hasEnrollment && hasRates;
  }, [gradeBandEnrollment, gradeBandPerPupil]);

  useEffect(() => {
    if (!gradeBandActive) return;
    const gbe = (gradeBandEnrollment ?? {}) as Partial<Record<GradeBandKey, number[]>>;
    const gbp = (gradeBandPerPupil ?? {}) as Partial<Record<GradeBandKey, number>>;
    const method = enrollmentRevenueMethod || "adm";
    const adm = priorYearADM || 0;
    const ada = priorYearADA || 0;
    // For yet_to_launch founders we never collect prior-year attendance data —
    // the ADA inputs live behind a persona-gated block in AssumptionsStep — so
    // fall back to a clean 1.0 ratio (no haircut) instead of using the 0.95
    // sentinel default. This keeps the per-pupil math believable when the
    // founder hasn't (and can't) supply attendance history.
    const ratio = method === "ada" && !yetToLaunch
      ? (adm > 0 && ada > 0 ? Math.min(ada / adm, 1) : 0.95)
      : 1;

    const newAmounts: number[] = [];
    for (let y = 0; y < yearCount; y++) {
      let total = 0;
      let yearEnrollment = 0;
      for (const k of GRADE_BAND_KEYS) {
        const headcount = gbe[k]?.[y] ?? 0;
        const perPupil = gbp[k] ?? 0;
        total += headcount * perPupil;
        yearEnrollment += headcount;
      }
      total *= ratio;
      newAmounts.push(yearEnrollment > 0 ? Math.round(total / yearEnrollment) : 0);
    }

    const perPupilRow = rows.find(r => r.id === "state_local_perpupil");
    if (!perPupilRow) return;
    const changed = newAmounts.some((a, i) => a !== (perPupilRow.amounts[i] ?? 0));
    if (!changed) return;

    const updated = rows.map(r =>
      r.id === "state_local_perpupil"
        ? { ...r, amounts: newAmounts }
        : r
    );
    syncToForm(updated);
  }, [gradeBandActive, gradeBandEnrollment, gradeBandPerPupil, enrollmentRevenueMethod, priorYearADM, priorYearADA, yearCount, rows, syncToForm]);

  const hasAnyRevenue = rows.some((r) => r.enabled && r.amounts[0] > 0);

  const allRowY1Values = useMemo(() => {
    const enabled = rows.filter(r => r.enabled);
    const values = new Map<string, number>();
    for (const r of enabled) {
      if (r.driverType === "percent_of_base") continue;
      const base = r.amounts[0] ?? 0;
      if (r.driverType === "per_student") values.set(r.id, base * y1Students);
      else if (r.driverType === "monthly") values.set(r.id, base * 12);
      else values.set(r.id, base);
    }
    for (const r of enabled) {
      if (r.driverType !== "percent_of_base") continue;
      const baseVal = values.get(r.percentBase || "") || 0;
      const pct = (r.amounts?.[0] ?? 0) / 100;
      values.set(r.id, baseVal * pct);
    }
    return values;
  }, [rows, y1Students]);

  const getCategoryY1Total = (cat: RevenueCategory): number => {
    return rows
      .filter(r => r.category === cat && r.enabled)
      .reduce((sum, r) => {
        const val = allRowY1Values.get(r.id) || 0;
        return cat === "tuition_offsets" ? sum - Math.abs(val) : sum + val;
      }, 0);
  };

  const totalY1Revenue = useMemo(() => {
    return categoryOrder.reduce((sum, cat) => sum + getCategoryY1Total(cat), 0);
  }, [allRowY1Values, categoryOrder]);

  const revenuePerStudent = y1Students > 0 ? Math.round(totalY1Revenue / y1Students) : 0;

  const isCharter = schoolType === "charter_school" || fundingProfile === "charter_public_funded";

  const anySourceChecked = revenueSources?.tuition || revenueSources?.publicFunding || revenueSources?.schoolChoice || revenueSources?.philanthropy;
  const sourceCount = [revenueSources?.tuition, revenueSources?.publicFunding, revenueSources?.schoolChoice, revenueSources?.philanthropy].filter(Boolean).length;

  if (showCategoryPicker) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">
            {yetToLaunch ? "Where will your opening-year money come from?" : "Where Does Your Money Come From?"}
          </h2>
          <p className="text-muted-foreground text-lg">
            {yetToLaunch
              ? "Check every revenue source you expect in your opening year. We'll set up the right line items and starting points for your plan. Most founders begin with just one or two sources — you can always add more as you firm up commitments."
              : "Check every revenue source that applies to your school. We'll set up the right line items and defaults for your budget. Most founders start with just one or two sources - you can always add more as your school grows."}
          </p>
        </div>

        {showCoach && (
          <WhyThisMatters
            why={
              yetToLaunch
                ? "Naming every source up front — even the small ones — keeps your opening plan honest. Lenders and grant reviewers want to see realistic, diversified revenue, not just tuition magically scaling."
                : "Naming every source up front — even the small ones — keeps your model honest. Lenders and grant reviewers want to see realistic, diversified revenue, not just tuition magically scaling."
            }
            revisit={
              yetToLaunch
                ? "Add new sources as you confirm grants, sponsors, or signed family commitments."
                : "Add new sources as you confirm grants, sponsors, or new program lines."
            }
          />
        )}

        {isCharterType && (
          <div className="flex items-start gap-2 p-4 bg-blue-50 rounded-xl border border-blue-200">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">Charter schools typically receive public per-pupil funding. We've pre-checked that for you.</p>
          </div>
        )}

        {y1Students > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-foreground">
              <span className="font-semibold">Revenue needs to cover {y1Students} students in Year 1{y5Students > y1Students ? `, growing to ${y5Students} by Year 5` : ""}.</span>{" "}
              Demand is the engine - the strongest models anchor revenue to enrollment-driven income that grows reliably as you fill seats.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RevenueSourceCheck
            checked={revenueSources?.tuition ?? false}
            onChange={(v) => handleRevenueSourceChange("tuition", v)}
            icon={<DollarSign className="h-5 w-5" />}
            title="Tuition & Fees"
            description="Tuition, registration fees, aftercare, family payments"
            disabled={isCharterType}
          />
          <RevenueSourceCheck
            checked={revenueSources?.publicFunding ?? false}
            onChange={(v) => handleRevenueSourceChange("publicFunding", v)}
            icon={<Landmark className="h-5 w-5" />}
            title="Public Funding"
            description="State, federal, or local per-pupil revenue"
          />
          <RevenueSourceCheck
            checked={revenueSources?.schoolChoice ?? false}
            onChange={(v) => handleRevenueSourceChange("schoolChoice", v)}
            icon={<Vote className="h-5 w-5" />}
            title="School Choice / ESA / Vouchers"
            description="ESA accounts, voucher programs, scholarship organizations"
            disabled={isCharterType}
          />
          <RevenueSourceCheck
            checked={revenueSources?.philanthropy ?? false}
            onChange={(v) => handleRevenueSourceChange("philanthropy", v)}
            icon={<Heart className="h-5 w-5" />}
            title="Philanthropy"
            description="Grants, fundraising, annual fund, board giving, restricted & unrestricted gifts"
          />
        </div>

        <button
          type="button"
          onClick={applyCategories}
          disabled={!anySourceChecked}
          className={cn(
            "w-full rounded-2xl font-semibold py-4 text-lg transition-colors shadow-md",
            anySourceChecked
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {anySourceChecked
            ? `Continue with ${sourceCount} revenue ${sourceCount === 1 ? "source" : "sources"}`
            : "Select at least one revenue source"
          }
        </button>
      </div>
    );
  }

  const revenueErrors = errors.revenue as Record<string, { message?: string }> | undefined;
  const revenueRowsErrors = errors.revenueRows;
  const hasRevenueErrors = !!(revenueErrors && Object.keys(revenueErrors).length > 0);
  const hasRowErrors = !!(revenueRowsErrors && Object.keys(revenueRowsErrors).length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">
          {yetToLaunch ? "Revenue by Source — Opening 5 Years" : "Revenue by Source"}
        </h2>
        <p className="text-muted-foreground text-lg">
          {yetToLaunch
            ? "Enter the amounts you expect for each year of your opening plan. We've pre-filled typical starting points for a school like yours — adjust them to match your concept."
            : "Enter your expected amounts for each year. We've filled in smart defaults - adjust them to match your school."}
        </p>
      </div>

      {stateFundingConfig && stateCode && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 flex items-start gap-3">
          <MapPin className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground space-y-1">
            <span className="font-semibold text-teal-800">
              {stateCode.toUpperCase()} Funding Overview
            </span>
            {isCharterType && stateFundingConfig.charterCoachingText && (
              <p className="text-xs text-teal-700">{stateFundingConfig.charterCoachingText}</p>
            )}
            {!isCharterType && stateFundingConfig.availablePrograms.length > 0 && (
              <p className="text-xs text-teal-700">{stateFundingConfig.schoolChoiceCoachingText}</p>
            )}
            {!isCharterType && stateFundingConfig.availablePrograms.length === 0 && (
              <p className="text-xs text-teal-700">{stateFundingConfig.schoolChoiceCoachingText}</p>
            )}
          </div>
        </div>
      )}

      {(hasRevenueErrors || hasRowErrors) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Please fix the following errors to continue</p>
            {hasRevenueErrors && Object.entries(revenueErrors!).map(([key, err]) => (
              err?.message ? <p key={key} className="text-sm text-destructive mt-1">{err.message}</p> : null
            ))}
            {hasRowErrors && (
              <p className="text-sm text-destructive mt-1">One or more revenue line items have issues - check the highlighted rows below.</p>
            )}
          </div>
        </div>
      )}

      {y1Students > 0 && maxCapacity && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <span className="font-semibold">Building capacity: {maxCapacity} students.</span>{" "}
            Your enrollment grows from {y1Students} to {y5Students} over 5 years
            {y5Students > (maxCapacity || 0) ? (
              <span className="text-amber-700 font-semibold"> - that exceeds your building capacity. Revenue projections beyond capacity aren't realistic.</span>
            ) : (
              <span> ({Math.round(((maxCapacity - y5Students) / maxCapacity) * 100)}% spare capacity by Year 5).</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
        <Info className="h-4 w-4 text-slate-500 flex-shrink-0" />
        <p className="text-sm text-slate-700">
          {/* Yet_to_launch founders never see the prior-year ADA inputs (they're
              persona-gated out of AssumptionsStep), so we drop the "ADA inputs"
              clause for them and only mention the dials they'll actually find. */}
          Enrollment growth rate
          {isCharter
            ? yetToLaunch
              ? ", charter methodology, and deposit timing are"
              : ", charter methodology, deposit timing, and ADA inputs are"
            : " and tuition escalation are"}
          {" "}configured on the{" "}
          {jumpToStep ? (
            <button type="button" onClick={() => jumpToStep(2)} className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
              Assumptions step
            </button>
          ) : (
            <span className="font-semibold text-primary">Assumptions step</span>
          )}.
        </p>
      </div>

      {isCharter && (
        <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-5">
          {stateFundingConfig && (
            <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-teal-100 rounded-lg mt-0.5 flex-shrink-0">
                  <Lightbulb className="h-4 w-4 text-teal-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-teal-900 mb-1">Charter Revenue Coaching - {stateCode}</p>
                  {stateFundingConfig.charterCoachingText && (
                    <p className="text-xs text-teal-800 leading-relaxed">{stateFundingConfig.charterCoachingText}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                {stateFundingConfig.charterBasePerPupil && (
                  <div className="bg-white/60 rounded-lg p-2.5 border border-teal-100">
                    <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-0.5">State Per-Pupil</p>
                    <p className="text-sm font-semibold text-teal-900">
                      ${stateFundingConfig.charterBasePerPupil.min.toLocaleString()} – ${stateFundingConfig.charterBasePerPupil.max.toLocaleString()}
                    </p>
                    {stateFundingConfig.charterBasePerPupil.notes && (
                      <p className="text-[10px] text-teal-700 mt-0.5 leading-tight">{stateFundingConfig.charterBasePerPupil.notes}</p>
                    )}
                  </div>
                )}
                <div className="bg-white/60 rounded-lg p-2.5 border border-teal-100">
                  <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-0.5">Federal Title Funds</p>
                  <p className="text-xs text-teal-800">Title I, II, III and IDEA rows pre-loaded at $0. Enter your projected qualifying student counts.</p>
                </div>
                <div className="bg-white/60 rounded-lg p-2.5 border border-teal-100">
                  <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-0.5">CSP Startup Grant</p>
                  <p className="text-xs text-teal-800">Federal CSP grants are typically $150K/yr for first 3 years. Confirm eligibility with your authorizer.</p>
                </div>
              </div>
            </div>
          )}

          <WeightedEnrollmentInputs yearCount={yearCount} schoolStage={schoolStage} />

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Per-Pupil Rate by Grade Band</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Enter your state's per-pupil funding rate for each grade band you serve. Leave bands at $0 if you don't serve those grades.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GRADE_BAND_KEYS.map((band) => {
                const enrolled = ((watch(`schoolProfile.gradeBandEnrollment.${band}`) as number[] | undefined) ?? []).some((v) => (v ?? 0) > 0);
                const perPupil = watch(`schoolProfile.gradeBandPerPupil.${band}`) as number | undefined;
                if (!enrolled && (perPupil ?? 0) === 0 && (band === "toddlers" || band === "preK" || band === "other")) {
                  return null;
                }
                const otherLabel = (watch("schoolProfile.gradeBandOtherLabel") as string | undefined) || "Other";
                return (
                  <div key={band} className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      {band === "other" ? otherLabel : GRADE_BAND_LABELS[band]}
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={perPupil || ""}
                        onChange={(e) => setValue(`schoolProfile.gradeBandPerPupil.${band}`, parseFloat(e.target.value) || 0, { shouldDirty: true })}
                        className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary"
                        placeholder="0"
                        min={0}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const gbp = (watch("schoolProfile.gradeBandPerPupil") as Partial<Record<GradeBandKey, number>> | undefined) ?? {};
              const gbe = (watch("schoolProfile.gradeBandEnrollment") as Partial<Record<GradeBandKey, number[]>> | undefined) ?? {};
              const hasRates = GRADE_BAND_KEYS.some((k) => (gbp[k] ?? 0) > 0);
              const hasBands = GRADE_BAND_KEYS.some((k) => (gbe[k]?.[0] ?? 0) > 0);
              if (!hasRates || !hasBands) return null;
              const method = watch("schoolProfile.enrollmentRevenueMethod") || "adm";
              const adm = watch("schoolProfile.priorYearADM") || 0;
              const ada = watch("schoolProfile.priorYearADA") || 0;
              // Mirror the grade-band sync effect above: yet_to_launch
              // founders never supply prior-year attendance data (the inputs
              // are persona-gated out of AssumptionsStep), so we keep the
              // estimate at the un-haircut value rather than applying the
              // 0.95 sentinel and rendering a confusing attendance-ratio
              // annotation they can't act on.
              const ratio = method === "ada" && !yetToLaunch
                ? (adm > 0 ? ada / adm : 0.95)
                : 1;
              const y1Total = GRADE_BAND_KEYS.reduce((sum, k) => sum + (gbe[k]?.[0] ?? 0) * (gbp[k] ?? 0), 0) * ratio;
              return (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">Estimated Y1 Per-Pupil Revenue: </span>
                    {formatCurrency(Math.round(y1Total))}
                    {method === "ada" && ratio < 1 && (
                      <span className="text-xs text-green-700 ml-1">(adjusted for {(ratio * 100).toFixed(1)}% attendance ratio)</span>
                    )}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {categoryOrder.filter((cat) => enabledCategories.has(cat)).map((cat) => {
          const catTotal = getCategoryY1Total(cat);
          return (
            <div key={cat} className="rounded-2xl border border-border/60 bg-white p-4 text-center shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{CATEGORY_LABELS[cat]}</div>
              <div className="font-display text-xl font-bold text-foreground">{formatCurrency(catTotal)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{formatPerStudent(catTotal, y1Students)}</div>
            </div>
          );
        })}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center shadow-sm">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Y1 Revenue</div>
          <div className="font-display text-xl font-bold text-foreground">{formatCurrency(totalY1Revenue)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{formatPerStudent(totalY1Revenue, y1Students)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          <span>Showing {enabledCategories.size} revenue {enabledCategories.size === 1 ? "source" : "sources"}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCategoryPicker(true)}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Change sources
        </button>
      </div>

      {categoryOrder.map((cat) => {
        if (!enabledCategories.has(cat)) return null;
        const catRows = rows.filter((r) => r.category === cat);
        const enabledCount = catRows.filter((r) => r.enabled).length;
        const isExpanded = expandedCategories.has(cat);
        const total = getCategoryY1Total(cat);
        let availableItems = getAvailableLineItems(cat, rows.map((r) => r.id));
        if (cat === "school_choice" && stateFundingConfig && !isCharter) {
          const existingRowIds = new Set(rows.map(r => r.id));
          const statePrograms = stateFundingConfig.availablePrograms.filter(p => p.status !== "blocked");
          const stateProgIds = new Set(statePrograms.map(p => PROGRAM_TYPE_TO_ROW_ID[p.type] || `sc_${p.type}`));
          const catalogFiltered = availableItems.filter(item => stateProgIds.has(item.id));
          const extraItems = statePrograms
            .map(p => {
              const id = PROGRAM_TYPE_TO_ROW_ID[p.type] || `sc_${p.type}`;
              if (existingRowIds.has(id)) return null;
              if (catalogFiltered.some(ci => ci.id === id)) return null;
              return { id, category: "school_choice" as RevenueCategory, lineItem: p.label, driverType: "per_student" as const };
            })
            .filter(Boolean) as { id: string; category: RevenueCategory; lineItem: string; driverType: "per_student" }[];
          availableItems = [...catalogFiltered, ...extraItems];
        }
        const Icon = CATEGORY_ICONS[cat];
        const guidance = CATEGORY_GUIDANCE[cat];

        return (
          <div
            key={cat}
            className="bg-card rounded-2xl border border-border/50 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">{CATEGORY_LABELS[cat]}</span>
                {enabledCount > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {enabledCount} active
                  </span>
                )}
              </div>
              {total > 0 && (
                <div className="text-right">
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(total)} Y1
                  </span>
                  {y1Students > 0 && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {formatPerStudent(total, y1Students)}
                    </div>
                  )}
                </div>
              )}
            </button>

            <div className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-in-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}>
              <div className="overflow-hidden" aria-hidden={!isExpanded} inert={!isExpanded || undefined}>
              <div className="px-5 pb-5 space-y-3">
                {guidance && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                    <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{guidance.tip}</span>
                  </div>
                )}

                {catRows.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No line items in this category yet.</p>
                )}

                {cat === "tuition_and_fees" ? (() => {
                  const FEE_IDS = new Set(["registration_fees", "student_fees", "aftercare", "summer_program", "other_student_revenue"]);
                  const tuitionRows = catRows.filter(r => !FEE_IDS.has(r.id));
                  const feeRows = catRows.filter(r => FEE_IDS.has(r.id));
                  return (
                    <>
                      {tuitionRows.map((row) => {
                        const rowIndex = rows.findIndex((r) => r.id === row.id);
                        const rowErrors = (errors.revenueRows as Record<string, unknown>)?.[rowIndex] as Record<string, { message?: string }> | undefined;
                        return (
                          <RevenueLineItem
                            key={row.id}
                            row={row}
                            yearCount={yearCount}
                            schoolStage={schoolStage}
                            onToggle={() => toggleRow(row.id)}
                            onDriverChange={(dt) => updateDriver(row.id, dt)}
                            onAmountChange={(yi, val) => updateAmount(row.id, yi, val)}
                            onTimingChange={(field, val) => updateTimingField(row.id, field, val)}
                            onRemove={() => removeRow(row.id)}
                            y1Students={y1Students}
                            locked={false}
                            rowErrors={rowErrors}
                            schoolType={schoolType}
                            fundingFragility={fragilityByRowId.get(row.id)}
                          />
                        );
                      })}
                      {feeRows.length > 0 && (
                        <div className="flex items-center gap-2 pt-2 pb-1">
                          <div className="h-px flex-1 bg-border/60" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fees</span>
                          <div className="h-px flex-1 bg-border/60" />
                        </div>
                      )}
                      {feeRows.map((row) => {
                        const rowIndex = rows.findIndex((r) => r.id === row.id);
                        const rowErrors = (errors.revenueRows as Record<string, unknown>)?.[rowIndex] as Record<string, { message?: string }> | undefined;
                        return (
                          <RevenueLineItem
                            key={row.id}
                            row={row}
                            yearCount={yearCount}
                            schoolStage={schoolStage}
                            onToggle={() => toggleRow(row.id)}
                            onDriverChange={(dt) => updateDriver(row.id, dt)}
                            onAmountChange={(yi, val) => updateAmount(row.id, yi, val)}
                            onTimingChange={(field, val) => updateTimingField(row.id, field, val)}
                            onRemove={() => removeRow(row.id)}
                            y1Students={y1Students}
                            locked={false}
                            rowErrors={rowErrors}
                            schoolType={schoolType}
                            fundingFragility={fragilityByRowId.get(row.id)}
                          />
                        );
                      })}
                    </>
                  );
                })() : catRows.map((row) => {
                  const rowIndex = rows.findIndex((r) => r.id === row.id);
                  const rowErrors = (errors.revenueRows as Record<string, unknown>)?.[rowIndex] as Record<string, { message?: string }> | undefined;
                  return (
                  <RevenueLineItem
                    key={row.id}
                    row={row}
                    yearCount={yearCount}
                    schoolStage={schoolStage}
                    onToggle={() => toggleRow(row.id)}
                    onDriverChange={(dt) => updateDriver(row.id, dt)}
                    onAmountChange={(yi, val) => updateAmount(row.id, yi, val)}
                    onTimingChange={(field, val) => updateTimingField(row.id, field, val)}
                    onRemove={() => removeRow(row.id)}
                    y1Students={y1Students}
                    locked={row.id === "state_local_perpupil" && gradeBandActive}
                    lockedMessage="This amount is computed from your grade-band enrollment and per-pupil rates above. Edit those inputs to change funding."
                    rowErrors={rowErrors}
                    schoolType={schoolType}
                    fundingFragility={fragilityByRowId.get(row.id)}
                  />
                  );
                })}

                {availableItems.length > 0 && (
                  <AddLineItemDropdown
                    category={cat}
                    availableItems={availableItems.map((a) => ({ id: a.id, label: a.lineItem }))}
                    onAdd={(itemId) => addLineItem(cat, itemId)}
                  />
                )}

                <RationaleField
                  rationaleKey={`revenue:${cat}`}
                  label={`Why these ${CATEGORY_LABELS[cat].toLowerCase()} numbers?`}
                  placeholder={
                    total > 0 && y1Students > 0
                      ? `You're projecting ${formatCurrency(total)} in Year 1 (${formatPerStudent(total, y1Students)}). What anchors that — pricing comps, signed pledges, awarded grants, prior school benchmarks?`
                      : total > 0
                        ? `You're projecting ${formatCurrency(total)} in Year 1. Where does that number come from — pricing comps, signed pledges, awarded grants, or another anchor?`
                        : "Once you enter amounts, capture how you arrived at them — pricing comps, signed pledges, awarded grants, or prior school benchmarks."
                  }
                  helperText="Two sentences max. Lenders and board members will read this side-by-side with your numbers."
                />
              </div>
              </div>
            </div>
          </div>
        );
      })}

      {!isCharter && (revenueSources?.tuition || enabledCategories.has("tuition_and_fees")) && (
        <TuitionTierEditor yearCount={yearCount} schoolStage={schoolStage} />
      )}

      {hasAnyRevenue && (
        <CashFlowTimingSummary monthlyInflow={monthlyCashInflow} />
      )}
    </div>
  );
}

interface WeightedEnrollmentInputsProps {
  yearCount: number;
  schoolStage: string | undefined;
}

function WeightedEnrollmentInputs({ yearCount, schoolStage }: WeightedEnrollmentInputsProps) {
  const { watch, setValue } = useFormContext();
  const spedCount = (watch("schoolProfile.spedCount") as number[] | undefined) || new Array(yearCount).fill(0);
  const ellCount = (watch("schoolProfile.ellCount") as number[] | undefined) || new Array(yearCount).fill(0);
  const ecoDisCount = (watch("schoolProfile.ecoDisCount") as number[] | undefined) || new Array(yearCount).fill(0);

  const updateCount = (field: string, yearIndex: number, value: number) => {
    const current = (watch(`schoolProfile.${field}`) as number[] | undefined) || new Array(yearCount).fill(0);
    const updated = [...current];
    updated[yearIndex] = value;
    setValue(`schoolProfile.${field}`, updated, { shouldDirty: true });
  };

  const getYearLabel = (index: number): string => {
    if (schoolStage === "operating_school" && index === 0) return "Current";
    return `Y${index + 1}`;
  };

  const categories = [
    { field: "spedCount", label: "Special Education (SPED)", data: spedCount, hint: "Students with IEPs who generate additional weighted funding" },
    { field: "ellCount", label: "English Language Learners (ELL)", data: ellCount, hint: "Students receiving ELL services with supplemental funding" },
    { field: "ecoDisCount", label: "Economically Disadvantaged", data: ecoDisCount, hint: "Students qualifying for free/reduced lunch (Title I eligible)" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Weighted Enrollment Populations</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Many states provide additional per-pupil funding for SPED, ELL, and economically disadvantaged students.
        Enter headcounts so your model reflects weighted funding accurately.
      </p>
      {categories.map(({ field, label, data, hint }) => (
        <div key={field} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{label}</span>
            <span className="text-[10px] text-muted-foreground">({hint})</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
            {Array.from({ length: yearCount }).map((_, yi) => (
              <div key={yi} className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {getYearLabel(yi)}
                </label>
                <input
                  type="number"
                  value={data[yi] ?? 0}
                  onChange={(e) => updateCount(field, yi, Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="0"
                  min={0}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TuitionTierEditorProps {
  yearCount: number;
  schoolStage: string | undefined;
}

function TuitionTierEditor({ yearCount, schoolStage }: TuitionTierEditorProps) {
  const { watch, setValue } = useFormContext();
  const tiers = (watch("tuitionTiers") as TuitionTier[] | undefined) || [];

  useEffect(() => {
    if (!tiers || tiers.length === 0) {
      setValue("tuitionTiers", getDefaultTuitionTiers(yearCount), { shouldDirty: true });
    }
  }, []);

  const updateTier = (index: number, field: keyof TuitionTier, value: unknown) => {
    const updated = tiers.map((t, i) => {
      if (i !== index) return t;
      if (field === "label") {
        return { ...t, label: value as string, tierType: "custom" as const };
      }
      return { ...t, [field]: value };
    });
    setValue("tuitionTiers", updated, { shouldDirty: true });
  };

  const updateStudentCount = (tierIndex: number, yearIndex: number, value: number) => {
    const updated = tiers.map((t, i) => {
      if (i !== tierIndex) return t;
      const newCounts = [...t.studentCounts];
      newCounts[yearIndex] = value;
      return { ...t, studentCounts: newCounts };
    });
    setValue("tuitionTiers", updated, { shouldDirty: true });
  };

  const addTier = () => {
    const newTier: TuitionTier = {
      id: `tier_custom_${Date.now()}`,
      tierType: "custom",
      label: "",
      discountPercent: 0,
      studentCounts: new Array(yearCount).fill(0),
    };
    setValue("tuitionTiers", [...tiers, newTier], { shouldDirty: true });
  };

  const removeTier = (index: number) => {
    const updated = tiers.filter((_, i) => i !== index);
    setValue("tuitionTiers", updated, { shouldDirty: true });
  };

  const getYearLabel = (index: number): string => {
    if (schoolStage === "operating_school" && index === 0) return "Current";
    return `Y${index + 1}`;
  };

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-1">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Tuition Discount Tiers</span>
        </div>
        <p className="text-xs text-muted-foreground ml-8">
          Define discount tiers for different student groups. Set 100% discount for free tuition (e.g., founders' kids). Student counts should reflect how many students receive each discount per year.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-3">
        {tiers.map((tier, idx) => (
          <div
            key={tier.id}
            className="rounded-xl border-2 border-primary/20 bg-primary/[0.02] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 flex items-center gap-3">
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => updateTier(idx, "label", e.target.value)}
                  placeholder="Tier name (e.g., Sibling Discount)"
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number"
                    value={tier.discountPercent}
                    onChange={(e) => updateTier(idx, "discountPercent", Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className="w-20 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 text-right"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">% off</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeTier(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Remove tier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {tier.discountPercent === 100 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800 flex items-center gap-1.5">
                <Info className="h-3 w-3 flex-shrink-0" />
                <span>100% discount = free tuition for these students</span>
              </div>
            )}

            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
              {Array.from({ length: yearCount }).map((_, yi) => (
                <div key={yi} className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {getYearLabel(yi)} students
                  </label>
                  <input
                    type="number"
                    value={tier.studentCounts[yi] ?? 0}
                    onChange={(e) => updateStudentCount(idx, yi, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    placeholder="0"
                    min={0}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addTier}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors px-3 py-2 rounded-lg hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add Discount Tier
        </button>
      </div>
    </div>
  );
}

interface RevenueLineItemProps {
  row: RevenueRowData;
  yearCount: number;
  schoolStage: string | undefined;
  onToggle: () => void;
  onDriverChange: (dt: RevenueDriverType) => void;
  onAmountChange: (yearIndex: number, value: number) => void;
  onTimingChange: (field: string, value: unknown) => void;
  onRemove: () => void;
  y1Students?: number;
  locked?: boolean;
  lockedMessage?: string;
  rowErrors?: Record<string, { message?: string }>;
  schoolType?: string;
  /**
   * Task #455 — when set, render a status chip beside the line item label so
   * the founder can immediately see that the underlying state-choice program
   * is in a non-active legal state (litigated / blocked / pending).
   */
  fundingFragility?: FragileProgramMatch;
}

function RevenueLineItem({
  row,
  yearCount,
  schoolStage,
  onToggle,
  onDriverChange,
  onAmountChange,
  onTimingChange,
  onRemove,
  y1Students = 0,
  locked = false,
  lockedMessage,
  rowErrors,
  schoolType,
  fundingFragility,
}: RevenueLineItemProps) {
  const [showTiming, setShowTiming] = useState(false);

  const hasTimingControls = row.id === "gross_tuition"
    || row.category === "tuition_offsets"
    || row.category === "public_funding"
    || row.category === "school_choice"
    || row.category === "philanthropy";

  const hasErrors = rowErrors && Object.keys(rowErrors).length > 0;

  return (
    <div
      data-testid={`revenue-row-${row.id}`}
      className={cn(
        "rounded-xl border-2 p-4 transition-all",
        hasErrors
          ? "border-destructive/50 bg-destructive/[0.02]"
          : row.enabled
            ? "border-primary/20 bg-primary/[0.02]"
            : "border-border bg-secondary/20 opacity-60"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0",
              row.enabled ? "bg-primary border-primary" : "border-border bg-card"
            )}
          >
            {row.enabled && (
              <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground">{row.lineItem}</span>
              {fundingFragility && (
                <span
                  data-testid={`funding-fragility-chip-${row.id}`}
                  title={
                    fundingFragility.notes
                      ? `${fundingFragility.programLabel} — ${fundingFragility.notes}`
                      : `${fundingFragility.programLabel} (${fundingFragility.status})`
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    fundingFragility.status === "litigated" && "border-amber-300 bg-amber-50 text-amber-800",
                    fundingFragility.status === "blocked" && "border-red-300 bg-red-50 text-red-800",
                    fundingFragility.status === "pending" && "border-blue-300 bg-blue-50 text-blue-800",
                  )}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {fundingFragility.status === "litigated" && "In litigation"}
                  {fundingFragility.status === "blocked" && "Blocked by court"}
                  {fundingFragility.status === "pending" && "Pending go-live"}
                </span>
              )}
            </div>
            {row.note && (
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{row.note}</span>
            )}
            {fundingFragility?.notes && (
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{fundingFragility.notes}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {row.enabled && (
            <>
              {hasTimingControls && (
                <button
                  type="button"
                  onClick={() => setShowTiming(!showTiming)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border transition-colors",
                    showTiming
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                  title="Payment timing settings"
                >
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">Timing</span>
                </button>
              )}
              <div className="flex flex-col gap-0.5">
                <select
                  value={row.driverType}
                  onChange={(e) => onDriverChange(e.target.value as RevenueDriverType)}
                  className={cn(
                    "text-xs border rounded-lg px-2 py-1.5 bg-card text-foreground cursor-pointer",
                    rowErrors?.driverType ? "border-destructive" : "border-border"
                  )}
                >
                  {(Object.keys(DRIVER_TYPE_LABELS) as RevenueDriverType[]).map((dt) => (
                    <option key={dt} value={dt}>{DRIVER_TYPE_LABELS[dt]}</option>
                  ))}
                </select>
                <span className="text-[9px] text-muted-foreground leading-tight">
                  {row.driverType === "per_student" && "Scales with enrollment"}
                  {row.driverType === "annual_fixed" && "Fixed amount each year"}
                  {row.driverType === "monthly" && "Multiplied ×12 for annual total"}
                  {row.driverType === "percent_of_base" && "% of base tuition revenue"}
                </span>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Remove line item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {row.enabled && locked && lockedMessage && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2 mb-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{lockedMessage}</span>
        </div>
      )}

      {row.enabled && !locked && (
        <>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${yearCount}, 1fr)` }}>
            {Array.from({ length: yearCount }).map((_, yi) => (
              <div key={yi} className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {getYearLabel(yi, schoolStage)}
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                    {row.driverType === "percent_of_base" ? "%" : "$"}
                  </span>
                  <input
                    data-testid={`amount-y${yi + 1}`}
                    type="number"
                    value={row.amounts[yi] ?? 0}
                    onChange={(e) => onAmountChange(yi, parseFloat(e.target.value) || 0)}
                    aria-invalid={rowErrors?.amounts ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg border bg-card pl-6 pr-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
                      rowErrors?.amounts ? "border-destructive" : "border-border"
                    )}
                    placeholder="0"
                    min={0}
                  />
                </div>
              </div>
            ))}
          </div>

          {y1Students > 0 && row.driverType !== "per_student" && row.driverType !== "percent_of_base" && row.amounts[0] > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              ≈ {formatPerStudent(row.driverType === "monthly" ? row.amounts[0] * 12 : row.amounts[0], y1Students)}
            </p>
          )}

          {y1Students > 0 && row.driverType === "per_student" && row.amounts[0] > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground mt-1">
                = ${(row.amounts[0] * y1Students).toLocaleString()} total for {y1Students} students in Y1
              </p>
              {row.amounts[0] > 50000 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>${row.amounts[0].toLocaleString()}</strong> per student seems high - did you enter an annual total instead of a per-student amount?
                    {y1Students > 0 && (
                      <> A per-student amount of <strong>${Math.round(row.amounts[0] / y1Students).toLocaleString()}</strong> would give the same ${row.amounts[0].toLocaleString()} total.</>
                    )}
                    {" "}If this is a total, switch the dropdown to <strong>"Annual Fixed"</strong>.
                  </span>
                </div>
              )}
            </>
          )}

          {rowErrors?.amounts && (
            <p className="text-sm text-destructive font-medium animate-in fade-in mt-1">{rowErrors.amounts.message || "Please check the amounts entered"}</p>
          )}
          {rowErrors?.driverType && (
            <p className="text-sm text-destructive font-medium animate-in fade-in mt-1">{rowErrors.driverType.message || "Please select a calculation method"}</p>
          )}
          {rowErrors?.category && (
            <p className="text-sm text-destructive font-medium animate-in fade-in mt-1">{rowErrors.category.message || "Please select a revenue category"}</p>
          )}

          {showTiming && hasTimingControls && (
            <TimingControls
              row={row}
              onTimingChange={onTimingChange}
            />
          )}
        </>
      )}
    </div>
  );
}

interface TimingControlsProps {
  row: RevenueRowData;
  onTimingChange: (field: string, value: unknown) => void;
}

function TimingControls({ row, onTimingChange }: TimingControlsProps) {
  const { watch } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType");
  const isCharter = schoolType === "charter_school";
  const category = row.category;
  const isOverridden = row.timingOverridden === true;

  const handleTimingOverride = (field: string, value: unknown) => {
    onTimingChange(field, value);
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
        <Clock className="h-3 w-3" /> Payment Timing
        {!isCharter && (category === "tuition_and_fees" || category === "tuition_offsets") && (
          <span className={cn(
            "ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
            isOverridden ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
          )}>
            {isOverridden ? "Custom" : "Default"}
          </span>
        )}
      </p>
      
      {!isCharter && (category === "tuition_and_fees" || category === "tuition_offsets") && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>If parents pay monthly instead of upfront, you may need extra cash to cover summer months when tuition isn't coming in but bills keep going out. Plan for a 2–3 month cash cushion.</span>
        </div>
      )}
      {category === "public_funding" && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-teal-50 dark:bg-teal-950/30 rounded-lg text-[11px] text-teal-800 dark:text-teal-300">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>State and district payments typically arrive 30-45 days after the reporting period. Budget for the cash gap in your first months of operation.</span>
        </div>
      )}
      {category === "school_choice" && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-teal-50 dark:bg-teal-950/30 rounded-lg text-[11px] text-teal-800 dark:text-teal-300">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>ESA/voucher disbursements vary by state. Reimbursement programs can lag 45-60 days - plan bridge funding if this is a major revenue source.</span>
        </div>
      )}
      {category === "philanthropy" && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-teal-50 dark:bg-teal-950/30 rounded-lg text-[11px] text-teal-800 dark:text-teal-300">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>Grants and donations often arrive in lump sums. Mark "projected" grants as such - it's good practice to plan for the possibility that uncommitted funds don't come through.</span>
        </div>
      )}
      {category === "philanthropy" && (
        <FinancingInsight text="If donations make up a large share of your revenue, consider how sustainable that is year over year. Diversifying toward enrollment-driven income builds long-term stability." className="mb-2" />
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {category === "tuition_and_fees" && !isCharter && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Billing Months
              </label>
              <select
                value={row.billingMonths ?? 10}
                onChange={(e) => handleTimingOverride("billingMonths", parseInt(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                <option value={9}>9 months</option>
                <option value={10}>10 months</option>
                <option value={12}>12 months</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Method
              </label>
              <select
                value={row.collectionMethod ?? "autopay"}
                onChange={(e) => handleTimingOverride("collectionMethod", e.target.value as CollectionMethod)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(COLLECTION_METHOD_LABELS) as CollectionMethod[]).map((cm) => (
                  <option key={cm} value={cm}>{COLLECTION_METHOD_LABELS[cm]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm> %
              </label>
              <input
                type="number"
                value={row.collectionRate ?? DEFAULT_COLLECTION_RATE_BY_METHOD[(row.collectionMethod ?? "autopay") as "autopay" | "invoiced" | "mixed"]}
                onChange={(e) => { const v = parseFloat(e.target.value); handleTimingOverride("collectionRate", isNaN(v) ? 0 : v); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full"
                min={0}
                max={100}
              />
              <span
                className="inline-flex items-center self-start mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 cursor-help"
                title="Industry benchmark: most invoiced K-8 private schools collect 88-93% of billed tuition annually. Lower rates compound across all 5 forecast years and materially reduce DSCR — set this with care and document any assumption above 95% for invoiced billing."
              >
                Benchmark · {COLLECTION_RATE_BENCHMARK_COPY}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={row.collectionDelayDays ?? 0}
                  onChange={(e) => { const v = parseInt(e.target.value); handleTimingOverride("collectionDelayDays", isNaN(v) ? 0 : v); }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                  min={0}
                  max={90}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
          </>
        )}
        {category === "tuition_and_fees" && isCharter && (
          <div className="col-span-full flex items-start gap-1.5 p-2 bg-teal-50 dark:bg-teal-950/30 rounded-lg text-[11px] text-teal-800 dark:text-teal-300">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>Charter school revenue is publicly funded — billing months and collection method don't apply.</span>
          </div>
        )}

        {category === "tuition_offsets" && !isCharter && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Billing Months
              </label>
              <select
                value={row.billingMonths ?? 10}
                onChange={(e) => handleTimingOverride("billingMonths", parseInt(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                <option value={9}>9 months</option>
                <option value={10}>10 months</option>
                <option value={12}>12 months</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm> %
              </label>
              <input
                type="number"
                value={row.collectionRate ?? DEFAULT_COLLECTION_RATE_BY_METHOD.autopay}
                onChange={(e) => { const v = parseFloat(e.target.value); handleTimingOverride("collectionRate", isNaN(v) ? 0 : v); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full"
                min={0}
                max={100}
              />
              <span
                className="inline-flex items-center self-start mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 cursor-help"
                title="Industry benchmark: most invoiced K-8 private schools collect 88-93% of billed tuition annually. Lower rates compound across all 5 forecast years and materially reduce DSCR — set this with care and document any assumption above 95% for invoiced billing."
              >
                Benchmark · {COLLECTION_RATE_BENCHMARK_COPY}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={row.collectionDelayDays ?? 0}
                  onChange={(e) => { const v = parseInt(e.target.value); handleTimingOverride("collectionDelayDays", isNaN(v) ? 0 : v); }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                  min={0}
                  max={90}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
          </>
        )}

        {category === "public_funding" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Payment Frequency
              </label>
              <select
                value={row.paymentFrequency ?? "monthly"}
                onChange={(e) => onTimingChange("paymentFrequency", e.target.value as PaymentFrequency)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(PAYMENT_FREQUENCY_LABELS) as PaymentFrequency[]).map((pf) => (
                  <option key={pf} value={pf}>{PAYMENT_FREQUENCY_LABELS[pf]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Payment Timing
              </label>
              <select
                value={row.paymentTiming ?? "upfront"}
                onChange={(e) => onTimingChange("paymentTiming", e.target.value as PaymentTiming)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(PAYMENT_TIMING_LABELS) as PaymentTiming[]).map((pt) => (
                  <option key={pt} value={pt}>{PAYMENT_TIMING_LABELS[pt]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm> %
              </label>
              <input
                type="number"
                value={row.collectionRate ?? DEFAULT_COLLECTION_RATE_BY_METHOD.autopay}
                onChange={(e) => { const v = parseFloat(e.target.value); handleTimingOverride("collectionRate", isNaN(v) ? 0 : v); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full"
                min={0}
                max={100}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={row.collectionDelayDays ?? 30}
                  onChange={(e) => { const v = parseInt(e.target.value); handleTimingOverride("collectionDelayDays", isNaN(v) ? 0 : v); }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                  min={0}
                  max={90}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
          </>
        )}

        {category === "school_choice" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Disbursement Type
              </label>
              <select
                value={row.disbursementType ?? "direct"}
                onChange={(e) => onTimingChange("disbursementType", e.target.value as DisbursementType)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(DISBURSEMENT_TYPE_LABELS) as DisbursementType[]).map((dt) => (
                  <option key={dt} value={dt}>{DISBURSEMENT_TYPE_LABELS[dt]}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                "Direct" means the state sends funds on a schedule. "Reimbursement" means you spend first and get paid back - this creates a cash gap.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm> %
              </label>
              <input
                type="number"
                value={row.collectionRate ?? DEFAULT_COLLECTION_RATE_BY_METHOD.autopay}
                onChange={(e) => { const v = parseFloat(e.target.value); handleTimingOverride("collectionRate", isNaN(v) ? 0 : v); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full"
                min={0}
                max={100}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={row.collectionDelayDays ?? 45}
                  onChange={(e) => { const v = parseInt(e.target.value); handleTimingOverride("collectionDelayDays", isNaN(v) ? 0 : v); }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                  min={0}
                  max={90}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
            {row.disbursementType === "reimbursement" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Reimbursement Lag
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={row.reimbursementLagMonths ?? 2}
                    onChange={(e) => { const v = parseInt(e.target.value); onTimingChange("reimbursementLagMonths", isNaN(v) ? 0 : v); }}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-14"
                    min={0}
                    max={6}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">months</span>
                </div>
              </div>
            )}
          </>
        )}

        {category === "philanthropy" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Status
              </label>
              <select
                value={row.grantStatus ?? "projected"}
                onChange={(e) => onTimingChange("grantStatus", e.target.value as GrantStatus)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(GRANT_STATUS_LABELS) as GrantStatus[]).map((gs) => (
                  <option key={gs} value={gs}>{GRANT_STATUS_LABELS[gs]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Expected Receipt
              </label>
              <select
                value={row.receiptQuarter ?? 1}
                onChange={(e) => onTimingChange("receiptQuarter", parseInt(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                <option value={1}>Q1 (Jul-Sep)</option>
                <option value={2}>Q2 (Oct-Dec)</option>
                <option value={3}>Q3 (Jan-Mar)</option>
                <option value={4}>Q4 (Apr-Jun)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm> %
              </label>
              <input
                type="number"
                value={row.collectionRate ?? DEFAULT_COLLECTION_RATE_BY_METHOD.invoiced}
                onChange={(e) => { const v = parseFloat(e.target.value); handleTimingOverride("collectionRate", isNaN(v) ? 0 : v); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full"
                min={0}
                max={100}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Collection Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={row.collectionDelayDays ?? 60}
                  onChange={(e) => { const v = parseInt(e.target.value); handleTimingOverride("collectionDelayDays", isNaN(v) ? 0 : v); }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                  min={0}
                  max={120}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface CashFlowTimingSummaryProps {
  monthlyInflow: number[];
}

function CashFlowTimingSummary({ monthlyInflow }: CashFlowTimingSummaryProps) {
  const maxInflow = Math.max(...monthlyInflow, 1);
  const totalInflow = monthlyInflow.reduce((sum, v) => sum + v, 0);
  const avgMonthly = totalInflow / 12;
  const lowMonths = monthlyInflow.filter((v) => v < avgMonthly * 0.5).length;

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Year 1 Cash Inflow Timing</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Estimated monthly revenue distribution based on your payment timing settings.
        </p>
      </div>

      <div className="px-5 py-5">
        <div className="flex items-end gap-1.5" style={{ height: "160px" }}>
          {monthlyInflow.map((amount, i) => {
            const heightPct = maxInflow > 0 ? (amount / maxInflow) * 100 : 0;
            const isBelowAvg = amount < avgMonthly * 0.5;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%" }}>
                <div className="w-full relative" style={{ flex: "1 1 0%", minHeight: 0 }}>
                  <div
                    className={cn(
                      "absolute bottom-0 left-0 right-0 rounded-t-md transition-all",
                      isBelowAvg ? "bg-amber-400/70" : "bg-primary/70"
                    )}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                    title={`$${Math.round(amount).toLocaleString()}`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium flex-shrink-0">{MONTH_LABELS[i]}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border/50 pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total Year 1</p>
            <p className="text-lg font-bold text-foreground">${Math.round(totalInflow).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Avg Monthly</p>
            <p className="text-lg font-bold text-foreground">${Math.round(avgMonthly).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Low Months</p>
            <p className={cn("text-lg font-bold", lowMonths > 3 ? "text-amber-500" : "text-foreground")}>
              {lowMonths} of 12
            </p>
          </div>
        </div>

        {lowMonths > 3 && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {lowMonths} months have revenue below 50% of the average. Consider a line of credit or reserves to cover operating expenses during lean months.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface AddLineItemDropdownProps {
  category: RevenueCategory;
  availableItems: { id: string; label: string }[];
  onAdd: (itemId: string) => void;
}

function AddLineItemDropdown({ category, availableItems, onAdd }: AddLineItemDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (availableItems.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-primary font-medium hover:text-primary/80 transition-colors py-2"
      >
        <Plus className="h-4 w-4" /> Add a revenue line
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-card rounded-xl border border-border shadow-lg py-1 min-w-[280px] max-h-60 overflow-y-auto">
            {availableItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onAdd(item.id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-secondary/50 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
