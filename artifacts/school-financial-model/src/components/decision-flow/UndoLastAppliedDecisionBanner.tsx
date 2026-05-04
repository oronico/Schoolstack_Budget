import { useState } from "react";
import { Undo2, Loader2, X } from "lucide-react";
import { useUpdateModel } from "@workspace/api-client-react";
import { useConflictBanner } from "@/components/ConflictReloadBanner";
import { cn } from "@/lib/utils";
import {
  DECISION_THEME,
  DECISION_LABELS,
} from "@/lib/decision-flows";
import type { AppliedDecisionUndo } from "@/pages/model-wizard/schema";

interface UndoLastAppliedDecisionBannerProps {
  modelId: number;
  data: Record<string, unknown>;
  onUndone?: () => void;
}

// Rolling window during which the persisted undo record stays surfaced on the
// model dashboard. Past 24h we hide the banner (the record itself stays in
// data until the next apply replaces it, so a follow-up apply still wipes
// the stale snapshot rather than letting it accumulate).
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatRelative(appliedAt: string): string {
  const ts = Date.parse(appliedAt);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  return "earlier";
}

export function isUndoRecordFresh(appliedAt: string, now: number = Date.now()): boolean {
  const ts = Date.parse(appliedAt);
  if (Number.isNaN(ts)) return false;
  return now - ts < UNDO_WINDOW_MS;
}

export function UndoLastAppliedDecisionBanner({
  modelId,
  data,
  onUndone,
}: UndoLastAppliedDecisionBannerProps) {
  const [isUndoing, setIsUndoing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updateMutation = useUpdateModel();
  const conflict = useConflictBanner();

  const undoRecord = (data as { appliedDecisionUndo?: AppliedDecisionUndo })
    .appliedDecisionUndo;

  if (!undoRecord || dismissed) return null;
  if (!isUndoRecordFresh(undoRecord.appliedAt)) return null;

  const theme = DECISION_THEME[undoRecord.decisionType];
  const label = DECISION_LABELS[undoRecord.decisionType];

  const handleUndo = async () => {
    if (isUndoing) return;
    const changeCount = undoRecord.changes?.length ?? 0;
    const detail = changeCount > 0
      ? ` This will roll back ${changeCount} field change${changeCount === 1 ? "" : "s"}.`
      : "";
    if (!window.confirm(
      `Undo "${undoRecord.scenarioName}"? Your model will be restored to how it was before you applied this decision.${detail}`,
    )) {
      return;
    }
    setIsUndoing(true);
    try {
      // The persisted snapshot is the data exactly as it was *before* the
      // apply that wrote this undo record. Restoring it implicitly clears
      // `appliedDecisionUndo` because the snapshot was captured before that
      // field was set.
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: undoRecord.snapshot },
      });
      onUndone?.();
    } catch (err) {
      if (!conflict.handleMutationError(err)) throw err;
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDismiss = async () => {
    // Dismiss = clear the persisted record so the banner never resurfaces for
    // this apply (without rolling back). We update the data to drop the
    // appliedDecisionUndo key so a refetch won't bring it back.
    setIsUndoing(true);
    try {
      const next = { ...(data as Record<string, unknown>) };
      delete next.appliedDecisionUndo;
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: next },
      });
      setDismissed(true);
    } catch (err) {
      if (!conflict.handleMutationError(err)) throw err;
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <>
      {conflict.banner}
      <div
        className={cn(
        "border-b",
        theme.bg,
        "border-border/50",
      )}
      data-testid="undo-last-applied-decision-banner"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0",
              theme.accent,
            )}
          >
            <Undo2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", theme.text)}>
              {label} applied {formatRelative(undoRecord.appliedAt)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              "{undoRecord.scenarioName}" is folded into your base model.
              Roll it back if you'd like to undo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={isUndoing}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white transition-colors",
              theme.accent,
              !isUndoing && "hover:brightness-110",
              isUndoing && "opacity-60 cursor-not-allowed",
            )}
            data-testid="undo-last-applied-decision-button"
          >
            {isUndoing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            {isUndoing ? "Restoring…" : "Undo last applied decision"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isUndoing}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 transition-colors disabled:opacity-50"
            title="Dismiss without undoing"
            data-testid="undo-last-applied-decision-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
