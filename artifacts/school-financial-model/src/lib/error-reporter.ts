let reportedErrors = new Set<string>();
let lastReportTime = 0;
const MIN_INTERVAL_MS = 1000;

function getErrorKey(message: string, url?: string): string {
  return `${message}::${url || ""}`;
}

function shouldReport(message: string, url?: string): boolean {
  const key = getErrorKey(message, url);
  if (reportedErrors.has(key)) return false;
  const now = Date.now();
  if (now - lastReportTime < MIN_INTERVAL_MS) return false;

  reportedErrors.add(key);
  lastReportTime = now;

  if (reportedErrors.size > 100) {
    reportedErrors = new Set([...reportedErrors].slice(-50));
  }
  return true;
}

async function reportError(payload: {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
}) {
  try {
    await fetch("/api/errors/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // reporting is best-effort
  }
}

export function setupGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = typeof message === "string" ? message : "Unknown error";
    if (!shouldReport(msg, source as string)) return;

    reportError({
      message: msg,
      stack: error?.stack || `at ${source}:${lineno}:${colno}`,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";

    if (!shouldReport(msg)) return;

    reportError({
      message: msg,
      stack: reason instanceof Error ? reason.stack : undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  };
}
