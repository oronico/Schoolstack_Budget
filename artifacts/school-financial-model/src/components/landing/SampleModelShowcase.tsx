import { Link } from "wouter";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowRight,
  ShieldCheck,
  Star,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  PieChart as PieChartIcon,
  ArrowUpRight,
  Eye,
} from "lucide-react";
import { motion } from "framer-motion";
import { sampleModelData } from "./sampleModelData";

const CHART_COLORS = {
  green: "#328555",
  teal: "#0D9488",
  amber: "#D97706",
  navy: "#1E293B",
  slate: "#64748B",
};

const PIE_COLORS = [CHART_COLORS.green, CHART_COLORS.teal, CHART_COLORS.amber];

function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg border border-border/60 shadow-lg px-3.5 py-2.5 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground ml-auto">
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SampleModelShowcase() {
  const data = sampleModelData;

  const y1PieData = [
    { name: "Tuition & Fees", value: Math.round(data.revenueComposition[0].tuitionPct * 100) },
    { name: "Philanthropy", value: Math.round(data.revenueComposition[0].philanthropyPct * 100) },
  ].filter((d) => d.value > 0);

  const costChartData = data.costComposition.map((cc, i) => ({
    year: `Year ${i + 1}`,
    Staffing: Math.round(cc.staffingPctOfRevenue * 100),
    Facility: Math.round(cc.facilityPctOfRevenue * 100),
    "Other OpEx": Math.round(
      (cc.totalOpexPctOfRevenue - cc.staffingPctOfRevenue - cc.facilityPctOfRevenue) * 100
    ),
  }));

  return (
    <section className="py-24 bg-gradient-to-b from-primary/[0.03] to-primary/[0.08] border-y border-primary/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-5 border border-primary/20">
            <Eye className="h-3.5 w-3.5" />
            Sample Model
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-4">
            See what you'll build
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Here's a preview of a completed financial analysis for a fictional early-stage school.
            Your model will look just like this - tailored to your school's unique story.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white/80 backdrop-blur-sm rounded-3xl border border-border/60 shadow-xl shadow-primary/5 p-6 md:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-border/40">
            <div>
              <h3 className="font-display text-xl md:text-2xl font-bold text-foreground">
                {data.schoolName}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">{data.schoolDescription}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
            <h4 className="font-display font-bold text-base text-foreground mb-2">
              Executive Summary
            </h4>
            <p className="text-foreground/80 leading-relaxed text-sm">{data.executiveSummary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200/80 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                  <Star className="h-3.5 w-3.5 text-green-700" />
                </div>
                <h4 className="font-bold text-green-800 text-xs uppercase tracking-wider">
                  Biggest Strength
                </h4>
              </div>
              <p className="text-green-900 font-medium text-sm">{data.biggestStrength}</p>
            </div>

            <div className="bg-gradient-to-br from-rose-50 to-red-50/50 border border-rose-200/80 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                </div>
                <h4 className="font-bold text-rose-800 text-xs uppercase tracking-wider">
                  Biggest Risk
                </h4>
              </div>
              <p className="text-rose-900 font-medium text-sm">{data.biggestRisk}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Lender Readiness
                </h4>
                <p className="font-display font-bold text-xl text-green-700">
                  {data.lenderReadiness}
                </p>
              </div>
            </div>
            <p className="text-foreground/70 leading-relaxed text-sm">
              {data.lenderReadinessExplanation}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h4 className="font-display font-bold text-base text-foreground">Key Metrics</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.keyMetrics.map((metric, idx) => {
                const StatusIcon =
                  metric.status === "good"
                    ? CheckCircle2
                    : AlertTriangle;
                const statusColor =
                  metric.status === "good"
                    ? "text-green-600"
                    : metric.status === "warning"
                      ? "text-amber-600"
                      : "text-rose-600";
                const statusBadgeBg =
                  metric.status === "good"
                    ? "bg-green-100 text-green-700"
                    : metric.status === "warning"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700";
                const cardBorder =
                  metric.status === "good"
                    ? "border-green-200/60"
                    : metric.status === "warning"
                      ? "border-amber-200/60"
                      : "border-rose-200/60";

                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-2xl p-4 border shadow-sm flex flex-col ${cardBorder}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground leading-tight">
                        {metric.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${statusBadgeBg}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {metric.status === "good" ? "Healthy" : metric.status === "warning" ? "Watch" : "Alert"}
                      </span>
                    </div>
                    <p className={`font-display font-bold text-2xl mb-1 ${statusColor}`}>
                      {metric.value}
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed mt-auto">
                      {metric.interpretation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <PieChartIcon className="h-4 w-4 text-primary" />
                <h4 className="font-display font-bold text-base text-foreground">
                  Year 1 Revenue Mix
                </h4>
              </div>
              <div className="flex flex-col items-center">
                <div className="h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={y1PieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {y1PieData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {y1PieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <span className="text-muted-foreground">
                        {entry.name}:{" "}
                        <span className="font-semibold text-foreground">{entry.value}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpRight className="h-4 w-4 text-primary" />
                <h4 className="font-display font-bold text-base text-foreground">
                  Cost Structure
                </h4>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={costChartData}
                    margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(40 15% 88%)"
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={<CustomTooltip formatter={(v) => `${v}%`} />}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar
                      dataKey="Staffing"
                      fill={CHART_COLORS.navy}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Facility"
                      fill={CHART_COLORS.teal}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Other OpEx"
                      fill={CHART_COLORS.slate}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center mt-10"
        >
          <p className="text-muted-foreground mb-5 text-lg">
            Ready to create your own financial model?
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground text-lg font-semibold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300"
          >
            Build yours in under an hour <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
