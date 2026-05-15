import { useState, useEffect, useCallback } from "react";
import { X, Download, Loader2, Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FileText, RefreshCw } from "lucide-react";
import { trackExport } from "@/hooks/useExportTracker";
import { InsightCallout } from "@/components/coaching/InsightCallout";
import { buildForecastFilterQuery } from "@/lib/forecast-accuracy-query";
import { CashRunwayCard, type CashRunwayView } from "./CashRunwayCard";
import { PacketAttachmentsPreview } from "./PacketAttachmentsPreview";
import { lenderReadinessCoachingHeadline } from "@/lib/coaching/lender-readiness-coaching";

interface LinkedMetric {
  label: string;
  value: string;
  status?: "good" | "warning" | "danger";
  benchmark?: string;
}

interface LinkedAssumption {
  label: string;
  value: string;
  sourceField: string;
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
  linkedAssumptions: LinkedAssumption[];
  linkedMetrics: LinkedMetric[];
  tables?: PacketTable[];
  insights?: PacketInsight[];
}

interface RiskMitigant {
  risk: string;
  severity: "critical" | "high" | "medium";
  mitigant: string;
  whyItMatters: string;
  supportingMetrics: { label: string; value: string }[];
}

interface NarrativeSummary {
  headline: string;
  summary: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendedFocus: string;
}

/**
 * Task #617 - lender-ready narrative commentary block returned from the
 * canonical engine alongside the rest of the packet. Optional so older
 * cached responses keep rendering.
 */
interface NarrativeCommentary {
  paragraphs: string[];
  allowedFigures: string[];
  generatedAt: string;
}

interface LenderPacket {
  packetType: string;
  schoolName: string;
  generatedAt: string;
  modelId: number;
  // Task #657 — provenance flag from buildPacketData. Optional so older
  // cached responses keep rendering.
  provenance?: "actuals" | "assumptions";
  narrative: NarrativeSummary;
  sections: PacketSection[];
  riskMitigants: RiskMitigant[];
  dscrSummary: {
    currentDSCR: string;
    status: "good" | "warning" | "danger";
    benchmark: string;
    trendDescription: string;
  } | null;
  lenderReadiness: {
    status: "Strong" | "Needs Work" | "Not Yet Ready";
    explanation: string;
  };
  cashRunway: CashRunwayView;
  // Task #617 - lender commentary block, surfaced as the lead block in
  // both the in-app preview and the downloaded PDF.
  lenderCommentary?: NarrativeCommentary;
}

