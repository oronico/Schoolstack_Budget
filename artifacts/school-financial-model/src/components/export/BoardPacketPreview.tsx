import { useState, useEffect } from "react";
import { X, Download, Loader2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Lightbulb, BarChart3 } from "lucide-react";
import { trackExport } from "@/hooks/useExportTracker";
import { InsightCallout } from "@/components/coaching/InsightCallout";
import { buildForecastFilterQuery } from "@/lib/forecast-accuracy-query";
import { CashRunwayCard, type CashRunwayView } from "./CashRunwayCard";

interface LinkedMetric {
  label: string;
  value: string;
  status?: "good" | "warning" | "danger";
}

interface PacketTableRow {
  label: string;
  values: string[];
  isBold?: boolean;
}

interface PacketTable {
  title: string;
  headers: string[];
  rows: PacketTableRow[];
}

interface PacketInsight {
  label: string;
  body: string;
  tone?: "info" | "success" | "warning";
}

interface PacketSection {
  id: string;
  title: string;
  order: number;
  included: boolean;
  narrative: string;
  linkedMetrics: LinkedMetric[];
  tables?: PacketTable[];
  insights?: PacketInsight[];
}

interface BoardRiskItem {
  risk: string;
  severity: "critical" | "high" | "medium";
  plainLanguage: string;
  suggestedAction: string;
}

interface BoardFocusArea {
  title: string;
  priority: "high" | "medium" | "low";
  description: string;
  impact: string;
}

interface ScenarioSnapshot {
  name: string;
  y5Revenue: string;
  y5NetIncome: string;
  y5Margin: string;
  signal: "green" | "amber" | "red";
}

interface NarrativeSummary {
  headline: string;
  summary: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendedFocus: string;
}

interface BoardPacket {
  schoolName: string;
  generatedAt: string;
  narrative: NarrativeSummary;
  sections: PacketSection[];
  topRisks: BoardRiskItem[];
  focusAreas: BoardFocusArea[];
  scenarioSnapshots: ScenarioSnapshot[];
  cashRunway: CashRunwayView;
  financialOutlook: {
    headline: string;
    status: "healthy" | "watch" | "needs_attention";
    summary: string;
  };
}

