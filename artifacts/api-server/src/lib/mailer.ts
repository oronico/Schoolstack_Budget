import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  resendClient = new Resend(apiKey);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export interface ReviewRequestData {
  requesterName: string;
  requesterEmail: string;
  message?: string;
  schoolName: string;
  state: string;
  schoolType: string;
  entityType: string;
  schoolStage?: string;
  openingYear?: number;
  maxCapacity?: number;
  facilityCity?: string;
  facilityState?: string;
  ownershipType?: string;
  monthlyRent?: number;
  isFaithAffiliated?: boolean;
  faithAffiliation?: string;
  hasLoan?: boolean;
  loanAmount?: number;
  lendingLabIntent?: string;
  enrollment: number[];
  revenue: number[];
  expenses: number[];
  netIncome: number[];
  dscr: number[];
  reserveMonths: number;
  cashRunwayMonths: number;
  daysCashOnHand: number;
  criticalFindings: { title: string; severity: "critical" | "high" | "medium" }[];
  criticalSeverityCount?: number;
  sharedViewUrl?: string;
  source?: "authenticated" | "public";
  breakEvenYear?: number | null;
  staffCount?: number;
  staffingCostPercent?: number;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function determinePriority(data: ReviewRequestData): "high" | "standard" {
  const criticalCount = data.criticalSeverityCount ?? 0;
  if (criticalCount >= 3) return "high";
  const msg = (data.message || "").toLowerCase();
  const urgencyWords = ["urgent", "asap", "deadline", "immediately", "time-sensitive", "closing", "due date"];
  if (urgencyWords.some(w => msg.includes(w))) return "high";
  return "standard";
}

function findBreakEvenYear(netIncome: number[]): number | null {
  for (let i = 0; i < netIncome.length; i++) {
    if (netIncome[i] >= 0) return i + 1;
  }
  return null;
}

function severityDot(severity: "critical" | "high" | "medium"): string {
  if (severity === "critical") return "🔴";
  if (severity === "high") return "🟡";
  return "🟢";
}

export async function sendReviewRequestToTeam(data: ReviewRequestData): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;
  const notifyEmail = process.env.REVIEW_NOTIFY_EMAIL || fromAddress;

  if (!resend || !fromAddress || !notifyEmail) {
    return { success: false, error: "Email service is not configured." };
  }

  const priority = determinePriority(data);
  const breakEven = data.breakEvenYear ?? findBreakEvenYear(data.netIncome);
  const source = data.source || "authenticated";
  const isPublic = source === "public";

  const y1Rev = data.revenue[0] || 0;
  const y1Exp = data.expenses[0] || 0;
  const y1Margin = y1Rev > 0 ? ((y1Rev - y1Exp) / y1Rev * 100).toFixed(1) : "0.0";
  const y5Rev = data.revenue[data.revenue.length - 1] || 0;
  const y5NI = data.netIncome[data.netIncome.length - 1] || 0;

  const priorityBadge = priority === "high"
    ? `<div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:6px;padding:8px 16px;margin-bottom:16px;text-align:center;"><span style="color:#DC2626;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">⚠ High Priority Review</span></div>`
    : `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 16px;margin-bottom:16px;text-align:center;"><span style="color:#16A34A;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Standard Review</span></div>`;

  const sourceBadge = isPublic
    ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:8px 16px;margin-bottom:16px;"><span style="color:#92400E;font-size:13px;">📋 <strong>Public wizard user</strong> — this person has not created an account yet.</span></div>`
    : "";

  const yearHeaders = data.enrollment.map((_, i) => `<th style="padding:6px 10px;border-bottom:2px solid #D97706;text-align:right;color:#1E293B;font-size:12px;">Y${i + 1}</th>`).join("");

  function yearRow(label: string, values: number[], formatter: (n: number) => string = fmtCurrency): string {
    return `<tr><td style="padding:5px 10px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#1E293B;font-size:13px;">${label}</td>${values.map(v => `<td style="padding:5px 10px;border-bottom:1px solid #E2E8F0;text-align:right;color:#475569;font-size:13px;">${formatter(v)}</td>`).join("")}</tr>`;
  }

  const findingsHtml = data.criticalFindings.length > 0
    ? data.criticalFindings.map((f) => `<div style="padding:6px 0;border-bottom:1px solid #FDE68A;font-size:13px;color:#1E293B;">${severityDot(f.severity)} <span style="font-weight:600;text-transform:uppercase;font-size:10px;color:${f.severity === "critical" ? "#DC2626" : f.severity === "high" ? "#D97706" : "#6B7280"};margin-right:4px;">${f.severity}</span> ${escapeHtml(f.title)}</div>`).join("")
    : `<p style="color:#16A34A;font-size:13px;">No critical findings identified.</p>`;

  const sharedLinkSection = data.sharedViewUrl
    ? `<div style="text-align:center;margin:12px 0;"><a href="${escapeHtml(data.sharedViewUrl)}" style="background:#1E293B;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block;">View Full Model</a></div>`
    : "";

  const html = `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#1E293B;padding:14px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#FFFFFF;margin:0;font-family:'Quicksand',Arial,sans-serif;font-size:18px;">Advisor Review Brief</h2>
      </div>
      <div style="border:1px solid #E2E8F0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        ${priorityBadge}
        ${sourceBadge}

        <!-- SECTION 1: School Profile -->
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;margin-top:20px;">School Profile</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
          <tr><td style="padding:3px 0;color:#94A3B8;width:140px;font-size:13px;">School</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${escapeHtml(data.schoolName)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Location</td><td style="color:#1E293B;font-size:13px;">${data.facilityCity ? escapeHtml(data.facilityCity) + ", " : ""}${escapeHtml(data.state)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Type</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.schoolType)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Entity</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.entityType)}</td></tr>
          ${data.schoolStage ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Stage</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.schoolStage)}</td></tr>` : ""}
          ${data.openingYear ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Opening Year</td><td style="color:#1E293B;font-size:13px;">${data.openingYear}</td></tr>` : ""}
          ${data.maxCapacity ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Max Capacity</td><td style="color:#1E293B;font-size:13px;">${data.maxCapacity.toLocaleString()} students</td></tr>` : ""}
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Enrollment Y1→Y5</td><td style="color:#1E293B;font-size:13px;">${data.enrollment.map(e => e.toLocaleString()).join(" → ")}</td></tr>
          ${data.isFaithAffiliated ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Faith-Affiliated</td><td style="color:#1E293B;font-size:13px;">Yes${data.faithAffiliation ? " — " + escapeHtml(data.faithAffiliation) : ""}</td></tr>` : ""}
        </table>

        <!-- SECTION 1b: Facility & Financing Context -->
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;">Facility & Financing</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
          ${data.ownershipType ? `<tr><td style="padding:3px 0;color:#94A3B8;width:140px;font-size:13px;">Facility</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.ownershipType)}</td></tr>` : ""}
          ${data.monthlyRent ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Monthly Rent</td><td style="color:#1E293B;font-size:13px;">${fmtCurrency(data.monthlyRent)}</td></tr>` : ""}
          ${data.hasLoan ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Existing Loan</td><td style="color:#1E293B;font-size:13px;">${data.loanAmount ? fmtCurrency(data.loanAmount) : "Yes"}</td></tr>` : ""}
          ${data.lendingLabIntent ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Financing Interest</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.lendingLabIntent)}</td></tr>` : ""}
          ${data.staffCount ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Staff Count</td><td style="color:#1E293B;font-size:13px;">${data.staffCount} positions</td></tr>` : ""}
          ${data.staffingCostPercent !== undefined && data.staffingCostPercent > 0 ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Staffing % of Revenue</td><td style="color:#1E293B;font-size:13px;${data.staffingCostPercent > 65 ? "color:#DC2626;font-weight:600;" : ""}">${data.staffingCostPercent.toFixed(1)}%</td></tr>` : ""}
        </table>

        <!-- SECTION 2: Financial Snapshot -->
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;">Financial Snapshot</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 4px;">
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Y1 Revenue</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${fmtCurrency(y1Rev)}</td><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Y1 Margin</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${y1Margin}%</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Y5 Revenue</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${fmtCurrency(y5Rev)}</td><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Y5 Net Income</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${fmtCurrency(y5NI)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Break-even</td><td style="color:#1E293B;font-weight:600;font-size:13px;" colspan="3">${breakEven ? `Year ${breakEven}` : "Not within projection"}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:12px;">
          <thead><tr><th style="padding:5px 10px;border-bottom:2px solid #D97706;text-align:left;color:#1E293B;font-size:12px;">Metric</th>${yearHeaders}</tr></thead>
          <tbody>
            ${yearRow("Revenue", data.revenue)}
            ${yearRow("Expenses", data.expenses)}
            ${yearRow("Net Income", data.netIncome)}
            ${yearRow("DSCR", data.dscr, n => n > 0 ? n.toFixed(2) + "x" : "N/A")}
          </tbody>
        </table>

        <!-- SECTION 3: Risk Assessment -->
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;">Risk Assessment</h3>
        <div style="background:#FFFBEB;border-radius:6px;padding:12px 16px;margin:8px 0 16px;">
          ${findingsHtml}
        </div>

        <!-- SECTION 4: Lending Readiness -->
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;">Lending Readiness</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
          <tr><td style="padding:3px 0;color:#94A3B8;width:180px;font-size:13px;">Reserve Months</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${data.reserveMonths.toFixed(1)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Cash Runway</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${data.cashRunwayMonths >= 60 ? "60+ months" : data.cashRunwayMonths.toFixed(1) + " months"}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Days Cash on Hand</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${Math.round(data.daysCashOnHand)} days</td></tr>
        </table>

        <!-- SECTION 5: Advisor Notes -->
        ${data.message ? `
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;font-size:14px;">Advisor Notes</h3>
        <div style="background:#F8FAFC;border-radius:6px;padding:12px 16px;margin:8px 0 16px;">
          <p style="color:#475569;margin:0;font-style:italic;font-size:13px;line-height:1.5;">"${escapeHtml(data.message)}"</p>
        </div>` : ""}

        <!-- Actions -->
        ${sharedLinkSection}
        <div style="text-align:center;margin:16px 0 8px;">
          <a href="mailto:${escapeHtml(data.requesterEmail)}" style="background-color:#D97706;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block;">Reply to ${escapeHtml(data.requesterName)}</a>
        </div>
      </div>
      <p style="color:#94A3B8;font-size:11px;text-align:center;margin-top:12px;">SchoolStack Budget — Advisor Brief</p>
    </div>
  `;

  const subjectPrefix = priority === "high" ? "⚠ " : "";
  const subjectSource = isPublic ? " [Public]" : "";

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [notifyEmail],
      replyTo: data.requesterEmail,
      subject: `${subjectPrefix}Review Brief: ${data.schoolName} (${data.state})${subjectSource}`,
      html,
    });
    if (error) {
      console.error("[mailer] Team notification error:", error);
      return { success: false, error: "Failed to send notification." };
    }
    return { success: true };
  } catch (err) {
    console.error("[mailer] Team notification failed:", err);
    return { success: false, error: "Failed to send notification." };
  }
}

export async function sendReviewConfirmation(toEmail: string, requesterName: string, schoolName: string): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;

  if (!resend || !fromAddress) {
    return { success: false, error: "Email service is not configured." };
  }

  const html = `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;">We received your review request</h2>
      <p style="color:#475569;line-height:1.6;">
        Hi ${escapeHtml(requesterName)},
      </p>
      <p style="color:#475569;line-height:1.6;">
        We've received your request to review the financial model for <strong>${escapeHtml(schoolName)}</strong>. Our team will look it over and get back to you within <strong>5–7 business days</strong>.
      </p>
      <p style="color:#475569;line-height:1.6;">
        In the meantime, feel free to continue refining your model — any changes you make will be reflected when we review it.
      </p>
      <p style="color:#475569;line-height:1.6;margin-bottom:0;">
        Thanks for using SchoolStack Budget.
      </p>
      <p style="color:#475569;line-height:1.6;margin-top:4px;">
        — The SchoolStack Team
      </p>
      <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;" />
      <p style="color:#94A3B8;font-size:12px;">SchoolStack Budget by SchoolStack.ai</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [toEmail],
      subject: `Review request received — ${schoolName}`,
      html,
      text: `Hi ${requesterName},\n\nWe've received your request to review the financial model for ${schoolName}. Our team will look it over and get back to you within 5-7 business days.\n\nThanks for using SchoolStack Budget.\n— The SchoolStack Team`,
    });
    if (error) {
      console.error("[mailer] Confirmation error:", error);
      return { success: false, error: "Failed to send confirmation." };
    }
    return { success: true };
  } catch (err) {
    console.error("[mailer] Confirmation failed:", err);
    return { success: false, error: "Failed to send confirmation." };
  }
}

