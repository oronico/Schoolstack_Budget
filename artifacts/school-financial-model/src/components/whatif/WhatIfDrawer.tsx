import { useEffect, useMemo, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDebounce } from "use-debounce";
import {
  X,
  Users,
  Building2,
  RotateCcw,
  Save,
  Wand2,
  TrendingUp,
  TrendingDown,
  Link as LinkIcon,
  AlertCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  applyWhatIfOverrides,
  computeWhatIfImpact,
  encodeOverridesToHash,
  decodeOverridesFromHash,
  isEmptyOverrides,
  type WhatIfOverrides,
} from "@/lib/whatif-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { cn } from "@/lib/utils";

interface WhatIfDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FullModelData;
  modelId: number | null;
  onApplyToModel?: (adjustedData: FullModelData) => Promise<void>;
  onSaveAsScenario?: (overrides: WhatIfOverrides, name: string) => Promise<void>;
}

function fmtMoney(val: number): string {
  if (!isFinite(val)) return "—";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtMoneyDelta(val: number): string {
  if (!isFinite(val)) return "—";
  if (val === 0) return "$0";
  const sign = val > 0 ? "+" : "-";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function Sparkline({ values, baseValues, color }: { values: number[]; baseValues: number[]; color: string }) {
  const all = [...values, ...baseValues];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const width = 220;
  const height = 56;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const project = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={project(baseValues)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d={project(values)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {values.map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * height;
        return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
      })}
    </svg>
  );
}

const YEARS = ["Y1", "Y2", "Y3", "Y4", "Y5"] as const;

const EMPTY: WhatIfOverrides = {};

function readOverridesFromHash(): WhatIfOverrides {
  if (typeof window === "undefined") return EMPTY;
  return decodeOverridesFromHash(window.location.hash);
}

function writeOverridesToHash(overrides: WhatIfOverrides) {
  if (typeof window === "undefined") return;
  const encoded = encodeOverridesToHash(overrides);
  const url = new URL(window.location.href);
  // Preserve other hash params, swap out 'whatif=' segment
  const existingHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const segments = existingHash.split("&").filter((s) => s && !s.startsWith("whatif="));
  if (encoded) segments.push(encoded);
  const newHash = segments.length ? `#${segments.join("&")}` : "";
  if (newHash === url.hash) return;
  if (newHash) {
    history.replaceState(null, "", `${url.pathname}${url.search}${newHash}`);
  } else {
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
}

export function WhatIfDrawer({
  open,
  onOpenChange,
  data,
  modelId,
  onApplyToModel,
  onSaveAsScenario,
}: WhatIfDrawerProps) {
  const [overrides, setOverrides] = useState<WhatIfOverrides>(EMPTY);
  const [debouncedOverrides] = useDebounce(overrides, 80);
  const [hydrated, setHydrated] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const { toast } = useToast();

  // Hydrate from URL hash once on mount
  useEffect(() => {
    if (hydrated) return;
    const fromHash = readOverridesFromHash();
    if (!isEmptyOverrides(fromHash)) {
      setOverrides(fromHash);
    }
    setHydrated(true);
  }, [hydrated]);

  // Push to URL hash whenever overrides change (debounced)
  useEffect(() => {
    if (!hydrated) return;
    writeOverridesToHash(debouncedOverrides);
  }, [debouncedOverrides, hydrated]);

  const impact = useMemo(() => {
    return computeWhatIfImpact(data, debouncedOverrides);
  }, [data, debouncedOverrides]);

  const detectedRent = impact.detectedBaseMonthlyRent;
  const hasRentRow = impact.detectedRentRowId !== null;
  const isDirty = !isEmptyOverrides(overrides);

  // Defaults from data
  const baseEnrollment = useMemo(() => {
    const en = (data.enrollment || {}) as Record<string, number>;
    return [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0];
  }, [data]);

  const baseRetention = (data.enrollment as Record<string, unknown> | undefined)?.retentionRate as
    | number
    | undefined;

  const enrollmentDeltaArr = (overrides.enrollmentDelta || [0, 0, 0, 0, 0]) as [
    number,
    number,
    number,
    number,
    number,
  ];

  const setEnrollmentDelta = (i: number, v: number) => {
    const next = [...enrollmentDeltaArr] as [number, number, number, number, number];
    next[i] = v;
    setOverrides((o) => ({ ...o, enrollmentDelta: next }));
  };

  const reset = useCallback(() => {
    setOverrides(EMPTY);
  }, []);

  const copyShareLink = useCallback(async () => {
    const encoded = encodeOverridesToHash(overrides);
    const url = new URL(window.location.href);
    const existingHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const segments = existingHash.split("&").filter((s) => s && !s.startsWith("whatif="));
    if (encoded) segments.push(encoded);
    const newHash = segments.length ? `#${segments.join("&")}` : "";
    const fullUrl = `${window.location.origin}${url.pathname}${url.search}${newHash}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: "Link copied", description: "Share this link to show your what-if scenario." });
    } catch {
      toast({ title: "Couldn't copy link", description: fullUrl, variant: "destructive" });
    }
  }, [overrides, toast]);

  const handleApply = useCallback(async () => {
    if (!onApplyToModel) return;
    setIsApplying(true);
    try {
      const adjustedData = applyWhatIfOverrides(data, overrides);
      await onApplyToModel(adjustedData);
      // Note: success toast is intentionally fired by the parent (wizard) so that
      // its undo affordance isn't displaced by a competing toast (TOAST_LIMIT=1).
      reset();
      setShowApplyConfirm(false);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Apply failed",
        description: (err as Error).message || "Could not write changes to the model.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  }, [onApplyToModel, data, overrides, toast, onOpenChange, reset]);

  const handleSaveScenario = useCallback(async () => {
    if (!onSaveAsScenario) return;
    if (!scenarioName.trim()) return;
    try {
      await onSaveAsScenario(overrides, scenarioName.trim());
      toast({
        title: "Scenario saved",
        description: `Saved as "${scenarioName.trim()}".`,
      });
      setShowSaveDialog(false);
      setScenarioName("");
    } catch (err) {
      toast({
        title: "Save failed",
        description: (err as Error).message || "Could not save scenario.",
        variant: "destructive",
      });
    }
  }, [onSaveAsScenario, scenarioName, overrides, toast]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90] bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="whatif-drawer"
          className={cn(
            "fixed z-[91] bg-background shadow-2xl border-l border-border/60 flex flex-col",
            "inset-y-0 right-0 w-full sm:w-[480px] max-w-full",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
            "duration-200"
          )}
        >
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Wand2 className="h-4 w-4" />
                </div>
                <div>
                  <Dialog.Title className="font-display font-bold text-base text-foreground">
                    Live What-If Planner
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground">Lease & enrollment overrides</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={copyShareLink}
                      data-testid="whatif-copy-link"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy shareable link</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={reset}
                      disabled={!isDirty}
                      data-testid="whatif-reset"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Reset overrides</TooltipContent>
                </Tooltip>
                <Dialog.Close asChild>
                  <button
                    aria-label="Close"
                    data-testid="whatif-close"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Enrollment block */}
              <section className="px-5 py-5 border-b border-border/60">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-emerald-700" />
                  <h3 className="font-display font-semibold text-sm text-foreground">Enrollment</h3>
                </div>

                <div className="space-y-3 mb-4">
                  <p className="text-xs text-muted-foreground">Adjust students per year</p>
                  <div className="grid grid-cols-5 gap-2" data-testid="whatif-enrollment-grid">
                    {YEARS.map((year, i) => {
                      const baseVal = baseEnrollment[i];
                      const delta = enrollmentDeltaArr[i];
                      const newVal = Math.max(0, baseVal + delta);
                      return (
                        <div key={year} className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {year}
                          </span>
                          <input
                            type="number"
                            value={newVal}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (Number.isNaN(v)) return;
                              setEnrollmentDelta(i, v - baseVal);
                            }}
                            data-testid={`whatif-enrollment-${year}`}
                            className="w-full px-1 py-1 text-center text-sm font-mono border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span
                            className={cn(
                              "text-[10px] font-mono",
                              delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-muted-foreground"
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta || 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Retention rate</label>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {overrides.retentionRate ?? baseRetention ?? 85}%
                    </span>
                  </div>
                  <Slider
                    value={[overrides.retentionRate ?? baseRetention ?? 85]}
                    min={60}
                    max={100}
                    step={1}
                    onValueChange={([v]) => setOverrides((o) => ({ ...o, retentionRate: v }))}
                    data-testid="whatif-retention-slider"
                  />
                  {overrides.retentionRate !== undefined &&
                    baseRetention !== undefined &&
                    overrides.retentionRate !== baseRetention && (
                      <p className="text-[10px] text-amber-700">
                        Was {baseRetention}% in your model
                      </p>
                    )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Tuition delta (per student)
                    </label>
                    <span
                      className={cn(
                        "text-sm font-mono font-semibold",
                        (overrides.tuitionDeltaPerStudent ?? 0) > 0
                          ? "text-emerald-700"
                          : (overrides.tuitionDeltaPerStudent ?? 0) < 0
                          ? "text-red-600"
                          : "text-foreground"
                      )}
                    >
                      {(overrides.tuitionDeltaPerStudent ?? 0) > 0 ? "+" : ""}
                      {fmtMoney(overrides.tuitionDeltaPerStudent ?? 0)}
                    </span>
                  </div>
                  <Slider
                    value={[overrides.tuitionDeltaPerStudent ?? 0]}
                    min={-2000}
                    max={5000}
                    step={50}
                    onValueChange={([v]) => setOverrides((o) => ({ ...o, tuitionDeltaPerStudent: v }))}
                    data-testid="whatif-tuition-slider"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Applies to all per-student tuition rows (including new vs. returning), every year
                  </p>
                </div>
              </section>

              {/* Lease block */}
              <section className="px-5 py-5 border-b border-border/60">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-4 w-4 text-teal-700" />
                  <h3 className="font-display font-semibold text-sm text-foreground">Lease</h3>
                </div>

                {detectedRent === null ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                      <p className="font-medium">No facility expense detected</p>
                      <p className="mt-1">
                        Add a monthly occupancy expense in the Expenses step, or set a monthly rent
                        below to model one.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mb-3">
                    Detected base rent: <span className="font-mono font-semibold">{fmtMoney(detectedRent)}</span>
                    /mo
                    {!hasRentRow && (
                      <span className="ml-1 text-amber-700">(from profile)</span>
                    )}
                  </p>
                )}

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Monthly rent</label>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {fmtMoney(overrides.monthlyRent ?? detectedRent ?? 0)}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={overrides.monthlyRent ?? detectedRent ?? 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isNaN(v)) return;
                      setOverrides((o) => ({ ...o, monthlyRent: Math.max(0, v) }));
                    }}
                    data-testid="whatif-monthly-rent"
                    className="w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Annual escalation</label>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {(overrides.rentEscalation ?? 3).toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    value={[overrides.rentEscalation ?? 3]}
                    min={0}
                    max={15}
                    step={0.5}
                    onValueChange={([v]) => setOverrides((o) => ({ ...o, rentEscalation: v }))}
                    data-testid="whatif-rent-escalation"
                  />
                </div>

                <div className="space-y-2 mb-4">
                  <label className="text-xs font-medium text-muted-foreground">Change starts in</label>
                  <div className="grid grid-cols-5 gap-1.5" data-testid="whatif-start-year">
                    {YEARS.map((year, i) => {
                      const yr = i + 1;
                      const active = (overrides.rentChangeStartYear ?? 1) === yr;
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => setOverrides((o) => ({ ...o, rentChangeStartYear: yr }))}
                          className={cn(
                            "py-1.5 text-xs font-semibold rounded-md border transition-colors",
                            active
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-background text-muted-foreground border-border hover:border-teal-400"
                          )}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Square footage delta</label>
                    <span
                      className={cn(
                        "text-sm font-mono font-semibold",
                        (overrides.sqftDelta ?? 0) > 0
                          ? "text-amber-700"
                          : (overrides.sqftDelta ?? 0) < 0
                          ? "text-emerald-700"
                          : "text-foreground"
                      )}
                    >
                      {(overrides.sqftDelta ?? 0) > 0 ? "+" : ""}
                      {(overrides.sqftDelta ?? 0).toLocaleString()} sqft
                    </span>
                  </div>
                  <Slider
                    value={[overrides.sqftDelta ?? 0]}
                    min={-3000}
                    max={5000}
                    step={50}
                    onValueChange={([v]) => setOverrides((o) => ({ ...o, sqftDelta: v }))}
                    data-testid="whatif-sqft-slider"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Scales facility expenses proportionally (requires sqft set in profile)
                  </p>
                </div>
              </section>

              {/* Impact panel */}
              <section className="px-5 py-5 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-amber-700" />
                  <h3 className="font-display font-semibold text-sm text-foreground">Impact</h3>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {isDirty ? "Live" : "No overrides"}
                  </span>
                </div>

                {/* Per-year metrics table — Net Income $/% delta and DSCR before/after */}
                <div className="bg-card border border-border/60 rounded-lg overflow-hidden mb-3" data-testid="whatif-impact-grid">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Metric</th>
                        {[1, 2, 3, 4, 5].map((y) => (
                          <th key={y} className="px-1.5 py-1.5 font-medium text-right">Y{y}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr className="border-t border-border/60">
                        <td className="px-2 py-1.5 font-sans text-muted-foreground">Net income Δ</td>
                        {impact.deltas.netIncome.map((d, i) => (
                          <td key={i} className="px-1.5 py-1.5 text-right" data-testid={`whatif-ni-delta-Y${i + 1}`}>
                            <span className={cn(d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground")}>
                              {fmtMoneyDelta(d)}
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-border/60 bg-slate-50/40">
                        <td className="px-2 py-1.5 font-sans text-muted-foreground">Net income Δ%</td>
                        {impact.deltas.netIncomePct.map((p, i) => (
                          <td key={i} className="px-1.5 py-1.5 text-right">
                            <span className={cn(p > 0 ? "text-emerald-700" : p < 0 ? "text-rose-700" : "text-muted-foreground")}>
                              {p === 0 ? "0%" : `${p > 0 ? "+" : ""}${(p * 100).toFixed(0)}%`}
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="px-2 py-1.5 font-sans text-muted-foreground">DSCR before</td>
                        {impact.base.dscr.map((v, i) => (
                          <td key={i} className="px-1.5 py-1.5 text-right text-muted-foreground">
                            {isFinite(v) ? v.toFixed(2) : "—"}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-border/60 bg-slate-50/40">
                        <td className="px-2 py-1.5 font-sans text-muted-foreground">DSCR after</td>
                        {impact.adjusted.dscr.map((v, i) => {
                          const baseV = impact.base.dscr[i];
                          const better = isFinite(v) && isFinite(baseV) && v > baseV;
                          const worse = isFinite(v) && isFinite(baseV) && v < baseV;
                          return (
                            <td key={i} className="px-1.5 py-1.5 text-right" data-testid={`whatif-dscr-after-Y${i + 1}`}>
                              <span className={cn(better && "text-emerald-700", worse && "text-rose-700")}>
                                {isFinite(v) ? v.toFixed(2) : "—"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="px-2 py-1.5 font-sans text-muted-foreground">Revenue Δ</td>
                        {impact.deltas.revenue.map((d, i) => (
                          <td key={i} className="px-1.5 py-1.5 text-right" data-testid={`whatif-rev-delta-Y${i + 1}`}>
                            <span className={cn(d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground")}>
                              {fmtMoneyDelta(d)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Revenue overlay sparkline */}
                <div className="bg-card border border-border/60 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Revenue trajectory</span>
                    <span className="text-[10px] text-muted-foreground">5-year</span>
                  </div>
                  <Sparkline
                    values={impact.adjusted.revenue}
                    baseValues={impact.base.revenue}
                    color="#0D9488"
                  />
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-px border-t-2 border-dashed border-slate-400" /> Base
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-0.5 bg-teal-600" /> Adjusted
                    </span>
                  </div>
                </div>

                {/* Net income overlay sparkline */}
                <div className="bg-card border border-border/60 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Net income trajectory</span>
                    <span className="text-[10px] text-muted-foreground">5-year</span>
                  </div>
                  <Sparkline
                    values={impact.adjusted.netIncome}
                    baseValues={impact.base.netIncome}
                    color="#D97706"
                  />
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-px border-t-2 border-dashed border-slate-400" /> Base
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-0.5 bg-amber-600" /> Adjusted
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-card border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Break-even shift</p>
                    <p className="font-mono font-semibold mt-0.5">
                      {impact.deltas.breakEvenYearShift === null
                        ? "—"
                        : impact.deltas.breakEvenYearShift === 0
                        ? "Same year"
                        : impact.deltas.breakEvenYearShift > 0
                        ? `+${impact.deltas.breakEvenYearShift} yr later`
                        : `${impact.deltas.breakEvenYearShift} yr earlier`}
                    </p>
                  </div>
                  <div className="bg-card border border-border/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Cash runway Δ</p>
                    <p className="font-mono font-semibold mt-0.5">
                      {impact.deltas.cashRunwayDeltaMonths === 0
                        ? "0 mo"
                        : impact.deltas.cashRunwayDeltaMonths > 0
                        ? `+${impact.deltas.cashRunwayDeltaMonths.toFixed(1)} mo`
                        : `${impact.deltas.cashRunwayDeltaMonths.toFixed(1)} mo`}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-border/60 bg-card flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSaveDialog(true)}
                disabled={!isDirty || !modelId || !onSaveAsScenario}
                data-testid="whatif-save-scenario"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="h-3.5 w-3.5" />
                Save as scenario
              </button>
              <button
                type="button"
                onClick={() => setShowApplyConfirm(true)}
                disabled={!isDirty || !modelId || !onApplyToModel}
                data-testid="whatif-apply-model"
                className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply to model
              </button>
            </div>
          </TooltipProvider>

          {/* Apply confirmation dialog */}
          {showApplyConfirm && (
            <div
              className="absolute inset-0 z-10 bg-slate-900/40 flex items-center justify-center p-5 animate-in fade-in-0"
              data-testid="whatif-apply-confirm"
            >
              <div className="bg-background border border-border rounded-xl p-5 shadow-xl max-w-sm w-full">
                <h4 className="font-display font-bold text-base text-foreground mb-2">
                  Apply changes to model?
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  This will overwrite your current enrollment and lease assumptions. You can undo by
                  reverting in the wizard.
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setShowApplyConfirm(false)}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={isApplying}
                    data-testid="whatif-apply-confirm-yes"
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {isApplying ? "Applying…" : "Apply changes"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSaveDialog && (
            <div
              className="absolute inset-0 z-10 bg-slate-900/40 flex items-center justify-center p-5 animate-in fade-in-0"
              data-testid="whatif-save-dialog"
            >
              <div className="bg-background border border-border rounded-xl p-5 shadow-xl max-w-sm w-full">
                <h4 className="font-display font-bold text-base text-foreground mb-2">
                  Save as scenario
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Give this what-if a name. It will appear on the Scenarios page.
                </p>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="e.g. Slower lease ramp"
                  data-testid="whatif-scenario-name"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveScenario}
                    disabled={!scenarioName.trim()}
                    data-testid="whatif-save-confirm-yes"
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

