import { useState } from "react";

function VisualCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[#1E293B]/50 mt-3 italic text-center">
      {children}
    </p>
  );
}

type CalloutPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface ScreenshotCallout {
  position: CalloutPosition;
  label: string;
}

const CALLOUT_POSITION_CLASSES: Record<CalloutPosition, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

/**
 * Wraps a real product screenshot in a browser-chrome card. `tall` switches to
 * a cropped "cover" view for full-page captures so the top of the screen
 * stays in frame.
 */
function ScreenshotFrame({
  title,
  subtitle,
  caption,
  src,
  alt,
  tall = false,
  callouts = [],
}: {
  title: string;
  subtitle?: string;
  caption: string;
  src: string;
  alt: string;
  tall?: boolean;
  callouts?: ScreenshotCallout[];
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#1E293B]/10 shadow-sm overflow-hidden">
      <div className="border-b border-[#1E293B]/5 px-5 py-3 bg-gradient-to-b from-[#FAF9F7] to-white">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E293B]/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E293B]/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E293B]/10" />
          </div>
          <p className="text-xs font-semibold text-[#1E293B]/60 ml-2">
            {title}
            {subtitle && (
              <span className="font-normal text-[#1E293B]/40"> · {subtitle}</span>
            )}
          </p>
        </div>
      </div>
      <div
        className={`relative bg-[#FAF9F7] overflow-hidden ${
          tall ? "aspect-[4/3]" : "aspect-[16/10]"
        }`}
      >
        <ScreenshotImage src={src} alt={alt} tall={tall} />
        {callouts.map((c, i) => (
          <span
            key={i}
            className={`pointer-events-none absolute ${CALLOUT_POSITION_CLASSES[c.position]} max-w-[55%] rounded-lg bg-white/95 backdrop-blur-sm border border-[#328555]/30 shadow-md px-2.5 py-1 text-[11px] font-semibold text-[#1E293B] leading-snug`}
          >
            <span className="text-[#328555] mr-1">●</span>
            {c.label}
          </span>
        ))}
      </div>
      <VisualCaption>{caption}</VisualCaption>
    </div>
  );
}

/**
 * Screenshot <img> that hides itself if the file is missing, leaving the
 * surrounding frame's background visible instead of a broken-image icon.
 */
function ScreenshotImage({
  src,
  alt,
  tall,
}: {
  src: string;
  alt: string;
  tall: boolean;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return null;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={`absolute inset-0 w-full h-full ${
        tall ? "object-cover object-top" : "object-contain"
      }`}
    />
  );
}

/* -------- Real product screenshots (used by /solutions/:slug pages) -------- */

const SCREENSHOT_BASE = "/images/solutions";

export function SingleYearScreenshots() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ScreenshotFrame
        title="Dashboard · Financial Snapshot"
        subtitle="Bright Horizons Microschool"
        src={`${SCREENSHOT_BASE}/single-year-snapshot.png`}
        alt="Dashboard snapshot card showing Year 1 revenue, expenses, and net income with a status read."
        caption="Your Year 1 numbers surface on the dashboard the moment you finish the wizard."
        callouts={[
          {
            position: "top-right",
            label: "Plain-English read on whether Year 1 works",
          },
        ]}
      />
      <ScreenshotFrame
        title="Wizard · Review step"
        subtitle="Year 1 income statement"
        src={`${SCREENSHOT_BASE}/single-year-review.png`}
        alt="Review step of the wizard with a one-page Year 1 income statement, key metrics, and what-if call-outs."
        tall
        caption="The Review step compiles a Year 1 income statement from every wizard input - ready to share."
        callouts={[
          {
            position: "top-left",
            label: "One-page Year 1 income statement",
          },
        ]}
      />
    </div>
  );
}

