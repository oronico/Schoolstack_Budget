import { useState, useEffect, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { getExportModelUrl, customFetch } from "@workspace/api-client-react";
import { Download, Loader2, PartyPopper, ArrowRight, FileSpreadsheet, ClipboardCheck, FileText, BarChart3, MessageSquareMore, CheckCircle2, Send, Share2, Copy, Check, Trash2, Link2, BookOpen, Sparkles } from "lucide-react";
import { isChestertonAcademy, isSingleYearModel } from "../schema";
import { ExtendToFiveYearModal } from "@/components/wizard/ExtendToFiveYearModal";
import { seedFiveYearFromYearOne, resolveSeedDefaults, type SeedDefaults } from "@/lib/seed-five-year";
import { calculatePersonnelCosts } from "@/lib/staffing-defaults";
import { useUpdateModel } from "@workspace/api-client-react";
import { useConflictBanner } from "@/components/ConflictReloadBanner";
import { Link } from "wouter";
import { LenderPacketPreview } from "../../../components/export/LenderPacketPreview";
import { LenderAttachmentsPreview } from "../../../components/export/LenderAttachmentsPreview";
import { BoardPacketPreview } from "../../../components/export/BoardPacketPreview";
import { PacketAttachmentsPreview } from "../../../components/export/PacketAttachmentsPreview";
import { ChestertonDashboard } from "../../../components/chesterton/ChestertonDashboard";
import { trackExport } from "@/hooks/useExportTracker";
import type { ChestertonData } from "../schema";

type ExportType = "formula" | "underwritingV2" | "lenderPacketPdf" | "boardPacketPdf" | "chestertonOperatingManual";

interface SharedLinkItem {
  id: number;
  token: string;
  viewerLabel: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function ExportStep({ modelId }: { jumpToStep?: (s:number)=>void, modelId: number | null }) {
  const { watch, getValues, reset } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType") as string | undefined;
  const modelDurationValue = watch("schoolProfile.modelDuration") as string | undefined;
  const isChesterton = isChestertonAcademy(schoolType);
  const isSingleYear = isSingleYearModel({ schoolProfile: { modelDuration: modelDurationValue } });
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extending, setExtending] = useState(false);
  const updateMutation = useUpdateModel();
  const conflict = useConflictBanner();
  const handleExtendConfirm = async (overrides: SeedDefaults) => {
    if (extending) return;
    setExtending(true);
    try {
      const current = getValues() as Record<string, unknown> & {
        schoolProfile?: Record<string, unknown>;
        facilities?: Record<string, unknown>;
        tuitionEscalation?: Record<string, unknown>;
      };
      // Mirror the wizard banner path: seed Y2-Y5 across every domain using
      // the founder's edited rates, then persist those rates back to the
      // matching wizard fields so subsequent edits start from the same baseline.
      const seeded = seedFiveYearFromYearOne(current as never, overrides) as Record<string, unknown> & {
        schoolProfile?: Record<string, unknown>;
      };
      const next = {
        ...seeded,
        schoolProfile: {
          ...(current.schoolProfile ?? {}),
          ...(seeded.schoolProfile ?? {}),
          modelDuration: "five_year" as const,
          enrollmentGrowthRate: overrides.enrollmentGrowthPct,
        },
        facilities: {
          ...(current.facilities ?? {}),
          annualSalaryIncrease: overrides.salaryEscalationPct,
          generalCostInflation: overrides.costInflationPct,
        },
        tuitionEscalation: {
          ...(current.tuitionEscalation ?? {}),
          rate: overrides.tuitionEscalationPct,
        },
      };
      // Task #518 — DO NOT call `reset(next)` before awaiting the PUT.
      // Flipping `schoolProfile.modelDuration` to "five_year" re-grows the
      // wizard's `visibleSteps` (single-year hides "Lender Narrative", so
      // five-year adds it back at id 11). With `currentStep` already clamped
      // to the last single-year slot (11), the next render swaps the
      // ActiveStepComponent over to NarrativeStep and unmounts ExportStep —
      // taking our `useConflictBanner` hook (and its `{conflict.banner}` JSX)
      // with it. By the time the 409 from a stale cross-tab edit resolves,
      // there's nothing left to render the banner on, and the wizard's own
      // autosave-driven banner doesn't fire either because `methods.reset`
      // clears `dirtyFields`. Net effect: a silently dropped extend.
      //
      // Defer the reset until after `mutateAsync` resolves successfully.
      // On a 409 we never reset, so ExportStep stays mounted long enough
      // for the catch below to flip the shared banner open.
      if (modelId) {
        await updateMutation.mutateAsync({ id: modelId, data: { data: next as unknown as Record<string, unknown> } });
      }
      reset(next as never);
      setShowExtendModal(false);
    } catch (err) {
      if (conflict.handleMutationError(err)) {
        // 409 — the shared banner now tells the founder to reload; no console
        // noise needed.
      } else {
        console.error("Failed to extend to 5-year:", err);
      }
    } finally {
      setExtending(false);
    }
  };
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [exported, setExported] = useState<Set<ExportType>>(new Set());
  const [showPacketPreview, setShowPacketPreview] = useState(false);
  const [showBoardPreview, setShowBoardPreview] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareViewerLabel, setShareViewerLabel] = useState("");
  const [sharedLinks, setSharedLinks] = useState<SharedLinkItem[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  useEffect(() => {
    if (!modelId) return;
    customFetch<{ available: boolean }>(`/api/models/${modelId}/review-available`)
      .then(data => setReviewAvailable(data.available))
      .catch(() => setReviewAvailable(false));
  }, [modelId]);

  const fetchSharedLinks = useCallback(async () => {
    if (!modelId) return;
    try {
      const links = await customFetch<SharedLinkItem[]>(`/api/models/${modelId}/shares`);
      setSharedLinks(links);
    } catch { /* ignore */ }
  }, [modelId]);

  useEffect(() => {
    fetchSharedLinks();
  }, [fetchSharedLinks]);

  function getShareUrl(token: string): string {
    const base = window.location.origin;
    const basePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    return `${base}${basePath}/shared/${token}`;
  }

  const handleCreateShare = async () => {
    if (!modelId || shareLoading) return;
    setShareLoading(true);
    try {
      const result = await customFetch<SharedLinkItem>(`/api/models/${modelId}/share`, {
        method: "POST",
        body: JSON.stringify({ viewerLabel: shareViewerLabel.trim() || undefined }),
      });
      setSharedLinks(prev => [result, ...prev]);
      setShareViewerLabel("");
      try {
        const url = getShareUrl(result.token);
        await navigator.clipboard.writeText(url);
        setCopiedToken(result.token);
        setTimeout(() => setCopiedToken(null), 2000);
      } catch {
        /* clipboard failed - link still created, user can copy manually */
      }
    } catch {
      alert("Failed to create share link. Please try again.");
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeShare = async (token: string) => {
    if (!modelId || revoking) return;
    setRevoking(token);
    try {
      await customFetch(`/api/models/${modelId}/share/${token}`, { method: "DELETE" });
      setSharedLinks(prev => prev.map(l => l.token === token ? { ...l, revokedAt: new Date().toISOString() } : l));
    } catch {
      alert("Failed to revoke link. Please try again.");
    } finally {
      setRevoking(null);
    }
  };

  const handleCopyLink = async (token: string) => {
    try {
      const url = getShareUrl(token);
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelId || !reviewName.trim() || !reviewEmail.trim()) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      await customFetch(`/api/models/${modelId}/request-review`, {
        method: "POST",
        body: JSON.stringify({ name: reviewName.trim(), email: reviewEmail.trim(), message: reviewMessage.trim() || undefined }),
      });
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch {
      setReviewError("Something went wrong. Please try again.");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleDownload = async (type: ExportType) => {
    if (!modelId || loading) return;

    if (type === "lenderPacketPdf" || type === "boardPacketPdf") {
      if (isSingleYear) {
        setShowExtendModal(true);
        return;
      }
      if (type === "lenderPacketPdf") {
        setShowPacketPreview(true);
        return;
      }
      setShowBoardPreview(true);
      return;
    }

    setLoading(type);

    try {
      const urlMap: Record<ExportType, string> = {
        formula: getExportModelUrl(modelId),
        underwritingV2: `/api/models/${modelId}/export/underwriting-v2`,
        lenderPacketPdf: `/api/models/${modelId}/export/lender-packet-pdf`,
        boardPacketPdf: `/api/models/${modelId}/export/board-packet-pdf`,
        chestertonOperatingManual: `/api/models/${modelId}/export/chesterton-operating-manual`,
      };

      const token = localStorage.getItem('auth_token');
      const res = await fetch(urlMap[type], {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) throw new Error("We couldn't generate that export — try again, or open a model with revenue and expenses entered.");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const rawSchoolName = (() => {
        const v = getValues() as { schoolProfile?: { schoolName?: string } };
        return (v.schoolProfile?.schoolName ?? "").trim();
      })();
      const safeSchoolName = (rawSchoolName || `Model_${modelId}`)
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .replace(/\s+/g, "_") || `Model_${modelId}`;
      const fallbackNames: Record<ExportType, string> = {
        formula: isSingleYear
          ? `${safeSchoolName}_1-Year_Operating_Budget.xlsx`
          : `${safeSchoolName}_5-Year_Financial_Model.xlsx`,
        underwritingV2: `${safeSchoolName}_Founder_Planning_Workbook.xlsx`,
        lenderPacketPdf: `${safeSchoolName}_Lender_Conversation_Snapshot.pdf`,
        boardPacketPdf: `${safeSchoolName}_Board_and_Funder_Summary.pdf`,
        chestertonOperatingManual: `${safeSchoolName}_Chesterton_CSN_Operating_Manual.xlsx`,
      };
      const filename = filenameMatch?.[1] || fallbackNames[type];
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setExported(prev => new Set(prev).add(type));
      trackExport();
    } catch (e) {
      console.error(e);
      alert("We couldn't generate that export — try again, or open a model with revenue and expenses entered.");
    } finally {
      setLoading(null);
    }
  };

  const anyExported = exported.size > 0;

  return (
    <>
    {conflict.banner}
    <ExtendToFiveYearModal
      open={showExtendModal}
      isPending={extending}
      defaults={resolveSeedDefaults(getValues() as never)}
      y1Enrollment={(() => {
        const v = getValues() as { enrollment?: { year1?: number } };
        return Number(v.enrollment?.year1) || 0;
      })()}
      y1TuitionRevenue={(() => {
        const v = getValues() as { revenueRows?: Array<{ category?: string; amounts?: number[] }> };
        return (v.revenueRows ?? [])
          .filter((r) => r.category === "tuition_and_fees")
          .reduce((sum, r) => sum + (Number(r.amounts?.[0]) || 0), 0);
      })()}
      y1Payroll={(() => {
        const v = getValues() as {
          enrollment?: { year1?: number };
          staffingRows?: Parameters<typeof calculatePersonnelCosts>[0];
        };
        const y1Enroll = Number(v.enrollment?.year1) || 0;
        const staffingRows = v.staffingRows ?? [];
        if (!staffingRows.length) return 0;
        return calculatePersonnelCosts(staffingRows, y1Enroll).grandTotal;
      })()}
      y1ExpenseRows={(() => {
        const v = getValues() as { expenseRows?: Array<{ amounts?: number[]; escalationRate?: number }> };
        return (v.expenseRows ?? [])
          .map((r) => ({
            amount: Number(r.amounts?.[0]) || 0,
            rate: typeof r.escalationRate === "number" ? r.escalationRate : undefined,
          }))
          .filter((r) => r.amount > 0);
      })()}
      onClose={() => { if (!extending) setShowExtendModal(false); }}
      onConfirm={handleExtendConfirm}
    />
    <div className="text-center py-12 px-4">
      <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8">
        {anyExported ? (
          <PartyPopper className="h-12 w-12 text-primary" />
        ) : (
          <Download className="h-12 w-12 text-primary" />
        )}
      </div>

      <h2 className="font-display text-4xl font-bold text-foreground mb-4">
        {anyExported ? "Your reports are ready!" : "Ready to export your model?"}
      </h2>

      <p className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
        {anyExported
          ? "Check your downloads folder. Every document is lender-grade and fully formatted."
          : "Before you download, let our team review your numbers."}
      </p>

      <p className="text-sm text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="help-export">This workbook is a planning tool. It can support conversations with lenders, funders, boards, and advisors, but it is not a loan application or funding decision.</p>

      {reviewAvailable && !reviewSubmitted && !showReviewForm && (
        <div className="max-w-2xl mx-auto mb-10">
          <div
            onClick={() => setShowReviewForm(true)}
            className="w-full cursor-pointer group bg-gradient-to-r from-amber-50 via-white to-amber-50 border-2 border-amber-300/60 hover:border-amber-400 rounded-2xl p-6 sm:p-8 transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
                <MessageSquareMore className="h-7 w-7 text-amber-600" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-display font-bold text-lg sm:text-xl text-foreground mb-1">Get Your Free Expert Review</h3>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  Our school finance advisors will review your model personally and send you feedback - what looks strong, what to watch, and how to strengthen your lending position. Free, no strings attached.
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Free of charge</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> 5–7 day turnaround</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Personalized feedback</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      )}

      {isChesterton && (
        <ChestertonDashboard
          chesterton={watch("chesterton") as ChestertonData | undefined}
          schoolName={(watch("schoolProfile.schoolName") as string | undefined) || undefined}
        />
      )}

      {isSingleYear && (
        <div className="max-w-4xl mx-auto mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900 mb-0.5">You're on Single-Year mode</p>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Lender-grade PDF exports - Lender Conversation Snapshot and Board and Funder Summary - need a full
              5-year projection. <button
                type="button"
                data-testid="single-year-banner-extend"
                onClick={() => setShowExtendModal(true)}
                className="font-semibold text-emerald-900 underline underline-offset-2 hover:text-emerald-700"
              >Extend to 5-year</button> any time to unlock them.
            </p>
          </div>
        </div>
      )}
      <PacketAttachmentsPreview />
      <LenderAttachmentsPreview />

      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="relative" data-testid="lender-packet-card-wrapper">
          <ExportCard
            icon={<FileText className="h-7 w-7" />}
            title="Lender Conversation Snapshot"
            description={isSingleYear ? "Requires 5-year projection. Extend your model to share with a lender." : "Plain-English summary, 5-year forecast, DSCR view, what to watch & supporting exhibits as PDF — designed to start a productive lender conversation"}
            isLoading={loading === "lenderPacketPdf"}
            isExported={exported.has("lenderPacketPdf")}
            disabled={isSingleYear || (loading !== null && loading !== "lenderPacketPdf")}
            onClick={() => handleDownload("lenderPacketPdf")}
            highlight={!isSingleYear}
          />
          {isSingleYear && (
            <button
              type="button"
              data-testid="lender-card-extend-cta"
              onClick={() => setShowExtendModal(true)}
              className="absolute inset-0 w-full h-full rounded-2xl flex items-end justify-center pb-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Extend to 5-year to enable Lender Conversation Snapshot"
            >
              <span className="text-[11px] font-semibold text-primary bg-white px-2.5 py-1 rounded-full shadow border border-primary/30">
                Extend to 5-year
              </span>
            </button>
          )}
        </div>
        <div className="relative" data-testid="board-packet-card-wrapper">
          <ExportCard
            icon={<BarChart3 className="h-7 w-7" />}
            title="Board and Funder Summary"
            description={isSingleYear ? "Requires 5-year projection. Extend your model to enable a board-ready summary." : "Financial outlook, top things to watch, cash runway, scenario comparison & next steps — written for board members and funders"}
            isLoading={loading === "boardPacketPdf"}
            isExported={exported.has("boardPacketPdf")}
            disabled={isSingleYear || (loading !== null && loading !== "boardPacketPdf")}
            onClick={() => handleDownload("boardPacketPdf")}
            highlight={!isSingleYear}
          />
          {isSingleYear && (
            <button
              type="button"
              data-testid="board-card-extend-cta"
              onClick={() => setShowExtendModal(true)}
              className="absolute inset-0 w-full h-full rounded-2xl flex items-end justify-center pb-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Extend to 5-year to enable Board and Funder Summary"
            >
              <span className="text-[11px] font-semibold text-primary bg-white px-2.5 py-1 rounded-full shadow border border-primary/30">
                Extend to 5-year
              </span>
            </button>
          )}
        </div>
        <div className="relative" data-testid="underwriting-card-wrapper">
          <ExportCard
            icon={<ClipboardCheck className="h-7 w-7" />}
            title="Founder Planning Workbook"
            description={isSingleYear ? "Year 1 workbook with DSCR, covenants, balance sheet, debt schedule & full formulas — your in-depth planning tool" : "23-tab workbook with DSCR, covenants, balance sheet, debt schedule & full formulas — your in-depth planning tool"}
            isLoading={loading === "underwritingV2"}
            isExported={exported.has("underwritingV2")}
            disabled={loading !== null && loading !== "underwritingV2"}
            onClick={() => handleDownload("underwritingV2")}
          />
        </div>
        <div className="relative" data-testid="formula-card-wrapper">
          <ExportCard
            icon={<FileSpreadsheet className="h-7 w-7" />}
            title={isSingleYear ? "1-Year Operating Budget" : "5-Year Financial Model"}
            description="Assumptions page with live Excel formulas — anyone reviewing can test the math"
            isLoading={loading === "formula"}
            isExported={exported.has("formula")}
            disabled={loading !== null && loading !== "formula"}
            onClick={() => handleDownload("formula")}
          />
        </div>
        {isChesterton && (
          <ExportCard
            icon={<BookOpen className="h-7 w-7" />}
            title="CSN Operating Manual"
            description="Chesterton Schools Network workbook your regional director already knows: GETTING STARTED, 5-yr projection, salary schedule, fundraising goals, gift chart, recruiting pipeline."
            isLoading={loading === "chestertonOperatingManual"}
            isExported={exported.has("chestertonOperatingManual")}
            disabled={loading !== null && loading !== "chestertonOperatingManual"}
            onClick={() => handleDownload("chestertonOperatingManual")}
            highlight
            badge="✓ Live formulas"
            caption="Tuition, financial aid, faculty payroll, fundraising totals, key-assumption bullets, and the parent handout's projection title all run as live Excel formulas - edit any input on GETTING STARTED and the workbook recalculates."
          />
        )}
      </div>

      {modelId && (
        <div className="max-w-4xl mx-auto mb-10">
          <a
            href={`/model/${modelId}/summary`}
            data-testid="founder-summary-link"
            className="block text-left bg-gradient-to-r from-primary/5 via-white to-primary/5 border-2 border-primary/30 hover:border-primary/60 rounded-2xl p-6 transition-all hover:shadow-lg"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-bold text-lg text-foreground mb-1">
                  View Plain-English Summary
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A coach-voice read of your model in six short sections - what it says, what looks strong, what needs more clarity, what could create cash pressure, what to fix first, and what a reviewer may ask. Same numbers as your downloads.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
            </div>
          </a>
        </div>
      )}

      {reviewAvailable && (reviewSubmitted || showReviewForm) && (
        <div className="mt-10 max-w-2xl mx-auto">
          {reviewSubmitted ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 animate-in fade-in duration-500">
              <div className="flex items-center justify-center gap-3 mb-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <h3 className="font-display font-bold text-xl text-green-900">Review requested - we'll be in touch</h3>
              </div>
              <p className="text-green-700 text-sm">
                Check your email for a confirmation. Our advisors will review your model and get back to you within 5–7 business days.
              </p>
            </div>
          ) : showReviewForm ? (
            <div className="bg-gradient-to-b from-amber-50/80 to-white border-2 border-amber-400/40 rounded-2xl p-8 shadow-lg animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <MessageSquareMore className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="font-display font-bold text-xl text-foreground">Request Your Free Review</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-6">Our school finance advisors will review your model and send personalized feedback within 5–7 business days - completely free.</p>
              <form onSubmit={handleReviewSubmit} className="space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Your name</label>
                    <input
                      type="text"
                      required
                      value={reviewName}
                      onChange={e => setReviewName(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Your email</label>
                    <input
                      type="email"
                      required
                      value={reviewEmail}
                      onChange={e => setReviewEmail(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      placeholder="jane@school.org"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Questions or notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea
                    value={reviewMessage}
                    onChange={e => setReviewMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
                    placeholder="Anything specific you'd like us to look at?"
                  />
                </div>
                {reviewError && (
                  <p className="text-sm text-red-600">{reviewError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={reviewLoading || !reviewName.trim() || !reviewEmail.trim()}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 text-white font-semibold py-3 px-4 rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {reviewLoading ? "Submitting..." : "Submit Review Request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                    className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted/50 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      )}

      {anyExported && !reviewSubmitted && reviewAvailable && !nudgeDismissed && (
        <div className="mt-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl px-5 py-3 flex items-center gap-3">
            <MessageSquareMore className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-semibold">Before you go</span> - want an expert to look over your model? <button onClick={() => setShowReviewForm(true)} className="font-bold text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors">Request a free review</button>
            </p>
            <button
              type="button"
              onClick={() => setNudgeDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors p-1 flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      <div className="mt-10 max-w-xl mx-auto">
        {showSharePanel ? (
          <div className="bg-white border border-primary/30 rounded-2xl p-8 shadow-lg animate-in fade-in duration-300">
            <h3 className="font-display font-bold text-xl text-foreground mb-2">Share with Lender or Board</h3>
            <p className="text-muted-foreground text-sm mb-6">Generate a read-only link anyone can view - no login required.</p>

            <div className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Viewer name or role <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={shareViewerLabel}
                  onChange={e => setShareViewerLabel(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. First National Bank, Board Chair"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreateShare}
                  disabled={shareLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {shareLoading ? "Generating..." : "Generate & Copy Link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSharePanel(false)}
                  className="px-4 py-2.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/50 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>

            {sharedLinks.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground mb-3">Active Share Links</h4>
                <div className="space-y-2">
                  {sharedLinks.map(link => (
                    <div
                      key={link.token}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${link.revokedAt ? "bg-muted/30 border-border/50 opacity-60" : "bg-white border-border"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {link.viewerLabel || "Shared link"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {link.revokedAt ? "Revoked" : `Created ${new Date(link.createdAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      {!link.revokedAt && (
                        <>
                          <button
                            onClick={() => handleCopyLink(link.token)}
                            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                            title="Copy link"
                          >
                            {copiedToken === link.token ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRevokeShare(link.token)}
                            disabled={revoking === link.token}
                            className="p-1.5 rounded-md hover:bg-red-50 transition-colors"
                            title="Revoke link"
                          >
                            {revoking === link.token ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-red-500" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowSharePanel(true)}
            className="w-full group bg-white border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-2xl p-6 flex items-center gap-4 transition-all hover:shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <Share2 className="h-6 w-6 text-primary" />
            </div>
            <div className="text-left">
              <span className="font-display font-bold text-foreground block">Share with Lender or Board</span>
              <span className="text-sm text-muted-foreground">Generate a read-only link to your financial model - no login required.</span>
            </div>
            <ArrowRight className="h-5 w-5 text-primary ml-auto flex-shrink-0" />
          </button>
        )}
      </div>

      {anyExported && (
        <div className="mt-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-accent/10 border border-accent/20 rounded-3xl p-8 max-w-xl mx-auto">
            <h3 className="font-display font-bold text-2xl text-foreground mb-3">Looking for capital?</h3>
            <p className="text-muted-foreground mb-6">
              Now that you have a solid financial model, you might be ready to explore funding options to launch or grow your school.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 text-accent font-bold hover:text-accent/80 transition-colors"
            >
              Learn about our loan program <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {showPacketPreview && modelId && (
        <LenderPacketPreview
          modelId={modelId}
          onClose={() => setShowPacketPreview(false)}
        />
      )}

      {showBoardPreview && modelId && (
        <BoardPacketPreview
          modelId={modelId}
          onClose={() => setShowBoardPreview(false)}
        />
      )}
    </div>
    </>
  );
}

function ExportCard({
  icon, title, description, isLoading, isExported, disabled, onClick, highlight, badge, caption
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isLoading: boolean;
  isExported: boolean;
  disabled: boolean;
  onClick: () => void;
  highlight?: boolean;
  badge?: string;
  caption?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group bg-white rounded-2xl border shadow-sm p-6 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed ${highlight ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/60'}`}
    >
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${isExported ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
        {isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : icon}
      </div>
      <span className="font-display font-bold text-sm text-foreground">{isExported ? `${title} ✓` : title}</span>
      {badge && (
        <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-[11px] font-semibold">
          {badge}
        </span>
      )}
      <span className="text-xs text-muted-foreground leading-snug">{description}</span>
      {caption && (
        <span className="text-[11px] text-muted-foreground/90 leading-snug italic">
          {caption}
        </span>
      )}
      <span className="mt-auto text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
        {isLoading ? "Generating..." : isExported ? "Download Again" : highlight ? "Preview & Download" : "Download"}
      </span>
    </button>
  );
}
