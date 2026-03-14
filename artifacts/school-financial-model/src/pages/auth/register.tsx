import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister, useCreateModel } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { getApiErrorMessage } from "@/lib/api-error";

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const registerMutation = useRegister();
  const createModelMutation = useCreateModel();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await registerMutation.mutateAsync({ data: { name, email, password } });
      login(res.token, res.user);
      try {
        const newModel = await createModelMutation.mutateAsync({
          data: { name: "Untitled Model", currentStep: 1, data: {} }
        });
        setLocation(`/model/${newModel.id}`);
      } catch {
        setLocation("/dashboard");
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to register. Please try again."));
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl p-8 sm:p-10 shadow-xl shadow-black/5 border border-border/50">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Create Account</h1>
            <p className="text-muted-foreground mb-8">Start building your school's financial model.</p>
            
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
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="founder@school.org"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-1.5">Password</label>
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
                disabled={registerMutation.isPending}
                className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
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
