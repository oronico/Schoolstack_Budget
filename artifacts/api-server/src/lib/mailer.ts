import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<boolean> {
  const resend = getResend();
  const fromAddress = process.env.EMAIL_FROM || "SchoolStack Budget <onboarding@resend.dev>";
  const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost:3000"}`;
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  if (!resend) {
    console.warn(
      `[mailer] Resend not configured - password reset email not sent. ` +
      `Set RESEND_API_KEY to enable. ` +
      `Reset link: ${resetUrl}`,
    );
    return false;
  }

  try {
    const { error } = await resend.emails.send({
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
      console.error("[mailer] Resend error:", error, `Reset link: ${resetUrl}`);
      return false;
    }

    console.log(`[mailer] Password reset email sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err, `Reset link: ${resetUrl}`);
    return false;
  }
}
