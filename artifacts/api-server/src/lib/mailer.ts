import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  resendClient = new Resend(apiKey);
  return resendClient;
}

function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

function isPostmarkConfigured(): boolean {
  return !!process.env.POSTMARK_SERVER_TOKEN && !!process.env.EMAIL_FROM;
}

export function isEmailConfigured(): boolean {
  return isResendConfigured() || isPostmarkConfigured();
}

// Task #533 + #543 — env-driven email adapter. Real providers wired up
// today are Resend (RESEND_API_KEY + EMAIL_FROM) and Postmark
// (POSTMARK_SERVER_TOKEN + EMAIL_FROM). The adapter shape lets us swap
// between them — or add SendGrid / SES later — without touching every
// `sendVerifyEmail` / `sendPasswordResetEmail` / `sendReview*` call site.
// The transactional senders below all route through
// `deliverTransactionalEmail` so:
//
//   - production w/ provider:   email is actually sent
//   - production w/o provider:  hard error (return success:false) so the
//                               caller / monitoring sees something is
//                               misconfigured instead of silently dropping
//                               founders' verification links
//   - dev/test w/o provider:    URL is printed to the workspace console
//                               (the documented dev fallback) and we
//                               return success:true so fire-and-forget
//                               callers don't log spurious "failure"
//                               errors during local development
//
// Selection rules for `EMAIL_PROVIDER`:
//   - explicit "resend" | "postmark" | "console" wins (handy for ops
//     failover and for forcing the dev logger from staging / tests)
//   - auto-detect prefers Resend when both providers' creds are set
//     (preserves the historical default), else picks whichever real
//     provider is configured, else falls back to the console logger.
//
// Ops failover / A-B (documented in replit.md): if Resend has an outage
// or a deliverability problem, set EMAIL_PROVIDER=postmark on the API
// server (POSTMARK_SERVER_TOKEN + EMAIL_FROM must be present) and
// restart — every sender re-routes without a code change.
export type EmailProvider = "resend" | "postmark" | "console";

export function getConfiguredEmailProvider(): EmailProvider {
  // Explicit override wins (useful for tests / forcing the dev logger /
  // ops swapping providers without a code change).
  const explicit = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (explicit === "console") return "console";
  if (explicit === "resend") return "resend";
  if (explicit === "postmark") return "postmark";
  // Auto-detect. Resend wins ties so existing deployments don't change
  // behaviour just because POSTMARK_SERVER_TOKEN was added alongside.
  if (isResendConfigured()) return "resend";
  if (isPostmarkConfigured()) return "postmark";
  return "console";
}

export interface TransactionalEmail {
  to: string;
  subject: string;
  /**
   * Optional plain-text body. Some templates (e.g. the rich advisor-review
   * brief sent to the team inbox) ship HTML only.
   */
  text?: string;
  html: string;
  /**
   * Short label included in the dev-fallback console output so a developer
   * scanning logs can immediately tell which template fired (verify-email,
   * account-already-exists, password-reset, review-request-team, ...).
   */
  kind: string;
  /**
   * The clickable URL embedded in the email body, surfaced in the dev
   * fallback log so a developer can paste it into a browser without
   * having to render the HTML.
   */
  primaryUrl?: string;
  /**
   * Optional Reply-To header. The advisor-review team brief uses this so
   * a reviewer hitting "Reply" lands in the founder's inbox rather than
   * the no-reply From address.
   */
  replyTo?: string;
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
  /** "resend" when actually sent, "console" when the dev fallback fired. */
  provider?: EmailProvider;
}

