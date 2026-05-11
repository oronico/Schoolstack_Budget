import { TrendingUp } from "lucide-react";

export interface CashRunwayView {
  runwayMonths: number;
  runwayLabel: string;
  status: "good" | "warning" | "danger";
  yearByYearCash: {
    year: number;
    cumulative: string;
    reserveMonths: string;
    endingCash: string;
    isTrough: boolean;
  }[];
  troughCallout: { year: number; endingCash: string; isNegative: boolean } | null;
  // Task #646 — mirrors `buildCashRunway().accrualToggle` so the lender +
  // board HTML previews can show the same unrestricted-cash headline + "vs
  // accrual" context line that the founder dashboard hero card and packet
  // PDFs render. Optional for back-compat with older payloads / fixtures.
  accrualToggle?: {
    unrestrictedCashLabel: string;
    accrualCashLabel: string;
    deltaLabel: string;
  };
}

/**
 * Shared cash runway card rendered identically inside the lender and board
 * packet previews. Task #389 — both packets used to maintain copy-pasted
 * versions of this card; centralizing it ensures designers only have one
 * place to tweak the layout.
 *
 * The `variant` prop only affects the data-testid prefix so the existing
 * lender/board e2e selectors continue to work.
 */
export function CashRunwayCard({
  cash,
  variant,
}: {
  cash: CashRunwayView;
  variant: "lender" | "board";
}) {
  const prefix = variant === "lender" ? "lender-packet" : "board-packet";

  const bg =
    cash.status === "good"
      ? "bg-green-50 border-green-200"
      : cash.status === "warning"
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${bg}`} data-testid={`${prefix}-cash-runway`}>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4" />
        <span className="font-bold text-sm text-[#1E293B]">Cash & Runway</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{cash.runwayLabel}</p>
      {cash.accrualToggle && (
        <div
          className="mb-3 rounded-md bg-white/70 border border-white/80 p-2"
          data-testid={`${prefix}-cash-accrual-toggle`}
        >
          <p
            className="text-xs font-bold text-[#1E293B]"
            data-testid={`${prefix}-unrestricted-cash-headline`}
          >
            Year-end unrestricted cash: {cash.accrualToggle.unrestrictedCashLabel}
          </p>
          <p
            className="text-[11px] text-muted-foreground mt-0.5"
            data-testid={`${prefix}-accrual-cash-context`}
          >
            vs accrual: {cash.accrualToggle.accrualCashLabel} ({cash.accrualToggle.deltaLabel}). Unrestricted is what funds operations + debt service.
          </p>
        </div>
      )}
      {cash.yearByYearCash.length > 0 && (
        <>
          <div className="grid grid-cols-5 gap-2" data-testid={`${prefix}-ending-cash-row`}>
            {cash.yearByYearCash.map((c) => {
              const isNegative = c.endingCash.startsWith("-") || c.endingCash.startsWith("(");
              const tileBg = c.isTrough
                ? "bg-red-100 border-red-300 ring-1 ring-red-300"
                : "bg-white/60 border-transparent";
              return (
                <div
                  key={c.year}
                  className={`text-center rounded-lg p-2 border ${tileBg}`}
                  data-testid={`${prefix}-ending-cash-y${c.year}`}
                  data-trough={c.isTrough ? "true" : "false"}
                >
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Year {c.year}
                    {c.isTrough && (
                      <span className="ml-1 text-[9px] font-bold text-red-700 uppercase">Trough</span>
                    )}
                  </p>
                  <p className={`text-xs font-bold ${isNegative ? "text-red-700" : "text-[#1E293B]"}`}>
                    {c.endingCash}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{c.reserveMonths}</p>
                </div>
              );
            })}
          </div>
          {cash.troughCallout && (
            <p
              className={`mt-3 text-xs font-medium ${cash.troughCallout.isNegative ? "text-red-700" : "text-[#1E293B]"}`}
              data-testid={`${prefix}-trough-callout`}
            >
              {cash.troughCallout.isNegative
                ? `Tightest cash year: Year ${cash.troughCallout.year} dips to ${cash.troughCallout.endingCash} - additional funding or cost cuts needed before then.`
                : `Tightest cash year: Year ${cash.troughCallout.year} ends at ${cash.troughCallout.endingCash}.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
