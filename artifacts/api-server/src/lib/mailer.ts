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
  criticalFindings: string[];
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function yearRow(label: string, values: number[], formatter: (n: number) => string = fmtCurrency): string {
  return `<tr><td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#1E293B;">${label}</td>${values.map(v => `<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;text-align:right;color:#475569;">${formatter(v)}</td>`).join("")}</tr>`;
}

export async function sendReviewRequestToTeam(data: ReviewRequestData): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM;
  const notifyEmail = process.env.REVIEW_NOTIFY_EMAIL || fromAddress;

  if (!resend || !fromAddress || !notifyEmail) {
    return { success: false, error: "Email service is not configured." };
  }

  const yearHeaders = data.enrollment.map((_, i) => `<th style="padding:6px 12px;border-bottom:2px solid #D97706;text-align:right;color:#1E293B;">Year ${i + 1}</th>`).join("");
  const findingsHtml = data.criticalFindings.length > 0
    ? `<div style="background:#FEF3C7;border-left:4px solid #D97706;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong style="color:#92400E;">Diagnostics Findings:</strong><ul style="margin:8px 0 0;padding-left:18px;color:#92400E;">${data.criticalFindings.map(f => `<li>${f}</li>`).join("")}</ul></div>`
    : "";

  const html = `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:640px;margin:0 auto;padding:32px;">
      <div style="background:#1E293B;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#FFFFFF;margin:0;font-family:'Quicksand',Arial,sans-serif;">Model Review Request</h2>
      </div>
      <div style="border:1px solid #E2E8F0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="color:#475569;line-height:1.6;margin-top:0;"><strong>${escapeHtml(data.requesterName)}</strong> (${escapeHtml(data.requesterEmail)}) has requested a review of their financial model.</p>
        ${data.message ? `<div style="background:#F8FAFC;border-radius:6px;padding:12px 16px;margin:12px 0;"><p style="color:#475569;margin:0;font-style:italic;">"${escapeHtml(data.message)}"</p></div>` : ""}
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;">School Profile</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
          <tr><td style="padding:4px 0;color:#94A3B8;width:140px;">School</td><td style="color:#1E293B;font-weight:600;">${escapeHtml(data.schoolName)}</td></tr>
          <tr><td style="padding:4px 0;color:#94A3B8;">State</td><td style="color:#1E293B;">${escapeHtml(data.state)}</td></tr>
          <tr><td style="padding:4px 0;color:#94A3B8;">Type</td><td style="color:#1E293B;">${escapeHtml(data.schoolType)}</td></tr>
          <tr><td style="padding:4px 0;color:#94A3B8;">Entity</td><td style="color:#1E293B;">${escapeHtml(data.entityType)}</td></tr>
        </table>
        <h3 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;border-bottom:2px solid #D97706;padding-bottom:4px;">5-Year Summary</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px;">
          <thead><tr><th style="padding:6px 12px;border-bottom:2px solid #D97706;text-align:left;color:#1E293B;">Metric</th>${yearHeaders}</tr></thead>
          <tbody>
            ${yearRow("Enrollment", data.enrollment, n => n.toLocaleString())}
            ${yearRow("Revenue", data.revenue)}
            ${yearRow("Expenses", data.expenses)}
            ${yearRow("Net Income", data.netIncome)}
            ${yearRow("DSCR", data.dscr, n => n > 0 ? n.toFixed(2) + "x" : "N/A")}
          </tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
          <tr><td style="padding:4px 0;color:#94A3B8;width:180px;">Reserve Months</td><td style="color:#1E293B;font-weight:600;">${data.reserveMonths.toFixed(1)}</td></tr>
          <tr><td style="padding:4px 0;color:#94A3B8;">Cash Runway</td><td style="color:#1E293B;font-weight:600;">${data.cashRunwayMonths >= 60 ? "60+ months" : data.cashRunwayMonths.toFixed(1) + " months"}</td></tr>
          <tr><td style="padding:4px 0;color:#94A3B8;">Days Cash on Hand</td><td style="color:#1E293B;font-weight:600;">${Math.round(data.daysCashOnHand)} days</td></tr>
        </table>
        ${findingsHtml}
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="mailto:${escapeHtml(data.requesterEmail)}" style="background-color:#D97706;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reply to ${escapeHtml(data.requesterName)}</a>
        </div>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin-top:16px;">SchoolStack Budget by SchoolStack.ai</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [notifyEmail],
      replyTo: data.requesterEmail,
      subject: `Model Review Request: ${data.schoolName} (${data.state})`,
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
