import { useState } from "react";
import {
  AlertTriangle,
  ShieldCheck,
  ArrowDownRight,
  Users,
  DollarSign,
  Building2,
  Lightbulb,
  BookOpen,
  Wand2,
  CircleDot,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const GREEN = "#328555";
const AMBER = "#D97706";
const SLATE = "#64748B";
const TEAL = "#0D9488";

function VisualCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[#1E293B]/50 mt-3 italic text-center">
      {children}
    </p>
  );
}

function VisualFrame({
  title,
  subtitle,
  children,
  caption,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  caption: string;
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
      <div className="p-5 sm:p-6">{children}</div>
      <VisualCaption>{caption}</VisualCaption>
    </div>
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
 * Wraps a real product screenshot in the same browser-chrome card style as
 * VisualFrame. `tall` switches to a cropped "cover" view for full-page
 * captures so the top of the screen stays in frame.
 *
 * Usage: drop <ScreenshotFrame /> into a SolutionVisuals export; supply a
 * <FallbackMockup /> child via `fallback` so screenshot 404s degrade to the
 * existing inline Recharts/Tailwind mockups.
 */
function ScreenshotFrame({
  title,
  subtitle,
  caption,
  src,
  alt,
  tall = false,
  callouts = [],
  fallback,
}: {
  title: string;
  subtitle?: string;
  caption: string;
  src: string;
  alt: string;
  tall?: boolean;
  callouts?: ScreenshotCallout[];
  fallback?: React.ReactNode;
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
        <ScreenshotImage
          src={src}
          alt={alt}
          tall={tall}
          fallback={fallback}
        />
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
 * Screenshot <img> with a built-in fallback to the inline mockup if the file
 * is missing (e.g. capture script hasn't been re-run after a UI change).
 */
function ScreenshotImage({
  src,
  alt,
  tall,
  fallback,
}: {
  src: string;
  alt: string;
  tall: boolean;
  fallback?: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  if (errored && fallback) {
    return (
      <div className="absolute inset-0 overflow-auto bg-white p-3 sm:p-4">
        {fallback}
      </div>
    );
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

/* -------- Single Year Pro Forma -------- */

export function SingleYearVisuals() {
  const y1Data = [
    { name: "Tuition & Fees", value: 134_400, color: GREEN },
    { name: "Per-Pupil Funding", value: 0, color: TEAL },
    { name: "Grants & Donations", value: 38_000, color: AMBER },
  ].filter((d) => d.value > 0);

  const total = y1Data.reduce((s, d) => s + d.value, 0);
  const expenses = 188_400;
  const net = total - expenses;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <VisualFrame
        title="Year 1 Review · Bright Horizon Academy"
        caption="The Review step compiles a Year 1 income statement from your wizard inputs."
      >
        <div className="space-y-3">
          <div className="flex items-baseline justify-between pb-3 border-b border-[#1E293B]/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E293B]/50">
              Year 1 Total Revenue
            </p>
            <p className="font-display text-2xl font-bold text-[#328555]">
              ${total.toLocaleString()}
            </p>
          </div>
          {y1Data.map((row) => (
            <div key={row.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-[#1E293B]/70">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                {row.name}
              </div>
              <span className="font-semibold text-[#1E293B]">
                ${row.value.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#1E293B]/5">
            <p className="text-sm text-[#1E293B]/70">Total Year 1 Expenses</p>
            <p className="font-semibold text-[#1E293B]">
              ${expenses.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm font-semibold text-[#1E293B]">Net Income (Year 1)</p>
            <div className="flex items-center gap-1.5 text-rose-600 font-display font-bold text-lg">
              <ArrowDownRight className="w-4 h-4" />${net.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">Budget&apos;s read:</span> A Year 1 loss is
            normal for a new school. Plan ~6 months of startup runway to bridge to
            break-even in Year 2 or 3.
          </div>
        </div>
      </VisualFrame>

      <VisualFrame
        title="Key Metrics · Year 1"
        caption="Health-checked metrics appear right in the Review step and in the export."
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              name: "Net Margin",
              value: "-11.6%",
              status: "warning",
              note: "Year 1 loss - normal for a new school.",
            },
            {
              name: "Staffing % of Revenue",
              value: "62%",
              status: "warning",
              note: "Slightly above the 50-60% healthy band.",
            },
            {
              name: "Break-Even Enrollment",
              value: "23 students",
              status: "warning",
              note: "5 students above your Year 1 plan.",
            },
            {
              name: "Months of Cash",
              value: "1.4 mo",
              status: "danger",
              note: "Below the 3-month safety target.",
            },
          ].map((m) => (
            <div
              key={m.name}
              className={`rounded-xl border p-3 bg-white ${
                m.status === "good"
                  ? "border-green-200/70"
                  : m.status === "warning"
                    ? "border-amber-200/70"
                    : "border-rose-200/70"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-[#1E293B]/60 leading-tight">
                  {m.name}
                </p>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    m.status === "good"
                      ? "bg-green-100 text-green-700"
                      : m.status === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {m.status === "good"
                    ? "Healthy"
                    : m.status === "warning"
                      ? "Watch"
                      : "Alert"}
                </span>
              </div>
              <p
                className={`font-display text-xl font-bold ${
                  m.status === "good"
                    ? "text-green-600"
                    : m.status === "warning"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {m.value}
              </p>
              <p className="text-[11px] text-[#1E293B]/50 mt-1 leading-relaxed">
                {m.note}
              </p>
            </div>
          ))}
        </div>
      </VisualFrame>
    </div>
  );
}

/* -------- Five Year Pro Forma -------- */

export function FiveYearVisuals() {
  const data = [
    { year: "Y1", Revenue: 172, Expenses: 188 },
    { year: "Y2", Revenue: 215, Expenses: 220 },
    { year: "Y3", Revenue: 258, Expenses: 245 },
    { year: "Y4", Revenue: 298, Expenses: 270 },
    { year: "Y5", Revenue: 330, Expenses: 295 },
  ];

  const enrollment = [18, 22, 26, 31, 36];
  const dscr = [null, 0.7, 1.1, 1.35, 1.5] as Array<number | null>;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <VisualFrame
        title="5-Year Revenue vs Expenses"
        subtitle="$ thousands"
        caption="The 5-year output shows revenue and expenses side by side, with the year you cross over highlighted."
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: SLATE }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: SLATE }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}K`}
              />
              <Tooltip
                cursor={{ fill: "rgba(50,133,85,0.05)" }}
                contentStyle={{
                  borderRadius: 10,
                  borderColor: "rgba(30,41,59,0.1)",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`$${v}K`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar dataKey="Revenue" fill={GREEN} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill={AMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#1E293B]/60">
          <CircleDot className="w-3.5 h-3.5 text-[#328555]" />
          Crosses over in <span className="font-semibold text-[#1E293B]">Year 3</span>
          - typical for a tuition-driven ramp.
        </div>
      </VisualFrame>

      <VisualFrame
        title="5-Year Summary Table"
        caption="Enrollment, revenue, net income, and DSCR roll up year by year - synced with every input."
      >
        <div className="overflow-hidden rounded-xl border border-[#1E293B]/5">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF9F7]">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60">
                  Metric
                </th>
                {["Y1", "Y2", "Y3", "Y4", "Y5"].map((y) => (
                  <th
                    key={y}
                    className="px-2 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60 text-right"
                  >
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#1E293B]/80">
              <tr className="border-t border-[#1E293B]/5">
                <td className="px-3 py-2 text-xs">Enrollment</td>
                {enrollment.map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right text-xs font-semibold">
                    {v}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#1E293B]/5">
                <td className="px-3 py-2 text-xs">Revenue</td>
                {data.map((d, i) => (
                  <td key={i} className="px-2 py-2 text-right text-xs font-semibold">
                    ${d.Revenue}K
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#1E293B]/5">
                <td className="px-3 py-2 text-xs">Expenses</td>
                {data.map((d, i) => (
                  <td key={i} className="px-2 py-2 text-right text-xs font-semibold">
                    ${d.Expenses}K
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[#1E293B]/5 bg-[#FAF9F7]/40">
                <td className="px-3 py-2 text-xs font-semibold">Net Income</td>
                {data.map((d, i) => {
                  const n = d.Revenue - d.Expenses;
                  return (
                    <td
                      key={i}
                      className={`px-2 py-2 text-right text-xs font-semibold ${
                        n < 0 ? "text-rose-600" : "text-[#328555]"
                      }`}
                    >
                      {n < 0 ? "-" : "+"}${Math.abs(n)}K
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-[#1E293B]/5">
                <td className="px-3 py-2 text-xs">DSCR</td>
                {dscr.map((v, i) => (
                  <td
                    key={i}
                    className={`px-2 py-2 text-right text-xs font-semibold ${
                      v == null
                        ? "text-[#1E293B]/30"
                        : v < 1
                          ? "text-rose-600"
                          : v < 1.2
                            ? "text-amber-600"
                            : "text-[#328555]"
                    }`}
                  >
                    {v == null ? "—" : `${v.toFixed(2)}x`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-[#1E293B]/60">
          DSCR clears the <span className="font-semibold">1.2x</span> lender benchmark
          starting Year 4.
        </div>
      </VisualFrame>
    </div>
  );
}

/* -------- Scenario Planning -------- */

const SLIDERS = [
  { label: "Enrollment", value: -20, unit: "%", icon: Users },
  { label: "Tuition Rate", value: 0, unit: "%", icon: DollarSign },
  { label: "Staffing Cost", value: 5, unit: "%", icon: Users },
  { label: "Facility Cost", value: 15, unit: "%", icon: Building2 },
];

export function ScenarioVisuals() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <VisualFrame
        title="What-If Drawer"
        subtitle="Stress test: enrollment shortfall + rent increase"
        caption="Pull the sliders to test downside scenarios. Impact updates instantly."
      >
        <div className="space-y-4">
          {SLIDERS.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs text-[#1E293B]/70">
                  <s.icon className="w-3.5 h-3.5 text-[#1E293B]/50" />
                  {s.label}
                </div>
                <span
                  className={`text-xs font-bold ${
                    s.value < 0
                      ? "text-rose-600"
                      : s.value > 0
                        ? "text-amber-600"
                        : "text-[#1E293B]/50"
                  }`}
                >
                  {s.value > 0 ? "+" : ""}
                  {s.value}
                  {s.unit}
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-[#1E293B]/10">
                <div
                  className="absolute top-0 h-full rounded-full bg-[#328555]/60"
                  style={{
                    left: `${50 + Math.min(0, s.value) * 1.5}%`,
                    width: `${Math.abs(s.value) * 1.5}%`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border border-[#328555] shadow"
                  style={{ left: `${50 + s.value * 1.5}%` }}
                />
              </div>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-3 gap-2 pt-4 border-t border-[#1E293B]/5">
            <div className="rounded-lg bg-rose-50 border border-rose-200/70 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-rose-600/70">
                Y3 Revenue
              </p>
              <p className="font-display font-bold text-sm text-rose-700">-$52K</p>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200/70 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-rose-600/70">
                Y3 Net Income
              </p>
              <p className="font-display font-bold text-sm text-rose-700">-$67K</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200/70 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-amber-700/80">
                Months of Cash
              </p>
              <p className="font-display font-bold text-sm text-amber-700">0.4 mo</p>
            </div>
          </div>
        </div>
      </VisualFrame>

      <VisualFrame
        title="Compare Scenarios"
        subtitle="Base vs Conservative vs Stress"
        caption="Save scenarios and stack them next to your base model to see exactly what changes."
      >
        <div className="overflow-hidden rounded-xl border border-[#1E293B]/5">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF9F7]">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60">
                  Metric (Year 5)
                </th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60 text-right">
                  Base
                </th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60 text-right">
                  Conservative
                </th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase text-[#1E293B]/60 text-right">
                  Stress
                </th>
              </tr>
            </thead>
            <tbody className="text-[#1E293B]/80">
              {[
                ["Net Margin", "6.8%", "3.2%", "-4.1%", [GREEN, AMBER, "rose"]],
                ["DSCR", "1.50x", "1.18x", "0.84x", [GREEN, AMBER, "rose"]],
                ["Months of Cash", "2.0", "1.1", "0.3", [AMBER, AMBER, "rose"]],
                ["Break-Even Yr", "Y3", "Y4", "Never", [GREEN, AMBER, "rose"]],
              ].map((row, i) => {
                const [name, b, c, s, colors] = row as [
                  string,
                  string,
                  string,
                  string,
                  string[],
                ];
                return (
                  <tr key={i} className="border-t border-[#1E293B]/5">
                    <td className="px-3 py-2 text-xs">{name}</td>
                    {[b, c, s].map((v, j) => {
                      const col = colors[j];
                      const tone =
                        col === "rose"
                          ? "text-rose-600"
                          : col === AMBER
                            ? "text-amber-600"
                            : "text-[#328555]";
                      return (
                        <td
                          key={j}
                          className={`px-2 py-2 text-right text-xs font-semibold ${tone}`}
                        >
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-[#1E293B]/70 leading-relaxed">
          <Wand2 className="w-3.5 h-3.5 text-[#328555] mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold text-[#1E293B]">Verdict:</span> The
            Conservative case is survivable; the Stress case needs a bridge plan
            before you sign.
          </span>
        </div>
      </VisualFrame>
    </div>
  );
}

/* -------- Debt Analysis -------- */

export function DebtVisuals() {
  const dscr = [
    { year: "Y1", value: 0.62, threshold: 1.2 },
    { year: "Y2", value: 0.95, threshold: 1.2 },
    { year: "Y3", value: 1.18, threshold: 1.2 },
    { year: "Y4", value: 1.41, threshold: 1.2 },
    { year: "Y5", value: 1.55, threshold: 1.2 },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <VisualFrame
        title="Lender-Ready Packet · DSCR by Year"
        caption="Debt Service Coverage updates every time you adjust loan terms or revenue."
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dscr} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: SLATE }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: SLATE }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v.toFixed(1)}x`}
                domain={[0, 2]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  borderColor: "rgba(30,41,59,0.1)",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v.toFixed(2)}x`, "DSCR"]}
              />
              <Line
                type="monotone"
                dataKey="threshold"
                stroke={AMBER}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                name="Lender minimum 1.2x"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={GREEN}
                strokeWidth={2.5}
                dot={{ r: 4, fill: GREEN, strokeWidth: 0 }}
                name="Projected DSCR"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#1E293B]/60">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          Tightest year is{" "}
          <span className="font-semibold text-[#1E293B]">Year 1 (0.62x)</span> -
          plan for an interest-only period or operating reserve.
        </div>
      </VisualFrame>

      <VisualFrame
        title="Loan & Facility Inputs"
        subtitle="Lending Lab"
        caption="Model the real loan you're being offered - rate, amortization, balloon, and all."
      >
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: "Loan amount", value: "$425,000" },
            { label: "Interest rate", value: "7.25%" },
            { label: "Amortization", value: "20 years" },
            { label: "Interest-only period", value: "12 months" },
            { label: "Balloon", value: "Year 7" },
            { label: "Annual debt service", value: "$48,300" },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-[#1E293B]/5 bg-[#FAF9F7]/60 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1E293B]/50">
                {row.label}
              </p>
              <p className="font-display font-bold text-base text-[#1E293B] mt-0.5">
                {row.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-[#328555]/30 bg-[#328555]/5 p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#328555] shrink-0 mt-0.5" />
          <p className="text-xs text-[#1E293B]/80 leading-relaxed">
            <span className="font-semibold">Lender-Ready Packet</span> bundles the
            DSCR table, sensitivity analysis, assumptions, and 5-year cash flow into
            one PDF.
          </p>
        </div>
      </VisualFrame>
    </div>
  );
}

/* -------- Budgeting & Accounting Guidance -------- */

export function GuidanceVisuals() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <VisualFrame
        title="Inline Coaching · Staffing step"
        caption="Coaching shows up in context - right next to the input you're filling in."
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-[#1E293B]/10 p-4 bg-white">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#1E293B]/50">
              Lead Teacher · annual salary
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#1E293B]/15 bg-white px-3 py-2 text-sm font-semibold text-[#1E293B]">
                $48,000
              </div>
              <span className="text-xs text-[#1E293B]/50">/yr</span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-semibold mb-0.5">Benchmark</p>
              Lead teacher pay at similar microschools usually lands between{" "}
              <span className="font-semibold">$45K and $58K</span>. Below $45K
              tends to make hiring hard.
            </div>
          </div>

          <div className="rounded-xl border border-teal-200/80 bg-teal-50/70 p-3 flex items-start gap-2">
            <BookOpen className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div className="text-xs text-teal-900 leading-relaxed">
              <p className="font-semibold mb-0.5">Plain-English explainer</p>
              Most schools spend 50-60% of revenue on people. Once you cross 65%,
              there isn&apos;t enough left for facility, curriculum, and reserves.
            </div>
          </div>
        </div>
      </VisualFrame>

      <VisualFrame
        title="Help menu · Guidance &amp; Primer"
        subtitle="Pick the level of coaching you want"
        caption="Three guidance levels and a Budget Primer modal - swap them as your confidence grows."
      >
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1E293B]/50">
            Guidance Level
          </p>
          <div className="space-y-2">
            {[
              {
                key: "basics",
                label: "Basics",
                desc: "Heavy coaching. Good for first-time founders.",
                active: true,
              },
              {
                key: "extra",
                label: "Extra",
                desc: "Coaching plus deeper explainers and benchmarks.",
              },
              {
                key: "advanced",
                label: "Advanced",
                desc: "Quiet UI. Coaching only when something looks off.",
              },
            ].map((opt) => (
              <div
                key={opt.key}
                className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                  opt.active
                    ? "border-[#328555] bg-[#328555]/5"
                    : "border-[#1E293B]/10 bg-white"
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    opt.active
                      ? "border-[#328555] bg-[#328555]"
                      : "border-[#1E293B]/20"
                  }`}
                >
                  {opt.active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1E293B]">{opt.label}</p>
                  <p className="text-xs text-[#1E293B]/60">{opt.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[#1E293B]/10 bg-white p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#328555]/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-[#328555]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1E293B]">Budgeting Basics</p>
              <p className="text-xs text-[#1E293B]/60">
                Walk through the 3 financial statements every school uses.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#328555]">Open</span>
          </div>
        </div>
      </VisualFrame>
    </div>
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
        caption="The Review step compiles a Year 1 income statement from every wizard input — ready to share."
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
        caption="Years 1–5 roll up automatically — revenue, expenses, debt coverage, and cash flow in one view."
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
        alt="What-if drawer with sliders for enrollment, tuition, staffing, and facility — showing live impact on Year 3 revenue, net income, and months of cash."
        caption="Pull the sliders and the Year 3 totals + cash runway update instantly — no recalc, no spreadsheet."
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
        alt="Wizard step for loan and facility assumptions — loan amount, rate, amortization, balloon, interest-only period."
        tall
        caption="Model the real loan you're being offered — rate, amortization, balloon, interest-only, all of it."
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
        caption="Coaching shows up in context — right next to the input you're filling in, never in a side panel."
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
