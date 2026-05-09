// Task #705 — Simple Summary vs CFO Detail toggle on the Review step.
//
// Persists the founder's choice per model id (so a board-prep founder
// who lives in CFO Detail keeps it, and a first-pass founder who
// prefers Simple Summary keeps that). Falls back to "simple" when no
// model id is available (e.g. a wizard preview).

import { useEffect, useState } from "react";
import { Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReviewView = "simple" | "cfo";

const STORAGE_PREFIX = "review-view:";

function storageKey(modelId: number | string | null | undefined): string {
  return `${STORAGE_PREFIX}${modelId ?? "default"}`;
}

export function readPersistedReviewView(
  modelId: number | string | null | undefined,
): ReviewView {
  if (typeof window === "undefined") return "simple";
  try {
    const v = window.localStorage.getItem(storageKey(modelId));
    return v === "cfo" ? "cfo" : "simple";
  } catch {
    return "simple";
  }
}

export function writePersistedReviewView(
  modelId: number | string | null | undefined,
  view: ReviewView,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(modelId), view);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function useReviewView(
  modelId: number | string | null | undefined,
): [ReviewView, (next: ReviewView) => void] {
  const [view, setView] = useState<ReviewView>(() =>
    readPersistedReviewView(modelId),
  );
  useEffect(() => {
    setView(readPersistedReviewView(modelId));
  }, [modelId]);
  const update = (next: ReviewView) => {
    setView(next);
    writePersistedReviewView(modelId, next);
  };
  return [view, update];
}

interface ReviewViewToggleProps {
  view: ReviewView;
  onChange: (next: ReviewView) => void;
  className?: string;
}

export function ReviewViewToggle({
  view,
  onChange,
  className,
}: ReviewViewToggleProps) {
  return (
    <div
      data-testid="review-view-toggle"
      className={cn(
        "inline-flex items-center rounded-xl border border-border/60 bg-white p-1 shadow-sm",
        className,
      )}
      role="tablist"
      aria-label="Review detail level"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "simple"}
        data-testid="review-view-simple"
        onClick={() => onChange("simple")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
          view === "simple"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        Simple Summary
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "cfo"}
        data-testid="review-view-cfo"
        onClick={() => onChange("cfo")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
          view === "cfo"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        CFO Detail
      </button>
    </div>
  );
}
