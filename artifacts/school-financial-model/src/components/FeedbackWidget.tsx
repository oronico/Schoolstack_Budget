import { useState } from "react";
import { MessageSquarePlus, X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const CATEGORIES = [
  { value: "like", label: "What I like", emoji: "\u{1F44D}" },
  { value: "dislike", label: "What I don't like", emoji: "\u{1F44E}" },
  { value: "bug", label: "Bug report", emoji: "\u{1F41B}" },
  { value: "feature", label: "Feature request", emoji: "\u{2728}" },
] as const;

export function FeedbackWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setCategory("");
    setMessage("");
    setEmail("");
    setError(null);
    setSubmitted(false);
  }

  function handleClose() {
    setIsOpen(false);
    setTimeout(resetForm, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !message.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          pageUrl: window.location.href,
          email: !user ? email || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to submit feedback");
      }

      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          if (isOpen) {
            handleClose();
          } else {
            resetForm();
            setIsOpen(true);
          }
        }}
        className="fixed bottom-6 right-6 z-50 p-3.5 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:scale-105 transition-all duration-200"
        aria-label="Send feedback"
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageSquarePlus className="h-5 w-5" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[340px] bg-card border border-border/60 rounded-2xl shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-200">
          {submitted ? (
            <div className="p-8 flex flex-col items-center gap-3 text-center">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">
                Thank you!
              </h3>
              <p className="text-sm text-muted-foreground">
                Your feedback has been submitted successfully.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5">
              <h3 className="font-display text-lg font-bold text-foreground mb-4">
                Send Feedback
              </h3>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      category === cat.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-secondary/50"
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us more..."
                rows={4}
                maxLength={5000}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none mb-3"
                required
              />

              {!user && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary mb-3"
                />
              )}

              {error && (
                <p className="text-xs text-destructive mb-3">{error}</p>
              )}

              <button
                type="submit"
                disabled={!category || !message.trim() || submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Feedback
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
