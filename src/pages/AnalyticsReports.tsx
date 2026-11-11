import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { getAnalyticsReports, type AnalyticsRange } from "../utils/Api";

interface StatItem {
  label: string;
  value: string | number;
  change: string;
}

interface ShareItem {
  name: string;
  count: number;
  color: string;
  percentage: string;
}

interface TopSkillItem {
  name: string;
  count: number;
}

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

// One line per weekly count from the backend (Stage and Verdict based)
const TREND_LINES = [
  { key: "Resumes", color: "#2563eb" },
  { key: "Interviews", color: "#f59e0b" },
  { key: "Selected", color: "#10b981" },
  { key: "Offers", color: "#a855f7" },
];

function Donut({ data, total, size }: { data: ShareItem[]; total?: number; size: number }) {
  // Fixed size: a ResponsiveContainer inside a centred flex box measures 0 wide and draws nothing
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie data={data} cx="50%" cy="50%" innerRadius={size * 0.28} outerRadius={size * 0.42} paddingAngle={3} dataKey="count" isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
      {total !== undefined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-bold text-slate-900">{total}</span>
          <span className="text-xs text-slate-500">Total</span>
        </div>
      )}
    </div>
  );
}

function Legend({ items }: { items: ShareItem[] }) {
  return (
    <ul className="space-y-2 w-full sm:w-auto">
      {items.map((item) => (
        <li key={item.name} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="font-semibold text-slate-700">{item.name}</span>
          </span>
          <span className="text-slate-500">
            {item.count} ({item.percentage})
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsReports() {
  const [range, setRange] = useState<AnalyticsRange>("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAnalyticsReports(range)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err?.message || "Could not load analytics."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const stats: StatItem[] = data?.stats || [];
  const resumeSourceData: ShareItem[] = data?.resumeSourceData || [];
  const pipelineTrendData: any[] = data?.pipelineTrendData || [];
  const topSkills: TopSkillItem[] = data?.topSkills || [];
  const expDistribution: ShareItem[] = data?.expDistribution || [];
  const successRate: number = data?.successRate ?? 0;
  const maxSkill = Math.max(1, ...topSkills.map((s) => s.count));
  const sourceTotal = resumeSourceData.reduce((sum, s) => sum + s.count, 0);
  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase() || "";

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">Analytics &amp; Reports</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="sr-only">Date range</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as AnalyticsRange)}
            className="bg-white border border-slate-300 text-slate-800 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
          <Loader2 className="animate-spin text-indigo-600" size={20} /> Loading analytics...
        </div>
      ) : error ? (
        <p className="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">Could not load analytics: {error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                <span className="text-sm font-semibold text-slate-500 block">{stat.label}</span>
                <div className="text-2xl font-extrabold text-slate-900">{stat.value}</div>
                {stat.change && <div className="text-xs text-slate-500">{stat.change}</div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 -mt-3">
            Counts for the {rangeLabel}. Interview numbers use each interview's verdict and stage.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Resume source (all time)</h2>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <Donut data={resumeSourceData} total={sourceTotal} size={160} />
                <Legend items={resumeSourceData} />
              </div>
            </section>

            <section className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Weekly trend</h2>
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  {TREND_LINES.map((l) => (
                    <span key={l.key} className="flex items-center gap-1" style={{ color: l.color }}>
                      <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: l.color }} /> {l.key}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pipelineTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", color: "#0f172a" }} labelFormatter={(l) => `Week of ${l}`} />
                    {TREND_LINES.map((l) => (
                      <Line key={l.key} type="linear" dataKey={l.key} stroke={l.color} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <section className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Top skills (all resumes)</h2>
              <ul className="space-y-3">
                {topSkills.map((item) => (
                  <li key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-slate-700">{item.name}</span>
                      <span className="text-slate-500">{item.count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(item.count / maxSkill) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Experience (all resumes)</h2>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <Donut data={expDistribution} size={128} />
                <Legend items={expDistribution} />
              </div>
            </section>

            <section className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col items-center text-center gap-3">
              <h2 className="text-sm font-bold text-slate-900">Interview success rate</h2>
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                  <path className="text-slate-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path
                    className="text-indigo-600"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${successRate}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-900">{successRate}%</span>
              </div>
              <span className="text-xs text-slate-500">Selected out of interviews with a Selected or Rejected verdict</span>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
