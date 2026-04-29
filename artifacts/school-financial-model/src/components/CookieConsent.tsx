import { useState, useEffect, useCallback } from "react";
import { getConsent, setConsent, initGA } from "@/lib/analytics";
import { Link } from "wouter";

const REOPEN_EVENT = "cookie-consent:reopen";

export function reopenCookieConsent() {
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => setVisible(true), []);

  useEffect(() => {
    const consent = getConsent();
    if (consent === null) {
      const timer = setTimeout(show, 1500);
      return () => clearTimeout(timer);
    }
    if (consent === "accepted") {
      initGA();
    }
    return undefined;
  }, [show]);

  useEffect(() => {
    window.addEventListener(REOPEN_EVENT, show);
    return () => window.removeEventListener(REOPEN_EVENT, show);
  }, [show]);

  if (!visible) return null;

  function handleAccept() {
    setConsent("accepted");
    setVisible(false);
  }

  function handleDecline() {
    setConsent("declined");
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 duration-500"
    >
      <div className="mx-auto max-w-4xl px-4 pb-4 sm:px-6">
        <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl px-5 py-4 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use cookies to understand how visitors use this site.
              Analytics cookies are only set if you accept.{" "}
              <Link
                href="/privacy"
                className="text-primary hover:underline font-medium"
              >
                Privacy Policy
              </Link>
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDecline}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors shadow-sm"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
