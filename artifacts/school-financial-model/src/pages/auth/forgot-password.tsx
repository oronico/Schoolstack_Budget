import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { getApiErrorMessage } from "@/lib/api-error";

export function ForgotPasswordPage() {
  const forgotMutation = useForgotPassword();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await forgotMutation.mutateAsync({ data: { email } });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "");
      if (msg) {
        setError(msg);
      } else {
        setSuccess(true);
      }
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50">
            {success ? (
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-4">Check your email</h1>
                <p className="text-muted-foreground mb-8">
                  If an account exists for {email}, we've sent instructions to reset your password.
                </p>
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Return to login
                </Link>
              </div>
            ) : (
              <>
                <h1 className="font-display text-3xl font-bold text-foreground mb-2">Reset Password</h1>
                <p className="text-muted-foreground mb-8">Enter your email and we'll send you a reset link.</p>
                
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                      placeholder="founder@school.org"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotMutation.isPending}
                    className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
                  >
                    {forgotMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send Reset Link"}
                  </button>
                </form>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                  Remember your password?{" "}
                  <Link href="/login" className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