export function FiveYearScreenshots() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ScreenshotFrame
        title="Wizard · 5-Year Output"
        subtitle="Lender-ready packet"
        src={`${SCREENSHOT_BASE}/five-year-lender-packet.png`}
        alt="Five-year output step of the wizard with revenue, expenses, net income, DSCR, and cash flow rolled up year by year."
        tall
        caption="Years 1–5 roll up automatically - revenue, expenses, debt coverage, and cash flow in one view."
        callouts={[
          {
            position: "top-right",
            label: "5-year revenue, expenses & DSCR side-by-side",
          },
        ]}
      />
      <ScreenshotFrame
        title="Dashboard · Financial Snapshot"
        subtitle="Years 1–5 at a glance"
        src={`${SCREENSHOT_BASE}/single-year-snapshot.png`}
        alt="Dashboard snapshot card with the Year 1 figures that anchor the 5-year projection."
        caption="The dashboard always shows the current year's read alongside the forward-looking projection."
      />
    </div>
  );
}

export function ScenarioScreenshots() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ScreenshotFrame
        title="What-If Drawer"
        subtitle="Live stress-test sliders"
        src={`${SCREENSHOT_BASE}/scenario-whatif-drawer.png`}
        alt="What-if drawer with sliders for enrollment, tuition, staffing, and facility - showing live impact on Year 3 revenue, net income, and months of cash."
        caption="Pull the sliders and the Year 3 totals + cash runway update instantly - no recalc, no spreadsheet."
        callouts={[
          {
            position: "bottom-right",
            label: "Impact updates as you drag",
          },
        ]}
      />
      <ScreenshotFrame
        title="Saved Scenarios"
        subtitle="Base · Conservative · Stress"
        src={`${SCREENSHOT_BASE}/scenario-comparison.png`}
        alt="Custom scenarios section comparing saved scenarios side-by-side with key Year 5 metrics."
        caption="Save scenarios and stack them next to your base model to see exactly what changes."
        callouts={[
          {
            position: "top-right",
            label: "Save & compare unlimited scenarios",
          },
        ]}
      />
    </div>
  );
}

export function DebtScreenshots() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ScreenshotFrame
        title="Wizard · Loan & Facility Inputs"
        subtitle="Lending Lab"
        src={`${SCREENSHOT_BASE}/debt-loan-inputs.png`}
        alt="Wizard step for loan and facility assumptions - loan amount, rate, amortization, balloon, interest-only period."
        tall
        caption="Model the real loan you're being offered - rate, amortization, balloon, interest-only, all of it."
        callouts={[
          {
            position: "top-right",
            label: "Real loan terms, not back-of-envelope",
          },
        ]}
      />
      <ScreenshotFrame
        title="Wizard · 5-Year Output"
        subtitle="DSCR + cash flow"
        src={`${SCREENSHOT_BASE}/five-year-lender-packet.png`}
        alt="Five-year output that includes the debt service coverage ratio table lenders look for."
        tall
        caption="DSCR by year, debt service, and cash flow are bundled into a packet you can hand to a lender."
        callouts={[
          {
            position: "top-left",
            label: "Lender-ready DSCR table built in",
          },
        ]}
      />
    </div>
  );
}

export function GuidanceScreenshots() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ScreenshotFrame
        title="Wizard · Staffing step"
        subtitle="Inline coaching · Basics mode"
        src={`${SCREENSHOT_BASE}/guidance-staffing-coaching.png`}
        alt="Staffing step of the wizard with inline coaching tips and benchmarks visible next to the inputs."
        tall
        caption="Coaching shows up in context - right next to the input you're filling in, never in a side panel."
        callouts={[
          {
            position: "top-right",
            label: "Tips appear next to the input",
          },
        ]}
      />
      <ScreenshotFrame
        title="Help menu · Budgeting Basics primer"
        subtitle="On-demand explainer"
        src={`${SCREENSHOT_BASE}/guidance-primer-modal.png`}
        alt="Budgeting Basics primer modal explaining the three financial statements every school uses."
        caption="Open the Budgeting Basics primer any time to brush up on the three financial statements."
        callouts={[
          {
            position: "bottom-right",
            label: "Open from any wizard step",
          },
        ]}
      />
    </div>
  );
}
