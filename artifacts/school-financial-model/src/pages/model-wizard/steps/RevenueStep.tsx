import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { ChevronDown, ChevronRight, Plus, Trash2, Clock, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  CATEGORY_LABELS,
  DRIVER_TYPE_LABELS,
  COLLECTION_METHOD_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_TIMING_LABELS,
  DISBURSEMENT_TYPE_LABELS,
  GRANT_STATUS_LABELS,
  generateDefaultRevenueRows,
  getCategoryOrder,
  getAvailableLineItems,
  getTimingDefaults,
  computeMonthlyCashInflow,
} from "@/lib/revenue-defaults";

function getYearCount(_schoolStage: string | undefined): number {
  return 5;
}

function getYearLabel(index: number, schoolStage: string | undefined): string {
  if (schoolStage === "operating_school" && index === 0) return "Current";
  return `Y${index + 1}`;
}

const MONTH_LABELS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export function RevenueStep() {
  const { watch, setValue, getValues } = useFormContext();
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolStage = watch("schoolProfile.schoolStage") as string | undefined;
  const schoolType = watch("schoolProfile.schoolType") as string | undefined;
  const yearCount = getYearCount(schoolStage);

  const enrollment = watch("enrollment");
  const y1Students = enrollment?.year1 || 0;

  const formRows = watch("revenueRows") as RevenueRowData[] | undefined;
  const [rows, setRows] = useState<RevenueRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<RevenueCategory>>(new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    if (formRows !== undefined && formRows.length > 0) {
      const adjusted = formRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      setRows(adjusted);
      if (!defaultsApplied) {
        const enabledCats = new Set<RevenueCategory>();
        adjusted.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
        setExpandedCategories(enabledCats);
        setDefaultsApplied(true);
      }
    } else if (formRows !== undefined && Array.isArray(formRows) && formRows.length === 0 && defaultsApplied) {
      setRows([]);
    } else if (!defaultsApplied) {
      const defaults = generateDefaultRevenueRows(fundingProfile, yearCount);
      setRows(defaults);
      const enabledCats = new Set<RevenueCategory>();
      defaults.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
      setValue("revenueRows", defaults, { shouldDirty: true });
      setDefaultsApplied(true);
    }
  }, [formRows, fundingProfile, yearCount, defaultsApplied, setValue]);

  const CHARTER_HIDDEN_CATEGORIES: RevenueCategory[] = ["tuition_and_fees", "tuition_offsets", "school_choice"];
  useEffect(() => {
    if (!defaultsApplied || rows.length === 0) return;
    const isCharter = schoolType === "charter_school";
    if (!isCharter) return;
    const updated = rows.map((row) => {
      if (CHARTER_HIDDEN_CATEGORIES.includes(row.category) && row.enabled) {
        return { ...row, enabled: false };
      }
      return row;
    });
    const changed = updated.some((r, i) => r.enabled !== rows[i].enabled);
    if (changed) {
      setRows(updated);
      setValue("revenueRows", updated, { shouldDirty: true });
    }
  }, [schoolType, defaultsApplied]);

  const syncToForm = useCallback((updatedRows: RevenueRowData[]) => {
    setRows(updatedRows);
    setValue("revenueRows", updatedRows, { shouldDirty: true });
  }, [setValue]);

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
    const updated = rows.map((r) => r.id === id ? { ...r, [field]: value } : r);
    syncToForm(updated);
  };

  const removeRow = (id: string) => {
    const updated = rows.filter((r) => r.id !== id);
    syncToForm(updated);
  };

  const addLineItem = (category: RevenueCategory, itemId: string) => {
    const available = getAvailableLineItems(category, rows.map((r) => r.id));
    const item = available.find((a) => a.id === itemId);
    if (!item) return;
    const newRow: RevenueRowData = {
      id: item.id,
      category: item.category,
      lineItem: item.lineItem,
      enabled: true,
      driverType: item.driverType,
      amounts: new Array(yearCount).fill(0),
      ...getTimingDefaults(item.category, fundingProfile, item.id),
    };
    const updated = [...rows, newRow];
    syncToForm(updated);
    setExpandedCategories((prev) => new Set(prev).add(category));
  };

  const categoryOrder = getCategoryOrder(fundingProfile, schoolType);

  const getCategoryTotal = (cat: RevenueCategory): number => {
    return rows
      .filter((r) => r.category === cat && r.enabled)
      .reduce((sum, r) => sum + (r.amounts[0] ?? 0), 0);
  };

  const monthlyCashInflow = useMemo(
    () => computeMonthlyCashInflow(rows, 0, y1Students),
    [rows, y1Students]
  );

  const hasAnyRevenue = rows.some((r) => r.enabled && r.amounts[0] > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Where Does Your Money Come From?</h2>
        <p className="text-muted-foreground text-lg">
          Toggle on the revenue sources that apply to your school and enter your expected amounts for each year.
        </p>
      </div>

      {categoryOrder.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat);
        const enabledCount = catRows.filter((r) => r.enabled).length;
        const isExpanded = expandedCategories.has(cat);
        const total = getCategoryTotal(cat);
        const availableItems = getAvailableLineItems(cat, rows.map((r) => r.id));

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
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="font-semibold text-foreground">{CATEGORY_LABELS[cat]}</span>
                {enabledCount > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {enabledCount} active
                  </span>
                )}
              </div>
              {total > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  ${total.toLocaleString()} Y1
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 space-y-3">
                {catRows.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No line items in this category yet.</p>
                )}

                {catRows.map((row) => (
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
                  />
                ))}

                {availableItems.length > 0 && (
                  <AddLineItemDropdown
                    category={cat}
                    availableItems={availableItems.map((a) => ({ id: a.id, label: a.lineItem }))}
                    onAdd={(itemId) => addLineItem(cat, itemId)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {hasAnyRevenue && (
        <CashFlowTimingSummary monthlyInflow={monthlyCashInflow} />
      )}
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
}: RevenueLineItemProps) {
  const [showTiming, setShowTiming] = useState(false);

  const hasTimingControls = row.id === "gross_tuition"
    || row.category === "tuition_offsets"
    || row.category === "public_funding"
    || row.category === "school_choice"
    || row.category === "grants_contributions";

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 transition-all",
        row.enabled
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
          <span className="font-medium text-sm text-foreground">{row.lineItem}</span>
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
              <select
                value={row.driverType}
                onChange={(e) => onDriverChange(e.target.value as RevenueDriverType)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground cursor-pointer"
              >
                {(Object.keys(DRIVER_TYPE_LABELS) as RevenueDriverType[]).map((dt) => (
                  <option key={dt} value={dt}>{DRIVER_TYPE_LABELS[dt]}</option>
                ))}
              </select>
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

      {row.enabled && (
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
                    type="number"
                    value={row.amounts[yi] ?? 0}
                    onChange={(e) => onAmountChange(yi, parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-border bg-card pl-6 pr-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    placeholder="0"
                    min={0}
                  />
                </div>
              </div>
            ))}
          </div>

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
  const category = row.category;

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
        <Clock className="h-3 w-3" /> Payment Timing
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {category === "tuition_and_fees" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Billing Months
              </label>
              <select
                value={row.billingMonths ?? 10}
                onChange={(e) => onTimingChange("billingMonths", parseInt(e.target.value))}
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
                onChange={(e) => onTimingChange("collectionMethod", e.target.value as CollectionMethod)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                {(Object.keys(COLLECTION_METHOD_LABELS) as CollectionMethod[]).map((cm) => (
                  <option key={cm} value={cm}>{COLLECTION_METHOD_LABELS[cm]}</option>
                ))}
              </select>
            </div>
            {(row.collectionMethod === "invoiced" || row.collectionMethod === "mixed") && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Collection Rate %
                  </label>
                  <input
                    type="number"
                    value={row.collectionRate ?? 95}
                    onChange={(e) => { const v = parseFloat(e.target.value); onTimingChange("collectionRate", isNaN(v) ? 0 : v); }}
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
                      value={row.collectionDelayDays ?? 0}
                      onChange={(e) => { const v = parseInt(e.target.value); onTimingChange("collectionDelayDays", isNaN(v) ? 0 : v); }}
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground w-full pr-12"
                      min={0}
                      max={90}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {category === "tuition_offsets" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Billing Months
            </label>
            <select
              value={row.billingMonths ?? 10}
              onChange={(e) => onTimingChange("billingMonths", parseInt(e.target.value))}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
            >
              <option value={9}>9 months</option>
              <option value={10}>10 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
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

        {category === "grants_contributions" && (
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
        <div className="flex items-end gap-1.5 h-40">
          {monthlyInflow.map((amount, i) => {
            const heightPct = maxInflow > 0 ? (amount / maxInflow) * 100 : 0;
            const isBelowAvg = amount < avgMonthly * 0.5;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative flex-1 flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all",
                      isBelowAvg ? "bg-amber-400/70" : "bg-primary/70"
                    )}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                    title={`$${Math.round(amount).toLocaleString()}`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium">{MONTH_LABELS[i]}</span>
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