export interface ReviewFeedbackData {
  recipientName: string;
  recipientEmail: string;
  schoolName: string;
  strengths: string;
  watchItems: string;
  recommendations: string;
  metrics: {
    y1Revenue: number;
    y1NetMargin: number;
    dscr: number;
    cashRunwayMonths: number;
    lenderReadiness: string;
  };
  dashboardUrl?: string;
}

function nl2br(str: string): string {
  return escapeHtml(str).replace(/\n/g, "<br/>");
}

export async function sendReviewFeedback(data: ReviewFeedbackData): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;

  if (!resend || !fromAddress) {
    return { success: false, error: "Email service is not configured." };
  }

  const firstName = data.recipientName.split(" ")[0] || data.recipientName;

  const metricsTable = `
    <table style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;">Year 1 Revenue</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#1E293B;font-weight:600;text-align:right;font-size:14px;">${fmtCurrency(data.metrics.y1Revenue)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;">Year 1 Net Margin</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#1E293B;font-weight:600;text-align:right;font-size:14px;">${(data.metrics.y1NetMargin * 100).toFixed(1)}%</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;">DSCR (Debt Service Coverage)</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#1E293B;font-weight:600;text-align:right;font-size:14px;">${data.metrics.dscr.toFixed(2)}x</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;">Cash Runway</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#1E293B;font-weight:600;text-align:right;font-size:14px;">${data.metrics.cashRunwayMonths} months</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;color:#475569;font-size:14px;">Lending Readiness</td>
        <td style="padding:8px 12px;color:#1E293B;font-weight:600;text-align:right;font-size:14px;">${escapeHtml(data.metrics.lenderReadiness)}</td>
      </tr>
    </table>
  `;

  const sections: string[] = [];

  if (data.strengths.trim()) {
    sections.push(`
      <div style="margin-bottom:24px;">
        <div style="font-family:'Quicksand',Arial,sans-serif;font-weight:700;font-size:15px;color:#328555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;border-bottom:2px solid #328555;padding-bottom:4px;">What looks strong</div>
        <p style="color:#475569;line-height:1.7;font-size:15px;margin:0;">${nl2br(data.strengths)}</p>
      </div>
    `);
  }

  if (data.watchItems.trim()) {
    sections.push(`
      <div style="margin-bottom:24px;">
        <div style="font-family:'Quicksand',Arial,sans-serif;font-weight:700;font-size:15px;color:#D97706;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;border-bottom:2px solid #D97706;padding-bottom:4px;">What to keep an eye on</div>
        <p style="color:#475569;line-height:1.7;font-size:15px;margin:0;">${nl2br(data.watchItems)}</p>
      </div>
    `);
  }

  if (data.recommendations.trim()) {
    sections.push(`
      <div style="margin-bottom:24px;">
        <div style="font-family:'Quicksand',Arial,sans-serif;font-weight:700;font-size:15px;color:#0D9488;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;border-bottom:2px solid #0D9488;padding-bottom:4px;">Our recommendations</div>
        <p style="color:#475569;line-height:1.7;font-size:15px;margin:0;">${nl2br(data.recommendations)}</p>
      </div>
    `);
  }

  const html = `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;">
      <div style="background:#1E293B;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center;margin-bottom:0;">
        <span style="color:#328555;font-family:'Quicksand',Arial,sans-serif;font-size:18px;font-weight:700;">SchoolStack</span>
        <span style="color:white;font-family:'Quicksand',Arial,sans-serif;font-size:18px;font-weight:700;"> Budget</span>
      </div>
      <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:32px 24px;">
        <p style="color:#1E293B;font-size:16px;line-height:1.6;margin-top:0;">
          Hi ${escapeHtml(firstName)},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;">
          Thank you for sharing your financial model with us. We've reviewed <strong>${escapeHtml(data.schoolName)}</strong>'s 5-year plan, and here's what we found.
        </p>

        ${sections.join("")}

        <div style="margin:28px 0;background:#FAF9F7;border-radius:12px;padding:20px;">
          <div style="font-family:'Quicksand',Arial,sans-serif;font-weight:700;font-size:15px;color:#1E293B;margin-bottom:12px;">Your key numbers at a glance</div>
          ${metricsTable}
        </div>

        <div style="margin-bottom:24px;">
          <div style="font-family:'Quicksand',Arial,sans-serif;font-weight:700;font-size:15px;color:#1E293B;margin-bottom:8px;">What's next</div>
          <p style="color:#475569;line-height:1.7;font-size:15px;margin:0;">
            Your model is saved in your SchoolStack Budget dashboard. You can update your assumptions anytime and re-run your analysis.
          </p>
          ${data.dashboardUrl ? `
          <div style="margin:16px 0;">
            <a href="${escapeHtml(data.dashboardUrl)}" style="display:inline-block;background:#328555;color:white;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;font-family:'Quicksand',Arial,sans-serif;">Open My Dashboard</a>
          </div>
          ` : ""}
          <p style="color:#475569;line-height:1.7;font-size:15px;margin:12px 0 0 0;">
            If you have questions about this review or want to talk through your plan, just reply to this email — we read every one.
          </p>
        </div>

        <p style="color:#1E293B;font-size:15px;line-height:1.6;margin-bottom:0;">
          Wishing you the best,
        </p>
        <p style="color:#1E293B;font-size:15px;font-weight:600;margin-top:4px;">
          The SchoolStack Team
        </p>
      </div>
      <div style="text-align:center;padding:16px 0;">
        <p style="color:#94A3B8;font-size:12px;margin:0;">SchoolStack Budget by SchoolStack.ai</p>
      </div>
    </div>
  `;

  const plainSections: string[] = [];
  if (data.strengths.trim()) plainSections.push(`WHAT LOOKS STRONG\n${data.strengths}\n`);
  if (data.watchItems.trim()) plainSections.push(`WHAT TO KEEP AN EYE ON\n${data.watchItems}\n`);
  if (data.recommendations.trim()) plainSections.push(`OUR RECOMMENDATIONS\n${data.recommendations}\n`);

  const text = [
    `Hi ${firstName},`,
    "",
    `Thank you for sharing your financial model with us. We've reviewed ${data.schoolName}'s 5-year plan, and here's what we found.`,
    "",
    ...plainSections,
    "YOUR KEY NUMBERS AT A GLANCE",
    `Year 1 Revenue: ${fmtCurrency(data.metrics.y1Revenue)}`,
    `Year 1 Net Margin: ${(data.metrics.y1NetMargin * 100).toFixed(1)}%`,
    `DSCR (Debt Service Coverage): ${data.metrics.dscr.toFixed(2)}x`,
    `Cash Runway: ${data.metrics.cashRunwayMonths} months`,
    `Lending Readiness: ${data.metrics.lenderReadiness}`,
    "",
    "WHAT'S NEXT",
    "Your model is saved in your SchoolStack Budget dashboard. You can update your assumptions anytime and re-run your analysis.",
    ...(data.dashboardUrl ? ["", `Open your dashboard: ${data.dashboardUrl}`] : []),
    "",
    "If you have questions about this review or want to talk through your plan, just reply to this email — we read every one.",
    "",
    "Wishing you the best,",
    "The SchoolStack Team",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [data.recipientEmail],
      subject: `Your SchoolStack Budget Review — ${data.schoolName}`,
      html,
      text,
      replyTo: fromAddress,
    });
    if (error) {
      console.error("[mailer] Review feedback error:", error);
      return { success: false, error: "Failed to send review feedback." };
    }
    return { success: true };
  } catch (err) {
    console.error("[mailer] Review feedback failed:", err);
    return { success: false, error: "Failed to send review feedback." };
  }
}