export function LenderPacketPreview({
  modelId,
  onClose,
}: {
  modelId: number;
  onClose: () => void;
}) {
  const [packet, setPacket] = useState<LenderPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Task #617 - "Regenerate" rebuilds the packet (and its lender commentary)
  // without dismissing the preview, so founders can refresh after editing.
  const [regenerating, setRegenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["executive_summary", "five_year_projection", "key_risks"]));

  const fetchPacket = useCallback(async () => {
    try {
      const token = localStorage.getItem("auth_token");
      // Cache-bust on regenerate so a CDN / client cache cannot serve stale prose.
      const filterQuery = buildForecastFilterQuery();
      const ts = `${filterQuery ? "&" : "?"}_=${Date.now()}`;
      const res = await fetch(
        `/api/models/${modelId}/export/lender-packet${filterQuery}${ts}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        },
      );
      if (!res.ok) throw new Error("Failed to load packet");
      const data = await res.json();
      setPacket(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load packet");
    }
  }, [modelId]);

  useEffect(() => {
    setLoading(true);
    fetchPacket().finally(() => setLoading(false));
  }, [fetchPacket]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    await fetchPacket();
    setRegenerating(false);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/models/${modelId}/export/lender-packet-pdf${buildForecastFilterQuery()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] || `Lender_Conversation_Snapshot_${modelId}.pdf`;
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
          <p className="text-muted-foreground">Generating Lender Conversation Snapshot...</p>
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
        <PacketHeader packet={packet} onClose={onClose} onDownload={handleDownloadPdf} downloading={downloadingPdf} onRegenerate={handleRegenerate} regenerating={regenerating} />
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {packet.lenderCommentary && (
            <CommentaryBlock
              title="Lender Commentary"
              accent="lender"
              commentary={packet.lenderCommentary}
              onRegenerate={handleRegenerate}
              regenerating={regenerating}
            />
          )}
          <NarrativeHeader narrative={packet.narrative} readiness={packet.lenderReadiness} />
          {packet.dscrSummary && <DSCRCard dscr={packet.dscrSummary} />}
          {packet.cashRunway && <CashRunwayCard cash={packet.cashRunway} variant="lender" />}
          {packet.riskMitigants.length > 0 && <RiskMitigantCards risks={packet.riskMitigants} />}
          <div className="space-y-2 mt-6">
            {packet.sections
              .filter((s) => s.included && s.id !== "cover")
              .map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  expanded={expandedSections.has(section.id)}
                  onToggle={() => toggleSection(section.id)}
                />
              ))}
          </div>
          <PacketAttachmentsPreview />
        </div>
      </div>
    </div>
  );
}

function PacketHeader({
  packet,
  onClose,
  onDownload,
  downloading,
  onRegenerate,
  regenerating,
}: {
  packet: LenderPacket;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-[#1E293B] to-[#334155] rounded-t-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
          <FileText className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">{packet.schoolName}</h2>
          <p className="text-white/60 text-sm">Lender Conversation Snapshot</p>
          {/* Task #657 — provenance pill on the in-app preview header. */}
          <span
            data-testid="packet-provenance-pill"
            data-provenance={packet.provenance ?? "assumptions"}
            className="inline-flex items-center mt-1.5 rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white/90"
          >
            {packet.provenance === "actuals" ? "Built from actuals" : "Built from assumptions"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRegenerate}
          disabled={regenerating || downloading}
          data-testid="regenerate-commentary-button"
          title="Rebuild the lender commentary from the latest model values"
          className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
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

/**
 * Task #617 - Lead-block commentary card surfaced above the rest of the
 * packet preview. Mirrors what gets rendered as the lead block in the
 * downloaded PDF. The "regenerated at" stamp gives founders a clear
 * signal that the prose was rebuilt from the latest engine values.
 */
export function CommentaryBlock({
  title,
  accent,
  commentary,
  onRegenerate,
  regenerating,
}: {
  title: string;
  accent: "lender" | "board";
  commentary: NarrativeCommentary;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  if (!commentary.paragraphs.length) return null;
  const headerBg =
    accent === "lender"
      ? "bg-[#1E293B] text-white"
      : "bg-[#328555] text-white";
  const stamp = (() => {
    try {
      return new Date(commentary.generatedAt).toLocaleString();
    } catch {
      return commentary.generatedAt;
    }
  })();
  return (
    <div
      data-testid={`commentary-block-${accent}`}
      className="mt-6 rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className={`flex items-center justify-between px-4 py-2 ${headerBg}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          data-testid={`commentary-regenerate-${accent}`}
          className="flex items-center gap-1 text-[11px] font-medium text-white/90 hover:text-white disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {regenerating ? "Regenerating" : "Regenerate"}
        </button>
      </div>
      <div className="px-4 py-3 bg-white space-y-3">
        {commentary.paragraphs.map((p, i) => (
          <p
            key={i}
            data-testid={`commentary-paragraph-${accent}-${i}`}
            className="text-sm leading-relaxed text-[#1E293B]"
          >
            {p}
          </p>
        ))}
        <p className="text-[11px] text-muted-foreground italic pt-1">
          Every figure above was sourced from the same canonical engine that powers the rest of this packet. Regenerated at {stamp}.
        </p>
      </div>
    </div>
  );
}

export function NarrativeHeader({
  narrative,
  readiness,
}: {
  narrative: NarrativeSummary;
  readiness: { status: string; explanation: string };
}) {
  const statusColor =
    readiness.status === "Strong"
      ? "bg-green-50 border-green-200 text-green-800"
      : readiness.status === "Needs Work"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-red-50 border-red-200 text-red-800";

  const statusIcon =
    readiness.status === "Strong" ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : readiness.status === "Needs Work" ? (
      <AlertTriangle className="h-5 w-5 text-amber-600" />
    ) : (
      <Shield className="h-5 w-5 text-red-600" />
    );

  return (
    <div className="mt-6 space-y-4">
      <div className={`rounded-xl border p-4 ${statusColor}`}>
        <div className="flex items-center gap-2 mb-2">
          {statusIcon}
          <span className="font-bold text-sm">
            Lender Readiness: {lenderReadinessCoachingHeadline(readiness.status) || readiness.status}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{readiness.explanation}</p>
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

function DSCRCard({ dscr }: { dscr: NonNullable<LenderPacket["dscrSummary"]> }) {
  const bg = dscr.status === "good" ? "bg-green-50 border-green-200" : dscr.status === "warning" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-[#1E293B]">Debt Service Coverage Ratio</span>
        <span className="text-lg font-bold">{dscr.currentDSCR}</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Benchmark: {dscr.benchmark}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{dscr.trendDescription}</p>
    </div>
  );
}

function RiskMitigantCards({ risks }: { risks: RiskMitigant[] }) {
  return (
    <div className="mt-4 space-y-3">
      <h3 className="font-bold text-sm text-[#1E293B]">Identified Risks & Mitigations</h3>
      {risks.map((rm, i) => {
        const severityColor =
          rm.severity === "critical"
            ? "border-l-red-500 bg-red-50/50"
            : rm.severity === "high"
              ? "border-l-amber-500 bg-amber-50/50"
              : "border-l-gray-400 bg-gray-50/50";

        return (
          <div key={i} className={`rounded-lg border border-l-4 p-3 ${severityColor}`}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  rm.severity === "critical"
                    ? "bg-red-100 text-red-700"
                    : rm.severity === "high"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {rm.severity}
              </span>
              <span className="font-semibold text-sm text-[#1E293B]">{rm.risk}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{rm.whyItMatters}</p>
            {rm.supportingMetrics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {rm.supportingMetrics.map((sm, j) => (
                  <span key={j} className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-gray-200 text-[10px] text-gray-600">
                    {sm.label}: <span className="font-semibold ml-0.5">{sm.value}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="bg-white/80 rounded-md p-2 border border-teal-100">
              <span className="text-[10px] font-bold text-[#0D9488] uppercase">Recommended Mitigation</span>
              <p className="text-xs text-[#1E293B] mt-0.5">{rm.mitigant}</p>
            </div>
          </div>
        );
      })}
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
    section.linkedAssumptions.length > 0 ||
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
              {section.linkedMetrics.slice(0, 6).map((m, i) => (
                <MetricBadge key={i} metric={m} />
              ))}
            </div>
          )}

          {section.tables &&
            section.tables.map((table, i) => <PreviewTable key={i} table={table} />)}
        </div>
      )}
    </div>
  );
}

function MetricBadge({ metric }: { metric: LinkedMetric }) {
  const bg =
    metric.status === "good"
      ? "bg-green-50 text-green-700 border-green-200"
      : metric.status === "danger"
        ? "bg-red-50 text-red-700 border-red-200"
        : metric.status === "warning"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${bg}`}>
      {metric.label}: {metric.value}
    </span>
  );
}

function PreviewTable({ table }: { table: PacketTable }) {
  if (table.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-[#1E293B] mb-1">{table.title}</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#1E293B]">
            {table.headers.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 text-white font-medium ${i === 0 ? "text-left" : "text-right"}`}>
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
  );
}

