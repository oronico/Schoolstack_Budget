import { useState } from "react";
import { Link } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Loader2, Eye, EyeOff, Mail, Compass, Building2, Check } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { getApiErrorMessage } from "@/lib/api-error";

// Task #566 — capture whether the founder is planning a new school or
// already running one at signup, so the welcome email (Task #557) can
// branch on a real signal instead of falling through to the generic
// default. The chosen value is also persisted onto the `users` row as
// `personaStage` in /auth/verify-email so the in-app FounderPersonaPrompt
// (Task #302) doesn't re-ask the same question on first sign-in.
//
// Values match the `personaStage` enum exactly ("yet_to_launch" /
// "existing"); they also match `pickWelcomeTrack`'s substring matchers
// (`/yet/` → "yet-to-launch", `/exist/` → "operating") so the welcome
// branch resolves correctly with no translation layer in between.
type SignupStage = "yet_to_launch" | "existing";

const STAGE_OPTIONS: Array<{
  value: SignupStage;
  icon: typeof Compass;
  title: string;
  description: string;
}> = [
  {
    value: "yet_to_launch",
    icon: Compass,
    title: "I'm planning a new school",
    description: "Build a Year-1 model for an opening you're working toward.",
  },
  {
    value: "existing",
    icon: Building2,
    title: "I'm already running a school",
    description: "Bring in your existing numbers and forecast forward.",
  },
];

export function RegisterPage() {
  const registerMutation = useRegister();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<SignupStage | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  // Task #527: confirm-by-email signup. After /auth/register returns 202,
  // we no longer log the user in here — we show a "check your inbox"
  // panel and wait for them to click the verification link, which lands
  // on /verify-email and provisions the account there.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!stage) {
      setError("Please tell us whether you're planning a new school or already running one.");
      return;
    }
    try {
      await registerMutation.mutateAsync({
        data: { name, email, password, planningStage: stage },
      });
      setSubmittedEmail(email);
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

            {submittedEmail ? (
              <div data-testid="register-check-inbox" className="space-y-5">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-center text-foreground">Check your inbox</h2>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  If <span className="font-semibold text-foreground">{submittedEmail}</span> isn't already
                  registered, we just sent a verification link. Click it to finish creating your account —
                  it's valid for the next hour.
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Already have an account with this email? Check the same inbox for sign-in instructions instead.
                </p>
                <button
                  type="button"
                  onClick={() => { setSubmittedEmail(null); setPassword(""); }}
                  className="w-full py-3 rounded-xl border-2 border-border bg-background font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Use a different email
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Where are you in your school's journey?</label>
                <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Where are you in your school's journey?">
                  {STAGE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = stage === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setStage(option.value)}
                        data-testid={`signup-stage-${option.value}`}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            {option.title}
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{option.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

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
                disabled={registerMutation.isPending || !agreedToTerms || !stage}
                className="w-full mt-4 flex items-center justify-center py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed"
              >
                {registerMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
              </button>
            </form>
            )}

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
