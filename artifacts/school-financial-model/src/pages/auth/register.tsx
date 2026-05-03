import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { getApiErrorMessage } from "@/lib/api-error";
import { reportAttributedSignup } from "@/lib/cta-tracking";

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const registerMutation = useRegister();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await registerMutation.mutateAsync({ data: { name, email, password } });
      login(res.token, res.user);
      reportAttributedSignup(res.token);

      const returnTo = sessionStorage.getItem("auth_return_to");
      if (returnTo) {
        sessionStorage.removeItem("auth_return_to");
        if (returnTo.includes("?")) {
          const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
          window.location.href = base + returnTo;
        } else {
          setLocation(returnTo);
        }
        return;
      }

      setLocation("/model/new");
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to register. Please try again."));
    }
  };

  return (
    <Layout>
      <SEOHead
        title="Create Account"
        description="Create a free SchoolStack Budget account and start building a professional 5-year financial model for your school."
        path="/register"
      />
      <div className="flex-1 flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Create Account</h1>
            <p className="text-muted-foreground mb-4">Start building your school's financial model.</p>
            <p className="text-xs text-muted-foreground text-center mb-8">
              SchoolStack Space and Budget use separate accounts during alpha.{" "}
              <a href="https://space.schoolstack.ai" className="text-primary hover:underline">
                Need a Space account?
              </a>
            </p>
            
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="founder@school.org"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={e => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  I agree to the{" "}
                  <Link href="/terms" className="font-semibold text-primary hover:underline" target="_blank">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-semibold text-primary hover:underline" target="_blank">
                    Privacy Policy
                  </Link>
                </span>
              </label>

              <button
                type="submit"
                disabled={registerMutation.isPending || !agreedToTerms}
                className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed"
              >
                {registerMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
