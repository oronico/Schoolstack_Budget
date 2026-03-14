import { Link, useLocation } from "wouter";
import { useListModels, useCreateModel, useDeleteModel } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/Navbar";
import { Plus, FileSpreadsheet, Trash2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";

export function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  const { data: models, isLoading, refetch } = useListModels();
  const createMutation = useCreateModel();
  const deleteMutation = useDeleteModel();

  if (!user) return null; // Handled by auth guard in App.tsx

  const handleCreate = async () => {
    try {
      const newModel = await createMutation.mutateAsync({
        data: {
          name: "Untitled Model",
          currentStep: 1,
          data: {}
        }
      });
      setLocation(`/model/${newModel.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this model?")) {
      await deleteMutation.mutateAsync({ id });
      refetch();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">Your Models</h1>
            <p className="text-muted-foreground mt-2">Manage your saved financial models and drafts.</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
          >
            {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Create New Model
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : models?.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-3xl p-16 text-center shadow-sm">
            <div className="mx-auto w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-6">
              <FileSpreadsheet className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="font-display text-xl font-bold mb-2">No models yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-8">
              Create your first financial model to see how your school's finances project over the next 5 years.
            </p>
            <button
              onClick={handleCreate}
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
            >
              Start Building
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {models?.map(model => (
              <div key={model.id} className="group flex flex-col bg-card border border-border/60 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300">
                <div className="flex-1 cursor-pointer" onClick={() => setLocation(`/model/${model.id}`)}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-primary/10 text-primary rounded-xl">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-secondary text-xs font-medium text-muted-foreground">
                      Step {model.currentStep} of 7
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {model.name || "Untitled Model"}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Last updated {format(new Date(model.updatedAt), "MMM d, yyyy")}
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                  <button 
                    onClick={() => setLocation(`/model/${model.id}`)}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Open Model
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Delete model"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
