// Notification helper invoked by the daily sync scheduler when a connection
// transitions from `connected` to `error`. Lives in its own module so the
// scheduler can stay focused on iteration logic and tests can swap in a stub
// without pulling in the Resend client or the database layer.
import { eq } from "drizzle-orm";
import {
  db as defaultDb,
  usersTable,
  financialModelsTable,
  type AccountingConnection,
} from "@workspace/db";
import { sendAccountingConnectionErrorEmail } from "../mailer";

export type NotifyConnectionError = (
  conn: AccountingConnection,
  errorMessage: string,
) => Promise<void>;

function providerLabel(provider: string): string {
  if (provider === "quickbooks") return "QuickBooks";
  if (provider === "xero") return "Xero";
  // Fallback capitalises the raw provider id so we never leak the empty string.
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function resolveAppUrl(): string | null {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Fall back to the Replit dev domain so notifications keep working in
  // pre-production environments where APP_URL hasn't been configured yet.
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return null;
}

// Default production implementation. Looks up the recipient + school name and
// dispatches the email via the shared mailer. Never throws — failures are
// logged so the surrounding sweep keeps running for other connections.
export const defaultNotifyConnectionError: NotifyConnectionError = async (
  conn,
  errorMessage,
) => {
  if (!defaultDb) {
    console.warn(
      "[accounting:notify] DB not configured, skipping connection-error email.",
    );
    return;
  }
  const appUrl = resolveAppUrl();
  if (!appUrl) {
    console.warn(
      "[accounting:notify] Neither APP_URL nor REPLIT_DEV_DOMAIN is set; skipping connection-error email.",
    );
    return;
  }
  try {
    const [user] = await defaultDb
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, conn.userId));
    if (!user?.email) {
      console.warn(
        `[accounting:notify] No user email for user ${conn.userId}; skipping connection-error email.`,
      );
      return;
    }
    const [model] = await defaultDb
      .select({ name: financialModelsTable.name })
      .from(financialModelsTable)
      .where(eq(financialModelsTable.id, conn.modelId));
    const schoolName = model?.name?.trim() || "your model";

    const reconnectUrl = `${appUrl}/model/${conn.modelId}/scenarios`;
    const result = await sendAccountingConnectionErrorEmail({
      toEmail: user.email,
      recipientName: user.name || "",
      providerLabel: providerLabel(conn.provider),
      schoolName,
      errorMessage,
      reconnectUrl,
    });
    if (!result.success) {
      console.warn(
        `[accounting:notify] Failed to send connection-error email for connection ${conn.id}: ${result.error}`,
      );
    }
  } catch (err) {
    console.error(
      `[accounting:notify] Unexpected error sending connection-error email for connection ${conn.id}:`,
      err,
    );
  }
};
