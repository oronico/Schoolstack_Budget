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
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">State</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.state)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Type</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.schoolType)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Entity</td><td style="color:#1E293B;font-size:13px;">${escapeHtml(data.entityType)}</td></tr>
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Enrollment Y1→Y5</td><td style="color:#1E293B;font-size:13px;">${data.enrollment.map(e => e.toLocaleString()).join(" → ")}</td></tr>
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
        We've received your request to review the financial model for <strong>${escapeHtml(schoolName)}</strong>. Our team will look it over and get back to you within <strong>2 business days</strong>.
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
      text: `Hi ${requesterName},\n\nWe've received your request to review the financial model for ${schoolName}. Our team will look it over and get back to you within 2 business days.\n\nThanks for using SchoolStack Budget.\n— The SchoolStack Team`,
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

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;
  const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost:3000"}`;
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

    console.log(`[mailer] Password reset email sent to ${toEmail} (id: ${data?.id})`);
    return { success: true };
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err);
    return { success: false, error: "Failed to send reset email. Please try again." };
  }
}
