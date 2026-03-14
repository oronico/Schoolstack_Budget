import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { getApiErrorMessage } from "@/lib/api-error";

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const loginMutation = useLogin();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await loginMutation.mutateAsync({ data: { email, password } });
      login(res.token, res.user);
      setLocation("/dashboard");
    } catch (err) {
      setError(getApiErrorMessage(err, "Invalid email or password"));
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Welcome back</h1>
            <p className="text-muted-foreground mb-8">Sign in to continue building your model.</p>
            
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
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-semibold">Password</label>
                  <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
              >
                {loginMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign in"}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