export async function deliverTransactionalEmail(
  email: TransactionalEmail,
): Promise<DeliveryResult> {
  const provider = getConfiguredEmailProvider();
  const fromAddress = process.env.EMAIL_FROM;

  if (provider === "resend" && fromAddress) {
    const resend = getResend();
    if (!resend) {
      // Belt-and-suspenders: getConfiguredEmailProvider only returns
      // "resend" when isResendConfigured() is true, so this branch is
      // unreachable today, but we keep the guard so a future change to
      // EMAIL_PROVIDER=resend without an API key fails loudly.
      console.error(`[mailer] ${email.kind}: provider=resend but Resend client is null`);
      return { success: false, error: "Email service is not configured.", provider };
    }
    try {
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: [email.to],
        subject: email.subject,
        ...(email.text !== undefined ? { text: email.text } : {}),
        html: email.html,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      });
      if (error) {
        console.error(`[mailer] ${email.kind} send error:`, error);
        return { success: false, error: `Failed to send ${email.kind} email.`, provider };
      }
      if (process.env.NODE_ENV !== "production") {
        console.log(`[mailer] ${email.kind} sent to ${email.to} (id: ${data?.id})`);
      }
      return { success: true, provider };
    } catch (err) {
      console.error(`[mailer] ${email.kind} send failed:`, err);
      return { success: false, error: `Failed to send ${email.kind} email.`, provider };
    }
  }

  if (provider === "postmark" && fromAddress) {
    // Postmark is a plain HTTPS API — we use global `fetch` directly so
    // we don't pull in another SDK / lockfile entry just to act as an
    // ops-side failover for Resend. Auth is a single header
    // (X-Postmark-Server-Token); a 200 response carries `MessageID`,
    // anything else is treated as a send failure consistent with the
    // Resend branch above.
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      // Mirrors the Resend "client is null" guard: explicit
      // EMAIL_PROVIDER=postmark without the server token must fail loudly
      // rather than silently dropping the message.
      console.error(`[mailer] ${email.kind}: provider=postmark but POSTMARK_SERVER_TOKEN is not set`);
      return { success: false, error: "Email service is not configured.", provider };
    }
    try {
      const body: Record<string, string> = {
        From: fromAddress,
        To: email.to,
        Subject: email.subject,
        HtmlBody: email.html,
        // Every Postmark server ships with a default "outbound" stream;
        // POSTMARK_MESSAGE_STREAM lets ops point at a custom stream
        // (e.g. a separate broadcast/transactional split) without code
        // changes.
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
      };
      if (email.text !== undefined) body.TextBody = email.text;
      if (email.replyTo) body.ReplyTo = email.replyTo;

      const resp = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.error(`[mailer] ${email.kind} postmark send error:`, resp.status, detail);
        return { success: false, error: `Failed to send ${email.kind} email.`, provider };
      }
      if (process.env.NODE_ENV !== "production") {
        const data = (await resp.json().catch(() => ({}))) as { MessageID?: string };
        console.log(`[mailer] ${email.kind} sent to ${email.to} via Postmark (id: ${data.MessageID ?? "?"})`);
      }
      return { success: true, provider };
    } catch (err) {
      console.error(`[mailer] ${email.kind} postmark send failed:`, err);
      return { success: false, error: `Failed to send ${email.kind} email.`, provider };
    }
  }

  // No real provider available. In production this is an outage we want
  // to surface; in dev we fall back to the console logger so engineers
  // can copy the verification / reset URL out of the workspace logs.
  if (process.env.NODE_ENV === "production") {
    console.error(
      `[mailer] FATAL: ${email.kind} could not be sent — ` +
        `set RESEND_API_KEY and EMAIL_FROM (or POSTMARK_SERVER_TOKEN and EMAIL_FROM) ` +
        `(provider=${provider}, from=${fromAddress ? "set" : "unset"})`,
    );
    return { success: false, error: "Email service is not configured.", provider };
  }

  // Graceful dev fallback. console.warn (not error) so it stays visible
  // without polluting error budgets, and we return success:true so
  // fire-and-forget callers don't log spurious "send failed" lines just
  // because no provider creds are set on a developer's machine.
  console.warn(
    `[mailer:dev] ${email.kind} → ${email.to}` +
      (email.replyTo ? `\n         reply-to: ${email.replyTo}` : "") +
      (email.primaryUrl ? `\n         link: ${email.primaryUrl}` : "") +
      `\n         (no email provider configured; set RESEND_API_KEY+EMAIL_FROM or POSTMARK_SERVER_TOKEN+EMAIL_FROM to send for real)`,
  );
  return { success: true, provider: "console" };
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
  isSingleYear?: boolean;
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