// --- Accounting connection error notification -----------------------------
// Sent by the daily background sync when a connection transitions from
// `connected` to `error`. The founder won't see the in-app banner unless they
// happen to visit the scenarios page, so we proactively email them with the
// truncated provider error and a deep link straight to the reconnect button.

export interface AccountingConnectionErrorEmailData {
  toEmail: string;
  recipientName: string;
  // Display label for the provider, e.g. "QuickBooks" or "Xero".
  providerLabel: string;
  // School / model name the connection belongs to. Used in the subject line
  // and copy so a founder with multiple models knows which one needs action.
  schoolName: string;
  // Raw provider error message; we truncate inside this helper to keep the
  // template safe regardless of upstream length.
  errorMessage: string;
  // Deep link to the scenarios page where the reconnect button lives.
  reconnectUrl: string;
}

const ERROR_MESSAGE_MAX = 200;

export async function sendAccountingConnectionErrorEmail(
  data: AccountingConnectionErrorEmailData,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;
  if (!resend || !fromAddress) {
    return { success: false, error: "Email service is not configured." };
  }

  const firstName =
    (data.recipientName || "").trim().split(/\s+/)[0] || "there";
  const truncatedError =
    data.errorMessage.length > ERROR_MESSAGE_MAX
      ? data.errorMessage.slice(0, ERROR_MESSAGE_MAX - 1).trimEnd() + "…"
      : data.errorMessage;

  const html = `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
      <div style="background:#1E293B;border-radius:12px 12px 0 0;padding:18px 24px;text-align:center;">
        <span style="color:#328555;font-family:'Quicksand',Arial,sans-serif;font-size:18px;font-weight:700;">SchoolStack</span>
        <span style="color:white;font-family:'Quicksand',Arial,sans-serif;font-size:18px;font-weight:700;"> Budget</span>
      </div>
      <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px;">
        <h2 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;font-size:18px;margin:0 0 12px;">
          Your ${escapeHtml(data.providerLabel)} connection needs attention
        </h2>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 14px;">
          Hi ${escapeHtml(firstName)},
        </p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 14px;">
          We weren't able to sync the latest actuals from <strong>${escapeHtml(data.providerLabel)}</strong> for
          <strong>${escapeHtml(data.schoolName)}</strong> during today's background refresh. Until the connection is
          restored, the live-data badge on your scenarios page will keep showing the last successful snapshot.
        </p>
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin:0 0 20px;">
          <div style="color:#991B1B;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Provider error</div>
          <div style="color:#1E293B;font-size:13px;line-height:1.5;font-family:'Menlo',Consolas,monospace;">${escapeHtml(truncatedError)}</div>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${escapeHtml(data.reconnectUrl)}" style="background:#D97706;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;font-family:'Quicksand',Arial,sans-serif;">Reconnect ${escapeHtml(data.providerLabel)}</a>
        </div>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
          Most disconnections happen when the access token expires after a long break. Reconnecting takes about 30
          seconds and will restore daily syncs automatically.
        </p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:14px 0 0;">
          — The SchoolStack Team
        </p>
      </div>
      <div style="text-align:center;padding:14px 0;">
        <p style="color:#94A3B8;font-size:12px;margin:0;">SchoolStack Budget by SchoolStack.ai</p>
      </div>
    </div>
  `;

  const text = [
    `Hi ${firstName},`,
    "",
    `We weren't able to sync the latest actuals from ${data.providerLabel} for ${data.schoolName} during today's background refresh.`,
    "",
    `Provider error: ${truncatedError}`,
    "",
    `Reconnect ${data.providerLabel}: ${data.reconnectUrl}`,
    "",
    "Most disconnections happen when the access token expires after a long break. Reconnecting takes about 30 seconds and will restore daily syncs automatically.",
    "",
    "— The SchoolStack Team",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [data.toEmail],
      subject: `Action needed: reconnect ${data.providerLabel} for ${data.schoolName}`,
      html,
      text,
    });
    if (error) {
      console.error("[mailer] Accounting connection error email failed:", error);
      return { success: false, error: "Failed to send connection error email." };
    }
    return { success: true };
  } catch (err) {
    console.error("[mailer] Accounting connection error email threw:", err);
    return { success: false, error: "Failed to send connection error email." };
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;
  if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
    console.error("[mailer] FATAL: APP_URL is required in production to generate reset links");
    return { success: false, error: "Server configuration error." };
  }
  const appUrl = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined);
  if (!appUrl) {
    console.error("[mailer] Cannot generate reset link: neither APP_URL nor REPLIT_DEV_DOMAIN is set");
    return { success: false, error: "Server configuration error." };
  }
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  if (!resend) {
    console.error(
      `[mailer] Resend not configured - password reset email not sent. ` +
      `Set RESEND_API_KEY to enable.`,
    );
    return { success: false, error: "Email service is not configured. Please contact support." };
  }

  if (!fromAddress) {
    console.error(
      `[mailer] EMAIL_FROM not set - cannot send email. ` +
      `Set EMAIL_FROM to a verified domain sender (e.g. noreply@schoolstack.ai).`,
    );
    return { success: false, error: "Email sender is not configured. Please contact support." };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [toEmail],
      subject: "Reset your SchoolStack Budget password",
      text: [
        "Hi,",
        "",
        "You requested a password reset for your SchoolStack Budget account.",
        "",
        `Click this link to reset your password (valid for 1 hour):`,
        resetUrl,
        "",
        "If you did not request this, you can safely ignore this email.",
        "",
        " - The SchoolStack Budget Team",
      ].join("\n"),
      html: `
        <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1E293B; font-family: 'Quicksand', Arial, sans-serif;">Reset your password</h2>
          <p style="color: #475569; line-height: 1.6;">
            You requested a password reset for your SchoolStack Budget account.
            Click the button below to create a new password. This link is valid for 1 hour.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background-color: #D97706; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #94A3B8; font-size: 13px;">
            If you did not request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
          <p style="color: #94A3B8; font-size: 12px;">SchoolStack Budget by SchoolStack.ai</p>
        </div>
      `,
    });

    if (error) {
      console.error("[mailer] Resend error:", error);
      return { success: false, error: "Failed to send reset email. Please try again." };
    }

    if (process.env.NODE_ENV !== "production") console.log(`[mailer] Password reset email sent to ${toEmail} (id: ${data?.id})`);
    return { success: true };
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err);
    return { success: false, error: "Failed to send reset email. Please try again." };
  }
}
