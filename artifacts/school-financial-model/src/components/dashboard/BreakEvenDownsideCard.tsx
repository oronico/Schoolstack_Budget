import { useMemo } from "react";
import { useGetModel } from "@workspace/api-client-react";
import { computeBaseFinancials, computeDownsideBand } from "@workspace/finance";
import { Target, TrendingDown, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface Props {
  modelId: number;
  modelName: string;
}

function fmtBe(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString();
}

function fmtUtil(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtDscr(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "—";
  return `${n.toFixed(2)}x`;
}

export function BreakEvenDownsideCard({ modelId, modelName }: Props) {
  const { data: model, isLoading } = useGetModel(modelId, {
    query: { queryKey: [`/api/models/${modelId}`, "break-even"] },
  });

  const computed = useMemo(() => {
    if (!model?.data) return null;
    try {
      const data = model.data as unknown as FullModelData;
      const metrics = computeBaseFinancials(data);
      const downside = computeDownsideBand(data);
      return { metrics, downside };
    } catch {
      return null;
    }
  }, [model]);

  return (
    <div
      data-testid="dashboard-break-even-downside"
      className="bg-white border border-border/60 rounded-2xl p-5 sm:p-6 shadow-sm mb-8"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-600" />
            Break-even & downside
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            From{" "}
            <span className="font-medium text-foreground">{modelName}</span>{" "}
            — students needed to cover costs and what happens if enrollment
            slips.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Computing break-even...
        </div>
      ) : !computed ? (
        <p className="text-sm text-muted-foreground italic">
          Add revenue and expenses to see break-even.
        </p>
      ) : (
        <>
          {(() => {
            const be = computed.metrics.breakEvenStudents[0];
            const planned = computed.metrics.enrollment[0] || 0;
            let status: "above" | "at" | "below" | "unknown" = "unknown";
            let statusLabel = "";
            let statusClass = "";
            let statusCopy = "";
            if (be !== null && planned > 0) {
              const cushion = planned - be;
              const pctCushion = cushion / be;
              if (cushion < 0) {
                status = "below";
                statusLabel = "Below break-even";
                statusClass = "bg-red-50 text-red-800 border-red-200";
                statusCopy = `Planned enrollment is ${Math.abs(cushion)} students short of the ${be} needed to cover costs in Year 1.`;
              } else if (pctCushion < 0.05) {
                status = "at";
                statusLabel = "At break-even";
                statusClass = "bg-amber-50 text-amber-800 border-amber-200";
                statusCopy = `Planned enrollment is right at the break-even line — only ${cushion} students of cushion above the ${be} needed.`;
              } else {
                status = "above";
                statusLabel = "Above break-even";
                statusClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
                statusCopy = `Planned enrollment is ${cushion} students (${(pctCushion * 100).toFixed(0)}%) above the ${be} needed to cover Year 1 costs.`;
              }
            }
            return status !== "unknown" ? (
              <div
                data-testid={`break-even-status-${status}`}
                className={`mb-4 border rounded-lg px-3 py-2 text-sm ${statusClass}`}
              >
                <span className="font-semibold">{statusLabel}.</span>{" "}
                {statusCopy}
              </div>
            ) : null;
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div
              data-testid="break-even-students-y1"
              className="bg-card border border-border/60 rounded-xl p-4"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Year 1 break-even students
              </p>
              <p className="font-display font-bold text-2xl text-foreground mt-1">
                {fmtBe(computed.metrics.breakEvenStudents[0])}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Planned: {computed.metrics.enrollment[0] || 0} students
              </p>
            </div>
            <div
              data-testid="break-even-utilization-y1"
              className="bg-card border border-border/60 rounded-xl p-4"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Year 1 utilization to break even
              </p>
              <p className="font-display font-bold text-2xl text-foreground mt-1">
                {fmtUtil(computed.metrics.breakEvenUtilization[0])}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {computed.metrics.breakEvenUtilization[0] === null
                  ? "Set max capacity to see utilization"
                  : "of stated max capacity"}
              </p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Downside enrollment band — Year 1
            </h3>
            <div className="overflow-x-auto">
              <table
                data-testid="downside-band-table"
                className="w-full text-sm"
              >
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1.5 font-medium">Scenario</th>
                    <th className="text-right py-1.5 font-medium">Students</th>
                    <th className="text-right py-1.5 font-medium">DSCR</th>
                    <th className="text-right py-1.5 font-medium">Ending cash</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "If 10% fewer", d: computed.downside.minus10 },
                    { label: "If 20% fewer", d: computed.downside.minus20 },
                  ].map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-border/30 last:border-b-0"
                    >
                      <td className="py-2 text-foreground">{row.label}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {row.d.enrollment[0] || 0}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {fmtDscr(row.d.dscr[0])}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(row.d.endingCash[0])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
