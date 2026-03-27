import { useState, useEffect } from "react";
import { X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const NPS_STORAGE_PREFIX = "nps_dismissed_";
const NPS_COOLDOWN_DAYS = 90;

function getNpsLabel(score: number): string {
  if (score >= 9) return "Promoter";
  if (score >= 7) return "Passive";
  return "Detractor";
}

function getScoreColor(score: number): string {
  if (score >= 9) return "bg-green-600 text-white ring-green-600/30";
  if (score >= 7) return "bg-amber-500 text-white ring-amber-500/30";
  return "bg-red-500 text-white ring-red-500/30";
}

function getScoreHoverColor(score: number): string {
  if (score >= 9) return "hover:bg-green-100 hover:border-green-400 hover:text-green-700";
  if (score >= 7) return "hover:bg-amber-100 hover:border-amber-400 hover:text-amber-700";
  return "hover:bg-red-100 hover:border-red-400 hover:text-red-700";
}

interface NpsModalProps {
  exportCount: number;
}

export function NpsModal({ exportCount }: NpsModalProps) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (exportCount < 1 || !user) return;

    const storageKey = `${NPS_STORAGE_PREFIX}${user.id}`;
    const dismissedAt = localStorage.getItem(storageKey);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < NPS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
    }

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [exportCount, user]);

  function dismiss() {
    if (user) {
      localStorage.setItem(`${NPS_STORAGE_PREFIX}${user.id}`, String(Date.now()));
    }
    setVisible(false);
  }

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({
          category: "nps",
          message: comment.trim() || `NPS score: ${score}/10 (${getNpsLabel(score)})`,
          score,
          pageUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
      setTimeout(dismiss, 2500);
    } catch {
      dismiss();
    } finally {
      setSubmitting(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {submitted ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground">
              Thank you!
            </h3>
            <p className="text-sm text-muted-foreground">
              Your feedback helps us build a better tool for school founders.
            </p>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="font-display text-lg font-bold text-foreground mb-1">
              How likely are you to recommend SchoolStack Budget?
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              Help us improve — rate your experience so far.
            </p>

            <div className="flex gap-1.5 justify-center mb-2">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setScore(i)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    score === i
                      ? `${getScoreColor(i)} ring-2 scale-110`
                      : `border-border/60 bg-background text-muted-foreground ${getScoreHoverColor(i)}`
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-5 px-1">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What's the main reason for your score? (optional)"
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none mb-4"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={score === null || submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
