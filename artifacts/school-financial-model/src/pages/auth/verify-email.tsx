import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useVerifyEmail } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error";
import { reportAttributedSignup } from "@/lib/cta-tracking";

// Task #527: lands here after the founder clicks the verification link
// in their inbox. POSTs the raw token to /auth/verify-email which
// provisions the user row and returns an auth token; we log them in
// and forward to the new-model page (or any saved auth_return_to).
export function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const verifyMutation = useVerifyEmail();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string>("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setError("This verification link is missing its token. Open the link from your email exactly as it was sent.");
      return;
    }
    verifyMutation
      .mutateAsync({ data: { token } })
      .then((res) => {
        login(res.token, res.user);
        reportAttributedSignup(res.token);
        setStatus("ok");
        const returnTo = sessionStorage.getItem("auth_return_to");
        if (returnTo) {
          sessionStorage.removeItem("auth_return_to");
          if (returnTo.includes("?")) {
            const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
            window.location.href = base + returnTo;
            return;
          }
          setLocation(returnTo);
          return;
        }
        setLocation("/model/new");
      })
      .catch((err) => {
        setStatus("error");
        setError(getApiErrorMessage(err, "This verification link is invalid or has expired. Sign up again to receive a fresh link."));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <SEOHead title="Verifying your email" description="Confirming your SchoolStack Budget account." path="/verify-email" />
      <div className="flex-1 flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50 text-center">
            {status === "working" && (
              <div data-testid="verify-email-working">
                <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
                <h1 className="mt-6 font-display text-2xl font-bold text-foreground">Confirming your email…</h1>
                <p className="mt-2 text-sm text-muted-foreground">Hang tight, this should only take a second.</p>
              </div>
            )}
            {status === "ok" && (
              <div data-testid="verify-email-ok">
                <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                <h1 className="mt-6 font-display text-2xl font-bold text-foreground">You're in!</h1>
                <p className="mt-2 text-sm text-muted-foreground">Taking you to your dashboard…</p>
              </div>
            )}
            {status === "error" && (
              <div data-testid="verify-email-error">
                <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
                <h1 className="mt-6 font-display text-2xl font-bold text-foreground">We couldn't verify that link</h1>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{error}</p>
                <div className="mt-6 flex flex-col gap-2">
                  <Link href="/register" className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-center">
                    Sign up again
                  </Link>
                  <Link href="/login" className="w-full py-3 rounded-xl border-2 border-border bg-background font-semibold text-foreground text-center">
                    I already have an account
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
