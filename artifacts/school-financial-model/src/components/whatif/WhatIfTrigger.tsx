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

  // Auto-open if URL hash has whatif on first mount. We honour two
  // shapes: legacy override-encoded hashes (`#whatif=<encoded>`) for
  // shared deep-links, and a bare `whatif=open` flag that the budget
  // coach uses to deep-link from a coach nudge into the planner without
  // needing to know what to override.
  useEffect(() => {
    const ov = decodeOverridesFromHash(window.location.hash);
    if (!isEmptyOverrides(ov)) {
      setOpen(true);
      return;
    }
    if (/(?:^|[#&?])whatif=open(?:&|$)/.test(window.location.hash)) {
      setOpen(true);
    }
  }, []);

  // Same `whatif=open` handshake, but for the case where the trigger is
  // already mounted when the hash changes (e.g. the founder is on the
  // scenarios page, taps the coach nudge, and the hash flips without a
  // full route navigation). Also opens when an *encoded* whatif hash
  // appears — that's how a saved scenario's "Open in planner" button
  // re-hydrates its overrides into the drawer (Task #175).
  useEffect(() => {
    const onHash = () => {
      if (/(?:^|[#&?])whatif=open(?:&|$)/.test(window.location.hash)) {
        setOpen(true);
        return;
      }
      const ov = decodeOverridesFromHash(window.location.hash);
      if (!isEmptyOverrides(ov)) {
        setOpen(true);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Saved scenario "Open in planner" buttons dispatch this event after
  // writing the encoded overrides to the URL hash. We close-and-reopen the
  // drawer so the lazily-mounted `WhatIfDrawer` re-runs its on-mount
  // hydration from the freshly written hash — necessary even when the new
  // hash happens to equal the current one (in which case `hashchange`
  // wouldn't fire). (Task #175)
  useEffect(() => {
    const onOpen = () => {
      setOpen(false);
      // Defer one frame so React unmounts the drawer before we re-open
      // it; otherwise the existing instance would keep its hydrated
      // state and skip the new overrides.
      requestAnimationFrame(() => setOpen(true));
    };
    window.addEventListener("whatif:open", onOpen as EventListener);
    return () => window.removeEventListener("whatif:open", onOpen as EventListener);
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
