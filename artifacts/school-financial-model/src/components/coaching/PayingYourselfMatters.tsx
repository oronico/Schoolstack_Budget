import { useMemo } from "react";
import { HandCoins } from "lucide-react";
import { computeFounderCompNormalization } from "@workspace/finance";
import { formatCurrency, cn } from "@/lib/utils";
import { ConceptExplainer } from "./ConceptExplainer";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface PayingYourselfMattersProps {
  data: FullModelData;
  yearCount?: number;
  className?: string;
  /** When true, hides the heading and intro to fit a tighter dashboard tile. */
  compact?: boolean;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function PayingYourselfMatters({
  data,
  yearCount = 5,
  className,
  compact = false,
}: PayingYourselfMattersProps) {
  const norm = useMemo(
    () => computeFounderCompNormalization(data, yearCount),
    [data, yearCount],
  );

  const totalReported = sum(norm.reportedLoaded);
  const totalNormalized = sum(norm.normalizedLoaded);
  const totalDelta = norm.totalDelta;
  const hasAnyComp = totalReported > 0 || totalNormalized > 0;

  return (
    <section
      data-testid="paying-yourself-matters"
      className={cn(
        "rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-4 sm:p-5",
        className,
      )}
    >
      {!compact && (
        <div className="flex items-start gap-2.5 mb-3">
          <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <HandCoins className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-base font-bold text-amber-900">
              Paying yourself matters
            </h3>
            <p className="text-[13px] text-amber-900/85 leading-snug mt-1">
              Compare what you currently plan to draw against what the same role would cost at market rate. Both views are real — your current model shows how you're protecting cash today, and the market-rate view shows what the school needs to support a successor (or a fairer paycheck for you) over time.
            </p>
          </div>
        </div>
      )}

      {!hasAnyComp ? (
        <div
          data-testid="paying-yourself-empty"
          className="rounded-xl bg-white/70 border border-amber-200/60 px-4 py-3 text-[13px] text-amber-900/85 leading-relaxed"
        >
          Add a leadership salary on the Staffing step (and, if you're paying yourself a discount, a market-rate figure too) to see the side-by-side here.
        </div>
      ) : (
        <div
          data-testid="paying-yourself-grid"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <ComparisonCard
            label="Your current model"
            sublabel="What you actually plan to draw, fully loaded with benefits and payroll tax."
            total={totalReported}
            perYear={norm.reportedLoaded}
            yearCount={yearCount}
            tone="planned"
            testId="paying-yourself-reported"
          />
          <ComparisonCard
            label="Your model with founder compensation included"
            sublabel="What the same role would cost at market rate — what a successor would need."
            total={totalNormalized}
            perYear={norm.normalizedLoaded}
            yearCount={yearCount}
            tone="market"
            testId="paying-yourself-normalized"
          />
        </div>
      )}

      {hasAnyComp && norm.hasAdjustment && (
        <p
          data-testid="paying-yourself-delta"
          className="mt-3 text-[12.5px] text-amber-900/85 leading-snug"
        >
          <span className="font-semibold">
            Difference across {yearCount} year{yearCount === 1 ? "" : "s"}:{" "}
            {formatCurrency(Math.abs(totalDelta))}
          </span>{" "}
          {totalDelta > 0
            ? "you're effectively subsidizing the school by that amount over this horizon. That's a real choice — just one you should make on purpose, not by accident."
            : "your current draw is above the market-rate view for this horizon — make sure the model can sustain it as the school grows."}
        </p>
      )}

      <ConceptExplainer
        concept="paying_yourself"
        className="mt-3"
      />
    </section>
  );
}

interface ComparisonCardProps {
  label: string;
  sublabel: string;
  total: number;
  perYear: number[];
  yearCount: number;
  tone: "planned" | "market";
  testId: string;
}

function ComparisonCard({
  label,
  sublabel,
  total,
  perYear,
  yearCount,
  tone,
  testId,
}: ComparisonCardProps) {
  const toneClasses =
    tone === "planned"
      ? "border-amber-200/70 bg-white/80"
      : "border-amber-300/80 bg-amber-100/40";
  return (
    <div
      data-testid={testId}
      className={cn("rounded-xl border p-3 sm:p-4", toneClasses)}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/80">
        {label}
      </div>
      <div
        data-testid={`${testId}-total`}
        className="font-display text-xl font-bold text-amber-950 mt-1 tabular-nums"
      >
        {formatCurrency(Math.round(total))}
      </div>
      <p className="text-[11.5px] text-amber-900/75 leading-snug mt-1">
        {sublabel}
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {Array.from({ length: yearCount }).map((_, i) => (
          <div
            key={i}
            data-testid={`${testId}-y${i + 1}`}
            className="rounded bg-white/60 border border-amber-200/50 px-1.5 py-1 text-[10.5px] leading-tight"
          >
            <div className="text-[9px] uppercase tracking-wider text-amber-900/60">
              Y{i + 1}
            </div>
            <div className="tabular-nums font-semibold text-amber-950">
              {formatCurrency(Math.round(perYear[i] ?? 0))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
