import { useState } from "react";
import { Link } from "wouter";
import {
  useListAccountingUploads,
  useDeleteAccountingUpload,
  type AccountingUploadEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

function formatUploadedAt(iso: string | null | undefined): string {
  if (!iso) return "Unknown date";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "MMM d, yyyy");
}

function statusLabel(status: string | undefined | null): string {
  if (status === "complete") return "Complete";
  if (status === "archived") return "Archived";
  return "Draft";
}

function statusClass(status: string | undefined | null): string {
  if (status === "complete") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "archived") return "bg-gray-100 text-gray-600 border-gray-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

export function AccountPage() {
  const { user } = useAuth();
  const { data: uploads, isLoading, error } = useListAccountingUploads();
  const deleteMutation = useDeleteAccountingUpload();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (!user) return null;

  const handleForget = async (entry: AccountingUploadEntry) => {
    setDeletingId(entry.modelId);
    try {
      await deleteMutation.mutateAsync({ modelId: entry.modelId });
      await queryClient.invalidateQueries({
        queryKey: ["/api/account/accounting-uploads"],
      });
      // Also invalidate the per-model cache so the scenarios page picks it
      // up when the founder navigates back to that model.
      await queryClient.invalidateQueries({
        queryKey: [`/api/models/${entry.modelId}`],
      });
      toast({
        title: "Upload forgotten",
        description: `Removed ${entry.filename} from “${entry.modelName}”. Suggestions on that model will revert to your typed-in priors.`,
      });
      setConfirmingId(null);
    } catch (err) {
      toast({
        title: "Couldn't forget upload",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>

        <section
          className="rounded-2xl border border-border bg-background shadow-sm p-6"
          data-testid="account-uploads-panel"
        >
          <header className="mb-4">
            <h2 className="text-xl font-semibold text-foreground">
              Saved P&amp;L uploads
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every accounting export (QuickBooks / Xero / Wave CSV or XLSX)
              you've attached to a model lives here. Forgetting one strips it
              from that model so the actuals editor stops sourcing from a
              stale book — useful when you re-export from a different file or
              switch accounting tools entirely.
            </p>
          </header>

          {isLoading && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground py-8"
              data-testid="account-uploads-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved uploads…
            </div>
          )}

          {error && !isLoading && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              data-testid="account-uploads-error"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Couldn't load your saved uploads. Refresh the page or try
                again later.
              </span>
            </div>
          )}

          {!isLoading && !error && uploads && uploads.length === 0 && (
            <div
              className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center"
              data-testid="account-uploads-empty"
            >
              <FileSpreadsheet
                className="h-6 w-6 mx-auto text-muted-foreground/60"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                You haven't saved any P&amp;L uploads yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">
                Upload one from the Story step of any model wizard to see it
                appear here.
              </p>
            </div>
          )}

          {!isLoading && !error && uploads && uploads.length > 0 && (
            <ul className="divide-y divide-border" data-testid="account-uploads-list">
              {uploads.map((entry) => {
                const isConfirming = confirmingId === entry.modelId;
                const isDeleting = deletingId === entry.modelId;
                return (
                  <li
                    key={entry.modelId}
                    className="py-4 first:pt-0 last:pb-0"
                    data-testid={`account-upload-row-${entry.modelId}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono text-sm text-foreground break-all"
                            data-testid={`account-upload-filename-${entry.modelId}`}
                          >
                            {entry.filename}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${statusClass(entry.modelStatus)}`}
                          >
                            {statusLabel(entry.modelStatus)}
                          </span>
                          {entry.parseWarningCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                              title={`${entry.parseWarningCount} parser warning(s) when this file was uploaded`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {entry.parseWarningCount}{" "}
                              {entry.parseWarningCount === 1
                                ? "warning"
                                : "warnings"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Attached to{" "}
                          <Link
                            href={`/model/${entry.modelId}/scenarios`}
                            className="font-semibold text-foreground hover:text-primary inline-flex items-center gap-1"
                            data-testid={`account-upload-model-link-${entry.modelId}`}
                          >
                            {entry.modelName}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </Link>{" "}
                          · uploaded {formatUploadedAt(entry.uploadedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(entry.modelId)}
                            disabled={isDeleting}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:text-destructive/80 px-2.5 py-1.5 rounded-md hover:bg-destructive/5 transition-colors"
                            data-testid={`account-upload-forget-${entry.modelId}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Forget
                          </button>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              Forget this upload?
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              disabled={isDeleting}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-md hover:bg-black/5 transition-colors text-muted-foreground"
                              data-testid={`account-upload-cancel-${entry.modelId}`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleForget(entry)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60"
                              data-testid={`account-upload-confirm-${entry.modelId}`}
                            >
                              {isDeleting ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Forgetting…
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Yes, forget
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}

export default AccountPage;
