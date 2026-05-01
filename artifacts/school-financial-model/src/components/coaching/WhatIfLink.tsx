import { useRef } from "react";
import { useLocation } from "wouter";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface WhatIfLinkProps {
  // Surface the link is rendered on. Used for telemetry so the coaching
  // dashboard can answer "which coach nudge is actually driving What-If
  // opens?".
  source: "impact_summary" | "actuals_variance";
  // Free-form short payload (e.g. the KPI key that triggered the nudge)
  // recorded with the click event.
  detail?: Record<string, unknown>;
  className?: string;
  children?: React.ReactNode;
}

// Each WhatIfLink source pairs 1:1 with a coach nudge surface. When a
// coach-mode founder clicks the link we also emit the surface's *_engaged
// event so the coaching funnel can compare shown-vs-engaged for that
// surface in lockstep with the existing *_shown emitter on the parent.
const ENGAGED_EVENT_FOR_SOURCE = {
  impact_summary: "impact_kpi_nudge_engaged",
  actuals_variance: "actuals_variance_nudge_engaged",
} as const;

/**
 * Small inline button that takes the founder from a coach nudge into the
 * Live What-If planner. The planner only mounts on the model wizard page
 * and the scenarios page, so:
 *
 * - On those pages, we just flip the URL hash to `whatif=open`. The
 *   `WhatIfTrigger` component listens for that flag and opens the drawer
 *   without any further routing.
 * - On other pages (e.g. a decision flow at `/decisions/:type/:modelId`),
 *   we navigate to the model page first, attaching the same hash so the
 *   trigger pops the drawer the moment it mounts.
 */
export function WhatIfLink({ source, detail, className, children }: WhatIfLinkProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  // Fire the surface engagement event at most once per mount so the
  // coaching funnel measures unique engagements per nudge render.
  const engagedRef = useRef(false);

  const onClick = () => {
    trackCoachingEvent("whatif_link_clicked", { source, ...(detail ?? {}) });
    if (guidanceLevel !== "advanced" && !engagedRef.current) {
      engagedRef.current = true;
      trackCoachingEvent(ENGAGED_EVENT_FOR_SOURCE[source], {
        guidanceLevel,
        ...(detail ?? {}),
      });
    }

    // Pages that already have <WhatIfTrigger> mounted — flip the hash and
    // let the trigger's hashchange listener open the drawer in-place.
    const onModelPage = /^\/model\/[^/]+(?:\/scenarios)?\/?$/.test(location);
    if (onModelPage) {
      const url = new URL(window.location.href);
      url.hash = "whatif=open";
      window.history.replaceState(null, "", url.toString());
      // Force the listener to fire (replaceState doesn't dispatch hashchange).
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }

    // Otherwise we're somewhere without the trigger (decision flows). Try
    // to extract the modelId from the URL — decision flows live under
    // `/decisions/:type/:modelId` — and route over to the model wizard
    // with the open-flag attached so it pops on mount.
    const decisionMatch = location.match(/^\/decisions\/[^/]+\/(\d+)/);
    if (decisionMatch) {
      setLocation(`/model/${decisionMatch[1]}#whatif=open`);
      return;
    }

    // Last-resort fallback — send them to the dashboard rather than 404.
    setLocation("/dashboard");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`whatif-link-${source}`}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline focus:underline focus:outline-none",
        className,
      )}
    >
      <Wand2 className="h-3 w-3" />
      {children ?? "Try this in What-If"}
    </button>
  );
}
