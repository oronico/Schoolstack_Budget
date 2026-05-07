import { useState, useMemo, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import {
  ASSUMPTION_REGISTRY,
  HEADLINE_METRIC_LABELS,
  computeMetricDrivers,
  type HeadlineMetricKey,
} from "@workspace/finance";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface WhyThisNumberProps {
  metricKey: HeadlineMetricKey;
  data: FullModelData | undefined | null;
  /** Optional callback when the user clicks an assumption row. Receives the
   *  wizard step title from the registry; the host page decides how to
   *  navigate (router push, jumpToStep, etc.). */
  onJumpToStep?: (stepTitle: string) => void;
  /** Test id suffix so multiple instances on a page can be targeted
   *  independently (e.g. dashboard-kpi vs scenario card). */
  testIdSuffix?: string;
  triggerLabel?: string;
}

/** "Why this number?" popover. Renders a small help button next to a
 *  headline metric; clicking opens an inline panel listing the driving
 *  assumption keys (label + current value + source step) pulled from the
 *  shared finance registry. Used on the dashboard, scenario planner, and
 *  consultant view so every key output is traceable to its inputs without
 *  the founder hunting through the wizard. */
export function WhyThisNumber({
  metricKey,
  data,
  onJumpToStep,
  testIdSuffix,
  triggerLabel = "Why this number?",
}: WhyThisNumberProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const info = useMemo(() => {
    if (!data) return null;
    try {
      return computeMetricDrivers(data)[metricKey];
    } catch {
      return null;
    }
  }, [data, metricKey]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const tid = testIdSuffix ? `why-this-number-${testIdSuffix}` : "why-this-number";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        data-testid={`${tid}-trigger`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
        {triggerLabel}
      </button>
      {open && (
        <div
          role="dialog"
          data-testid={`${tid}-panel`}
          className="absolute z-50 right-0 mt-2 w-80 bg-white border border-border/60 rounded-xl shadow-lg p-4 text-left"
        >
          <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wide mb-1">
            Driving assumptions
          </p>
          <p className="text-sm font-bold text-foreground mb-3">
            {info ? info.label : HEADLINE_METRIC_LABELS[metricKey]}
          </p>
          {!info ? (
            <p className="text-xs text-muted-foreground italic">
              Add model data to see what is driving this number.
            </p>
          ) : (
            <ul className="space-y-2" data-testid={`${tid}-driver-list`}>
              {info.drivers.map((d) => {
                const meta = ASSUMPTION_REGISTRY[d.key];
                const Tag = onJumpToStep ? "button" : "div";
                const props = onJumpToStep
                  ? {
                      type: "button" as const,
                      onClick: () => {
                        setOpen(false);
                        onJumpToStep(meta.stepTitle);
                      },
                      className:
                        "w-full text-left rounded-md p-2 -mx-2 hover:bg-secondary/40 transition-colors cursor-pointer",
                    }
                  : { className: "p-2 -mx-2" };
                return (
                  <li key={d.key} data-testid={`${tid}-driver-${d.key}`}>
                    <Tag {...props}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-semibold text-foreground">
                          {meta.label}
                        </span>
                        <span
                          className={`text-xs font-mono ${
                            d.missing ? "text-muted-foreground italic" : "text-foreground"
                          }`}
                        >
                          {d.value}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        From <span className="font-medium">{meta.stepTitle}</span> step
                        {onJumpToStep ? " — click to open" : ""}
                      </p>
                    </Tag>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
