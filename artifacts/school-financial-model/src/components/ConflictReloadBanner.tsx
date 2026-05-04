import { useCallback, useState } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { isConflictError } from "@/lib/api-error";

interface ConflictReloadBannerProps {
  onDismiss?: () => void;
  onReload?: () => void;
}

// Shared "another tab edited this model" banner shown whenever a save is
// rejected with a 409 by the server's optimistic-concurrency check (Task #479).
// Replaces the cryptic "HTTP 409" toast that bubbled up from the generated
// useUpdateModel hook in decision flows, the scenarios page, ExportStep, and
// the undo banner — and the wizard's bespoke inline conflict pill — with a
// consistent, plain-language banner and a one-click reload.
export function ConflictReloadBanner({
  onDismiss,
  onReload,
}: ConflictReloadBannerProps) {
  const handleReload = () => {
    if (onReload) {
      onReload();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="conflict-reload-banner"
      className="fixed top-0 inset-x-0 z-[60] bg-amber-50 border-b border-amber-300 text-amber-900 shadow-md"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Your other tab made changes
            </p>
            <p className="text-xs text-amber-800">
              Reload to see the latest version of this model. Any unsaved
              edits in this tab will be lost.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 sm:ml-3">
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
            data-testid="conflict-reload-button"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload model
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 rounded-md text-amber-800 hover:bg-amber-100 transition-colors"
              title="Dismiss"
              data-testid="conflict-reload-dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook used by every useUpdateModel caller. Wrap mutateAsync in a try/catch
// and forward unknown errors via `handleMutationError(err)`; if it returns
// `true` the error was a 409 and the shared banner is now visible — re-throw
// any non-conflict errors so existing toast/error flows still surface them.
export function useConflictBanner() {
  const [open, setOpen] = useState(false);

  const handleMutationError = useCallback((err: unknown): boolean => {
    if (isConflictError(err)) {
      setOpen(true);
      return true;
    }
    return false;
  }, []);

  const dismiss = useCallback(() => setOpen(false), []);

  const banner = open ? <ConflictReloadBanner onDismiss={dismiss} /> : null;

  return { open, setOpen, handleMutationError, dismiss, banner };
}
