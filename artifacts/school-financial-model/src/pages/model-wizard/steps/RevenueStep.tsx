import { useState, useEffect, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type RevenueRowData,
  type RevenueCategory,
  type RevenueDriverType,
  type FundingProfile,
  CATEGORY_LABELS,
  DRIVER_TYPE_LABELS,
  generateDefaultRevenueRows,
  getCategoryOrder,
  getAvailableLineItems,
} from "@/lib/revenue-defaults";

function getYearCount(schoolStage: string | undefined): number {
  if (schoolStage === "operating_school") return 4;
  return 3;
}

function getYearLabel(index: number, schoolStage: string | undefined): string {
  if (schoolStage === "operating_school" && index === 0) return "Current";
  return `Y${index + 1}`;
}

export function RevenueStep() {
  const { watch, setValue, getValues } = useFormContext();
  const fundingProfile = (watch("schoolProfile.fundingProfile") || "tuition_based") as FundingProfile;
  const schoolStage = watch("schoolProfile.schoolStage") as string | undefined;
  const yearCount = getYearCount(schoolStage);

  const existingRows = watch("revenueRows") as RevenueRowData[] | undefined;
  const [rows, setRows] = useState<RevenueRowData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<RevenueCategory>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (existingRows && existingRows.length > 0) {
      const adjusted = existingRows.map((r) => ({
        ...r,
        amounts: r.amounts.length >= yearCount
          ? r.amounts.slice(0, yearCount)
          : [...r.amounts, ...new Array(yearCount - r.amounts.length).fill(0)],
      }));
      setRows(adjusted);
      const enabledCats = new Set<RevenueCategory>();
      adjusted.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
    } else {
      const defaults = generateDefaultRevenueRows(fundingProfile, yearCount);
      setRows(defaults);
      const enabledCats = new Set<RevenueCategory>();
      defaults.forEach((r) => { if (r.enabled) enabledCats.add(r.category); });
      setExpandedCategories(enabledCats);
    }
    setInitialized(true);
  }, [existingRows, fundingProfile, yearCount, initialized]);

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
    };
    const updated = [...rows, newRow];
    syncToForm(updated);
    setExpandedCategories((prev) => new Set(prev).add(category));
  };

  const categoryOrder = getCategoryOrder(fundingProfile);

  const getCategoryTotal = (cat: RevenueCategory): number => {
    return rows
      .filter((r) => r.category === cat && r.enabled)
      .reduce((sum, r) => sum + (r.amounts[0] ?? 0), 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Revenue Schedule</h2>
        <p className="text-muted-foreground text-lg">
          Which revenue sources apply to your school? Toggle on the lines that matter and enter your projections.
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
  onRemove: () => void;
}

function RevenueLineItem({
  row,
  yearCount,
  schoolStage,
  onToggle,
  onDriverChange,
  onAmountChange,
  onRemove,
}: RevenueLineItemProps) {
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
            <select
              value={row.driverType}
              onChange={(e) => onDriverChange(e.target.value as RevenueDriverType)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground cursor-pointer"
            >
              {(Object.keys(DRIVER_TYPE_LABELS) as RevenueDriverType[]).map((dt) => (
                <option key={dt} value={dt}>{DRIVER_TYPE_LABELS[dt]}</option>
              ))}
            </select>
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
      )}
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
