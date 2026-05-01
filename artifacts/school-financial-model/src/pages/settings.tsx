import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/lib/auth-context";
import { FounderPersonaPrompt } from "@/components/coaching/FounderPersonaPrompt";
import {
  getFounderPersona,
  type FounderStage,
  type FounderComfort,
} from "@/lib/coaching/founder-persona";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { UserCog, Compass, BookOpen, GraduationCap, Building2, Sparkles } from "lucide-react";

type PersonaSummary = {
  icon: typeof Compass;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
};

// Plain-English summaries for each stage × comfort combo so a founder can
// see at a glance what they previously picked. Copy intentionally avoids
// jargon for yet-to-launch buckets (no "actuals" / "QuickBooks" / etc.) so
// it stays consistent with the picker rules from Task #302.
function getPersonaSummary(
  stage: FounderStage | null,
  comfort: FounderComfort | null,
): PersonaSummary | null {
  if (!stage || !comfort) return null;
  if (stage === "yet_to_launch" && comfort === "new_to_budgeting") {
    return {
      icon: Compass,
      title: "I'm planning a school and budgeting is new to me",
      description:
        "We're guiding you in plain English, skipping jargon, and staying focused on pre-opening planning.",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    };
  }
  if (stage === "yet_to_launch" && comfort === "comfortable") {
    return {
      icon: BookOpen,
      title: "I'm planning a school and I'm comfortable with budgets",
      description:
        "Compact tone, focused on pre-opening planning. Operating-school surfaces stay hidden.",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    };
  }
  if (stage === "existing" && comfort === "new_to_budgeting") {
    return {
      icon: GraduationCap,
      title: "I run a school and budgeting is new to me",
      description:
        "We explain things as we go and the operating-school tools (actuals, variance, QuickBooks) are turned on.",
      iconBg: "bg-teal-100",
      iconColor: "text-teal-600",
    };
  }
  return {
    icon: Building2,
    title: "I run a school and I'm comfortable with budgets",
    description:
      "Compact tone with the full operating-school toolkit turned on.",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
  };
}

export function SettingsPage() {
  const { user } = useAuth();
  const [showPersonaEdit, setShowPersonaEdit] = useState(false);

  if (!user) return null;

  const { stage, comfort } = getFounderPersona(user);
  const summary = getPersonaSummary(stage, comfort);
  const Icon = summary?.icon ?? Sparkles;

  return (
    <Layout>
      <SEOHead
        title="Account settings"
        description="Update your founder profile and account preferences."
        path="/settings"
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
            Account settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage how SchoolStack Budget tailors itself to you.
          </p>
        </header>

        <section
          data-testid="settings-founder-profile-card"
          className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <UserCog className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-foreground">
                  Your founder profile
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  We use this to set the tone and decide which tools to show. Update it any time your situation changes.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            {summary ? (
              <div
                data-testid="settings-founder-profile-current"
                data-stage={stage ?? ""}
                data-comfort={comfort ?? ""}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30"
              >
                <div className={`h-9 w-9 rounded-lg ${summary.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4.5 w-4.5 ${summary.iconColor}`} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/70 font-semibold">
                    Currently set to
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {summary.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {summary.description}
                  </p>
                </div>
              </div>
            ) : (
              <div
                data-testid="settings-founder-profile-current"
                data-stage=""
                data-comfort=""
                className="p-4 rounded-xl border border-dashed border-border bg-muted/30"
              >
                <p className="text-sm text-foreground font-medium">
                  You haven't picked a founder profile yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick the option that matches where you are now and we'll tailor the experience.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPersonaEdit(true);
                  trackCoachingEvent("founder_persona_changed", { source: "settings_page" });
                }}
                data-testid="settings-founder-profile-edit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                {summary ? "Update founder profile" : "Pick founder profile"}
              </button>
              <p className="text-xs text-muted-foreground">
                Changes take effect on your next dashboard load.
              </p>
            </div>
          </div>
        </section>
      </div>

      {showPersonaEdit && (
        <FounderPersonaPrompt
          mode="edit"
          onClose={() => setShowPersonaEdit(false)}
          onComplete={() => setShowPersonaEdit(false)}
        />
      )}
    </Layout>
  );
}

export default SettingsPage;
