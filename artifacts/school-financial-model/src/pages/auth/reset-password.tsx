import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { getApiErrorMessage } from "@/lib/api-error";

export function ResetPasswordPage() {
  const searchString = useSearch();
  const token = new URLSearchParams(searchString).get("token") || "";
  
  const resetMutation = useResetPassword();
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await resetMutation.mutateAsync({ data: { token, password } });
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to reset password. Link may be expired."));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold mb-4">Invalid Reset Link</h1>
            <p className="text-muted-foreground mb-6">The password reset link is missing or invalid.</p>
            <Link href="/forgot-password" className="text-primary hover:underline font-semibold">
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50">
            {success ? (
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-4">Password Reset!</h1>
                <p className="text-muted-foreground mb-8">
                  Your password has been successfully reset.
                </p>
                <Link href="/login" className="inline-flex items-center justify-center w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  Sign In Now
                </Link>
              </div>
            ) : (
              <>
                <h1 className="font-display text-3xl font-bold text-foreground mb-2">New Password</h1>
                <p className="text-muted-foreground mb-8">Please enter your new password below.</p>
                
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetMutation.isPending}
                    className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
                  >
                    {resetMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
