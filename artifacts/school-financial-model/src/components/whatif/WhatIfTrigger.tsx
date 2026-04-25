import { useState, useEffect, lazy, Suspense } from "react";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeOverridesFromHash, isEmptyOverrides, type WhatIfOverrides } from "@/lib/whatif-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

const WhatIfDrawer = lazy(() =>
  import("./WhatIfDrawer").then((m) => ({ default: m.WhatIfDrawer }))
);

interface WhatIfTriggerProps {
  data: FullModelData;
  modelId: number | null;
  onApplyToModel?: (adjustedData: FullModelData) => Promise<void>;
  onSaveAsScenario?: (overrides: WhatIfOverrides, name: string) => Promise<void>;
}

export function WhatIfTrigger({ data, modelId, onApplyToModel, onSaveAsScenario }: WhatIfTriggerProps) {
  const [open, setOpen] = useState(false);
  const [hasOverrides, setHasOverrides] = useState(false);

  useEffect(() => {
    const check = () => {
      const ov = decodeOverridesFromHash(window.location.hash);
      setHasOverrides(!isEmptyOverrides(ov));
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  // Auto-open if URL hash has whatif on first mount
  useEffect(() => {
    const ov = decodeOverridesFromHash(window.location.hash);
    if (!isEmptyOverrides(ov)) {
      setOpen(true);
    }
  }, []);

  // Re-check overrides whenever drawer closes (so the badge stays accurate)
  useEffect(() => {
    if (open) return;
    const ov = decodeOverridesFromHash(window.location.hash);
    setHasOverrides(!isEmptyOverrides(ov));
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="whatif-trigger"
        aria-label="Open Live What-If Planner"
        className={cn(
          "fixed bottom-20 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all",
          "bg-amber-600 text-white hover:bg-amber-700 hover:shadow-xl active:scale-95",
          "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
        )}
      >
        <Wand2 className="h-4 w-4" />
        <span className="font-medium text-sm hidden sm:inline">What-If</span>
        {hasOverrides && (
          <span
            data-testid="whatif-active-badge"
            className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"
            aria-label="Active overrides"
          />
        )}
      </button>
      <Suspense fallback={null}>
        {open && (
          <WhatIfDrawer
            open={open}
            onOpenChange={setOpen}
            data={data}
            modelId={modelId}
            onApplyToModel={onApplyToModel}
            onSaveAsScenario={onSaveAsScenario}
          />
        )}
      </Suspense>
    </>
  );
}