export function BoardPacketPreview({
  modelId,
  onClose,
}: {
  modelId: number;
  onClose: () => void;
}) {
  const [packet, setPacket] = useState<BoardPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["executive_summary", "five_year_projection"]),
  );

  useEffect(() => {
    const fetchPacket = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch(
          `/api/models/${modelId}/export/board-packet${buildForecastFilterQuery()}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!res.ok) throw new Error("Failed to load packet");
        const data = await res.json();
        setPacket(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load packet");
      } finally {
        setLoading(false);
      }
    };
    fetchPacket();
  }, [modelId]);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/models/${modelId}/export/board-packet-pdf${buildForecastFilterQuery()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] || `Board_Summary_${modelId}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      trackExport();
    } catch {
      alert("Failed to download PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-12 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Preparing board summary...</p>
        </div>
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-600 mb-4">{error || "Failed to load packet"}</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary text-white rounded-lg">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <Header packet={packet} onClose={onClose} onDownload={handleDownloadPdf} downloading={downloadingPdf} />
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <OutlookBanner outlook={packet.financialOutlook} narrative={packet.narrative} />
          <CashRunwayCard cash={packet.cashRunway} variant="board" />
          <RiskCards risks={packet.topRisks} />
          {packet.focusAreas.length > 0 && <FocusAreaCards areas={packet.focusAreas} />}
          {packet.scenarioSnapshots.length > 0 && <ScenarioCards scenarios={packet.scenarioSnapshots} />}
          <div className="space-y-2 mt-6">
            {packet.sections
              .filter((s) => s.included && s.id !== "cover" && s.id !== "key_risks" && s.id !== "board_action_items" && s.id !== "cash_flow")
              .map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  expanded={expandedSections.has(section.id)}
                  onToggle={() => toggleSection(section.id)}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({
  packet,
  onClose,
  onDownload,
  downloading,
}: {
  packet: BoardPacket;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-[#328555] to-[#0D9488] rounded-t-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">{packet.schoolName}</h2>
          <p className="text-white/60 text-sm">Board Financial Summary</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? "Generating..." : "Download PDF"}
        </button>
        <button onClick={onClose} className="p-2 text-white/60 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function OutlookBanner({
  outlook,
  narrative,
}: {
  outlook: BoardPacket["financialOutlook"];
  narrative: NarrativeSummary;
}) {
  const bg =
    outlook.status === "healthy"
      ? "bg-green-50 border-green-200"
      : outlook.status === "watch"
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  const icon =
    outlook.status === "healthy" ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : outlook.status === "watch" ? (
      <AlertTriangle className="h-5 w-5 text-amber-600" />
    ) : (
      <AlertTriangle className="h-5 w-5 text-red-600" />
    );

  return (
    <div className="mt-6 space-y-4">
      <div className={`rounded-xl border p-4 ${bg}`}>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="font-bold text-sm">{outlook.headline}</span>
        </div>
        <p className="text-sm text-muted-foreground">{outlook.summary}</p>
      </div>

      <div className="bg-[#FAF9F7] rounded-xl p-4">
        <p className="font-semibold text-[#1E293B] mb-2">{narrative.headline}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{narrative.summary}</p>
        {narrative.recommendedFocus && (
          <p className="text-sm text-[#0D9488] mt-3 font-medium">{narrative.recommendedFocus}</p>
        )}
      </div>
    </div>
  );
}

function RiskCards({ risks }: { risks: BoardRiskItem[] }) {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="font-bold text-sm text-[#1E293B] flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        What to Watch
      </h3>
      {risks.length === 0 && (
        <div className="rounded-lg border p-3 bg-green-50 border-green-200">
          <p className="text-xs text-green-700">No significant financial risks have been identified at this time. Continue monitoring key metrics as the model develops.</p>
        </div>
      )}
      {risks.map((risk, i) => {
        const borderColor =
          risk.severity === "critical"
            ? "border-l-red-500"
            : risk.severity === "high"
              ? "border-l-amber-500"
              : "border-l-gray-400";

        return (
          <div key={i} className={`rounded-lg border border-l-4 p-3 bg-white ${borderColor}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-[#1E293B]">{risk.risk}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{risk.plainLanguage}</p>
            <div className="flex items-start gap-1">
              <Lightbulb className="h-3 w-3 text-[#0D9488] mt-0.5 shrink-0" />
              <p className="text-xs text-[#0D9488]">{risk.suggestedAction}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FocusAreaCards({ areas }: { areas: BoardFocusArea[] }) {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="font-bold text-sm text-[#1E293B] flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-[#328555]" />
        Recommended Next Steps
      </h3>
      {areas.map((area, i) => (
        <div key={i} className="rounded-lg border p-3 bg-[#FAF9F7]">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                area.priority === "high"
                  ? "bg-amber-100 text-amber-700"
                  : area.priority === "medium"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {area.priority}
            </span>
            <span className="font-semibold text-sm text-[#1E293B]">{area.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{area.description}</p>
          <p className="text-xs text-[#0D9488] mt-1">{area.impact}</p>
        </div>
      ))}
    </div>
  );
}

function ScenarioCards({ scenarios }: { scenarios: ScenarioSnapshot[] }) {
  return (
    <div className="mt-4">
      <h3 className="font-bold text-sm text-[#1E293B] flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-[#328555]" />
        Scenario Comparison
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {scenarios.map((s, i) => {
          const signalBg = s.signal === "green" ? "bg-green-50 border-green-200" : s.signal === "amber" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
          return (
            <div key={i} className={`rounded-lg border p-3 ${signalBg}`}>
              <p className="font-semibold text-xs text-[#1E293B] mb-2">{s.name}</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Y5 Revenue</span>
                  <span className="font-medium">{s.y5Revenue}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Y5 Net Income</span>
                  <span className={`font-medium ${s.y5NetIncome.startsWith("-") ? "text-red-600" : ""}`}>{s.y5NetIncome}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Y5 Margin</span>
                  <span className="font-medium">{s.y5Margin}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  expanded,
  onToggle,
}: {
  section: PacketSection;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasContent =
    section.narrative ||
    section.linkedMetrics.length > 0 ||
    (section.tables && section.tables.length > 0) ||
    (section.insights && section.insights.length > 0);

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#FAF9F7] hover:bg-[#F5F4F0] transition-colors text-left"
      >
        <span className="font-semibold text-sm text-[#1E293B]">{section.title}</span>
        {hasContent && (expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
      </button>

      {expanded && hasContent && (
        <div className="px-4 py-3 space-y-3">
          {section.narrative && <p className="text-sm text-muted-foreground leading-relaxed">{section.narrative}</p>}

          {section.insights && section.insights.length > 0 && (
            <div className="space-y-2">
              {section.insights.map((insight, i) => (
                <InsightCallout
                  key={i}
                  label={insight.label}
                  body={insight.body}
                  tone={insight.tone}
                />
              ))}
            </div>
          )}

          {section.linkedMetrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {section.linkedMetrics.slice(0, 6).map((m, i) => {
                const bg =
                  m.status === "good"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : m.status === "danger"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : m.status === "warning"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-50 text-gray-700 border-gray-200";
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${bg}`}>
                    {m.label}: {m.value}
                  </span>
                );
              })}
            </div>
          )}

          {section.tables &&
            section.tables.map((table, i) => (
              <div key={i} className="overflow-x-auto">
                <p className="text-xs font-semibold text-[#1E293B] mb-1">{table.title}</p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#328555]">
                      {table.headers.map((h, j) => (
                        <th key={j} className={`px-2 py-1.5 text-white font-medium ${j === 0 ? "text-left" : "text-right"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => (
                      <tr key={ri} className={`${ri % 2 === 1 ? "bg-gray-50" : ""} ${row.isBold ? "font-bold" : ""}`}>
                        <td className="px-2 py-1.5 text-left">{row.label}</td>
                        {row.values.map((v, vi) => (
                          <td key={vi} className={`px-2 py-1.5 text-right ${v.startsWith("-") || v.startsWith("(") ? "text-red-600" : ""}`}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

