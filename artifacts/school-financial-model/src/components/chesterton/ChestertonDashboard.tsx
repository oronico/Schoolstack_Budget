import { useMemo } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeChestertonProjections } from "@/lib/chesterton/projections";
import type { ChestertonData } from "../../pages/model-wizard/schema";

interface Props {
  chesterton: ChestertonData | undefined;
  schoolName?: string;
}

interface RowSpec {
  key: "enrollment" | "netRevenue" | "operatingExpense" | "fundraisingGap";
  label: string;
  format: "number" | "currency";
  emphasis?: boolean;
}

const ROWS: RowSpec[] = [
  { key: "enrollment", label: "Total Enrollment", format: "number" },
  { key: "netRevenue", label: "Net Tuition + Fees", format: "currency" },
  { key: "operatingExpense", label: "Total Operating Expense", format: "currency", emphasis: true },
  { key: "fundraisingGap", label: "Fundraising Gap", format: "currency", emphasis: true },
];

export function ChestertonDashboard({ chesterton, schoolName }: Props) {
  const projections = useMemo(() => computeChestertonProjections(chesterton), [chesterton]);
  const tfg = projections.totalFundraisingGoal;

  return (
    <div
      data-testid="chesterton-dashboard"
      className="max-w-5xl mx-auto mb-10 rounded-2xl border border-border bg-white p-6 text-left shadow-sm"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg text-foreground">
            {schoolName ? `${schoolName} — ` : ""}Year-by-Year Snapshot
          </h3>
          <p className="text-sm text-muted-foreground">
            Mirrors what the CSN Operating Manual workbook calculates for Year 0 – Year 6. Catch
            shortfalls here before you export.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" data-testid="chesterton-dashboard-table">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-2 font-semibold sticky left-0 bg-muted">Metric</th>
              {projections.rows.map(r => (
                <th
                  key={r.yearIndex}
                  className="p-2 font-semibold text-center"
                  data-testid={`chesterton-dashboard-header-yr-${r.yearIndex}`}
                >
                  {r.yearLabel}
                  <span className="block text-xs font-normal text-muted-foreground">{r.schoolYearLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(spec => (
              <tr
                key={spec.key}
                className={`border-b border-border ${spec.emphasis ? "font-semibold" : ""}`}
                data-testid={`chesterton-dashboard-row-${spec.key}`}
              >
                <td className="p-2 sticky left-0 bg-white">{spec.label}</td>
                {projections.rows.map(r => {
                  const value = r[spec.key];
                  const overGoal =
                    spec.key === "fundraisingGap" && tfg > 0 && value > tfg;
                  const text =
                    spec.format === "currency" ? formatCurrency(value) : String(value);
                  return (
                    <td
                      key={r.yearIndex}
                      className={`p-2 text-center ${overGoal ? "bg-amber-50 text-amber-900" : ""}`}
                      data-testid={`chesterton-dashboard-cell-${spec.key}-yr-${r.yearIndex}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {overGoal && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-amber-600"
                            data-testid={`chesterton-dashboard-gap-warning-yr-${r.yearIndex}`}
                            aria-label="Fundraising gap exceeds Total Fundraising Goal"
                          />
                        )}
                        {text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tfg > 0 && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="chesterton-dashboard-tfg">
          Total Fundraising Goal: <strong className="text-foreground">{formatCurrency(tfg)}</strong>.
          Years where the gap exceeds this goal are highlighted.
        </p>
      )}
    </div>
  );
}
