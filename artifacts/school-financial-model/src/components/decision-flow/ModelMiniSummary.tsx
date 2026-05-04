import type { FullModelData } from "@/pages/model-wizard/schema";

interface ModelMiniSummaryProps {
  data: FullModelData;
}

function fmt(v: number): string {
  if (!isFinite(v)) return "-";
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000).toLocaleString()}k`;
  return `$${Math.round(v).toLocaleString()}`;
}

export function ModelMiniSummary({ data }: ModelMiniSummaryProps) {
  const sp = data.schoolProfile;
  const en = data.enrollment;
  const yr1 = en?.year1 ?? 0;
  const yr5 = en?.year5 ?? 0;
  const tuition = data.revenue?.tuitionPerStudent ?? 0;
  const sources = data.revenueSources;
  const sourceList: string[] = [];
  if (sources?.tuition) sourceList.push("Tuition");
  if (sources?.publicFunding) sourceList.push("Public funding");
  if (sources?.schoolChoice) sourceList.push("School choice");
  if (sources?.philanthropy) sourceList.push("Philanthropy");

  return (
    <dl className="space-y-2.5 text-xs">
      {sp?.schoolName && (
        <div>
          <dt className="text-muted-foreground">School</dt>
          <dd className="font-semibold text-foreground truncate">{sp.schoolName}</dd>
        </div>
      )}
      <div>
        <dt className="text-muted-foreground">Enrollment (Y1 → Y5)</dt>
        <dd className="font-semibold text-foreground font-mono">
          {yr1.toLocaleString()} → {yr5.toLocaleString()}
        </dd>
      </div>
      {tuition > 0 && (
        <div>
          <dt className="text-muted-foreground">Tuition / student</dt>
          <dd className="font-semibold text-foreground font-mono">{fmt(tuition)}</dd>
        </div>
      )}
      {sourceList.length > 0 && (
        <div>
          <dt className="text-muted-foreground">Revenue sources</dt>
          <dd className="font-medium text-foreground">{sourceList.join(", ")}</dd>
        </div>
      )}
      {sp?.maxCapacity != null && sp.maxCapacity > 0 && (
        <div>
          <dt className="text-muted-foreground">Max capacity</dt>
          <dd className="font-semibold text-foreground font-mono">{sp.maxCapacity.toLocaleString()}</dd>
        </div>
      )}
    </dl>
  );
}