export interface RenderedReviewRequest {
  subject: string;
  html: string;
  priority: "high" | "standard";
}

/**
 * Pure renderer for the advisor brief email. Exported so single-year /
 * five-year template behaviour can be asserted without going through Resend.
 */
export function renderReviewRequestEmail(data: ReviewRequestData): RenderedReviewRequest {
  const priority = determinePriority(data);
  const isSingleYear = data.isSingleYear === true;
  // Break-even must be Y1-only in single-year mode. `findBreakEvenYear`
  // scans all five entries; the engine zero-pads Y2-Y5 for single-year
  // models and a zero net income reads as "broke even", which would
  // surface as a phantom "Year 2" break-even in the brief.
  const breakEven = isSingleYear
    ? ((data.netIncome[0] ?? 0) >= 0 ? 1 : null)
    : (data.breakEvenYear ?? findBreakEvenYear(data.netIncome));
  const source = data.source || "authenticated";
  const isPublic = source === "public";

  const y1Rev = data.revenue[0] || 0;
  const y1Exp = data.expenses[0] || 0;
  const y1Margin = y1Rev > 0 ? ((y1Rev - y1Exp) / y1Rev * 100).toFixed(1) : "0.0";
  // Single-year models keep length-5 arrays for engine compatibility but only
  // Y1 reflects what the founder actually entered. Anchor the headline rev /
  // net-income on Y1 (and label them Y1) so advisors don't read the phantom
  // zero-padded Y5 entry as the school's projected fifth year.
  const headlineYearLabel = isSingleYear ? "Y1" : "Y5";
  const headlineRev = isSingleYear ? y1Rev : (data.revenue[data.revenue.length - 1] || 0);
  const headlineNI = isSingleYear ? (data.netIncome[0] || 0) : (data.netIncome[data.netIncome.length - 1] || 0);

  const priorityBadge = priority === "high"
    ? `<div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:6px;padding:8px 16px;margin-bottom:16px;text-align:center;"><span style="color:#DC2626;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">⚠ High Priority Review</span></div>`
    : `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 16px;margin-bottom:16px;text-align:center;"><span style="color:#16A34A;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Standard Review</span></div>`;

  const sourceBadge = isPublic
    ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:8px 16px;margin-bottom:16px;"><span style="color:#92400E;font-size:13px;">📋 <strong>Public wizard user</strong> — this person has not created an account yet.</span></div>`
    : "";

  // Single-year models render the rollup as Y1 only. Five-year models render
  // every year present in the array (typically 5).
  const yearCount = isSingleYear ? 1 : data.enrollment.length;
  const yearHeaders = Array.from({ length: yearCount }, (_, i) => `<th style="padding:6px 10px;border-bottom:2px solid #D97706;text-align:right;color:#1E293B;font-size:12px;">Y${i + 1}</th>`).join("");

  function yearRow(label: string, values: number[], formatter: (n: number) => string = fmtCurrency): string {
    const sliced = values.slice(0, yearCount);
    return `<tr><td style="padding:5px 10px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#1E293B;font-size:13px;">${label}</td>${sliced.map(v => `<td style="padding:5px 10px;border-bottom:1px solid #E2E8F0;text-align:right;color:#475569;font-size:13px;">${formatter(v)}</td>`).join("")}</tr>`;
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
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">${data.isSingleYear === true ? "Enrollment Y1" : "Enrollment Y1→Y5"}</td><td style="color:#1E293B;font-size:13px;">${data.isSingleYear === true ? (data.enrollment[0] ?? 0).toLocaleString() : data.enrollment.map(e => e.toLocaleString()).join(" → ")}</td></tr>
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
          ${isSingleYear
            ? `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Y1 Net Income</td><td style="color:#1E293B;font-weight:600;font-size:13px;" colspan="3">${fmtCurrency(headlineNI)}</td></tr>`
            : `<tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">${headlineYearLabel} Revenue</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${fmtCurrency(headlineRev)}</td><td style="padding:3px 0;color:#94A3B8;font-size:13px;">${headlineYearLabel} Net Income</td><td style="color:#1E293B;font-weight:600;font-size:13px;">${fmtCurrency(headlineNI)}</td></tr>`}
          <tr><td style="padding:3px 0;color:#94A3B8;font-size:13px;">Break-even</td><td style="color:#1E293B;font-weight:600;font-size:13px;" colspan="3">${breakEven ? `Year ${breakEven}` : (isSingleYear ? "Not reached in Year 1" : "Not within projection")}</td></tr>
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
  const subject = `${subjectPrefix}Review Brief: ${data.schoolName} (${data.state})${subjectSource}`;

  return { subject, html, priority };
}

export async function sendReviewRequestToTeam(data: ReviewRequestData): Promise<{ success: boolean; error?: string }> {
  const { subject, html } = renderReviewRequestEmail(data);
  // Resolve the team inbox. In production w/ a real provider, EMAIL_FROM
  // is required (deliverTransactionalEmail will surface the outage if it
  // is missing), so notifyEmail will fall back to it. The placeholder is
  // only ever hit in pure-dev runs where neither env var is set, and it
  // exists purely so the dev-fallback console line still reads cleanly.
  const notifyEmail =
    process.env.REVIEW_NOTIFY_EMAIL || process.env.EMAIL_FROM || "team@unconfigured.local";

  const result = await deliverTransactionalEmail({
    kind: "review-request-team",
    to: notifyEmail,
    subject,
    html,
    replyTo: data.requesterEmail,
    primaryUrl: data.sharedViewUrl,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send notification." };
  }
  return { success: true };
}

export async function sendReviewConfirmation(toEmail: string, requesterName: string, schoolName: string): Promise<{ success: boolean; error?: string }> {
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

  const result = await deliverTransactionalEmail({
    kind: "review-confirmation",
    to: toEmail,
    subject: `Review request received — ${schoolName}`,
    html,
    text: `Hi ${requesterName},\n\nWe've received your request to review the financial model for ${schoolName}. Our team will look it over and get back to you within 5-7 business days.\n\nThanks for using SchoolStack Budget.\n— The SchoolStack Team`,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send confirmation." };
  }
  return { success: true };
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

  const result = await deliverTransactionalEmail({
    kind: "review-feedback",
    to: data.recipientEmail,
    subject: `Your SchoolStack Budget Review — ${data.schoolName}`,
    html,
    text,
    primaryUrl: data.dashboardUrl,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send review feedback." };
  }
  return { success: true };
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = resolveAppUrl();
  if (!appUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mailer] FATAL: APP_URL is required in production to generate reset links");
    } else {
      console.error("[mailer] Cannot generate reset link: neither APP_URL nor REPLIT_DEV_DOMAIN is set");
    }
    return { success: false, error: "Server configuration error." };
  }
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  const result = await deliverTransactionalEmail({
    kind: "password-reset",
    to: toEmail,
    primaryUrl: resetUrl,
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
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send reset email. Please try again." };
  }
  return { success: true };
}

// Task #527 — confirm-by-email signup. Two new templates:
//   - sendVerifyEmail:           sent to NEW emails. The link inside POSTs
//                                to /auth/verify-email which provisions the
//                                user and logs them in.
//   - sendAccountAlreadyExistsEmail: sent when somebody tries to register
//                                with an address that already has an
//                                account. Includes a password-reset link
//                                so a confused founder can recover. The
//                                attacker who hit /auth/register sees the
//                                same generic 202 either way (only the
//                                inbox owner sees the truth).
function resolveAppUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return null;
}

export async function sendVerifyEmail(
  toEmail: string,
  verifyToken: string,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = resolveAppUrl();
  if (!appUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mailer] FATAL: APP_URL is required in production to generate verify-email links");
    } else {
      console.error("[mailer] Cannot generate verify-email link: neither APP_URL nor REPLIT_DEV_DOMAIN is set");
    }
    return { success: false, error: "Server configuration error." };
  }
  const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`;

  const result = await deliverTransactionalEmail({
    kind: "verify-email",
    to: toEmail,
    primaryUrl: verifyUrl,
    subject: "Confirm your SchoolStack Budget account",
    text: [
      "Welcome to SchoolStack Budget!",
      "",
      "Click the link below to confirm your email and finish creating your account (valid for 1 hour):",
      verifyUrl,
      "",
      "If you did not request this, you can safely ignore this email.",
      "",
      " - The SchoolStack Budget Team",
    ].join("\n"),
    html: `
      <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;">Confirm your email</h2>
        <p style="color:#475569;line-height:1.6;">
          Welcome to SchoolStack Budget. Click the button below to finish creating your account. This link is valid for 1 hour.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${verifyUrl}" style="background-color:#D97706;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Confirm Email</a>
        </div>
        <p style="color:#475569;line-height:1.6;font-size:13px;">
          If the button doesn't work, paste this URL into your browser:<br/>
          <span style="word-break:break-all;color:#1E293B;">${verifyUrl}</span>
        </p>
        <p style="color:#475569;line-height:1.6;">
          If you did not request this, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;" />
        <p style="color:#94A3B8;font-size:12px;">SchoolStack Budget by SchoolStack.ai</p>
      </div>
    `,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send verification email." };
  }
  return { success: true };
}

// Task #552 — new-user welcome email. Fired fire-and-forget after
// /auth/verify-email successfully provisions the account, so it shares
// the verify-email / password-reset flow's adapter semantics:
//   - prod w/ provider:  Resend delivers the welcome email
//   - prod w/o provider: console.error + success:false (caller already
//                         logs "welcome email failed" but does not block
//                         the founder's first login)
//   - dev w/o provider:  console.warn with the dashboard link surfaced
//                         so a developer scanning workspace logs can
//                         tell which template fired and where it would
//                         have pointed
// Like the other senders in this file, we resolve APP_URL via the same
// helper so the dashboard link works locally (REPLIT_DEV_DOMAIN) as
// well as in production (APP_URL).
//
// Task #557 — branch the welcome on what we already know about the
// founder. /auth/register optionally captures `planningStage` (e.g.
// "planning", "exploring", "operating") and `profileRole` (e.g.
// "founder", "head of school"). Using that signal we route the founder
// to the most relevant first action instead of dropping them on the
// dashboard root with three generic bullets:
//
//   - yet-to-launch  → "Build my Year-1 model"
//                       deep-link: /model/new?stage=new_school
//   - operating      → "Import my existing actuals"
//                       deep-link: /model/new?stage=operating_school
//   - default        → "Start my financial model"
//                       deep-link: /model/new
//
// The branch is purely additive: when we have no signal we still send a
// useful welcome with a real first-step CTA (model wizard duration
// picker), never the dashboard root.
export type WelcomeTrack = "yet-to-launch" | "operating" | "default";

/**
 * Decide which welcome-email branch to use based on the planningStage /
 * profileRole captured at signup. Both inputs are free-text strings
 * (the columns are nullable text in postgres) so we substring-match
 * against a few known buckets and otherwise fall back to "default".
 *
 * Exported for unit tests in mailer-adapter.test.ts.
 */
export function pickWelcomeTrack(
  planningStage: string | null | undefined,
  profileRole: string | null | undefined,
): WelcomeTrack {
  const stage = (planningStage || "").toLowerCase();
  const role = (profileRole || "").toLowerCase();

  // Operating school first: a founder who is already running a school
  // is best served by importing last year's actuals, even if they also
  // happen to identify as "head of school".
  if (/operat|runn|exist|open(ed|ing)?\b/.test(stage)) return "operating";
  if (/head|principal|director|administrator|operator/.test(role)) return "operating";

  // Pre-launch / planning / exploring → year-1 model wizard.
  if (/plan|explor|search|negotiat|prepar|consider|pre.?open|yet/.test(stage)) {
    return "yet-to-launch";
  }

  return "default";
}

interface WelcomeCopy {
  subject: string;
  /**
   * Path appended to APP_URL for the primary CTA. We keep paths (not
   * full URLs) here so the branch tests don't depend on whether
   * APP_URL or REPLIT_DEV_DOMAIN is the configured host.
   */
  ctaPath: string;
  ctaLabel: string;
  /** One-line headline shown above the bullets. */
  headline: string;
  /** Plain-language paragraph explaining the recommended first action. */
  body: string;
}

function welcomeCopyFor(track: WelcomeTrack): WelcomeCopy {
  if (track === "yet-to-launch") {
    return {
      subject: "Welcome — let's build your Year-1 model",
      ctaPath: "/model/new?stage=new_school",
      ctaLabel: "Build my Year-1 model",
      headline: "Your account is ready — let's plan your school.",
      body:
        "You told us you're still in the planning stages, so the most useful thing to do next is build your opening-year financial model. We'll walk you through enrollment, staffing, revenue and expenses one section at a time and assemble a 5-year projection you can take to a lender or board.",
    };
  }
  if (track === "operating") {
    return {
      subject: "Welcome — let's bring in your existing actuals",
      ctaPath: "/model/new?stage=operating_school",
      ctaLabel: "Import my existing actuals",
      headline: "Your account is ready — let's wire up your real numbers.",
      body:
        "Since you're already running a school, the fastest way to get value out of SchoolStack Budget is to bring in last year's actuals. We'll start a model in operating-school mode so the prior-year, actuals editor and variance panels are turned on from the first step.",
    };
  }
  return {
    subject: "Welcome to SchoolStack Budget",
    ctaPath: "/model/new",
    ctaLabel: "Start my financial model",
    headline: "Your account is ready to go.",
    body:
      "SchoolStack Budget helps founders build a 5-year financial model, generate a Board and Funder Summary and a Lender Conversation Snapshot, and request a free advisor review when the model is ready. The first step is starting your model — we'll ask whether it's for a planned or operating school and tailor the wizard from there.",
  };
}

export async function sendWelcomeEmail(
  toEmail: string,
  name: string,
  planningStage?: string | null,
  profileRole?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = resolveAppUrl();
  const track = pickWelcomeTrack(planningStage, profileRole);
  const copy = welcomeCopyFor(track);
  // The CTA link is a nice-to-have. If neither APP_URL nor
  // REPLIT_DEV_DOMAIN is set we still want the welcome to go out — the
  // body just won't carry a CTA button. This mirrors how the advisor-
  // confirmation template degrades gracefully (no link in some flows).
  const ctaUrl = appUrl ? `${appUrl}${copy.ctaPath}` : null;
  const firstName = (name || "").split(" ")[0] || name || "there";

  const ctaButton = ctaUrl
    ? `
        <div style="text-align:center;margin:32px 0;">
          <a href="${ctaUrl}" style="background-color:#D97706;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(copy.ctaLabel)}</a>
        </div>`
    : "";
  const ctaText = ctaUrl ? `\n${copy.ctaLabel}: ${ctaUrl}\n` : "";

  const result = await deliverTransactionalEmail({
    kind: "welcome",
    to: toEmail,
    ...(ctaUrl ? { primaryUrl: ctaUrl } : {}),
    subject: copy.subject,
    text: [
      `Hi ${firstName},`,
      "",
      copy.headline,
      "",
      copy.body,
      "",
      "Once your first model is in, you can also:",
      "  • Generate a Board and Funder Summary and a Lender Conversation Snapshot",
      "  • Request a free advisor review of your projections",
      ctaText,
      "If you have questions or want to talk through your plan, just reply to this email — we read every one.",
      "",
      " — The SchoolStack Budget Team",
    ].join("\n"),
    html: `
      <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;">${escapeHtml(copy.headline)}</h2>
        <p style="color:#475569;line-height:1.6;">
          Hi ${escapeHtml(firstName)},
        </p>
        <p style="color:#475569;line-height:1.6;">
          ${escapeHtml(copy.body)}
        </p>
        ${ctaButton}
        <p style="color:#475569;line-height:1.6;">
          Once your first model is in, you can also generate a Board and Funder
          Summary and a Lender Conversation Snapshot, and request a free advisor
          review of your projections.
        </p>
        <p style="color:#475569;line-height:1.6;">
          If you have questions or want to talk through your plan, just reply to
          this email — we read every one.
        </p>
        <p style="color:#475569;line-height:1.6;margin-bottom:0;">
          — The SchoolStack Budget Team
        </p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;" />
        <p style="color:#94A3B8;font-size:12px;">SchoolStack Budget by SchoolStack.ai</p>
      </div>
    `,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send welcome email." };
  }
  return { success: true };
}

export async function sendAccountAlreadyExistsEmail(
  toEmail: string,
  resetToken: string | null,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = resolveAppUrl();
  if (!appUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("[mailer] FATAL: APP_URL is required in production");
    } else {
      console.error("[mailer] Cannot generate account-exists links: neither APP_URL nor REPLIT_DEV_DOMAIN is set");
    }
    return { success: false, error: "Server configuration error." };
  }
  const loginUrl = `${appUrl}/login`;
  const resetUrl = resetToken ? `${appUrl}/reset-password?token=${resetToken}` : `${appUrl}/forgot-password`;

  const result = await deliverTransactionalEmail({
    kind: "account-already-exists",
    to: toEmail,
    primaryUrl: resetUrl,
    subject: "You already have a SchoolStack Budget account",
    text: [
      "Hi,",
      "",
      "Somebody (probably you) just tried to create a SchoolStack Budget account with this email address — but you already have one.",
      "",
      `Sign in:    ${loginUrl}`,
      `Reset password: ${resetUrl}`,
      "",
      resetToken
        ? "The reset link above is valid for 1 hour."
        : "If you didn't recently request a password reset, click the reset link to start one.",
      "",
      "If this wasn't you, no action is needed — your account is unchanged.",
      "",
      " - The SchoolStack Budget Team",
    ].join("\n"),
    html: `
      <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1E293B;font-family:'Quicksand',Arial,sans-serif;">You already have an account</h2>
        <p style="color:#475569;line-height:1.6;">
          Somebody (probably you) just tried to create a SchoolStack Budget account with this email address — but you already have one.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="background-color:#1E293B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin:4px;">Sign in</a>
          <a href="${resetUrl}" style="background-color:#D97706;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin:4px;">Reset password</a>
        </div>
        <p style="color:#475569;line-height:1.6;font-size:13px;">
          ${resetToken ? "The password reset link is valid for 1 hour." : "If you didn't recently request a reset, use the button above to start one."}
        </p>
        <p style="color:#475569;line-height:1.6;">
          If this wasn't you, no action is needed — your account is unchanged.
        </p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;" />
        <p style="color:#94A3B8;font-size:12px;">SchoolStack Budget by SchoolStack.ai</p>
      </div>
    `,
  });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to send notice." };
  }
  return { success: true };
}
